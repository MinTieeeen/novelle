/** Body of every error response from the backend (com.novelle.exception.ApiError). */
export interface ApiErrorBody {
  status: number;
  code: string;
  message: string;
  details?: FieldError[] | Record<string, unknown> | null;
}

/** One invalid field of a request (validation errors put a list of these in `details`). */
export interface FieldError {
  field: string;
  message: string;
}

/** One page of a list, shared by every paged endpoint (com.novelle.dto.PageResponse). */
export interface PageResponse<T> {
  items: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

/** GET /api/auth/csrf */
export interface CsrfResponse {
  headerName: string;
  token: string;
}
