import { describe, expect, it } from 'vitest';
import { ApiError } from '@/api/http';
import {
  banReason,
  bannedDescription,
  errorMessage,
  fieldErrors,
  hasCode,
  rateLimitedMessage,
  retryAfterSeconds,
} from '@/utils/errors';

const err = (code: string, status: number, details?: ApiError['details']) =>
  new ApiError({ status, code, message: 'English message from the backend', details });

describe('errors', () => {
  it('maps codes to Vietnamese and never shows the backend message', () => {
    expect(errorMessage(err('INVALID_CREDENTIALS', 401))).toBe(
      'Tên đăng nhập hoặc mật khẩu không đúng. Kiểm tra lại rồi thử lần nữa.',
    );
    expect(errorMessage(err('SOMETHING_NEW', 400), 'Mặc định')).toBe('Mặc định');
    expect(errorMessage(new Error('boom'))).toBe('Có lỗi xảy ra. Thử lại sau.');
  });

  it('reads field errors only from a list', () => {
    const fields = [{ field: 'username', message: 'bad' }];
    expect(fieldErrors(err('VALIDATION_FAILED', 400, fields))).toEqual(fields);
    expect(fieldErrors(err('ACCOUNT_BANNED', 403, { banReason: 'spam' }))).toEqual([]);
  });

  it('reads banReason and builds the toast description', () => {
    const banned = err('ACCOUNT_BANNED', 403, { banReason: ' Spam bình luận ' });
    expect(banReason(banned)).toBe('Spam bình luận');
    expect(bannedDescription(banned)).toBe('Lý do: Spam bình luận. Liên hệ quản trị viên nếu đây là nhầm lẫn.');
    expect(banReason(err('ACCOUNT_BANNED', 403))).toBeNull();
    expect(bannedDescription(err('ACCOUNT_BANNED', 403))).toBe('Liên hệ quản trị viên nếu đây là nhầm lẫn.');
  });

  it('reads retryAfterSeconds', () => {
    const limited = err('RATE_LIMITED', 429, { retryAfterSeconds: 42 });
    expect(retryAfterSeconds(limited)).toBe(42);
    expect(rateLimitedMessage(limited)).toBe('Bạn thao tác quá nhanh. Thử lại sau 42 giây.');
    expect(retryAfterSeconds(err('RATE_LIMITED', 429))).toBeNull();
    expect(rateLimitedMessage(err('RATE_LIMITED', 429))).toBe('Bạn thao tác quá nhanh. Thử lại sau ít phút.');
  });

  it('hasCode', () => {
    expect(hasCode(err('EMAIL_TAKEN', 409), 'USERNAME_TAKEN', 'EMAIL_TAKEN')).toBe(true);
    expect(hasCode(new Error('x'), 'EMAIL_TAKEN')).toBe(false);
  });
});
