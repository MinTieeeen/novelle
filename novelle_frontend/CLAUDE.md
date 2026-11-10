# CLAUDE.md: novelle_frontend

React SPA for Novelle: reader site, author Studio and Admin console. Repository-wide rules are in [../CLAUDE.md](../CLAUDE.md); the full design (structure, routes, flows) is in [README.md](README.md).

**Status:** FE0 foundation done (Vite scaffold, design-system tokens in `styles/globals.css`, adjusted shadcn components, API client, auth, router with placeholder pages for every board, Vitest + Playwright). Feature modules FE1–FE8 replace the placeholders one by one: roadmap `../../docs/frontend-roadmap.md`. Design: screens `claude.ai/artifact/HkNN1A2AFHmLbzQT3wSC5j`, design system `claude.ai/artifact/E8GRZtn61b9Z9tyRMdNytN`; preview the tokens at `/dev/design-system`.

## Detailed rules (read before working in the matching area)

| When you… | Read |
|---|---|
| plan or start a module, update its spec §10, report results | [../.claude/rules/frontend-workflow.md](../.claude/rules/frontend-workflow.md) |
| write api functions, types, queries, forms, routes, hooks | [../.claude/rules/frontend-react.md](../.claude/rules/frontend-react.md) |
| build components, pages or layouts from a board; touch styles | [../.claude/rules/frontend-ui.md](../.claude/rules/frontend-ui.md) |
| write or run tests, check a screen in the browser | [../.claude/rules/frontend-testing.md](../.claude/rules/frontend-testing.md) |

## Stack

TypeScript, React 18, Vite 6, shadcn/ui (Radix) + Tailwind CSS 4 (`@tailwindcss/vite`), lucide-react, Sonner, React Hook Form + Zod, TanStack Table, React Router 6, TanStack Query, Axios, TipTap, DOMPurify, Recharts, Day.js. Lint/format: ESLint, Prettier. Tests: Vitest + React Testing Library, Playwright (on the installed Edge). Node.js 22 LTS, npm.

## Commands

```bash
npm install
npm run dev            # http://localhost:5173, proxies /api to the backend
npm run check          # tsc -b + ESLint + Vitest (gate after every phase)
npm run build          # type-check + build to dist/
npm run test:e2e       # Playwright, mocked API, desktop + mobile projects
npm run test:e2e:live  # @live specs against the real backend: only when the user asks
npm run shot -- <route> [--width 390] [--theme dark] [--role author] [--mock file.json] [--full]
npx shadcn@latest add <component>
```

The backend must run on `http://localhost:8080` (see [../novelle_backend/CLAUDE.md](../novelle_backend/CLAUDE.md)) only for live checks; development and Playwright use mocked `/api` responses.

## Configuration

Vite reads only `VITE_*` variables from `novelle_frontend/.env.local` (template `.env.example`): `VITE_API_BASE_URL=/api`, `VITE_API_PROXY_TARGET=http://localhost:8080`, `VITE_AUTOSAVE_INTERVAL_MS=10000`. These are non-secret; no secret ever goes into the frontend. Live Playwright credentials: `.env.e2e.local` (template `.env.e2e.example`, gitignored, never printed).

## Architecture rules

- `src/api/` is the **only** place that calls the backend (ESLint blocks `axios` elsewhere). Each file exports typed functions; query keys live in `api/queryKeys.ts`; mutations invalidate the related keys.
- Axios instance (`api/http.ts`): `withCredentials`, fetches `/api/auth/csrf` before the first write, XSRF cookie `XSRF-TOKEN` → header `X-XSRF-TOKEN`, one retry on `CSRF_INVALID`, errors mapped to `ApiError { status, code, message, details }`, global handlers for 401 / 429 / 5xx.
- Keep the dev proxy so the SPA and API share the `localhost:5173` origin (session cookie `SESSION` works without cross-site settings).
- Pages (`pages/`) fetch with TanStack Query and compose components; reusable UI goes in `components/<domain>/`, built from `components/ui/`.
- `components/ui/` is shadcn source: add with the CLI; edit only for design-wide changes.
- Routes follow the screen boards (`app/router.tsx`, README § 5.2). Guards: `RequireRole` for `/library`, `/lists/:listId` (READER, AUTHOR), `/become-author` (READER), `/profile` (any), `/studio/**` (AUTHOR), `/admin/**` (ADMIN). `AuthProvider` loads `/api/me` before rendering guarded routes.
- Types in `types/` mirror the backend DTOs (camelCase JSON, nulls omitted).
- Chapter HTML: TipTap limited to `p`, `h2`–`h4`, `br`, `em`, `strong`, `blockquote`; always pass through DOMPurify (`utils/sanitizeHtml`) before rendering.
- Chapter editor: autosave draft every `VITE_AUTOSAVE_INTERVAL_MS` when the content changed; save sends `version` (the chapter `UpdatedAt`); a 409 opens `ConflictModal`. Profile and story updates send `rowVersion`.
- Dates arrive in UTC and are shown in Vietnam time with Day.js (`utils/format`).
- Theme: CSS variables in `styles/globals.css` for `:root` and `.dark`; no hard-coded colours in components.
- Use the `@/` alias for imports from `src/`.
