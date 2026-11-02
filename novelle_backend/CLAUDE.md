# CLAUDE.md: novelle_backend

REST API for Novelle. Repository-wide rules are in [../CLAUDE.md](../CLAUDE.md); the human guide is [README.md](README.md) (sections 3–4 are partly outdated, see the end of this file).

## Stack

Java 21, Spring Boot 3.5.x (Web, Validation, Security, Actuator, Data Redis, Session Data Redis), **MyBatis** (`mybatis-spring-boot-starter`), `mssql-jdbc`, jsoup, springdoc-openapi, Maven wrapper. Tests: JUnit 5, Spring Boot Test, Testcontainers.

## Commands (run from `novelle_backend/`)

```bash
./mvnw spring-boot:run                                      # profile local (default)
./mvnw spring-boot:run -Dspring-boot.run.profiles=aws       # Redis on EC2 through the tunnel
./mvnw package -DskipTests
./mvnw test                                                 # needs RDS + Redis reachable
.\scripts\db-seed.ps1          # seed mock data            (shared RDS: ask the user first)
.\scripts\db-seed.ps1 reset    # delete all data but Genre (ask the user first)
```

Swagger UI: http://localhost:8080/swagger-ui.html. Health: `/actuator/health`.

## Configuration

- `application.yml` imports `../.env` with `spring.config.import: optional:file:../.env[.properties]`, so `mvnw` must run from `novelle_backend/`.
- Datasource: `DB_HOST` (RDS), login `novelle_app`, password `APP_PASSWORD`, database `NovelleDB`.
- Profiles: `local` (default) = RDS + compose Redis (`REDIS_PORT`); `aws` = RDS + Redis on EC2 through the tunnel (`LAB_AWS_REDIS_*`, port 16379). **The database is always RDS**; profiles only switch Redis.
- Profile files hold only connection wiring. New settings get a default in `novelle/.env.example`, never a secret in YAML.

## Code layout

Package `com.novelle`, organised **by feature**. Each feature package has `controller/`, `service/`, `mapper/` (MyBatis `@Mapper` interfaces), `dto/` (request/response records) and `model/` (row objects); its SQL is in `src/main/resources/mapper/<feature>/*Mapper.xml`.

| Package | Content |
|---|---|
| `auth` | Register (always READER), login (BCrypt), logout, `/api/me`, `UserStatusFilter` |
| `user` | `AppUser`, profile and avatar |
| `catalog` | Genres and tags (cached) |
| `story` | F1–F3: home, search, story detail, author page (reads `vw_PublicStory`) |
| `reading` | F4: chapter reading, view counting, reading progress |
| `library` | F5: history, follows, reading lists |
| `rating` | F6: ratings and reviews |
| `authorrequest` | F7: submit/cancel; approve/reject service shared with admin |
| `studio` | F8–F10: stories, volumes, chapters, drafts, revisions, dashboard |
| `admin` | F11–F13: users, author requests, moderation, catalog, statistics |
| `config` | Security, Redis, session, CORS, scheduling, OpenAPI, MyBatis |
| `common`, `common.mybatis` | `ApiError`, `GlobalExceptionHandler`, paging, `CurrentUser`, `HtmlSanitizer`; type handlers (`ROWVERSION` ↔ Base64, TVP for `sp_FlushViews`) |
| `cache` | `CacheService.getOrLoad/evict`, all keys in `CacheKeys` |
| `views` | `ViewCounterService` (Redis INCR), `ViewFlushJob` (every 60 s → `sp_FlushViews`) |
| `ratelimit` | `@RateLimited` + Redis fixed-window interceptor |
| `jobs` | `ScheduledPublishJob` (`sp_PublishScheduled`); replaces SQL Agent, which RDS Express lacks |

Request flow: Security filters (session from Redis, CSRF cookie `XSRF-TOKEN` + header `X-XSRF-TOKEN`, `UserStatusFilter`, role rules) → `RateLimitInterceptor` → controller (Bean Validation) → service (business rules RB1–RB16, `@Transactional`, cache) → mapper → SQL Server. Errors → `GlobalExceptionHandler` → `ApiError { status, code, message, details }`.

Access rules: `/api/studio/**` → AUTHOR, `/api/admin/**` → ADMIN, public GETs for home/stories/authors/chapters/genres/tags, every write needs login.

## MyBatis rules

- **All SQL lives in XML mappers or `database/`. No SQL strings in Java.**
- Parameters always `#{…}`. `${…}` only for `ORDER BY` columns chosen from a whitelist in the service.
- Multi-condition search: dynamic SQL (`<where>`, `<if>`, `<foreach>`), never string concatenation. Full-text through `CONTAINSTABLE`.
- Paging: `ORDER BY … OFFSET #{offset} ROWS FETCH NEXT #{size} ROWS ONLY`.
- Nested results: `<resultMap>` with `<association>` / `<collection>`. Otherwise rely on case-insensitive auto-mapping (PascalCase column → camelCase field).
- Stored procedures: `<select statementType="CALLABLE">{call dbo.sp_X(#{a}, #{b})}</select>`.
- Optimistic locking: `UPDATE … WHERE ChapterId = #{id} AND RowVer = #{rowVersion}`; 0 affected rows → 409 Conflict.
- Inserts that need the key: `useGeneratedKeys="true" keyProperty="…"`.

## Java conventions

- DTOs are Java records; validate request DTOs with Bean Validation.
- Services own business rules and transactions; controllers only map HTTP ↔ service. Ownership checks (RB1, RB2) in studio services → 403.
- Every write that changes cached data evicts the matching key (`cache:story:{id}`, `cache:home`, …) via `CacheService`.
- Chapter HTML is sanitized with jsoup (allowlist `p`, `h2`–`h4`, `br`, `em`, `strong`, `blockquote`) before saving.
- Timestamps are UTC (`DATETIME2(3)`); Vietnam-time grouping is done in SQL with `AT TIME ZONE 'SE Asia Standard Time'`.
- Redis key names follow `../../docs/data-dictionary.md`.

## Database scripts (`database/`)

- **No migration tool.** `bootstrap/` (database + logins, run once as the RDS master user), `schema/01..07` (tables, indexes, full-text, views, procedures, triggers, reference data), `queries/`, `seed/`. The app never changes the schema.
- A table change is made in `database/schema`, then mirrored in the affected mappers and in `data-dictionary.md`. Views, procedures and triggers use `CREATE OR ALTER`.
- Scripts must run unchanged on RDS: no `sysadmin`, no file paths, no SQL Agent.
- Database objects and columns are PascalCase.
- **Seed = SQL scripts** `seed/10..90` via `scripts/db-seed.ps1|.sh`; one scale (~200 users, 150 stories, 3,454 chapters). No Java seeder, no Datafaker. On the free-tier instance build long `NVARCHAR(MAX)` text in slices of 250 with `OPTION (RECOMPILE)` and cap joins against `seed.Nums` with `TOP (200)`.
- `sqlcmd` needs `-f 65001`, `-C`, and relative script paths (cd to `novelle_backend/` first).
- After seeding, `database/queries/99_check_invariants.sql` must return no rows.

## Outdated README content

`README.md` still mentions: a backend `docker-compose.yml` with a local SQL Server, `DB_URL` / `DB_PASSWORD` / `SEED_DEMO_PASSWORD` variables, a `seed` Spring profile with `MockDataGenerator` and Datafaker, `db-bootstrap` / `db-apply-schema` / `aws-tunnel` scripts that do not exist yet. Follow this file and the code instead.
