import { expect, test } from './fixtures/api';

/* FE1 users: login / register popup. Full suite comes in the FE1 test step; regressions first. */

test('closing the error toast keeps the login popup open', async ({ page, api: _api }) => {
  await page.goto('/');
  await page.getByRole('banner').getByRole('button', { name: 'Đăng nhập' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('tabpanel').getByRole('button', { name: 'Đăng nhập' }).click();

  const toast = page.locator('[data-sonner-toast]').filter({ hasText: 'Nhập tên đăng nhập hoặc email.' });
  await expect(toast).toBeVisible();
  await toast.getByRole('button', { name: 'Close toast' }).click();

  await expect(toast).toHaveCount(0);
  await expect(dialog).toBeVisible();
});
