import type {
  AdminGenre,
  AdminStoryItem,
  AdminTag,
  AdminUserDetail,
  AdminUserItem,
  GenreStat,
  StatsOverview,
  TopAuthors,
  UserGrowth,
} from '../../src/types/admin';
import type { PageResponse } from '../../src/types/api';
import { studioCards } from './studio';
import { genres, page } from './story';

/* FE7 fixtures (Admin). Shapes follow the M7 DTOs. */

const USERS: [string, string, AdminUserItem['role'], AdminUserItem['status']][] = [
  ['Quản trị viên', 'admin', 'ADMIN', 'ACTIVE'],
  ['Mộc Lan', 'moclan', 'AUTHOR', 'ACTIVE'],
  ['Lê Hoài Thu', 'hoaithu', 'READER', 'ACTIVE'],
  ['Trần Minh Quân', 'minhquan', 'READER', 'ACTIVE'],
  ['Spam Bot 77', 'bot77', 'READER', 'BANNED'],
  ['Hạ Vy', 'havy', 'AUTHOR', 'ACTIVE'],
  ['Phạm Ngọc Anh', 'ngocanh', 'READER', 'ACTIVE'],
  ['Thanh Trà', 'thanhtra', 'AUTHOR', 'BANNED'],
];

export const adminUsers: AdminUserItem[] = USERS.map(([displayName, username, role, status], i) => ({
  userId: i + 1,
  username,
  email: `${username}@example.com`,
  displayName,
  avatarUrl: null,
  role,
  status,
  createdAt: new Date(Date.UTC(2026, 2 + i, 3 + i)).toISOString(),
  lastLoginAt: new Date(Date.UTC(2026, 10, 11 - i, 8)).toISOString(),
  bannedAt: status === 'BANNED' ? '2026-11-01T03:00:00Z' : null,
}));

export const adminUsersPage = (items = adminUsers, p = 0, total = 12_480): PageResponse<AdminUserItem> => page(items, p, 20, total);

export function adminUserDetail(u: AdminUserItem): AdminUserDetail {
  return {
    ...u,
    ban: u.status === 'BANNED' ? { reason: 'Spam: đăng link quảng cáo trong đánh giá.', bannedAt: u.bannedAt!, by: { userId: 1, username: 'admin' } } : null,
    author: u.role === 'AUTHOR' ? { penName: u.displayName, isVerified: u.username === 'moclan', followerCount: 3_018, storyCount: 6 } : null,
    authorRequests: { pending: 0, approved: u.role === 'AUTHOR' ? 1 : 0, rejected: u.username === 'hoaithu' ? 1 : 0, cancelled: 0 },
  };
}

export const adminStories: AdminStoryItem[] = studioCards.map((c, i) => ({
  ...c,
  hiddenReason: c.publishStatus === 'HIDDEN' ? 'Vi phạm bản quyền: chép từ truyện khác.' : null,
  author: { authorId: i % 2 ? 6 : 2, penName: i % 2 ? 'Hạ Vy' : 'Mộc Lan', isVerified: i % 2 === 0 },
}));

export const adminStoriesPage = (items = adminStories, p = 0, total = items.length): PageResponse<AdminStoryItem> => page(items, p, 20, total);

export const adminGenres: AdminGenre[] = genres.map((g, i) => ({
  genreId: g.genreId,
  name: g.name,
  slug: g.slug,
  description: i === 0 ? 'Tu tiên, luyện khí, phi thăng.' : null,
  sortOrder: i + 1,
  storyCount: i === 3 ? 0 : g.storyCount,
}));

export const adminTags: AdminTag[] = ['Huế', 'tâm linh', 'trùng sinh', 'hệ thống', 'báo thù', 'cung đấu', 'xuyên không', 'học đường'].map((name, i) => ({
  tagId: i + 1,
  name,
  slug: name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/\s+/g, '-'),
  usageCount: 120 - i * 13,
}));

export const statsOverview: StatsOverview = {
  users: { total: 12_480, byRole: { READER: 12_135, AUTHOR: 342, ADMIN: 3 }, banned: 41 },
  stories: { total: 1_906, byStatus: { PUBLISHED: 1_512, DRAFT: 301, HIDDEN: 93 } },
  chapters: { published: 84_220, total: 90_312 },
  totalWords: 412_000_000,
  totalViews: 11_870_250,
  totalRatings: 38_400,
};

export const genreStats: GenreStat[] = genres.slice(0, 8).map((g, i) => ({
  genreId: g.genreId,
  name: g.name,
  slug: g.slug,
  storyCount: 320 - i * 33,
  totalViews: 2_400_000 - i * 260_000,
}));

export const userGrowth: UserGrowth = {
  months: Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(2025, 11 + i, 1));
    const reader = 640 + Math.round(180 * Math.sin(i / 1.6)) + i * 22;
    const author = 14 + (i % 4) * 3;
    return { month: d.toISOString().slice(0, 10), byRole: { READER: reader, AUTHOR: author, ADMIN: i === 4 ? 1 : 0 }, total: reader + author + (i === 4 ? 1 : 0) };
  }),
};

export const topAuthors: TopAuthors = {
  systemAverageViews: 6_533,
  items: [
    ['Mộc Lan', 6, 312_000, true],
    ['Thanh Trà', 9, 402_300, true],
    ['Hạ Vy', 4, 96_870, false],
    ['Bạch Dương', 3, 40_200, false],
    ['Lâm Phong', 5, 52_000, false],
  ].map(([penName, storyCount, totalViews, isVerified], i) => ({
    authorId: 10 + i,
    penName: penName as string,
    isVerified: isVerified as boolean,
    storyCount: storyCount as number,
    totalViews: totalViews as number,
    followerCount: 3_018 - i * 500,
  })),
};
