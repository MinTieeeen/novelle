import { http } from '@/api/http';
import type { Genre, HomeData, Tag } from '@/types/story';

/** GET /api/genres: the 20 genres in display order, with their public story count. */
export async function getGenres(): Promise<Genre[]> {
  const { data } = await http.get<Genre[]>('/genres');
  return data;
}

/** GET /api/tags?q=&limit=: popular tags, filtered by name (tag picker of the search filters). */
export async function getTags(q?: string, limit = 8, signal?: AbortSignal): Promise<Tag[]> {
  const { data } = await http.get<Tag[]>('/tags', { params: { q: q?.trim() || undefined, limit }, signal });
  return data;
}

/** GET /api/home: latest updated, newest, top rated, most viewed, completed (up to 12 each). */
export async function getHome(): Promise<HomeData> {
  const { data } = await http.get<HomeData>('/home');
  return data;
}
