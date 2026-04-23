import { test, expect } from '@playwright/test';

test.describe('Moon page — sign & live illumination', () => {
  test('phase card and calendar show zodiac glyphs', async ({ page }) => {
    // Capture both requests — the calendar endpoint must land before we click,
    // otherwise the cells render from the fallback linear approximation without
    // moonSign and the detail panel shows the em-dash placeholder.
    const currentReq = page.waitForRequest((r) => r.url().includes('/api/v1/moon/current'));
    const calendarReq = page.waitForResponse(
      (r) => /\/api\/v1\/moon\/calendar\/\d+\/\d+/.test(r.url()) && r.status() < 400,
    );

    await page.goto('/moon');

    const req = await currentReq;
    expect(req.url()).toMatch(/[?&]t=/);

    // Hero card: "Moon in <Sign>" with a role="img" aria-label set to the sign.
    await expect(page.getByText(/Moon in/i)).toBeVisible({ timeout: 10_000 });
    const heroGlyph = page
      .getByRole('img', {
        name: /^(Aries|Taurus|Gemini|Cancer|Leo|Virgo|Libra|Scorpio|Sagittarius|Capricorn|Aquarius|Pisces)$/,
      })
      .first();
    await expect(heroGlyph).toBeVisible();

    // Wait for per-day calendar data so clicked cells carry moonSign.
    await calendarReq;

    // At least one calendar cell is a button with a zodiac glyph inside.
    const cellWithGlyph = page.getByRole('gridcell').filter({
      has: page.getByRole('img', {
        name: /^(Aries|Taurus|Gemini|Cancer|Leo|Virgo|Libra|Scorpio|Sagittarius|Capricorn|Aquarius|Pisces)$/,
      }),
    });
    await expect(cellWithGlyph.first()).toBeVisible();
    expect(await cellWithGlyph.count()).toBeGreaterThan(0);

    // Open detail panel for a cell that actually has a glyph (so moonSign is populated).
    await cellWithGlyph.first().click();

    // Scope the dialog check to our aria-label — the page also has a cookie banner
    // that can expose role="dialog".
    const detailDialog = page.getByRole('dialog', { name: /Moon details/i });
    await expect(detailDialog).toBeVisible();

    // No hardcoded placeholder.
    await expect(detailDialog.getByText('Available soon')).toHaveCount(0);

    // Sign tile shows "<degree>° <Sign>".
    await expect(
      detailDialog.getByText(
        /\d+°\s+(Aries|Taurus|Gemini|Cancer|Leo|Virgo|Libra|Scorpio|Sagittarius|Capricorn|Aquarius|Pisces)/,
      ),
    ).toBeVisible();
  });

  test('illumination bar exposes a plausible aria-valuenow (0–100)', async ({ page }) => {
    await page.goto('/moon');
    // The hero card's illumination bar is role="progressbar" aria-valuenow=...
    // which is unambiguous; picking a percentage off plain text can collide
    // with other numeric content (e.g. degree readouts).
    const bar = page.getByRole('progressbar', { name: /Illumination/i }).first();
    await expect(bar).toBeVisible({ timeout: 10_000 });
    const nowAttr = await bar.getAttribute('aria-valuenow');
    const num = Number(nowAttr);
    expect(Number.isFinite(num)).toBe(true);
    expect(num).toBeGreaterThanOrEqual(0);
    expect(num).toBeLessThanOrEqual(100);
  });
});
