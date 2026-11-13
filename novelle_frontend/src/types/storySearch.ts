import { z } from 'zod';
import type { AgeRating, CompletionStatus, StorySort } from '@/types/story';

/*
 * Search filters of /search (and the query of GET /api/stories). The URL is the source of truth: every
 * filter is a search param, so back/forward and shared links work. Limits copy StorySearchRequest,
 * StorySearchService and PageQuery. A bad value in the URL falls back to its default instead of failing.
 */

export const SEARCH_Q_MAX = 100;
export const MAX_GENRES = 5;
export const MAX_TAGS = 5;
export const PAGE_SIZE = 20;
export const PAGE_SIZE_MAX = 50;

export type SearchView = 'grid' | 'list';
export type GenreMode = 'all' | 'any';

export interface StorySearchParams {
  q?: string;
  genres: string[];
  genreMode: GenreMode;
  tags: string[];
  status?: CompletionStatus;
  ageRating?: AgeRating;
  minChapters?: number;
  maxChapters?: number;
  /** 1–5; absent = any rating */
  minRating?: number;
  /** Absent = backend default: relevance with q, updated without */
  sort?: StorySort;
  /** 0-based */
  page: number;
  size: number;
  /** UI only: grid of cards or list of rows (not sent to the API) */
  view: SearchView;
}

export const DEFAULT_SEARCH: StorySearchParams = {
  genres: [],
  genreMode: 'all',
  tags: [],
  page: 0,
  size: PAGE_SIZE,
  view: 'grid',
};

/** The backend rejects a q without any letter or digit (SearchQueryNormalizer): such a q is dropped. */
export function normalizeQuery(value: string | null | undefined): string | undefined {
  const q = (value ?? '').trim().slice(0, SEARCH_Q_MAX);
  return /[\p{L}\p{N}]/u.test(q) ? q : undefined;
}

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const nonNegativeInt = z.coerce.number().int().min(0);

/** Each field parsed on its own: one bad param does not reset the others. */
const FIELDS = {
  status: z.enum(['ONGOING', 'COMPLETED', 'HIATUS']),
  ageRating: z.enum(['ALL', '13+', '18+']),
  genreMode: z.enum(['all', 'any']),
  minChapters: nonNegativeInt,
  maxChapters: nonNegativeInt,
  minRating: z.coerce.number().int().min(1).max(5),
  sort: z.enum(['updated', 'newest', 'views', 'rating', 'follows', 'relevance']),
  page: nonNegativeInt.max(10_000),
  size: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX),
  view: z.enum(['grid', 'list']),
};

function pick<T>(schema: z.ZodType<T>, raw: string | null): T | undefined {
  if (raw == null || raw === '') return undefined;
  const r = schema.safeParse(raw);
  return r.success ? r.data : undefined;
}

function slugList(params: URLSearchParams, key: string, max: number): string[] {
  const values = params.getAll(key).flatMap((v) => v.split(','));
  return [...new Set(values.map((v) => v.trim().toLowerCase()).filter((v) => slug.safeParse(v).success))].slice(0, max);
}

/** URL → filters. Never throws. */
export function parseSearchParams(params: URLSearchParams): StorySearchParams {
  const q = normalizeQuery(params.get('q'));
  const result: StorySearchParams = {
    q,
    genres: slugList(params, 'genres', MAX_GENRES),
    genreMode: pick(FIELDS.genreMode, params.get('genreMode')) ?? 'all',
    tags: slugList(params, 'tags', MAX_TAGS),
    status: pick(FIELDS.status, params.get('status')),
    ageRating: pick(FIELDS.ageRating, params.get('ageRating')),
    minChapters: pick(FIELDS.minChapters, params.get('minChapters')),
    maxChapters: pick(FIELDS.maxChapters, params.get('maxChapters')),
    minRating: pick(FIELDS.minRating, params.get('minRating')),
    sort: pick(FIELDS.sort, params.get('sort')),
    page: pick(FIELDS.page, params.get('page')) ?? 0,
    size: pick(FIELDS.size, params.get('size')) ?? PAGE_SIZE,
    view: pick(FIELDS.view, params.get('view')) ?? 'grid',
  };
  // Cross-field rules of StorySearchService / StorySort.
  if (result.minChapters != null && result.maxChapters != null && result.minChapters > result.maxChapters) {
    result.maxChapters = undefined;
  }
  if (result.sort === 'relevance' && !result.q) result.sort = undefined;
  return result;
}

/** Filters → URL (defaults are left out, arrays repeat their key). */
export function toSearchParams(p: Partial<StorySearchParams>): URLSearchParams {
  const out = new URLSearchParams();
  const q = normalizeQuery(p.q);
  if (q) out.set('q', q);
  for (const g of p.genres ?? []) out.append('genres', g);
  if (p.genreMode === 'any' && (p.genres?.length ?? 0) > 0) out.set('genreMode', 'any');
  for (const t of p.tags ?? []) out.append('tags', t);
  if (p.status) out.set('status', p.status);
  if (p.ageRating) out.set('ageRating', p.ageRating);
  if (p.minChapters != null) out.set('minChapters', String(p.minChapters));
  if (p.maxChapters != null) out.set('maxChapters', String(p.maxChapters));
  if (p.minRating != null && p.minRating > 0) out.set('minRating', String(p.minRating));
  if (p.sort && !(p.sort === 'relevance' && !q)) out.set('sort', p.sort);
  if (p.page && p.page > 0) out.set('page', String(p.page));
  if (p.size && p.size !== PAGE_SIZE) out.set('size', String(p.size));
  if (p.view === 'list') out.set('view', 'list');
  return out;
}

/** Filters → query of GET /api/stories (drops the UI-only `view` and empty values). */
export function toApiQuery(p: StorySearchParams): Record<string, string | number | string[]> {
  const out: Record<string, string | number | string[]> = { page: p.page, size: p.size };
  const q = normalizeQuery(p.q);
  if (q) out.q = q;
  if (p.genres.length) {
    out.genres = p.genres;
    out.genreMode = p.genreMode;
  }
  if (p.tags.length) out.tags = p.tags;
  if (p.status) out.status = p.status;
  if (p.ageRating) out.ageRating = p.ageRating;
  if (p.minChapters != null) out.minChapters = p.minChapters;
  if (p.maxChapters != null) out.maxChapters = p.maxChapters;
  if (p.minRating != null) out.minRating = p.minRating;
  if (p.sort && !(p.sort === 'relevance' && !q)) out.sort = p.sort;
  return out;
}

/* ---------------------------------------------------------------------------------------------- */
/* "Số chương" chips of the SearchFilters board ↔ minChapters / maxChapters                        */
/* ---------------------------------------------------------------------------------------------- */

export type ChapterRangeKey = 'all' | 'lt50' | 'gte50' | 'gte200' | 'gte500';

export const CHAPTER_RANGES: { key: ChapterRangeKey; label: string; min?: number; max?: number }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'lt50', label: 'Dưới 50', max: 49 },
  { key: 'gte50', label: 'Từ 50 chương', min: 50 },
  { key: 'gte200', label: '200+', min: 200 },
  { key: 'gte500', label: '500+', min: 500 },
];

/** The chip matching the current min/max, or null when the URL holds a custom range. */
export function chapterRangeOf(p: Pick<StorySearchParams, 'minChapters' | 'maxChapters'>): ChapterRangeKey | null {
  const found = CHAPTER_RANGES.find((r) => r.min === p.minChapters && r.max === p.maxChapters);
  return found?.key ?? null;
}

export function applyChapterRange(key: ChapterRangeKey): Pick<StorySearchParams, 'minChapters' | 'maxChapters'> {
  const r = CHAPTER_RANGES.find((x) => x.key === key)!;
  return { minChapters: r.min, maxChapters: r.max };
}

/** Number of active filters (for the mobile "Bộ lọc (3)" button and "Xoá bộ lọc"). */
export function activeFilterCount(p: StorySearchParams): number {
  return (
    p.genres.length +
    p.tags.length +
    (p.status ? 1 : 0) +
    (p.ageRating ? 1 : 0) +
    (p.minChapters != null || p.maxChapters != null ? 1 : 0) +
    (p.minRating ? 1 : 0)
  );
}

/** Readable label of a tag slug when its name is not known ("bao-thu" → "bao thu"). */
export const tagLabel = (slug: string, names?: Record<string, string>) => names?.[slug] ?? slug.replace(/-/g, ' ');
