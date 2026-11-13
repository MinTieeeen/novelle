import { http } from '@/api/http';
import type { PageResponse } from '@/types/api';
import type {
  AdminAuthorRequestDetail,
  AdminAuthorRequestItem,
  AuthorRequest,
  AuthorRequestStatus,
} from '@/types/authorRequest';

/* M5 author requests: A1–A3 for the applicant (READER), A4–A7 for admins. */

/** A1: my requests, newest first (empty array when none). */
export async function getMyRequests(): Promise<AuthorRequest[]> {
  const { data } = await http.get<AuthorRequest[]>('/author-requests/me');
  return data;
}

/**
 * A2 → 201 PENDING (rate limit "author-request", 3 / day). 403 ONLY_READER_CAN_REQUEST,
 * 409 REQUEST_ALREADY_PENDING / PEN_NAME_TAKEN.
 */
export async function submitRequest(body: { proposedPenName: string; introduction: string }): Promise<AuthorRequest> {
  const { data } = await http.post<AuthorRequest>('/author-requests', body);
  return data;
}

/** A3 → CANCELLED; 409 ALREADY_PROCESSED, 404 AUTHOR_REQUEST_NOT_FOUND. */
export async function cancelRequest(requestId: number): Promise<AuthorRequest> {
  const { data } = await http.post<AuthorRequest>(`/author-requests/${requestId}/cancel`);
  return data;
}

export interface AdminRequestsQuery {
  /** default PENDING (oldest first); other statuses newest first */
  status?: AuthorRequestStatus | 'ALL';
  page?: number;
  size?: number;
}

/** A4 (ADMIN) */
export async function getAdminRequests(query: AdminRequestsQuery = {}): Promise<PageResponse<AdminAuthorRequestItem>> {
  const { data } = await http.get<PageResponse<AdminAuthorRequestItem>>('/admin/author-requests', { params: query });
  return data;
}

/** A5 (ADMIN); 404 AUTHOR_REQUEST_NOT_FOUND. */
export async function getAdminRequest(requestId: number): Promise<AdminAuthorRequestDetail> {
  const { data } = await http.get<AdminAuthorRequestDetail>(`/admin/author-requests/${requestId}`);
  return data;
}

/**
 * A6: sp_ApproveAuthorRequest makes the applicant an AUTHOR. 409 ALREADY_PROCESSED / PEN_NAME_TAKEN /
 * REVIEW_IN_PROGRESS, 403 FORBIDDEN when the applicant is no longer an active READER.
 */
export async function approveRequest(requestId: number): Promise<AdminAuthorRequestDetail> {
  const { data } = await http.post<AdminAuthorRequestDetail>(`/admin/author-requests/${requestId}/approve`);
  return data;
}

/** A7 with an optional note (≤ 500); 409 ALREADY_PROCESSED / REVIEW_IN_PROGRESS. */
export async function rejectRequest(requestId: number, note?: string): Promise<AdminAuthorRequestDetail> {
  const { data } = await http.post<AdminAuthorRequestDetail>(`/admin/author-requests/${requestId}/reject`, {
    note: note || undefined,
  });
  return data;
}
