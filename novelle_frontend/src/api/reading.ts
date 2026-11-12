import { ensureCsrfToken, http, readCookie, XSRF_COOKIE, XSRF_HEADER } from '@/api/http';
import type { ChapterRead, ReadingProgress, SaveProgressBody } from '@/types/reading';

/**
 * GET /api/chapters/{chapterId}: one public chapter. Counts a view and, for a logged-in reader, moves the
 * reading position, so call it only when the reader opens the chapter (no prefetch).
 * 404 CHAPTER_NOT_FOUND (also for unpublished, scheduled or hidden chapters and hidden stories).
 */
export async function getChapter(chapterId: number): Promise<ChapterRead> {
  const { data } = await http.get<ChapterRead>(`/chapters/${chapterId}`);
  return data;
}

/**
 * GET /api/reading-progress/{storyId}: my position in a story; 204 (no position yet) → null. Login
 * required. Only decorates the story page, so errors skip the global handlers (no toast, no redirect).
 */
export async function getProgress(storyId: number): Promise<ReadingProgress | null> {
  const res = await http.get<ReadingProgress | ''>(`/reading-progress/${storyId}`, { skipGlobalErrorHandler: true });
  return res.status === 204 || !res.data ? null : res.data;
}

/**
 * PUT /api/reading-progress/{storyId} (rate limit "progress", 120/min per user). The caller decides what to
 * do with errors, so the global handlers (toast, redirect) are skipped.
 */
export async function saveProgress(storyId: number, body: SaveProgressBody): Promise<ReadingProgress> {
  const { data } = await http.put<ReadingProgress>(`/reading-progress/${storyId}`, body, {
    skipGlobalErrorHandler: true,
  });
  return data;
}

/**
 * Last save when the page is hidden or closed. Axios requests are cancelled on unload, so this uses
 * fetch with keepalive (sendBeacon cannot set the XSRF header). Best effort: errors are ignored.
 */
export function saveProgressOnLeave(storyId: number, body: SaveProgressBody): void {
  const token = readCookie(XSRF_COOKIE);
  if (!token) {
    // No token yet (first write of the session): fetch one for the next save, nothing to send now.
    void ensureCsrfToken().catch(() => undefined);
    return;
  }
  const base = (http.defaults.baseURL ?? '/api').replace(/\/$/, '');
  void fetch(`${base}/reading-progress/${storyId}`, {
    method: 'PUT',
    keepalive: true,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', [XSRF_HEADER]: token },
    body: JSON.stringify(body),
  }).catch(() => undefined);
}
