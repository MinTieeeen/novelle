import type { Page } from '@playwright/test';
import { errors, publicProfileAuthor, publicProfileReader, readerMe } from './fixtures/data';
import { expect, test } from './fixtures/api';

/*
 * FE1 users (module-users §10): login / register popup, logout, /profile, /users/:username.
 * Every /api call is mocked. Both tabs of the popup stay mounted, so field queries are scoped to the
 * visible tabpanel.
 */

const dialog = (page: Page) => page.getByRole('dialog');
const panel = (page: Page) => dialog(page).getByRole('tabpanel');
const toast = (page: Page, text: string | RegExp) => page.locator('[data-sonner-toast]').filter({ hasText: text });

async function openLogin(page: Page) {
  await page.getByRole('banner').getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(dialog(page)).toBeVisible();
}

async function fillLogin(page: Page, login = 'lananh', password = 'matkhau2026') {
  await panel(page).getByLabel('Tên đăng nhập hoặc email').fill(login);
  await panel(page).getByLabel('Mật khẩu', { exact: true }).fill(password);
  await panel(page).getByRole('button', { name: 'Đăng nhập' }).click();
}

test.describe('popup', () => {
  test('opens from the header with focus on the first field, switches tabs, closes', async ({ page, api: _api }) => {
    await page.goto('/search');
    await openLogin(page);
    await expect(dialog(page).getByRole('tab', { name: 'Đăng nhập' })).toHaveAttribute('aria-selected', 'true');
    await expect(panel(page).getByLabel('Tên đăng nhập hoặc email')).toBeFocused();

    await dialog(page).getByRole('tab', { name: 'Đăng ký' }).click();
    await expect(panel(page).getByLabel('Tên hiển thị')).toBeVisible();

    await dialog(page).getByRole('button', { name: 'Đóng' }).click();
    await expect(dialog(page)).toBeHidden();
    await expect(page).toHaveURL('/search');
    // Focus goes back to the button that opened the popup.
    await expect(page.getByRole('banner').getByRole('button', { name: 'Đăng nhập' })).toBeFocused();

    await openLogin(page);
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toBeHidden();
  });

  test('both tabs have the same height, with or without errors', async ({ page, api: _api }) => {
    await page.goto('/');
    await openLogin(page);
    const height = async () => Math.round((await dialog(page).boundingBox())!.height);
    await page.waitForTimeout(300); // open animation
    const login = await height();
    await panel(page).getByRole('button', { name: 'Đăng nhập' }).click();
    expect(await height()).toBe(login);
    await dialog(page).getByRole('tab', { name: 'Đăng ký' }).click();
    expect(await height()).toBe(login);
    await panel(page).getByRole('button', { name: 'Tạo tài khoản' }).click();
    expect(await height()).toBe(login);
  });

  test('closing the error toast keeps the popup open', async ({ page, api: _api }) => {
    await page.goto('/');
    await openLogin(page);
    await panel(page).getByRole('button', { name: 'Đăng nhập' }).click();
    const t = toast(page, 'Nhập tên đăng nhập hoặc email.');
    await expect(t).toBeVisible();
    await t.getByRole('button', { name: 'Close toast' }).click();
    await expect(t).toHaveCount(0);
    await expect(dialog(page)).toBeVisible();
  });

  test('switching tabs dismisses the error toast of the other tab', async ({ page, api: _api }) => {
    await page.goto('/');
    await openLogin(page);
    await panel(page).getByRole('button', { name: 'Đăng nhập' }).click();
    await expect(toast(page, 'Nhập tên đăng nhập hoặc email.')).toBeVisible();
    await dialog(page).getByRole('tab', { name: 'Đăng ký' }).click();
    await expect(toast(page, 'Nhập tên đăng nhập hoặc email.')).toHaveCount(0);
  });
});

test.describe('login', () => {
  test('logs in from the header and stays on the page', async ({ page, api }) => {
    api.on('POST', '/auth/login', { body: readerMe });
    await page.goto('/search');
    await openLogin(page);
    await fillLogin(page, '  lananh  ');

    await expect(dialog(page)).toBeHidden();
    await expect(page).toHaveURL('/search');
    await expect(page.getByRole('button', { name: 'Tài khoản của Lan Anh' })).toBeVisible();
    await expect(toast(page, 'Đã đăng nhập. Chào Lan Anh quay lại.')).toBeVisible();
    expect(api.calls.find((c) => c.path === '/auth/login')?.body).toEqual({ login: 'lananh', password: 'matkhau2026' });
  });

  test('a guarded route sends the guest to /login and back after logging in', async ({ page, api }) => {
    api.on('POST', '/auth/login', { body: readerMe });
    await page.goto('/library');
    await expect(page).toHaveURL('/login?redirect=%2Flibrary');
    await expect(dialog(page)).toBeVisible();
    await fillLogin(page);
    await expect(page).toHaveURL('/library');
  });

  test('a redirect outside the app is ignored', async ({ page, api }) => {
    api.on('POST', '/auth/login', { body: readerMe });
    await page.goto('/login?redirect=%2F%2Fevil.com');
    await fillLogin(page);
    await expect(page).toHaveURL('/');
  });

  test('closing the popup on /login goes home', async ({ page, api: _api }) => {
    await page.goto('/login?redirect=%2Flibrary');
    await dialog(page).getByRole('button', { name: 'Đóng' }).click();
    await expect(page).toHaveURL('/');
    await expect(dialog(page)).toBeHidden();
  });

  test('a logged-in user opening /login goes to the redirect', async ({ page, api }) => {
    api.on('GET', '/me', { body: readerMe });
    await page.goto('/login?redirect=%2Fprofile');
    await expect(page).toHaveURL('/profile');
  });

  test('validation errors are toasted one at a time, in field order', async ({ page, api }) => {
    await page.goto('/');
    await openLogin(page);
    await panel(page).getByRole('button', { name: 'Đăng nhập' }).click();
    await expect(toast(page, 'Nhập tên đăng nhập hoặc email.')).toBeVisible();
    await expect(panel(page).getByLabel('Tên đăng nhập hoặc email')).toBeFocused();
    await expect(panel(page).getByLabel('Tên đăng nhập hoặc email')).toHaveAttribute('aria-invalid', 'true');
    await expect(panel(page).getByLabel('Mật khẩu', { exact: true })).toHaveAttribute('aria-invalid', 'true');

    await panel(page).getByLabel('Tên đăng nhập hoặc email').fill('lananh');
    await panel(page).getByRole('button', { name: 'Đăng nhập' }).click();
    await expect(toast(page, 'Nhập mật khẩu.')).toBeVisible();
    await expect(panel(page).getByLabel('Mật khẩu', { exact: true })).toBeFocused();
    expect(api.calls.some((c) => c.path === '/auth/login')).toBe(false);
  });

  test('wrong credentials: toast, both fields red, focus on the password', async ({ page, api }) => {
    api.on('POST', '/auth/login', { status: 401, body: errors.invalidCredentials });
    await page.goto('/');
    await openLogin(page);
    await fillLogin(page, 'lananh', 'saimatkhau');
    await expect(toast(page, 'Tên đăng nhập hoặc mật khẩu không đúng. Kiểm tra lại rồi thử lần nữa.')).toBeVisible();
    await expect(panel(page).getByLabel('Mật khẩu', { exact: true })).toBeFocused();
    await expect(panel(page).getByLabel('Tên đăng nhập hoặc email')).toHaveAttribute('aria-invalid', 'true');
    await expect(dialog(page)).toBeVisible();
  });

  test('a banned account gets a toast with the reason', async ({ page, api }) => {
    api.on('POST', '/auth/login', { status: 403, body: errors.banned });
    await page.goto('/');
    await openLogin(page);
    await fillLogin(page);
    const t = toast(page, 'Tài khoản đã bị khoá');
    await expect(t).toBeVisible();
    await expect(t).toContainText('Lý do: Spam bình luận. Liên hệ quản trị viên nếu đây là nhầm lẫn.');
    await expect(dialog(page)).toBeVisible();
  });

  test('429 locks the button with a countdown', async ({ page, api }) => {
    api.on('POST', '/auth/login', { status: 429, body: errors.rateLimited });
    await page.goto('/');
    await openLogin(page);
    await fillLogin(page);
    await expect(toast(page, 'Bạn thao tác quá nhanh. Thử lại sau 42 giây.')).toBeVisible();
    await expect(panel(page).getByRole('button', { name: /Thử lại sau 4\d giây/ })).toBeDisabled();
  });

  test('the button shows the pending label while the request runs', async ({ page, api }) => {
    api.on('POST', '/auth/login', { body: readerMe, delay: 800 });
    await page.goto('/');
    await openLogin(page);
    await fillLogin(page);
    await expect(panel(page).getByRole('button', { name: 'Đang đăng nhập…' })).toBeDisabled();
    await expect(dialog(page)).toBeHidden();
  });
});

test.describe('register', () => {
  async function openRegister(page: Page) {
    await page.goto('/register');
    await expect(dialog(page).getByRole('tab', { name: 'Đăng ký' })).toHaveAttribute('aria-selected', 'true');
  }

  async function fillRegister(page: Page, values: Partial<Record<string, string>> = {}) {
    const v = {
      'Tên hiển thị': 'Lan Anh',
      'Tên đăng nhập': 'lananh',
      Email: 'lananh@gmail.com',
      'Mật khẩu': 'matkhau2026',
      'Nhập lại mật khẩu': 'matkhau2026',
      ...values,
    };
    for (const [label, value] of Object.entries(v)) {
      await panel(page).getByLabel(label, { exact: label === 'Mật khẩu' }).fill(value ?? '');
    }
    await panel(page).getByRole('button', { name: 'Tạo tài khoản' }).click();
  }

  test('creates the account (no confirmPassword sent, username lowercased)', async ({ page, api }) => {
    api.on('POST', '/auth/register', { status: 201, body: readerMe });
    await openRegister(page);
    await panel(page).getByLabel('Tên đăng nhập').fill(' LanAnh ');
    await panel(page).getByLabel('Tên đăng nhập').blur();
    await expect(panel(page).getByLabel('Tên đăng nhập')).toHaveValue('lananh');
    await fillRegister(page, { 'Tên đăng nhập': 'lananh' });

    await expect(page).toHaveURL('/');
    await expect(toast(page, 'Đã tạo tài khoản. Chào mừng Lan Anh đến Novelle.')).toBeVisible();
    expect(api.calls.find((c) => c.path === '/auth/register')?.body).toEqual({
      displayName: 'Lan Anh',
      username: 'lananh',
      email: 'lananh@gmail.com',
      password: 'matkhau2026',
    });
  });

  test('field errors are checked in screen order', async ({ page, api: _api }) => {
    await openRegister(page);
    await fillRegister(page, { 'Tên hiển thị': '', 'Tên đăng nhập': 'Lan Anh', Email: 'x@gmail' });
    await expect(toast(page, 'Nhập tên hiển thị (tối đa 100 ký tự).')).toBeVisible();
    await expect(panel(page).getByLabel('Tên hiển thị')).toBeFocused();

    await fillRegister(page, { 'Tên đăng nhập': 'Lan Anh', Email: 'x@gmail' });
    await expect(toast(page, 'Chỉ dùng chữ thường không dấu, số và dấu gạch dưới, không có khoảng trắng.')).toBeVisible();

    await fillRegister(page, { Email: 'x@gmail' });
    await expect(toast(page, 'Email chưa đúng định dạng, ví dụ: ten@gmail.com.')).toBeVisible();

    await fillRegister(page, { 'Nhập lại mật khẩu': 'khac2026x' });
    await expect(toast(page, 'Mật khẩu cần ít nhất 8 ký tự, và hai ô mật khẩu phải giống nhau.')).toBeVisible();
    await expect(panel(page).getByLabel('Nhập lại mật khẩu')).toBeFocused();
  });

  for (const [code, label, message] of [
    ['usernameTaken', 'Tên đăng nhập', 'Tên đăng nhập này đã có người dùng. Chọn tên khác.'],
    ['emailTaken', 'Email', 'Email này đã được dùng cho một tài khoản khác.'],
  ] as const) {
    test(`409 ${errors[code].code} → toast and focus on ${label}`, async ({ page, api }) => {
      api.on('POST', '/auth/register', { status: 409, body: errors[code] });
      await openRegister(page);
      await fillRegister(page);
      await expect(toast(page, message)).toBeVisible();
      await expect(panel(page).getByLabel(label)).toBeFocused();
      await expect(panel(page).getByLabel(label)).toHaveAttribute('aria-invalid', 'true');
    });
  }

  test('VALIDATION_FAILED from the backend lands on the field in Vietnamese', async ({ page, api }) => {
    api.on('POST', '/auth/register', {
      status: 400,
      body: {
        status: 400,
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed.',
        details: [{ field: 'email', message: 'must be a well-formed email address' }],
      },
    });
    await openRegister(page);
    await fillRegister(page);
    await expect(toast(page, 'Email chưa đúng định dạng, ví dụ: ten@gmail.com.')).toBeVisible();
    await expect(page.getByText('must be a well-formed email address')).toHaveCount(0);
  });
});

test.describe('session', () => {
  test('logout clears the user and personal data', async ({ page, api }) => {
    api.on('GET', '/me', { body: readerMe });
    api.on('POST', '/auth/logout', { status: 204 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Tài khoản của Lan Anh' }).click();
    await page.getByRole('menuitem', { name: 'Đăng xuất' }).click();
    await expect(toast(page, 'Đã đăng xuất')).toBeVisible();
    await expect(page.getByRole('banner').getByRole('button', { name: 'Đăng nhập' })).toBeVisible();
    expect(api.calls.some((c) => c.method === 'POST' && c.path === '/auth/logout')).toBe(true);
    // In-app navigation to a guarded page needs a login again: no user left in the cache.
    await page.evaluate(() => {
      window.history.pushState({}, '', '/profile');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await expect(page).toHaveURL('/login?redirect=%2Fprofile');
  });

  test('ACCOUNT_BANNED in the middle of a session → home + toast, logged out', async ({ page, api }) => {
    api.on('GET', '/me', { body: readerMe });
    api.on('GET', '/users/someone', { status: 403, body: errors.banned });
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Tài khoản của Lan Anh' })).toBeVisible();
    // In-app navigation keeps the logged-in session in memory, as a click on a link would.
    await page.evaluate(() => {
      window.history.pushState({}, '', '/users/someone');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await expect(page).toHaveURL('/');
    await expect(toast(page, 'Tài khoản đã bị khoá')).toBeVisible();
    await expect(page.getByRole('banner').getByRole('button', { name: 'Đăng nhập' })).toBeVisible();
  });
});

test.describe('/profile', () => {
  test.beforeEach(async ({ api }) => {
    api.on('GET', '/me', { body: readerMe });
  });

  test('saves the profile with the rowVersion and updates the header', async ({ page, api }) => {
    const saved = { ...readerMe, displayName: 'Lan Anh Nguyễn', bio: 'Mê truyện', rowVersion: 'AAAAAAAAB9I=' };
    api.on('PATCH', '/me', { body: saved });
    await page.goto('/profile');
    await expect(page.getByRole('button', { name: 'Lưu thay đổi' })).toBeDisabled();
    await page.getByLabel('Tên hiển thị').fill('Lan Anh Nguyễn');
    await page.getByLabel('Giới thiệu').fill('Mê truyện');
    await expect(page.getByText('9/1.000')).toBeVisible();
    await page.getByRole('button', { name: 'Lưu thay đổi' }).click();

    await expect(toast(page, 'Đã lưu hồ sơ')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tài khoản của Lan Anh Nguyễn' })).toBeVisible();
    expect(api.calls.find((c) => c.method === 'PATCH')?.body).toEqual({
      displayName: 'Lan Anh Nguyễn',
      bio: 'Mê truyện',
      rowVersion: readerMe.rowVersion,
    });
  });

  test('STALE_DATA shows an alert and "Tải lại" reloads /me', async ({ page, api }) => {
    api.on('PATCH', '/me', { status: 409, body: errors.staleData });
    await page.goto('/profile');
    await page.getByLabel('Tên hiển thị').fill('Tên khác');
    await page.getByRole('button', { name: 'Lưu thay đổi' }).click();
    await expect(page.getByText('Hồ sơ đã được cập nhật ở nơi khác')).toBeVisible();

    api.on('GET', '/me', { body: { ...readerMe, displayName: 'Lan Anh (máy khác)' } });
    await page.getByRole('button', { name: 'Tải lại' }).click();
    await expect(page.getByText('Hồ sơ đã được cập nhật ở nơi khác')).toHaveCount(0);
    await expect(page.getByLabel('Tên hiển thị')).toHaveValue('Lan Anh (máy khác)');
  });

  test('change password: WRONG_PASSWORD under the field, then success', async ({ page, api }) => {
    api.on('PUT', '/me/password', { status: 400, body: errors.wrongPassword });
    await page.goto('/profile?tab=password');
    await page.getByLabel('Mật khẩu hiện tại').fill('saimatkhau');
    await page.getByLabel('Mật khẩu mới', { exact: true }).fill('moi12345678');
    await page.getByLabel('Nhập lại mật khẩu mới').fill('moi12345678');
    await page.getByRole('button', { name: 'Đổi mật khẩu' }).click();
    await expect(page.getByText('Mật khẩu hiện tại chưa đúng.')).toBeVisible();

    api.on('PUT', '/me/password', { status: 204 });
    await page.getByLabel('Mật khẩu hiện tại').fill('matkhau2026');
    await page.getByRole('button', { name: 'Đổi mật khẩu' }).click();
    await expect(toast(page, 'Đã đổi mật khẩu')).toBeVisible();
    await expect(page.getByLabel('Mật khẩu hiện tại')).toHaveValue('');
    expect(api.calls.filter((c) => c.method === 'PUT').at(-1)?.body).toEqual({
      currentPassword: 'matkhau2026',
      newPassword: 'moi12345678',
    });
  });

  test('the tab is kept in the URL', async ({ page, api: _api }) => {
    await page.goto('/profile');
    await page.getByRole('tab', { name: 'Mật khẩu' }).click();
    await expect(page).toHaveURL('/profile?tab=password');
    await page.reload();
    await expect(page.getByRole('tab', { name: 'Mật khẩu' })).toHaveAttribute('aria-selected', 'true');
  });
});

test.describe('/users/:username', () => {
  test('reader profile', async ({ page, api }) => {
    api.on('GET', '/users/lananh', { body: publicProfileReader });
    await page.goto('/users/lananh');
    await expect(page.getByRole('heading', { name: 'Lan Anh' })).toBeVisible();
    await expect(page.getByText('Mê truyện kiếm hiệp và trinh thám.')).toBeVisible();
    await expect(page.getByText('Người đọc')).toBeVisible();
    await expect(page.getByRole('link', { name: /Xem trang tác giả/ })).toHaveCount(0);
  });

  test('author profile links to the author page', async ({ page, api }) => {
    api.on('GET', '/users/moclan', { body: publicProfileAuthor });
    await page.goto('/users/moclan');
    await expect(page.getByRole('img', { name: 'Đã xác minh' })).toBeVisible();
    await expect(page.getByText('1.280')).toBeVisible();
    await expect(page.getByRole('link', { name: /Xem trang tác giả/ })).toHaveAttribute('href', '/authors/12');
  });

  test('unknown user → not found state', async ({ page, api }) => {
    api.on('GET', '/users/khongco', { status: 404, body: errors.userNotFound });
    await page.goto('/users/khongco');
    await expect(page.getByRole('heading', { name: 'Không tìm thấy người dùng này' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Về trang chủ' })).toBeVisible();
  });
});
