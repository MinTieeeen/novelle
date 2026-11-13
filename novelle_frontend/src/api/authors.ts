import { http } from '@/api/http';
import type { PageResponse } from '@/types/api';
import type { AuthorProfile, StoryCard, StorySort } from '@/types/story';

export interface AuthorStoriesQuery {
  /** relevance is not allowed here (no search text) */
  sort?: Exclude<StorySort, 'relevance'>;
  /** 0-based */
  page?: number;
  size?: number;
}

/** GET /api/authors/{authorId}: profile + stats; 404 AUTHOR_NOT_FOUND. */
export async function getAuthor(authorId: number): Promise<AuthorProfile> {
  const { data } = await http.get<AuthorProfile>(`/authors/${authorId}`);
  return data;
}

/** GET /api/authors/{authorId}/stories: the author's public stories, paged. */
export async function getAuthorStories(authorId: number, query: AuthorStoriesQuery = {}): Promise<PageResponse<StoryCard>> {
  const { data } = await http.get<PageResponse<StoryCard>>(`/authors/${authorId}/stories`, { params: query });
  return data;
}
