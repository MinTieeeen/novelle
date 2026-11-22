---
paths:
  - "novelle_backend/src/main/java/**"
  - "novelle_backend/src/main/resources/*.yml"
---

# Backend Java conventions

## Layers (package `com.novelle`, by layer)

| Layer | Does | Never does |
|---|---|---|
| `controller` | `@Valid` on request DTOs, calls one service method, maps to HTTP status (`@ResponseStatus`), opens/rotates the session through `SessionAuthenticator` | business rules, mapper calls, try/catch for error mapping |
| `service` | business rules RB1–RB16, ownership checks (403), `@Transactional` (`readOnly = true` for reads), cache eviction, throws `ApiException(ErrorCode)` | HTTP types, Servlet API |
| `mapper` | MyBatis interface, `@Param` on every argument | SQL in Java |
| `model` | mutable row objects (getters/setters) for MyBatis | JSON annotations |
| `dto` | Java records; `*Request` with Bean Validation, `*Response` with a static `from(model)` | business logic |
| `exception` | `ErrorCode`, `ApiError`, `ApiException`, `ApiErrorWriter`, `GlobalExceptionHandler` | |
| `infrastructure.*` | technical building blocks shared by features (security, mybatis, ratelimit, cache, views, jobs, html) | feature logic |

Class names carry the feature: `StoryController`, `StoryService`, `StoryMapper` + `resources/mapper/StoryMapper.xml`.

## Errors

- Add a new code to `ErrorCode` (it fixes the HTTP status and the default English message); services throw `new ApiException(ErrorCode.X)` or `new ApiException(code, message, details)`.
- `details` is a `List<ApiError.FieldError>` for field problems or a small `Map`/record (`banReason`, `retryAfterSeconds`).
- Stored-procedure `THROW` numbers are mapped in `GlobalExceptionHandler`: 50001 → 409 `ALREADY_PROCESSED`, 50002 → 403, 50003 → 409 `PEN_NAME_TAKEN`, 50004 → 404, 50007 → 409; anything else → 500 logged, no SQL text to the client.
- A unique-constraint race: catch `DuplicateKeyException` in the service and pick the code from the constraint name (`UQ_User_Email` → `EMAIL_TAKEN`); otherwise the handler returns `CONFLICT`.
- Filters and security handlers write errors with `ApiErrorWriter` (they run before Spring MVC).

## Security and session

- Session cookie `SESSION` in Redis (Spring Session). Principal = `SessionUser(userId, username, role)`; read it with `CurrentUser.require()/requireId()/find()`.
- Login is done in code (no form login): after checking credentials call `SessionAuthenticator.signIn(user, request, response)` (rotates the session id and saves the context). After a password change call `rotateSessionId`.
- CSRF: `CookieCsrfTokenRepository` (`XSRF-TOKEN` cookie, `X-XSRF-TOKEN` header). The cookie is issued only when the token is read: `GET /api/auth/csrf`.
- `UserStatusFilter` re-reads Role/Status by primary key on every authenticated request: BANNED → session invalidated + 403 `ACCOUNT_BANNED`; changed role → principal updated. Do not cache the role elsewhere.
- URL rules live in `SecurityConfig` (`/api/studio/**` AUTHOR, `/api/admin/**` ADMIN, listed public GETs, everything else authenticated). New public GET paths must be added there.
- Passwords: BCrypt; length 8–72 chars **and** ≤ 72 UTF-8 bytes (`PasswordRules`). Login failures for unknown user and wrong password must look identical (dummy-hash compare); reveal a ban only after a correct password.

## Rate limiting

- `@RateLimited("<name>")` on a controller method (or class); limits come from `app.rate-limit.limits.<name>` in `application.yml`, values from `RL_*` keys in `novelle/.env.example`. Redis key `rl:<name>:<ip>` (or `u<userId>` with `scope = USER`).
- Over the limit: 429 `RATE_LIMITED`, header `Retry-After`, `details.retryAfterSeconds`. Redis down → requests pass (fail open).
- New Redis keys are added to `data-dictionary.md` § 8.

## Data and JSON

- `ROWVERSION` → `RowVersion` (Base64 in JSON); updates send it back and a 0-row update → `STALE_DATA` (409).
- `DATETIME2` (UTC, no offset) → `LocalDateTime` in models → `Instant` in DTOs (`Times.utc`).
- JSON omits nulls (`default-property-inclusion: non_null`); a PATCH field that is `null` means "unchanged", an empty string means "clear" (document it per endpoint).
- Boolean fields named `isX` in DTOs need `@JsonProperty("isX")`.
- Every write that changes cached data evicts the key via `CacheService`; chapter HTML goes through `HtmlSanitizer`.

## Configuration

- New setting: default in `novelle/.env.example`, referenced in `application.yml` as `${KEY:default}`; never a secret in YAML. Never edit `novelle/.env`.
- Bind groups of settings with a `@ConfigurationProperties` record (picked up by `@ConfigurationPropertiesScan`).

## Writing files

Create or edit Java/XML with the Write/Edit tools, not shell heredocs: heredocs dropped a `\` in a regex and broke on quotes during the users module.
