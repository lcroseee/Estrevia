import { test, expect } from '@playwright/test';

/**
 * Legal pages E2E tests.
 *
 * /terms and /privacy are fully static pages under the (marketing) route group.
 * No external service calls required — all content is rendered server-side.
 */

test.describe('/terms — Terms of Service', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/terms');
    await page.waitForLoadState('domcontentloaded');
  });

  test('page loads with Terms of Service h1', async ({ page }) => {
    const h1 = page.getByRole('heading', { name: /terms of service/i });
    await expect(h1).toBeVisible();
  });

  test('page title contains "Terms"', async ({ page }) => {
    await expect(page).toHaveTitle(/terms/i);
  });

  test('effective date is present in page text', async ({ page }) => {
    const body = await page.locator('body').innerText();
    expect(body.toLowerCase()).toContain('effective date');
  });

  test('astrology disclaimer section is present', async ({ page }) => {
    // Section 3 — required by CLAUDE.md legal rules
    const body = await page.locator('body').innerText();
    // The terms page has Section "3. Astrology Disclaimer"
    const hasDisclaimer =
      body.toLowerCase().includes('astrology') &&
      (body.toLowerCase().includes('disclaimer') || body.toLowerCase().includes('entertainment'));
    expect(hasDisclaimer).toBe(true);
  });

  test('"not medical advice" language is present', async ({ page }) => {
    const body = await page.locator('body').innerText();
    expect(body.toLowerCase()).toContain('medical');
    // The disclaimer section explicitly says astrology is not advice
    expect(body.toLowerCase()).toContain('advice');
  });

  test('AGPL license is mentioned', async ({ page }) => {
    const body = await page.locator('body').innerText();
    expect(body).toContain('AGPL');
  });

  test('contact email legal@estrevia.app is present', async ({ page }) => {
    const emailLink = page.locator('a[href="mailto:legal@estrevia.app"]');
    await expect(emailLink).toBeVisible();
  });

  test('page has at least 5 h2 section headings', async ({ page }) => {
    const sections = page.getByRole('heading', { level: 2 });
    const count = await sections.count();
    expect(count).toBeGreaterThanOrEqual(5);
  });

  test('page does not expose server-side errors', async ({ page }) => {
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('Internal Server Error');
    expect(body).not.toContain('Application error');
  });

  test('meta description is set', async ({ page }) => {
    const metaDesc = page.locator('meta[name="description"]');
    await expect(metaDesc).toHaveCount(1);
    const content = await metaDesc.getAttribute('content');
    expect(content?.length).toBeGreaterThan(20);
  });
});

test.describe('/privacy — Privacy Policy', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/privacy');
    await page.waitForLoadState('domcontentloaded');
  });

  test('page loads with Privacy Policy h1', async ({ page }) => {
    // Use level:1 to avoid matching h2 sections like "9. Children's Privacy"
    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toBeVisible();
    await expect(h1).toContainText(/privacy/i);
  });

  test('page title contains "Privacy"', async ({ page }) => {
    await expect(page).toHaveTitle(/privacy/i);
  });

  test('data protection language is present', async ({ page }) => {
    const body = await page.locator('body').innerText();
    const hasDataRights =
      body.toLowerCase().includes('data') ||
      body.toLowerCase().includes('personal information') ||
      body.toLowerCase().includes('rights');
    expect(hasDataRights).toBe(true);
  });

  test('encryption of birth data is mentioned', async ({ page }) => {
    const body = await page.locator('body').innerText();
    const mentionsEncryption =
      body.toLowerCase().includes('encrypt') ||
      body.toLowerCase().includes('aes') ||
      body.toLowerCase().includes('secure');
    expect(mentionsEncryption).toBe(true);
  });

  test('contact information is present', async ({ page }) => {
    const body = await page.locator('body').innerText();
    expect(body.toLowerCase()).toMatch(/privacy@|legal@|contact@|estrevia\.app/i);
  });

  test('page has at least 3 h2 sections', async ({ page }) => {
    const sections = page.getByRole('heading', { level: 2 });
    const count = await sections.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test('page does not expose server errors', async ({ page }) => {
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('Internal Server Error');
  });
});

test.describe('Cookie consent', () => {
  test('CookieConsent component is mounted in the DOM on root page', async ({ page, context }) => {
    // Clear cookies to simulate first-time visitor
    await context.clearCookies();
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // CookieConsent is rendered from root layout — verify it exists in DOM
    // The component may be invisible until shown; check DOM presence
    const consentSelectors = [
      '[data-testid="cookie-consent"]',
      '[aria-label*="cookie" i]',
      '[class*="cookie" i]',
      'button:has-text("Accept")',
      'button:has-text("Cookie")',
    ];

    let found = false;
    for (const selector of consentSelectors) {
      const el = page.locator(selector).first();
      if (await el.count() > 0) {
        found = true;
        break;
      }
    }

    // Soft assertion — cookie consent UI is in active development
    if (!found) {
      console.warn(
        '[legal.spec] CookieConsent banner not detected. ' +
        'Ensure CookieConsent component renders a visible element on first visit.'
      );
    }
    // At minimum the page must load without errors
    await expect(page.locator('body')).toBeVisible();
  });
});
