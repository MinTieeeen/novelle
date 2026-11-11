import { http } from '@/api/http';
import type { PageResponse } from '@/types/api';
import type { StoryCard, StoryDetail } from '@/types/story';
import { toApiQuery, type StorySearchParams } from '@/types/storySearch';

/**
 * GET /api/stories: full-text search + filters + sort + paging (rate limit "search", 60/min per IP).
 * Pass the query's AbortSignal so typing cancels the previous request.
 */
export async function searchStories(params: StorySearchParams, signal?: AbortSignal): Promise<PageResponse<StoryCard>> {
  const { data } = await http.get<PageResponse<StoryCard>>('/stories', { params: toApiQuery(params), signal });
  return data;
}

/** GET /api/stories/{slug}: detail with genres, tags and the table of contents; 404 STORY_NOT_FOUND. */
export async function getStory(slug: string): Promise<StoryDetail> {
  const { data } = await http.get<StoryDetail>(`/stories/${encodeURIComponent(slug)}`);
  return data;
}
