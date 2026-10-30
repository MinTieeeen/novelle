# Novelle Frontend

Single-page web app for **Novelle**, a platform for reading and writing serialized stories, built for the HK261 DBMS assignment. It has three areas:

- the **reader site**, for everyone;
- the **Studio**, where authors write and publish;
- the **Admin console**, for platform administrators.

All data comes from the Novelle REST API ([`../novelle_backend`](../novelle_backend/README.md)). The frontend has no direct access to SQL Server or Redis.

---

## 1. Features

| # | Feature | Roles | Pages |
|---|---|---|---|
| F1 | Home: recently updated, new and top-rated stories, genre shortcuts | All | `/` |
| F2 | Search and filter by keyword, genre, tag, status, chapter count and rating | All | `/search` |
| F3 | Story detail with table of contents grouped by volume; author page with follow button | All | `/stories/:slug`, `/authors/:authorId` |
| F4 | Chapter reader: previous/next navigation, reading settings (font size, theme), automatic progress saving | All | `/read/:chapterId` |
| F5 | Library: continue reading, followed stories, followed authors, personal reading lists | READER, AUTHOR | `/library`, `/library/lists/:listId` |
| F6 | Star rating and written review on the story page | READER, AUTHOR | `/stories/:slug` |
| F7 | Request to become an author and see whether it was approved | READER | `/become-author` |
| F8 | Manage own stories: create, edit, cover, genres, tags, soft delete | AUTHOR | `/studio`, `/studio/stories/:storyId` |
| F9 | Chapter editor with autosave, publish now or schedule, revision history | AUTHOR | `/studio/stories/:storyId/chapters/:chapterId` |
| F10 | Author dashboard: views over time, followers, ratings | AUTHOR | `/studio/dashboard` |
| F11 | User management and author request review | ADMIN | `/admin/users`, `/admin/author-requests` |
| F12 | Content moderation and genre/tag management | ADMIN | `/admin/stories`, `/admin/catalog` |
| F13 | Platform statistics | ADMIN | `/admin/dashboard` |
| — | Register, log in, log out, edit profile | All | `/login`, `/register`, `/profile` |

---

## 2. Tech stack

| Area | Technology |
|---|---|
| Language | TypeScript |
| UI framework | React 18 |
| Build tool and dev server | Vite |
| Component library | shadcn/ui (components copied into `src/components/ui/`, built on Radix UI primitives) |
| Styling | Tailwind CSS 4 (`@tailwindcss/vite`); light and dark theme through CSS variables and the `.dark` class |
| Icons | lucide-react |
| Toasts | Sonner (shadcn `Toaster`) |
| Forms | React Hook Form + Zod, through the shadcn `Form` components |
| Tables | TanStack Table, through the shadcn Data Table pattern |
| Routing | React Router 6 |
| Server state | TanStack Query (caching, refetching, cache invalidation after mutations) |
| HTTP client | Axios (cookies + XSRF header) |
| Rich-text editor | TipTap, limited to the HTML the backend allows (`p`, `h2`–`h4`, `br`, `em`, `strong`, `blockquote`) |
| HTML rendering | DOMPurify before rendering chapter content |
| Charts | Recharts, wrapped by the shadcn `Chart` components |
| Dates | Day.js (UTC from the API, shown in Vietnam time); shadcn `Calendar` (react-day-picker) for date pickers |
| Lint and format | ESLint, Prettier |
| Tests | Vitest, React Testing Library |

---

## 3. Project structure

```
novelle_frontend/
├─ index.html
├─ package.json
├─ vite.config.ts                Dev server on port 5173, proxies /api to the backend, Tailwind plugin, `@/` alias
├─ tsconfig.json                 Includes the `@/*` → `src/*` path alias used by shadcn/ui
├─ components.json               shadcn/ui CLI config (style, aliases, CSS file, icon library)
├─ .env.example                  Copy to .env.local
├─ public/
│  └─ covers/                    Free-licensed cover images per genre ({genre-slug}/NN.jpg + manifest.json), see docs/data-dictionary.md §9.6
└─ src/
   ├─ main.tsx                   Entry point: mounts <App/>
   ├─ App.tsx                    Wraps the router with the global providers
   ├─ app/
   │  ├─ router.tsx              Route table, layouts and role guards
   │  ├─ providers.tsx           QueryClientProvider, ThemeProvider, AuthProvider, TooltipProvider, <Toaster/>
   │  ├─ queryClient.ts          TanStack Query defaults (staleTime, retry policy)
   │  └─ ThemeProvider.tsx       Light / dark / system theme: toggles the `.dark` class on <html>, kept in localStorage
   ├─ api/
   │  ├─ http.ts                 Axios instance: baseURL, withCredentials, XSRF, error interceptor
   │  ├─ queryKeys.ts            Central list of query keys used for caching and invalidation
   │  ├─ auth.ts                 /api/auth, /api/me
   │  ├─ stories.ts              Home, search, story detail, author page
   │  ├─ reading.ts              Chapter content, reading progress
   │  ├─ library.ts              History, follows, reading lists
   │  ├─ ratings.ts              Ratings and reviews
   │  ├─ authorRequests.ts       Become-author requests
   │  ├─ studio.ts               Stories, volumes, chapters, drafts, revisions, dashboard
   │  └─ admin.ts                Users, review queue, moderation, catalog, statistics
   ├─ auth/
   │  ├─ AuthProvider.tsx        Loads the current user from /api/me; exposes useAuth()
   │  └─ RequireRole.tsx         Route guard: redirects to /login or shows the 403 page
   ├─ layouts/
   │  ├─ ReaderLayout.tsx        Header with search, genre menu and user menu
   │  ├─ StudioLayout.tsx        Side navigation for authors
   │  └─ AdminLayout.tsx         Side navigation for admins
   ├─ pages/
   │  ├─ reader/                 HomePage, SearchPage, StoryDetailPage, AuthorPage, ReaderPage,
   │  │                          LibraryPage, ReadingListPage
   │  ├─ account/                LoginPage, RegisterPage, ProfilePage, BecomeAuthorPage
   │  ├─ studio/                 MyStoriesPage, StoryEditorPage, ChapterEditorPage, AuthorDashboardPage
   │  ├─ admin/                  UsersPage, AuthorRequestsPage, StoriesModerationPage, CatalogPage,
   │  │                          AdminDashboardPage
   │  └─ errors/                 NotFoundPage, ForbiddenPage
   ├─ components/
   │  ├─ ui/                     shadcn/ui components added with the CLI (Button, Card, Dialog, AlertDialog,
   │  │                          Sheet, Tabs, Table, Form, Input, Select, Command, Popover, Calendar, Badge,
   │  │                          DropdownMenu, Pagination, Skeleton, Sonner, Chart, ...)
   │  ├─ story/                  StoryCard, StoryGrid, StoryFilters, ChapterToc, RatingStars, ReviewList
   │  ├─ reader/                 ChapterContent, ReaderToolbar, ReaderSettingsDrawer
   │  ├─ editor/                 RichTextEditor (TipTap), AutosaveIndicator, RevisionDrawer, ConflictModal
   │  ├─ charts/                 ViewsLineChart, GenreBarChart, StatCard
   │  └─ common/                 PageHeader, EmptyState, ErrorResult, ConfirmButton
   ├─ hooks/
   │  ├─ useDebounce.ts
   │  ├─ useAutosave.ts          Periodic draft save for the chapter editor
   │  ├─ useReadingProgress.ts   Tracks scroll position and saves it with a debounce
   │  └─ useReaderSettings.ts    Font size, line height and theme, kept in localStorage
   ├─ types/                     TypeScript types matching the API DTOs
   ├─ lib/
   │  └─ utils.ts                `cn()` helper (clsx + tailwind-merge) used by shadcn/ui components
   ├─ utils/                     Formatting (numbers, dates), sanitizeHtml, error helpers
   └─ styles/
      ├─ globals.css             Tailwind import, theme CSS variables (`:root` and `.dark`), base layer
      └─ reader.css              Reader typography for chapter content
```

### What each part does

| Part | Responsibility |
|---|---|
| `app/` | Composes the application: providers, theme, and the route tree with the layout and role guard for each section. |
| `api/` | The only place that talks to the backend. Each file exports typed functions such as `getStory(slug)` and `publishChapter(id)`. Components never call Axios directly. |
| `auth/` | Holds the logged-in user (`id`, `displayName`, `role`) and exposes `useAuth()`. `RequireRole` protects the Studio (`AUTHOR`) and Admin (`ADMIN`) routes. |
| `layouts/` | Page frames for the three sections. Each renders an `<Outlet/>` for its child routes. |
| `pages/` | One component per route. A page fetches data with TanStack Query hooks, then composes components. |
| `components/ui/` | shadcn/ui source code owned by the project. Added with `npx shadcn@latest add <name>`; edit only for design-wide changes, never for page-specific logic. |
| `components/` | Reusable UI with no routing logic, composed from `components/ui`. Grouped by domain (story, reader, editor, charts) plus generic `common` pieces. |
| `hooks/` | Reusable stateful logic: debouncing, autosave, reading-progress tracking, reader preferences. |
| `types/` | Shared request and response types, so the API layer and pages agree on shapes. |
| `lib/` | The `cn()` class-name helper that shadcn/ui expects at `@/lib/utils`. |
| `utils/` | Pure helpers with no React dependency. |
| `styles/` | Tailwind entry point and theme tokens. Colours, radius and fonts are CSS variables, so the light and dark themes are changed in one place. |

---

## 4. Configuration and running

### 4.1 Prerequisites

- Node.js 22 LTS and npm
- The backend running on `http://localhost:8080` (see the backend README). It can use the `local` or `aws` profile; the frontend works the same either way.

### 4.2 Environment variables

Copy `.env.example` to `.env.local`.

| Variable | Default | Description |
|---|---|---|
| `VITE_API_BASE_URL` | `/api` | Base path of the API. Keep `/api` in development so requests go through the Vite proxy. |
| `VITE_API_PROXY_TARGET` | `http://localhost:8080` | Backend address the dev server proxies to. |
| `VITE_AUTOSAVE_INTERVAL_MS` | `10000` | How often the chapter editor saves a draft. |

The dev proxy keeps the frontend and API on the same origin (`localhost:5173`). This lets the session cookie and XSRF cookie work without cross-site cookie settings.

### 4.3 Run

```bash
npm install
npm run dev          # http://localhost:5173
```

Log in with a seeded account (`reader01`, `reader02`, `author01` or `admin`) using the demo password configured on the backend.

### 4.4 Other scripts

| Command | Description |
|---|---|
| `npm run build` | Type-checks and builds static files into `dist/` |
| `npm run preview` | Serves the built `dist/` locally |
| `npm run lint` | Runs ESLint |
| `npm run format` | Runs Prettier |
| `npm run test` | Runs Vitest unit and component tests |
| `npx shadcn@latest add <component>` | Adds a shadcn/ui component to `src/components/ui/` |

---

## 5. How it works

### 5.1 Application startup

1. `main.tsx` mounts `App`, which wraps the router in `providers.tsx`.
2. `AuthProvider` calls `GET /api/me`.
   - If the session cookie is valid, it stores the user and role.
   - If the call returns 401, the user is treated as a guest.
3. While this call is pending, a full-page loading state (spinner / `Skeleton`) is shown, so guarded routes never flash.
4. The router renders the matching layout and page.

### 5.2 Routing and access control

```
/                       ReaderLayout   (public)
├─ /search, /stories/:slug, /authors/:authorId, /read/:chapterId
├─ /library/**          RequireRole(READER, AUTHOR)
├─ /become-author       RequireRole(READER)
└─ /profile             RequireRole(any logged-in user)
/studio/**              StudioLayout   RequireRole(AUTHOR)
/admin/**               AdminLayout    RequireRole(ADMIN)
/login, /register       public
*                       NotFoundPage
```

Navigation also adapts to the role: the "Studio" link appears only for authors, "Admin" only for admins, and "Become an author" only for readers. The backend checks permissions again on every request, so hiding links is for convenience, not security.

### 5.3 Data fetching and caching

- Pages read data with `useQuery`, using keys from `api/queryKeys.ts` (for example `['story', slug]`).
- Writes use `useMutation`. On success, they invalidate the affected keys so lists and details refresh. For example, publishing a chapter invalidates the studio chapter list and the public story detail.
- The Axios interceptor in `api/http.ts` converts API errors into one `ApiError` type and handles common cases in one place:

| Status | Behavior |
|---|---|
| 401 | Clear the auth state and redirect to `/login?redirect=…` |
| 403 | Show the Forbidden page |
| 409 | Returned to the caller, which shows a specific message (edit conflict, request already reviewed) |
| 429 | Show a "too many requests, try again shortly" toast (Sonner) |
| 5xx / network | Generic error toast (Sonner) |

### 5.4 Reader site (F1–F6)

- **Home and search:** the search page stores the filters in the URL query string. Results can then be shared and the back button works. Keyword input is debounced before a request is sent.
- **Story detail:** shows the metadata, genres, tags, the table of contents grouped by volume, and the rating summary. Follow, rate and "add to reading list" buttons call mutations and refresh the page data.
- **Reader page:**
  1. Loads the chapter, sanitizes the HTML with DOMPurify, and renders it with the user's reader settings.
  2. `useReadingProgress` tracks the scroll percentage and sends `PUT /api/reading-progress/{storyId}` with a debounce, and once more when the user leaves the page.
  3. Previous and next buttons use the chapter list already cached for the story.
  4. Counting views is handled by the backend when the chapter is fetched; the frontend does nothing extra.
- **Reader settings:** `ReaderSettingsDrawer` is a shadcn `Sheet` with font size, line height and reading theme (light, sepia, dark). The reading theme only styles the chapter area; the site theme is controlled separately by `ThemeProvider`.
- **Library:** `Tabs` for continue reading, followed stories, followed authors, and reading lists. Reading lists support create, rename, delete, add and remove items, and reorder.

### 5.5 Becoming an author (F7)

1. A reader opens `/become-author` and submits a pen name and bio.
2. The page then shows the request status:
   - `PENDING`: the request can be cancelled.
   - `APPROVED`: the user can open the Studio.
   - `REJECTED`: the admin's note is shown and a new request can be sent.
3. There are no notifications. The page refetches the status when it gains focus.
4. After approval, `AuthProvider` refreshes `/api/me`, and the Studio link appears.

### 5.6 Studio (F8–F10)

**Story management:** forms for title, description, cover, completion status, 1–3 genres (exactly one primary) and up to 10 tags. The forms use the shadcn `Form` components with React Hook Form; the rules are expressed as a Zod schema and validated before submit. The backend validates them again. Genre and tag pickers are built from `Popover` + `Command` (searchable multi-select).

**Chapter editor** (`ChapterEditorPage`):
1. Loads the chapter together with its `rowVersion`. If a newer Redis draft exists, the page offers to restore it.
2. `useAutosave` sends the editor content to `PUT .../draft` every `VITE_AUTOSAVE_INTERVAL_MS` milliseconds, but only when the content has changed. `AutosaveIndicator` shows "Saving…", "Saved" or "Offline".
3. **Save** sends the content with the `rowVersion`.
   - If the API returns **409**, `ConflictModal` (a shadcn `AlertDialog`) explains that the chapter was changed in another tab or session. The author can reload the latest version, or copy their own text before reloading.
   - Nothing is overwritten silently.
4. **Publish now** or **Schedule** (a `Popover` with `Calendar` plus a time input, converted to UTC) calls the corresponding endpoint and refreshes the chapter list.
5. `RevisionDrawer` (a shadcn `Sheet`) lists previous versions and can restore one, which the backend saves as a new version.

**Dashboard:** stat cards (`Card`: total views, followers, average rating), a views-per-day line chart (`ChartContainer` + Recharts), and a per-story table, all from `GET /api/studio/dashboard`.

### 5.7 Admin console (F11–F13)

Admin tables follow the shadcn Data Table pattern (TanStack Table for sorting, filtering and pagination; filters are kept in the URL). Destructive actions open an `AlertDialog`, and actions that need a reason open a `Dialog` with a form.

- **Users:** a filterable table (role, status, registration date). Actions are ban (reason required), unban, and create admin. The buttons are disabled for the admin's own account.
- **Author requests:** the queue of `PENDING` requests with approve and reject actions. If another admin has already reviewed the request, the API returns 409. The page then shows "already reviewed by another admin" and refreshes the queue.
- **Moderation:** search stories and hide (with a reason), unhide, or delete them; remove abusive reviews.
- **Catalog:** CRUD for genres; rename, merge or delete tags.
- **Dashboard:** charts for stories per genre, new users and views per month, users per role, and top authors.

---

## 6. Conventions

- Components and pages use `PascalCase.tsx`; hooks start with `use`; API functions are named after the action (`getStory`, `updateChapter`).
- Components do not call Axios directly; all requests go through `src/api/`.
- UI is built from `src/components/ui` (shadcn/ui) and Tailwind utility classes. Combine classes with `cn()`; use the theme variables (`bg-background`, `text-muted-foreground`, `border`, ...) instead of hard-coded colours so both themes work.
- Icons come from `lucide-react` only.
- Chapter HTML is always passed through `sanitizeHtml` before `dangerouslySetInnerHTML`, even though the backend already sanitizes it.
- API timestamps are UTC ISO strings and are displayed in Vietnam time with Day.js.
- UI text is Vietnamese; code, comments and this README are in English.
