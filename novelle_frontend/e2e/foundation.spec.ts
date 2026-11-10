import { authorMe, readerMe, adminMe } from './fixtures/data';
import { expect, test } from './fixtures/api';

/* FE0 foundation: shell, guards, theme. Every API call is mocked. */

test('guest sees login and register in the header', async ({ page, api: _api }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Đăng ký' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Đăng nhập' })).toBeVisible();
});

test('guest is sent to /login with a redirect from a guarded route', async ({ page, api: _api }) => {
  await page.goto('/studio');
  await expect(page).toHaveURL(/\/login\?redirect=%2Fstudio/);
});

test('reader opening the studio gets the 403 page', async ({ page, api }) => {
  api.on('GET', '/me', { body: readerMe });
  await page.goto('/studio');
  await expect(page.getByRole('heading', { name: 'Bạn không có quyền xem trang này' })).toBeVisible();
});

test('author sees the Studio link and the studio sidebar @desktop-only', async ({ page, api }) => {
  api.on('GET', '/me', { body: authorMe });
  await page.goto('/');
  await page.getByRole('banner').getByRole('link', { name: 'Studio', exact: true }).click();
  await expect(page).toHaveURL('/studio');
  await expect(page.getByRole('navigation', { name: 'Menu Studio' }).getByRole('link', { name: 'Truyện của tôi' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('/admin redirects to the dashboard for an admin @desktop-only', async ({ page, api }) => {
  api.on('GET', '/me', { body: adminMe });
  await page.goto('/admin');
  await expect(page).toHaveURL('/admin/dashboard');
});

test('site theme follows the saved choice', async ({ page, api: _api }) => {
  await page.addInitScript(() => localStorage.setItem('novelle-theme', 'dark'));
  await page.goto('/dev/design-system');
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.getByRole('button', { name: /Đổi sang theme sáng/ }).click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
});

test('unknown route shows the 404 page', async ({ page, api: _api }) => {
  await page.goto('/khong-ton-tai');
  await expect(page.getByRole('heading', { name: 'Không tìm thấy trang này' })).toBeVisible();
});
