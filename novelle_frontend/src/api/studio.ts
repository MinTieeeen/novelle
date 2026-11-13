import { http } from '@/api/http';
import type { PageResponse } from '@/types/api';
import type { AgeRating, CompletionStatus } from '@/types/story';
import type {
  AuthorProfileStudio,
  ChapterListItem,
  DashboardOverview,
  DraftSaveResult,
  Followers,
  Granularity,
  PublishStatus,
  Revision,
  StoryBody,
  StoryStats,
  StudioChapter,
  StudioStory,
  StudioStoryCard,
  ViewSeries,
  Volume,
} from '@/types/studio';

/* M6 Studio (AUTHOR only, docs/module-studio.md §7.4). Writes carry the CSRF header (http.ts). */

const S = '/studio';

/* ---------- Stories S1–S9 ---------- */

export interface StudioStoriesQuery {
  status?: PublishStatus;
  page?: number;
  size?: number;
}

/** S1: my stories, most recently changed first. */
export async function getStudioStories(query: StudioStoriesQuery = {}): Promise<PageResponse<StudioStoryCard>> {
  const { data } = await http.get<PageResponse<StudioStoryCard>>(`${S}/stories`, { params: query });
  return data;
}

/** S2 → 201 DRAFT story (rate limit "story-create"). */
export async function createStory(body: StoryBody): Promise<StudioStory> {
  const { data } = await http.post<StudioStory>(`${S}/stories`, body);
  return data;
}

/** S3 */
export async function getStudioStory(storyId: number): Promise<StudioStory> {
  const { data } = await http.get<StudioStory>(`${S}/stories/${storyId}`);
  return data;
}

export interface StoryInfoPatch {
  title?: string;
  /** "" clears it */
  description?: string;
  /** "" = default cover */
  coverUrl?: string;
  ageRating?: AgeRating;
  completionStatus?: CompletionStatus;
  version: string;
}

/** S4: absent = unchanged; 409 STALE_DATA when `version` is old. */
export async function updateStoryInfo(storyId: number, body: StoryInfoPatch): Promise<StudioStory> {
  const { data } = await http.patch<StudioStory>(`${S}/stories/${storyId}`, body);
  return data;
}

/** S5: 1–3 genres, exactly one primary (no version). */
export async function replaceStoryGenres(storyId: number, genreIds: number[], primaryGenreId: number): Promise<StudioStory> {
  const { data } = await http.put<StudioStory>(`${S}/stories/${storyId}/genres`, { genreIds, primaryGenreId });
  return data;
}

/** S6: at most 10 tags after merging duplicates; unknown tags are created (no version). */
export async function replaceStoryTags(storyId: number, tags: string[]): Promise<StudioStory> {
  const { data } = await http.put<StudioStory>(`${S}/stories/${storyId}/tags`, { tags });
  return data;
}

/** S7: DRAFT → PUBLISHED; 409 STORY_HAS_NO_CHAPTER / STORY_HIDDEN / ALREADY_PROCESSED. */
export async function publishStory(storyId: number): Promise<StudioStory> {
  const { data } = await http.post<StudioStory>(`${S}/stories/${storyId}/publish`);
  return data;
}

/** S8: PUBLISHED → DRAFT; 409 STORY_HIDDEN / ALREADY_PROCESSED. */
export async function unpublishStory(storyId: number): Promise<StudioStory> {
  const { data } = await http.post<StudioStory>(`${S}/stories/${storyId}/unpublish`);
  return data;
}

/** S9 (204): soft-deletes the story with its volumes and chapters. */
export async function deleteStory(storyId: number): Promise<void> {
  await http.delete(`${S}/stories/${storyId}`);
}

/* ---------- Author profile S10–S11 ---------- */

/** S10 */
export async function getStudioProfile(): Promise<AuthorProfileStudio> {
  const { data } = await http.get<AuthorProfileStudio>(`${S}/profile`);
  return data;
}

/** S11: absent = unchanged, bio "" = cleared; 409 PEN_NAME_TAKEN. */
export async function updateStudioProfile(body: { penName?: string; bio?: string }): Promise<AuthorProfileStudio> {
  const { data } = await http.patch<AuthorProfileStudio>(`${S}/profile`, body);
  return data;
}

/* ---------- Volumes V1–V4 ---------- */

/** V1: in order, with chapter counts. */
export async function getVolumes(storyId: number): Promise<Volume[]> {
  const { data } = await http.get<Volume[]>(`${S}/stories/${storyId}/volumes`);
  return data;
}

/** V2 → 201, added at the end. */
export async function createVolume(storyId: number, title: string): Promise<Volume> {
  const { data } = await http.post<Volume>(`${S}/stories/${storyId}/volumes`, { title });
  return data;
}

/** V3 */
export async function renameVolume(volumeId: number, title: string): Promise<Volume> {
  const { data } = await http.patch<Volume>(`${S}/volumes/${volumeId}`, { title });
  return data;
}

/** V4 (204); 409 VOLUME_NOT_EMPTY. */
export async function deleteVolume(volumeId: number): Promise<void> {
  await http.delete(`${S}/volumes/${volumeId}`);
}

/* ---------- Chapters C1–C10 ---------- */

/** C1: every chapter that is not deleted (draft, scheduled, published), no content. */
export async function getStudioChapters(storyId: number): Promise<ChapterListItem[]> {
  const { data } = await http.get<ChapterListItem[]>(`${S}/stories/${storyId}/chapters`);
  return data;
}

/** C2 → 201 DRAFT chapter at the end (ChapterNo = MAX + 1). */
export async function createChapter(storyId: number, body: { title: string; volumeId?: number | null; content?: string }): Promise<StudioChapter> {
  const { data } = await http.post<StudioChapter>(`${S}/stories/${storyId}/chapters`, {
    title: body.title,
    volumeId: body.volumeId ?? undefined,
    content: body.content ?? '',
  });
  return data;
}

/** C3: content, version and the Redis draft when it is newer. */
export async function getStudioChapter(chapterId: number): Promise<StudioChapter> {
  const { data } = await http.get<StudioChapter>(`${S}/chapters/${chapterId}`);
  return data;
}

/**
 * C4: autosave to Redis only (rate limit "draft", 30 / min). The caller decides about errors (a skipped
 * autosave is not worth a toast), so the global handlers are off.
 */
export async function saveDraft(chapterId: number, body: { title: string; content: string }): Promise<DraftSaveResult> {
  const { data } = await http.put<DraftSaveResult>(`${S}/chapters/${chapterId}/draft`, body, { skipGlobalErrorHandler: true });
  return data;
}

/** C5 (204) */
export async function discardDraft(chapterId: number): Promise<void> {
  await http.delete(`${S}/chapters/${chapterId}/draft`);
}

/** C6: 409 STALE_DATA when `version` is old; 400 VOLUME_NOT_IN_STORY. */
export async function saveChapter(
  chapterId: number,
  body: { title: string; content: string; volumeId?: number | null; version: string },
): Promise<StudioChapter> {
  const { data } = await http.put<StudioChapter>(`${S}/chapters/${chapterId}`, { ...body, volumeId: body.volumeId ?? undefined });
  return data;
}

/** C7: publish now (rate limit "publish"); 409 CHAPTER_EMPTY / ALREADY_PROCESSED. */
export async function publishChapter(chapterId: number): Promise<StudioChapter> {
  const { data } = await http.post<StudioChapter>(`${S}/chapters/${chapterId}/publish`);
  return data;
}

/** C8: schedule or move the schedule (UTC ISO, now + 1 min … + 365 days); 409 CHAPTER_EMPTY / CHAPTER_ALREADY_PUBLISHED. */
export async function scheduleChapter(chapterId: number, scheduledAt: string): Promise<StudioChapter> {
  const { data } = await http.post<StudioChapter>(`${S}/chapters/${chapterId}/schedule`, { scheduledAt });
  return data;
}

/** C9: SCHEDULED → DRAFT; 409 ALREADY_PROCESSED. */
export async function unscheduleChapter(chapterId: number): Promise<StudioChapter> {
  const { data } = await http.post<StudioChapter>(`${S}/chapters/${chapterId}/unschedule`);
  return data;
}

/** C10 (204) */
export async function deleteChapter(chapterId: number): Promise<void> {
  await http.delete(`${S}/chapters/${chapterId}`);
}

/* ---------- Revisions R1–R3 ---------- */

/** R1: the 10 most recent revisions, newest first, no content. */
export async function getRevisions(chapterId: number): Promise<Revision[]> {
  const { data } = await http.get<Revision[]>(`${S}/chapters/${chapterId}/revisions`);
  return data;
}

/** R2: one revision with its content; 404 REVISION_NOT_FOUND. */
export async function getRevision(chapterId: number, revisionNo: number): Promise<Revision> {
  const { data } = await http.get<Revision>(`${S}/chapters/${chapterId}/revisions/${revisionNo}`);
  return data;
}

/** R3: restores a revision (the current text becomes a new revision); 409 STALE_DATA. */
export async function restoreRevision(chapterId: number, revisionNo: number, version: string): Promise<StudioChapter> {
  const { data } = await http.post<StudioChapter>(`${S}/chapters/${chapterId}/revisions/${revisionNo}/restore`, { version });
  return data;
}

/* ---------- Dashboard D1–D4 ---------- */

/** D1 */
export async function getDashboardOverview(): Promise<DashboardOverview> {
  const { data } = await http.get<DashboardOverview>(`${S}/dashboard`);
  return data;
}

export interface ViewsQuery {
  from: string;
  to: string;
  granularity: Granularity;
  storyId?: number;
}

/** D2: views per day / month (Vietnam dates); at most 366 days / 60 months. */
export async function getDashboardViews(query: ViewsQuery): Promise<ViewSeries> {
  const { data } = await http.get<ViewSeries>(`${S}/dashboard/views`, { params: query });
  return data;
}

/** D3 */
export async function getDashboardStories(): Promise<StoryStats[]> {
  const { data } = await http.get<StoryStats[]>(`${S}/dashboard/stories`);
  return data;
}

/** D4 */
export async function getDashboardFollowers(): Promise<Followers> {
  const { data } = await http.get<Followers>(`${S}/dashboard/followers`);
  return data;
}
