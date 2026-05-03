// post-fix visual verify
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://localhost:3000';
const OUT = path.resolve('.qa-artifacts');
fs.mkdirSync(OUT, { recursive: true });

async function main() {
  const browser = await chromium.launch({ headless: true });
  const desktop = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
    isMobile: true,
    hasTouch: true,
  });

  // Landing — scroll through to trigger observers
  {
    const page = await desktop.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    // Scroll through the whole page to trigger intersection observers
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y <= h; y += 300) {
      await page.evaluate((yy) => window.scrollTo(0, yy), y);
      await page.waitForTimeout(120);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, 'post-landing-scrolled.png'), fullPage: true });
    await page.close();
  }

  // not-found design
  {
    const page = await desktop.newPage();
    await page.goto(`${BASE}/does-not-exist-xyz-123`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, 'post-404.png'), fullPage: false });
    await page.close();
  }

  // chart: fill & submit to capture final chart
  {
    const page = await desktop.newPage();
    await page.goto(`${BASE}/chart`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    await page.getByLabel('Month').fill('03');
    await page.getByLabel('Day').fill('14');
    await page.getByLabel('Year').fill('1879');
    // toggle time
    const checkbox = page.locator('input[type="checkbox"]').first();
    if (await checkbox.count()) {
      await checkbox.check().catch(() => {});
      await page.waitForTimeout(300);
      // new split HH/MM inputs
      const hour = page.locator('[aria-label="Hour"]').first();
      const minute = page.locator('[aria-label="Minute"]').first();
      if (await hour.count()) await hour.fill('11').catch(() => {});
      if (await minute.count()) await minute.fill('30').catch(() => {});
    }
    await page.getByPlaceholder('Start typing city name...').fill('Ulm');
    await page.waitForTimeout(1200);
    const suggestions = await page.locator('[role="option"]').all();
    if (suggestions.length) await suggestions[0].click({ force: true }).catch(() => {});
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, 'post-chart-filled.png'), fullPage: true });

    // Clear console to only capture after-submit errors
    const consoleErrors = [];
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    await page.getByRole('button', { name: /calculate/i }).click();
    await page.waitForTimeout(3500);
    await page.screenshot({ path: path.join(OUT, 'post-chart-result.png'), fullPage: true });
    const dupKey = consoleErrors.filter((e) => /same key/i.test(e));
    fs.writeFileSync(path.join(OUT, 'post-chart-console.txt'), `Errors after submit:\n${consoleErrors.join('\n---\n') || '(none)'}\n\nDuplicate-key errors: ${dupKey.length}`);
    await page.close();
  }

  // mobile chart
  {
    const page = await mobile.newPage();
    await page.goto(`${BASE}/chart`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(OUT, 'post-mobile-chart.png'), fullPage: false });
    await page.close();
  }

  // mobile landing scrolled
  {
    const page = await mobile.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y <= h; y += 300) {
      await page.evaluate((yy) => window.scrollTo(0, yy), y);
      await page.waitForTimeout(100);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, 'post-mobile-landing.png'), fullPage: true });
    await page.close();
  }

  // /essays index
  {
    const page = await desktop.newPage();
    await page.goto(`${BASE}/essays`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, 'post-essays.png'), fullPage: false });
    await page.close();
  }

  // /signs index
  {
    const page = await desktop.newPage();
    await page.goto(`${BASE}/signs`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, 'post-signs.png'), fullPage: false });
    await page.close();
  }

  await browser.close();
  process.stdout.write('Done.\n');
}
main().catch((e) => { console.error(e); process.exit(1); });
