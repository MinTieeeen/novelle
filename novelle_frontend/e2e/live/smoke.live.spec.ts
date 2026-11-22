import { expect, test } from '@playwright/test';

/*
 * Live smoke tests against the real backend (:8080, RDS + Redis). Tagged @live, run only with
 * `npm run test:e2e:live` when the user asks. Read-only, except logging in with the test account
 * from .env.e2e.local (E2E_READER_USER / E2E_READER_PASSWORD), which updates LastLoginAt and creates a
 * Redis session; the test logs out at the end so the session key is removed.
 */

test('home and the CSRF endpoint answer @live', async ({ page, request }) => {
  const csrf = await request.get('/api/auth/csrf');
  expect(csrf.ok()).toBeTruthy();
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Novelle — Trang chủ' })).toBeVisible();
});

test('reader can log in and out @live', async ({ page }) => {
  const user = process.env.E2E_READER_USER;
  const password = process.env.E2E_READER_PASSWORD;
  test.skip(!user || !password, 'Set E2E_READER_USER and E2E_READER_PASSWORD in .env.e2e.local');

  // Login goes through the UI once the users module (FE1) is built; until then, the API.
  const login = await page.request.post('/api/auth/login', {
    data: { login: user, password },
    headers: { 'X-XSRF-TOKEN': await csrfToken(page) },
  });
  expect(login.status()).toBe(200);
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Tài khoản của/ })).toBeVisible();

  const logout = await page.request.post('/api/auth/logout', { headers: { 'X-XSRF-TOKEN': await csrfToken(page) } });
  expect(logout.status()).toBe(204);
});

async function csrfToken(page: import('@playwright/test').Page) {
  await page.request.get('/api/auth/csrf');
  const cookies = await page.context().cookies();
  return cookies.find((c) => c.name === 'XSRF-TOKEN')?.value ?? '';
}
