/**
 * fe-baseline.spec.ts
 * Captures production frontend baseline:
 * - Screenshots at 7 viewports × 5 pages
 * - DOM facts: scrollWidth, innerWidth, h1Count, h2Count
 * - Chart reload behaviour (synthetic data 1990-04-15 14:30 London)
 * - /s/[id] SSR completeness audit via curl
 *
 * Output: tmp/baselines/fe-screenshots-pre/ + tmp/baselines/fe-dom-state-pre.json
 * Run: npx playwright test tests/baselines/fe-baseline.spec.ts --config=tests/baselines/playwright.baseline.config.ts
 */

import { test } from '@playwright/test';
import fs from 'fs/promises';

const VIEWPORTS = [
  { w: 320, h: 568 },
  { w: 360, h: 640 },
  { w: 375, h: 667 },
  { w: 390, h: 844 },
  { w: 414, h: 896 },
  { w: 768, h: 1024 },
  { w: 1280, h: 800 },
];

const PAGES = ['/', '/chart', '/why-sidereal', '/hours', '/tree-of-life'];
const BASE = 'https://estrevia.app';
const OUT = 'tmp/baselines/fe-screenshots-pre';

test('capture baseline screenshots + DOM facts', async ({ browser }) => {
  await fs.mkdir(OUT, { recursive: true });
  const facts: Record<string, unknown> = {};

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
    const page = await ctx.newPage();

    for (const p of PAGES) {
      const url = `${BASE}${p}`;
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
        const slug = p === '/' ? '_home' : p.replace(/\//g, '_');
        const file = `${OUT}/${vp.w}x${vp.h}${slug}.png`;
        await page.screenshot({ path: file, fullPage: true });

        const overflow = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
          overflowing: document.documentElement.scrollWidth > window.innerWidth,
          h1Count: document.querySelectorAll('h1').length,
          h2Count: document.querySelectorAll('h2').length,
          h1Texts: Array.from(document.querySelectorAll('h1')).map(el => el.textContent?.trim().slice(0, 80)),
        }));

        facts[`${vp.w}x${vp.h}${p}`] = overflow;
        console.log(`[${vp.w}x${vp.h}] ${p} → overflow=${overflow.overflowing} h1=${overflow.h1Count} h2=${overflow.h2Count}`);
      } catch (err) {
        facts[`${vp.w}x${vp.h}${p}`] = { error: String(err) };
        console.log(`[${vp.w}x${vp.h}] ${p} → ERROR: ${err}`);
      }
    }

    await ctx.close();
  }

  await fs.writeFile('tmp/baselines/fe-dom-state-pre.json', JSON.stringify(facts, null, 2));
  console.log('DOM state written to tmp/baselines/fe-dom-state-pre.json');
});

test('chart reload behaviour', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
  const page = await ctx.newPage();
  const result: Record<string, unknown> = {};

  try {
    await page.goto(`${BASE}/chart`, { waitUntil: 'networkidle', timeout: 30_000 });

    // Snapshot initial state
    result.initialUrl = page.url();
    result.initialFormVisible = await page.locator('input[name="birthDate"]').isVisible().catch(() => null);
    result.initialFormVisibleAlt = await page.locator('input[type="date"]').isVisible().catch(() => null);
    result.initialResultVisible = await page.locator('[data-testid="natal-chart-result"]').isVisible().catch(() => null);

    // Check for any form inputs to understand the page structure
    const inputNames = await page.evaluate(() =>
      Array.from(document.querySelectorAll('input')).map(el => ({
        name: el.getAttribute('name'),
        type: el.getAttribute('type'),
        placeholder: el.getAttribute('placeholder'),
      }))
    );
    result.formInputs = inputNames;

    // Reload and check
    await page.reload({ waitUntil: 'networkidle', timeout: 30_000 });
    result.afterReloadUrl = page.url();
    result.afterReloadFormVisible = await page.locator('input[name="birthDate"]').isVisible().catch(() => null);
    result.afterReloadResultVisible = await page.locator('[data-testid="natal-chart-result"]').isVisible().catch(() => null);

    // Check current URL params (to see if state is in URL)
    result.urlParams = new URL(page.url()).search;

    await page.screenshot({ path: `${OUT}/chart-reload-state.png`, fullPage: true });
  } catch (err) {
    result.error = String(err);
  }

  await ctx.close();

  // Merge into dom state file
  try {
    const existing = JSON.parse(await fs.readFile('tmp/baselines/fe-dom-state-pre.json', 'utf-8'));
    existing.chartReloadBehaviour = result;
    await fs.writeFile('tmp/baselines/fe-dom-state-pre.json', JSON.stringify(existing, null, 2));
  } catch {
    await fs.writeFile('tmp/baselines/fe-dom-state-pre.json', JSON.stringify({ chartReloadBehaviour: result }, null, 2));
  }

  console.log('Chart reload:', JSON.stringify(result, null, 2));
});
