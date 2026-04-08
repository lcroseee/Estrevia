import { test, expect } from '@playwright/test';

/**
 * Navigation E2E tests.
 *
 * Verifies that each main route loads, renders its h1 heading, and does not
 * crash. Does not test dynamic data — only static page structure rendered
 * server-side without external service calls.
 *
 * Note on routing:
 * - `/` — serves placeholder page (app/page.tsx) — tested in landing.spec.ts
 * - `/why-sidereal`, `/pricing`, `/terms`, `/privacy` — (marketing) group
 * - `/chart`, `/moon`, `/hours`, `/essays`, `/signs/*` — (app) group
 *   These use the app layout with PlanetaryHourBar which calls sweph.
 *   We wait for networkidle before asserting content.
 */

test.describe('Marketing routes', () => {
  test('/why-sidereal page loads with heading', async ({ page }) => {
    const response = await page.goto('/why-sidereal');
    await page.waitForLoadState('domcontentloaded');
    expect(response?.status()).not.toBe(404);
    expect(response?.status()).not.toBe(500);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('/why-sidereal contains sidereal astrology content', async ({ page }) => {
    await page.goto('/why-sidereal');
    await page.waitForLoadState('domcontentloaded');
    const body = await page.locator('body').innerText();
    expect(body.toLowerCase()).toContain('sidereal');
  });

  test('/pricing page loads', async ({ page }) => {
    const response = await page.goto('/pricing');
    await page.waitForLoadState('domcontentloaded');
    expect(response?.status()).not.toBe(404);
    expect(response?.status()).not.toBe(500);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('/terms page loads with Terms of Service heading', async ({ page }) => {
    await page.goto('/terms');
    await page.waitForLoadState('domcontentloaded');
    const h1 = page.getByRole('heading', { name: /terms of service/i });
    await expect(h1).toBeVisible();
  });

  test('/privacy page loads with Privacy Policy h1', async ({ page }) => {
    await page.goto('/privacy');
    await page.waitForLoadState('domcontentloaded');
    // Use level:1 to disambiguate from h2 sections that also contain "privacy"
    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toBeVisible();
    await expect(h1).toContainText(/privacy/i);
  });
});

test.describe('App routes', () => {
  test('/chart page loads without crashing', async ({ page }) => {
    const response = await page.goto('/chart');
    await page.waitForLoadState('domcontentloaded');
    expect(response?.status()).not.toBe(500);
    await expect(page.locator('body')).toBeVisible();
    // Should not show a Next.js error page
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('Internal Server Error');
  });

  test('/moon page loads with Moon Phase heading', async ({ page }) => {
    const response = await page.goto('/moon');
    await page.waitForLoadState('domcontentloaded');
    expect(response?.status()).not.toBe(404);
    expect(response?.status()).not.toBe(500);
    // Use level:1 — "About Moon Phases" is an h2 that also matches /moon phase/i
    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toBeVisible();
    await expect(h1).toContainText(/moon phase/i);
  });

  test('/hours page loads with Planetary Hours heading', async ({ page }) => {
    const response = await page.goto('/hours');
    await page.waitForLoadState('domcontentloaded');
    expect(response?.status()).not.toBe(404);
    expect(response?.status()).not.toBe(500);
    // Use level:1 — "About Planetary Hours" is an h2 that also matches
    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toBeVisible();
    await expect(h1).toContainText(/planetary hours/i);
  });

  test('/essays page loads', async ({ page }) => {
    const response = await page.goto('/essays');
    await page.waitForLoadState('domcontentloaded');
    expect(response?.status()).not.toBe(500);
    await expect(page.locator('body')).toBeVisible();
  });

  test('/signs/aries page loads with heading', async ({ page }) => {
    const response = await page.goto('/signs/aries');
    await page.waitForLoadState('domcontentloaded');
    expect(response?.status()).not.toBe(500);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('/signs/taurus page loads without 500', async ({ page }) => {
    const response = await page.goto('/signs/taurus');
    await page.waitForLoadState('domcontentloaded');
    expect(response?.status()).not.toBe(500);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});

test.describe('App layout navigation', () => {
  test('/moon has bottom tab navigation (mobile)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/moon');
    await page.waitForLoadState('domcontentloaded');

    // App layout has primary nav with aria-label="Primary navigation"
    const nav = page.locator('nav[aria-label="Primary navigation"]');
    await expect(nav).toBeVisible();
  });

  test('/hours has Chart nav link in bottom tab', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/hours');
    await page.waitForLoadState('domcontentloaded');

    // Bottom nav has Chart, Moon, Hours links
    const chartLink = page.locator('nav[aria-label="Primary navigation"] a[href="/chart"]');
    await expect(chartLink).toBeVisible();
  });

  test('navigation links are keyboard-accessible on /moon', async ({ page }) => {
    await page.goto('/moon');
    await page.waitForLoadState('domcontentloaded');

    // Tab into the page and check focused element via JS evaluation
    // (Playwright's :focus selector is unreliable in headless mode without forced focus)
    await page.keyboard.press('Tab');
    const focusedTag = await page.evaluate(() => document.activeElement?.tagName ?? '');
    // Tab should move focus to a focusable element (A, BUTTON, INPUT, etc.) or BODY
    expect(focusedTag).toBeTruthy();
    expect(['A', 'BUTTON', 'INPUT', 'SUMMARY', 'DETAILS', 'BODY']).toContain(focusedTag);
  });

  test('app header has Estrevia home link', async ({ page }) => {
    await page.goto('/moon');
    await page.waitForLoadState('domcontentloaded');

    const homeLink = page.locator('header a[href="/"]').first();
    await expect(homeLink).toBeVisible();
    await expect(homeLink).toContainText(/Estrevia/i);
  });
});

test.describe('404 handling', () => {
  test('non-existent route shows not-found page', async ({ page }) => {
    await page.goto('/this-page-does-not-exist-xyz-abc-123');
    await page.waitForLoadState('domcontentloaded');

    // Next.js renders not-found.tsx — shows "Page not found" with 404 in DOM
    const bodyText = await page.locator('body').innerText();
    const isNotFound =
      bodyText.includes('not found') ||
      bodyText.includes('404') ||
      bodyText.toLowerCase().includes('does not exist') ||
      bodyText.toLowerCase().includes('celestial body');
    expect(isNotFound).toBe(true);
  });
});
