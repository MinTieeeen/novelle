# CLAUDE.md: novelle_backend

REST API for Novelle. Repository-wide rules: [../CLAUDE.md](../CLAUDE.md). Human guide: [README.md](README.md) (sections 3–4 partly outdated: it still mentions a local SQL Server compose, `DB_URL`/`DB_PASSWORD`, a Java seeder and scripts that do not exist; follow this file and the code).

## Detailed rules (read before working in the matching area)

| When you… | Read |
|---|---|
| plan or start a module, write its spec doc, report results | [../.claude/rules/module-workflow.md](../.claude/rules/module-workflow.md) |
| write controllers, services, DTOs, errors, security, rate limits, config | [../.claude/rules/backend-java.md](../.claude/rules/backend-java.md) |
| write mapper interfaces, XML mappers or models | [../.claude/rules/backend-mybatis.md](../.claude/rules/backend-mybatis.md) |
| write or run tests | [../.claude/rules/backend-testing.md](../.claude/rules/backend-testing.md) |
| touch `database/` or `scripts/` | [../.claude/rules/database-scripts.md](../.claude/rules/database-scripts.md) |

## Stack

Java 21, Spring Boot 3.5.x (Web, Validation, Security, Actuator, Data Redis, Session Data Redis), MyBatis, `mssql-jdbc`, jsoup, springdoc-openapi, Maven wrapper. Tests: JUnit 5, Mockito, AssertJ, Spring Boot Test (MockMvc).

## Commands (run from `novelle_backend/`)

```bash
./mvnw spring-boot:run                                  # profile local (default): RDS + compose Redis
./mvnw spring-boot:run -Dspring-boot.run.profiles=aws   # RDS + Redis on EC2 through the tunnel (16379)
./mvnw -q -o compile
./mvnw clean test                                       # needs RDS + Redis; writes are rolled back
.\scripts\db-seed.ps1 [reset]                           # shared RDS: ask the user first
```

Swagger UI http://localhost:8080/swagger-ui.html · health `/actuator/health`. Redis must be up first; on Windows stop the app by PID.

## Configuration

`application.yml` imports `../.env` (`optional:file:../.env[.properties]`), so `mvnw` must run from `novelle_backend/`. Datasource = RDS (`DB_HOST`, login `novelle_app`, `APP_PASSWORD`, `NovelleDB`). Profiles only switch Redis. New settings: default in `novelle/.env.example`, never a secret in YAML.

## Code layout

Package `com.novelle`, **by layer**; layer packages are flat, class names carry the feature. MyBatis XML: `src/main/resources/mapper/<Name>Mapper.xml`.

| Package | Content |
|---|---|
| `controller`, `service`, `mapper`, `model`, `dto` | the layers (see backend-java rule) |
| `exception` | `ErrorCode`, `ApiError`, `ApiException`, `ApiErrorWriter`, `GlobalExceptionHandler` |
| `config` | `SecurityConfig`, `WebMvcConfig`, CORS, OpenAPI |
| `infrastructure.security` | `SessionUser`, `CurrentUser`, `SessionAuthenticator`, `UserStatusFilter`, JSON 401/403 handlers |
| `infrastructure.mybatis` | `RowVersion` + type handler (TVP for `sp_FlushViews` later) |
| `infrastructure.ratelimit` | `@RateLimited`, interceptor, Redis fixed window |
| `infrastructure.cache` / `views` / `jobs` / `html` | cache-aside, view counters + flush job, `sp_PublishScheduled` job, chapter HTML sanitizer (not built yet) |

Request flow: Spring Session (Redis) → `UserStatusFilter` → CSRF → logout → URL rules → `RateLimitInterceptor` → controller → service (`@Transactional`) → mapper → SQL Server; errors → `ApiError { status, code, message, details }`.

Access: `/api/studio/**` AUTHOR, `/api/admin/**` ADMIN, listed public GETs, every other request needs login.

Done so far: module users (`/api/auth/**`, `/api/me/**`, `/api/users/{username}`), spec in `../../docs/module-users.md`.
