---
paths:
  - "novelle_backend/src/main/resources/mapper/**"
  - "novelle_backend/src/main/java/com/novelle/mapper/**"
  - "novelle_backend/src/main/java/com/novelle/model/**"
---

# MyBatis rules

## Writing SQL

- All SQL lives in `src/main/resources/mapper/<Name>Mapper.xml` (namespace = interface FQN) or in `database/`. No SQL strings in Java.
- `dbo.[User]` always in brackets (reserved word). Columns are PascalCase.
- Parameters always `#{…}`. `${…}` only for an `ORDER BY` column chosen from a whitelist in the service.
- Multi-condition search: `<where>`, `<if>`, `<choose>`, `<foreach>`; never string concatenation. Full-text through `CONTAINSTABLE`.
- Paging: `ORDER BY … OFFSET #{offset} ROWS FETCH NEXT #{size} ROWS ONLY`.
- Existence checks: `SELECT CASE WHEN EXISTS (SELECT 1 …) THEN 1 ELSE 0 END` with `resultType="boolean"`.
- Inserts that need the key: `useGeneratedKeys="true" keyProperty="userId" keyColumn="UserId"`.
- Partial updates: `<set>` with `<if>`; when a nullable column must be clearable, pass a separate `xSet` boolean flag (see `UserMapper.updateProfile`).
- Optimistic locking: `… WHERE Id = #{id} AND RowVer = #{rowVersion}`; the service treats 0 rows as `STALE_DATA`. Select the version as `RowVer AS RowVersion`.
- Stored procedures: `<select statementType="CALLABLE">{call dbo.sp_X(#{a}, #{b})}</select>`.
- Reuse column lists with `<sql id>` + `<include refid>`.

## Mapping results

- Auto-mapping is case-insensitive: PascalCase column → camelCase property; `map-underscore-to-camel-case` is off.
- Nested objects: `<resultMap autoMapping="true">` with `<association columnPrefix="X_" notNullColumn="XId" autoMapping="true">`; alias the joined columns `X_Column`. `notNullColumn` keeps the association `null` when a LEFT JOIN finds nothing.
- `ROWVERSION` maps to `RowVersion` automatically (`RowVersionTypeHandler`, registered by package).
- `DATETIME2` → `LocalDateTime` fields.

## Pitfalls found in practice

- **OGNL literals:** in `test=` use double quotes for strings: `test='login.contains("@")'`. `'@'` (one char in single quotes) is a `Character` and fails at runtime with a 500 on every call. Mock-based unit tests do not see this; only an integration test does.
- **`isX` properties:** a getter `isVerified()` exposes property `verified`; add `setIsVerified(...)` so column `IsVerified` auto-maps.
- **Collation:** `Vietnamese_100_CI_AI` ignores case and tone marks; compare with `COLLATE Latin1_General_100_BIN2` when an exact match matters (as the triggers do).
- **Triggers:** before updating `Chapter.Title/Content`, the same connection must run `sp_set_session_context 'user_id'` (contract of `trg_Chapter_Revision`), inside the same transaction.

Every new mapper statement needs at least one integration test (see `backend-testing.md`).
