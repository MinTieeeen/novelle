---
paths:
  - "novelle_backend/src/test/**"
---

# Backend testing

## Before running

- Redis up: `docker compose up -d redis` in `novelle/` (without it Spring Session fails and every request is a 500).
- `novelle/.env` must reach RDS; run Maven from `novelle_backend/`.
- Always `./mvnw clean test` (or `-Dtest=…`). Without `clean`, classes compiled by the IDE in `target/` can produce "Unresolved compilation problem".
- If the app was started for a check, stop it afterwards by PID: on Windows stopping `mvnw` leaves `java` listening on 8080.

## Unit tests

- Location mirrors the code: `src/test/java/com/novelle/{service,infrastructure/...,dto,exception}`.
- Plain JUnit 5 + Mockito + AssertJ, no Spring context, no database, no Redis.
- One test per business rule and per `ErrorCode` a class can throw; check the code with `assertThatThrownBy(...).isInstanceOfSatisfying(ApiException.class, ex -> assertThat(ex.code())…)`.
- Verify side effects that must **not** happen (`verify(mapper, never()).insert…`).
- MVC-only behaviour (exception handler, interceptors) can use `MockMvcBuilders.standaloneSetup` with a small test controller (see `GlobalExceptionHandlerTest`).
- A plain `ObjectMapper` writes `"details":null`, the app mapper does not (`non_null`): assert on content instead of on missing keys.

## Integration tests

Location `src/test/java/com/novelle/integration`, class name `*IntegrationTest`, extend `ApiIntegrationTest`:

- `@SpringBootTest` + `@AutoConfigureMockMvc` + `@Transactional`: real filter chain, RDS and Redis; MockMvc runs on the test thread, so **every SQL write is rolled back**. This is what makes tests safe on the shared RDS.
- Drive the API with `newClient()`: it keeps `SESSION` and `XSRF-TOKEN`, sends `X-XSRF-TOKEN` on writes (`postWithoutCsrf` / `patchWithoutCsrf` to test the 403), and uses a random private IP so rate-limit counters never collide. Its Redis keys (`rl:*:<ip>`, sessions) are deleted after each test.
- Fixtures: create through the API (`registerReader(client)`) or change rows with `sql(...)`. Never call `jdbc.update` directly: the test shares one MyBatis SqlSession and `sql(...)` clears its local cache, otherwise later requests read stale rows.
- Seeded users: find them by query (`seededActiveAuthor()`, `seededBannedUser()`), never by hard-coded id; give them a known password inside the transaction with `withKnownPassword(username)`. Never use or print the demo password.
- Nothing may commit outside the test transaction: no `REQUIRES_NEW`, no separate connections, no seed/reset scripts.
- Every `@SpringBootTest` uses `properties = {TestProperties.JOBS_OFF, TestProperties.VIEWS_PREFIX}`: no `@Scheduled` job (the view flush would commit real counters), view keys under `it:views:` (a running dev app never flushes them). Call job logic directly (`ViewFlusher.flush()`): stored procedures called inside the test transaction only nest their BEGIN/COMMIT, so the rollback still removes everything.
- Redis keys removed after each test: `rl:*:<ip>` of the clients, `rl:*:u<userId>` of users made by `registerReader`, sessions, `cache:*`, `it:views:*`.
- A trigger may block a fixture: `trg_Chapter_Revision` throws 50005 when `Chapter.Title`/`Content` change without `SESSION_CONTEXT user_id`; change other columns (`WordCount`) in tests that only need "some data changed".
- Rate-limit tests send invalid bodies: `@RateLimited` runs before validation, so no row is written.
- Redis side effects are asserted directly (`redis.hasKey(sessionKey(id))`, `redis.getExpire("rl:login:" + ip)`).

## Coverage checklist per endpoint

- success (status, body fields, fields that must be absent such as `passwordHash`, `email` on public views)
- each validation rule (`details[].field`), malformed JSON
- each `ErrorCode` the service throws, including concurrency (`STALE_DATA`, duplicate key)
- 401 without login, 403 `CSRF_INVALID` without the header, 403 `FORBIDDEN` with a wrong role
- session effects (new id after login/password change, key removed after logout or ban)
- rate limit (429, `Retry-After`, TTL)

## After the run

- Report: classes × test counts, final totals, each bug found (production or test) with cause and fix.
- Prove nothing was left: no `it_*` users in `dbo.[User]`, no `rl:*` keys of test IPs in Redis.
