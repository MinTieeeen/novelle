import type { PageResponse } from '../../src/types/api';
import type {
  FollowedAuthor,
  HistoryItem,
  ReadingListDetail,
  ReadingListItem,
  ReadingListSummary,
} from '../../src/types/library';
import type { Rating, StoryRatings } from '../../src/types/rating';
import { page, storyCard, storyDetail } from './story';

/* FE4 fixtures: library, follows, reading lists, ratings. Shapes follow the M4 DTOs. */

export const history: HistoryItem[] = [
  { story: storyCard(0), lastChapter: { chapterId: 5120, chapterNo: 120, title: 'Chương 120: Ngọn đèn thứ ba' }, scrollPercent: 42, updatedAt: '2026-11-11T08:10:00Z' },
  { story: storyCard(1), lastChapter: { chapterId: 6031, chapterNo: 31, title: 'Chương 31: Bến Vân Lâu' }, scrollPercent: 88.5, updatedAt: '2026-11-10T13:00:00Z' },
  { story: storyCard(4), lastChapter: { chapterId: 7012, chapterNo: 12, title: 'Chương 12: Đêm dài' }, scrollPercent: 15, updatedAt: '2026-11-08T02:00:00Z' },
  { story: storyCard(6), lastChapter: null, scrollPercent: 0, updatedAt: '2026-11-01T02:00:00Z' },
];

export const followedStories = [2, 3, 5, 7, 1].map((i) => storyCard(i));

export const followedAuthors: FollowedAuthor[] = [
  { authorId: 10, penName: 'Mộc Lan', avatarUrl: null, isVerified: true, followerCount: 3_018, followedAt: '2026-10-01T02:00:00Z' },
  { authorId: 11, penName: 'Hạ Vy', avatarUrl: null, isVerified: false, followerCount: 1_204, followedAt: '2026-09-20T02:00:00Z' },
  { authorId: 12, penName: 'Thanh Trà', avatarUrl: null, isVerified: true, followerCount: 5_870, followedAt: '2026-09-02T02:00:00Z' },
  { authorId: 13, penName: 'Bạch Dương', avatarUrl: null, isVerified: false, followerCount: 412, followedAt: '2026-08-12T02:00:00Z' },
];

export const myLists: ReadingListSummary[] = [
  { listId: 31, name: 'Đọc đêm mưa', description: 'Những truyện hợp để đọc một mình khi mưa rả rích.', isPublic: true, itemCount: 6, createdAt: '2026-09-01T02:00:00Z', updatedAt: '2026-11-10T02:00:00Z' },
  { listId: 32, name: 'Truyện ma nghe cho vui', description: null, isPublic: false, itemCount: 3, createdAt: '2026-09-05T02:00:00Z', updatedAt: '2026-11-02T02:00:00Z' },
  { listId: 33, name: 'Cổ trang yêu thích', description: null, isPublic: true, itemCount: 0, createdAt: '2026-10-05T02:00:00Z', updatedAt: '2026-10-05T02:00:00Z' },
];

export const listItems: ReadingListItem[] = [0, 1, 2, 3, 4, 5].map((i, k) => ({
  story: storyCard(i),
  orderNo: k + 1,
  note: k === 0 ? 'Đọc chậm, đọc lúc khuya.' : k === 3 ? 'Kết bất ngờ.' : null,
  addedAt: new Date(Date.UTC(2026, 8, 1 + k)).toISOString(),
}));

export function listDetail(overrides: Partial<ReadingListDetail> = {}, items: ReadingListItem[] = listItems): ReadingListDetail {
  return {
    ...myLists[0],
    owner: { userId: 101, username: 'lananh', avatarUrl: null },
    isOwner: true,
    items: page(items, 0, 50, items.length) as PageResponse<ReadingListItem>,
    ...overrides,
  };
}

export const ratings: Rating[] = [
  { storyId: storyDetail.storyId, user: { userId: 201, username: 'thuha', avatarUrl: null }, score: 5, review: 'Văn mượt, không khí Huế đọc mà thấy lạnh sống lưng. Chờ chương mới mỗi tối.', createdAt: '2026-11-09T12:00:00Z', updatedAt: '2026-11-09T12:00:00Z' },
  { storyId: storyDetail.storyId, user: { userId: 202, username: 'minhquan', avatarUrl: null }, score: 4, review: 'Mở đầu hơi chậm nhưng từ chương 10 cuốn hẳn.', createdAt: '2026-11-07T03:00:00Z', updatedAt: '2026-11-07T03:00:00Z' },
  { storyId: storyDetail.storyId, user: { userId: 203, username: 'ngocanh', avatarUrl: null }, score: 5, review: null, createdAt: '2026-11-05T03:00:00Z', updatedAt: '2026-11-05T03:00:00Z' },
];

export const storyRatings: StoryRatings = {
  storyId: storyDetail.storyId,
  ratingAvg: 4.8,
  ratingCount: 312,
  distribution: { '1': 3, '2': 6, '3': 18, '4': 59, '5': 226 },
  reviews: page(ratings, 0, 10, 31) as PageResponse<Rating>,
};

export const myRating: Rating = {
  storyId: storyDetail.storyId,
  user: { userId: 101, username: 'lananh', avatarUrl: null },
  score: 4,
  review: 'Thích cách tác giả tả sông nước.',
  createdAt: '2026-11-01T03:00:00Z',
  updatedAt: '2026-11-01T03:00:00Z',
};
