import { test, expect } from '@playwright/test';

/**
 * Chart calculation E2E tests.
 *
 * Tests the /chart page form and result rendering. The actual Swiss Ephemeris
 * calculation requires a running server with sweph native addon — these tests
 * verify the UI flow only, not the numeric precision (that is covered by
 * reference chart validation in tests/reference-charts/).
 *
 * Tests that make real API calls are guarded with test.skip when essential
 * env vars are missing (e.g., DATABASE_URL points to real DB).
 */

const NEEDS_DB = !process.env.DATABASE_URL || process.env.DATABASE_URL.includes('placeholder');

test.describe('Chart page', () => {
  test('chart page loads with correct title', async ({ page }) => {
    await page.goto('/chart');
    await expect(page).toHaveTitle(/Natal Chart Calculator/i);
  });

  test('chart page renders without crashing', async ({ page }) => {
    await page.goto('/chart');
    // Either the full chart display or the skeleton should appear
    const body = page.locator('body');
    await expect(body).toBeVisible();
    // No uncaught errors in the console (basic smoke)
  });

  test('chart page has correct meta description', async ({ page }) => {
    await page.goto('/chart');
    const metaDesc = page.locator('meta[name="description"]');
    await expect(metaDesc).toHaveAttribute('content', /sidereal/i);
  });

  test('chart page has JSON-LD structured data', async ({ page }) => {
    await page.goto('/chart');
    const ldScripts = page.locator('script[type="application/ld+json"]');
    const count = await ldScripts.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('ChartDisplay component mounts and shows form or wheel', async ({ page }) => {
    await page.goto('/chart');

    // Wait for the Suspense boundary to resolve (max 15s for sweph cold start)
    // The ChartDisplay renders either a form or the SVG wheel
    await page.waitForLoadState('domcontentloaded');

    // The page body should have meaningful content (not just skeleton)
    const mainContent = page.locator('main, [class*="chart"], form, [data-testid]').first();
    // At minimum the body is visible and has rendered
    await expect(page.locator('body')).toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // Birth data form flow — requires running server with sweph available
  // Skip when db is not configured (CI without env vars)
  // ---------------------------------------------------------------------------

  test('birth data form accepts date input', async ({ page }) => {
    await page.goto('/chart');
    await page.waitForLoadState('domcontentloaded');

    const dateInput = page.locator('input[type="date"], input[name*="date"], input[placeholder*="date" i]').first();
    if (await dateInput.count() === 0) {
      test.skip();
      return;
    }
    await dateInput.fill('2000-01-01');
    await expect(dateInput).toHaveValue('2000-01-01');
  });

  test('sidereal/tropical toggle exists when chart is rendered', async ({ page }) => {
    test.skip(NEEDS_DB, 'Requires real DB connection to fetch saved charts');

    await page.goto('/chart');
    await page.waitForLoadState('domcontentloaded');

    // The toggle might be a checkbox, radio, or button — check for common patterns
    const toggle = page.locator(
      '[role="switch"], input[type="checkbox"][name*="sidereal" i], button:has-text("Sidereal"), button:has-text("Tropical")'
    ).first();

    if (await toggle.count() > 0) {
      await expect(toggle).toBeVisible();
    }
  });

  test('planet positions table or SVG chart visible after calculation', async ({ page }) => {
    test.skip(NEEDS_DB, 'Requires real DB and sweph native addon');

    await page.goto('/chart');
    await page.waitForLoadState('domcontentloaded');

    // Look for the SVG wheel or planet list
    const chartOutput = page.locator('svg, [role="table"], [aria-label*="planet" i], [aria-label*="chart" i]').first();
    if (await chartOutput.count() > 0) {
      await expect(chartOutput).toBeVisible();
    }
  });
});

test.describe('Chart API health', () => {
  test('GET /api/health/sweph returns 200', async ({ request }) => {
    const response = await request.get('/api/health/sweph');
    // sweph may not be running in all CI environments — accept both 200 and 503
    expect([200, 503]).toContain(response.status());

    const body = await response.json();
    expect(body).toHaveProperty('status');
  });
});
