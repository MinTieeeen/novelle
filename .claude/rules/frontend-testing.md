---
paths:
  - "novelle_frontend/src/**/*.test.ts"
  - "novelle_frontend/src/**/*.test.tsx"
  - "novelle_frontend/e2e/**"
  - "novelle_frontend/playwright.config.ts"
  - "novelle_frontend/scripts/**"
---

# Frontend testing and browser verification

Run everything from `novelle_frontend/`. `npm run check` = `tsc -b` + ESLint + Vitest.

## Unit and component tests (Vitest + React Testing Library)

- Files next to the code: `X.test.ts(x)`; setup in `src/test/setup.ts` (jest-dom, matchMedia stub).
- Test pure helpers (format, errors, Zod schemas with the backend limits), hooks (`useAutosave` with fake
  timers, `useReadingProgress` debounce) and components with logic (forms, ConflictModal, filters).
- Mock the API layer, not Axios: `vi.mock('@/api/stories', () => ({ getStory: vi.fn() }))`. Wrap components in
  a fresh `QueryClient` (retry off) and `MemoryRouter`.
- Query by role and accessible name (`getByRole('button', { name: 'Đăng chương' })`); `userEvent` for input.

## End-to-end tests (Playwright, mocked API)

- Config `playwright.config.ts`: Edge (`channel: msedge`, already installed; `PW_CHANNEL=chromium` after
  `npx playwright install chromium`), dev server reused or started, locale `vi-VN`, timezone
  `Asia/Ho_Chi_Minh`, 3 workers (more time out on the cold Vite server).
- Projects: `desktop` (1440×900) and `mobile` (Pixel 7) run every spec except `@live`; tag `@desktop-only` for
  Studio/Admin flows. `npm run test:e2e` runs both.
- Import `test`/`expect` from `e2e/fixtures/api.ts`. The `api` fixture answers every `/api/*` request from
  mocks: guest `/me` and `/auth/csrf` by default; `api.on('GET', '/stories/abc', { body })`,
  `api.error('PUT', '/studio/chapters/5', 409, 'STALE_DATA')`, `{ delay }` for loading states, `api.calls` to
  assert request bodies. **Unmocked calls fail the test**, so no spec can reach RDS by accident.
- Fixtures are typed with `src/types` (`e2e/fixtures/data.ts`, one file per domain). Keep them realistic
  (Vietnamese titles, the shapes of the backend DTOs).
- One spec per module (`e2e/<module>.spec.ts`), one `test` per state from the plan: success, empty, each
  error code, guard redirect, role-specific UI, responsive behaviour (mobile Sheet/menu).
- Use roles and names, `toHaveURL`, `toBeVisible`; no `waitForTimeout`; no CSS selectors unless there is
  no accessible handle (then add one to the markup).

## Live tests (real backend)

- Specs `e2e/live/*.live.spec.ts`, tagged `@live`, project `live`: `npm run test:e2e:live`. **Run only when the
  user asks** (they hit the shared RDS and Redis).
- Credentials from `.env.e2e.local` (template `.env.e2e.example`, gitignored). Never print or commit them,
  never use the demo password of the seed.
- Allowed by default: public GET pages, login/logout of the test accounts. Any other write needs the user's
  approval for that run, must clean up after itself (delete what it created, undo follows/ratings) and the
  report must prove nothing was left.

## Browser verification loop (after every component and every page)

1. Make sure the dev server runs (`npm run dev`, port 5173; a background Bash task is fine).
2. **Integrated browser first** (`mcp__integrated-browser-mcp__*`): call `browser_status`; if reachable, open
   the route with `browser_navigate` (or `browser_tab_open`), check structure with `browser_snapshot`
   (`interactiveOnly` for controls), read values with `browser_eval`, exercise interactions with
   `browser_click`/`browser_type`/`browser_press_key`, read `browser_console` for errors, emulate
   `browser_emulate { width: 390, height: 844, mobile: true }`, then
   `browser_screenshot`. Mock data in this browser: use a `/dev/*` preview page, or the real backend for GETs.
3. **Fallback when it is not reachable**: `npm run shot -- <route> [--width 390] [--role
   reader|author|admin|guest] [--mock e2e/mocks/<file>.json] [--full]` → `tmp/shots/<name>.png`, then Read the
   PNG. The script prints page errors and console errors: treat each as a bug. In Git Bash pass the route
   without the leading slash (`studio`) or rely on the script's MSYS path fix.
4. Compare with the board side by side (Read the board HTML, or ask the user for a board screenshot when the
   layout is unclear): structure and order, spacing, type sizes, colours/tokens, copy, icons, states.
   Check widths 1440 and 390 (Studio/Admin: 1440 and 1024).
5. Fix every difference that is not a documented deliberate deviation, re-shoot, and list in the phase
   report: route × width checked, what was fixed, what still differs and why.
6. Turn each interaction you checked by hand into a Playwright case when the module reaches the test step.

## After the run

- Report Vitest and Playwright totals per project, failures with cause and fix, screenshots checked.
- Delete nothing the user may want to inspect: reports stay in `tmp/playwright/report` (gitignored).
- Stop background dev servers you started when the user is done (by task id or PID).
