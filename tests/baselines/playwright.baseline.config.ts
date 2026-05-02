/**
 * Separate Playwright config for baseline capture against production.
 * - No webServer (hits estrevia.app directly)
 * - Chromium only, 1 worker
 * - 60s timeout (screenshots + full-page can be slow)
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  forbidOnly: false,
  retries: 1,
  workers: 1,
  reporter: [['list']],
  use: {
    screenshot: 'on',
    video: 'off',
    trace: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // No webServer — we hit production directly
});
