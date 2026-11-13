import { z } from 'zod';
import type { PageResponse } from '@/types/api';
import type { UserRef } from '@/types/library';

/* M4 ratings (docs/module-library.md D1–D4). */

/** One rating with its author (D1, D2). */
export interface Rating {
  storyId: number;
  user: UserRef;
  score: number;
  review?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** D1 GET /api/stories/{storyId}/ratings: `distribution` always has the keys "1"…"5". */
export interface StoryRatings {
  storyId: number;
  ratingAvg: number;
  ratingCount: number;
  distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
  reviews: PageResponse<Rating>;
}

/** D3 response: my rating with the story's new average and count (trg_Rating). */
export interface RatingSaveResult {
  rating: Rating;
  ratingAvg: number;
  ratingCount: number;
}

export const REVIEW_MAX = 1000;
export const RATING_MSG = {
  score: 'Chọn số sao, từ 1 đến 5.',
  review: 'Nhận xét tối đa 1.000 ký tự.',
} as const;

/** D3 body: score 1–5, blank review is stored as no review. */
export const ratingSchema = z.object({
  score: z.number({ error: RATING_MSG.score }).int().min(1, RATING_MSG.score).max(5, RATING_MSG.score),
  review: z.string().trim().max(REVIEW_MAX, RATING_MSG.review),
});
export type RatingValues = z.infer<typeof ratingSchema>;

/** Bars of the distribution, 5 stars first, with the share of each score in whole percent. */
export function distributionRows(r: Pick<StoryRatings, 'distribution' | 'ratingCount'>) {
  const total = Object.values(r.distribution).reduce((a, b) => a + b, 0);
  return ([5, 4, 3, 2, 1] as const).map((star) => {
    const count = r.distribution[String(star) as keyof StoryRatings['distribution']] ?? 0;
    return { star, count, percent: total > 0 ? Math.round((count / total) * 100) : 0 };
  });
}
