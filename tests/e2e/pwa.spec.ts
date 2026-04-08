import { test, expect } from '@playwright/test';

/**
 * PWA E2E tests.
 *
 * Verifies:
 * 1. /manifest.json — accessible, valid JSON, required W3C fields
 * 2. HTML head meta tags — viewport, theme-color, manifest link, OG tags
 * 3. Mobile viewport rendering — 375px minimum supported width
 *
 * Does not test the install prompt (requires browser heuristics + user gesture).
 */

test.describe('Web App Manifest', () => {
  test('GET /manifest.json returns 200', async ({ request }) => {
    const response = await request.get('/manifest.json');
    expect(response.status()).toBe(200);
  });

  test('/manifest.json has JSON content-type', async ({ request }) => {
    const response = await request.get('/manifest.json');
    const contentType = response.headers()['content-type'] ?? '';
    expect(contentType).toMatch(/json/);
  });

  test('/manifest.json is valid JSON', async ({ request }) => {
    const response = await request.get('/manifest.json');
    const text = await response.text();

    expect(() => JSON.parse(text)).not.toThrow();
  });

  test('/manifest.json has required PWA fields', async ({ request }) => {
    const response = await request.get('/manifest.json');
    const manifest = await response.json() as Record<string, unknown>;

    // W3C Web App Manifest required fields
    expect(manifest).toHaveProperty('name');
    expect(manifest).toHaveProperty('short_name');
    expect(manifest).toHaveProperty('start_url');
    expect(manifest).toHaveProperty('display');
    expect(manifest).toHaveProperty('icons');
  });

  test('/manifest.json name is "Estrevia"', async ({ request }) => {
    const response = await request.get('/manifest.json');
    const manifest = await response.json() as Record<string, unknown>;
    expect(manifest['name']).toBe('Estrevia');
  });

  test('/manifest.json display is "standalone"', async ({ request }) => {
    const response = await request.get('/manifest.json');
    const manifest = await response.json() as Record<string, unknown>;
    expect(manifest['display']).toBe('standalone');
  });

  test('/manifest.json start_url is "/chart"', async ({ request }) => {
    const response = await request.get('/manifest.json');
    const manifest = await response.json() as Record<string, unknown>;
    expect(manifest['start_url']).toBe('/chart');
  });

  test('/manifest.json theme_color is #0A0A0F', async ({ request }) => {
    const response = await request.get('/manifest.json');
    const manifest = await response.json() as Record<string, unknown>;
    expect(manifest['background_color']).toBe('#0A0A0F');
    expect(manifest['theme_color']).toBe('#0A0A0F');
  });

  test('/manifest.json icons array is non-empty', async ({ request }) => {
    const response = await request.get('/manifest.json');
    const manifest = await response.json() as Record<string, unknown>;
    const icons = manifest['icons'];
    expect(Array.isArray(icons)).toBe(true);
    expect((icons as unknown[]).length).toBeGreaterThan(0);
  });
});

test.describe('PWA meta tags in HTML head', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
  });

  test('manifest link rel="manifest" is in head', async ({ page }) => {
    const manifestLink = page.locator('link[rel="manifest"]');
    await expect(manifestLink).toHaveCount(1);
    const href = await manifestLink.getAttribute('href');
    expect(href).toContain('manifest');
  });

  test('theme-color meta tag is #0A0A0F', async ({ page }) => {
    const themeColor = page.locator('meta[name="theme-color"]');
    await expect(themeColor).toHaveCount(1);
    await expect(themeColor).toHaveAttribute('content', '#0A0A0F');
  });

  test('apple-mobile-web-app-capable is "yes"', async ({ page }) => {
    const appleMeta = page.locator('meta[name="apple-mobile-web-app-capable"]');
    await expect(appleMeta).toHaveCount(1);
    await expect(appleMeta).toHaveAttribute('content', 'yes');
  });

  test('viewport meta tag has width=device-width', async ({ page }) => {
    const viewport = page.locator('meta[name="viewport"]');
    await expect(viewport).toHaveCount(1);
    const content = await viewport.getAttribute('content');
    expect(content).toContain('width=device-width');
  });

  test('og:title is set on root page', async ({ page }) => {
    const ogTitle = page.locator('meta[property="og:title"]');
    await expect(ogTitle).toHaveCount(1);
    const content = await ogTitle.getAttribute('content');
    expect(content?.length).toBeGreaterThan(5);
  });

  test('og:description is set on root page', async ({ page }) => {
    const ogDesc = page.locator('meta[property="og:description"]');
    await expect(ogDesc).toHaveCount(1);
    const content = await ogDesc.getAttribute('content');
    expect(content?.length).toBeGreaterThan(20);
  });
});

test.describe('PWA icon assets', () => {
  test('/icons/icon.svg is accessible', async ({ request }) => {
    const response = await request.get('/icons/icon.svg');
    expect(response.status()).toBe(200);
    const contentType = response.headers()['content-type'] ?? '';
    expect(contentType).toContain('svg');
  });

  test('apple-touch-icon link points to /icons/icon.svg', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    const appleIcon = page.locator('link[rel="apple-touch-icon"]');
    await expect(appleIcon).toHaveCount(1);
    const href = await appleIcon.getAttribute('href');
    expect(href).toContain('icon.svg');
  });
});

test.describe('PWA — mobile viewport', () => {
  test('landing page renders h1 at 375px width', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toBeVisible();
  });

  test('/moon renders at 375px without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/moon');
    await page.waitForLoadState('domcontentloaded');

    // Body scrollWidth should not exceed viewport width (no horizontal scroll)
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(380); // 5px tolerance
  });

  test('/why-sidereal renders at 375px without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/why-sidereal');
    await page.waitForLoadState('domcontentloaded');

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(380);
  });
});
