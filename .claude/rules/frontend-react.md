---
paths:
  - "novelle_frontend/src/**"
  - "novelle_frontend/vite.config.ts"
---

# Frontend code conventions

## Layers (`novelle_frontend/src/`)

| Layer | Does | Never does |
|---|---|---|
| `api/<domain>.ts` | typed functions per endpoint (`getStory(slug)`, `publishChapter(id)`) on the shared `http` instance; returns `data` | React, toasts, navigation |
| `api/queryKeys.ts` | every query key, as functions (`queryKeys.story.detail(slug)`) | inline key arrays in pages |
| `types/<domain>.ts` | interfaces mirroring backend DTOs (camelCase); enums as string unions | runtime code |
| `pages/<area>/XPage.tsx` | one per route: reads params, runs queries/mutations, composes components, handles error codes | reusable UI, Axios |
| `components/<domain>/` | reusable UI fed by props (story, reader, library, editor, studio, admin, charts, common, layout) | fetching, routing decisions |
| `components/ui/` | shadcn source; edit only for design-wide changes (see `frontend-ui.md`) | page logic |
| `hooks/` | reusable stateful logic (`useAutosave`, `useReadingProgress`, `useUrlState`) | JSX |
| `utils/` | pure helpers (format, sanitizeHtml, errors) | React |
| `auth/`, `app/`, `layouts/` | shell: providers, guards, router, frames | feature logic |

Files: components and pages `PascalCase.tsx`, one exported component per file; hooks `useX.ts`; imports
through `@/`. A component used by one page only stays next to it until a second page needs it.

## Backend contract

- Before writing a type, open the DTO record (`novelle_backend/src/main/java/com/novelle/dto/*.java`): JSON
  omits nulls, so a nullable field is `field?: T | null`; `Instant` → ISO string (UTC); `RowVersion` → Base64
  string; `isX` booleans keep the `is` prefix.
- Paged lists use `PageResponse<T>` (`types/api.ts`); paging params are `page` (0-based) and `size`.
- Chapter saves use `version` (= `UpdatedAt` ISO string) as the optimistic lock, not `rowVersion`;
  profile/story updates send `rowVersion`. Check the request DTO each time.
- Error codes come from `ErrorCode.java`; add their Vietnamese text to `utils/errors.ts` when the UI shows them.

## Server state (TanStack Query)

- `useQuery({ queryKey: queryKeys…, queryFn: () => api…, enabled })`; never `useEffect` + fetch.
- Mutations: `useMutation` → on success invalidate every affected key (list + detail + counters), then a
  toast that repeats the button verb ("Đã đăng chương 12"). Write the invalidation list in the plan.
- Optimistic updates only for toggles (follow, rating stars); always roll back in `onError`.
- Personal data (library, studio, admin) must not be shown to the next user: `logout()` removes all queries
  except `me` (already in `AuthProvider`); keys of personal data start with the domain, never with `me`.
- After a role change (author approved), call `useAuth().refresh()`.

## Errors

- `api/http.ts` turns every failure into `ApiError { status, code, message, details }`, refreshes the CSRF
  token once on `CSRF_INVALID`, and runs global handlers: 401 → `/login?redirect=…`, 429 and 5xx → toast.
  Pass `{ skipGlobalErrorHandler: true }` when the page shows its own message (login form, `/me`).
- Pages handle the codes listed in the plan: 404 codes → `NotFoundPage`-like empty state; 409 → inline Alert
  or dialog next to the action (never only a toast); `VALIDATION_FAILED` → `fieldErrors(e)` onto the form
  fields with `form.setError`.
- Use `errorMessage(e, fallback)` for user text; never show `error.message` from the backend (English).

## Forms

- React Hook Form + `zodResolver` + shadcn `Form` (`FormField`, `FormLabel`, `FormMessage`). Schemas live in
  `types/` or next to the form and copy the backend limits (`@Size`, `@Pattern`) with Vietnamese messages.
- Submit button: disabled + spinner + "Đang lưu…" while pending; keep its width.
- Field-level 409s (`USERNAME_TAKEN`, `PEN_NAME_TAKEN`, `READING_LIST_NAME_TAKEN`) go under the field.

## Routing and URL state

- Routes only in `app/router.tsx`, lazy-loaded with `page(<X />)`, guarded with `RequireRole`. Comment each
  route with its board id.
- Filters, tabs (`?tab=`) and paging live in the URL search params so back/forward and sharing work.
- Links are `<Link>`/`<NavLink>`; `navigate()` only after an action.

## Content and dates

- Chapter HTML: render only through `sanitizeHtml()`; TipTap limited to `p, h2–h4, br, em, strong, blockquote`.
- Dates from the API are UTC; display with `formatDate/formatDateTime/formatRelative` (Vietnam time); send
  scheduled times with `vnLocalToUtcIso`. Numbers with `formatNumber/formatRating` ("48.210", "4,6").

## Config and security

- Only `VITE_*` variables, declared in `src/vite-env.d.ts` and `.env.example`; nothing secret in the bundle.
- No `localStorage` for auth or personal data; only UI preferences (theme, reader settings, drafts of the
  chapter editor are in Redis via the API).
- Hiding a button is convenience: the backend re-checks roles; still hide actions the role cannot do.

## Writing files

Use the Write/Edit tools, not shell heredocs (heredocs broke on quotes during setup). After `npx shadcn add`,
check the generated imports (`@/lib/utils`) and that no extra package (`next-themes`, `cn`) was installed.
