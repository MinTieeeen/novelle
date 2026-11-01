# CLAUDE.md: novelle_frontend

React SPA for Novelle: reader site, author Studio and Admin console. Repository-wide rules are in [../CLAUDE.md](../CLAUDE.md); the full design (structure, routes, flows) is in [README.md](README.md).

**Status:** not started; only the README exists. Scaffold following the README structure, phase by phase.

## Stack

TypeScript, React 18, Vite, shadcn/ui (Radix) + Tailwind CSS 4 (`@tailwindcss/vite`), lucide-react, Sonner, React Hook Form + Zod, TanStack Table, React Router 6, TanStack Query, Axios, TipTap, DOMPurify, Recharts, Day.js. Lint/format: ESLint, Prettier. Tests: Vitest + React Testing Library. Node.js 22 LTS, npm.

## Commands

```bash
npm install
npm run dev        # http://localhost:5173, proxies /api to the backend
npm run build      # type-check + build to dist/
npm run lint
npm run test
npx shadcn@latest add <component>
```

The backend must run on `http://localhost:8080` (see [../novelle_backend/CLAUDE.md](../novelle_backend/CLAUDE.md)).

## Configuration

Vite reads only `VITE_*` variables from `novelle_frontend/.env.local` (template `.env.example`): `VITE_API_BASE_URL=/api`, `VITE_API_PROXY_TARGET=http://localhost:8080`, `VITE_AUTOSAVE_INTERVAL_MS=10000`. These are non-secret; no secret ever goes into the frontend.

## Architecture rules

- `src/api/` is the **only** place that calls the backend. Each file exports typed functions; components and pages never use Axios directly. Query keys live in `api/queryKeys.ts`; mutations invalidate the related keys.
- Axios instance (`api/http.ts`): `withCredentials`, XSRF cookie `XSRF-TOKEN` → header `X-XSRF-TOKEN`, error interceptor mapping `ApiError { status, code, message, details }`.
- Keep the dev proxy so the SPA and API share the `localhost:5173` origin (session cookie `SESSION` works without cross-site settings).
- Pages (`pages/`) fetch with TanStack Query and compose components; reusable UI goes in `components/<domain>/`, built from `components/ui/`.
- `components/ui/` is shadcn source: add with the CLI; edit only for design-wide changes.
- Route guards: `RequireRole` for `/library/**` (READER, AUTHOR), `/become-author` (READER), `/studio/**` (AUTHOR), `/admin/**` (ADMIN). `AuthProvider` loads `/api/me` before rendering guarded routes.
- Types in `types/` mirror the backend DTOs (camelCase JSON).
- Chapter HTML: TipTap limited to `p`, `h2`–`h4`, `br`, `em`, `strong`, `blockquote`; always pass through DOMPurify (`utils/sanitizeHtml`) before rendering.
- Chapter editor: autosave draft every `VITE_AUTOSAVE_INTERVAL_MS`; save sends `rowVersion`; a 409 opens `ConflictModal`.
- Dates arrive in UTC and are shown in Vietnam time with Day.js.
- Theme: CSS variables in `styles/globals.css` for `:root` and `.dark`; no hard-coded colours in components.
- Use the `@/` alias for imports from `src/`.
