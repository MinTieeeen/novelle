import { z } from 'zod';
import type { UserRef } from '@/types/library';
import type { Role } from '@/types/user';

/* M5 author requests (docs/module-author-request.md §7). */

export type AuthorRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export const REQUEST_STATUS_LABEL: Record<AuthorRequestStatus, string> = {
  PENDING: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Từ chối',
  CANCELLED: 'Đã huỷ',
};

/** Tabs of AD3, in board order. */
export const REQUEST_STATUSES: AuthorRequestStatus[] = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];

/** A1–A3: a request as its applicant sees it. */
export interface AuthorRequest {
  requestId: number;
  proposedPenName: string;
  introduction: string;
  status: AuthorRequestStatus;
  reviewNote?: string | null;
  createdAt: string;
  reviewedAt?: string | null;
}

/** A4 GET /api/admin/author-requests: one line of the review queue. */
export interface AdminAuthorRequestItem {
  requestId: number;
  proposedPenName: string;
  status: AuthorRequestStatus;
  createdAt: string;
  reviewedAt?: string | null;
  applicant: UserRef;
  previouslyRejected: boolean;
}

/** A5–A7: one request for an admin. `reviewer` is absent while pending or cancelled. */
export interface AdminAuthorRequestDetail {
  requestId: number;
  proposedPenName: string;
  introduction: string;
  status: AuthorRequestStatus;
  reviewNote?: string | null;
  createdAt: string;
  reviewedAt?: string | null;
  applicant: {
    userId: number;
    username: string;
    email: string;
    avatarUrl?: string | null;
    role: Role;
    status: 'ACTIVE' | 'BANNED';
    joinedAt: string;
  };
  reviewer?: UserRef | null;
  otherRequests: { pending: number; approved: number; rejected: number; cancelled: number };
}

/* ------------------------------------------------------------------------------------------------
 * Limits copy the service (module-author-request §7.5): checked after trimming.
 * ---------------------------------------------------------------------------------------------- */

export const PEN_NAME_MIN = 2;
export const PEN_NAME_MAX = 100;
export const INTRO_MIN = 20;
export const INTRO_MAX = 2000;
export const REVIEW_NOTE_MAX = 500;

export const REQUEST_MSG = {
  penName: `Bút danh từ ${PEN_NAME_MIN} đến ${PEN_NAME_MAX} ký tự.`,
  intro: `Giới thiệu từ ${INTRO_MIN} đến 2.000 ký tự: bạn viết thể loại gì, đã viết bao lâu, định đăng truyện thế nào.`,
  agree: 'Đánh dấu ô cam kết trước khi gửi yêu cầu.',
  note: 'Ghi chú tối đa 500 ký tự.',
  penTaken: 'Bút danh này đã thuộc về tác giả khác. Chọn bút danh khác.',
} as const;

export const authorRequestSchema = z.object({
  proposedPenName: z.string().trim().min(PEN_NAME_MIN, REQUEST_MSG.penName).max(PEN_NAME_MAX, REQUEST_MSG.penName),
  introduction: z.string().trim().min(INTRO_MIN, REQUEST_MSG.intro).max(INTRO_MAX, REQUEST_MSG.intro),
  /** frontend only: the commitment box of the R10 board */
  agree: z.literal(true, { error: REQUEST_MSG.agree }),
});
export type AuthorRequestValues = z.infer<typeof authorRequestSchema>;

export const rejectSchema = z.object({
  note: z.string().trim().max(REVIEW_NOTE_MAX, REQUEST_MSG.note),
});
export type RejectValues = z.infer<typeof rejectSchema>;

/** "AR-0142" (board AD4). */
export function requestCode(requestId: number): string {
  return `AR-${String(requestId).padStart(4, '0')}`;
}

/** The request that decides the R10 screen: the newest one (A1 is newest first). */
export function currentRequest(requests: AuthorRequest[]): AuthorRequest | null {
  return requests[0] ?? null;
}

/** Badge variant per status (DS Badge: pending = warning, approved = success, rejected = critical, cancelled = outline). */
export const REQUEST_STATUS_VARIANT: Record<AuthorRequestStatus, 'warning' | 'success' | 'critical' | 'outline'> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'critical',
  CANCELLED: 'outline',
};

/**
 * How long a pending request has waited (AD3 board): "Mới gửi hôm nay", "Chờ 1 ngày", "Chờ 5 ngày", counted in
 * whole Vietnam calendar days.
 */
export function waitingLabel(createdAt: string, now: Date = new Date()): string {
  const day = (d: Date) => Math.floor((d.getTime() + 7 * 3_600_000) / 86_400_000);
  const days = day(now) - day(new Date(createdAt));
  return days <= 0 ? 'Mới gửi hôm nay' : `Chờ ${days} ngày`;
}
