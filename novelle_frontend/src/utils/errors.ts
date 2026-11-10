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
  INVALID_CREDENTIALS: 'Tên đăng nhập, email hoặc mật khẩu chưa đúng.',
  ACCOUNT_BANNED: 'Tài khoản này đã bị khoá.',
  USERNAME_TAKEN: 'Tên đăng nhập này đã có người dùng. Chọn tên khác.',
  EMAIL_TAKEN: 'Email này đã được dùng cho một tài khoản khác.',
  PEN_NAME_TAKEN: 'Bút danh này đã có người dùng. Chọn bút danh khác.',
  WRONG_PASSWORD: 'Mật khẩu hiện tại chưa đúng.',
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
