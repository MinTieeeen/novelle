import { isApiError } from '@/api/http';
import type { FieldError } from '@/types/api';

/**
 * Vietnamese messages for the error codes the UI shows directly. Codes missing here fall back to a
 * generic sentence; a page can always pass its own message for a code it handles specifically.
 */
const MESSAGES: Record<string, string> = {
  NETWORK_ERROR: 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.',
  INTERNAL_ERROR: 'Máy chủ đang gặp lỗi. Thử lại sau ít phút.',
  VALIDATION_FAILED: 'Thông tin chưa hợp lệ. Kiểm tra các ô được đánh dấu.',
  UNAUTHENTICATED: 'Bạn cần đăng nhập để tiếp tục.',
  FORBIDDEN: 'Bạn không có quyền làm việc này.',
  CSRF_INVALID: 'Phiên làm việc đã đổi. Tải lại trang rồi thử lại.',
  NOT_FOUND: 'Không tìm thấy nội dung này.',
  RATE_LIMITED: 'Bạn thao tác quá nhanh. Thử lại sau ít phút.',
  STALE_DATA: 'Dữ liệu đã được sửa ở nơi khác. Tải lại bản mới nhất rồi thử lại.',
  ALREADY_PROCESSED: 'Mục này đã được xử lý.',
  INVALID_CREDENTIALS: 'Tên đăng nhập hoặc mật khẩu không đúng. Kiểm tra lại rồi thử lần nữa.',
  ACCOUNT_BANNED: 'Tài khoản đã bị khoá.',
  USERNAME_TAKEN: 'Tên đăng nhập này đã có người dùng. Chọn tên khác.',
  EMAIL_TAKEN: 'Email này đã được dùng cho một tài khoản khác.',
  PEN_NAME_TAKEN: 'Bút danh này đã có người dùng. Chọn bút danh khác.',
  WRONG_PASSWORD: 'Mật khẩu hiện tại chưa đúng.',
  USER_NOT_FOUND: 'Không tìm thấy người dùng này.',
};

/** User-facing Vietnamese message for any error thrown by src/api/. */
export function errorMessage(error: unknown, fallback = 'Có lỗi xảy ra. Thử lại sau.'): string {
  if (isApiError(error)) return MESSAGES[error.code] ?? fallback;
  return fallback;
}

/** Field errors of a VALIDATION_FAILED response, to show under the matching form fields. */
export function fieldErrors(error: unknown): FieldError[] {
  if (isApiError(error) && Array.isArray(error.details)) return error.details;
  return [];
}

export function hasCode(error: unknown, ...codes: string[]): boolean {
  return isApiError(error) && codes.includes(error.code);
}

function detail(error: unknown, key: string): unknown {
  if (!isApiError(error) || !error.details || Array.isArray(error.details)) return undefined;
  return (error.details as Record<string, unknown>)[key];
}

/** `details.banReason` of ACCOUNT_BANNED, when the admin gave one. */
export function banReason(error: unknown): string | null {
  const value = detail(error, 'banReason');
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** `details.retryAfterSeconds` of RATE_LIMITED (at least 1), or null. */
export function retryAfterSeconds(error: unknown): number | null {
  const value = Number(detail(error, 'retryAfterSeconds'));
  return Number.isFinite(value) && value > 0 ? Math.ceil(value) : null;
}

/** Toast description for a banned account: reason (if any) + what to do. */
export function bannedDescription(error: unknown): string {
  const reason = banReason(error);
  const hint = 'Liên hệ quản trị viên nếu đây là nhầm lẫn.';
  return reason ? `Lý do: ${reason}. ${hint}` : hint;
}

/** "Bạn thao tác quá nhanh. Thử lại sau 42 giây." */
export function rateLimitedMessage(error: unknown): string {
  const seconds = retryAfterSeconds(error);
  return seconds ? `Bạn thao tác quá nhanh. Thử lại sau ${seconds} giây.` : MESSAGES.RATE_LIMITED;
}

/** True when http.ts already showed this error (401, ban, 403 FORBIDDEN, 429, 5xx, no network): no second toast. */
export function handledGlobally(error: unknown): boolean {
  if (!isApiError(error)) return false;
  return error.status === 401 || error.status === 429 || error.status >= 500 || error.status === 0 || ['ACCOUNT_BANNED', 'FORBIDDEN'].includes(error.code);
}
