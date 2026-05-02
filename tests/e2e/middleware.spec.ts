import { test, expect } from '@playwright/test';

const PROD = process.env.E2E_TARGET ?? 'http://localhost:3000';

test.describe('middleware', () => {
  /**
   * Vercel canonical-host redirect (production-only).
   * Only fires when VERCEL_ENV==='production' AND host ends with .vercel.app.
   * In preview deploys VERCEL_ENV==='preview', so the redirect is intentionally
   * skipped — preview deploys remain reachable on their vercel.app URL.
   */
  test('redirects vercel.app deployment hostname to estrevia.app (prod-only)', async ({
    request,
  }) => {
    // Skip everywhere except against a production-env Vercel deployment.
    test.skip(
      !process.env.VERCEL_ENV || process.env.VERCEL_ENV !== 'production',
      'production-env-only assertion',
    );
    const response = await request.get(`${PROD}/`, { maxRedirects: 0 });
    expect(response.status()).toBeGreaterThanOrEqual(300);
    expect(response.status()).toBeLessThan(400);
    expect(response.headers()['location']).toMatch(/^https:\/\/estrevia\.app\/?$/);
  });

  test('locale prefix routing — /es resolves with es lang', async ({ page }) => {
    await page.goto(`${PROD}/es`);
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  });

  test('default locale at root — / resolves with en lang', async ({ page }) => {
    await page.goto(`${PROD}/`);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('protected route redirects unauthenticated to sign-in', async ({ page }) => {
    await page.goto(`${PROD}/charts`, { waitUntil: 'commit' });
    expect(page.url()).toContain('/sign-in');
  });

  test('protected API returns 401 JSON for unauthenticated', async ({ request }) => {
    const r = await request.post(`${PROD}/api/v1/chart/save`, {
      data: {},
      headers: { 'Content-Type': 'application/json' },
    });
    expect(r.status()).toBe(401);
    const body = await r.json();
    expect(body).toMatchObject({ success: false });
  });
});
