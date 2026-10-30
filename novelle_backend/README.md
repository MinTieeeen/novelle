# Novelle Backend

REST API for **Novelle**, a web platform for reading and writing serialized stories, built for the HK261 DBMS assignment. It uses **Microsoft SQL Server** as the system of record and **Redis** for caching, view counting, draft autosave, sessions, rate limiting and distributed locks.

The data model, business rules and Redis key design are specified in [`../docs/data-dictionary.md`](../docs/data-dictionary.md). The AWS setup (RDS + Redis on EC2) is in [`../docs/deploy-aws.md`](../docs/deploy-aws.md).

---

## 1. Features

The platform has three roles. A new account is always `READER`. A reader becomes `AUTHOR` after an admin approves their request, and stays an author permanently. `ADMIN` accounts are seeded or created by another admin.

| # | Feature | Roles | Main endpoints |
|---|---|---|---|
| F1 | Home page: recently updated, new and top-rated stories | All | `GET /api/home` |
| F2 | Search and filter stories (keyword, genre, tag, status, chapter count, rating) | All | `GET /api/stories` |
| F3 | Story detail with table of contents; author page | All | `GET /api/stories/{slug}`, `GET /api/authors/{authorId}` |
| F4 | Read a chapter and save reading progress | All | `GET /api/chapters/{chapterId}`, `PUT /api/reading-progress/{storyId}` |
| F5 | Library: reading history, followed stories and authors, reading lists | READER, AUTHOR | `/api/library/**`, `/api/reading-lists/**` |
| F6 | Rate and review a story | READER, AUTHOR | `/api/stories/{storyId}/ratings` |
| F7 | Request to become an author and track its status | READER | `/api/author-requests` |
| F8 | Manage own stories (create, edit, soft delete, genres, tags) | AUTHOR | `/api/studio/stories/**` |
| F9 | Write chapters: volumes, autosave, publish now or schedule, revision history | AUTHOR | `/api/studio/chapters/**` |
| F10 | Author dashboard: views, followers, ratings | AUTHOR | `GET /api/studio/dashboard` |
| F11 | Manage users (ban, unban, create admin) and review author requests | ADMIN | `/api/admin/users/**`, `/api/admin/author-requests/**` |
| F12 | Moderate content (hide, unhide, delete stories; delete reviews) and manage genres and tags | ADMIN | `/api/admin/stories/**`, `/api/admin/ratings/**`, `/api/admin/genres/**`, `/api/admin/tags/**` |
| F13 | Platform statistics dashboard | ADMIN | `/api/admin/stats/**` |
| — | Register, log in, log out, profile | All | `/api/auth/**`, `/api/me` |

The full, always-current endpoint list is served by Swagger UI (see [Section 4.6](#46-verify)).

---

## 2. Tech stack

| Area | Technology |
|---|---|
| Language and runtime | Java 21 |
| Framework | Spring Boot 3.5.x: Spring Web, Validation, Security, Data Redis, Session Data Redis |
| Database access | **MyBatis** (`mybatis-spring-boot-starter`): mapper interfaces + XML mappers with hand-written SQL, dynamic SQL, stored procedure calls |
| Transactions | Spring `@Transactional` with `DataSourceTransactionManager` |
| Database | Microsoft SQL Server 2019 (Amazon RDS for SQL Server Express; a local Docker `mssql/server:2019-latest` also works), JDBC driver `mssql-jdbc` |
| Schema management | Plain SQL scripts in `database/`, run with `sqlcmd` (no migration tool for now) |
| Cache and realtime data | Redis Stack via Lettuce |
| Password hashing | BCrypt |
| HTML sanitizing | jsoup (chapter content allowlist) |
| Mock data | Datafaker (`vi` locale, fixed seed) + `SQLServerBulkCopy` |
| API docs | springdoc-openapi (Swagger UI) |
| Build | Maven (wrapper included) |
| Tests | JUnit 5, Spring Boot Test, Testcontainers (SQL Server, Redis) |

**Why MyBatis:** the assignment is about comparing database behavior, so the SQL each feature runs should be visible and controllable. MyBatis keeps every statement in an XML file, where it can be copied into SSMS, examined with an execution plan, and quoted in the report. It also maps directly onto the stored procedures, `ROWVERSION` checks and multi-condition search that the design relies on.

---

## 3. Project structure

The code is organized **by feature**. Each feature package contains its own `controller`, `service`, `mapper`, `dto` and `model` sub-packages, and its SQL lives in a matching folder under `resources/mapper/`. One functional area can then be read and owned end to end.

```
novelle_backend/
├─ pom.xml
├─ mvnw, mvnw.cmd                    Maven wrapper
├─ docker-compose.yml                Local SQL Server 2019 + Redis Stack
├─ .env.example                      Environment variable template (copy to .env, never commit .env)
├─ database/
│  ├─ bootstrap/                     Run once with an admin login
│  │  ├─ 00_create_database.sql      CREATE DATABASE NovelleDB COLLATE Vietnamese_100_CI_AI
│  │  └─ 01_create_logins_users.sql  novelle_migrator / novelle_app / novelle_readonly
│  ├─ schema/                        Full schema, run in file-name order
│  │  ├─ 01_tables.sql               18 tables: PK, FK, UQ, CHECK, DEFAULT
│  │  ├─ 02_indexes.sql              Regular and filtered indexes
│  │  ├─ 03_fulltext.sql             Full-text catalog and index (runs outside a transaction)
│  │  ├─ 04_views.sql                vw_PublicStory, vw_AuthorStats
│  │  ├─ 05_procedures.sql           sp_ApproveAuthorRequest, sp_RejectAuthorRequest, sp_PublishChapter,
│  │  │                              sp_PublishScheduled, sp_DeleteStory, sp_FlushViews (+ table type)
│  │  ├─ 06_triggers.sql             trg_Rating, trg_Follow, trg_AuthorFollow, trg_Chapter_Revision, …
│  │  └─ 07_reference_data.sql       20 genres
│  ├─ queries/                       01_insert.sql … 08_aggregate.sql, 99_check_invariants.sql
│  └─ demo/                          Per-topic DBMS demo scripts (tagged "RDS OK" or "LOCAL ONLY")
├─ scripts/
│  ├─ db-bootstrap.ps1 / .sh         Runs database/bootstrap (local Docker or RDS through the tunnel)
│  ├─ db-apply-schema.ps1 / .sh      Runs database/schema/*.sql in order; --reset drops and recreates the database first
│  └─ aws-tunnel.ps1 / .sh           Opens the SSM tunnels to RDS and Redis
└─ src/
   ├─ main/
   │  ├─ java/com/novelle/
   │  │  ├─ NovelleApplication.java
   │  │  ├─ config/                  Security, Redis, Session, CORS, scheduling, OpenAPI, MyBatis
   │  │  ├─ common/                  Error model, exception handler, paging, current-user helper,
   │  │  │                           HTML sanitizer, MyBatis type handlers
   │  │  ├─ auth/                    Register, login, logout, current user (/api/auth, /api/me)
   │  │  ├─ user/                    AppUser model and profile updates
   │  │  ├─ catalog/                 Genres and tags (read side, cached)
   │  │  ├─ story/                   F1–F3: home, search, story detail, author page
   │  │  ├─ reading/                 F4: chapter reading, reading progress
   │  │  ├─ library/                 F5: history, story and author follows, reading lists
   │  │  ├─ rating/                  F6: ratings and reviews
   │  │  ├─ authorrequest/           F7: submit, view, cancel; approval logic shared with admin
   │  │  ├─ studio/                  F8–F10: stories, volumes, chapters, drafts, revisions, dashboard
   │  │  ├─ admin/                   F11–F13: users, author requests, moderation, genres and tags, statistics
   │  │  ├─ cache/                   CacheService (cache-aside) and cache key definitions
   │  │  ├─ views/                   ViewCounterService (Redis INCR) and ViewFlushJob (sp_FlushViews)
   │  │  ├─ ratelimit/               @RateLimited annotation and Redis-backed interceptor
   │  │  ├─ jobs/                    ScheduledPublishJob (sp_PublishScheduled)
   │  │  └─ seed/                    MockDataGenerator, active only with the "seed" profile
   │  └─ resources/
   │     ├─ application.yml          Shared settings, including MyBatis configuration
   │     ├─ application-local.yml    Local Docker
   │     ├─ application-aws.yml      RDS + Redis through SSM tunnels
   │     ├─ application-seed.yml     Seeder settings (scale, demo accounts)
   │     ├─ mapper/                  MyBatis XML mappers, one folder per feature
   │     │  ├─ story/StoryMapper.xml, StorySearchMapper.xml
   │     │  ├─ studio/ChapterMapper.xml, StudioStoryMapper.xml, DashboardMapper.xml
   │     │  ├─ admin/…, library/…, rating/…, …
   │     └─ seed/                    Vietnamese word lists and paragraph corpus for mock content
   └─ test/java/com/novelle/        Unit tests and Testcontainers integration tests
```

Example of one feature package:

```
studio/
├─ controller/   StudioStoryController, StudioChapterController, StudioDashboardController
├─ service/      StudioStoryService, ChapterService, DraftService, RevisionService, DashboardService
├─ mapper/       StudioStoryMapper, ChapterMapper, VolumeMapper, RevisionMapper, DashboardMapper  (@Mapper interfaces)
├─ dto/          Request and response records sent over HTTP
└─ model/        Plain Java objects that MyBatis maps rows into (Story, Chapter, Volume, …)
```

### What each package does

| Package | Responsibility |
|---|---|
| `config` | Builds the security filter chain, session cookie, CSRF, CORS, `RedisTemplate` serializers, scheduler thread pool and OpenAPI metadata. `MyBatisConfig` registers the custom type handlers. |
| `common` | `ApiError` JSON format, `GlobalExceptionHandler` (maps validation, 401, 403, 404, 409, 429 errors), `PageRequest`/`PageResponse`, `CurrentUser` accessor, `HtmlSanitizer`, and MyBatis type handlers (`RowVersionTypeHandler` for `ROWVERSION` ↔ Base64 string, `ViewDeltaTableTypeHandler` for the TVP of `sp_FlushViews`). |
| `auth` | Registration (always `READER`), login with BCrypt, logout, `GET /api/me`. Also contains `UserStatusFilter` (see [Section 5.1](#51-request-pipeline)). |
| `user` | `AppUser` model, profile and avatar updates. |
| `catalog` | Genre and tag lookups used by search filters and the studio, cached in Redis. |
| `story` | Public read side. Queries select from `vw_PublicStory` so drafts, hidden and deleted stories never leak (RB3). Search uses MyBatis dynamic SQL to combine full-text search with optional filters. |
| `reading` | Returns a published chapter, counts the view in Redis, and upserts `ReadingHistory`. |
| `library` | Follow and unfollow stories and authors, reading history list, reading list CRUD. |
| `rating` | One rating per user per story. The `trg_Rating` trigger keeps `Story.RatingAvg` and `Story.RatingCount` in sync. |
| `authorrequest` | Reader side of F7 and the shared approve/reject service that calls `sp_ApproveAuthorRequest` / `sp_RejectAuthorRequest`. |
| `studio` | Author-only CRUD with ownership checks (RB1, RB2), optimistic locking on chapters, Redis draft autosave, publish and schedule, revision restore, dashboard aggregates. |
| `admin` | Admin-only endpoints: user management, review queue, moderation, catalog management, statistics. |
| `cache` | `CacheService.getOrLoad(key, ttl, loader)` and `evict(...)`; all key names live in `CacheKeys`. |
| `views` | `ViewCounterService.increment(...)` and `ViewFlushJob`, which moves counters from Redis to SQL Server every 60 seconds. |
| `ratelimit` | Fixed-window counters (`rl:publish`, `rl:rating`, `rl:login`) applied with `@RateLimited`. |
| `jobs` | Scheduled tasks that replace SQL Server Agent, which RDS Express does not have. |
| `seed` | Generates deterministic mock data at `small`, `medium` or `large` scale, then recomputes derived columns. |

### MyBatis usage rules

| Need | How it is written |
|---|---|
| Simple CRUD | `<select>`, `<insert useGeneratedKeys="true" keyProperty="…">`, `<update>`, `<delete>` in the feature's XML mapper |
| Multi-condition search | Dynamic SQL with `<where>`, `<if>`, `<foreach>` (genre and tag lists); never string concatenation |
| Paging | `ORDER BY … OFFSET #{offset} ROWS FETCH NEXT #{size} ROWS ONLY`, written in the SQL |
| Joins (story detail, table of contents) | `<resultMap>` with `<association>` and `<collection>` |
| Stored procedures | `<select statementType="CALLABLE">{call dbo.sp_PublishChapter(#{chapterId}, #{userId})}</select>` |
| Optimistic locking | `UPDATE … WHERE ChapterId = #{id} AND RowVer = #{rowVersion}`; the mapper returns the affected row count, and 0 means conflict |
| Column mapping | SQL Server columns are PascalCase (`StoryId`) and Java fields camelCase (`storyId`). MyBatis auto-mapping matches them case-insensitively; use explicit `<resultMap>`s only for nested results |
| Parameters | Always `#{…}` (prepared statement). `${…}` is allowed only for whitelisted `ORDER BY` columns chosen in the service |

---

## 4. Configuration and running

### 4.1 Prerequisites

- JDK 21
- Docker Desktop (for local SQL Server and Redis)
- `sqlcmd` (mssql-tools18), to run the database scripts
- Optional: SSMS or Azure Data Studio, RedisInsight
- For the AWS profile only: AWS CLI v2 and the Session Manager plugin (see `deploy-aws.md`, section 4)

### 4.2 Environment variables

Copy `.env.example` to `.env` and fill in values. Secrets are read only from environment variables and are never written to `application*.yml`.

| Variable | Example | Used by |
|---|---|---|
| `DB_URL` | `jdbc:sqlserver://localhost:1433;databaseName=NovelleDB;encrypt=true;trustServerCertificate=true` | Application |
| `DB_USER` | `novelle_app` | Application |
| `DB_PASSWORD` | — | Application |
| `DB_ADMIN_USER`, `DB_ADMIN_PASSWORD` | `sa` locally, the master user on RDS | `db-bootstrap` |
| `DB_MIGRATOR_PASSWORD`, `DB_APP_PASSWORD`, `DB_RO_PASSWORD` | — | Passwords given to the three logins by `db-bootstrap`; `db-apply-schema` runs as `novelle_migrator` |
| `MSSQL_SA_PASSWORD` | — | `docker-compose.yml` only |
| `REDIS_HOST`, `REDIS_PORT` | `localhost`, `6379` | Application |
| `REDIS_PASSWORD` | empty locally | Application (required on AWS) |
| `APP_CORS_ORIGINS` | `http://localhost:5173` | CORS config |
| `SEED_DEMO_PASSWORD` | — | Password given to the demo accounts by the seeder |

### 4.3 Spring profiles

| Profile | Database and Redis | Use |
|---|---|---|
| `local` | Docker on `localhost:1433` / `6379` | Daily development |
| `aws` | RDS on `localhost:14330` / Redis on `localhost:16379` through SSM tunnels | Integration and demo against AWS |
| `seed` | Combined with `local` or `aws` | Generates mock data, then exits |

Main MyBatis settings in `application.yml`:

```yaml
mybatis:
  mapper-locations: classpath:mapper/**/*.xml
  type-aliases-package: com.novelle
  type-handlers-package: com.novelle.common.mybatis
  configuration:
    default-statement-timeout: 30
    jdbc-type-for-null: NULL
```

### 4.4 Database schema (no migration tool)

The schema is managed by the SQL scripts in `database/` only. The application never creates or changes tables on startup.

- **First setup:** run `db-bootstrap` once, then `db-apply-schema`.
- **Changing the schema:** edit the relevant file in `database/schema/`, then recreate the local database with `db-apply-schema --reset` and reload mock data. Views, procedures and triggers use `CREATE OR ALTER`, so re-running `04`–`06` alone is enough when only they change.
- **On RDS** (shared by the team): announce the change first, take a manual snapshot, then either apply a one-off `ALTER` script or run `db-apply-schema --reset` followed by the seeder.
- A migration tool (for example Flyway) can be added later. `database/schema` would then become the baseline.

### 4.5 Run locally

```bash
# 1. Start SQL Server 2019 and Redis Stack
cp .env.example .env            # then edit .env
docker compose up -d

# 2. Create the database and logins, then the schema (once)
./scripts/db-bootstrap.sh       # Windows: .\scripts\db-bootstrap.ps1
./scripts/db-apply-schema.sh    # Windows: .\scripts\db-apply-schema.ps1

# 3. Load mock data (the seeder exits when done)
./mvnw spring-boot:run -Dspring-boot.run.profiles=local,seed -Dspring-boot.run.arguments=--seed.scale=small

# 4. Start the API
./mvnw spring-boot:run -Dspring-boot.run.profiles=local
```

Use `--seed.scale=medium` for demo-sized data (about 1,500 stories and 60,000 chapters). After seeding, run `database/queries/99_check_invariants.sql`; it must return no rows.

### 4.6 Verify

- Swagger UI: <http://localhost:8080/swagger-ui.html>
- Health check: <http://localhost:8080/actuator/health>
- Log in with the seeded accounts `admin`, `author01`, `reader01` or `reader02`, using the password from `SEED_DEMO_PASSWORD`.

### 4.7 Run against AWS

1. Open both tunnels: `./scripts/aws-tunnel.sh` (RDS → `localhost:14330`, Redis → `localhost:16379`).
2. Set `DB_URL` to port `14330`, and set `DB_PASSWORD` and `REDIS_PASSWORD`.
3. `./mvnw spring-boot:run -Dspring-boot.run.profiles=aws`

The RDS and Redis instances are shared by the whole team. Do not run the seeder, schema scripts or destructive demo scripts there without telling the team first.

### 4.8 Tests and build

```bash
./mvnw test        # unit tests + Testcontainers integration tests (Docker must be running)
./mvnw package     # builds target/novelle-backend-*.jar
```

Integration tests start SQL Server and Redis containers and create the schema by running the same `database/schema/*.sql` files, so tests always use the real schema. They cover the stored procedures under concurrency: two admins approving the same request, many users rating the same story, and two sessions saving the same chapter.

---

## 5. How it works

### 5.1 Request pipeline

```
Client (React SPA, cookie SESSION + X-XSRF-TOKEN header)
  │
  ▼
Spring Security filter chain
  ├─ SessionRepositoryFilter   loads the session from Redis (spring:session:*)
  ├─ CsrfFilter                checks the XSRF token on POST/PUT/PATCH/DELETE
  ├─ UserStatusFilter          re-reads Role and Status of the logged-in user by primary key;
  │                            BANNED users are logged out (RB12), role changes apply at once
  └─ Authorization rules       /api/studio/** → AUTHOR, /api/admin/** → ADMIN, writes need login
  │
  ▼
RateLimitInterceptor (@RateLimited endpoints, Redis INCR + EXPIRE)  → 429 when exceeded
  │
  ▼
Controller      validates the request DTO (Bean Validation) and maps it to a service call
  │
  ▼
Service         applies business rules (ownership, RB1–RB16), opens the @Transactional boundary,
  │             and reads or evicts the Redis cache
  ▼
Mapper          MyBatis interface; the SQL is in resources/mapper/<feature>/*Mapper.xml
  │
  ▼
SQL Server      constraints, triggers and stored procedures enforce invariants inside the database

Any exception → GlobalExceptionHandler → ApiError JSON { status, code, message, details }
```

Sessions use the default (non-indexed) Spring Session Redis repository, so they work without keyspace notifications. Because roles are re-checked on every request by `UserStatusFilter`, existing sessions never need to be looked up by user.

### 5.2 Public read side (F1–F3): cache-aside

1. `StoryService.getDetail(slug)` calls `CacheService.getOrLoad("cache:story:{id}", 10 min, loader)`.
2. On a cache miss, the loader calls `StoryMapper.findDetailBySlug`, a join over Story, AuthorProfile, StoryGenre/Genre, StoryTag/Tag and Volume/Chapter, restricted to published data (`vw_PublicStory`). A `<resultMap>` with nested collections builds the result, and the JSON is stored in Redis.
3. Any write that changes the story (edit, publish, hide, new rating) evicts `cache:story:{id}` and, when needed, `cache:home`.
4. Search (`GET /api/stories`) is never cached. `StorySearchMapper.search` adds `CONTAINSTABLE` full-text matching and each optional filter through `<if>` / `<foreach>`, then pages with `OFFSET … FETCH`.

### 5.3 Reading a chapter (F4)

1. Load the chapter from `cache:chapter:{id}`, or from SQL Server if missing. Only `PUBLISHED`, non-deleted chapters of a visible story are returned.
2. `ViewCounterService` runs `INCR views:chapter:{id}`, `INCR views:story:{storyId}` and `SADD views:dirty ...` in one pipeline.
3. For logged-in users, `ReadingHistoryMapper.upsert` runs a `MERGE` on `ReadingHistory(UserId, StoryId, LastChapterId, ScrollPercent)`. The frontend also calls `PUT /api/reading-progress/{storyId}` while the user scrolls.

### 5.4 View counter flush (write-behind)

`ViewFlushJob` runs every 60 seconds:
1. Atomically takes the members of `views:dirty` and reads and resets their counters (`GETDEL`).
2. Passes the batch to `sp_FlushViews` as a table-valued parameter (built by `ViewDeltaTableTypeHandler` from `SQLServerDataTable`). The procedure adds the values to `Story.ViewCount`, `Chapter.ViewCount` and `StoryViewDaily` in one transaction.
3. If the call fails, the counts are added back to Redis so no views are lost. If Redis itself is lost, at most about 60 seconds of views are lost; this is the documented RPO for this data.

### 5.5 Studio: writing and publishing chapters (F8–F9)

1. **Ownership:** every studio service method checks that the current user is an `AUTHOR` and owns the story (RB1, RB2); otherwise it returns 403.
2. **Autosave:** the editor calls `PUT /api/studio/chapters/{id}/draft` every few seconds. The draft is stored only in the Redis hash `draft:{userId}:{chapterId}` (TTL 7 days), so typing does not create database writes.
3. **Save:** `PUT /api/studio/chapters/{id}` sends the content together with the `rowVersion` the client last loaded.
   - The HTML is sanitized with jsoup and the word count is computed.
   - `ChapterMapper.updateContent` runs `UPDATE … WHERE RowVer = #{rowVersion}`. If it returns 0 rows, the chapter was changed elsewhere and the API returns **409 Conflict**.
   - The `trg_Chapter_Revision` trigger stores the previous version in `ChapterRevision`, and the Redis draft is deleted.
4. **Publish now:** `POST /api/studio/chapters/{id}/publish` calls `sp_PublishChapter` through a `CALLABLE` statement. In one transaction it changes the chapter status and updates `Story.ChapterCount`, `WordCount`, `LastChapterAt` and, on the first publish, `PublishedAt` (RB9). The service then evicts the story and home caches.
5. **Schedule:** the chapter is saved as `SCHEDULED` with `ScheduledAt`. `ScheduledPublishJob` calls `sp_PublishScheduled` every minute (RB11), because RDS Express has no SQL Server Agent.
6. **Revisions:** `GET .../revisions` lists previous versions; restoring one saves it as a new version, since `ChapterRevision` is append-only (RB10).

### 5.6 Becoming an author (F7, F11)

1. A `READER` with `ACTIVE` status submits a request (pen name, bio). A filtered unique index allows at most one `PENDING` request per user (RB14).
2. An admin lists `PENDING` requests and approves or rejects one. `AuthorRequestReviewService` calls `sp_ApproveAuthorRequest`, which:
   - locks the request row with `UPDLOCK` and checks that it is still `PENDING`;
   - sets it to `APPROVED`, changes the user's role to `AUTHOR` and creates the `AuthorProfile`, all in one transaction (RB15).
3. If two admins act on the same request at the same time, the second one finds a non-`PENDING` status. The procedure raises an error, which the service maps to **409 Conflict**. The Redis lock `lock:author-request:{id}` (`SET NX PX`) exists only to compare this approach with SQL Server locking in the DBMS demo.
4. The reader sees the result on the F7 page. Their next request already has the `AUTHOR` role because of `UserStatusFilter`.

### 5.7 Ratings (F6)

`PUT /api/stories/{storyId}/ratings/me` inserts or updates the user's rating with a `MERGE` in `RatingMapper`. Authors cannot rate their own stories and admins cannot rate at all (RB4, RB16). The `trg_Rating` trigger recalculates `Story.RatingAvg` and `RatingCount` in the same transaction, then the service evicts `cache:story:{id}`. The endpoint is limited by `rl:rating:{userId}`.

### 5.8 Administration (F11–F13)

- **Ban or unban:** sets `Status`, `BanReason`, `BannedBy` and `BannedAt`. Admins cannot ban themselves, and the last active admin cannot be banned (RB16). The banned user's next request is rejected by `UserStatusFilter`.
- **Moderation:** hide or unhide a story with a `HiddenReason`, soft delete a story (`sp_DeleteStory`), delete an abusive review. Each action evicts the related caches.
- **Statistics:** read-only aggregate queries in `StatsMapper.xml` (views per day and month, stories per genre, users per role, authors above the platform average) using `GROUP BY`, `HAVING` and subqueries.

### 5.9 Mock data seeder

With the `seed` profile, `MockDataGenerator` runs once and exits:
1. Generates users, author requests and profiles consistent with RB13 (each `AUTHOR` has exactly one `APPROVED` request and one profile).
2. Generates stories, volumes, chapters and reader activity (follows, ratings, history, daily views) using a Zipf distribution, so a few "hot" stories get most of the activity.
3. Bulk-loads large tables with `SQLServerBulkCopy` on a raw JDBC connection (faster than MyBatis batch inserts for tens of thousands of rows), then recalculates all derived columns with one SQL script.
4. Uses a fixed random seed, so every run produces the same data. The DBMS Lab depends on this.

---

## 6. Conventions

- Database tables and columns use PascalCase; Java fields and JSON use camelCase.
- All SQL lives in XML mappers or in `database/`; no SQL strings in Java code.
- All timestamps are stored as `DATETIME2(3)` in UTC. Dates for Vietnam time are computed with `AT TIME ZONE 'SE Asia Standard Time'`.
- `database/schema` is the single source of truth for the schema. A change to a table must be made there and mirrored in the affected mappers and in `data-dictionary.md`.
- Every SQL script under `database/bootstrap` and `database/schema` must run unchanged on both local Docker and RDS (no `sysadmin`, no file paths, no SQL Agent).
- No secrets in git: use `.env` locally and SQLCMD variables (`-v`) for the bootstrap scripts.
