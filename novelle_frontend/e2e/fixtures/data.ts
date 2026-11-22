import type { ApiErrorBody } from '../../src/types/api';
import type { Me, PublicProfile } from '../../src/types/user';

/**
 * Typed fixtures shared by e2e tests. Shapes come from src/types (which mirror the backend DTOs), so a
 * DTO change breaks the type-check here instead of silently passing.
 */
export const readerMe: Me = {
  userId: 101,
  username: 'lananh',
  email: 'lananh@example.com',
  displayName: 'Lan Anh',
  avatarUrl: null,
  bio: null,
  role: 'READER',
  status: 'ACTIVE',
  createdAt: '2026-09-01T02:00:00Z',
  lastLoginAt: '2026-11-10T01:00:00Z',
  rowVersion: 'AAAAAAAAB9E=',
  author: null,
};

export const authorMe: Me = {
  ...readerMe,
  userId: 201,
  username: 'moclan',
  displayName: 'Mộc Lan',
  role: 'AUTHOR',
  author: { penName: 'Mộc Lan', bio: 'Viết về sông nước miền Trung.', isVerified: true, followerCount: 1280 },
};

export const adminMe: Me = { ...readerMe, userId: 1, username: 'admin', displayName: 'Quản trị viên', role: 'ADMIN' };

/* ---- FE1 users ---- */

export const publicProfileReader: PublicProfile = {
  username: 'lananh',
  displayName: 'Lan Anh',
  avatarUrl: null,
  bio: 'Mê truyện kiếm hiệp và trinh thám.',
  role: 'READER',
  createdAt: '2026-09-01T02:00:00Z',
  author: null,
};

export const publicProfileAuthor: PublicProfile = {
  username: 'moclan',
  displayName: 'Mộc Lan',
  avatarUrl: null,
  bio: null,
  role: 'AUTHOR',
  createdAt: '2026-06-12T02:00:00Z',
  author: { authorId: 12, penName: 'Mộc Lan', bio: 'Viết về sông nước miền Trung.', isVerified: true, followerCount: 1280 },
};

export const errors = {
  invalidCredentials: { status: 401, code: 'INVALID_CREDENTIALS', message: 'Wrong username, email or password.' },
  banned: { status: 403, code: 'ACCOUNT_BANNED', message: 'This account is banned.', details: { banReason: 'Spam bình luận' } },
  rateLimited: { status: 429, code: 'RATE_LIMITED', message: 'Too many requests.', details: { retryAfterSeconds: 42 } },
  usernameTaken: { status: 409, code: 'USERNAME_TAKEN', message: 'Username is already in use.' },
  emailTaken: { status: 409, code: 'EMAIL_TAKEN', message: 'Email is already in use.' },
  staleData: { status: 409, code: 'STALE_DATA', message: 'The data was changed by someone else.' },
  wrongPassword: { status: 400, code: 'WRONG_PASSWORD', message: 'Current password is wrong.' },
  userNotFound: { status: 404, code: 'USER_NOT_FOUND', message: 'User not found.' },
} satisfies Record<string, ApiErrorBody>;
