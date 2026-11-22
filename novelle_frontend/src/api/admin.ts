import { http } from '@/api/http';
import type { ViewsQuery } from '@/api/studio';
import type {
  AdminGenre,
  AdminStoryItem,
  AdminTag,
  AdminUserDetail,
  AdminUserItem,
  GenreStat,
  StatsOverview,
  TopAuthors,
  UserGrowth,
  UserStatus,
} from '@/types/admin';
import type { PageResponse } from '@/types/api';
import type { PublishStatus, ViewSeries } from '@/types/studio';
import type { Role } from '@/types/user';

/* M7 Admin (ADMIN only, docs/module-admin.md §7.4). Writes carry the CSRF header (http.ts). */

const A = '/admin';

/* ---------- Users U1–U6 ---------- */

export interface AdminUsersQuery {
  q?: string;
  role?: Role;
  status?: UserStatus;
  /** yyyy-MM-dd (registration date, Vietnam) */
  from?: string;
  to?: string;
  page?: number;
  size?: number;
}

/** U1 */
export async function getAdminUsers(query: AdminUsersQuery = {}): Promise<PageResponse<AdminUserItem>> {
  const { data } = await http.get<PageResponse<AdminUserItem>>(`${A}/users`, { params: { ...query, q: query.q || undefined } });
  return data;
}

/** U2 */
export async function getAdminUser(userId: number): Promise<AdminUserDetail> {
  const { data } = await http.get<AdminUserDetail>(`${A}/users/${userId}`);
  return data;
}

/** U3: reason 1–500; 403 CANNOT_BAN_ADMIN, 409 ALREADY_PROCESSED. The user's sessions are cut. */
export async function banUser(userId: number, reason: string): Promise<AdminUserDetail> {
  const { data } = await http.post<AdminUserDetail>(`${A}/users/${userId}/ban`, { reason });
  return data;
}

/** U4: 409 ALREADY_PROCESSED when active. */
export async function unbanUser(userId: number): Promise<AdminUserDetail> {
  const { data } = await http.post<AdminUserDetail>(`${A}/users/${userId}/unban`);
  return data;
}

/** U5 → 201 ADMIN; 409 USERNAME_TAKEN / EMAIL_TAKEN. */
export async function createAdmin(body: { username: string; email: string; password: string; displayName: string }): Promise<AdminUserDetail> {
  const { data } = await http.post<AdminUserDetail>(`${A}/admins`, body);
  return data;
}

/** U6 (authorId = the author's userId); 404 AUTHOR_NOT_FOUND. */
export async function setAuthorVerified(authorId: number, isVerified: boolean): Promise<{ authorId: number; isVerified: boolean }> {
  const { data } = await http.patch<{ authorId: number; isVerified: boolean }>(`${A}/authors/${authorId}/verify`, { isVerified });
  return data;
}

/* ---------- Stories C1–C5 ---------- */

export interface AdminStoriesQuery {
  q?: string;
  publishStatus?: PublishStatus;
  authorId?: number;
  page?: number;
  size?: number;
}

/** C1: every story not deleted, drafts and hidden ones included. */
export async function getAdminStories(query: AdminStoriesQuery = {}): Promise<PageResponse<AdminStoryItem>> {
  const { data } = await http.get<PageResponse<AdminStoryItem>>(`${A}/stories`, { params: { ...query, q: query.q || undefined } });
  return data;
}

/** C2: reason 1–500; 409 ALREADY_PROCESSED (hidden) / CONFLICT (draft). */
export async function hideStory(storyId: number, reason: string): Promise<AdminStoryItem> {
  const { data } = await http.post<AdminStoryItem>(`${A}/stories/${storyId}/hide`, { reason });
  return data;
}

/** C3: 409 ALREADY_PROCESSED when not hidden. */
export async function unhideStory(storyId: number): Promise<AdminStoryItem> {
  const { data } = await http.post<AdminStoryItem>(`${A}/stories/${storyId}/unhide`);
  return data;
}

/** C4 (204): sp_DeleteStory. */
export async function deleteAdminStory(storyId: number): Promise<void> {
  await http.delete(`${A}/stories/${storyId}`);
}

/** C5 (204): one user's rating of a story; the average is recomputed by trg_Rating. */
export async function deleteUserRating(storyId: number, userId: number): Promise<void> {
  await http.delete(`${A}/ratings/${storyId}/${userId}`);
}

/* ---------- Catalog G1–G4, T1–T3 ---------- */

/** G1 */
export async function getAdminGenres(): Promise<AdminGenre[]> {
  const { data } = await http.get<AdminGenre[]>(`${A}/genres`);
  return data;
}

export interface GenreBody {
  name?: string;
  /** "" clears it (G3) */
  description?: string;
  sortOrder?: number;
}

/** G2 → 201 (slug made from the name); 409 GENRE_NAME_TAKEN. */
export async function createGenre(body: GenreBody & { name: string }): Promise<AdminGenre> {
  const { data } = await http.post<AdminGenre>(`${A}/genres`, body);
  return data;
}

/** G3: absent = unchanged, slug kept; 409 GENRE_NAME_TAKEN. */
export async function updateGenre(genreId: number, body: GenreBody): Promise<AdminGenre> {
  const { data } = await http.patch<AdminGenre>(`${A}/genres/${genreId}`, body);
  return data;
}

/** G4 (204); 409 GENRE_IN_USE. */
export async function deleteGenre(genreId: number): Promise<void> {
  await http.delete(`${A}/genres/${genreId}`);
}

/** T1: most used first. */
export async function getAdminTags(query: { q?: string; page?: number; size?: number } = {}): Promise<PageResponse<AdminTag>> {
  const { data } = await http.get<PageResponse<AdminTag>>(`${A}/tags`, { params: { ...query, q: query.q || undefined } });
  return data;
}

/** T2 (slug made again); 409 TAG_NAME_TAKEN. */
export async function renameTag(tagId: number, name: string): Promise<AdminTag> {
  const { data } = await http.patch<AdminTag>(`${A}/tags/${tagId}`, { name });
  return data;
}

/** T3 (204): removed from every story first. */
export async function deleteTag(tagId: number): Promise<void> {
  await http.delete(`${A}/tags/${tagId}`);
}

/* ---------- Stats S1–S5 (cached on the server, D6) ---------- */

export async function getStatsOverview(): Promise<StatsOverview> {
  const { data } = await http.get<StatsOverview>(`${A}/stats/overview`);
  return data;
}

/** S2: like the author dashboard's D2, without storyId. */
export async function getStatsViews(query: Omit<ViewsQuery, 'storyId'>): Promise<ViewSeries> {
  const { data } = await http.get<ViewSeries>(`${A}/stats/views`, { params: query });
  return data;
}

export async function getStatsGenres(): Promise<GenreStat[]> {
  const { data } = await http.get<{ items: GenreStat[] }>(`${A}/stats/genres`);
  return data.items;
}

/** S4: months 1–60 (default 12). */
export async function getStatsUsers(months = 12): Promise<UserGrowth> {
  const { data } = await http.get<UserGrowth>(`${A}/stats/users`, { params: { months } });
  return data;
}

/** S5: limit 1–50 (default 20). */
export async function getStatsTopAuthors(limit = 10): Promise<TopAuthors> {
  const { data } = await http.get<TopAuthors>(`${A}/stats/top-authors`, { params: { limit } });
  return data;
}
