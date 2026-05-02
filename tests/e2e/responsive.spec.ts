/**
 * Responsive layout tests — horizontal overflow + H1 count assertions.
 *
 * Overflow acceptance: document.documentElement.scrollWidth === window.innerWidth
 * at every viewport in the test matrix. Overflow means layout breaks on that device.
 *
 * H1 acceptance: exactly 1 <h1> in the DOM at every viewport (SEO + a11y).
 *
 * Viewports match spec §3.1 + baseline finding (768px overflow confirmed by verifier).
 */

import { test, expect } from '@playwright/test';

const VIEWPORTS = [320, 360, 375, 390, 414, 768];

// Pages accessible without auth + DB. Landing and marketing pages test the
// shared layout; /hours and /tree-of-life test the (app) layout with DesktopNav.
// /chart added because verifier confirmed 768px overflow there specifically.
const OVERFLOW_PAGES = ['/', '/chart', '/why-sidereal', '/hours', '/tree-of-life'];

// ── Overflow tests ────────────────────────────────────────────────────────────

for (const w of VIEWPORTS) {
  for (const p of OVERFLOW_PAGES) {
    test(`no horizontal overflow at ${w}px on ${p}`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width: w, height: 800 } });
      const page = await ctx.newPage();

      try {
        await page.goto(`http://localhost:3000${p}`, {
          waitUntil: 'domcontentloaded',
          timeout: 20_000,
        });

        // Small wait for any client-side hydration that might shift layout
        await page.waitForTimeout(300);

        const overflow = await page.evaluate(() => ({
          scroll: document.documentElement.scrollWidth,
          viewport: window.innerWidth,
        }));

        expect(
          overflow.scroll,
          `scrollWidth (${overflow.scroll}) should equal innerWidth (${overflow.viewport}) at ${w}px on ${p}`,
        ).toBe(overflow.viewport);
      } finally {
        await ctx.close();
      }
    });
  }
}

// ── H1 count tests ────────────────────────────────────────────────────────────
// Spec §3.2: exactly one H1 in DOM on /hours and /tree-of-life at all viewports.
// Duplicate H1s (e.g. mobile + desktop branches both in DOM) confuse Google.

test('exactly one H1 on /hours at every viewport', async ({ browser }) => {
  for (const w of [320, 768, 1280]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 800 } });
    const page = await ctx.newPage();
    try {
      await page.goto('http://localhost:3000/hours', {
        waitUntil: 'domcontentloaded',
        timeout: 20_000,
      });
      const count = await page.locator('h1').count();
      expect(count, `expected 1 H1 on /hours at viewport ${w}px, got ${count}`).toBe(1);
    } finally {
      await ctx.close();
    }
  }
});

test('exactly one H1 on /tree-of-life at every viewport', async ({ browser }) => {
  for (const w of [320, 768, 1280]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 800 } });
    const page = await ctx.newPage();
    try {
      await page.goto('http://localhost:3000/tree-of-life', {
        waitUntil: 'domcontentloaded',
        timeout: 20_000,
      });
      const count = await page.locator('h1').count();
      expect(count, `expected 1 H1 on /tree-of-life at viewport ${w}px, got ${count}`).toBe(1);
    } finally {
      await ctx.close();
    }
  }
});
