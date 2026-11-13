import { authorMe, readerMe, adminMe } from './fixtures/data';
import { expect, test } from './fixtures/api';

/* FE0 foundation: shell, guards, theme. Every API call is mocked. */

test('guest sees the login (and, from sm, register) buttons in the header', async ({ page, api: _api, isMobile }) => {
  await page.goto('/');
  const header = page.getByRole('banner');
  await expect(header.getByRole('button', { name: 'Đăng nhập' })).toBeVisible();
  // Below sm only "Đăng nhập" fits; the popup has the Đăng ký tab.
  if (isMobile) await expect(header.getByRole('button', { name: 'Đăng ký' })).toBeHidden();
  else await expect(header.getByRole('button', { name: 'Đăng ký' })).toBeVisible();
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

test('site stays light when the OS prefers dark', async ({ page, api: _api }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/dev/design-system');
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  // --background (surface) of the light theme: #F7F7FA
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(247, 247, 250)');
});

test('mobile menu opens from the header and closes after navigating', async ({ page, api: _api, isMobile }) => {
  test.skip(!isMobile, 'The header menu button only exists below md');
  await page.goto('/');
  await page.getByRole('button', { name: 'Mở menu' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('link', { name: 'Thể loại' })).toBeVisible();
  await sheet.getByRole('link', { name: 'Thể loại' }).click();
  await expect(page).toHaveURL('/search');
  await expect(sheet).toBeHidden();
  // Radix returns focus to the trigger: needs the ref to reach Button (broken on React 18).
  await expect(page.getByRole('button', { name: 'Mở menu' })).toBeFocused();
});

test('unknown route shows the 404 page', async ({ page, api: _api }) => {
  await page.goto('/khong-ton-tai');
  await expect(page.getByRole('heading', { name: 'Không tìm thấy trang này' })).toBeVisible();
});
