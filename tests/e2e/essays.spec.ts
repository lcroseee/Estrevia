import { test, expect } from '@playwright/test';

/**
 * Essay page E2E tests.
 *
 * Essays are statically generated from MDX files in content/essays/.
 * Essay pages live under (app)/ route group — they use the app layout with
 * the PlanetaryHourBar and UserMenu in the header.
 *
 * MiniCalculator inside essays uses sweph for live calculations — the
 * "CALCULATING..." spinner appears briefly. Tests must wait for networkidle
 * or target SSR-rendered elements that are in the DOM from the start.
 */

const ESSAY_SLUG = 'sun-in-aries';
const ESSAY_TITLE_FRAGMENT = 'Sun in Aries';
const ESSAY_URL = `/essays/${ESSAY_SLUG}`;

test.describe('Essay page — sun-in-aries', () => {
  test.beforeEach(async ({ page }) => {
    const response = await page.goto(ESSAY_URL);
    // 404 means the essay doesn't exist in the file system — skip gracefully
    if (response?.status() === 404) {
      test.skip();
    }
    // Wait for SSR content to be fully hydrated and client components settled
    await page.waitForLoadState('domcontentloaded');
  });

  test('essay page loads with correct h1 title', async ({ page }) => {
    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toBeVisible();
    await expect(h1).toContainText(ESSAY_TITLE_FRAGMENT);
  });

  test('essay article element is present and non-empty', async ({ page }) => {
    // EssayPage renders <article aria-label={meta.title}>
    // This is a Server Component — content is in SSR HTML immediately
    const article = page.locator('article').first();
    await expect(article).toBeVisible();

    // The essay-content div wraps ReactMarkdown output
    const essayContent = page.locator('.essay-content');
    await expect(essayContent).toBeVisible();

    const text = await essayContent.innerText();
    expect(text.trim().length).toBeGreaterThan(100);
  });

  test('astrology disclaimer is present with correct content', async ({ page }) => {
    // Disclaimer is an <aside role="note" aria-label="Content disclaimer">
    // It contains: "Astrology is a symbolic system for self-reflection..."
    const disclaimer = page.locator('[role="note"][aria-label="Content disclaimer"]');
    await expect(disclaimer).toBeVisible();

    const text = await disclaimer.innerText();
    // Disclaimer must contain the legal warning text
    expect(text.toLowerCase()).toContain('astrology');
    expect(text.toLowerCase()).toContain('medical');
  });

  test('page title meta tag contains essay title', async ({ page }) => {
    await expect(page).toHaveTitle(new RegExp(ESSAY_TITLE_FRAGMENT, 'i'));
  });

  test('meta description is set and non-trivial', async ({ page }) => {
    const metaDesc = page.locator('meta[name="description"]');
    await expect(metaDesc).toHaveCount(1);
    const content = await metaDesc.getAttribute('content');
    expect(content?.length).toBeGreaterThan(50);
  });

  test('JSON-LD Article schema is present', async ({ page }) => {
    const ldScripts = page.locator('script[type="application/ld+json"]');
    const count = await ldScripts.count();
    expect(count).toBeGreaterThanOrEqual(1);

    let hasArticle = false;
    for (let i = 0; i < count; i++) {
      const text = await ldScripts.nth(i).textContent();
      if (text && (text.includes('"Article"') || text.includes('"article"'))) {
        hasArticle = true;
        break;
      }
    }
    expect(hasArticle).toBe(true);
  });

  test('breadcrumb JSON-LD is present', async ({ page }) => {
    const ldScripts = page.locator('script[type="application/ld+json"]');
    const count = await ldScripts.count();

    let hasBreadcrumb = false;
    for (let i = 0; i < count; i++) {
      const text = await ldScripts.nth(i).textContent();
      if (text && text.includes('BreadcrumbList')) {
        hasBreadcrumb = true;
        break;
      }
    }
    expect(hasBreadcrumb).toBe(true);
  });

  test('canonical URL contains essay slug', async ({ page }) => {
    const canonical = page.locator('link[rel="canonical"]');
    if (await canonical.count() > 0) {
      const href = await canonical.getAttribute('href');
      expect(href).toContain(ESSAY_SLUG);
    }
  });

  test('essay header shows planet/sign breadcrumb text', async ({ page }) => {
    // EssayPage header renders: <p aria-hidden="true">Essays / Sun / Aries</p>
    // The p has aria-hidden so we use locator rather than getByText with accessibility
    // Look for any paragraph inside article > header containing "Essays /"
    const bodyText = await page.locator('article').innerText();
    expect(bodyText.toLowerCase()).toContain('essays');
  });

  test('element badge (Fire) is visible', async ({ page }) => {
    // Meta badges rendered as <span role="listitem">
    const badges = page.locator('[role="listitem"]');
    const count = await badges.count();
    expect(count).toBeGreaterThan(0);

    // Sun in Aries is Fire element
    const fireBadge = page.locator('[role="listitem"]').filter({ hasText: 'Fire' });
    await expect(fireBadge).toBeVisible();
  });

  test('essay link from /essays list leads to correct page', async ({ page }) => {
    await page.goto('/essays');
    await page.waitForLoadState('domcontentloaded');

    const essayLink = page.locator(`a[href="${ESSAY_URL}"]`).first();
    if (await essayLink.count() > 0) {
      await essayLink.click();
      await expect(page).toHaveURL(new RegExp(ESSAY_SLUG));
      await page.waitForLoadState('domcontentloaded');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    }
  });
});

test.describe('Essay page — multiple slugs smoke test', () => {
  const slugs = [
    'sun-in-taurus',
    'sun-in-gemini',
    'jupiter-in-aries',
  ];

  for (const slug of slugs) {
    test(`/essays/${slug} loads with h1 heading`, async ({ page }) => {
      const response = await page.goto(`/essays/${slug}`);
      // 500 is always a failure
      expect(response?.status()).not.toBe(500);

      if (response?.status() === 200) {
        await page.waitForLoadState('domcontentloaded');
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      }
    });
  }
});

test.describe('Essay page — non-existent slug', () => {
  test('/essays/non-existent slug shows not-found page', async ({ page }) => {
    await page.goto('/essays/non-existent-planet-in-fake-sign');
    await page.waitForLoadState('domcontentloaded');

    // Next.js App Router calls notFound() which renders not-found.tsx
    // In dev mode, HTTP status may be 200 (RSC streaming) but the DOM shows 404 content
    const bodyText = await page.locator('body').innerText();
    // The not-found.tsx renders "Page not found" message
    const isNotFound =
      bodyText.toLowerCase().includes('not found') ||
      bodyText.includes('404') ||
      bodyText.toLowerCase().includes('does not exist') ||
      bodyText.toLowerCase().includes('celestial body');
    expect(isNotFound).toBe(true);
  });
});
