// interactive QA: chart form, share, mobile nav
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://localhost:3000';
const OUT = path.resolve('.qa-artifacts');
fs.mkdirSync(OUT, { recursive: true });

const findings = [];
function record(label, detail) {
  findings.push({ label, detail });
  process.stdout.write(`[FIND] ${label}: ${detail}\n`);
}

async function setupPage(context, label) {
  const page = await context.newPage();
  const events = { console: [], errors: [], bad: [], failed: [] };
  page.on('console', (m) => {
    if (m.type() === 'error') events.console.push(m.text());
  });
  page.on('pageerror', (e) => events.errors.push(String(e?.stack || e)));
  page.on('response', (r) => {
    const s = r.status();
    const u = r.url();
    if (s >= 400 && !u.includes('favicon') && !u.includes('.map')) {
      events.bad.push(`${s} ${r.request().method()} ${u}`);
    }
  });
  page.on('requestfailed', (r) =>
    events.failed.push(`${r.method()} ${r.url()} :: ${r.failure()?.errorText}`)
  );
  return { page, events, label };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const desktop = await browser.newContext({ viewport: { width: 1366, height: 900 } });

  // ==== CHART FORM — happy path
  {
    const { page, events } = await setupPage(desktop, 'chart-form');
    await page.goto(`${BASE}/chart`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1200);

    // dump all labels/inputs in form
    const snap = await page.evaluate(() => {
      const form = document.querySelector('form');
      if (!form) return { hasForm: false };
      const labels = Array.from(form.querySelectorAll('label')).map((l) => l.textContent?.trim().slice(0, 80));
      const inputs = Array.from(form.querySelectorAll('input, select, textarea')).map((i) => ({
        tag: i.tagName,
        type: i.type || '',
        name: i.name || '',
        id: i.id || '',
        placeholder: i.placeholder || '',
        ariaLabel: i.getAttribute('aria-label') || '',
        required: i.required || false,
      }));
      const buttons = Array.from(form.querySelectorAll('button')).map((b) => b.textContent?.trim().slice(0, 60));
      return { hasForm: true, labels, inputs, buttons };
    });
    record('chart-form-structure', JSON.stringify(snap));

    // Attempt: Try submitting an empty form to see validation
    await page.screenshot({ path: path.join(OUT, 'chart-empty.png'), fullPage: true });
    const submitBtn = await page.locator('form button[type="submit"], form button:has-text("Calculate")').first();
    if ((await submitBtn.count()) > 0) {
      await submitBtn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(OUT, 'chart-empty-submit.png'), fullPage: true });
      const errs = await page.evaluate(() => {
        const arr = [];
        document.querySelectorAll('[role="alert"], .error, [data-error], [aria-invalid="true"]').forEach((n) => {
          const t = n.textContent?.trim();
          if (t) arr.push(t.slice(0, 200));
        });
        return arr;
      });
      record('chart-empty-validation', JSON.stringify(errs));
    } else {
      record('chart-form', 'NO submit button found');
    }

    // Fill a known birth: Albert Einstein 1879-03-14 11:30 Ulm
    // Our form fields are unknown — inspect inputs and fill best match
    const fillResult = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input, select'));
      return inputs.map((i) => ({
        tag: i.tagName,
        type: i.type || '',
        name: i.name || '',
        id: i.id || '',
        placeholder: i.placeholder || '',
        aria: i.getAttribute('aria-label') || '',
      }));
    });
    record('chart-inputs-detail', JSON.stringify(fillResult));

    // Try to fill name
    async function fillByPattern(regex, value) {
      const locators = [
        page.locator(`input[placeholder*="${value}" i]`),
        page.locator(`input[aria-label*="${value}" i]`),
      ];
      const handles = await page.$$('input, textarea');
      for (const h of handles) {
        const attrs = await h.evaluate((el) => ({
          placeholder: el.placeholder || '',
          aria: el.getAttribute('aria-label') || '',
          name: el.name || '',
          id: el.id || '',
          type: el.type || '',
        }));
        const hay = `${attrs.placeholder} ${attrs.aria} ${attrs.name} ${attrs.id}`.toLowerCase();
        if (regex.test(hay)) {
          await h.fill(value).catch(() => {});
          return attrs;
        }
      }
      return null;
    }

    const r1 = await fillByPattern(/name|имя/i, 'Albert');
    const r2 = await fillByPattern(/date|дата|birthday|dob/i, '1879-03-14');
    const r3 = await fillByPattern(/time|час|\btime\b/i, '11:30');
    const r4 = await fillByPattern(/city|place|location|город|place of birth/i, 'Ulm');
    record('chart-fill-attempts', JSON.stringify({ r1, r2, r3, r4 }));

    await page.screenshot({ path: path.join(OUT, 'chart-filled.png'), fullPage: true });
    // wait for city autocomplete
    await page.waitForTimeout(1500);
    // click first autocomplete suggestion if any
    const suggestions = await page.locator('[role="option"], [data-suggestion], .autocomplete-item, li button, [role="listbox"] li').all().catch(() => []);
    if (suggestions.length) {
      record('chart-city-suggestions-count', String(suggestions.length));
      await suggestions[0].click({ force: true }).catch(() => {});
      await page.waitForTimeout(400);
    } else {
      record('chart-city-suggestions', 'none found after typing Ulm');
    }

    // submit
    if ((await submitBtn.count()) > 0) {
      const reqPromise = page.waitForResponse((r) => r.url().includes('/api/') && r.request().method() === 'POST', { timeout: 15000 }).catch(() => null);
      await submitBtn.click({ force: true }).catch(() => {});
      const resp = await reqPromise;
      if (resp) {
        record('chart-submit-api', `${resp.status()} ${resp.url()}`);
        if (resp.status() >= 400) {
          const body = await resp.text().catch(() => '');
          record('chart-submit-api-body', body.slice(0, 400));
        }
      } else {
        record('chart-submit-api', 'no POST captured');
      }
      await page.waitForTimeout(2000);
      await page.screenshot({ path: path.join(OUT, 'chart-submitted.png'), fullPage: true });
      const afterSubmit = await page.evaluate(() => ({
        url: location.href,
        hasSvg: !!document.querySelector('svg[aria-label], svg'),
        svgAriaLabel: document.querySelector('svg')?.getAttribute('aria-label') || null,
        planetsRendered: document.querySelectorAll('[data-planet], [data-testid*="planet" i]').length,
        alertText: document.querySelector('[role="alert"]')?.textContent?.trim()?.slice(0, 200) || null,
      }));
      record('chart-result', JSON.stringify(afterSubmit));
    }

    record('chart-events', JSON.stringify({
      console_errors: events.console.slice(0, 6),
      page_errors: events.errors.slice(0, 4),
      bad: events.bad.slice(0, 8),
      failed: events.failed.slice(0, 4),
    }));
    await page.close();
  }

  // ==== Navigation: mobile bottom-tab sanity
  {
    const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
      isMobile: true,
      hasTouch: true,
    });
    const { page } = await setupPage(mobile, 'mobile-nav');
    await page.goto(`${BASE}/chart`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1000);
    const nav = await page.evaluate(() => {
      const bottom = document.querySelector('nav[class*="bottom" i], [data-mobile-nav], nav:last-of-type');
      if (!bottom) return { hasBottomNav: false };
      const items = Array.from(bottom.querySelectorAll('a, button')).map((el) => ({
        text: el.textContent?.trim().slice(0, 30),
        href: el.getAttribute('href') || '',
      }));
      return { hasBottomNav: true, items, rect: bottom.getBoundingClientRect().toJSON() };
    });
    record('mobile-nav', JSON.stringify(nav));
    await page.screenshot({ path: path.join(OUT, 'mobile-chart-loaded.png'), fullPage: true });
    await page.close();
    await mobile.close();
  }

  // ==== Try to find share/passport
  {
    const { page } = await setupPage(desktop, 'share-discovery');
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);
    const links = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a')).map((a) => a.href).filter((h) => /passport|\/s\//i.test(h)).slice(0, 20);
    });
    record('share-links-on-landing', JSON.stringify(links));
    // Try direct API for a passport
    const apiProbe = await page.request
      .get(`${BASE}/api/v1/passport/test`, { failOnStatusCode: false })
      .catch((e) => ({ err: String(e) }));
    if (apiProbe.status) record('api-passport-test', `status=${apiProbe.status()}`);
    else record('api-passport-test', `err=${apiProbe.err}`);
    // Try og image
    const og = await page.request
      .get(`${BASE}/api/og/passport/test`, { failOnStatusCode: false })
      .catch((e) => ({ err: String(e) }));
    if (og.status) record('api-og-passport', `status=${og.status()}`);
    else record('api-og-passport', `err=${og.err}`);
    await page.close();
  }

  await browser.close();

  fs.writeFileSync(path.join(OUT, 'interactive.json'), JSON.stringify(findings, null, 2));
  process.stdout.write(`\n[QA] ${findings.length} findings written.\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
