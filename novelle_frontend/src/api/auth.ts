import { ensureCsrfToken, http } from '@/api/http';
import type { Me } from '@/types/user';

export interface LoginBody {
  /** Username or email */
  login: string;
  password: string;
}

export interface RegisterBody {
  username: string;
  email: string;
  password: string;
  displayName: string;
}

/** GET /api/auth/csrf: sets the XSRF-TOKEN cookie. */
export function getCsrf(): Promise<void> {
  return ensureCsrfToken(true);
}

/**
 * GET /api/me. A guest gets 401; that is a normal answer here, so the global 401 redirect is skipped
 * and the caller treats the user as a guest.
 */
export async function getMe(): Promise<Me> {
  const { data } = await http.get<Me>('/me', { skipGlobalErrorHandler: true });
  return data;
}

/** POST /api/auth/login. The session id changes, so a fresh CSRF token is fetched afterwards. */
export async function login(body: LoginBody): Promise<Me> {
  const { data } = await http.post<Me>('/auth/login', body, { skipGlobalErrorHandler: true });
  await ensureCsrfToken(true);
  return data;
}

/** POST /api/auth/register: creates a READER account and logs in. */
export async function register(body: RegisterBody): Promise<Me> {
  const { data } = await http.post<Me>('/auth/register', body, { skipGlobalErrorHandler: true });
  await ensureCsrfToken(true);
  return data;
}

/** POST /api/auth/logout (204). */
export async function logout(): Promise<void> {
  await http.post('/auth/logout', null, { skipGlobalErrorHandler: true });
}
