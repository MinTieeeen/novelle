import { z } from 'zod';
import type { AgeRating, CompletionStatus, GenreRef } from '@/types/story';

/* M6 Studio (docs/module-studio.md §7). JSON omits nulls; BigDecimal is a number; Instant an ISO string. */

export type PublishStatus = 'DRAFT' | 'PUBLISHED' | 'HIDDEN';
export type ChapterStatus = 'DRAFT' | 'SCHEDULED' | 'PUBLISHED';

export const PUBLISH_STATUS_LABEL: Record<PublishStatus, string> = {
  DRAFT: 'Bản nháp',
  PUBLISHED: 'Đã đăng',
  HIDDEN: 'Bị ẩn',
};
export const CHAPTER_STATUS_LABEL: Record<ChapterStatus, string> = {
  DRAFT: 'Nháp',
  SCHEDULED: 'Hẹn giờ',
  PUBLISHED: 'Đã đăng',
};
export const AGE_OPTIONS: { value: AgeRating; label: string }[] = [
  { value: 'ALL', label: 'Mọi lứa tuổi' },
  { value: '13+', label: '13+' },
  { value: '18+', label: '18+' },
];
export const COMPLETION_OPTIONS: { value: CompletionStatus; label: string }[] = [
  { value: 'ONGOING', label: 'Đang ra' },
  { value: 'COMPLETED', label: 'Hoàn thành' },
  { value: 'HIATUS', label: 'Tạm ngưng' },
];

/** S1 GET /api/studio/stories: one of my stories (any status but deleted). */
export interface StudioStoryCard {
  storyId: number;
  slug: string;
  title: string;
  coverUrl?: string | null;
  publishStatus: PublishStatus;
  completionStatus: CompletionStatus;
  ageRating: AgeRating;
  /** published chapters */
  chapterCount: number;
  /** DRAFT + SCHEDULED chapters */
  draftChapterCount: number;
  viewCount: number;
  followCount: number;
  ratingAvg: number;
  ratingCount: number;
  primaryGenre?: GenreRef | null;
  lastChapterAt?: string | null;
  updatedAt: string;
}

/** S2–S9: one story for editing; `version` goes back with PATCH. */
export interface StudioStory {
  storyId: number;
  slug: string;
  title: string;
  description?: string | null;
  coverUrl?: string | null;
  ageRating: AgeRating;
  completionStatus: CompletionStatus;
  publishStatus: PublishStatus;
  /** only when HIDDEN */
  hiddenReason?: string | null;
  /** primary first */
  genres: (GenreRef & { isPrimary: boolean })[];
  tags: { tagId: number; name: string; slug: string }[];
  chapterCount: number;
  wordCount: number;
  viewCount: number;
  followCount: number;
  ratingAvg: number;
  ratingCount: number;
  publishedAt?: string | null;
  lastChapterAt?: string | null;
  createdAt: string;
  version: string;
}

/** S2 body (S4 is the info part with every field optional + version; S5 / S6 the genres / tags). */
export interface StoryBody {
  title: string;
  description?: string;
  coverUrl?: string;
  ageRating: AgeRating;
  completionStatus: CompletionStatus;
  genreIds: number[];
  primaryGenreId: number;
  tags: string[];
}

/** S10 / S11 */
export interface AuthorProfileStudio {
  authorId: number;
  penName: string;
  bio?: string | null;
  isVerified: boolean;
  followerCount: number;
  authorSince: string;
}

/** V1–V3 */
export interface Volume {
  volumeId: number;
  volumeNo: number;
  title: string;
  /** chapters not deleted, any status */
  chapterCount: number;
  createdAt: string;
}

/** C1: every chapter of my story that is not deleted, without content. */
export interface ChapterListItem {
  chapterId: number;
  chapterNo: number;
  title: string;
  volumeId?: number | null;
  status: ChapterStatus;
  wordCount: number;
  viewCount: number;
  scheduledAt?: string | null;
  publishedAt?: string | null;
  updatedAt: string;
}

/** C2, C3, C6–C9, R3. `draft` only from C3, when the Redis draft is newer than the saved chapter. */
export interface StudioChapter {
  chapterId: number;
  storyId: number;
  chapterNo: number;
  title: string;
  /** sanitized HTML */
  content: string;
  volumeId?: number | null;
  status: ChapterStatus;
  wordCount: number;
  viewCount: number;
  scheduledAt?: string | null;
  publishedAt?: string | null;
  createdAt: string;
  version: string;
  draft?: { title: string; content: string; savedAt: string } | null;
}

/** C4: `saved: false` when Redis is down (the draft was not kept). */
export interface DraftSaveResult {
  saved: boolean;
  savedAt?: string | null;
}

/** R1 (no content) / R2 (with content) */
export interface Revision {
  revisionNo: number;
  title: string;
  wordCount: number;
  editedBy: { authorId: number; penName: string };
  createdAt: string;
  content?: string | null;
}

/** D1 */
export interface DashboardOverview {
  storyCount: number;
  publishedStoryCount: number;
  chapterCount: number;
  wordCount: number;
  viewCount: number;
  followerCount: number;
  storyFollowCount: number;
  ratingAvg: number;
  ratingCount: number;
}

export type Granularity = 'day' | 'month';

/** D2: `date` is yyyy-MM-dd (the first day of the month for `month`). */
export interface ViewSeries {
  granularity: Granularity;
  from: string;
  to: string;
  storyId?: number | null;
  total: number;
  points: { date: string; views: number }[];
}

/** D3 */
export interface StoryStats {
  storyId: number;
  slug: string;
  title: string;
  coverUrl?: string | null;
  publishStatus: PublishStatus;
  completionStatus: CompletionStatus;
  chapterCount: number;
  viewCount: number;
  views30d: number;
  followCount: number;
  ratingAvg: number;
  ratingCount: number;
  aboveMyAverage: boolean;
  primaryGenre?: GenreRef | null;
  lastChapterAt?: string | null;
}

/** D4 */
export interface Followers {
  followerCount: number;
  newFollowers30d: number;
  recent: { userId: number; username: string; displayName: string; avatarUrl?: string | null; followedAt: string }[];
  topStories: { storyId: number; title: string; slug: string; followCount: number }[];
}

/* ------------------------------------------------------------------------------------------------
 * Limits: the backend's (module-studio §7.5, user decision 2026-11-12).
 * ---------------------------------------------------------------------------------------------- */

export const STORY_TITLE_MAX = 300;
export const STORY_DESCRIPTION_MAX = 4000;
export const CHAPTER_TITLE_MAX = 300;
export const VOLUME_TITLE_MAX = 200;
export const CHAPTER_CONTENT_MAX = 200_000;
export const PEN_NAME_MIN = 2;
export const PEN_NAME_MAX = 100;
export const AUTHOR_BIO_MAX = 2000;
export const GENRES_MAX = 3;
export const TAGS_MAX = 10;
export const TAG_MIN = 2;
export const TAG_MAX = 50;
export const COVERS_PER_GENRE = 8;
/** C8: at least 1 minute ahead, at most 365 days. */
export const SCHEDULE_MIN_AHEAD_MS = 60_000;
export const SCHEDULE_MAX_AHEAD_MS = 365 * 86_400_000;

export const STUDIO_MSG = {
  storyTitle: 'Nhập tiêu đề truyện (tối đa 300 ký tự).',
  description: 'Mô tả tối đa 4.000 ký tự.',
  genres: 'Chọn từ 1 đến 3 thể loại.',
  primaryGenre: 'Chọn thể loại chính trong các thể loại đã chọn.',
  tags: 'Tối đa 10 tag, mỗi tag 2–50 ký tự và có chữ hoặc số.',
  chapterTitle: 'Nhập tiêu đề chương (tối đa 300 ký tự).',
  content: 'Nội dung chương dài quá 200.000 ký tự.',
  volumeTitle: 'Nhập tên tập (tối đa 200 ký tự).',
  penName: 'Bút danh từ 2 đến 100 ký tự.',
  bio: 'Giới thiệu tối đa 2.000 ký tự.',
  penTaken: 'Bút danh này đã thuộc về tác giả khác. Chọn bút danh khác.',
  scheduleTooSoon: 'Chọn thời điểm sau bây giờ ít nhất 1 phút.',
  scheduleTooFar: 'Chỉ hẹn giờ trong vòng 365 ngày tới.',
} as const;

/** "  Hệ   thống " → "Hệ thống": spaces collapsed like TagService.normalize. */
export function normalizeTag(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

/** Slug of a tag (same idea as the backend's Slugs.slugify): duplicates by slug are one tag. */
export function tagSlug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/** Adds a tag unless it is invalid or already there by slug; returns the same list when nothing changed. */
export function addTag(tags: string[], raw: string): string[] {
  const name = normalizeTag(raw);
  if (name.length < TAG_MIN || name.length > TAG_MAX || !tagSlug(name)) return tags;
  if (tags.some((t) => tagSlug(t) === tagSlug(name))) return tags;
  return [...tags, name];
}

const tagSchema = z
  .string()
  .transform(normalizeTag)
  .pipe(z.string().min(TAG_MIN, STUDIO_MSG.tags).max(TAG_MAX, STUDIO_MSG.tags).refine((t) => tagSlug(t) !== '', STUDIO_MSG.tags));

export const storySchema = z
  .object({
    title: z.string().trim().min(1, STUDIO_MSG.storyTitle).max(STORY_TITLE_MAX, STUDIO_MSG.storyTitle),
    description: z.string().trim().max(STORY_DESCRIPTION_MAX, STUDIO_MSG.description),
    /** "" = default cover */
    coverUrl: z.string().regex(/^(\/covers\/[a-z0-9-]+\/\d{2}\.jpg)?$/),
    ageRating: z.enum(['ALL', '13+', '18+']),
    completionStatus: z.enum(['ONGOING', 'COMPLETED', 'HIATUS']),
    genreIds: z.array(z.number().int()).min(1, STUDIO_MSG.genres).max(GENRES_MAX, STUDIO_MSG.genres),
    primaryGenreId: z.number({ error: STUDIO_MSG.primaryGenre }).int(),
    tags: z.array(tagSchema).max(TAGS_MAX, STUDIO_MSG.tags),
  })
  .refine((v) => v.genreIds.includes(v.primaryGenreId), { path: ['primaryGenreId'], message: STUDIO_MSG.primaryGenre });
export type StoryValues = z.infer<typeof storySchema>;

/** A new story: no genre yet (primaryGenreId 0 fails the refine until one is chosen). */
export const EMPTY_STORY: StoryValues = {
  title: '',
  description: '',
  coverUrl: '',
  ageRating: 'ALL',
  completionStatus: 'ONGOING',
  genreIds: [],
  primaryGenreId: 0,
  tags: [],
};

/** Form values of an existing story (StoryForm mode "edit"). */
export function storyToValues(s: Pick<StudioStory, 'title' | 'description' | 'coverUrl' | 'ageRating' | 'completionStatus' | 'genres' | 'tags'>): StoryValues {
  return {
    title: s.title,
    description: s.description ?? '',
    coverUrl: s.coverUrl ?? '',
    ageRating: s.ageRating,
    completionStatus: s.completionStatus,
    genreIds: s.genres.map((g) => g.genreId),
    primaryGenreId: s.genres.find((g) => g.isPrimary)?.genreId ?? s.genres[0]?.genreId ?? 0,
    tags: s.tags.map((t) => t.name),
  };
}

export const chapterTitleSchema = z.string().trim().min(1, STUDIO_MSG.chapterTitle).max(CHAPTER_TITLE_MAX, STUDIO_MSG.chapterTitle);

export const volumeSchema = z.object({
  title: z.string().trim().min(1, STUDIO_MSG.volumeTitle).max(VOLUME_TITLE_MAX, STUDIO_MSG.volumeTitle),
});
export type VolumeValues = z.infer<typeof volumeSchema>;

export const authorProfileSchema = z.object({
  penName: z.string().trim().min(PEN_NAME_MIN, STUDIO_MSG.penName).max(PEN_NAME_MAX, STUDIO_MSG.penName),
  bio: z.string().trim().max(AUTHOR_BIO_MAX, STUDIO_MSG.bio),
});
export type AuthorProfileValues = z.infer<typeof authorProfileSchema>;

/** C8 check on the chosen instant (UTC ISO), relative to `now`. Returns the error message or null. */
export function scheduleError(iso: string, now: Date = new Date()): string | null {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t) || t < now.getTime() + SCHEDULE_MIN_AHEAD_MS) return STUDIO_MSG.scheduleTooSoon;
  if (t > now.getTime() + SCHEDULE_MAX_AHEAD_MS) return STUDIO_MSG.scheduleTooFar;
  return null;
}

/* ------------------------------------------------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------------------------------------------- */

/** The 8 covers of the cover picker for a primary genre: /covers/<slug>/01.jpg … 08.jpg. */
export function coverUrls(genreSlug: string): string[] {
  return Array.from({ length: COVERS_PER_GENRE }, (_, i) => `/covers/${genreSlug}/${String(i + 1).padStart(2, '0')}.jpg`);
}

/** Visible characters of chapter HTML (tags removed, entities decoded, whitespace collapsed). */
export function textLength(html: string): number {
  if (!html) return 0;
  const text = html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|h[2-4]|blockquote)>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&(amp|lt|gt|quot|#39);/g, 'x')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length;
}

/** Change from `prev` to `cur` in percent with one decimal; null when there is nothing to compare with. */
export function pctChange(cur: number, prev: number): number | null {
  if (!prev) return null;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}

export type DashboardRange = '7d' | '30d' | '12m';
export const DASHBOARD_RANGES: { value: DashboardRange; label: string }[] = [
  { value: '7d', label: '7 ngày' },
  { value: '30d', label: '30 ngày' },
  { value: '12m', label: '12 tháng' },
];

function vnToday(now: Date): string {
  return new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
}
function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function addMonths(day: string, n: number): string {
  const d = new Date(`${day.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * D2 queries of a dashboard range and of the period right before it, in Vietnam dates (yyyy-MM-dd):
 * 7d / 30d end today by day; 12m covers the last 12 months (this one included) by month.
 */
export function rangeQueries(range: DashboardRange, now: Date = new Date()) {
  const today = vnToday(now);
  if (range === '12m') {
    const from = addMonths(today, -11);
    const to = today;
    const prevTo = addDays(from, -1);
    return {
      current: { from, to, granularity: 'month' as const },
      previous: { from: addMonths(from, -12), to: prevTo, granularity: 'month' as const },
    };
  }
  const days = range === '7d' ? 7 : 30;
  const from = addDays(today, -(days - 1));
  return {
    current: { from, to: today, granularity: 'day' as const },
    previous: { from: addDays(from, -days), to: addDays(from, -1), granularity: 'day' as const },
  };
}

/** Title of the next chapter created with "Tạo chương" (decision 2): "Chương N", N = max chapterNo + 1. */
export function nextChapterTitle(chapters: Pick<ChapterListItem, 'chapterNo'>[]): string {
  const max = chapters.reduce((m, c) => Math.max(m, c.chapterNo), 0);
  return `Chương ${max + 1}`;
}

/** "128 chương · 3 tập · 2 bản nháp · 1 chương hẹn giờ" (ChapterList board), zero parts left out. */
export function summarizeChapters(chapters: Pick<ChapterListItem, 'status'>[], volumeCount: number): string {
  const drafts = chapters.filter((c) => c.status === 'DRAFT').length;
  const scheduled = chapters.filter((c) => c.status === 'SCHEDULED').length;
  const parts = [`${chapters.length} chương`];
  if (volumeCount > 0) parts.push(`${volumeCount} tập`);
  if (drafts > 0) parts.push(`${drafts} bản nháp`);
  if (scheduled > 0) parts.push(`${scheduled} chương hẹn giờ`);
  return parts.join(' · ');
}
