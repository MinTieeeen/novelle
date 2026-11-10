import axios, { AxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios';
import type { ApiErrorBody, CsrfResponse } from '@/types/api';

const XSRF_COOKIE = 'XSRF-TOKEN';
const XSRF_HEADER = 'X-XSRF-TOKEN';
const SAFE_METHODS = new Set(['get', 'head', 'options']);

/** Error thrown by every function in src/api/: the backend ApiError body, or a synthetic one. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: ApiErrorBody['details'];

  constructor(body: ApiErrorBody) {
    super(body.message);
    this.name = 'ApiError';
    this.status = body.status;
    this.code = body.code;
    this.details = body.details ?? null;
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

/**
 * Global reactions to some errors (redirect to /login, toast). Registered once by the app shell
 * (see app/providers.tsx) so this module stays free of React and routing.
 */
export interface HttpErrorHandlers {
  onUnauthenticated?: (error: ApiError, config: AxiosRequestConfig) => void;
  onForbidden?: (error: ApiError, config: AxiosRequestConfig) => void;
  /** 403 ACCOUNT_BANNED during a session (UserStatusFilter destroyed it). */
  onBanned?: (error: ApiError) => void;
  onRateLimited?: (error: ApiError) => void;
  onServerError?: (error: ApiError) => void;
}

let handlers: HttpErrorHandlers = {};

export function setHttpErrorHandlers(next: HttpErrorHandlers) {
  handlers = next;
}

/** Per-request options read by the interceptors. */
declare module 'axios' {
  interface AxiosRequestConfig {
    /** Do not run the global 401/403/429/5xx handlers (the caller shows its own message). */
    skipGlobalErrorHandler?: boolean;
    /** Internal: set after one CSRF refresh so a request is retried at most once. */
    _csrfRetried?: boolean;
  }
}

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  withCredentials: true,
  // The backend uses CookieCsrfTokenRepository (plain token): the cookie value goes into the header.
  xsrfCookieName: XSRF_COOKIE,
  xsrfHeaderName: XSRF_HEADER,
  headers: { Accept: 'application/json' },
  timeout: 20_000,
});

function readCookie(name: string): string | null {
  const match = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

let csrfRequest: Promise<void> | null = null;

/**
 * Makes sure the XSRF-TOKEN cookie exists. Spring issues it lazily, so the SPA asks for it before
 * the first write. Concurrent callers share one request.
 */
export function ensureCsrfToken(force = false): Promise<void> {
  if (!force && readCookie(XSRF_COOKIE)) return Promise.resolve();
  csrfRequest ??= http
    .get<CsrfResponse>('/auth/csrf', { skipGlobalErrorHandler: true })
    .then(() => undefined)
    .finally(() => {
      csrfRequest = null;
    });
  return csrfRequest;
}

http.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const method = (config.method ?? 'get').toLowerCase();
  if (!SAFE_METHODS.has(method) && !config.url?.endsWith('/auth/csrf')) {
    await ensureCsrfToken();
    const token = readCookie(XSRF_COOKIE);
    if (token) config.headers.set(XSRF_HEADER, token);
  }
  return config;
});

function toApiError(error: AxiosError<ApiErrorBody>): ApiError {
  const body = error.response?.data;
  if (body && typeof body === 'object' && typeof body.code === 'string') return new ApiError(body);
  if (error.response) {
    return new ApiError({
      status: error.response.status,
      code: error.response.status >= 500 ? 'INTERNAL_ERROR' : 'HTTP_ERROR',
      message: error.message,
    });
  }
  return new ApiError({ status: 0, code: 'NETWORK_ERROR', message: error.message });
}

http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorBody>) => {
    if (axios.isCancel(error)) throw error;
    const apiError = toApiError(error);
    const config = error.config;

    // Expired or rotated CSRF token (e.g. after login): fetch a new one and retry once.
    if (apiError.code === 'CSRF_INVALID' && config && !config._csrfRetried) {
      config._csrfRetried = true;
      await ensureCsrfToken(true);
      return http.request(config);
    }

    if (config && !config.skipGlobalErrorHandler) {
      if (apiError.status === 401) handlers.onUnauthenticated?.(apiError, config);
      else if (apiError.code === 'ACCOUNT_BANNED') handlers.onBanned?.(apiError);
      else if (apiError.status === 403 && apiError.code === 'FORBIDDEN') handlers.onForbidden?.(apiError, config);
      else if (apiError.status === 429) handlers.onRateLimited?.(apiError);
      else if (apiError.status >= 500 || apiError.status === 0) handlers.onServerError?.(apiError);
    }
    throw apiError;
  },
);
