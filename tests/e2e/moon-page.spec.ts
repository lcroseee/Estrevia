import { test, expect } from '@playwright/test';

test.describe('Moon page — sign & live illumination', () => {
  test('phase card and calendar show zodiac glyphs', async ({ page }) => {
    // Capture the /current request so we can assert ?t= is present.
    const currentReq = page.waitForRequest((r) => r.url().includes('/api/v1/moon/current'));

    await page.goto('/moon');

    const req = await currentReq;
    expect(req.url()).toMatch(/[?&]t=/);

    // Hero card: "Moon in <sign>" with a role="img" aria-label set to the sign.
    await expect(page.getByText(/Moon in/i)).toBeVisible({ timeout: 10_000 });
    const heroGlyph = page.getByRole('img', { name: /^(Aries|Taurus|Gemini|Cancer|Leo|Virgo|Libra|Scorpio|Sagittarius|Capricorn|Aquarius|Pisces)$/ }).first();
    await expect(heroGlyph).toBeVisible();

    // Calendar: at least one cell shows a glyph.
    const cellGlyphs = page.locator('[role="gridcell"] [role="img"]');
    await expect(cellGlyphs.first()).toBeVisible();
    expect(await cellGlyphs.count()).toBeGreaterThan(0);

    // Detail panel: open a cell and verify sign + degree, NOT "Available soon".
    await page.getByRole('gridcell').filter({ has: page.locator('[role="img"]') }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText('Available soon')).toHaveCount(0);
    // Expect either "°" with a sign name or the em-dash fallback.
    const signCell = page.getByText(/^\d+°\s/);
    await expect(signCell.first()).toBeVisible();
  });

  test('illumination text is present and plausible (0–100%)', async ({ page }) => {
    await page.goto('/moon');
    const pct = page.getByText(/\b\d{1,3}%\b/).first();
    await expect(pct).toBeVisible();
    const txt = await pct.textContent();
    const num = parseInt((txt ?? '').replace('%', ''), 10);
    expect(num).toBeGreaterThanOrEqual(0);
    expect(num).toBeLessThanOrEqual(100);
  });
});
