# SEO + UX + Content Overhaul — P0 Implementation Plan

> **For agentic workers:** This plan is executed by an Agent Team `estrevia-p0-overhaul` with 10 named teammates per the topology in `docs/superpowers/specs/2026-05-02-seo-ux-content-overhaul-design.md` §8. Each task carries an `Owner` field — work only on tasks where Owner matches your teammate name OR Owner is `lead` and you ARE the lead. Use TaskList for state, SendMessage for coordination, never edit checkboxes outside your owned tasks. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the SEO/UX/Content P0 overhaul (canonicalization, /es/ URL prefix migration, mobile responsive fixes, chart state persistence, OG image redesign, thin-content expansion on 4 pages) so that estrevia.app emits correct canonical+hreflang to Google, the Cosmic Passport viral loop is mobile-shippable, and indexable pages are no longer thin.

**Architecture:** Hybrid agent topology (implementer+verifier per cross-cutting role; split+mutual-review for content; QA-only for verification). Two branches: `main` for safe content/UI/frontend changes, `p0-seo-foundation` for the risky SEO/i18n migration with a founder-gated merge. Mandatory production-baseline snapshots per verifier before any code change.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 6 (strict), `next-intl@4.9.0` (routing v4 with URL-prefix locales), `@clerk/nextjs@7.2.3` (composed in middleware), `@vercel/og@0.11.1` (Satori), `next-intl/middleware`, Playwright for E2E + DOM assertions, vitest for unit tests, Sharp/Satori for OG image rendering.

**Spec source of truth:** `docs/superpowers/specs/2026-05-02-seo-ux-content-overhaul-design.md`. When this plan and the spec disagree, the spec wins; flag the discrepancy in TaskList comments and request lead input.

---

## File Structure (what gets created/modified across all tasks)

**New files (created by ROLE 1 — `seo-eng`):**
- `src/i18n/routing.ts` — next-intl `routing` definition (locales, defaultLocale, localePrefix='as-needed')
- `src/i18n/navigation.ts` — exports locale-aware Link/redirect/usePathname/useRouter
- `src/shared/lib/share.ts` — `buildShareUrl(targetUrl, channel)` UTM helper
- `tests/e2e/middleware.spec.ts` — Playwright tests for the canonical-host redirect + i18n routing + Clerk auth interaction
- `src/shared/lib/__tests__/share.test.ts` — vitest unit tests for the UTM helper

**Modified files (ROLE 1):**
- `src/middleware.ts` — re-write to compose Clerk + next-intl + canonical-host redirect (illustrative pattern in spec §2.2 #4)
- `src/i18n/request.ts` — switch from cookie/header detection to URL-segment locale resolution
- `src/shared/seo/metadata.ts` — locale-aware canonical + correct hreflang map
- `src/shared/seo/__tests__/metadata.test.ts` — extend coverage for locale-aware behaviour
- `src/app/sitemap.ts` — emit one URL entry per locale per canonical path
- All page-level `generateMetadata()` callers (audit + add `locale` from `getLocale()`) — discovered via grep
- All `next/link` imports (audit + replace with `@/i18n/navigation`) — discovered via grep
- `src/app/(marketing)/page.tsx` and/or `src/app/(marketing)/layout.tsx` — dedupe Organization JSON-LD
- Share-button components (locations discovered via grep) — apply UTM helper
- Vercel env vars (`NEXT_PUBLIC_SITE_URL` for production + preview environments) — outside the codebase

**Modified files (ROLE 2 — `fe-eng`):**
- `src/app/(app)/hours/page.tsx` — consolidate dup H1 mobile/desktop into single adaptive component
- `src/app/(app)/tree-of-life/page.tsx` — same dedupe pattern (verify first)
- `src/app/(app)/chart/**` — chart state persistence via URL query params, restore on mount
- Header navigation component (path discovered) — responsive overflow fix
- `src/app/s/[id]/page.tsx` — share-bar grid responsive + SSR audit
- `tests/e2e/chart-state.spec.ts` (NEW) — reload restores result
- `tests/e2e/responsive.spec.ts` (NEW) — overflow + DOM h1 count assertions

**Modified files (ROLE 3 — `ui-eng`):**
- `src/app/api/og/passport/[id]/route.ts` (or wherever the OG endpoint lives — verifier confirms first) — full canvas redesign 1200×630
- New 1080×1920 Stories OG endpoint (or query-param variant on the existing route) — for vertical share + PNG export
- `src/app/s/[id]/page.tsx` — share-section visual unification (single container, shared glow)
- `src/app/(app)/chart/**` — desaturate Aspects/Houses checkboxes
- `messages/en.json`, `messages/es.json` — add `share.passport.copy.*` keys per channel

**Modified files (ROLE 4 — `content-a`, `content-b`):**
- `src/app/(app)/hours/page.tsx` — append educational sections (≥600 words EN+ES) below widget
- `src/app/(app)/moon/page.tsx` — same
- `src/app/(app)/synastry/page.tsx` — same
- `src/app/(app)/tree-of-life/page.tsx` — same
- `messages/en.json`, `messages/es.json` — add nested `educational.{hours,moon,synastry,treeOfLife}.*` keys
- FAQ JSON-LD inline in each page using the existing `src/shared/seo/json-ld.ts` `faqSchema` generator (or add it there if missing — single source of truth per CLAUDE.md SEO rules)

**New artefacts (ROLE 5 — QA):**
- `tmp/baselines/seo-baseline-2026-05-02.json` — pre-flight snapshot
- `tmp/baselines/fe-screenshots-pre/` — Playwright PNGs at 7 viewports
- `tmp/baselines/og-baseline/` — current OG bytes for 5 sample IDs
- `tmp/qa-reports/p0-overhaul-2026-05-02.md` — final QA report consumed by founder for merge gate

`tmp/` is already gitignored (commit `d0dd8fd chore: launch-prep — exclude worktrees, gitignore tmp/`).

---

## Task graph & owner reference

| Task | Owner | Branch | Blocks | Blocked by |
| ---- | ----- | ------ | ------ | ---------- |
| 1 | `seo-verifier` | n/a | 6, 32 | none |
| 2 | `fe-verifier` | n/a | 22, 33 | none |
| 3 | `ui-verifier` | n/a | 26, 34 | none |
| 4 | `qa-tech` | n/a | (lead consolidation) | none |
| 5 | `qa-ux` | n/a | (lead consolidation) | none |
| 6 | `seo-eng` | `p0-seo-foundation` | 7-21 | 1 |
| 7-21 | `seo-eng` | `p0-seo-foundation` | 32-39 | 6 |
| 22-25 | `fe-eng` | `main` | 32-39 | 2 |
| 26-30 | `ui-eng` | `main` | 32-39 | 3 |
| 31a, 31b, 32a, 32b | `content-a` / `content-b` | `main` | 32-39 | 16 (UTM helper for any in-content share embed) |
| 33 | `content-a`+`content-b` | `main` | 32-39 | 31a-32b |
| 34-37 | `qa-tech` | n/a | 41 | 7-33 done |
| 38-40 | `qa-ux` | n/a | 41 | 7-33 done |
| 41 | `lead` | n/a | 42 | 34-40 |
| 42 | `lead` (founder gate) | merge | 43 | 41 |
| 43 | `lead` | n/a | done | 42 |

---

## Phase 0 — Pre-flight baselines (parallel, all verifiers + qa-tech/qa-ux)

### Task 1: SEO baseline snapshot

**Owner:** `seo-verifier`
**Branch:** main (no code changes; only file writes to `tmp/baselines/`)
**Depends on:** none
**Files:**
- Create: `tmp/baselines/seo-baseline-2026-05-02.json`
**Why:** Spec §2.1, §7. Establish ground truth for production canonical/sitemap/robots/redirect state before any change. Half the brief's claims about canonical leak may be a missing env var, not a code bug.

- [ ] **Step 1: Check Vercel env**

```bash
vercel env ls --environment=production | grep -E 'NEXT_PUBLIC_SITE_URL|VERCEL_URL'
```
Capture full output. Record whether `NEXT_PUBLIC_SITE_URL` is set in production.

- [ ] **Step 2: Capture canonical / og / twitter on key pages**

```bash
for p in / /chart /essays/sun-in-aries /why-sidereal /pricing; do
  echo "=== $p ==="
  curl -s "https://estrevia.app$p" \
    | grep -E 'rel="canonical"|property="og:url"|property="og:image"|name="twitter:image"' \
    | head -8
done
```
Capture all output to a temp file.

- [ ] **Step 3: Capture sitemap state**

```bash
curl -s https://estrevia.app/sitemap.xml > tmp/baselines/sitemap-pre.xml
wc -l tmp/baselines/sitemap-pre.xml
grep -c '<loc>' tmp/baselines/sitemap-pre.xml
grep -E 'estrevia-[a-z0-9]+-' tmp/baselines/sitemap-pre.xml | head -3
```
Record total entries, whether any vercel.app refs slipped in.

- [ ] **Step 4: Capture robots state**

```bash
curl -s https://estrevia.app/robots.txt > tmp/baselines/robots-pre.txt
cat tmp/baselines/robots-pre.txt
```

- [ ] **Step 5: Test redirect from a recent vercel.app deployment**

Identify a recent deployment hash:
```bash
vercel ls estrevia | head -5
```
Pick the most recent production deployment URL, then:
```bash
curl -sI "https://<deployment-hash>-kovalenk20-5929s-projects.vercel.app/" | head -10
```
Record HTTP status and `Location` header.

- [ ] **Step 6: Capture homepage JSON-LD blocks (look for Organization duplicate)**

```bash
curl -s https://estrevia.app/ | grep -A 30 'application/ld+json' > tmp/baselines/home-jsonld-pre.txt
grep -c '"@type":"Organization"' tmp/baselines/home-jsonld-pre.txt
```
Confirm or refute the brief's claim of duplicate Organization JSON-LD.

- [ ] **Step 7: Aggregate findings into JSON**

Write `tmp/baselines/seo-baseline-2026-05-02.json` with structured fields:
```json
{
  "vercelEnvHasSiteUrl": true,
  "vercelEnvSiteUrlValue": "https://estrevia.app",
  "canonicalsByPath": { "/": "https://estrevia.app/" },
  "sitemapEntryCount": 221,
  "sitemapHasVercelRefs": false,
  "robotsSitemapLine": "Sitemap: https://estrevia.app/sitemap.xml",
  "vercelDeploymentRedirectStatus": 200,
  "vercelDeploymentRedirectLocation": null,
  "homeOrganizationJsonLdCount": 2
}
```

- [ ] **Step 8: Post findings via SendMessage to seo-eng + lead**

Summarize key findings in 5-8 lines: which claims of the brief are confirmed vs refuted vs uncertain. This unblocks Task 6.

- [ ] **Step 9: Commit baseline (gitignored, but for traceability)**

`tmp/` is gitignored — no commit needed, but TaskUpdate the task with metadata pointing at the file paths so others can read.

```
TaskUpdate(taskId="1", status="completed", metadata={
  "baselineFile": "tmp/baselines/seo-baseline-2026-05-02.json",
  "summary": "<5-8 line summary>"
})
```

---

### Task 2: Frontend baseline snapshot

**Owner:** `fe-verifier`
**Branch:** none (read-only)
**Depends on:** none
**Files:**
- Create: `tmp/baselines/fe-screenshots-pre/<viewport>x<viewport>-<page>.png` (35 files for 7 viewports × 5 pages)
- Create: `tmp/baselines/fe-dom-state-pre.json`
**Why:** Spec §3, §7. Captures truth for mobile overflow, dup H1, chart reload behaviour, /s/[id] SSR state.

- [ ] **Step 1: Set up Playwright run script**

Create `tests/baselines/fe-baseline.spec.ts` (you can delete after — purpose is pure capture):

```ts
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
const OUT = 'tmp/baselines/fe-screenshots-pre';

test('capture baseline screenshots + DOM facts', async ({ browser }) => {
  await fs.mkdir(OUT, { recursive: true });
  const facts: Record<string, unknown> = {};

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
    const page = await ctx.newPage();
    for (const p of PAGES) {
      const url = `https://estrevia.app${p}`;
      await page.goto(url, { waitUntil: 'networkidle' });
      const file = `${OUT}/${vp.w}x${vp.h}_${p.replace(/\//g, '_') || 'home'}.png`;
      await page.screenshot({ path: file, fullPage: true });
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        h1Count: document.querySelectorAll('h1').length,
        h2Count: document.querySelectorAll('h2').length,
      }));
      facts[`${vp.w}x${vp.h}${p}`] = overflow;
    }
    await ctx.close();
  }
  await fs.writeFile('tmp/baselines/fe-dom-state-pre.json', JSON.stringify(facts, null, 2));
});
```

- [ ] **Step 2: Run capture**

```bash
mkdir -p tmp/baselines/fe-screenshots-pre
npx playwright test tests/baselines/fe-baseline.spec.ts
```
Expected: passes; produces 35 screenshots + DOM JSON. If site requires CDN warmup, retry once.

- [ ] **Step 3: Capture /chart reload behaviour**

Manually-scripted Playwright (or extend the spec):
```ts
test('chart reload behaviour', async ({ page }) => {
  await page.goto('https://estrevia.app/chart');
  // Fill the form with synthetic data — use selectors from the actual form
  // (date 1990-04-15, time 14:30, place "London", lat 51.5074, lon -0.1278)
  // Submit, wait for result.
  await page.reload({ waitUntil: 'networkidle' });
  // Record: is form empty? Is result visible?
  const formVisible = await page.locator('input[name="birthDate"]').isVisible().catch(() => null);
  const resultVisible = await page.locator('[data-testid="natal-chart-result"]').isVisible().catch(() => null);
  console.log({ formVisible, resultVisible });
});
```
Record the outcome in `fe-dom-state-pre.json` under key `chartReloadBehaviour`.

- [ ] **Step 4: SSR audit on /s/[id]**

Pick any existing `/s/[id]` URL (or create one via the chart save flow on staging if you don't have a test ID). Then:
```bash
curl -s "https://estrevia.app/s/<sample-id>" \
  | grep -E 'rel="canonical"|property="og:|name="twitter:|<h1' \
  | head -20
```
Record whether canonical + og:* + h1 are present in the HTML before any JS runs.

- [ ] **Step 5: Post findings to fe-eng + lead via SendMessage**

5-8 line summary: per viewport, which pages overflow; H1 count on /hours and /tree-of-life; chart reload state; /s/[id] SSR completeness.

- [ ] **Step 6: TaskUpdate with metadata**

```
TaskUpdate(taskId="2", status="completed", metadata={
  "screenshotDir": "tmp/baselines/fe-screenshots-pre",
  "domStateFile": "tmp/baselines/fe-dom-state-pre.json",
  "summary": "<text>"
})
```

---

### Task 3: UX/UI baseline snapshot

**Owner:** `ui-verifier`
**Branch:** none (read-only)
**Depends on:** none
**Files:**
- Create: `tmp/baselines/og-baseline/<sample-id>.png` × 5
- Create: `tmp/baselines/og-validators-pre.md`
- Create: `tmp/baselines/share-section-pre.png`
**Why:** Spec §4, §7. Establishes current OG image visual + validator pass/fail before redesign.

- [ ] **Step 1: Discover OG endpoint**

```bash
grep -rn "og/passport\|og:image\|opengraph" src/app/api/og/ src/app/ 2>/dev/null | head -20
ls src/app/api/og/
```
Identify the actual route file path. Update spec §4 / TaskList if it differs from `/api/og/passport/[id]`.

- [ ] **Step 2: Fetch 5 sample OG images**

Pick 5 share IDs (use existing prod IDs from `/s/` traffic, or generate synthetic ones). For each:
```bash
curl -s "https://estrevia.app/api/og/passport/<id>" \
  -o "tmp/baselines/og-baseline/<id>.png"
```
Visual inspect each — record issues per spec §4.1 (empty quarters, rarity not dominant, no personalization, brand small).

- [ ] **Step 3: Run preview validators**

For one sample share URL `https://estrevia.app/s/<id>`:
- Twitter Card Validator: `WebFetch` to `https://cards-dev.twitter.com/validator?url=<encoded-url>`
- LinkedIn Post Inspector: `WebFetch` to `https://www.linkedin.com/post-inspector/inspect/<encoded-url>`
- Telegram instant view: not scriptable cleanly — note the manual procedure for the founder in the report

Write findings to `tmp/baselines/og-validators-pre.md`.

- [ ] **Step 4: Capture share section visual on /s/[id]**

Playwright at desktop viewport:
```ts
await page.goto('https://estrevia.app/s/<sample-id>');
await page.screenshot({ path: 'tmp/baselines/share-section-pre.png', fullPage: false, clip: { x: 0, y: 0, width: 1280, height: 1000 } });
```

- [ ] **Step 5: Capture share copy strings (if any)**

```bash
grep -E "share|Share" messages/en.json messages/es.json | head -20
```
Record which keys exist today (so `ui-eng` knows what to add vs replace).

- [ ] **Step 6: Post summary to ui-eng + lead via SendMessage**

5-line summary: OG endpoint path, key visual issues confirmed, validator outputs, share-section state.

- [ ] **Step 7: TaskUpdate completed with metadata**

---

### Task 4: QA-tech baseline (Lighthouse + JSON-LD pre-state)

**Owner:** `qa-tech`
**Branch:** none (read-only)
**Depends on:** none
**Files:**
- Create: `tmp/baselines/lighthouse-pre/<page>-mobile.json`, `...-desktop.json` (per page)
- Create: `tmp/baselines/jsonld-pre.md`
**Why:** Spec §6.1. Pre-state for diff.

- [ ] **Step 1: Lighthouse on key pages**

For each of `/`, `/chart`, `/essays/sun-in-aries`, `/hours`, `/why-sidereal`:
```bash
npx lighthouse "https://estrevia.app/<path>" \
  --output=json \
  --output-path="tmp/baselines/lighthouse-pre/<page>-mobile.json" \
  --emulated-form-factor=mobile \
  --quiet --chrome-flags="--headless"
```
Repeat with `--emulated-form-factor=desktop`.

- [ ] **Step 2: JSON-LD per page baseline**

For each page above, fetch HTML and extract `<script type="application/ld+json">` blocks. Validate each via Google Rich Results Test (`WebFetch` to `https://search.google.com/test/rich-results?url=<encoded>`). Record pass/fail counts per page in `tmp/baselines/jsonld-pre.md`.

- [ ] **Step 3: Indexation snapshot**

Use WebFetch to capture the visible result count for `site:estrevia.app` and `site:estrevia.app/s/`. Record both numbers.

- [ ] **Step 4: TaskUpdate completed with metadata**

Summary should make the post-implementation diff trivial.

---

### Task 5: QA-ux baseline (share flow + responsive)

**Owner:** `qa-ux`
**Branch:** none (read-only)
**Depends on:** none

Reuse outputs from Task 2 (responsive screenshots) and Task 3 (OG validators) — no need to duplicate. This task captures only:

- [ ] **Step 1: Share-flow trace per channel (current state)**

For each of X, Telegram, WhatsApp, Copy, Native: Playwright opens `/s/<sample-id>`, clicks the corresponding share button, intercepts the outbound URL or share intent payload, records what URL is sent (with or without UTM, current canonical leak status).

```ts
const channels = ['x', 'telegram', 'whatsapp', 'copy', 'native'];
const results: Record<string, string> = {};
for (const ch of channels) {
  // Click button selectors are likely [data-testid="share-<ch>"] — verify in DOM first
  // For 'native', intercept the navigator.share call by overriding before page interaction
  const url = await page.evaluate(/* extract intent URL */);
  results[ch] = url;
}
```
Save to `tmp/baselines/share-flow-pre.json`.

- [ ] **Step 2: TaskUpdate with summary**

---

## Phase 1 — Implementer work (parallel, with task-level deps)

### Task 6: Verify and (if needed) set Vercel `NEXT_PUBLIC_SITE_URL`

**Owner:** `seo-eng`
**Branch:** none yet (env-only)
**Depends on:** Task 1 (need baseline to know whether env is set)
**Files:** none (Vercel env vars; out-of-band)
**Why:** Spec §2.1 — single highest-leverage check. If env was missing, this single change (plus a redeploy) likely fixes the canonical leak observed in the brief, BEFORE any code change.

- [ ] **Step 1: Read Task 1's metadata**

```
TaskGet(taskId="1") → read metadata.summary, look for vercelEnvHasSiteUrl
```

- [ ] **Step 2: If missing, prepare the add command**

```bash
vercel env add NEXT_PUBLIC_SITE_URL production
# Will prompt for value: paste https://estrevia.app
vercel env add NEXT_PUBLIC_SITE_URL preview
# Same value
```

- [ ] **Step 3: Ask founder before running env-write commands**

`vercel env add` is a shared-state action. Send via SendMessage to `lead`:
> "Task 6: NEXT_PUBLIC_SITE_URL is missing in Vercel <env list>. Permission to run `vercel env add NEXT_PUBLIC_SITE_URL=https://estrevia.app production preview`?"

Wait for `lead` (which relays to founder) reply. If approved, run.

- [ ] **Step 4: Trigger a no-code redeploy on the affected env**

```bash
vercel --prod  # only for production env update
```
Wait for deploy success.

- [ ] **Step 5: Re-run a subset of Task 1's checks against the new prod**

```bash
curl -s https://estrevia.app/chart | grep canonical
```
If canonical now shows `https://estrevia.app/chart` → confirm partial fix. Continue with code changes anyway (i18n migration is still required for /es/).

- [ ] **Step 6: Create branch `p0-seo-foundation`**

```bash
git checkout -b p0-seo-foundation
git push -u origin p0-seo-foundation
```

- [ ] **Step 7: TaskUpdate completed**

---

### Task 7: Create `src/i18n/routing.ts`

**Owner:** `seo-eng`
**Branch:** `p0-seo-foundation`
**Depends on:** Task 6
**Files:**
- Create: `src/i18n/routing.ts`
**Why:** Spec §2.2 #1. Foundation for next-intl URL-prefix locale routing.

- [ ] **Step 1: Confirm next-intl routing API for installed version**

Quick check:
```bash
node -e "const r = require('next-intl/routing'); console.log(Object.keys(r));"
```
Expected: includes `defineRouting`. If not, consult `node_modules/next-intl/dist/types/routing.d.ts` and adjust import.

- [ ] **Step 2: Write the file**

```ts
// src/i18n/routing.ts
import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['en', 'es'] as const,
  defaultLocale: 'en',
  // EN paths stay at root (/chart, /essays/sun-in-aries).
  // ES paths get an /es prefix (/es/chart, /es/essays/sun-in-aries).
  localePrefix: 'as-needed',
});

export type Locale = (typeof routing.locales)[number];
```

- [ ] **Step 3: Type-check**

```bash
npm run typecheck
```
Expected: no new errors related to this file.

- [ ] **Step 4: Commit**

```bash
git add src/i18n/routing.ts
git commit -m "feat(i18n): add routing config for /es/ URL-prefix locale"
```

---

### Task 8: Create `src/i18n/navigation.ts`

**Owner:** `seo-eng`
**Branch:** `p0-seo-foundation`
**Depends on:** Task 7
**Files:**
- Create: `src/i18n/navigation.ts`
**Why:** Spec §2.2 #3. Locale-aware Link component for use across the app.

- [ ] **Step 1: Write the file**

```ts
// src/i18n/navigation.ts
import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
```

- [ ] **Step 2: Type-check**

```bash
npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/i18n/navigation.ts
git commit -m "feat(i18n): add locale-aware navigation helpers"
```

---

### Task 9: Rewrite `src/i18n/request.ts` for URL-segment locale

**Owner:** `seo-eng`
**Branch:** `p0-seo-foundation`
**Depends on:** Task 7
**Files:**
- Modify: `src/i18n/request.ts`
**Why:** Spec §2.2 #2. Locale now comes from the URL (resolved by middleware), not cookies/headers.

- [ ] **Step 1: Replace file contents**

```ts
// src/i18n/request.ts
import { getRequestConfig } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  const messages = (await import(`../../messages/${locale}.json`)).default;
  return { locale, messages };
});
```

- [ ] **Step 2: Type-check + dev server smoke test**

```bash
npm run typecheck
npm run dev
# In a second terminal:
curl -s http://localhost:3000/ | grep -E '<html lang|<title>' | head -5
curl -s http://localhost:3000/es | grep -E '<html lang|<title>' | head -5
```
Expected: `lang="en"` on root, `lang="es"` on /es. (May show errors until middleware Task 10 is done — that's OK; partial validation here is just for type correctness.)

Stop the dev server.

- [ ] **Step 3: Commit**

```bash
git add src/i18n/request.ts
git commit -m "feat(i18n): switch request locale to URL-segment resolution"
```

---

### Task 10: Rewrite `src/middleware.ts` (Clerk + next-intl + canonical-host redirect)

**Owner:** `seo-eng`
**Branch:** `p0-seo-foundation`
**Depends on:** Task 7, Task 8, Task 9
**Files:**
- Modify: `src/middleware.ts`
- Create: `tests/e2e/middleware.spec.ts`
**Why:** Spec §2.2 #4. The most delicate change in the project — composes three concerns. Existing Clerk matchers and protected routes must be preserved.

- [ ] **Step 1: Write a failing E2E test for canonical-host redirect**

```ts
// tests/e2e/middleware.spec.ts
import { test, expect } from '@playwright/test';

const PROD = process.env.E2E_TARGET ?? 'http://localhost:3000';

test.describe('middleware', () => {
  test('redirects vercel.app deployment hostname to estrevia.app (prod-only)', async ({ request }) => {
    // Skip in local/preview — only meaningful against a prod-like env.
    test.skip(!process.env.VERCEL_ENV || process.env.VERCEL_ENV !== 'production',
      'production-env-only assertion');
    const response = await request.get(`${PROD}/`, { maxRedirects: 0 });
    expect(response.status()).toBeGreaterThanOrEqual(300);
    expect(response.headers()['location']).toMatch(/^https:\/\/estrevia\.app\/?$/);
  });

  test('locale prefix routing — /es resolves with es lang', async ({ page }) => {
    await page.goto(`${PROD}/es`);
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  });

  test('default locale at root — / resolves with en lang', async ({ page }) => {
    await page.goto(`${PROD}/`);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('protected route redirects unauthenticated to sign-in', async ({ page }) => {
    await page.goto(`${PROD}/charts`, { waitUntil: 'commit' });
    expect(page.url()).toContain('/sign-in');
  });

  test('protected API returns 401 JSON for unauthenticated', async ({ request }) => {
    const r = await request.post(`${PROD}/api/v1/chart/save`, { data: {} });
    expect(r.status()).toBe(401);
    const body = await r.json();
    expect(body).toMatchObject({ success: false });
  });
});
```

- [ ] **Step 2: Run tests against current middleware (must fail on the locale-routing tests)**

```bash
npx playwright test tests/e2e/middleware.spec.ts
```
Expected: locale-routing tests FAIL (no /es exists yet); auth tests may PASS (Clerk is unchanged).

- [ ] **Step 3: Rewrite the middleware**

Replace `src/middleware.ts` with the full composition. Preserve every entry from the existing `isProtectedRoute` and `config.matcher` lists.

```ts
// src/middleware.ts
import { NextResponse, type NextRequest } from 'next/server';
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import createIntlMiddleware from 'next-intl/middleware';
import { routing } from '@/i18n/routing';

const intlMiddleware = createIntlMiddleware(routing);

const isProtectedRoute = createRouteMatcher([
  '/charts(.*)',
  '/settings(.*)',
  '/api/v1/chart/save(.*)',
  '/api/v1/chart/list(.*)',
  '/api/v1/chart/:id([a-zA-Z0-9_-]{10,})',
  '/api/v1/stripe(.*)',
  '/api/v1/user(.*)',
  '/api/v1/synastry/calculate(.*)',
  '/api/v1/synastry/:id([a-zA-Z0-9_-]+)/analyze(.*)',
  '/api/v1/avatar(.*)',
  '/api/v1/push(.*)',
  '/api/v1/tarot(.*)',
  '/api/v1/support(.*)',
  '/admin(.*)',
  '/api/admin(.*)',
]);

function redirectVercelHostToCanonical(req: NextRequest): NextResponse | null {
  const host = req.headers.get('host') ?? '';
  if (host.endsWith('.vercel.app') && process.env.VERCEL_ENV === 'production') {
    const url = new URL(req.url);
    url.host = 'estrevia.app';
    url.protocol = 'https:';
    return NextResponse.redirect(url, 301);
  }
  return null;
}

export default clerkMiddleware(async (auth, req) => {
  // 1) Canonical host redirect (cheapest, no auth/i18n needed).
  const hostRedirect = redirectVercelHostToCanonical(req);
  if (hostRedirect) return hostRedirect;

  // 2) Auth gate for protected routes (preserves existing behaviour).
  if (isProtectedRoute(req)) {
    const { userId } = await auth();
    if (!userId) {
      const { pathname } = req.nextUrl;
      if (pathname.startsWith('/api/')) {
        return NextResponse.json(
          { success: false, data: null, error: 'UNAUTHORIZED' },
          { status: 401 },
        );
      }
      const signInUrl = new URL('/sign-in', req.url);
      signInUrl.searchParams.set('redirect_url', req.url);
      return NextResponse.redirect(signInUrl);
    }
  }

  // 3) Run intl middleware on page routes — handles rewrite/redirect for /es.
  // For API routes we skip intl (no locale segment).
  if (req.nextUrl.pathname.startsWith('/api/')) return;
  return intlMiddleware(req);
});

export const config = {
  matcher: [
    // Page routes — let intl handle locale resolution.
    // Excludes _next, _vercel, public files, and API routes (those have their own auth-only matchers below).
    '/((?!_next|_vercel|api|.*\\..*).*)',
    // Auth-required API routes — preserved from previous middleware.
    '/admin/:path*',
    '/api/admin/:path*',
    '/charts/:path*',
    '/settings/:path*',
    '/api/v1/chart/save',
    '/api/v1/chart/list',
    '/api/v1/chart/:id',
    '/api/v1/stripe/:path*',
    '/api/v1/user/:path*',
    '/api/v1/synastry/:path*',
    '/api/v1/avatar/:path*',
    '/api/v1/push/:path*',
    '/api/v1/tarot/:path*',
    '/api/v1/support/:path*',
    '/api/v1/hours',
    '/api/v1/moon/calendar/:path*',
    '/api/cron/:path*',
  ],
};
```

- [ ] **Step 4: Run dev server + smoke test**

```bash
npm run dev
# In another terminal:
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' http://localhost:3000/
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' http://localhost:3000/es
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/chart
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/charts  # protected — should redirect to /sign-in
```

- [ ] **Step 5: Re-run E2E middleware tests against local**

```bash
E2E_TARGET=http://localhost:3000 npx playwright test tests/e2e/middleware.spec.ts
```
Expected: locale routing tests PASS; auth tests PASS; vercel-redirect test SKIPS (correct in local).

Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add src/middleware.ts tests/e2e/middleware.spec.ts
git commit -m "feat(middleware): compose Clerk + next-intl + vercel-host 301 redirect"
```

- [ ] **Step 7: Push branch + trigger preview deploy**

```bash
git push origin p0-seo-foundation
```
Vercel auto-creates a preview deploy. Note the preview URL.

- [ ] **Step 8: Validate vercel-redirect on preview**

`VERCEL_ENV` on a preview deploy is `preview`, so the redirect should NOT fire there (correct). Verify:
```bash
curl -sI <preview-url>/ | head -10
```
Expected: HTTP 200 (not 301). This proves the gate works.

- [ ] **Step 9: SendMessage to seo-verifier**

> "Middleware is on `p0-seo-foundation` preview at <url>. Please run §2.1 acceptance checks against this preview, then validate Clerk auth flows (sign-in, /admin, /api/v1/chart/save POST). Report back."

---

### Task 11: Update `src/shared/seo/metadata.ts` for locale-aware canonical/hreflang

**Owner:** `seo-eng`
**Branch:** `p0-seo-foundation`
**Depends on:** Task 7
**Files:**
- Modify: `src/shared/seo/metadata.ts`
- Modify: `src/shared/seo/__tests__/metadata.test.ts`
**Why:** Spec §2.2 #5. Each locale gets its own canonical; hreflang map points to the correct alternate URL (not both to the same URL).

- [ ] **Step 1: Extend the test file with new cases (red)**

Find the existing `metadata.test.ts`. Append:

```ts
import { createMetadata } from '../metadata';

describe('createMetadata locale-aware behaviour', () => {
  it('emits EN canonical at root for default locale', () => {
    const m = createMetadata({ title: 'Chart', description: 'd', path: '/chart', locale: 'en' });
    expect(m.alternates?.canonical).toBe('https://estrevia.app/chart');
    expect(m.alternates?.languages).toMatchObject({
      'en-US': 'https://estrevia.app/chart',
      'es': 'https://estrevia.app/es/chart',
      'x-default': 'https://estrevia.app/chart',
    });
  });

  it('emits ES canonical under /es for spanish locale', () => {
    const m = createMetadata({ title: 'Chart', description: 'd', path: '/chart', locale: 'es' });
    expect(m.alternates?.canonical).toBe('https://estrevia.app/es/chart');
    expect(m.alternates?.languages).toMatchObject({
      'en-US': 'https://estrevia.app/chart',
      'es': 'https://estrevia.app/es/chart',
      'x-default': 'https://estrevia.app/chart',
    });
  });

  it('does not double-prefix /es when path already starts with /es', () => {
    const m = createMetadata({ title: 'Chart', description: 'd', path: '/es/chart', locale: 'es' });
    expect(m.alternates?.canonical).toBe('https://estrevia.app/es/chart');
  });

  it('emits og:locale=es_ES and alternateLocale=en_US for spanish', () => {
    const m = createMetadata({ title: 't', description: 'd', path: '/chart', locale: 'es' });
    expect(m.openGraph?.locale).toBe('es_ES');
    expect(m.openGraph?.alternateLocale).toEqual(['en_US']);
  });
});
```

- [ ] **Step 2: Run tests (red)**

```bash
npx vitest run src/shared/seo/__tests__/metadata.test.ts
```
Expected: 4 new tests fail.

- [ ] **Step 3: Implement the changes in `metadata.ts`**

Replace the body of `createMetadata` (preserving signature):

```ts
function buildLocaleUrl(path: string, locale: 'en' | 'es'): string {
  const base = SITE_URL.replace(/\/$/, '');
  // Strip any incoming /es prefix to keep the contract idempotent.
  const cleanPath = path.replace(/^\/es(?=\/|$)/, '') || '/';
  const localePrefix = locale === 'es' ? '/es' : '';
  const normalized = cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`;
  // Preserve root '/' but strip trailing slash on other paths.
  if (normalized === '/') return localePrefix ? `${base}${localePrefix}/` : `${base}/`;
  return `${base}${localePrefix}${normalized}`.replace(/\/$/, '');
}

// Inside createMetadata, replace canonicalUrl computation:
const canonicalUrl = buildLocaleUrl(path, locale);
const enUrl = buildLocaleUrl(path, 'en');
const esUrl = buildLocaleUrl(path, 'es');

const hreflangLanguages: Record<string, string> = {
  'en-US': enUrl,
  'es': esUrl,
  'x-default': enUrl,
};

const ogLocale = locale === 'es' ? 'es_ES' : 'en_US';
const ogLocaleAlternate = locale === 'es' ? 'en_US' : 'es_ES';
```

The rest of the function (title, description, OG, twitter, robots) stays the same — `canonicalUrl` is already wired into them.

- [ ] **Step 4: Run tests (green)**

```bash
npx vitest run src/shared/seo/__tests__/metadata.test.ts
```
Expected: all green, including pre-existing tests.

- [ ] **Step 5: Commit**

```bash
git add src/shared/seo/metadata.ts src/shared/seo/__tests__/metadata.test.ts
git commit -m "feat(seo): locale-aware canonical + hreflang in createMetadata"
```

---

### Task 12: Update `src/app/sitemap.ts` for double-entry per locale

**Owner:** `seo-eng`
**Branch:** `p0-seo-foundation`
**Depends on:** Task 11
**Files:**
- Modify: `src/app/sitemap.ts`
**Why:** Spec §2.2 #6. Each canonical path now emits one URL entry per locale; total ≈ 442 entries.

- [ ] **Step 1: Refactor `hreflangAlternates` to take a locale-agnostic path**

Replace it with:
```ts
function urlsByLocale(canonicalPath: string): { en: string; es: string } {
  const en = `${SITE_URL}${canonicalPath}`;
  const es = `${SITE_URL}/es${canonicalPath}`;
  return { en, es };
}

function buildAlternates(canonicalPath: string): { languages: Record<string, string> } {
  const { en, es } = urlsByLocale(canonicalPath);
  return {
    languages: { 'en-US': en, 'es': es, 'x-default': en },
  };
}
```

- [ ] **Step 2: Refactor each section to emit two entries per path**

Replace the existing pattern. Example for static pages:
```ts
function emitLocalized(
  canonicalPath: string,
  partial: Omit<MetadataRoute.Sitemap[number], 'url' | 'alternates'>,
): MetadataRoute.Sitemap {
  const { en, es } = urlsByLocale(canonicalPath);
  return [
    { url: en, ...partial, alternates: buildAlternates(canonicalPath) },
    { url: es, ...partial, alternates: buildAlternates(canonicalPath) },
  ];
}

const staticPages: MetadataRoute.Sitemap = [
  ...emitLocalized('/',          { lastModified: now, changeFrequency: 'weekly',  priority: 1.0 }),
  ...emitLocalized('/why-sidereal', { lastModified: now, changeFrequency: 'monthly', priority: 0.9 }),
  ...emitLocalized('/pricing',   { lastModified: now, changeFrequency: 'monthly', priority: 0.7 }),
  ...emitLocalized('/privacy',   { lastModified: now, changeFrequency: 'yearly',  priority: 0.3 }),
  ...emitLocalized('/terms',     { lastModified: now, changeFrequency: 'yearly',  priority: 0.3 }),
];

// Apply the same emitLocalized() pattern to appPages, tarotPages, essayPages, signPages.
```

- [ ] **Step 3: Sanity-check entry count via local dev**

```bash
npm run build  # sitemap is generated at build time
# Or for dev preview:
npm run dev &
curl -s http://localhost:3000/sitemap.xml | grep -c '<loc>'
```
Expected: ≥ 442 (was 221).

- [ ] **Step 4: Add a small test to lock the count expectation**

Append to `src/shared/seo/__tests__/sitemap.test.ts` (create if missing):
```ts
import sitemap from '@/app/sitemap';

describe('sitemap', () => {
  it('emits one entry per locale for every canonical path', () => {
    const entries = sitemap();
    const en = entries.filter(e => !/\/es(\/|$)/.test(e.url));
    const es = entries.filter(e => /\/es(\/|$)/.test(e.url));
    expect(en.length).toBe(es.length);
    expect(en.length + es.length).toBe(entries.length);
  });

  it('every entry has hreflang alternates for both locales', () => {
    const entries = sitemap();
    for (const e of entries) {
      expect(e.alternates?.languages?.['en-US']).toBeTruthy();
      expect(e.alternates?.languages?.['es']).toBeTruthy();
      expect(e.alternates?.languages?.['x-default']).toBeTruthy();
    }
  });
});
```

```bash
npx vitest run src/shared/seo/__tests__/sitemap.test.ts
```
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/app/sitemap.ts src/shared/seo/__tests__/sitemap.test.ts
git commit -m "feat(sitemap): emit per-locale entries with hreflang alternates"
```

---

### Task 13: Audit + replace `next/link` with `@/i18n/navigation` Link

**Owner:** `seo-eng`
**Branch:** `p0-seo-foundation`
**Depends on:** Task 8
**Files:**
- Modify: every TSX/TS file that imports from `next/link`

**Why:** Spec §2.2 #10. Internal navigation must preserve locale on click (a /es/* user clicking a Link should land on /es/*, not /*).

- [ ] **Step 1: Inventory all next/link imports**

```bash
grep -rln "from 'next/link'\|from \"next/link\"" src/ \
  | grep -v node_modules \
  | sort > tmp/next-link-files.txt
wc -l tmp/next-link-files.txt
cat tmp/next-link-files.txt
```

- [ ] **Step 2: Decide what stays vs what migrates**

Routing-targeted Links (internal nav) → migrate.
External-only or programmatic-non-locale Links (rare) → stay, but tag with comment.

For each file in the inventory, replace:
```ts
import Link from 'next/link';
// or
import { Link } from 'next/link';
```
With:
```ts
import { Link } from '@/i18n/navigation';
```

Most calls don't need href changes — `Link` from next-intl/navigation accepts the same `href` prop and adds the `/es` prefix automatically when the user is in ES locale.

- [ ] **Step 3: Type-check + lint**

```bash
npm run typecheck
npm run lint
```
Fix any issues from prop-type differences (next-intl's `Link` accepts `href: string | { pathname: string }` — most call sites are fine).

- [ ] **Step 4: Smoke test in dev**

```bash
npm run dev
```
Open http://localhost:3000/es in a browser, click various nav items, confirm they stay on /es/*.

- [ ] **Step 5: Commit**

```bash
git add src/
git commit -m "refactor(nav): migrate next/link to locale-aware @/i18n/navigation Link"
```

---

### Task 14: Audit + add `locale` param to all `generateMetadata()` callers

**Owner:** `seo-eng`
**Branch:** `p0-seo-foundation`
**Depends on:** Task 11
**Files:**
- Modify: every `page.tsx` / `layout.tsx` calling `createMetadata`

**Why:** Spec §2.2 #9. Without the locale arg, the canonical/hreflang reverts to EN-default for every page.

- [ ] **Step 1: Inventory `createMetadata` callers**

```bash
grep -rln "createMetadata(" src/ | grep -v __tests__ | sort > tmp/metadata-callers.txt
cat tmp/metadata-callers.txt
```

- [ ] **Step 2: For each caller, add `locale` from `getLocale()`**

Pattern:
```ts
import { getLocale } from 'next-intl/server';
import { createMetadata } from '@/shared/seo';

export async function generateMetadata(/* existing args */): Promise<Metadata> {
  const locale = await getLocale();
  return createMetadata({
    /* existing options */
    locale: locale as 'en' | 'es',
  });
}
```

Apply to every file in the inventory. Keep existing options unchanged.

- [ ] **Step 3: Type-check**

```bash
npm run typecheck
```

- [ ] **Step 4: Smoke test view-source on /es path**

```bash
npm run dev &
curl -s http://localhost:3000/es/chart | grep -E 'rel="canonical"|alternate.*hreflang'
```
Expected: canonical points to /es/chart; hreflang map shows both locales.

- [ ] **Step 5: Commit**

```bash
git add src/
git commit -m "feat(seo): pass locale into every createMetadata() call"
```

---

### Task 15: Dedupe Organization JSON-LD on homepage

**Owner:** `seo-eng`
**Branch:** `p0-seo-foundation`
**Depends on:** Task 1 (need baseline confirmation of dup)
**Files:**
- Modify: `src/app/(marketing)/layout.tsx` OR `src/app/(marketing)/page.tsx` (whichever is duplicating)

**Why:** Spec §2.3 #12. Two `Organization` JSON-LD blocks confuse Google's entity model.

- [ ] **Step 1: Confirm dup location**

```bash
grep -rln "@type.*Organization" src/app/ | head
```
Identify the two emitters. If they're in `layout.tsx` and `page.tsx`, keep the one in layout (broader scope) and remove from page.

- [ ] **Step 2: Remove the duplicate**

Edit the appropriate file to delete the JSON-LD block. Verify the remaining one still includes site URL, logo, sameAs, etc.

- [ ] **Step 3: Smoke test**

```bash
npm run dev &
curl -s http://localhost:3000/ | grep -c '"@type":"Organization"'
```
Expected: 1.

- [ ] **Step 4: Commit**

```bash
git add src/app/
git commit -m "fix(seo): dedupe Organization JSON-LD on homepage"
```

---

### Task 16: Create `src/shared/lib/share.ts` UTM helper + tests

**Owner:** `seo-eng`
**Branch:** `p0-seo-foundation`
**Depends on:** Task 7
**Files:**
- Create: `src/shared/lib/share.ts`
- Create: `src/shared/lib/__tests__/share.test.ts`

**Why:** Spec §2.3 #13. Single source of truth for share-URL UTM tagging across all share buttons (used by Tasks 17, 26, optionally 31a-32b for in-content shares).

- [ ] **Step 1: Write failing test**

```ts
// src/shared/lib/__tests__/share.test.ts
import { describe, it, expect } from 'vitest';
import { buildShareUrl, type ShareChannel } from '../share';

describe('buildShareUrl', () => {
  it('appends utm_source per channel', () => {
    const url = buildShareUrl('https://estrevia.app/s/abc123', 'x');
    const u = new URL(url);
    expect(u.searchParams.get('utm_source')).toBe('share_x');
    expect(u.searchParams.get('utm_medium')).toBe('passport_share');
    expect(u.searchParams.get('utm_campaign')).toBe('cosmic_passport');
  });

  it('preserves existing query params', () => {
    const url = buildShareUrl('https://estrevia.app/s/abc?ref=xyz', 'telegram');
    const u = new URL(url);
    expect(u.searchParams.get('ref')).toBe('xyz');
    expect(u.searchParams.get('utm_source')).toBe('share_telegram');
  });

  it.each<ShareChannel>(['x', 'telegram', 'whatsapp', 'copy', 'native', 'stories'])(
    'maps %s to share_%s utm_source',
    (channel) => {
      const url = buildShareUrl('https://estrevia.app/s/x', channel);
      expect(new URL(url).searchParams.get('utm_source')).toBe(`share_${channel}`);
    }
  );
});
```

- [ ] **Step 2: Run (red)**

```bash
npx vitest run src/shared/lib/__tests__/share.test.ts
```
Expected: cannot find module — file doesn't exist yet.

- [ ] **Step 3: Implement**

```ts
// src/shared/lib/share.ts
export type ShareChannel = 'x' | 'telegram' | 'whatsapp' | 'copy' | 'native' | 'stories';

const UTM_MEDIUM = 'passport_share';
const UTM_CAMPAIGN = 'cosmic_passport';

export function buildShareUrl(targetUrl: string, channel: ShareChannel): string {
  const url = new URL(targetUrl);
  url.searchParams.set('utm_source', `share_${channel}`);
  url.searchParams.set('utm_medium', UTM_MEDIUM);
  url.searchParams.set('utm_campaign', UTM_CAMPAIGN);
  return url.toString();
}
```

- [ ] **Step 4: Run (green)**

```bash
npx vitest run src/shared/lib/__tests__/share.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/shared/lib/share.ts src/shared/lib/__tests__/share.test.ts
git commit -m "feat(share): add buildShareUrl UTM helper"
```

---

### Task 17: Apply UTM helper to all share-button components

**Owner:** `seo-eng`
**Branch:** `p0-seo-foundation`
**Depends on:** Task 16
**Files:**
- Modify: every share button component (discovered via grep)

**Why:** Spec §2.3 #13. Without this, the helper is dead code.

- [ ] **Step 1: Inventory share buttons**

```bash
grep -rln "navigator.share\|twitter.com/intent\|t.me/share\|wa.me\|telegram\|whatsapp" src/ | grep -v __tests__ | head
```
Identify the share button file(s). Likely under `src/app/s/[id]/` or `src/components/`.

- [ ] **Step 2: Replace each share URL construction with `buildShareUrl()`**

Pattern (example for X):
```ts
// Before:
const xIntent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(passportUrl)}`;

// After:
import { buildShareUrl } from '@/shared/lib/share';
const taggedUrl = buildShareUrl(passportUrl, 'x');
const xIntent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(taggedUrl)}`;
```

Apply consistently for telegram (`t.me/share/url?url=...`), whatsapp (`wa.me/?text=...`), copy-to-clipboard, native `navigator.share({ url })`, stories.

- [ ] **Step 3: Type-check + smoke test**

```bash
npm run typecheck
npm run dev
```
Open `http://localhost:3000/s/<some-id>`, click each share button, intercept the URL (via DevTools network or temporary console.log), confirm UTM params present.

- [ ] **Step 4: Commit**

```bash
git add src/
git commit -m "feat(share): tag all outbound passport share URLs with UTM"
```

---

### Task 18: Verify `/s/[id]` keeps `noIndex: true`

**Owner:** `seo-eng`
**Branch:** `p0-seo-foundation`
**Depends on:** Task 14 (after locale prop migration we want to confirm noIndex flag survived)
**Files:**
- Verify: `src/app/s/[id]/page.tsx`

**Why:** Spec §2.3 #14. Critical: opening /s/[id] to indexation would create thousands of thin/doorway pages.

- [ ] **Step 1: Read the file and confirm `createMetadata({ noIndex: true })` is in `generateMetadata`**

```bash
grep -A 5 'generateMetadata' src/app/s/\[id\]/page.tsx
```

- [ ] **Step 2: If missing, add it**

Otherwise no change.

- [ ] **Step 3: Smoke test**

```bash
npm run dev &
curl -s http://localhost:3000/s/<sample-id> | grep -E 'meta name="robots"|noindex'
```
Expected: `noindex, nofollow` present.

- [ ] **Step 4: Commit if changed; else TaskUpdate completed without commit**

---

### Task 19: Verify build passes on `p0-seo-foundation`

**Owner:** `seo-eng`
**Branch:** `p0-seo-foundation`
**Depends on:** Tasks 7-18
**Files:** none

- [ ] **Step 1: Run full type-check + lint + build**

```bash
npm run typecheck
npm run lint
npm run build
```
Expected: zero errors. Vercel preview deploy will run the same checks.

- [ ] **Step 2: Run vitest unit suite**

```bash
npm test
```
Expected: green.

- [ ] **Step 3: Push branch**

```bash
git push origin p0-seo-foundation
```

- [ ] **Step 4: Wait for Vercel preview deploy success**

```bash
vercel ls estrevia | head -3
```
Get the preview URL.

- [ ] **Step 5: SendMessage to seo-verifier with preview URL for re-verification**

> "p0-seo-foundation preview at <url>. Tasks 7–18 done. Please re-run §2.1 + §2.4 acceptance checks. Report any deltas vs baseline."

---

### Task 20: seo-verifier — re-verification on preview

**Owner:** `seo-verifier`
**Branch:** none (read-only checks against preview URL)
**Depends on:** Task 19
**Files:**
- Modify: `tmp/baselines/seo-baseline-2026-05-02.json` (append `-after` keys)

- [ ] **Step 1: Re-run all curl checks from Task 1 against preview URL (NOT prod)**

For each check, capture before/after. Pay attention:
- canonical now contains preview hostname (expected — preview deploys do leak canonical to vercel.app, this is OK because we don't index preview)
- /es/* paths exist and serve ES content
- sitemap entry count ≥ 442
- 301 from vercel.app → estrevia.app does NOT fire on preview (correct gate)
- E2E middleware tests pass against preview

- [ ] **Step 2: Run JSON-LD validator on preview pages**

`WebFetch` to Rich Results Test for `/`, `/chart`, `/es/chart`, `/essays/sun-in-aries`, `/es/essays/sun-in-aries`.

- [ ] **Step 3: Run Clerk auth smoke flows**

Sign in with a test account on preview, navigate `/charts`, `/admin` (if access granted), POST to `/api/v1/chart/save`. Verify all behave like before.

- [ ] **Step 4: Document deltas**

Append to baseline file with before/after pairs. Highlight any regressions.

- [ ] **Step 5: SendMessage verdict to seo-eng + lead**

> "p0-seo-foundation: [N] tests pass, [M] regress. Ready / not-ready for QA hand-off."

---

### Task 21: seo-eng addresses any regressions from Task 20

**Owner:** `seo-eng`
**Branch:** `p0-seo-foundation`
**Depends on:** Task 20

If verifier reports regressions, seo-eng patches them iteratively. If none, mark completed.

- [ ] **Step 1: Read verifier report**
- [ ] **Step 2: For each regression, write a fix + test, push, re-loop with verifier**
- [ ] **Step 3: When verifier signals all-green, TaskUpdate completed**

---

### Task 22: Frontend — fix mobile horizontal overflow (320–414px)

**Owner:** `fe-eng`
**Branch:** `main`
**Depends on:** Task 2
**Files:**
- Modify: header navigation component, share-bar in `/s/[id]`, responsive pill components in chart/header
- Create: `tests/e2e/responsive.spec.ts`

**Why:** Spec §3.1. Half the share-loop fails because the share-bar overflows.

- [ ] **Step 1: Read fe-verifier baseline**

```
TaskGet(taskId="2") → metadata.summary
```
Open `tmp/baselines/fe-screenshots-pre/` — review which viewports/pages overflow.

- [ ] **Step 2: Write failing E2E**

```ts
// tests/e2e/responsive.spec.ts
import { test, expect } from '@playwright/test';

const VIEWPORTS = [320, 360, 375, 390, 414, 768];
const PAGES = ['/', '/chart', '/why-sidereal', '/hours'];

for (const w of VIEWPORTS) {
  for (const p of PAGES) {
    test(`no horizontal overflow at ${w}px on ${p}`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width: w, height: 800 } });
      const page = await ctx.newPage();
      await page.goto(`http://localhost:3000${p}`);
      const overflow = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        viewport: window.innerWidth,
      }));
      expect(overflow.scroll).toBe(overflow.viewport);
      await ctx.close();
    });
  }
}
```

```bash
npm run dev &
npx playwright test tests/e2e/responsive.spec.ts
```
Expected: many fail.

- [ ] **Step 3: Fix overflow culprits**

Common fixes (apply where baseline points):
- Header nav (`src/app/(app)/DesktopNav.tsx`, `MobileNav.tsx`) — `flex-wrap` or hamburger for narrow widths.
- Share-bar in `src/app/s/[id]/page.tsx` — `grid grid-cols-3 sm:flex sm:gap-2 gap-2`.
- City autocomplete input — wrap parent flex with `min-w-0`, set input `w-full`.
- Header pills — `truncate` + `min-w-0`.

Iterate per viewport until tests pass.

- [ ] **Step 4: Re-run**

```bash
npx playwright test tests/e2e/responsive.spec.ts
```
All green.

- [ ] **Step 5: Commit**

```bash
git add src/ tests/e2e/responsive.spec.ts
git commit -m "fix(responsive): eliminate horizontal overflow at 320-768px"
```

---

### Task 23: Frontend — dedupe H1 on `/hours` (and verify `/tree-of-life`)

**Owner:** `fe-eng`
**Branch:** `main`
**Depends on:** Task 2
**Files:**
- Modify: `src/app/(app)/hours/page.tsx`
- Possibly modify: `src/app/(app)/tree-of-life/page.tsx`
- Modify: `tests/e2e/responsive.spec.ts` (extend)

**Why:** Spec §3.2. Two `<h1>` in DOM confuses search engines about the page topic.

- [ ] **Step 1: Append failing test**

```ts
// add to tests/e2e/responsive.spec.ts
test('exactly one H1 on /hours at every viewport', async ({ browser }) => {
  for (const w of [320, 768, 1280]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 800 } });
    const page = await ctx.newPage();
    await page.goto('http://localhost:3000/hours');
    const count = await page.locator('h1').count();
    expect(count, `viewport ${w}`).toBe(1);
    await ctx.close();
  }
});

test('exactly one H1 on /tree-of-life at every viewport', async ({ browser }) => {
  for (const w of [320, 768, 1280]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 800 } });
    const page = await ctx.newPage();
    await page.goto('http://localhost:3000/tree-of-life');
    const count = await page.locator('h1').count();
    expect(count, `viewport ${w}`).toBe(1);
    await ctx.close();
  }
});
```

```bash
npx playwright test tests/e2e/responsive.spec.ts -g "exactly one H1"
```
Expected: fail on /hours (and /tree-of-life if dup confirmed).

- [ ] **Step 2: Refactor `/hours/page.tsx` to a single adaptive layout**

Identify the two H1 blocks (likely a mobile-only and desktop-only branch). Consolidate into one component using Tailwind responsive utilities (text-2xl md:text-4xl, etc.). Remove the unused branch entirely.

- [ ] **Step 3: Same for `/tree-of-life` if dup confirmed by verifier**

- [ ] **Step 4: Re-run**

```bash
npx playwright test tests/e2e/responsive.spec.ts -g "exactly one H1"
```
Green.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/hours/ src/app/\(app\)/tree-of-life/ tests/e2e/responsive.spec.ts
git commit -m "fix(seo): dedupe H1 in DOM on /hours and /tree-of-life"
```

---

### Task 24: Frontend — chart state persistence in URL params

**Owner:** `fe-eng`
**Branch:** `main`
**Depends on:** Task 2
**Files:**
- Modify: `src/app/(app)/chart/page.tsx` (and any client component handling form state)
- Create: `tests/e2e/chart-state.spec.ts`

**Why:** Spec §3.3. Reload of `/chart` returns user to empty form, breaking the share-loop.

- [ ] **Step 1: Write failing E2E**

```ts
// tests/e2e/chart-state.spec.ts
import { test, expect } from '@playwright/test';

test('chart result survives reload', async ({ page }) => {
  await page.goto('http://localhost:3000/chart');
  // Selectors to be confirmed against actual form. Adjust as needed.
  await page.fill('input[name="birthDate"]', '1990-04-15');
  await page.fill('input[name="birthTime"]', '14:30');
  await page.fill('input[placeholder*="city"]', 'London');
  // Pick first autocomplete suggestion
  await page.locator('[data-testid="city-suggestion"]').first().click();
  await page.click('button[type="submit"]');
  await expect(page.locator('[data-testid="natal-chart-result"]')).toBeVisible();
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('[data-testid="natal-chart-result"]')).toBeVisible();
  // Form is in "edit" or hidden state, not blank-ready-to-fill
  await expect(page.locator('button:has-text("Edit")')).toBeVisible();
});
```

```bash
npm run dev &
npx playwright test tests/e2e/chart-state.spec.ts
```
Expected: fail (currently reload blanks form).

- [ ] **Step 2: Implement state-in-URL pattern**

In the chart client component:
- After successful calculation, push `router.replace('?' + params.toString())` with `bd`, `bt`, `lat`, `lon`, `place`, `tz`.
- On mount, read `useSearchParams()`. If all required keys present, skip form, run `calculate()` with those values.
- Provide an "Edit" button that clears params and re-shows the form.

```ts
import { useSearchParams, useRouter } from 'next/navigation';

const params = useSearchParams();
const router = useRouter();

useEffect(() => {
  const bd = params.get('bd');
  const bt = params.get('bt');
  const lat = params.get('lat');
  const lon = params.get('lon');
  if (bd && lat && lon) {
    calculate({
      birthDate: bd,
      birthTime: bt ?? undefined,
      lat: +lat,
      lon: +lon,
      place: params.get('place') ?? '',
      tz: params.get('tz') ?? 'UTC',
    });
  }
}, [params]);

// After successful calc:
const sp = new URLSearchParams({ bd, bt: bt ?? '', lat: String(lat), lon: String(lon), place, tz });
router.replace(`?${sp.toString()}`);
```

- [ ] **Step 3: Verify analytics filter does NOT capture URL params**

```bash
grep -rn "captureProperties\|posthog.capture" src/shared/lib/posthog* src/lib/posthog* 2>/dev/null | head
```
Confirm birthDate/lat/lon are NOT sent in any event. If they are, redact at the capture layer.

- [ ] **Step 4: Re-run E2E**

```bash
npx playwright test tests/e2e/chart-state.spec.ts
```
Green.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/chart/ tests/e2e/chart-state.spec.ts
git commit -m "feat(chart): persist state in URL query params; survives reload"
```

---

### Task 25: Frontend — verify SSR on `/s/[id]`

**Owner:** `fe-eng`
**Branch:** `main`
**Depends on:** Task 2
**Files:** verify `src/app/s/[id]/page.tsx`; modify only if SSR is broken.

**Why:** Spec §3.4. Twitter/Telegram crawlers don't run JS — content must be in initial HTML.

- [ ] **Step 1: Read fe-verifier's findings (Task 2 step 4)**

If view-source already shows canonical, og:*, h1 in initial HTML — no change needed; mark task completed with note.

- [ ] **Step 2: If broken, identify the data fetch**

The page is likely already a Server Component. Check whether any critical content is gated behind a Client Component awaiting data after hydration. Move that fetch up to the server component.

- [ ] **Step 3: Smoke test**

```bash
curl -s http://localhost:3000/s/<sample-id> | grep -E 'rel="canonical"|property="og:|<h1' | head -10
```
All present.

- [ ] **Step 4: Commit (if changed)**

---

### Task 26: UI — Redesign OG image (1200×630)

**Owner:** `ui-eng`
**Branch:** `main`
**Depends on:** Task 3
**Files:**
- Modify: OG endpoint route file (path confirmed in Task 3)

**Why:** Spec §4.1. Currently the OG image has empty quarters and a too-small rarity badge — kills CTR on share previews.

- [ ] **Step 1: Read ui-verifier baseline (Task 3)**

Confirm endpoint path. Open existing OG route to understand current Satori JSX.

- [ ] **Step 2: Plan visual layout per spec §4.1**

Hero band top 40% (display name / "Cosmic Blueprint"), centre 40% (3 sign glyphs + names, planetary colors), rarity stamp top-right (rotated 8°, hatched, large), bottom 20% (element + ruling planet + ornament + brand bottom-centre). Starfield background.

- [ ] **Step 3: Implement**

Rewrite the JSX returned to `new ImageResponse(...)`. Use Satori-supported CSS (flex, abs positioning, transform: rotate). Load fonts via `fetch()` from `public/fonts/` if not already.

(Code length is ~150-200 lines of JSX — implement with care, test by visiting the URL with sample IDs.)

- [ ] **Step 4: Local visual review**

```bash
npm run dev &
# Open in a browser tab:
http://localhost:3000/api/og/passport/<sample-id>
```
Iterate on dimensions, font sizes, color, stamp angle, brand size until visually correct.

- [ ] **Step 5: Add a snapshot test for dimensions + non-empty buffer**

```ts
// tests/e2e/og-image.spec.ts
import { test, expect } from '@playwright/test';
test('OG image renders 1200x630 PNG with content', async ({ request }) => {
  const r = await request.get('http://localhost:3000/api/og/passport/<sample-id>');
  expect(r.status()).toBe(200);
  expect(r.headers()['content-type']).toMatch(/image\/(png|jpeg)/);
  const buf = await r.body();
  expect(buf.length).toBeGreaterThan(20_000); // sanity: real images are >>20KB
});
```

- [ ] **Step 6: Commit**

```bash
git add src/app/api/og/ tests/e2e/og-image.spec.ts
git commit -m "feat(og): redesign passport OG image — full canvas, rarity hero, brand"
```

---

### Task 27: UI — Stories OG variant (1080×1920)

**Owner:** `ui-eng`
**Branch:** `main`
**Depends on:** Task 26
**Files:**
- Modify: same OG route, add a `?format=stories` query param branch (or new sibling route)

**Why:** Spec §4.1. Vertical share + PNG download for Instagram Stories.

- [ ] **Step 1: Add the variant**

In the OG route handler, branch on a `format` query param: `format=stories` → return 1080×1920 vertical layout (same content, repositioned).

- [ ] **Step 2: Visual iterate** (see Task 26 step 4)

- [ ] **Step 3: Commit**

```bash
git add src/app/api/og/
git commit -m "feat(og): add 1080x1920 stories variant"
```

---

### Task 28: UI — Visual unification of share-section on `/s/[id]`

**Owner:** `ui-eng`
**Branch:** `main`
**Depends on:** Task 3
**Files:**
- Modify: `src/app/s/[id]/page.tsx` and child components

**Why:** Spec §4.2. The card and golden CTA currently read as two objects; they should read as one.

- [ ] **Step 1: Wrap card + CTA in single section with shared box-shadow glow**
- [ ] **Step 2: Reduce gap between card and CTA from ~32px to ~12px**
- [ ] **Step 3: Match border-radius continuity**
- [ ] **Step 4: Up-size the rarity badge by +2 sizes**

- [ ] **Step 5: Visual review at desktop and mobile (use responsive screenshots from Task 22)**

- [ ] **Step 6: Commit**

```bash
git add src/app/s/
git commit -m "feat(share-ui): unify Cosmic Passport card and Share CTA visually"
```

---

### Task 29: UI — Subdue Aspects/Houses checkboxes on /chart wheel

**Owner:** `ui-eng`
**Branch:** `main`
**Depends on:** none
**Files:**
- Modify: chart wheel component(s)

**Why:** Spec §4.3.

- [ ] **Step 1: Find the checkbox component**
- [ ] **Step 2: Reduce unchecked-state opacity / color saturation**
- [ ] **Step 3: Keep checked-state golden for clear toggle feedback**
- [ ] **Step 4: Commit**

---

### Task 30: UI — Add share copy variants to messages

**Owner:** `ui-eng`
**Branch:** `main`
**Depends on:** none
**Files:**
- Modify: `messages/en.json`, `messages/es.json`

**Why:** Spec §4.4.

- [ ] **Step 1: Add new keys per spec §4.4 table**

```json
"share": {
  "passport": {
    "copy": {
      "x": "Apparently I'm a 1-in-{rarity} cosmic blueprint 👀 {url}",
      "telegram": "Just calculated my sidereal cosmic passport — Sun in {sun}, Moon in {moon}, Rising in {rising}. {url}",
      "whatsapp": "Look what I got 👇 {url}",
      "stories_caption": "Cosmic blueprint unlocked 🌌",
      "native_share": "{name}'s Cosmic Passport — {url}"
    }
  }
}
```

```json
// messages/es.json — neutro LATAM, tú form, sign names untranslated, planet names translated
"share": {
  "passport": {
    "copy": {
      "x": "Resulta que soy un blueprint cósmico de 1 entre {rarity} 👀 {url}",
      "telegram": "Acabo de calcular mi pasaporte cósmico sideral — Sol en {sun}, Luna en {moon}, Ascendente en {rising}. {url}",
      "whatsapp": "Mira lo que me salió 👇 {url}",
      "stories_caption": "Blueprint cósmico desbloqueado 🌌",
      "native_share": "Pasaporte Cósmico de {name} — {url}"
    }
  }
}
```

- [ ] **Step 2: Wire the copy into the share buttons (consume in `/s/[id]/page.tsx`)**

- [ ] **Step 3: Commit**

```bash
git add messages/ src/app/s/
git commit -m "feat(share): per-channel copy variants EN+ES (LATAM neutral)"
```

---

### Task 31a: Content — `/hours` educational expansion (EN + ES)

**Owner:** `content-a`
**Branch:** `main`
**Depends on:** Task 16 (UTM helper, in case content embeds share CTA)
**Files:**
- Modify: `src/app/(app)/hours/page.tsx` (append educational section below widget)
- Modify: `messages/en.json`, `messages/es.json` (educational copy keys)
- Possibly modify: `src/shared/seo/json-ld.ts` (add `faqSchema()` if missing)

**Why:** Spec §5.2 `/hours` template.

- [ ] **Step 1: Add `educational.hours.*` keys to messages**

Per spec §5.2 structure: `whatAreThey`, `howToUse`, `dayVsHourRuler`, `whyMattersInSidereal`, `faq` (5 entries). Each section's text in EN and ES (LATAM neutral, `tú` form). Total ≥600 words per locale below the widget.

EN sample structure:
```json
"educational": {
  "hours": {
    "whatAreThey": {
      "heading": "What are planetary hours?",
      "body": "[120-150 words]"
    },
    "howToUse": { "heading": "...", "body": "..." },
    "dayVsHourRuler": { "heading": "...", "body": "..." },
    "whyMattersInSidereal": { "heading": "...", "body": "..." },
    "faq": [
      { "q": "...", "a": "..." }
    ]
  }
}
```

- [ ] **Step 2: Confirm/add `faqSchema()` in `src/shared/seo/json-ld.ts`**

Per CLAUDE.md SEO rules, json-ld helpers live in `src/shared/seo/json-ld.ts`. If `faqSchema` is missing:
```ts
import type { WithContext, FAQPage, Question, Answer } from 'schema-dts';

export function faqSchema(items: Array<{ question: string; answer: string }>): WithContext<FAQPage> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map<Question>(item => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      } satisfies Answer,
    })),
  };
}
```

- [ ] **Step 3: Render the section in the page**

Append after the widget. JSON-LD goes via React 19 native script-children pattern (Next.js 16 App Router supports this; no `dangerouslySetInnerHTML` needed):
```tsx
import { useTranslations } from 'next-intl';
import { faqSchema } from '@/shared/seo/json-ld';

export default function HoursPage() {
  const t = useTranslations('educational.hours');
  const faqs = t.raw('faq') as Array<{ q: string; a: string }>;
  const ld = faqSchema(faqs.map(f => ({ question: f.q, answer: f.a })));
  return (
    <>
      {/* existing widget */}
      <section className="prose prose-invert mx-auto max-w-3xl mt-12">
        <h2>{t('whatAreThey.heading')}</h2>
        <p>{t('whatAreThey.body')}</p>
        <h2>{t('howToUse.heading')}</h2>
        <p>{t('howToUse.body')}</p>
        <h2>{t('dayVsHourRuler.heading')}</h2>
        <p>{t('dayVsHourRuler.body')}</p>
        <h2>{t('whyMattersInSidereal.heading')}</h2>
        <p>{t('whyMattersInSidereal.body')}</p>
        <h2>FAQ</h2>
        <dl>
          {faqs.map((f, i) => (
            <div key={i}>
              <dt><strong>{f.q}</strong></dt>
              <dd>{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>
      <script type="application/ld+json">{JSON.stringify(ld)}</script>
    </>
  );
}
```

- [ ] **Step 4: Verify word count**

```bash
node -e "const m = require('./messages/en.json'); const e = m.educational.hours; const text = JSON.stringify(e); console.log(text.split(/\s+/).length);"
```
Expected: ≥600.

Repeat for ES.

- [ ] **Step 5: Smoke test**

```bash
npm run dev &
curl -s http://localhost:3000/hours | grep -c '<h2'   # at least 4
curl -s http://localhost:3000/hours | grep -c 'application/ld+json' # at least 1
curl -s http://localhost:3000/es/hours | grep -c '<h2'  # at least 4
```

- [ ] **Step 6: Commit**

```bash
git add src/app/\(app\)/hours/ messages/ src/shared/seo/json-ld.ts
git commit -m "content(hours): add educational sections + FAQ schema (EN+ES)"
```

---

### Task 31b: Content — `/moon` educational expansion (EN + ES)

**Owner:** `content-a`
**Branch:** `main`
**Depends on:** Task 31a (so message-key conventions are stable)
**Files:**
- Modify: `src/app/(app)/moon/page.tsx`, `messages/en.json`, `messages/es.json`

Mirror Task 31a structure with `/moon` content per spec §5.2 (8 phases, lunar magic, sidereal vs tropical, calculation note, 5 FAQ).

- [ ] Steps 1-5 same shape as Task 31a, applied to /moon.
- [ ] Commit:
```bash
git commit -m "content(moon): add educational sections + FAQ schema (EN+ES)"
```

---

### Task 32a: Content — `/synastry` educational expansion (EN + ES)

**Owner:** `content-b`
**Branch:** `main`
**Depends on:** Task 31a (message-key convention)
**Files:**
- Modify: `src/app/(app)/synastry/page.tsx`, `messages/en.json`, `messages/es.json`

Per spec §5.2 (what is synastry, key aspects, score interpretation, sidereal vs tropical synastry, 5 FAQ).

- [ ] Steps mirror 31a/31b.
- [ ] Commit:
```bash
git commit -m "content(synastry): add educational sections + FAQ schema (EN+ES)"
```

---

### Task 32b: Content — `/tree-of-life` educational expansion (EN + ES)

**Owner:** `content-b`
**Branch:** `main`
**Depends on:** Task 31a (convention)
**Files:**
- Modify: `src/app/(app)/tree-of-life/page.tsx`, `messages/en.json`, `messages/es.json`

Per spec §5.2 (10 sefirot, 22 paths, how to read diagram, tree and tarot, 5 FAQ).

- [ ] Steps mirror 31a/31b.
- [ ] Commit:
```bash
git commit -m "content(tree-of-life): add educational sections + FAQ schema (EN+ES)"
```

---

### Task 33: Content — mutual review

**Owner:** `content-a` reviews `content-b`'s commits; `content-b` reviews `content-a`'s
**Branch:** `main`
**Depends on:** Tasks 31a, 31b, 32a, 32b

**Why:** Spec §5.4. Anti-AI-slop checklist applied cross-pair.

- [ ] **Step 1: Each reviewer reads other's commits**

```bash
git log --author="<other agent identity>" --oneline -20
git diff <range>
```

- [ ] **Step 2: Apply 12-point AI-slop checklist (spec §5.4)**

Specifically:
- No "In conclusion / important to note / let's explore" boilerplate
- No GPT hedging
- Active voice
- Sentence length variety
- ES uses LATAM neutral + `tú`
- Sign names not translated, planet names translated
- FAQ answers direct (first sentence answers)

- [ ] **Step 3: Post review verdict via SendMessage to other agent + lead**

If issues found, original author commits fixes; reviewer re-checks. Loop until both approve.

- [ ] **Step 4: TaskUpdate completed when both approve**

---

## Phase 2 — QA (after all implementer tasks completed)

### Task 34: qa-tech — Lighthouse run on all P0 pages

**Owner:** `qa-tech`
**Branch:** none (read-only against `p0-seo-foundation` preview AND `main` if separate preview exists)
**Depends on:** Tasks 7-33

- [ ] **Step 1: Wait for SendMessage from lead — "all implementer tasks complete"**
- [ ] **Step 2: Run Lighthouse mobile + desktop on each page** (commands in Task 4)
- [ ] **Step 3: Compare against baseline (Task 4 outputs)**
- [ ] **Step 4: Record table of pass/fail per metric per page**
- [ ] **Step 5: Output to `tmp/qa-reports/lighthouse-post.json`**

---

### Task 35: qa-tech — JSON-LD validation across all P0 pages

**Owner:** `qa-tech`
**Branch:** none
**Depends on:** Tasks 7-33

- [ ] **Step 1: For each P0 page, fetch HTML and extract JSON-LD blocks**
- [ ] **Step 2: Validate each via Rich Results Test (WebFetch)**
- [ ] **Step 3: Append to `tmp/qa-reports/jsonld-post.md`**

---

### Task 36: qa-tech — canonical/sitemap/robots/redirect re-curl

**Owner:** `qa-tech`
**Branch:** none
**Depends on:** Tasks 7-33

- [ ] **Step 1: Re-run Task 1's commands against `p0-seo-foundation` preview**
- [ ] **Step 2: For each, diff against baseline; record pass/fail**
- [ ] **Step 3: Specifically verify acceptance §2.4 from spec:**
  - canonical on `/chart` is `https://estrevia.app/chart` (or preview equivalent — note caveat)
  - canonical on `/es/chart` is `https://estrevia.app/es/chart`
  - sitemap entry count ≥ 442
  - sitemap has no `estrevia-` (vercel) refs (or if preview, expect preview hostname; flag for prod-only assertion)
  - vercel.app → estrevia.app 301 will fire only on production after final merge
- [ ] **Step 4: Output to `tmp/qa-reports/seo-post.md`**

---

### Task 37: qa-tech — DOM h1 count assertion

**Owner:** `qa-tech`
**Branch:** none
**Depends on:** Tasks 23

- [ ] **Step 1: Playwright assertion `querySelectorAll('h1').length === 1` on /hours and /tree-of-life at 320, 768, 1280px**
- [ ] **Step 2: Append result to qa-reports**

---

### Task 38: qa-ux — Share-flow E2E per channel

**Owner:** `qa-ux`
**Branch:** none
**Depends on:** Tasks 17, 26, 27, 28, 30

- [ ] **Step 1: Playwright walks through /chart → /s/[id] → click each share button**
- [ ] **Step 2: For each, verify outbound URL contains correct UTM params per spec §4.4 / §2.3**
- [ ] **Step 3: Output to `tmp/qa-reports/share-flow-post.md`**

---

### Task 39: qa-ux — Preview validators

**Owner:** `qa-ux`
**Branch:** none
**Depends on:** Tasks 26, 27

- [ ] **Step 1: WebFetch Twitter Card Validator with current preview /s/[id]**
- [ ] **Step 2: WebFetch LinkedIn Post Inspector**
- [ ] **Step 3: Document Telegram instant view manual procedure for founder**
- [ ] **Step 4: Output to `tmp/qa-reports/og-validators-post.md`**

---

### Task 40: qa-ux — Mobile responsive screenshots + chart-state reload + OG visual regression

**Owner:** `qa-ux`
**Branch:** none
**Depends on:** Tasks 22, 23, 24, 26

- [ ] **Step 1: Re-run the Task 2 baseline screenshot script against preview**
- [ ] **Step 2: Visual diff key pages — flag any unintended visual regressions**
- [ ] **Step 3: Chart state reload test (Task 24 covers; re-confirm against preview)**
- [ ] **Step 4: Fetch 5 sample OG URLs and confirm new design renders**
- [ ] **Step 5: Output to `tmp/qa-reports/ux-post.md`**

---

## Phase 3 — Lead consolidation + merge gate

### Task 41: Lead consolidates QA report

**Owner:** `lead` (the orchestrating Claude main thread)
**Branch:** none
**Depends on:** Tasks 34-40

- [ ] **Step 1: Read all `tmp/qa-reports/*-post.md` files**
- [ ] **Step 2: Synthesize a single `tmp/qa-reports/p0-overhaul-2026-05-02.md`** with sections per spec §6.3:
  - Baseline vs current (per check)
  - Pass/fail summary table
  - Open issues with severity + suggested owner
  - Lighthouse table
  - Screenshots index (links to tmp/baselines/*-post/)
  - Recommendation: ready-for-merge OR needs-fixes (with explicit blockers)
- [ ] **Step 3: SendMessage to founder via the user-facing turn — present the report**

---

### Task 42: Founder merge gate

**Owner:** founder (gate via lead)
**Depends on:** Task 41

- [ ] **Step 1: Founder reads `tmp/qa-reports/p0-overhaul-2026-05-02.md`**
- [ ] **Step 2: Founder approves OR requests fixes**
- [ ] **If fixes:** lead routes back to relevant pair via SendMessage, re-loops Tasks 34-41
- [ ] **If approved:** lead proceeds to Task 43

---

### Task 43: Merge feature branch + post-deploy verification

**Owner:** `lead`
**Branch:** merges `p0-seo-foundation` → `main`
**Depends on:** Task 42 approval

- [ ] **Step 1: Confirm founder explicit approval message captured in TaskList**
- [ ] **Step 2: Merge**

```bash
git checkout main
git pull origin main
git merge --no-ff p0-seo-foundation -m "Merge p0-seo-foundation: SEO + UX + Content P0 overhaul"
git push origin main
```

- [ ] **Step 3: Wait for Vercel prod deploy success**

```bash
vercel ls estrevia | head -3
```

- [ ] **Step 4: Run §2.4 acceptance against PROD (estrevia.app)**

Re-run Task 1's curl commands. All should pass against the canonical hostname now.

- [ ] **Step 5: Re-fetch sample OG image and confirm new design live on prod**
- [ ] **Step 6: Verify `vercel.app/<old-hash>` 301-redirects to `estrevia.app`**
- [ ] **Step 7: Update memory files** per spec §13:
  - Edit `~/.claude/projects/-Users-kirillkovalenko-Documents-Projects-Estrevia/memory/feedback_mvp_priorities.md` to remove "EN only" claim
  - Add new memory `feedback_brief_vs_code_priority.md` per spec §13
- [ ] **Step 8: Shutdown teammates via SendMessage `{type:"shutdown_request"}`**
- [ ] **Step 9: TaskUpdate completed; clean up TaskList**

---

## Self-review (run by lead before dispatch)

After writing this plan, lead must verify:

1. **Spec coverage:** Every spec section §1–§9 has a corresponding task. §10–§11 are P1/P2 and intentionally not in this plan. §12 risks are reflected in test coverage and gating.
2. **Placeholder scan:** No "TBD", no "implement later", no "similar to Task N" without repeating code.
3. **Type consistency:** `buildShareUrl(targetUrl, channel)` signature in Task 16 matches usage in Task 17 and downstream. `routing.locales`, `Locale` type, `createMetadata({ locale })` all consistent.
4. **Owner assigned per task:** every task has Owner field; matches §8 of spec.
5. **Branch field per task:** every code-changing task says `main` or `p0-seo-foundation`.
6. **Acceptance check or test per task:** every implementer task has either a test (TDD) or an explicit smoke check command.

---

## Execution mode

This plan is NOT executed via the standard `subagent-driven-development` or `executing-plans` skill. It is dispatched to a 10-teammate Agent Team `estrevia-p0-overhaul` per spec §8. After saving + reviewing this plan, lead runs:

1. `TeamCreate({team_name: 'estrevia-p0-overhaul', description: '...'})`.
2. `TaskCreate(...)` × ~43 to populate the TaskList with all tasks above (subject + description referencing this plan), set `addBlockedBy` per the dependency graph.
3. Set `owner` on each task per the Owner column.
4. Spawn 10 teammates in a single parallel `Agent` call, each named per §8.
5. Each teammate's prompt: read this plan, claim your owned unblocked tasks in ID order, follow steps, mark completed via TaskUpdate, SendMessage when done.
6. Lead monitors, intervenes on escalations, runs Tasks 41/43.
