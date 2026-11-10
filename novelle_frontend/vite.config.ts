/// <reference types="vitest/config" />
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const apiBase = env.VITE_API_BASE_URL || '/api';

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },
    },
    server: {
      port: 5173,
      strictPort: true,
      // Pre-transform the shell so the first page load (and parallel Playwright workers) is fast.
      warmup: { clientFiles: ['./src/main.tsx', './src/app/router.tsx', './src/layouts/*.tsx'] },
      // Same origin for the SPA and the API, so the SESSION and XSRF-TOKEN cookies work without cross-site settings.
      proxy: {
        [apiBase]: {
          target: env.VITE_API_PROXY_TARGET || 'http://localhost:8080',
          changeOrigin: false,
        },
      },
    },
    test: {
      environment: 'jsdom',
      // Playwright specs live in e2e/ and run with `npm run test:e2e`.
      include: ['src/**/*.test.{ts,tsx}'],
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      css: false,
    },
  };
});
