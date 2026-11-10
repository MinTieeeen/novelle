import type { Me } from '../../src/types/user';

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
