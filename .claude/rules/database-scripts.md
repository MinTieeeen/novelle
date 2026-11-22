---
paths:
  - "novelle_backend/database/**"
  - "novelle_backend/scripts/**"
---

# Database scripts (`novelle_backend/database`)

- **No migration tool.** `bootstrap/` (database + logins, once, as the RDS master user), `schema/01..07` (tables, indexes, full-text, views, procedures, triggers, reference data), `queries/`, `seed/`. The application never changes the schema.
- The RDS instance is shared: running schema scripts, seed, `reset` or anything destructive needs the user's explicit OK first.
- A table change is made in `database/schema`, then mirrored in the affected mappers and in `../docs/data-dictionary.md`. Views, procedures and triggers use `CREATE OR ALTER`; tables are created only `IF OBJECT_ID(...) IS NULL`.
- Scripts run unchanged on RDS: no `sysadmin`, no file paths, no SQL Agent (scheduled work is a Spring `@Scheduled` job).
- Objects and columns are PascalCase; `[User]` in brackets.
- Procedures: `SET XACT_ABORT ON`, `BEGIN TRY/CATCH`, rollback and re-`THROW`. Error numbers 50001–50007 are mapped to HTTP in `GlobalExceptionHandler`; a new number must be added there too.
- Triggers handle sets of rows (`inserted`/`deleted` may hold many or none).
- **Seed = SQL scripts** `seed/10..90` through `scripts/db-seed.ps1|.sh`; one scale (~200 users, 150 stories, 3,454 chapters). No Java seeder. On the free-tier instance build long `NVARCHAR(MAX)` text in slices of 250 with `OPTION (RECOMPILE)` and cap joins against `seed.Nums` with `TOP (200)`.
- `sqlcmd` needs `-f 65001`, `-C`, and relative script paths (cd to `novelle_backend/` first).
- After seeding, `database/queries/99_check_invariants.sql` must return no rows.
