---
paths:
  - "novelle_backend/src/**"
  - "novelle_frontend/src/**"
---

# Module workflow

**Frontend modules** (FE1–FE8) follow `frontend-workflow.md`: the same six steps adapted to React (screens
and boards instead of endpoints, browser verification after every component, mocked Playwright tests).
The sections below describe the backend version.

Read this before planning or starting any feature module (users, story, reading, library, rating, author request, studio, admin). The user approves each step before the next one starts; never merge two steps silently.

## 1. Scope

- Read `../docs/data-dictionary.md` (features F1–F13, tables, RB1–RB16, Redis keys) and the code that already exists.
- List what is **in** and **out** of the module and ask the user to confirm (AskUserQuestion) before planning. Example of a decision taken here: "avatar upload is out, `avatarUrl` is read-only".
- When the user changes scope later, remove everything that only served the dropped part: endpoints, DTO fields, config keys, env keys, tests, doc sections.

## 2. Plan (no code)

The plan contains, in this order:

1. Context: why, what exists, what is decided.
2. FR table (`FR-<M>nn`, requirement, business rule).
3. NFR table (security, consistency, integrity, performance, configuration, tests).
4. API table: method, path, role, CSRF, rate limit, request, response, error codes.
5. Request flow (filters → interceptor → controller → service → mapper → SQL/Redis).
6. Files per phase, using the current package layout (see `novelle_backend/CLAUDE.md`): new `ErrorCode`s, models, mappers + XML, DTOs, services, controllers, config changes, `.env.example` keys, tests.
7. Verification steps.

## 3. Spec document

`../docs/module-<name>.md`, written in **Vietnamese**, for both backend and frontend developers. Use `../docs/module-users.md` as the template. Sections:

1. Phạm vi (in / out)
2. Tác nhân & phân quyền
3. FR (+ table mapping the module's statements to the assignment query types: insert, update, delete, 1 condition, many conditions, join, subquery, aggregate)
4. NFR with "how it is implemented"
5. Dữ liệu sử dụng (tables, constraints, Redis keys with TTL)
6. Kiến trúc: overall flow + backend component diagram (Mermaid `flowchart`) + responsibility table
7. Đặc tả API: conventions, `ApiError`, error-code table, DTO tables, one subsection per endpoint with example JSON
8. Sequence diagrams (Mermaid) for every non-trivial flow, including the failure branches
9. State diagram when the module has a lifecycle
10. Frontend: routes, `src/` files, TypeScript types, Zod rules matching the backend, behaviour per error code, TanStack Query keys
11. Kiểm thử: automated test classes and a manual Postman table
12. Giới hạn & việc còn mở

Mermaid: every arrow needs a label text after `:`; avoid `<br/>` in state-diagram transitions.

## 4. Implement phase by phase

- Typical phases: foundation changes → data (models, mappers, XML) → services → controllers/security → docs.
- After each phase: `./mvnw -q -o compile` must pass; then **stop**, list the files and the techniques used, and wait for the user.
- After the last phase, the user reviews the code **before** anything is run against the shared RDS/Redis. Booting the app to check that mappers load and reading public GET endpoints is fine; no write requests.

## 5. Test

Follow `.claude/rules/backend-testing.md`. Report back:

- a table of test classes with the number of tests and the final `Tests run / Failures / Errors`;
- every bug the tests found, its cause and the fix (production bug vs. test bug);
- proof that no test data is left (RDS rows, Redis keys);
- what the user must do next (restart the app, run Postman, …).

## 6. Docs sync and wrap-up

- A change to a contract (endpoint, error code, Redis key, TTL, session timeout, env key) updates `data-dictionary.md`, the module spec and `novelle_backend/README.md` in the same change.
- Update the plan file with what was actually done.
- List open issues and ask which to handle; commit only when the user asks.
