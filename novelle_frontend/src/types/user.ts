import { z } from 'zod';

export type Role = 'READER' | 'AUTHOR' | 'ADMIN';
export type UserStatus = 'ACTIVE' | 'BANNED';

export const ROLE_LABEL: Record<Role, string> = {
  READER: 'Người đọc',
  AUTHOR: 'Tác giả',
  ADMIN: 'Quản trị viên',
};

/** GET /api/me, POST /api/auth/login, POST /api/auth/register (com.novelle.dto.MeResponse). */
export interface Me {
  userId: number;
  username: string;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
  bio?: string | null;
  role: Role;
  status: UserStatus;
  /** UTC ISO timestamp */
  createdAt: string;
  lastLoginAt?: string | null;
  /** Base64 ROWVERSION, sent back with PATCH /api/me */
  rowVersion: string;
  /** Present only when role is AUTHOR */
  author?: {
    penName: string;
    bio?: string | null;
    isVerified: boolean;
    followerCount: number;
  } | null;
}

/** GET /api/users/{username} (com.novelle.dto.PublicProfileResponse): no email, status or login data. */
export interface PublicProfile {
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  bio?: string | null;
  role: Role;
  createdAt: string;
  author?: {
    authorId: number;
    penName: string;
    bio?: string | null;
    isVerified: boolean;
    followerCount: number;
  } | null;
}

/** PATCH /api/me. A missing field is unchanged; bio "" clears it. */
export interface UpdateProfileBody {
  displayName?: string;
  bio?: string;
  rowVersion: string;
}

/** PUT /api/me/password (204). */
export interface ChangePasswordBody {
  currentPassword: string;
  newPassword: string;
}

/* ------------------------------------------------------------------------------------------------
 * Form schemas. Limits copy the backend DTOs (LoginRequest, RegisterRequest, UpdateProfileRequest,
 * ChangePasswordRequest, PasswordRules); messages follow the AuthModal board.
 * ---------------------------------------------------------------------------------------------- */

export const USERNAME_PATTERN = /^[a-z0-9_]{3,50}$/;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;
export const BIO_MAX = 1000;
export const DISPLAY_NAME_MAX = 100;

export const MSG = {
  usernameHint: '3–50 ký tự: chữ thường không dấu, số và dấu gạch dưới.',
  usernameInvalid: 'Chỉ dùng chữ thường không dấu, số và dấu gạch dưới, không có khoảng trắng.',
  emailInvalid: 'Email chưa đúng định dạng, ví dụ: ten@gmail.com.',
  passwordHint: 'Ít nhất 8 ký tự, tối đa 72 ký tự.',
  passwordInvalid: 'Mật khẩu cần ít nhất 8 ký tự, và hai ô mật khẩu phải giống nhau.',
  passwordTooLong: 'Mật khẩu dài quá 72 ký tự (chữ có dấu tính nhiều hơn một ký tự).',
  displayName: 'Nhập tên hiển thị (tối đa 100 ký tự).',
  bio: 'Giới thiệu tối đa 1.000 ký tự.',
  loginRequired: 'Nhập tên đăng nhập hoặc email.',
  passwordRequired: 'Nhập mật khẩu.',
  currentPasswordRequired: 'Nhập mật khẩu hiện tại.',
} as const;

/** BCrypt reads at most 72 bytes: the backend rejects longer UTF-8 passwords (PasswordRules). */
export function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).length;
}

/** "  Lan_Anh " → "lan_anh": applied when the username field loses focus. */
export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

const newPassword = z
  .string()
  .min(PASSWORD_MIN, MSG.passwordInvalid)
  .max(PASSWORD_MAX, MSG.passwordTooLong)
  .refine((v) => utf8Bytes(v) <= PASSWORD_MAX, MSG.passwordTooLong);

const displayName = z.string().trim().min(1, MSG.displayName).max(DISPLAY_NAME_MAX, MSG.displayName);

export const loginSchema = z.object({
  login: z.string().trim().min(1, MSG.loginRequired).max(255, MSG.loginRequired),
  password: z.string().min(1, MSG.passwordRequired).max(PASSWORD_MAX, MSG.passwordTooLong),
});
export type LoginValues = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
    displayName,
    username: z.string().regex(USERNAME_PATTERN, MSG.usernameInvalid),
    email: z.string().trim().max(255, MSG.emailInvalid).pipe(z.email(MSG.emailInvalid)),
    password: newPassword,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, { error: MSG.passwordInvalid, path: ['confirmPassword'] });
export type RegisterValues = z.infer<typeof registerSchema>;

export const profileSchema = z.object({
  displayName,
  bio: z.string().max(BIO_MAX, MSG.bio),
});
export type ProfileValues = z.infer<typeof profileSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, MSG.currentPasswordRequired).max(PASSWORD_MAX, MSG.passwordTooLong),
    newPassword,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, { error: MSG.passwordInvalid, path: ['confirmPassword'] });
export type ChangePasswordValues = z.infer<typeof changePasswordSchema>;
