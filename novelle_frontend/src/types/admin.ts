import { z } from 'zod';
import type { GenreRef } from '@/types/story';
import type { PublishStatus } from '@/types/studio';
import { displayName, MSG, newPassword, USERNAME_PATTERN, type Role } from '@/types/user';

/* M7 Admin (docs/module-admin.md §7). JSON omits nulls; BigDecimal is a number. */

export type UserStatus = 'ACTIVE' | 'BANNED';

export const ADMIN_ROLE_LABEL: Record<Role, string> = { READER: 'Người đọc', AUTHOR: 'Tác giả', ADMIN: 'Admin' };
export const USER_STATUS_LABEL: Record<UserStatus, string> = { ACTIVE: 'Hoạt động', BANNED: 'Bị khoá' };

/** U1 */
export interface AdminUserItem {
  userId: number;
  username: string;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
  role: Role;
  status: UserStatus;
  createdAt: string;
  lastLoginAt?: string | null;
  bannedAt?: string | null;
}

/** U2–U5. AuthorId = UserId (Author.UserId is the key), so U6 takes the userId. */
export interface AdminUserDetail extends Omit<AdminUserItem, 'bannedAt'> {
  ban?: { reason: string; bannedAt: string; by?: { userId?: number | null; username?: string | null } | null } | null;
  author?: { penName: string; isVerified: boolean; followerCount: number; storyCount: number } | null;
  authorRequests: { pending: number; approved: number; rejected: number; cancelled: number };
}

/** C1–C3 */
export interface AdminStoryItem {
  storyId: number;
  slug: string;
  title: string;
  coverUrl?: string | null;
  publishStatus: PublishStatus;
  hiddenReason?: string | null;
  completionStatus: string;
  ageRating: string;
  author: { authorId: number; penName: string; isVerified: boolean };
  chapterCount: number;
  draftChapterCount: number;
  viewCount: number;
  followCount: number;
  ratingAvg: number;
  ratingCount: number;
  primaryGenre?: GenreRef | null;
  lastChapterAt?: string | null;
  updatedAt: string;
}

/** G1–G3: storyCount counts every story not deleted. */
export interface AdminGenre {
  genreId: number;
  name: string;
  slug: string;
  description?: string | null;
  sortOrder: number;
  storyCount: number;
}

/** T1–T2 (public TagResponse) */
export interface AdminTag {
  tagId: number;
  name: string;
  slug: string;
  usageCount: number;
}

/** S1 */
export interface StatsOverview {
  users: { total: number; byRole: Partial<Record<Role, number>>; banned: number };
  stories: { total: number; byStatus: Partial<Record<PublishStatus, number>> };
  chapters: { published: number; total: number };
  totalWords: number;
  totalViews: number;
  totalRatings: number;
}

/** S3 (all time) */
export interface GenreStat {
  genreId: number;
  name: string;
  slug: string;
  storyCount: number;
  totalViews: number;
}

/** S4: `month` is the first day of the month (yyyy-MM-dd). */
export interface UserGrowth {
  months: { month: string; byRole: Partial<Record<Role, number>>; total: number }[];
}

/** S5 */
export interface TopAuthors {
  systemAverageViews: number;
  items: { authorId: number; penName: string; isVerified: boolean; storyCount: number; totalViews: number; followerCount: number }[];
}

/* ------------------------------------------------------------------------------------------------
 * Reasons (decision 1): a required chip + an optional note, sent as one string ≤ 500.
 * ---------------------------------------------------------------------------------------------- */

export const REASON_MAX = 500;
export const OTHER_REASON = 'Khác';
export const BAN_REASONS = ['Vi phạm nội dung', 'Spam', 'Quấy rối người dùng', OTHER_REASON] as const;
export const HIDE_REASONS = ['Vi phạm bản quyền', 'Nội dung không phù hợp', 'Spam', OTHER_REASON] as const;

export const ADMIN_MSG = {
  reasonChip: 'Chọn một lý do.',
  reasonNote: 'Ghi rõ lý do khi chọn “Khác”.',
  reasonTooLong: 'Lý do (cả ghi chú) tối đa 500 ký tự.',
  genreName: 'Nhập tên thể loại (tối đa 50 ký tự, có chữ hoặc số).',
  genreDescription: 'Mô tả tối đa 500 ký tự.',
  sortOrder: 'Thứ tự là số nguyên từ 0 đến 32.000.',
  tagName: 'Tên tag 2–50 ký tự và có chữ hoặc số.',
  genreTaken: 'Đã có thể loại trùng tên.',
  tagTaken: 'Đã có tag trùng tên.',
  usernameTaken: 'Tên đăng nhập này đã có người dùng.',
  emailTaken: 'Email này đã được dùng cho tài khoản khác.',
} as const;

/** Toast text of an admin action error (module-admin plan §5); falls back to errors.ts. */
export const ADMIN_ERROR: Record<string, string> = {
  CANNOT_BAN_ADMIN: 'Không khoá được quản trị viên.',
  ALREADY_PROCESSED: 'Trạng thái vừa được admin khác thay đổi. Đã tải lại.',
  CONFLICT: 'Truyện đang là bản nháp nên chưa cần ẩn.',
  USER_NOT_FOUND: 'Không tìm thấy người dùng này.',
  AUTHOR_NOT_FOUND: 'Không tìm thấy tác giả này.',
  STORY_NOT_FOUND: 'Không tìm thấy truyện này. Có thể truyện vừa bị xoá.',
  GENRE_NOT_FOUND: 'Không tìm thấy thể loại này.',
  TAG_NOT_FOUND: 'Không tìm thấy tag này.',
  NOT_FOUND: 'Mục này không còn tồn tại.',
};

/** "Spam" / "Spam: note" / just the note for "Khác". */
export function composeReason(chip: string, note: string): string {
  const n = note.trim().replace(/\s+/g, ' ');
  if (chip === OTHER_REASON) return n;
  return n ? `${chip}: ${n}` : chip;
}

export const reasonSchema = z
  .object({ chip: z.string(), note: z.string() })
  .superRefine((v, ctx) => {
    if (!v.chip) ctx.addIssue({ code: 'custom', path: ['chip'], message: ADMIN_MSG.reasonChip });
    else if (v.chip === OTHER_REASON && !v.note.trim()) ctx.addIssue({ code: 'custom', path: ['note'], message: ADMIN_MSG.reasonNote });
    else if (composeReason(v.chip, v.note).length > REASON_MAX) ctx.addIssue({ code: 'custom', path: ['note'], message: ADMIN_MSG.reasonTooLong });
  });
export type ReasonValues = z.infer<typeof reasonSchema>;

/** U5: same rules as registration (FE1). */
export const createAdminSchema = z.object({
  displayName,
  username: z.string().regex(USERNAME_PATTERN, MSG.usernameInvalid),
  email: z.string().trim().max(255, MSG.emailInvalid).pipe(z.email(MSG.emailInvalid)),
  password: newPassword,
});
export type CreateAdminValues = z.infer<typeof createAdminSchema>;

const hasAlnum = (s: string) => /[\p{L}\p{N}]/u.test(s);

export const genreSchema = z.object({
  name: z.string().trim().min(1, ADMIN_MSG.genreName).max(50, ADMIN_MSG.genreName).refine(hasAlnum, ADMIN_MSG.genreName),
  description: z.string().trim().max(500, ADMIN_MSG.genreDescription),
  sortOrder: z.number({ error: ADMIN_MSG.sortOrder }).int(ADMIN_MSG.sortOrder).min(0, ADMIN_MSG.sortOrder).max(32_000, ADMIN_MSG.sortOrder),
});
export type GenreValues = z.infer<typeof genreSchema>;

/** T2: normalised like TagService (spaces collapsed), 2–50 characters. */
export const tagNameSchema = z
  .string()
  .transform((s) => s.trim().replace(/\s+/g, ' '))
  .pipe(z.string().min(2, ADMIN_MSG.tagName).max(50, ADMIN_MSG.tagName).refine(hasAlnum, ADMIN_MSG.tagName));

/* ------------------------------------------------------------------------------------------------
 * Filters on the URL (AD2, AD5)
 * ---------------------------------------------------------------------------------------------- */

const ROLES: Role[] = ['READER', 'AUTHOR', 'ADMIN'];
const STATUSES: UserStatus[] = ['ACTIVE', 'BANNED'];
const PUBLISH: PublishStatus[] = ['PUBLISHED', 'DRAFT', 'HIDDEN'];
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export interface UserFilters {
  q: string;
  role?: Role;
  status?: UserStatus;
  from?: string;
  to?: string;
  page: number;
}

export function parseUserFilters(p: URLSearchParams): UserFilters {
  const role = p.get('role') as Role;
  const status = p.get('status') as UserStatus;
  const from = p.get('from') ?? '';
  const to = p.get('to') ?? '';
  return {
    q: (p.get('q') ?? '').trim().slice(0, 100),
    role: ROLES.includes(role) ? role : undefined,
    status: STATUSES.includes(status) ? status : undefined,
    from: DAY.test(from) ? from : undefined,
    // to before from is dropped (the backend would answer 400)
    to: DAY.test(to) && !(DAY.test(from) && to < from) ? to : undefined,
    page: Math.max(0, Math.floor(Number(p.get('page'))) || 0),
  };
}

/** Inverse of parseUserFilters; empty values and page 0 are left out. `keep` carries other params (e.g. user). */
export function toUserParams(f: UserFilters, keep: Record<string, string | undefined> = {}): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (f.role) p.set('role', f.role);
  if (f.status) p.set('status', f.status);
  if (f.from) p.set('from', f.from);
  if (f.to) p.set('to', f.to);
  if (f.page > 0) p.set('page', String(f.page));
  for (const [k, v] of Object.entries(keep)) if (v) p.set(k, v);
  return p;
}

export interface StoryFilters {
  q: string;
  status?: PublishStatus;
  authorId?: number;
  page: number;
}

export function parseStoryFilters(p: URLSearchParams): StoryFilters {
  const status = p.get('status') as PublishStatus;
  const authorId = Number(p.get('authorId'));
  return {
    q: (p.get('q') ?? '').trim().slice(0, 100),
    status: PUBLISH.includes(status) ? status : undefined,
    authorId: Number.isInteger(authorId) && authorId > 0 ? authorId : undefined,
    page: Math.max(0, Math.floor(Number(p.get('page'))) || 0),
  };
}

export function toStoryParams(f: StoryFilters, keep: Record<string, string | undefined> = {}): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (f.status) p.set('status', f.status);
  if (f.authorId) p.set('authorId', String(f.authorId));
  if (f.page > 0) p.set('page', String(f.page));
  for (const [k, v] of Object.entries(keep)) if (v) p.set(k, v);
  return p;
}

/* ------------------------------------------------------------------------------------------------
 * Dashboard helpers (AD1)
 * ---------------------------------------------------------------------------------------------- */

/** Views per story of an author (0 without stories). */
export function perStory(totalViews: number, storyCount: number): number {
  return storyCount > 0 ? Math.round(totalViews / storyCount) : 0;
}

/** "×2,4" against the system average of views per story; null without an average. */
export function vsAverage(perStoryViews: number, systemAverage: number): number | null {
  if (!systemAverage) return null;
  return Math.round((perStoryViews / systemAverage) * 10) / 10;
}

/** Average chapters per story, one decimal. */
export function avgChapters(chapters: number, stories: number): number {
  return stories > 0 ? Math.round((chapters / stories) * 10) / 10 : 0;
}
