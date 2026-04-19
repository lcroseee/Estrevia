import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://localhost:3000';
const OUT = path.resolve('.qa-artifacts');
const findings = [];
function rec(l, d) { findings.push({l,d}); process.stdout.write(`[FIND] ${l}: ${d}\n`); }

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  const ev = { console: [], errors: [], bad: [], failed: [], posts: [] };
  page.on('console', (m) => { if (m.type()==='error') ev.console.push(m.text()); });
  page.on('pageerror', (e) => ev.errors.push(String(e?.stack || e)));
  page.on('response', (r) => {
    const s = r.status(), u = r.url();
    if (s >= 400 && !u.includes('favicon')) ev.bad.push(`${s} ${r.request().method()} ${u}`);
  });
  page.on('requestfailed', (r) => ev.failed.push(`${r.method()} ${r.url()} :: ${r.failure()?.errorText}`));
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().includes('/api/')) ev.posts.push(r.url());
  });

  await page.goto(`${BASE}/chart`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  await page.getByLabel('Month').fill('03');
  await page.getByLabel('Day').fill('14');
  await page.getByLabel('Year').fill('1879');
  rec('date-filled', '03/14/1879');

  // Inspect toggle
  const toggleLabel = page.locator('label:has-text("I know my birth time")');
  rec('toggle-count', String(await toggleLabel.count()));

  // Click toggle
  const toggleCheckbox = page.locator('input[type="checkbox"]').first();
  if (await toggleCheckbox.count()) {
    await toggleCheckbox.check().catch(() => {});
    await page.waitForTimeout(400);
  } else {
    await toggleLabel.click().catch(() => {});
    await page.waitForTimeout(400);
  }

  // Snapshot form after toggle
  const formAfterToggle = await page.evaluate(() => {
    const form = document.querySelector('form');
    if (!form) return null;
    return {
      inputs: Array.from(form.querySelectorAll('input')).map((i) => ({
        type: i.type,
        placeholder: i.placeholder || '',
        aria: i.getAttribute('aria-label') || '',
      })),
      visibleLabels: Array.from(form.querySelectorAll('label')).map((l) => l.textContent?.trim().slice(0, 60)),
    };
  });
  rec('form-after-toggle', JSON.stringify(formAfterToggle));

  // Try filling hour/minute if fields appeared (scoped to form)
  const formHour = page.locator('form >> [aria-label="Hour"], form >> input[placeholder="HH"]').first();
  const formMin = page.locator('form >> [aria-label="Minute"], form >> input[placeholder="MM"]').nth(0);
  if (await formHour.count()) {
    await formHour.fill('11').catch(() => {});
    rec('hour-filled', '11');
  } else rec('hour-field', 'still missing inside form after toggle');
  if (await formMin.count()) {
    await formMin.fill('30').catch(() => {});
    rec('minute-filled', '30');
  } else rec('minute-field', 'still missing inside form after toggle');

  // City
  const cityInput = page.getByPlaceholder('Start typing city name...');
  await cityInput.fill('Ulm');
  await page.waitForTimeout(1500);
  const suggestions = await page.locator('[role="option"], [role="listbox"] li, [data-city-suggestion], button:has-text("Ulm")').all();
  rec('city-suggestion-count', String(suggestions.length));
  if (suggestions.length) {
    const texts = await Promise.all(suggestions.slice(0, 5).map((s) => s.textContent().catch(() => null)));
    rec('city-suggestions', JSON.stringify(texts));
    await suggestions[0].click({ force: true }).catch(() => {});
    await page.waitForTimeout(400);
  }

  await page.screenshot({ path: path.join(OUT, 'chart-filled-correctly.png'), fullPage: true });

  const submit = page.getByRole('button', { name: /calculate/i });
  const respP = page.waitForResponse((r) => r.url().includes('/api/') && r.request().method() === 'POST', { timeout: 15000 }).catch(() => null);
  await submit.click();
  const resp = await respP;
  if (resp) {
    rec('submit-resp', `${resp.status()} ${resp.url()}`);
    if (resp.status() >= 400) {
      const body = await resp.text().catch(() => '');
      rec('submit-body', body.slice(0, 500));
    } else {
      const body = await resp.json().catch(() => null);
      if (body) rec('submit-body-preview', JSON.stringify(body).slice(0, 500));
    }
  } else {
    rec('submit-resp', 'NO POST response captured');
  }
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(OUT, 'chart-result.png'), fullPage: true });

  const result = await page.evaluate(() => {
    const svgs = Array.from(document.querySelectorAll('svg'));
    const chart = svgs.find((s) => s.clientWidth > 200 && s.clientHeight > 200);
    return {
      url: location.href,
      svgCount: svgs.length,
      chartPresent: !!chart,
      chartAriaLabel: chart?.getAttribute('aria-label') || null,
      chartRole: chart?.getAttribute('role') || null,
      planetsWithAria: document.querySelectorAll('svg [aria-label]').length,
      tableFallback: !!document.querySelector('table'),
      headings: Array.from(document.querySelectorAll('h1,h2,h3')).slice(0, 8).map((h) => h.textContent?.trim().slice(0, 80)),
      errorAlert: document.querySelector('[role="alert"]')?.textContent?.trim()?.slice(0, 200) || null,
    };
  });
  rec('post-submit-state', JSON.stringify(result));

  rec('events', JSON.stringify({ posts: ev.posts, bad: ev.bad.slice(0, 8), console: ev.console.slice(0, 6), errors: ev.errors.slice(0, 4), failed: ev.failed.slice(0, 4) }));

  await page.goto(`${BASE}/s/does-not-exist`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(800);
  rec('share-does-not-exist', `${page.url()} / h1=${await page.locator('h1').first().textContent().catch(() => '')}`);
  await page.screenshot({ path: path.join(OUT, 'share-missing.png'), fullPage: true });

  await browser.close();
  fs.writeFileSync(path.join(OUT, 'chart-test.json'), JSON.stringify(findings, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
