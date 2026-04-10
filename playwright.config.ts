import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E configuration for Estrevia.
 *
 * - Chromium only for MVP (faster CI)
 * - Screenshots on failure
 * - 30s timeout per test
 * - 1 retry on CI
 * - webServer starts dev server automatically when running locally
 */
export default defineConfig({
  testDir: './tests/e2e',

  /* Global test timeout */
  timeout: 30_000,

  /* Assertion timeout */
  expect: {
    timeout: 10_000,
  },

  /* Run tests in files in parallel */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 1 : 0,

  /* 1 worker — Clerk dev mode rate-limits concurrent browser sessions.
     Multiple workers sharing the same dev Clerk instance trigger 429s. */
  workers: 1,

  /* Reporter */
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'on-failure' }]],

  /* Shared settings for all projects */
  use: {
    baseURL: 'http://localhost:3000',

    /* Screenshot only on failure */
    screenshot: 'only-on-failure',

    /* Video off by default, on-first-retry in CI */
    video: process.env.CI ? 'on-first-retry' : 'off',

    /* Trace on first retry */
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Start dev server before running tests (local), production server on CI */
  webServer: {
    command: process.env.CI ? 'npm run start' : 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stderr: 'pipe',
    stdout: 'pipe',
    // Load env stubs: cp .env.ci .env.local  (or set real env vars in shell)
  },
});
