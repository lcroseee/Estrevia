import { test, expect } from '@playwright/test';

/**
 * P0-2 regression (CRO audit 2026-07-10, LIVE-1): pre-consent on a phone
 * viewport, the cookie banner (z-50) used to sit ON TOP of the paywall trial
 * CTA — elementFromPoint at the CTA center returned the banner. The modal now
 * portals to document.body with z-[60]. This test drives the real flow WITHOUT
 * accepting consent and asserts the CTA wins the hit-test.
 */
test('paywall trial CTA hit-test beats cookie banner at 390x844 pre-consent', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  // Bypass ONLY the email gate; estrevia_cookie_consent stays absent so the banner renders.
  await page.addInitScript(() => {
    window.localStorage.setItem('email_gate_passed', '1');
  });

  // Chart URL copied verbatim from paywall-cta.spec.ts (bd/bt/ktb/lat/lon/place/tz + no_gate=1),
  // made absolute since this test drives a manually-created context (no baseURL applied).
  await page.goto(
    'http://localhost:3000/en/chart'
      + '?bd=1990-04-15'
      + '&bt=14:30'
      + '&ktb=1'
      + '&lat=-34.6037'
      + '&lon=-58.3816'
      + '&place=Buenos+Aires'
      + '&tz=America/Argentina/Buenos_Aires'
      + '&no_gate=1',
    { waitUntil: 'domcontentloaded', timeout: 30_000 },
  );
  await page.waitForSelector('[data-testid="natal-chart-result"]', { timeout: 30_000 });
  await page.waitForSelector('[data-testid="chart-reading-section"]', { timeout: 15_000 });

  // Banner must actually be showing (otherwise this test proves nothing).
  await expect(page.getByLabel('Cookie consent')).toBeVisible();

  // Paywall-open click copied from paywall-cta.spec.ts (reading-section CTA).
  const section = page.locator('[data-testid="chart-reading-section"]');
  const sectionCta = section.locator('[data-variant="card"]');
  await expect(sectionCta).toBeVisible();
  await sectionCta.getByRole('button').click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const cta = dialog.getByRole('button', { name: /start 3-day free trial/i });
  await expect(cta).toBeVisible();

  const ctaWinsHitTest = await cta.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return top === el || el.contains(top) || (top !== null && top.contains(el) === false && el.contains(top));
  });
  expect(ctaWinsHitTest).toBe(true);
  await ctx.close();
});
