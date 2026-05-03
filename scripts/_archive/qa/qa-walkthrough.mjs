// ad-hoc QA walkthrough via Playwright
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://localhost:3000';
const OUT_DIR = path.resolve('.qa-artifacts');
fs.mkdirSync(OUT_DIR, { recursive: true });

const report = { pages: [], summary: {} };

function log(msg) {
  process.stdout.write(`[QA] ${msg}\n`);
}

async function visit(context, label, url, opts = {}) {
  const page = await context.newPage();
  const entry = {
    label,
    url,
    status: null,
    consoleErrors: [],
    consoleWarnings: [],
    pageErrors: [],
    failedRequests: [],
    bad4xx5xx: [],
    title: null,
    screenshot: null,
    notes: [],
  };

  page.on('console', (msg) => {
    const t = msg.type();
    const text = msg.text();
    if (t === 'error') entry.consoleErrors.push(text);
    else if (t === 'warning') entry.consoleWarnings.push(text);
  });
  page.on('pageerror', (err) => entry.pageErrors.push(String(err?.stack || err)));
  page.on('requestfailed', (req) => {
    entry.failedRequests.push(`${req.method()} ${req.url()} :: ${req.failure()?.errorText}`);
  });
  page.on('response', (resp) => {
    const s = resp.status();
    const u = resp.url();
    if (s >= 400 && !u.includes('favicon') && !u.includes('.map')) {
      entry.bad4xx5xx.push(`${s} ${resp.request().method()} ${u}`);
    }
  });

  try {
    const r = await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
    entry.status = r?.status() ?? null;
    await page.waitForTimeout(700);
    entry.title = await page.title();
    if (opts.inspect) await opts.inspect(page, entry);
    const shot = path.join(OUT_DIR, `${label.replace(/[^a-z0-9]+/gi, '_')}.png`);
    await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
    entry.screenshot = shot;
  } catch (e) {
    entry.notes.push(`NAV ERROR: ${String(e?.message || e)}`);
  } finally {
    report.pages.push(entry);
    await page.close();
  }
  return entry;
}

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

  await visit(desktop, 'landing', `${BASE}/`, {
    inspect: async (page, entry) => {
      const h1 = await page.locator('h1').first().textContent().catch(() => null);
      entry.notes.push(`h1: ${h1?.trim()?.slice(0, 120) || 'MISSING'}`);
      const broken = await page.evaluate(() => {
        const imgs = Array.from(document.querySelectorAll('img'));
        return imgs
          .filter((i) => i.naturalWidth === 0 && i.src)
          .map((i) => ({ src: i.src, alt: i.alt }));
      });
      if (broken.length) entry.notes.push(`broken_imgs: ${JSON.stringify(broken).slice(0, 500)}`);
      const ctas = await page.evaluate(() => {
        const list = Array.from(document.querySelectorAll('a,button')).slice(0, 300);
        return list
          .map((el) => ({
            tag: el.tagName,
            text: (el.textContent || '').trim().slice(0, 40),
            href: el.getAttribute('href'),
          }))
          .filter((x) => /chart|calculate|start|begin|pricing|passport|get started|try/i.test(x.text));
      });
      entry.notes.push(`ctas: ${JSON.stringify(ctas).slice(0, 400)}`);
    },
  });
  await visit(desktop, 'pricing', `${BASE}/pricing`);
  await visit(desktop, 'privacy', `${BASE}/privacy`);
  await visit(desktop, 'terms', `${BASE}/terms`);
  await visit(desktop, 'why-sidereal', `${BASE}/why-sidereal`);

  await visit(desktop, 'chart', `${BASE}/chart`, {
    inspect: async (page, entry) => {
      const controls = await page.evaluate(() => ({
        forms: document.querySelectorAll('form').length,
        inputs: document.querySelectorAll('input').length,
        textboxes: document.querySelectorAll('[role="textbox"]').length,
        buttons: document.querySelectorAll('button').length,
      }));
      entry.notes.push(`controls: ${JSON.stringify(controls)}`);
    },
  });
  await visit(desktop, 'charts', `${BASE}/charts`);
  await visit(desktop, 'moon', `${BASE}/moon`);
  await visit(desktop, 'hours', `${BASE}/hours`);
  await visit(desktop, 'essays', `${BASE}/essays`);
  await visit(desktop, 'signs', `${BASE}/signs`);
  await visit(desktop, 'synastry', `${BASE}/synastry`);
  await visit(desktop, 'tarot', `${BASE}/tarot`);
  await visit(desktop, 'tree-of-life', `${BASE}/tree-of-life`);
  await visit(desktop, 'settings', `${BASE}/settings`);

  await visit(desktop, 'signs-aries', `${BASE}/signs/aries`);
  await visit(desktop, 'essay-sun-aries', `${BASE}/essays/sun-in-aries`);

  await visit(desktop, 'nonexistent', `${BASE}/this-does-not-exist-xyz`);
  await visit(desktop, 'api-health', `${BASE}/api/health`);

  await visit(mobile, 'mobile-landing', `${BASE}/`);
  await visit(mobile, 'mobile-chart', `${BASE}/chart`);

  await browser.close();

  const errPages = report.pages.filter(
    (p) =>
      (p.status && p.status >= 400) ||
      p.consoleErrors.length ||
      p.pageErrors.length ||
      p.bad4xx5xx.length ||
      p.failedRequests.length
  );
  report.summary = {
    total: report.pages.length,
    withIssues: errPages.length,
  };

  fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));
  const lines = [];
  for (const p of report.pages) {
    lines.push(`\n=== ${p.label} (${p.url})  status=${p.status}  title=${p.title || ''}`);
    if (p.notes.length) lines.push(`  notes: ${p.notes.join(' | ')}`);
    if (p.consoleErrors.length)
      lines.push(`  console.error [${p.consoleErrors.length}]:\n   - ` + p.consoleErrors.slice(0, 6).join('\n   - '));
    if (p.pageErrors.length)
      lines.push(`  pageerror [${p.pageErrors.length}]:\n   - ` + p.pageErrors.slice(0, 4).join('\n   - '));
    if (p.bad4xx5xx.length)
      lines.push(`  bad_responses [${p.bad4xx5xx.length}]:\n   - ` + p.bad4xx5xx.slice(0, 10).join('\n   - '));
    if (p.failedRequests.length)
      lines.push(`  failed_requests [${p.failedRequests.length}]:\n   - ` + p.failedRequests.slice(0, 6).join('\n   - '));
  }
  fs.writeFileSync(path.join(OUT_DIR, 'report.txt'), lines.join('\n'));
  log(`Visited ${report.pages.length} pages, ${errPages.length} with issues.`);
  log(`Report: ${path.join(OUT_DIR, 'report.txt')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
