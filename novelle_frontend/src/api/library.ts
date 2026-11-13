import { http } from '@/api/http';
import type { PageResponse } from '@/types/api';
import type { AuthorFollowStatus, FollowedAuthor, FollowStatus, HistoryItem } from '@/types/library';
import type { StoryCard } from '@/types/story';

/* M4 library (login required): history H1–H2, follows F1–F8. */

export interface PageQuery {
  page?: number;
  size?: number;
}

/** H1: my reading history over public stories, most recently read first. */
export async function getHistory(query: PageQuery = {}): Promise<PageResponse<HistoryItem>> {
  const { data } = await http.get<PageResponse<HistoryItem>>('/library/history', { params: query });
  return data;
}

/** H2: remove a story from my history (idempotent, 204). */
export async function deleteHistory(storyId: number): Promise<void> {
  await http.delete(`/library/history/${storyId}`);
}

/** F7: public stories I follow, newest chapter first. */
export async function getFollowedStories(query: PageQuery = {}): Promise<PageResponse<StoryCard>> {
  const { data } = await http.get<PageResponse<StoryCard>>('/library/follows', { params: query });
  return data;
}

/** F8: authors I follow, most recently followed first. */
export async function getFollowedAuthors(query: PageQuery = {}): Promise<PageResponse<FollowedAuthor>> {
  const { data } = await http.get<PageResponse<FollowedAuthor>>('/library/authors', { params: query });
  return data;
}

/** F1 */
export async function getStoryFollow(storyId: number): Promise<FollowStatus> {
  const { data } = await http.get<FollowStatus>(`/stories/${storyId}/follow`);
  return data;
}

/** F2 / F3 (idempotent, rate limit "follow"). The caller rolls back its optimistic state on error. */
export async function setStoryFollow(storyId: number, follow: boolean): Promise<FollowStatus> {
  const url = `/stories/${storyId}/follow`;
  const { data } = follow ? await http.put<FollowStatus>(url) : await http.delete<FollowStatus>(url);
  return data;
}

/** F4 */
export async function getAuthorFollow(authorId: number): Promise<AuthorFollowStatus> {
  const { data } = await http.get<AuthorFollowStatus>(`/authors/${authorId}/follow`);
  return data;
}

/** F5 / F6 (idempotent, rate limit "follow"); F5 → 400 CANNOT_FOLLOW_SELF for my own author profile. */
export async function setAuthorFollow(authorId: number, follow: boolean): Promise<AuthorFollowStatus> {
  const url = `/authors/${authorId}/follow`;
  const { data } = follow ? await http.put<AuthorFollowStatus>(url) : await http.delete<AuthorFollowStatus>(url);
  return data;
}
