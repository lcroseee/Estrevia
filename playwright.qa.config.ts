/**
 * Temporary QA config for running E2E tests against the dev server on port 3200.
 * Used by T20 qa-final when the primary port 3000 server is unavailable.
 * Delete after use or keep for local dev convenience.
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: 1,
  workers: 1,
  reporter: 'list',

  use: {
    baseURL: 'http://localhost:3200',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Port 3200 dev server already running — no need to start one
  // webServer omitted intentionally
});
