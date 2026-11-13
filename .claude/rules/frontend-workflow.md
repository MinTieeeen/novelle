---
paths:
  - "novelle_frontend/**"
---

# Frontend module workflow

Read this before planning or starting a frontend module (FE1 users … FE8; FE9 is the Playwright module). It is the frontend version of
`module-workflow.md`: same six steps, same rule that the user approves each step before the next one
starts. Order, scope and APIs of every module: `../docs/frontend-roadmap.md`.

## Sources of truth (when they disagree)

1. The backend code: controllers, DTOs, `ErrorCode` in `novelle_backend/src/main/java/com/novelle/`. Types and
   Zod rules must match it, not the docs.
2. The screen design (claude.ai artifact `HkNN1A2AFHmLbzQT3wSC5j`, boards `project/<Board>.dc.html`): layout,
   routes, copy, states. The design system (artifact `E8GRZtn61b9Z9tyRMdNytN`): tokens and component rules.
3. `../docs/module-<name>.md` §10 (frontend part of the backend spec). Where it differs from 1 or 2, update §10.
4. The READMEs.

## 1. Scope

- Read the roadmap section of the module, the module spec §10, the controllers it uses and the boards it
  covers. Fetch every board of the module with `Artifact read` (`paths: ["project/X.dc.html", …]`); the files
  land in the scratchpad (see `frontend-ui.md` § Reading a board).
- List **in / out** (screens, states, interactions) and every conflict found between design, spec and backend
  (route names, fields the design shows but the API does not return, actions with no endpoint). Ask the user
  (AskUserQuestion) before planning.

## 2. Plan (no code)

In this order:

1. Context: what exists (components, api functions, routes), what is decided.
2. Screen table: board id → route → page → guard → API calls (method + path) → states (loading, empty,
   error, each relevant `ErrorCode`, success toast).
3. Component table: name, folder (`components/<domain>/`), source board, props, which shadcn parts it uses,
   whether it is new or reused.
4. Data layer: `types/<domain>.ts`, `api/<domain>.ts` functions, query keys, which mutation invalidates which
   keys, optimistic updates (if any), Zod schemas with the backend limits.
5. Files per phase (see § 4).
6. Verification: Vitest tests, the browser checks per screen, and the list of Playwright cases to write
   later in FE9 (no Playwright spec is written during a feature module).

## 3. Spec update

Update `../docs/module-<name>.md` §10 in **Vietnamese**: routes (as built), file tree, TypeScript types,
Zod rules, behaviour per error code, query keys and invalidation, component ↔ board mapping. Do not write a
separate frontend spec file. Fix the other sections only if the frontend work found a backend contract error.

## 4. Implement phase by phase

Typical phases:

| Phase | Content | Gate |
|---|---|---|
| a. Data | `types/`, `api/`, `queryKeys`, Zod schemas, mock fixtures in `e2e/fixtures/` | `npm run check` |
| b. Components | reusable pieces in `components/<domain>/`, each with a preview on `/dev/design-system` (or a `/dev/<domain>` page) in every state | `npm run check` + browser check of each component |
| c. Pages | pages in `pages/<area>/`, wired to queries/mutations, routes in `app/router.tsx` | `npm run check` + browser check of each screen against its board |
| d. Polish | responsive (390 / 768 / 1440), keyboard, empty/error states, copy | browser check at every width |

After each phase: `npm run check` (tsc + ESLint + Vitest) must pass, then do the **browser verification
loop** (`frontend-testing.md` § Browser verification) for everything built in the phase, fix what differs from
the board, and **stop**: list the files, the techniques used, the screenshots compared and any deviation from
the design kept on purpose. Wait for the user.

Never run write requests against the real backend (RDS/Redis) during implementation: pages are developed
and checked with mocked `/api` responses. Booting the backend and loading public GET pages is fine.

## 5. Test

**Playwright end-to-end tests are not written module by module.** The user decided (2026-11-11) that the
whole e2e suite is written in the last module of the roadmap, **FE9**, once FE1–FE8 are done and the UI is
stable. In a feature module the test step is:

- Vitest for pure helpers, schemas and logic-heavy components (`npm run check` green);
- the browser verification loop of every screen and state (`frontend-testing.md` § Browser verification);
- the list of Playwright cases of the module, written in the module section of `../docs/frontend-roadmap.md`
  ("Ca kiểm thử (viết ở FE9)") and in §10.7 of the module spec.

Report: Vitest files × tests and totals; every bug found, its cause and fix; screenshots checked (route ×
width) and remaining differences from the board. Run Playwright in a feature module only if the user asks.

In **FE9**: follow `frontend-testing.md` § End-to-end tests for every module, then report spec files × cases,
`passed / failed` per project (desktop + mobile), bugs found (frontend, test or backend contract), and live
results only if the user asked for a live run (with proof that test data was cleaned up).

## 6. Docs sync and wrap-up

- Route, query key, env key or behaviour change → update module spec §10, `novelle_frontend/README.md`
  (routes § 5.2, structure § 3) and the roadmap status table in the same change.
- New `VITE_*` key → `.env.example` with its default.
- Mark the module ✔ in `../docs/frontend-roadmap.md` § 1 with test counts; list open issues and ask which to
  handle; commit only when the user asks.
