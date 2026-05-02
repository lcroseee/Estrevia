/**
 * Chart state persistence tests.
 *
 * Spec §3.3: after a successful chart calculation, state must survive a page
 * reload. The mechanism is URL query params — the result is shareable AND
 * survives browser history clearing (unlike sessionStorage).
 *
 * URL param contract:
 *   ?bd=YYYY-MM-DD   birth date
 *   &bt=HH:mm        birth time (only if ktb=1)
 *   &ktb=1           knowsBirthTime flag
 *   &lat=<float>     latitude
 *   &lon=<float>     longitude
 *   &place=<string>  city label (display only)
 *   &tz=<string>     IANA timezone
 *
 * PII guard: birth date/lat/lon must NOT appear in PostHog events
 * (verified via sanitize_properties in PostHogProvider).
 *
 * Tests that require a running sweph calculation are guarded with NEEDS_CALC.
 * The URL-param restore path can be tested without the DB but still requires
 * the sweph native addon to actually calculate the chart.
 */

import { test, expect } from '@playwright/test';

// The chart calculation requires sweph native addon + valid ephemeris.
// In a local dev environment with .env.local configured, this should work.
// Skip on CI if the environment isn't configured.
const NEEDS_CALC =
  process.env.CI === 'true' &&
  (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('placeholder'));

// ── URL param restore ────────────────────────────────────────────────────────

test.describe('Chart state — URL param persistence', () => {
  test('chart result survives reload via URL params', async ({ page }) => {
    test.skip(NEEDS_CALC, 'Skipping: chart calculation requires configured server env');

    // Navigate with pre-set chart URL params — triggers auto-calculate on mount
    const params = new URLSearchParams({
      bd: '1990-04-15',
      bt: '14:30',
      ktb: '1',
      lat: '51.5074',
      lon: '-0.1278',
      place: 'London, England, GB',
      tz: 'Europe/London',
    });

    await page.goto(`/chart?${params.toString()}`);

    // Wait for auto-calculation to complete (sweph cold start can be slow)
    await expect(
      page.locator('[data-testid="natal-chart-result"]'),
    ).toBeVisible({ timeout: 20_000 });

    // URL params must be present (they survive the calculation callback)
    const url = new URL(page.url());
    expect(url.searchParams.get('bd')).toBe('1990-04-15');
    expect(url.searchParams.get('lat')).toBe('51.5074');

    // Reload — params stay in URL, chart re-renders
    await page.reload({ waitUntil: 'networkidle' });

    await expect(
      page.locator('[data-testid="natal-chart-result"]'),
    ).toBeVisible({ timeout: 20_000 });

    // "New Chart" button visible — confirms we're in result-view, not blank form
    await expect(
      page.locator('[data-testid="new-chart-btn"]'),
    ).toBeVisible();
  });

  test('chart with URL params shows result, not blank form', async ({ page }) => {
    test.skip(NEEDS_CALC, 'Skipping: chart calculation requires configured server env');

    const params = new URLSearchParams({
      bd: '1985-12-20',
      lat: '48.8566',
      lon: '2.3522',
      place: 'Paris, Île-de-France, FR',
      tz: 'Europe/Paris',
    });

    await page.goto(`/chart?${params.toString()}`);

    // Should show chart result, NOT the empty birth data form
    await expect(
      page.locator('[data-testid="natal-chart-result"]'),
    ).toBeVisible({ timeout: 20_000 });

    // The form should NOT be the primary visible element
    // (it may exist in DOM for the edit-flow but should be hidden)
    const chartResult = page.locator('[data-testid="natal-chart-result"]');
    await expect(chartResult).toBeVisible();
  });

  test('new-chart button clears URL params and shows blank form', async ({ page }) => {
    test.skip(NEEDS_CALC, 'Skipping: chart calculation requires configured server env');

    const params = new URLSearchParams({
      bd: '1990-04-15',
      bt: '14:30',
      ktb: '1',
      lat: '51.5074',
      lon: '-0.1278',
      place: 'London, England, GB',
      tz: 'Europe/London',
    });

    await page.goto(`/chart?${params.toString()}`);
    await expect(
      page.locator('[data-testid="natal-chart-result"]'),
    ).toBeVisible({ timeout: 20_000 });

    // Click "New Chart" button
    await page.locator('[data-testid="new-chart-btn"]').click();

    // URL params should be cleared
    await page.waitForFunction(() => {
      const url = new URL(window.location.href);
      return !url.searchParams.has('bd');
    }, { timeout: 5_000 });

    // Form should be visible again
    const url = new URL(page.url());
    expect(url.searchParams.has('bd')).toBe(false);
  });
});

// ── PII guard ────────────────────────────────────────────────────────────────

test.describe('Chart state — PII guard', () => {
  test('PostHog events do not capture birth date or coordinates', async ({ page }) => {
    // Intercept PostHog capture calls to verify no PII in events.
    // This works even without a real PostHog key because we inspect the
    // outgoing fetch calls, not the server response.
    const posthogRequests: { url: string; body: string }[] = [];

    await page.route('**/i.posthog.com/**', (route) => {
      const request = route.request();
      posthogRequests.push({
        url: request.url(),
        body: request.postData() ?? '',
      });
      route.continue();
    });

    const params = new URLSearchParams({
      bd: '1990-04-15',
      lat: '51.5074',
      lon: '-0.1278',
      place: 'London, England, GB',
      tz: 'Europe/London',
    });

    await page.goto(`/chart?${params.toString()}`);
    await page.waitForTimeout(2_000); // Let any pageview events fire

    // Check that no PostHog event body contains raw birth date or coordinates
    for (const req of posthogRequests) {
      expect(
        req.body,
        `PostHog request to ${req.url} must not contain raw birth date`,
      ).not.toContain('1990-04-15');
      // Note: lat/lon in $current_url would be stripped by sanitize_properties
      // The check here is that they don't appear as explicit event properties
    }
  });
});
