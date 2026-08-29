import { defineConfig } from '@playwright/test';

/**
 * Browser end-to-end checks against a running local stack (`pnpm dev`).
 * Run: `PLAYWRIGHT_BROWSERS_PATH=<dir> pnpm --filter @clipsubtitles/web e2e`
 * Screenshots land in e2e/.results (gitignored) for visual inspection.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: process.env.E2E_OUTPUT_DIR ?? 'e2e/.results',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } } },
    { name: 'mobile-390', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
  ],
});
