import type { PageResponse } from '../../src/types/api';
import type {
  AuthorProfileStudio,
  ChapterListItem,
  DashboardOverview,
  Followers,
  Revision,
  StoryStats,
  StudioChapter,
  StudioStory,
  StudioStoryCard,
  ViewSeries,
  Volume,
} from '../../src/types/studio';
import { chapterHtml } from './reading';
import { genres, page } from './story';

/* FE6 fixtures (Studio). Shapes follow the M6 DTOs. */

const g = (slug: string) => {
  const x = genres.find((y) => y.slug === slug)!;
  return { genreId: x.genreId, name: x.name, slug: x.slug };
};

export const studioCards: StudioStoryCard[] = [
  ['Người Gác Đèn Trên Sông Hương', 'PUBLISHED', 'huyen-huyen', 128, 2, 388_104],
  ['Bến Vân Lâu', 'PUBLISHED', 'ngon-tinh', 31, 0, 58_977],
  ['Chuyến Đò Đêm Rằm', 'DRAFT', 'kinh-di', 0, 3, 0],
  ['Phố Cổ Mùa Mưa', 'HIDDEN', 'ngon-tinh', 9, 0, 22_810],
].map(([title, status, genre, chapters, drafts, views], i) => ({
  storyId: 100 + i,
  slug: `truyen-${100 + i}`,
  title: title as string,
  coverUrl: null,
  publishStatus: status as StudioStoryCard['publishStatus'],
  completionStatus: 'ONGOING',
  ageRating: 'ALL',
  chapterCount: chapters as number,
  draftChapterCount: drafts as number,
  viewCount: views as number,
  followCount: Math.round((views as number) / 180),
  ratingAvg: chapters ? 4.6 : 0,
  ratingCount: chapters ? 120 - i * 20 : 0,
  primaryGenre: g(genre as string),
  lastChapterAt: chapters ? '2026-11-11T13:00:00Z' : null,
  updatedAt: new Date(Date.UTC(2026, 10, 11 - i, 9)).toISOString(),
}));

export const studioCardsPage = (items = studioCards): PageResponse<StudioStoryCard> => page(items, 0, 50, items.length);

export const studioStory: StudioStory = {
  storyId: 100,
  slug: 'truyen-100',
  title: 'Người Gác Đèn Trên Sông Hương',
  description: 'Ông Tư giữ ngọn đèn trên bến Thương Bạc suốt bốn mươi năm.\n\nCho tới đêm rằm tháng Bảy, con đò cuối cùng không cập bến.',
  coverUrl: null,
  ageRating: '13+',
  completionStatus: 'ONGOING',
  publishStatus: 'PUBLISHED',
  hiddenReason: null,
  genres: [
    { ...g('huyen-huyen'), isPrimary: true },
    { ...g('kinh-di'), isPrimary: false },
  ],
  tags: [
    { tagId: 1, name: 'Huế', slug: 'hue' },
    { tagId: 2, name: 'tâm linh', slug: 'tam-linh' },
  ],
  chapterCount: 5,
  wordCount: 412_380,
  viewCount: 388_104,
  followCount: 2_140,
  ratingAvg: 4.8,
  ratingCount: 312,
  publishedAt: '2026-03-04T02:00:00Z',
  lastChapterAt: '2026-11-11T13:00:00Z',
  createdAt: '2026-03-01T02:00:00Z',
  version: '2026-11-11T13:00:00.123Z',
};

export const hiddenStory: StudioStory = { ...studioStory, publishStatus: 'HIDDEN', hiddenReason: 'Nội dung bạo lực chưa gắn nhãn 18+.' };

export const volumes: Volume[] = [
  { volumeId: 1, volumeNo: 1, title: 'Bến Thương Bạc', chapterCount: 3, createdAt: '2026-03-01T02:00:00Z' },
  { volumeId: 2, volumeNo: 2, title: 'Đèn trên mặt nước', chapterCount: 3, createdAt: '2026-06-01T02:00:00Z' },
  { volumeId: 3, volumeNo: 3, title: 'Mùa nước lên', chapterCount: 0, createdAt: '2026-11-01T02:00:00Z' },
];

const TITLES = ['Người gác đèn', 'Bến Thương Bạc', 'Đêm rằm tháng Bảy', 'Lời hẹn ở bến Vân Lâu', 'Chiếc nón bài thơ', 'Mưa đầu mùa', 'Bức thư không gửi'];

export const studioChapters: ChapterListItem[] = TITLES.map((title, i) => ({
  chapterId: 9000 + i + 1,
  chapterNo: i + 1,
  title: `Chương ${i + 1}: ${title}`,
  volumeId: i < 3 ? 1 : i < 6 ? 2 : null,
  status: i === 5 ? 'SCHEDULED' : i === 6 ? 'DRAFT' : 'PUBLISHED',
  wordCount: 3000 + i * 137,
  viewCount: i < 5 ? 6900 - i * 400 : 0,
  scheduledAt: i === 5 ? '2026-11-14T13:00:00Z' : null,
  publishedAt: i < 5 ? new Date(Date.UTC(2026, 2, 4 + i * 7)).toISOString() : null,
  updatedAt: new Date(Date.UTC(2026, 10, 1 + i, 7)).toISOString(),
}));

export const studioChapter: StudioChapter = {
  chapterId: 9007,
  storyId: 100,
  chapterNo: 7,
  title: 'Chương 7: Bức thư không gửi',
  content: chapterHtml,
  volumeId: null,
  status: 'DRAFT',
  wordCount: 3822,
  viewCount: 0,
  scheduledAt: null,
  publishedAt: null,
  createdAt: '2026-11-07T07:00:00Z',
  version: '2026-11-11T07:32:00.456Z',
  draft: null,
};

export const chapterWithDraft: StudioChapter = {
  ...studioChapter,
  draft: { title: studioChapter.title, content: `${chapterHtml}<p>Ông Tư nhìn sang bờ bên kia, nơi một ngọn đèn khác vừa sáng lên.</p>`, savedAt: '2026-11-11T07:20:00Z' },
};

export const revisions: Revision[] = [0, 1, 2, 3, 4].map((i) => ({
  revisionNo: 12 - i,
  title: studioChapter.title,
  wordCount: 3822 - i * 140,
  editedBy: { authorId: 10, penName: 'Mộc Lan' },
  createdAt: new Date(Date.UTC(2026, 10, 11 - i, 7 - i)).toISOString(),
}));

export const studioProfile: AuthorProfileStudio = {
  authorId: 10,
  penName: 'Mộc Lan',
  bio: 'Người Huế, viết về sông nước và những chuyện người ta kể nhau nghe lúc nửa đêm.',
  isVerified: true,
  followerCount: 3_018,
  authorSince: '2026-03-04T02:00:00Z',
};

export const overview: DashboardOverview = {
  storyCount: 4,
  publishedStoryCount: 2,
  chapterCount: 168,
  wordCount: 612_000,
  viewCount: 469_891,
  followerCount: 3_018,
  storyFollowCount: 2_600,
  ratingAvg: 4.7,
  ratingCount: 412,
};

/** A D2 series with a gentle weekly wave, one point per day (or month). */
export function viewSeries(from: string, to: string, granularity: 'day' | 'month', base = 4200): ViewSeries {
  const points: ViewSeries['points'] = [];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  let i = 0;
  while (d <= end) {
    const views = Math.round((granularity === 'month' ? base * 28 : base) * (1 + 0.25 * Math.sin(i / 1.7)) + i * 30);
    points.push({ date: d.toISOString().slice(0, 10), views });
    if (granularity === 'month') d.setUTCMonth(d.getUTCMonth() + 1);
    else d.setUTCDate(d.getUTCDate() + 1);
    i++;
  }
  return { granularity, from, to, storyId: null, total: points.reduce((a, p) => a + p.views, 0), points };
}

export const storyStats: StoryStats[] = studioCards.map((c, i) => ({
  storyId: c.storyId,
  slug: c.slug,
  title: c.title,
  coverUrl: null,
  publishStatus: c.publishStatus,
  completionStatus: c.completionStatus,
  chapterCount: c.chapterCount,
  viewCount: c.viewCount,
  views30d: Math.round(c.viewCount / 9),
  followCount: c.followCount,
  ratingAvg: c.ratingAvg,
  ratingCount: c.ratingCount,
  aboveMyAverage: i === 0,
  primaryGenre: c.primaryGenre,
  lastChapterAt: c.lastChapterAt,
}));

export const followers: Followers = {
  followerCount: 3_018,
  newFollowers30d: 142,
  recent: [
    ['thuha', 'Thu Hà'],
    ['minhquan', 'Minh Quân'],
    ['ngocanh', 'Ngọc Anh'],
    ['khanhly', 'Khánh Ly'],
    ['baolam', 'Bảo Lâm'],
  ].map(([username, displayName], i) => ({
    userId: 200 + i,
    username,
    displayName,
    avatarUrl: null,
    followedAt: new Date(Date.UTC(2026, 10, 11, 9 - i * 5)).toISOString(),
  })),
  topStories: studioCards.slice(0, 2).map((c) => ({ storyId: c.storyId, title: c.title, slug: c.slug, followCount: c.followCount })),
};
