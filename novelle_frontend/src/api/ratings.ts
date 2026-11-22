import { http } from '@/api/http';
import type { Rating, RatingSaveResult, StoryRatings } from '@/types/rating';

/* M4 ratings D1–D4. */

export interface RatingsQuery {
  page?: number;
  size?: number;
  /** only ratings with a review text */
  hasReview?: boolean;
}

/** D1 (public): average, distribution and a page of ratings, newest first. */
export async function getRatings(storyId: number, query: RatingsQuery = {}): Promise<StoryRatings> {
  const { data } = await http.get<StoryRatings>(`/stories/${storyId}/ratings`, { params: query });
  return data;
}

/** D2: my rating; 204 (none yet) → null. */
export async function getMyRating(storyId: number): Promise<Rating | null> {
  const res = await http.get<Rating | ''>(`/stories/${storyId}/ratings/me`);
  return res.status === 204 || !res.data ? null : res.data;
}

/**
 * D3: create or update my rating (READER / AUTHOR, not on my own story; rate limit "rating").
 * 403 CANNOT_RATE_OWN_STORY / ADMIN_CANNOT_RATE.
 */
export async function saveRating(storyId: number, body: { score: number; review?: string }): Promise<RatingSaveResult> {
  const { data } = await http.put<RatingSaveResult>(`/stories/${storyId}/ratings/me`, {
    score: body.score,
    review: body.review || undefined,
  });
  return data;
}

/** D4 (idempotent, 204). */
export async function deleteRating(storyId: number): Promise<void> {
  await http.delete(`/stories/${storyId}/ratings/me`);
}
