import { test as base, expect, type Page, type Route } from '@playwright/test';
import type { ApiErrorBody } from '../../src/types/api';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface MockResponse {
  status?: number;
  body?: unknown;
  /** Delay in ms, to see loading states */
  delay?: number;
}

type Handler = MockResponse | ((route: Route, url: URL) => MockResponse | Promise<MockResponse>);

interface MockEntry {
  method: Method;
  /** Path after /api, e.g. "/stories/abc" or a RegExp on the same */
  path: string | RegExp;
  handler: Handler;
}

export interface ApiMock {
  /** Register a response for METHOD /api<path>. Later registrations win. */
  on(method: Method, path: string | RegExp, handler: Handler): void;
  /** Shortcut for an ApiError response. */
  error(method: Method, path: string | RegExp, status: number, code: string, message?: string): void;
  /** Requests received, in order, e.g. to assert a mutation body. */
  calls: { method: string; path: string; body: unknown }[];
  /** /api calls that had no mock: the fixture fails the test if this is not empty. */
  unmatched: string[];
}

function matches(entry: MockEntry, method: string, path: string) {
  if (entry.method !== method) return false;
  return typeof entry.path === 'string' ? entry.path === path : entry.path.test(path);
}

async function installApiMock(page: Page): Promise<ApiMock> {
  const entries: MockEntry[] = [];
  const mock: ApiMock = {
    calls: [],
    unmatched: [],
    on(method, path, handler) {
      entries.unshift({ method, path, handler });
    },
    error(method, path, status, code, message = code) {
      const body: ApiErrorBody = { status, code, message };
      this.on(method, path, { status, body });
    },
  };

  // Defaults: guest visitor, CSRF endpoint answers.
  mock.on('GET', '/me', { status: 401, body: { status: 401, code: 'UNAUTHENTICATED', message: 'Login is required.' } });
  mock.on('GET', '/auth/csrf', { body: { headerName: 'X-XSRF-TOKEN', token: 'test-token' } });

  // Match on the pathname: a glob like **/api/** would also catch Vite modules under /src/api/.
  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api/, '');
    const method = request.method();
    let body: unknown = null;
    try {
      body = request.postDataJSON();
    } catch {
      body = request.postData();
    }
    mock.calls.push({ method, path: path + url.search, body });

    const entry = entries.find((e) => matches(e, method, path));
    if (!entry) {
      mock.unmatched.push(`${method} ${path}${url.search}`);
      return route.fulfill({
        status: 599,
        json: { status: 599, code: 'UNMOCKED', message: `No mock for ${method} ${path}` },
      });
    }
    const res = typeof entry.handler === 'function' ? await entry.handler(route, url) : entry.handler;
    if (res.delay) await new Promise((r) => setTimeout(r, res.delay));
    const status = res.status ?? 200;
    if (status === 204 || res.body === undefined) return route.fulfill({ status });
    return route.fulfill({ status, json: res.body });
  });

  return mock;
}

/**
 * `test` with an `api` fixture: every /api request is answered from mocks registered in the test.
 * Unmocked calls get status 599 and fail the test at the end, so a page never silently hits RDS.
 */
export const test = base.extend<{ api: ApiMock }>({
  api: async ({ page }, use) => {
    const mock = await installApiMock(page);
    await use(mock);
    expect(mock.unmatched, 'API calls without a mock').toEqual([]);
  },
});

export { expect };
