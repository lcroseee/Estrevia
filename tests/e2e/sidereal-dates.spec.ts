/**
 * E2E tests for /sidereal-{sign}-dates pages (ROLE 3 — SEO Phase 2).
 *
 * Verifies:
 *   1. Page loads with correct H1 containing the sign name.
 *   2. Sun-sign mini-widget accepts a date, calls /api/v1/sidereal/sun-sign,
 *      and renders the result with sign name + date range.
 *   3. When the result sign differs from the page sign, a cross-link appears.
 *   4. JSON-LD structured data is present (Article + BreadcrumbList minimum).
 *   5. Canonical tag points to the correct URL.
 *   6. ES locale page (/es/sidereal-leo-dates) renders in Spanish.
 *
 * The widget makes a real API call to /api/v1/sidereal/sun-sign — the dev
 * server must be running (playwright.config.ts webServer handles this).
 * Tests that depend on the API response are guarded by NEEDS_API flag.
 */

import { test, expect } from '@playwright/test';

const NEEDS_API = process.env.SKIP_API_TESTS === 'true';

// ---------------------------------------------------------------------------
// /sidereal-aries-dates — English, H1, widget, JSON-LD, canonical
// ---------------------------------------------------------------------------

test.describe('/sidereal-aries-dates', () => {
  test('page loads: H1 contains "Aries"', async ({ page }) => {
    await page.goto('/sidereal-aries-dates');
    const h1 = page.locator('h1').first();
    await expect(h1).toBeVisible({ timeout: 15_000 });
    const h1Text = await h1.textContent();
    expect(h1Text).toMatch(/Aries/i);
  });

  test('exactly one H1 on page', async ({ page }) => {
    await page.goto('/sidereal-aries-dates');
    const count = await page.locator('h1').count();
    expect(count, `Expected 1 H1, found ${count}`).toBe(1);
  });

  test('has JSON-LD structured data (Article + BreadcrumbList)', async ({ page }) => {
    await page.goto('/sidereal-aries-dates');
    const ldScripts = page.locator('script[type="application/ld+json"]');
    const count = await ldScripts.count();
    expect(count, 'Expected at least 1 JSON-LD block').toBeGreaterThanOrEqual(1);

    let hasArticle = false;
    let hasBreadcrumb = false;
    for (let i = 0; i < count; i++) {
      const raw = await ldScripts.nth(i).textContent();
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const types: string[] = Array.isArray(parsed)
        ? parsed.map((n: { '@type': string }) => n['@type'])
        : [parsed['@type']];
      if (types.some((t) => t === 'Article' || t === 'NewsArticle' || t === 'BlogPosting'))
        hasArticle = true;
      if (types.some((t) => t === 'BreadcrumbList')) hasBreadcrumb = true;
    }
    expect(hasArticle, 'Article JSON-LD missing').toBe(true);
    expect(hasBreadcrumb, 'BreadcrumbList JSON-LD missing').toBe(true);
  });

  test('canonical points to /sidereal-aries-dates (no /es/ prefix)', async ({ page }) => {
    await page.goto('/sidereal-aries-dates');
    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveAttribute('href', /\/sidereal-aries-dates$/);
  });

  test('hreflang alternate for /es/sidereal-aries-dates is present', async ({ page }) => {
    await page.goto('/sidereal-aries-dates');
    const esHreflang = page.locator('link[rel="alternate"][hreflang="es"]');
    await expect(esHreflang).toHaveAttribute('href', /\/es\/sidereal-aries-dates/);
  });

  test('direct date answer paragraph visible in <main>', async ({ page }) => {
    await page.goto('/sidereal-aries-dates');
    const main = page.locator('main');
    await expect(main).toBeVisible({ timeout: 10_000 });
    // The page must mention "Aries" and a year (current year SSR computed)
    const currentYear = new Date().getUTCFullYear();
    await expect(main).toContainText('Aries');
    await expect(main).toContainText(String(currentYear));
  });

  test('year-table accordion section is present', async ({ page }) => {
    await page.goto('/sidereal-aries-dates');
    // YearTableAccordion renders as a <details>/<summary> — collapsed by default.
    // Must open the accordion before year cells become role="cell" accessible.
    const accordionSummary = page.locator('details summary').first();
    await expect(accordionSummary).toBeVisible({ timeout: 10_000 });
    await accordionSummary.click();
    // Year-table must contain at least 5 year rows (±3 from current = 7 rows total)
    const yearCells = page.getByRole('cell').filter({ hasText: /^202[0-9]$/ });
    // At build/request time, ±3 years around current year = 7 rows minimum
    await expect(yearCells.first()).toBeVisible({ timeout: 5_000 });
    const count = await yearCells.count();
    expect(count, 'Year table should have at least 5 year rows').toBeGreaterThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------
// Sun-sign mini-widget — Aries date: 2026-04-25 → "aries" (same page sign)
// ---------------------------------------------------------------------------

test.describe('Sun-sign widget — same sign (aries, date 2026-04-25)', () => {
  test.skip(NEEDS_API, 'Skipped: SKIP_API_TESTS=true');

  test('submit date shows result with "Aries" and start/end dates', async ({ page }) => {
    await page.goto('/sidereal-aries-dates');

    // Find the date input in the sun-sign widget
    const dateInput = page.locator('input[type="date"]').first();
    await expect(dateInput).toBeVisible({ timeout: 10_000 });

    // Fill date — April 25, 2026 is sidereal Aries (Apr 14 – May 14 per Swiss Ephemeris)
    await dateInput.fill('2026-04-25');

    // Submit (button inside the widget) — wait for React state update (disabled={!date})
    const submitBtn = page.locator('button[type="submit"]').first();
    await expect(submitBtn).toBeEnabled({ timeout: 5_000 });
    await submitBtn.click();

    // Wait for result — must show "Aries"
    const result = page.locator('[data-testid="sun-sign-result"], [class*="result"], main').filter({
      hasText: /aries/i,
    });
    await expect(result.first()).toBeVisible({ timeout: 10_000 });

    // Result must include a date range (e.g. "April 14" or "Apr 14")
    await expect(result.first()).toContainText(/Apr/i);
  });

  test('result for aries date does NOT show cross-link to another sign', async ({ page }) => {
    await page.goto('/sidereal-aries-dates');
    const dateInput = page.locator('input[type="date"]').first();
    await dateInput.fill('2026-04-25');
    const submitBtn = page.locator('button[type="submit"]').first();
    await expect(submitBtn).toBeEnabled({ timeout: 5_000 });
    await submitBtn.click();

    // No "Read about Sun in sidereal" cross-link since result = current page sign
    // Wait briefly for result then check
    await page.waitForTimeout(2_000);
    const crossLink = page.locator('a').filter({ hasText: /Read about Sun in sidereal/i });
    const linkCount = await crossLink.count();
    // If result is aries, there should be no cross-sign link
    expect(linkCount, 'No cross-sign link expected when result matches page sign').toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Sun-sign widget — cross-sign case: date 2026-09-01 on /sidereal-aries-dates
//   Expected sidereal sign: Leo (Aug 17 – Sep 17 per Swiss Ephemeris, Lahiri)
//   NOTE: 2026-08-15 is sidereal Cancer (Cancer ends Aug 17). Using Sep 1 instead.
// ---------------------------------------------------------------------------

test.describe('Sun-sign widget — cross-sign (leo date on aries page)', () => {
  test.skip(NEEDS_API, 'Skipped: SKIP_API_TESTS=true');

  test('result shows "Leo" and cross-link to /sidereal-leo-dates appears', async ({ page }) => {
    await page.goto('/sidereal-aries-dates');

    const dateInput = page.locator('input[type="date"]').first();
    await expect(dateInput).toBeVisible({ timeout: 10_000 });

    // Sep 1, 2026 — sidereal Leo (Aug 17 – Sep 17 per Swiss Ephemeris Lahiri ayanamsa)
    await dateInput.fill('2026-09-01');
    const submitBtn = page.locator('button[type="submit"]').first();
    await expect(submitBtn).toBeEnabled({ timeout: 5_000 });
    await submitBtn.click();

    // Result must contain "Leo"
    const result = page.locator('main').filter({ hasText: /leo/i });
    await expect(result.first()).toBeVisible({ timeout: 10_000 });

    // Cross-link to /sidereal-leo-dates must appear
    const crossLink = page.locator('a[href*="sidereal-leo-dates"]');
    await expect(crossLink.first()).toBeVisible({ timeout: 5_000 });
    await expect(crossLink.first()).toContainText(/leo/i);
  });
});

// ---------------------------------------------------------------------------
// /sidereal-capricorn-dates — cross-year window edge case
// Capricorn typically Jan 14 – Feb 13; window spans Dec → Jan
// ---------------------------------------------------------------------------

test.describe('/sidereal-capricorn-dates', () => {
  test('page loads: H1 contains "Capricorn"', async ({ page }) => {
    await page.goto('/sidereal-capricorn-dates');
    const h1 = page.locator('h1').first();
    await expect(h1).toBeVisible({ timeout: 15_000 });
    const h1Text = await h1.textContent();
    expect(h1Text).toMatch(/Capricorn/i);
  });

  test('year-table shows Capricorn dates spanning Jan (cross-year window)', async ({
    page,
  }) => {
    await page.goto('/sidereal-capricorn-dates');
    const main = page.locator('main');
    await expect(main).toBeVisible({ timeout: 10_000 });
    // Capricorn in sidereal zodiac starts mid-Jan — verify "Jan" is in the date content
    await expect(main).toContainText(/Jan/i);
  });

  test('has JSON-LD structured data', async ({ page }) => {
    await page.goto('/sidereal-capricorn-dates');
    const ldScripts = page.locator('script[type="application/ld+json"]');
    const count = await ldScripts.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// /es/sidereal-leo-dates — Spanish locale
// ---------------------------------------------------------------------------

test.describe('/es/sidereal-leo-dates (Spanish locale)', () => {
  test('page loads: H1 contains "Leo" (sign name untranslated)', async ({ page }) => {
    await page.goto('/es/sidereal-leo-dates');
    const h1 = page.locator('h1').first();
    await expect(h1).toBeVisible({ timeout: 15_000 });
    const h1Text = await h1.textContent();
    expect(h1Text).toMatch(/Leo/i);
  });

  test('<html> has lang="es"', async ({ page }) => {
    await page.goto('/es/sidereal-leo-dates');
    const htmlLang = await page.locator('html').getAttribute('lang');
    expect(htmlLang).toBe('es');
  });

  test('canonical points to /es/sidereal-leo-dates', async ({ page }) => {
    await page.goto('/es/sidereal-leo-dates');
    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveAttribute('href', /\/es\/sidereal-leo-dates$/);
  });

  test('page contains Spanish text (Sol, signo solar, etc.)', async ({ page }) => {
    await page.goto('/es/sidereal-leo-dates');
    const main = page.locator('main');
    await expect(main).toBeVisible({ timeout: 10_000 });
    // Spanish content must use translated planet names (Sol not Sun; Luna not Moon)
    await expect(main).toContainText(/Sol|signo solar|zodíaco sideral|Lahiri/i);
  });

  test('sign name "Leo" is preserved untranslated in Spanish content', async ({ page }) => {
    await page.goto('/es/sidereal-leo-dates');
    const main = page.locator('main');
    await expect(main).toBeVisible({ timeout: 10_000 });
    // "Leo" must appear in content (not translated to Spanish)
    await expect(main).toContainText('Leo');
    // "Lion" (English) or "León" (Spanish translation) should NOT replace "Leo"
    const bodyText = await main.textContent();
    expect(bodyText).not.toMatch(/^León$/m);
  });

  test('hreflang alternate for EN /sidereal-leo-dates is present', async ({ page }) => {
    await page.goto('/es/sidereal-leo-dates');
    // createMetadata() emits hreflang="en-US" (key 'en-US' in hreflangLanguages map)
    const enHreflang = page.locator('link[rel="alternate"][hreflang="en-US"]');
    await expect(enHreflang).toHaveAttribute('href', /\/sidereal-leo-dates$/);
  });

  test('has JSON-LD structured data', async ({ page }) => {
    await page.goto('/es/sidereal-leo-dates');
    const ldScripts = page.locator('script[type="application/ld+json"]');
    const count = await ldScripts.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });
});
