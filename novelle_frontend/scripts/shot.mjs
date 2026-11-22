#!/usr/bin/env node
/**
 * Screenshot a route of the running dev server for visual checks (fallback when the VS Code
 * integrated browser is not reachable). Output: tmp/shots/<name>.png
 *
 *   npm run shot -- /dev/design-system
 *   npm run shot -- /studio --role author --width 1440 --name studio-author
 *   npm run shot -- /search --mock e2e/mocks/search.json --width 390 --full
 *
 * Options
 *   --width <px>      viewport width (default 1440; use 390 for mobile)
 *   --height <px>     viewport height (default 900)
 *   --role guest|reader|author|admin  mocks GET /api/me (default: not mocked)
 *   --mock <file>     JSON { "GET /stories": {...body}, "GET /home": { "status": 500, "body": {...} } }
 *                     keys are "METHOD /path-after-api"; a value with "status" is used as a full response
 *   --full            full-page screenshot
 *   --wait <ms>       extra wait after network idle (default 300)
 *   --name <name>     file name (default derived from the route)
 * API calls without a mock go through the Vite proxy to the real backend: only GET routes should be
 * shot that way, and only when the user agreed to hit RDS.
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
// Git Bash (MSYS) rewrites "/dev/x" to "C:/Program Files/Git/dev/x": undo it. "dev/x" (no slash) also works.
const rawRoute = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--') && args[i - 1] !== '--full')) ?? '/';
const route = '/' + rawRoute.replace(/^[A-Za-z]:\/.*?\/Git\//, '').replace(/^\/+/, '');
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const flag = (name) => args.includes(`--${name}`);

const width = Number(opt('width', 1440));
const height = Number(opt('height', 900));
const role = opt('role');
const mockFile = opt('mock');
const wait = Number(opt('wait', 300));
const name = opt('name', (route === '/' ? 'home' : route.slice(1).replace(/[^a-z0-9]+/gi, '-')) + `-${width}`);
const base = process.env.E2E_BASE_URL ?? 'http://localhost:5173';

const ME = {
  reader: { userId: 101, username: 'lananh', email: 'lananh@example.com', displayName: 'Lan Anh', role: 'READER', status: 'ACTIVE', createdAt: '2026-09-01T02:00:00Z', rowVersion: 'AAAAAAAAB9E=' },
  author: { userId: 201, username: 'moclan', email: 'moclan@example.com', displayName: 'Mộc Lan', role: 'AUTHOR', status: 'ACTIVE', createdAt: '2026-09-01T02:00:00Z', rowVersion: 'AAAAAAAAB9E=', author: { penName: 'Mộc Lan', isVerified: true, followerCount: 1280 } },
  admin: { userId: 1, username: 'admin', email: 'admin@example.com', displayName: 'Quản trị viên', role: 'ADMIN', status: 'ACTIVE', createdAt: '2026-09-01T02:00:00Z', rowVersion: 'AAAAAAAAB9E=' },
};

const mocks = {};
if (role === 'guest') mocks['GET /me'] = { status: 401, body: { status: 401, code: 'UNAUTHENTICATED', message: 'Login is required.' } };
else if (role) mocks['GET /me'] = { status: 200, body: ME[role] };
if (mockFile) {
  for (const [key, value] of Object.entries(JSON.parse(readFileSync(resolve(mockFile), 'utf8')))) {
    mocks[key] = value && typeof value === 'object' && 'status' in value ? value : { status: 200, body: value };
  }
}

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'msedge' });
const page = await browser.newPage({ viewport: { width, height }, locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh' });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));

await page.route((url) => url.pathname.startsWith('/api/'), (r) => {
  const url = new URL(r.request().url());
  const key = `${r.request().method()} ${url.pathname.replace(/^\/api/, '')}`;
  const m = mocks[key];
  return m ? r.fulfill({ status: m.status, json: m.body }) : r.continue();
});

await page.goto(base + route, { waitUntil: 'networkidle' });
await page.waitForTimeout(wait);
mkdirSync('tmp/shots', { recursive: true });
const out = resolve('tmp/shots', `${name}.png`);
await page.screenshot({ path: out, fullPage: flag('full') });
await browser.close();

console.log(out);
for (const e of errors) console.log(e);
