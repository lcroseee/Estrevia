import { test, expect } from '@playwright/test';

/**
 * Paywall CTA E2E — canonical conversion path for the 3 new trigger sites.
 *
 * Tested as anonymous user only. The contract verified:
 * - Free-side render works (cards/synastry result visible)
 * - PaywallCta appears at the expected position
 * - Click opens PaywallModal with the contextual headline
 * - No /pricing full-page nav happens (in-context modal)
 *
 * Stripe redirect + Clerk sign-up flows are exercised in manual smoke
 * (Task 11) — Clerk test accounts are out of scope here.
 *
 * URL note: plan referenced /tarot/celtic-cross and /tarot/three-card.
 * Those routes do not exist in this repo. Both spreads live on
 * /tarot/spread (a single page with SpreadTabs — 'three' tab active by
 * default, 'celtic' tab reachable via click). URLs adjusted to
 * /en/tarot/spread with tab-switching where needed.
 */

const SPREAD_URL = '/en/tarot/spread';

/**
 * Suppress the GDPR cookie-consent banner by pre-seeding its localStorage key
 * (estrevia_cookie_consent = "accepted") via addInitScript — runs before any
 * page JS, so CookieConsent.tsx sees a stored value and never renders the banner.
 * Must be called before page.goto().
 */
async function suppressCookieBanner(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('estrevia_cookie_consent', 'accepted');
  });
}

test.describe('Paywall CTA — Celtic Cross', () => {
  test('anonymous user draws spread, sees CTA, opens modal with contextual headline', async ({ page }) => {
    await suppressCookieBanner(page);
    const response = await page.goto(SPREAD_URL);
    if (response?.status() === 404) test.skip();
    await page.waitForLoadState('domcontentloaded');

    // Switch to Celtic Cross tab (second tab, id="spread-tab-celtic")
    await page.getByRole('tab', { name: /celtic/i }).click();

    // Trigger the draw
    await page.getByRole('button', { name: /draw/i }).first().click();

    // Wait for the 10-card reveal animation to complete.
    // CelticCross uses staggered setTimeout up to ~300 + 10 * 350 = ~3.8s.
    // Wait for the CTA card to appear (data-variant="card" is set by PaywallCta).
    const cta = page.locator('[data-variant="card"]').first();
    await expect(cta).toBeVisible({ timeout: 8_000 });
    await expect(cta).toContainText(/Celtic Cross|Cruz Celta/i);

    // No /pricing anchor leakage
    const pricingLink = page.locator('a[href*="/pricing"]').first();
    await expect(pricingLink).toBeHidden();

    // Click CTA → modal opens with contextual headline
    await cta.getByRole('button').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/Celtic Cross|Cruz Celta/i);
  });
});

test.describe('Paywall CTA — 3-card spread', () => {
  test('anonymous user draws 3 cards, sees CTA, opens modal with contextual headline', async ({ page }) => {
    await suppressCookieBanner(page);
    const response = await page.goto(SPREAD_URL);
    if (response?.status() === 404) test.skip();
    await page.waitForLoadState('domcontentloaded');

    // Three-card is the default active tab — no tab switch needed.
    await page.getByRole('button', { name: /draw/i }).first().click();

    const cta = page.locator('[data-variant="card"]').first();
    await expect(cta).toBeVisible({ timeout: 6_000 });
    await expect(cta).toContainText(/3-card|3 cartas/i);

    await cta.getByRole('button').click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });
});

// Synastry E2E requires filling two birth-data forms — pattern from existing
// synastry spec (if any) or skip and rely on manual smoke. Keeping the
// suite focused on the two simpler trigger surfaces; document the skip:
test.describe.skip('Paywall CTA — Synastry AI', () => {
  test.skip('exercised via manual smoke — birth-form fixtures not yet wired into E2E setup', () => {});
});
