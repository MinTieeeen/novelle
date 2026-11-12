import { z } from 'zod';
import type { PageResponse } from '@/types/api';
import type { StoryCard } from '@/types/story';

/* M4 library: reading history, follows, reading lists (docs/module-library.md §7). */

/** com.novelle.dto.UserRefResponse: an account in someone else's content (list owner, review author). */
export interface UserRef {
  userId: number;
  username: string;
  avatarUrl?: string | null;
}

/** H1 GET /api/library/history. `lastChapter` is absent when that chapter is no longer public. */
export interface HistoryItem {
  story: StoryCard;
  lastChapter?: { chapterId: number; chapterNo: number; title: string } | null;
  scrollPercent: number;
  updatedAt: string;
}

/** F1–F3 */
export interface FollowStatus {
  storyId: number;
  following: boolean;
  followCount: number;
}

/** F4–F6 */
export interface AuthorFollowStatus {
  authorId: number;
  following: boolean;
  followerCount: number;
}

/** F8 GET /api/library/authors */
export interface FollowedAuthor {
  authorId: number;
  penName: string;
  avatarUrl?: string | null;
  isVerified: boolean;
  followerCount: number;
  followedAt: string;
}

/** T1, T2, T4, T9. `itemCount` also counts stories hidden since they were added. */
export interface ReadingListSummary {
  listId: number;
  name: string;
  description?: string | null;
  isPublic: boolean;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

/** A public story in a list (T3, T6). */
export interface ReadingListItem {
  story: StoryCard;
  orderNo: number;
  note?: string | null;
  addedAt: string;
}

/** T3 GET /api/reading-lists/{listId}?page=&size= (size ≤ 50) */
export interface ReadingListDetail extends ReadingListSummary {
  owner: UserRef;
  isOwner: boolean;
  items: PageResponse<ReadingListItem>;
}

/** T2 body; T4 body is the same with every field optional (null = unchanged, description "" = cleared). */
export interface ReadingListBody {
  name: string;
  description?: string;
  isPublic: boolean;
}

/* ------------------------------------------------------------------------------------------------
 * Limits copy CreateReadingListRequest / AddListItemRequest and application.yml (reading-list.*).
 * ---------------------------------------------------------------------------------------------- */

export const LIST_NAME_MAX = 100;
export const LIST_DESCRIPTION_MAX = 500;
export const LIST_NOTE_MAX = 300;
export const MAX_LISTS = 50;
export const MAX_LIST_ITEMS = 500;
/** T3 page size (PageQuery.MAX_SIZE): the edit mode loads every page of this size. */
export const LIST_PAGE_SIZE = 50;

export const LIBRARY_MSG = {
  listName: 'Nhập tên tủ (tối đa 100 ký tự).',
  listDescription: 'Mô tả tối đa 500 ký tự.',
  nameTaken: 'Bạn đã có một tủ cùng tên. Chọn tên khác.',
  listLimit: `Bạn đã có tối đa ${MAX_LISTS} tủ truyện. Xoá bớt tủ cũ để tạo tủ mới.`,
  itemLimit: `Tủ này đã đủ ${MAX_LIST_ITEMS} truyện.`,
} as const;

export const readingListSchema = z.object({
  name: z.string().trim().min(1, LIBRARY_MSG.listName).max(LIST_NAME_MAX, LIBRARY_MSG.listName),
  description: z.string().trim().max(LIST_DESCRIPTION_MAX, LIBRARY_MSG.listDescription),
  isPublic: z.boolean(),
});
export type ReadingListValues = z.infer<typeof readingListSchema>;

/** Story ids in the new order for T8, from every loaded page (each id once, first occurrence wins). */
export function orderOf(items: Pick<ReadingListItem, 'story'>[]): number[] {
  return [...new Set(items.map((i) => i.story.storyId))];
}

/** Moves `from` to `to` (both indexes), returning a new array: the reorder step of the sortable list. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return [...list];
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
