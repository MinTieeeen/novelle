import type { PageResponse } from '../../src/types/api';
import type { AdminAuthorRequestDetail, AdminAuthorRequestItem, AuthorRequest } from '../../src/types/authorRequest';
import { page } from './story';

/* FE5 fixtures: author requests for the applicant and for admins. Shapes follow the M5 DTOs. */

const INTRO =
  'Mình viết truyện ngắn về những người sống ven sông Hương từ năm 2021, chủ yếu trên blog cá nhân. Muốn đăng dài kỳ ở Novelle để có chỗ gặp độc giả đều đặn hơn. Truyện đầu tay dự kiến là một chuyện tình ở bến đò cũ, khoảng 40 chương.';

export const pendingRequest: AuthorRequest = {
  requestId: 142,
  proposedPenName: 'Hoài Thu',
  introduction: INTRO,
  status: 'PENDING',
  reviewNote: null,
  createdAt: '2026-11-07T14:14:00Z',
  reviewedAt: null,
};

export const rejectedRequest: AuthorRequest = {
  requestId: 118,
  proposedPenName: 'Thu Hoài',
  introduction: 'Mình muốn viết truyện.',
  status: 'REJECTED',
  reviewNote: 'Phần giới thiệu còn quá ngắn, bạn bổ sung thêm kinh nghiệm viết rồi gửi lại nhé.',
  createdAt: '2026-10-20T02:00:00Z',
  reviewedAt: '2026-10-21T09:00:00Z',
};

export const approvedRequest: AuthorRequest = { ...pendingRequest, status: 'APPROVED', reviewedAt: '2026-11-08T03:00:00Z' };
export const cancelledRequest: AuthorRequest = { ...pendingRequest, requestId: 101, status: 'CANCELLED', createdAt: '2026-10-01T02:00:00Z' };

const APPLICANTS = [
  ['hoaithu', 'Lê Hoài Thu'],
  ['minhquan', 'Trần Minh Quân'],
  ['ngocanh', 'Phạm Ngọc Anh'],
  ['khanhly', 'Đỗ Khánh Ly'],
  ['baolam', 'Ngô Bảo Lâm'],
] as const;

export const adminQueue: AdminAuthorRequestItem[] = APPLICANTS.map(([username, pen], i) => ({
  requestId: 142 + i,
  proposedPenName: pen.split(' ').slice(-2).join(' '),
  status: 'PENDING',
  createdAt: new Date(Date.UTC(2026, 10, 7 + i, 14 - i)).toISOString(),
  reviewedAt: null,
  applicant: { userId: 300 + i, username, avatarUrl: null },
  previouslyRejected: i === 0 || i === 3,
}));

export const adminQueuePage = (items = adminQueue, p = 0, total = items.length) =>
  page(items, p, 20, total) as PageResponse<AdminAuthorRequestItem>;

export const adminDetail: AdminAuthorRequestDetail = {
  requestId: 142,
  proposedPenName: 'Hoài Thu',
  introduction: INTRO,
  status: 'PENDING',
  reviewNote: null,
  createdAt: '2026-11-07T14:14:00Z',
  reviewedAt: null,
  applicant: {
    userId: 300,
    username: 'hoaithu',
    email: 'hoaithu@example.com',
    avatarUrl: null,
    role: 'READER',
    status: 'ACTIVE',
    joinedAt: '2026-08-27T02:00:00Z',
  },
  reviewer: null,
  otherRequests: { pending: 0, approved: 0, rejected: 1, cancelled: 1 },
};
