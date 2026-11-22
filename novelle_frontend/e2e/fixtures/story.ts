import type { PageResponse } from '../../src/types/api';
import type { AuthorProfile, Genre, HomeData, StoryCard, StoryDetail } from '../../src/types/story';

/*
 * FE2 fixtures (catalog + story). Typed with src/types so a DTO change breaks the type-check.
 * Titles and names follow the sample data of the screen boards.
 */

export const genres: Genre[] = [
  ['Tiên hiệp', 'tien-hiep', 142],
  ['Huyền huyễn', 'huyen-huyen', 131],
  ['Kiếm hiệp', 'kiem-hiep', 96],
  ['Ngôn tình', 'ngon-tinh', 158],
  ['Đô thị', 'do-thi', 104],
  ['Trinh thám', 'trinh-tham', 48],
  ['Kinh dị', 'kinh-di', 41],
  ['Lịch sử', 'lich-su', 35],
].map(([name, slug, storyCount], i) => ({
  genreId: i + 1,
  name: name as string,
  slug: slug as string,
  description: null,
  storyCount: storyCount as number,
}));

const BOOKS: [string, string, string, number, number][] = [
  ['Người Gác Đèn Trên Sông Hương', 'Mộc Lan', 'huyen-huyen', 128, 4.8],
  ['Mùa Nước Nổi', 'Trần Vũ', 'lich-su', 64, 4.7],
  ['Kiếm Thần Vô Song', 'Lâm Phong', 'kiem-hiep', 204, 4.5],
  ['Thám Tử Phố Hàng Bạc', 'Lê Khải', 'trinh-tham', 31, 4.7],
  ['Ngôi Nhà Cuối Hẻm', 'Hạ Vy', 'kinh-di', 6, 4.1],
  ['Phố Cổ Mùa Mưa', 'Minh Khuê', 'ngon-tinh', 9, 4.4],
  ['Tinh Hà Viễn Chinh', 'Nam Phong', 'tien-hiep', 42, 4.6],
  ['Điền Viên Ở Núi Tản', 'Thu Hà', 'do-thi', 19, 4.5],
];

const slugify = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

export function storyCard(i: number, overrides: Partial<StoryCard> = {}): StoryCard {
  const [title, penName, genreSlug, chapterCount, ratingAvg] = BOOKS[i % BOOKS.length];
  const genre = genres.find((g) => g.slug === genreSlug)!;
  return {
    storyId: 100 + i,
    slug: slugify(title) + (i >= BOOKS.length ? `-${i}` : ''),
    title,
    description: 'Ông Tư giữ ngọn đèn trên bến Thương Bạc suốt bốn mươi năm.',
    coverUrl: null,
    author: { authorId: 10 + (i % BOOKS.length), penName },
    primaryGenre: { genreId: genre.genreId, name: genre.name, slug: genre.slug },
    completionStatus: i % 4 === 1 ? 'COMPLETED' : i % 4 === 3 ? 'HIATUS' : 'ONGOING',
    ageRating: i % 5 === 4 ? '18+' : 'ALL',
    chapterCount,
    viewCount: 388_104 - i * 21_000,
    followCount: 2_140 - i * 100,
    ratingAvg,
    ratingCount: 312 - i * 20,
    lastChapterAt: new Date(Date.UTC(2026, 10, 11, 2, 0) - i * 3_600_000).toISOString(),
    publishedAt: '2026-03-04T02:00:00Z',
    ...overrides,
  };
}

export const stories = (n: number, from = 0) => Array.from({ length: n }, (_, k) => storyCard(from + k));

export const home: HomeData = {
  latestUpdated: stories(8),
  newest: stories(6, 2),
  topRated: stories(6, 1),
  mostViewed: stories(10),
  completed: stories(6, 3).map((s) => ({ ...s, completionStatus: 'COMPLETED' as const })),
};

export function page<T>(items: T[], pageNo = 0, size = 20, totalElements = items.length): PageResponse<T> {
  return { items, page: pageNo, size, totalElements, totalPages: Math.max(1, Math.ceil(totalElements / size)) };
}

const chapter = (no: number) => ({
  chapterId: 5000 + no,
  chapterNo: no,
  title: `Chương ${no}: ${['Người gác đèn', 'Bến Thương Bạc', 'Đêm rằm tháng Bảy'][no % 3]}`,
  publishedAt: new Date(Date.UTC(2026, 2, 4) + no * 86_400_000).toISOString(),
});

export const storyDetail: StoryDetail = {
  ...storyCard(0),
  author: { authorId: 10, penName: 'Mộc Lan', isVerified: true },
  wordCount: 412_380,
  description:
    'Ông Tư giữ ngọn đèn trên bến Thương Bạc suốt bốn mươi năm.\n\nCho tới đêm rằm tháng Bảy, con đò cuối cùng không cập bến.',
  genres: [
    { genreId: 2, name: 'Huyền huyễn', slug: 'huyen-huyen', isPrimary: true },
    { genreId: 7, name: 'Kinh dị', slug: 'kinh-di', isPrimary: false },
    { genreId: 8, name: 'Lịch sử', slug: 'lich-su', isPrimary: false },
  ],
  tags: [
    { tagId: 1, name: 'Huế', slug: 'hue' },
    { tagId: 2, name: 'tâm linh', slug: 'tam-linh' },
  ],
  volumes: [
    { volumeId: 1, volumeNo: 1, title: 'Bến cũ', chapters: [1, 2, 3].map(chapter) },
    { volumeId: 2, volumeNo: 2, title: 'Đèn trên mặt nước', chapters: [4, 5].map(chapter) },
  ],
  looseChapters: [chapter(6)],
};

export const authorProfile: AuthorProfile = {
  authorId: 10,
  penName: 'Mộc Lan',
  bio: 'Người Huế, viết về sông nước và những chuyện người ta kể nhau nghe lúc nửa đêm.',
  avatarUrl: null,
  isVerified: true,
  followerCount: 1_280,
  authorSince: '2026-03-04T02:00:00Z',
  stats: { storyCount: 6, chapterCount: 412, viewCount: 1_204_330, ratingCount: 980, ratingAvg: 4.7 },
};
