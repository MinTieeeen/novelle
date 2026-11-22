import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';

// Credentials for the live project (never committed, never printed): novelle_frontend/.env.e2e.local
loadEnv({ path: '.env.e2e.local', quiet: true });

/**
 * Playwright runs on the Edge already installed on Windows (channel "msedge"), so no browser download
 * is needed. Set PW_CHANNEL=chromium after `npx playwright install chromium` to use the bundled one.
 *
 * Projects:
 * - desktop / mobile: the default. Every /api call is mocked (e2e/fixtures/api.ts); unmocked calls fail
 *   the test. Safe to run any time: nothing reaches RDS or Redis.
 * - live: tests tagged @live against the real backend on :8080 (read-only flows + login with test
 *   accounts). Run only when the user asks: `npm run test:e2e:live`.
 */
const channel = process.env.PW_CHANNEL ?? 'msedge';
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:5173';

export default defineConfig({
  testDir: './e2e',
  outputDir: './tmp/playwright/results',
  fullyParallel: true,
  // The Vite dev server transforms modules on first request; more workers than this time out on a cold start.
  workers: 3,
  timeout: 60_000,
  // Lazy routes are compiled on first request; 5s is too short under 3 parallel workers.
  expect: { timeout: 10_000 },
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: './tmp/playwright/report', open: 'never' }]],
  use: {
    baseURL,
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      grepInvert: /@live/,
      use: { ...devices['Desktop Chrome'], channel, viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile',
      grepInvert: /@live|@desktop-only/,
      use: { ...devices['Pixel 7'], channel },
    },
    {
      name: 'live',
      grep: /@live/,
      use: { ...devices['Desktop Chrome'], channel, viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: baseURL,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
