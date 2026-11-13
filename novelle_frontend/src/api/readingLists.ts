import { http } from '@/api/http';
import type { PageQuery } from '@/api/library';
import {
  LIST_PAGE_SIZE,
  type ReadingListBody,
  type ReadingListDetail,
  type ReadingListItem,
  type ReadingListSummary,
} from '@/types/library';

/* M4 reading lists T1–T9. Writes check ownership on the server (404 READING_LIST_NOT_FOUND otherwise). */

/** T1: my lists, most recently updated first. */
export async function getMyLists(): Promise<ReadingListSummary[]> {
  const { data } = await http.get<ReadingListSummary[]>('/reading-lists');
  return data;
}

/** T2 → 201; 409 READING_LIST_NAME_TAKEN / READING_LIST_LIMIT. */
export async function createList(body: ReadingListBody): Promise<ReadingListSummary> {
  const { data } = await http.post<ReadingListSummary>('/reading-lists', body);
  return data;
}

/** T3: public list, or one of mine, with one page of its public stories (size ≤ 50). */
export async function getList(listId: number, query: PageQuery = {}): Promise<ReadingListDetail> {
  const { data } = await http.get<ReadingListDetail>(`/reading-lists/${listId}`, { params: query });
  return data;
}

/**
 * Every public story of a list in order, for the edit mode: T8 needs all of them. Reads pages of 50 until
 * the last one (a list holds at most 500 stories, so at most 10 requests).
 */
export async function getAllListItems(listId: number): Promise<ReadingListItem[]> {
  const first = await getList(listId, { page: 0, size: LIST_PAGE_SIZE });
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, first.items.totalPages - 1) }, (_, i) =>
      getList(listId, { page: i + 1, size: LIST_PAGE_SIZE }),
    ),
  );
  return [first, ...rest].flatMap((p) => p.items.items);
}

/** T4: null / absent = unchanged, description "" = cleared. */
export async function updateList(listId: number, body: Partial<ReadingListBody>): Promise<ReadingListSummary> {
  const { data } = await http.patch<ReadingListSummary>(`/reading-lists/${listId}`, body);
  return data;
}

/** T5 (204) */
export async function deleteList(listId: number): Promise<void> {
  await http.delete(`/reading-lists/${listId}`);
}

/** T6 → 201; 409 STORY_ALREADY_IN_LIST / READING_LIST_LIMIT, 404 STORY_NOT_FOUND. */
export async function addListItem(listId: number, storyId: number, note?: string): Promise<ReadingListItem> {
  const { data } = await http.post<ReadingListItem>(`/reading-lists/${listId}/items`, { storyId, note: note || undefined });
  return data;
}

/** T7 (204); 404 STORY_NOT_IN_LIST. */
export async function removeListItem(listId: number, storyId: number): Promise<void> {
  await http.delete(`/reading-lists/${listId}/items/${storyId}`);
}

/** T8 (204): every public story exactly once; 400 INVALID_ITEM_ORDER otherwise. */
export async function reorderList(listId: number, storyIds: number[]): Promise<void> {
  await http.put(`/reading-lists/${listId}/items/order`, { storyIds });
}

/** T9: public lists of a user (public profile). */
export async function getPublicLists(username: string): Promise<ReadingListSummary[]> {
  const { data } = await http.get<ReadingListSummary[]>(`/users/${encodeURIComponent(username)}/reading-lists`);
  return data;
}
