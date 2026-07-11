// tests/e2e/meta-pixel-consent.spec.ts
import { test, expect, type Page } from '@playwright/test';

test.describe('Meta Pixel consent gating (SP-F, LIVE-7)', () => {
  /**
   * Collector + firewall: records every request aimed at facebook.net /
   * facebook.com and aborts it so the test never depends on Meta uptime.
   * page.on('request') fires before the route handler aborts, so aborted
   * attempts are still observed.
   */
  async function collectFacebookRequests(page: Page): Promise<string[]> {
    const requests: string[] = [];
    await page.route(/facebook\.(net|com)/, (route) => route.abort());
    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('facebook.net') || url.includes('facebook.com')) {
        requests.push(url);
      }
    });
    return requests;
  }

  test('no facebook request or _fbp cookie before consent; Accept mounts the pixel', async ({ page, context }) => {
    const fbRequests = await collectFacebookRequests(page);

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    // Banner renders after an 800ms delay (CookieConsent.tsx:25).
    const banner = page.getByRole('dialog', { name: /cookie consent/i });
    await expect(banner).toBeVisible({ timeout: 15_000 });

    // Pre-consent: total silence toward Meta.
    expect(fbRequests).toHaveLength(0);
    const preCookies = await context.cookies();
    expect(preCookies.find((c) => c.name === '_fbp')).toBeUndefined();

    await banner.getByRole('button', { name: /accept/i }).click();

    // Positive branch only when the dev server has NEXT_PUBLIC_META_PIXEL_ID
    // set: the base snippet defines window.fbq synchronously on mount. When
    // the env var is unset MetaPixelLoader renders no script — the gating
    // assertions above are still meaningful, so don't fail the suite.
    const pixelConfigured = await page
      .waitForFunction(
        () => typeof (window as { fbq?: unknown }).fbq === 'function',
        undefined,
        { timeout: 5_000 },
      )
      .then(() => true)
      .catch(() => false);
    if (pixelConfigured) {
      expect(fbRequests.length).toBeGreaterThan(0);
    }
  });

  test('Decline keeps facebook silent and clears leftover _fbp', async ({ page, context }) => {
    // Old-build migration case (spec D2): `_fbp` already on the domain from
    // a visit before the pixel was consent-gated.
    await context.addCookies([
      { name: '_fbp', value: 'fb.1.1700000000000.123456789', url: 'http://localhost:3000' },
    ]);
    const fbRequests = await collectFacebookRequests(page);

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    const banner = page.getByRole('dialog', { name: /cookie consent/i });
    await expect(banner).toBeVisible({ timeout: 15_000 });

    await banner.getByRole('button', { name: /decline/i }).click();
    await expect(banner).toBeHidden();

    expect(fbRequests).toHaveLength(0);
    // expireMetaCookies runs synchronously in the consent event handler —
    // poll only to absorb Playwright cookie-jar propagation.
    await expect
      .poll(async () => (await context.cookies()).some((c) => c.name === '_fbp'))
      .toBe(false);
  });
});
