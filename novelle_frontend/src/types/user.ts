export type Role = 'READER' | 'AUTHOR' | 'ADMIN';
export type UserStatus = 'ACTIVE' | 'BANNED';

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
