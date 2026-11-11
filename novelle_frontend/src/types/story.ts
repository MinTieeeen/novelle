/*
 * Catalog and story DTOs (com.novelle.dto: GenreResponse, TagResponse, HomeResponse, StoryCardResponse,
 * StoryDetailResponse, AuthorProfileResponse). JSON omits nulls, so nullable fields are `?: T | null`;
 * BigDecimal arrives as a number, Instant as a UTC ISO string.
 */

export type CompletionStatus = 'ONGOING' | 'COMPLETED' | 'HIATUS';
export type AgeRating = 'ALL' | '13+' | '18+';
export type StorySort = 'updated' | 'newest' | 'views' | 'rating' | 'follows' | 'relevance';

/** GET /api/genres */
export interface Genre {
  genreId: number;
  name: string;
  slug: string;
  description?: string | null;
  /** Public stories that have this genre */
  storyCount: number;
}

/** GET /api/tags?q=&limit= */
export interface Tag {
  tagId: number;
  name: string;
  slug: string;
  usageCount: number;
}

export interface GenreRef {
  genreId: number;
  name: string;
  slug: string;
}

/** One story in lists, shelves and search results (StoryCardResponse). */
export interface StoryCard {
  storyId: number;
  slug: string;
  title: string;
  description?: string | null;
  /** Relative path such as /covers/tien-hiep/03.jpg; missing → default cover */
  coverUrl?: string | null;
  author: { authorId: number; penName: string };
  primaryGenre?: GenreRef | null;
  completionStatus: CompletionStatus;
  ageRating: AgeRating;
  chapterCount: number;
  viewCount: number;
  followCount: number;
  /** 0–5, 0 when nobody rated */
  ratingAvg: number;
  ratingCount: number;
  lastChapterAt?: string | null;
  publishedAt?: string | null;
}

/** GET /api/home: five blocks of up to 12 stories. */
export interface HomeData {
  latestUpdated: StoryCard[];
  newest: StoryCard[];
  topRated: StoryCard[];
  mostViewed: StoryCard[];
  completed: StoryCard[];
}

export interface ChapterToc {
  chapterId: number;
  chapterNo: number;
  title: string;
  publishedAt?: string | null;
}

export interface VolumeToc {
  volumeId: number;
  volumeNo: number;
  title: string;
  chapters: ChapterToc[];
}

/** GET /api/stories/{slug} */
export interface StoryDetail {
  storyId: number;
  slug: string;
  title: string;
  description?: string | null;
  coverUrl?: string | null;
  author: { authorId: number; penName: string; isVerified: boolean };
  completionStatus: CompletionStatus;
  ageRating: AgeRating;
  chapterCount: number;
  wordCount: number;
  viewCount: number;
  followCount: number;
  ratingAvg: number;
  ratingCount: number;
  lastChapterAt?: string | null;
  publishedAt?: string | null;
  /** Primary genre first */
  genres: (GenreRef & { isPrimary: boolean })[];
  tags: { tagId: number; name: string; slug: string }[];
  volumes: VolumeToc[];
  /** Chapters that belong to no volume (listed after the volumes) */
  looseChapters: ChapterToc[];
}

/** GET /api/authors/{authorId} */
export interface AuthorProfile {
  authorId: number;
  penName: string;
  bio?: string | null;
  avatarUrl?: string | null;
  isVerified: boolean;
  followerCount: number;
  authorSince: string;
  stats: {
    storyCount: number;
    chapterCount: number;
    viewCount: number;
    ratingCount: number;
    /** Weighted by the number of ratings of each story; 0 when there is none */
    ratingAvg: number;
  };
}

export const STATUS_LABEL: Record<CompletionStatus, string> = {
  ONGOING: 'Đang ra',
  COMPLETED: 'Hoàn thành',
  HIATUS: 'Tạm ngưng',
};

export const AGE_LABEL: Record<AgeRating, string> = {
  ALL: 'Mọi lứa tuổi',
  '13+': '13+',
  '18+': '18+',
};

/** Order of the sort select on the Search board. */
export const SORT_LABEL: Record<StorySort, string> = {
  relevance: 'Liên quan nhất',
  updated: 'Mới cập nhật',
  newest: 'Mới đăng',
  views: 'Xem nhiều',
  rating: 'Đánh giá cao',
  follows: 'Theo dõi nhiều',
};

/** First published chapter of a story (volumes in order, then loose chapters), for "Đọc từ đầu". */
export function firstChapter(story: Pick<StoryDetail, 'volumes' | 'looseChapters'>): ChapterToc | null {
  const all = [...story.volumes.flatMap((v) => v.chapters), ...story.looseChapters];
  return all.reduce<ChapterToc | null>((min, c) => (min == null || c.chapterNo < min.chapterNo ? c : min), null);
}

/** "Chương 12: Người gác đèn" (keeps the title as is when it already starts with "Chương"). */
export function chapterLabel(c: Pick<ChapterToc, 'chapterNo' | 'title'>): string {
  return /^chương\s/i.test(c.title) ? c.title : `Chương ${c.chapterNo}: ${c.title}`;
}
