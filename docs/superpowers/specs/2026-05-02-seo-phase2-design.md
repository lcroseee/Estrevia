# SEO Phase 2 — Design Spec

| Field | Value |
| --- | --- |
| Date | 2026-05-02 |
| Status | Draft → pending founder review |
| Authors | Lead (Claude Opus 4.7) + brainstorming with founder |
| Predecessor | `2026-05-02-seo-ux-content-overhaul-design.md` (P0 — shipped) |
| Scope tier | ROLE 1 (GSC + sitemap optimization) + ROLE 2 (Page Speed) + ROLE 3 (24 `/sidereal-{sign}-dates` pages) |
| Deferred to next session | ROLE 4 (`/why-sidereal` AEO rebuild) + ROLE 5 (hub-and-spoke linking) |
| Branch model | Single feature branch `seo-phase2` with founder merge gate (overrides default direct-to-main per high-blast-radius SEO work) |
| Agent topology | Single Agent Team `estrevia-seo-phase2`, 8 named teammates, hybrid pair pattern III |
| Production verification | Mandatory baseline snapshots via `vercel env`, `curl`, Lighthouse, bundle analyzer for every verifier |

## Decisions log (from brainstorming Q1–Q4)

| Q | Decision | Reasoning |
| --- | --- | --- |
| Q1 — session scope | **D** — ROLE 1 + ROLE 2 + ROLE 3 (defer ROLE 4 + 5) | Realistic in ~3.5–4.5h with 8 parallel agents. ROLE 4 (`/why-sidereal` rebuild) deserves focused session — best-on-site page restructure has high editorial stakes. ROLE 5 mechanically depends on ROLE 4 outputs. |
| Q2 — GSC ownership | **B** — DNS TXT record (Domain property) | Domain property unlocks per-country traffic data critical for `/es/` ROI measurement (US vs MX vs ES). Founder DNS step async, code-side ROLE 1 work runs in parallel. |
| Q3 — Page Speed methodology | **C** — Hybrid grouped (3-4 commits) + measure-first | "Measure first" addresses P0 lesson `feedback_brief_vs_code_priority`: brief assumptions ≠ verified bottlenecks. Bundle analyzer + Lighthouse baseline drives Group A/B/C content, not founder intuition. |
| Q4 — `/sidereal-{sign}-dates` composition | **C** — Live SSR dates + lightweight sun-sign tool + year-table accordion | Sweet spot: precision via Swiss Ephemeris (factual accuracy), lightweight footprint compatible with ROLE 2 perf sprint, year-table = AI citation bait for ChatGPT/Perplexity. |

---

## §0. Context: state at session start (verified 2026-05-02)

P0 SEO/UX/Content overhaul shipped this morning (commit `a405e40` merge + post-merge fixes `9cf77cd`, `1231ae8`, `749c0f0`, `2a60fdb`). Phase 2 builds on this foundation.

**Verified ground truth (no brief contradictions this session):**

| # | Claim | Verification | Action |
| --- | --- | --- | --- |
| 1 | P0 shipped: `/es/` URL prefix, canonical estrevia.app, 442 sitemap entries | `git log --oneline -15` shows merge + cleanup commits; QA report §2 confirms 9/9 acceptance pass | Builds on this. |
| 2 | `[locale]` directory structure exists | `ls src/app/[locale]/` shows `(app)/`, `(marketing)/`, `checkout/`, `sign-in/`, `sign-up/`, `layout.tsx` | New `/sidereal-[sign]-dates` route goes under `[locale]/(app)/`. |
| 3 | `/sidereal-*-dates` routes do NOT exist | `find src/app -name "page.tsx" -path "*sidereal*"` returns empty | Greenfield for ROLE 3; no legacy conflicts. |
| 4 | `/why-sidereal` lives at `[locale]/(marketing)/why-sidereal/page.tsx`, 433 lines JSX | `wc -l` confirms | ROLE 4 deferred — page deserves focused session, not part of this batch. |
| 5 | astro-engine module at `src/modules/astro-engine/`, kebab-case naming, has `chart.ts`/`sidereal.ts`/`signs.ts`/`ephemeris.ts` | `ls -la` confirms structure | New `sun-in-sign-range.ts` fits existing pattern. |
| 6 | PostHog already lazy-loaded via `await import('posthog-js')` | `src/shared/components/PostHogProvider.tsx:69` + `src/shared/lib/analytics.ts:4` confirm | **ROLE 2 Group B "PostHog tuning" likely null work.** Baseline phase confirms; if true, Group B narrows to Sentry + other bundle wins. |
| 7 | Zero `<img>` tags in TSX files | `find src -name "*.tsx" -exec grep -l "<img "` returns empty | **ROLE 2 Group A "image migration" likely null work.** Baseline phase confirms; if true, Group A narrows to font preload + display:swap. |
| 8 | Untracked files: PNG icons + advertising probe scripts | `git status --short` shows `?? estrevia-icon-*.{jpg,png}`, `?? scripts/advertising/probe-*.ts` | Pre-existing, not blocking, out of scope. |

**Key insight from §0:** P0 lesson — assumptions in brief got falsified at baseline. Same pattern applies here: **assume nothing about Page Speed bottlenecks until bundle analyzer runs.** Spec describes methodology, not pre-determined fixes.

---

## §1. Three-tier scope (recap + Phase 2 placement)

### Done (P0, shipped):
i18n migration to `/es/` URL prefix, canonical+hreflang correctness, vercel.app→estrevia.app 301, dedupe Organization JSON-LD, UTM on share links, mobile responsive fixes, chart state persistence, OG image redesign, share copy variants per channel, /hours/moon/synastry/tree-of-life educational expansion (≥600 words EN+ES + FAQ JSON-LD).

### This session (Phase 2 — ROLE 1 + 2 + 3):
- **ROLE 1 — GSC + sitemap optimization**: Domain property setup via DNS TXT, image sitemap entries, robots.txt audit, /es/* crawl verification.
- **ROLE 2 — Page Speed sprint**: measure-first hybrid grouped commits (baseline → Group A low-risk wins → Group B JS bundle → optional Group C critical CSS). Target Lighthouse Performance ≥85 on 8 baseline pages mobile + desktop.
- **ROLE 3 — `/sidereal-{sign}-dates` × 12 × EN+ES**: 24 new pages with live SSR dates + lightweight sun-sign tool + year-table accordion. New `getSunInSignRange()` helper + `/api/sidereal/sun-sign` endpoint.

### Deferred to next session (Phase 3):
- **ROLE 4 — `/why-sidereal` AEO rebuild**: comparison table for 12 signs, SVG precession diagram, NASA + IAU + Wikipedia citation footer, 3 case-study examples (public birth dates only). Best-on-site page restructure deserves focused session.
- **ROLE 5 — Hub-and-spoke internal linking**: bottom "See also" sections on essays linking to /why-sidereal + sign pages + glossary. Mechanically depends on ROLE 3 + ROLE 4 outputs (must exist to link to).

---

## §2. ROLE 1 — GSC + sitemap optimization

**Pair:** `seo-eng` (subagent_type: `seo-growth`) + `seo-verifier` (subagent_type: `devops`).

**Risk profile:** medium. Sitemap changes affect Google crawl behavior; image sitemap entries add (don't replace) data. Founder DNS step is the only high-trust action and is async-gated.

### §2.1 Pre-flight verification (BEFORE any code change)

`seo-verifier` runs first and posts findings to TaskList:

1. `vercel env ls --environment=production` → confirm `NEXT_PUBLIC_SITE_URL=https://estrevia.app` still set (should be from P0; ensure no regression).
2. `curl -s https://estrevia.app/sitemap.xml | grep -c '<loc>'` → confirm = 442 (P0 baseline).
3. `curl -s https://estrevia.app/sitemap.xml | grep -c "image:image"` → expected 0 (no image sitemap entries yet).
4. `curl -s https://estrevia.app/robots.txt` → confirm Sitemap URL = estrevia.app/sitemap.xml, `Disallow: /s/` preserved.
5. `curl -sI https://estrevia.app/es/` and `curl -sI https://estrevia.app/es/why-sidereal` and `curl -sI https://estrevia.app/es/essays/sun-in-aries` → all return 200, no redirect loops.
6. `curl -s https://estrevia.app/es/why-sidereal | grep -E 'canonical|html lang'` → confirm canonical = `https://estrevia.app/es/why-sidereal`, `<html lang="es">`.

**Output:** `tmp/baselines/seo-phase2-baseline-2026-05-02.json` with all observations. Diff target for post-implementation verification.

### §2.2 GSC Domain property setup (founder gate)

`seo-eng` does:
1. **Generate Google Search Console verification TXT record string** — describes exact format founder will paste:
   - Record type: `TXT`
   - Host: `@` (apex) or `estrevia.app` depending on DNS provider
   - Value: `google-site-verification=<token>` (token comes from GSC UI when founder claims domain)
   - TTL: default (300s typical)
2. **Document founder workflow** in TaskList for the GSC step:
   - (a) Open https://search.google.com/search-console → "Add property" → Domain → enter `estrevia.app`
   - (b) GSC presents TXT record → founder copies value
   - (c) Founder pastes into DNS provider (Vercel-managed: Vercel dashboard → Domains → estrevia.app → DNS Records; external: respective provider UI)
   - (d) Founder waits for DNS propagation (typically 5-30 min for major providers; can verify with `dig TXT estrevia.app +short` in shell), clicks "Verify" in GSC
   - (e) Founder confirms verification success in TaskList comment
3. **Post-verification (founder)**: in GSC UI, manually:
   - International targeting → leave default "let Google decide" for /es/ subset (no country-specific override needed for neutral LATAM Spanish targeting per memory)
   - Submit sitemap → `https://estrevia.app/sitemap.xml`
   - Email notifications → enable for index coverage issues

**No automation here** — GSC UI doesn't have stable public API for ownership claim. Founder runs the UI flow once.

### §2.3 Image sitemap entries

Extend `src/app/sitemap.ts` to emit `<image:image>` entries for indexable images. Goal: capture Google Image Search traffic for branded queries ("estrevia cosmic passport", "sidereal aries chart").

**Per Google sitemap-image protocol:**
- Sitemap XML root must declare `xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"`.
- Each `<url>` entry can include up to 1000 `<image:image>` children with `<image:loc>` (required) and optionally `<image:title>` / `<image:caption>`.

**Scope (initial — minimum coherent set):**
1. **Marketing pages** (homepage `/`, `/why-sidereal`, `/pricing` if exists): hero/social-share images served from `/public/`. seo-verifier audits `public/` directory for `.png|.jpg|.svg` candidates that are publicly served (not internal/admin assets).
2. **Sign glyph SVGs** (12 zodiac signs from `/public/zodiac/` or wherever they live — verifier discovers actual path).
3. **Each `/sidereal-{sign}-dates` page** (added after ROLE 3 lands): one `<image:image>` per page pointing to per-sign hero or zodiac glyph.

**NOT in scope (excluded):**
- `/api/og/passport/[id]` — dynamically generated per-user, no canonical URL list to enumerate. OG meta tags handle social previews; image sitemap is for Google Image Search index.
- `/s/[id]` — already noindex; would conflict to add to image sitemap.
- Essay headers — only if statically referenced from MDX (verifier audits whether such assets exist).

**Output:** sitemap.xml `<loc>` count stays at 442 from this change alone (image entries are children of existing `<url>` blocks, NOT separate URL entries). What grows is `<image:image>` element count (≥12 minimum). Total `<loc>` count after Phase 2 = 442 + 24 (ROLE 3 pages) = **466**.

### §2.4 robots.txt + /es/* crawl verification

`seo-verifier`:
1. Confirm `src/app/robots.ts` still emits `Disallow: /s/`.
2. Confirm no accidental `Disallow: /es/` or `Disallow: /sidereal-` (would block ROLE 3 pages).
3. Run curl matrix on /es/ paths: `/es/`, `/es/chart`, `/es/why-sidereal`, `/es/essays/sun-in-aries`, `/es/hours`, `/es/moon`, `/es/synastry`, `/es/tree-of-life`. All return 200, all have correct canonical (with `/es/` prefix), all `<html lang="es">`.
4. Run hreflang audit: each /es/ page links back to its EN counterpart, each EN page links to /es/, x-default = EN.

### §2.5 Acceptance criteria for ROLE 1

**Pre-merge (gated on code, must be done before founder merge gate):**
- ✅ Image sitemap entries added; `curl -s <preview-url>/sitemap.xml | grep -c "image:image"` ≥ 12 (at minimum 12 sign glyphs).
- ✅ `xmlns:image` declared in sitemap root.
- ✅ robots.txt unchanged for `/s/` block, no new accidental blocks.
- ✅ /es/* curl matrix all 200 + correct canonical + correct lang.
- ✅ GSC verification TXT record string + founder workflow document committed.

**Post-merge (async, founder-driven, may happen during or after session):**
- ✅ Founder pastes TXT record into DNS provider, GSC verifies Domain property successful.
- ✅ Founder submits sitemap in GSC UI; email alerts enabled.
- (These are not gates on the code merge — code can ship safely without GSC verified yet. Founder completes whenever convenient.)

---

## §3. ROLE 2 — Page Speed sprint (measure-first)

**Pair:** `perf-eng` (subagent_type: `frontend`) + `perf-verifier` (subagent_type: `qa`).

**Risk profile:** medium-high. Optimizations can introduce visual regressions (Critical CSS), break analytics (PostHog/Sentry), or change runtime behavior (code-splitting). Per-group Lighthouse + visual diff catches most issues.

### §3.1 Methodology — measure-first

**Principle from §0 ground truth:** brief assumptions about bottlenecks (PostHog session-replay, image migration) likely don't match reality. Bundle analyzer + Lighthouse baseline drive Group A/B/C content. **Don't write code based on assumed bottlenecks.**

**Targets (unchanged from brief):**
- Lighthouse Performance ≥ 85 mobile + desktop on all 8 baseline pages.
- Accessibility ≥ 95 (already met on most; `/moon` = 87 follow-up from P0 picked up here).
- SEO = 100 (already 100/100 per P0; preserve).
- Best Practices ≥ 90 (already met on most; preserve).

**8 baseline pages:** `/`, `/chart`, `/essays/sun-in-aries`, `/hours`, `/moon`, `/synastry`, `/tree-of-life`, `/why-sidereal`. Same set as P0 QA report §6 for direct comparability.

### §3.2 Baseline commit (perf-verifier owns)

**No code changes.** Pure measurement artifacts.

1. `pnpm exec next build --analyze` (or equivalent — verifier confirms project's bundle visualizer config; if missing, install `@next/bundle-analyzer` as dev dep). Save HTML output to `tmp/baselines/bundle-2026-05-02/`.
2. Lighthouse mobile + desktop × 8 pages = 16 reports. Save JSONs to `tmp/baselines/perf-2026-05-02/`.
3. Identify ACTUAL bottlenecks:
   - Top-N bundle contributors (which packages dominate first-load JS?)
   - Biggest LCP delay sources per page (TTFB? FCP→LCP gap? specific element?)
   - CLS sources if any
   - Render-blocking resources
4. Output: `tmp/baselines/perf-baseline-report-2026-05-02.md` summarizing findings + **recommended Group A/B/C content**. perf-eng reads this BEFORE writing optimization code.

### §3.3 Group A — low-risk wins (perf-eng commit)

**Initial scope (subject to baseline findings):**
- Font preload: add `<link rel="preload" as="font" type="font/woff2" crossOrigin="" href=...>` for Geist Sans + Crimson Pro in `[locale]/layout.tsx`.
- `font-display: swap` — verify next/font config has this; add if missing. (next/font typically defaults to swap, so likely already correct.)
- `next/image` audit: per §0 #7, no `<img>` in TSX. Verifier confirms via thorough grep including MDX content (`content/essays/`). If found, migrate.
- `<img>` in MDX: if any, configure MDX components to render `<Image>` instead.
- Static asset cache headers: confirm `next.config.ts` doesn't override defaults (`/_next/static` should have `immutable, max-age=31536000`).

**Method:** each change is its own logical commit within Group A or one squashed Group A commit. perf-verifier re-runs Lighthouse after Group A, appends delta to `tmp/baselines/perf-baseline-report-2026-05-02.md`.

### §3.4 Group B — JS bundle (perf-eng commit)

**Subject to baseline findings:**
- **PostHog**: per §0 #6, already lazy-loaded. If baseline confirms (no posthog-js in main bundle), Group B does not touch PostHog. If baseline shows otherwise (regression after P0?), fix.
- **Sentry**: tree-shake unused integrations. Audit `sentry.client.config.ts` (or wherever Sentry init lives) for `BrowserTracing`, `Replay`, `Feedback`, etc. Remove integrations not in use. Reduces ~30-100KB client bundle typical.
- **Heavy chart components**: chart wheel SVG is likely below-the-fold on `/chart` (first interaction is form submission). Migrate to dynamic import:
  ```tsx
  const ChartWheel = dynamic(() => import('./ChartWheel'), { ssr: false, loading: () => <Skeleton /> });
  ```
- **Other findings**: bundle analyzer may surface unexpected contributors (Drizzle ORM accidentally bundled client-side, large icon libraries, polyfills). Address top-N.

**Method:** per-change commits if 3+ distinct optimizations; otherwise squashed Group B commit. Re-run Lighthouse, measure delta.

### §3.5 Group C — critical CSS (stretch, conditional)

**Trigger:** any of the 8 baseline pages still <85 Performance after Group A + Group B.

**Implementation options:**
- (a) `critters` (Vercel-recommended) — Next.js plugin that extracts above-the-fold CSS at build time and inlines it.
- (b) `beasties` (Critters fork, more actively maintained).
- (c) Manual extraction — only if a/b don't fit Tailwind 4 + Next 16 setup.

**High visual-regression risk** — perf-verifier runs Playwright visual diff at all viewports (320, 375, 414, 768, 1280, 1920) on all 8 pages before signaling ready-for-merge.

### §3.6 `/moon` Accessibility=87 follow-up (P0 leftover)

P0 QA report §7 #1 logged this. Likely cause: unlabelled interactive element added in T15 educational expansion. Fix candidates:
- Missing `aria-label` on button/icon
- Missing `<label>` association on form input
- Insufficient color contrast on educational content
- Missing alt text on image (if any)

`perf-eng` runs axe-core audit on `/moon`, identifies specific violations, fixes. Target: Accessibility ≥ 95.

### §3.7 Acceptance criteria for ROLE 2

- ✅ Lighthouse Performance ≥ 85 mobile + desktop on all 8 baseline pages.
- ✅ Accessibility ≥ 95 on all 8 (including `/moon`).
- ✅ SEO = 100 preserved.
- ✅ Best Practices ≥ 90 preserved.
- ✅ No visual regression on any page at any viewport (Playwright visual diff).
- ✅ Bundle analyzer post-state shows reduction in main bundle size vs baseline (concrete number reported).
- ✅ All E2E tests still pass (no regression in chart calculation, share flow, auth, etc.).

---

## §4. ROLE 3 — `/sidereal-{sign}-dates` × 12 × 2 langs

**Pair:** `astro-eng` (subagent_type: `astro-engine`) for infra, then `content-prog-a` + `content-prog-b` (both subagent_type: `content`) for page content with mutual review.

**Risk profile:** low-medium. New routes, no conflicts with existing pages. Main risk: factual accuracy of sidereal dates (Swiss Ephemeris must be authoritative).

### §4.1 Phase 1 — Infrastructure (astro-eng)

**File 1: `src/modules/astro-engine/sun-in-sign-range.ts`** (new)

```ts
import type { SiderealSign } from './signs';

export type Ayanamsa = 'lahiri'; // MVP only per CLAUDE.md

export interface SunInSignRange {
  sign: SiderealSign;
  start: Date; // UTC datetime when Sun enters sign
  end: Date;   // UTC datetime when Sun leaves sign (= next sign's start)
  year: number;
  ayanamsa: Ayanamsa;
}

/**
 * Returns the UTC datetime range when the Sun is in the given sidereal sign
 * during the given year. Uses Swiss Ephemeris (Moshier built-in).
 *
 * Algorithm:
 *   1. Compute sidereal sun longitude for Jan 1 of year.
 *   2. Identify which sign Sun is in.
 *   3. Walk forward in ~1-day steps, checking sign boundary crossings.
 *   4. Binary-search to within 1-minute precision when boundary crossed.
 *   5. Return the boundary closest to start of `sign` window for `year`.
 *
 * Note: a sidereal sign window can span Dec→Jan (e.g., Capricorn typically
 * Jan 14 → Feb 13). Function returns the window whose start falls in `year`.
 */
export function getSunInSignRange(
  sign: SiderealSign,
  year: number,
  ayanamsa: Ayanamsa = 'lahiri',
): SunInSignRange;

/**
 * Returns the sidereal sign the Sun was in on the given UTC date.
 * Used by sun-sign mini-widget on /sidereal-{sign}-dates pages.
 */
export function getSunSignForDate(
  date: Date,
  ayanamsa: Ayanamsa = 'lahiri',
): { sign: SiderealSign; range: SunInSignRange };
```

**Unit tests** in same module: validate against known Astro.com Lahiri dates for 2024-2026, all 12 signs, ±30 minutes tolerance.

**File 2: `src/app/api/sidereal/sun-sign/route.ts`** (new)

```
GET /api/sidereal/sun-sign?date=YYYY-MM-DD&ayanamsa=lahiri
→ 200 { sign: 'aries', startDate: '2026-04-14T08:42:00Z', endDate: '2026-05-14T11:18:00Z', ayanamsa: 'lahiri', year: 2026 }
→ 400 { error: 'invalid_date' } | { error: 'invalid_ayanamsa' }
→ 429 (rate limited) — uses existing Upstash rate-limit pattern (≥10 req/min/IP)
```

No auth required (public endpoint). PII consideration: birth date in URL is borderline — but a single date alone (without name/location/time) is not personally identifying and is the entire input domain users will explore. PostHog filtering already strips bd/lat/lon/place/tz per P0 (verifier confirms `date` param is NOT logged in event payloads).

### §4.2 Phase 2 — Page template (used by both content agents)

**Route:** `src/app/[locale]/(app)/sidereal-[sign]-dates/page.tsx`

**Per-page sections (~400 words total in `<main>`):**

1. **Direct date answer** (first paragraph, ~50 words):
   > "Sun is in sidereal **{Sign}** from **{startDate}** to **{endDate}** in {currentYear} (Lahiri ayanamsa)."
   - SSR-computed via `getSunInSignRange(sign, currentYear)` at request time.
   - currentYear = `new Date().getUTCFullYear()`.
   - Date format: localized via `Intl.DateTimeFormat` (EN: "April 14, 2026"; ES: "14 de abril de 2026").

2. **Why these dates differ from tropical** (~100 words):
   - Brief precession explanation (Earth's axial wobble, ~50 arcsec/year).
   - Tropical zodiac fixed to vernal equinox; sidereal fixed to actual constellations.
   - Internal link to `/why-sidereal`.

3. **Annual variation** (~80 words):
   - Dates shift ~50 arcseconds/year due to Lahiri ayanamsa adjustment.
   - Practical impact: ~20 minutes per decade (negligible for everyday use).
   - Link to year-table accordion below.

4. **Year-table accordion** (collapsed by default):
   - Table with 7 rows: previous 3 years + current + next 3 years (e.g., 2023-2029 if current is 2026).
   - Columns: Year | Sun enters | Sun exits.
   - All values SSR-computed via `getSunInSignRange(sign, year)` at request time.
   - **AI citation bait**: structured data, specific dates per year that ChatGPT/Perplexity can quote.

5. **Sun-sign mini-widget** (~30 words intro + interactive form):
   - Heading: "What's your sidereal sun sign?" (EN) / "¿Cuál es tu signo solar sideral?" (ES)
   - Single input: date picker (HTML5 `<input type="date">`).
   - Submit button → calls `/api/sidereal/sun-sign?date=...`.
   - Result: "Your sidereal sun sign is **{Sign}** ({startDate} – {endDate})."
   - If result sign ≠ current page's sign: link "Read about Sun in sidereal {result.sign}" → `/sidereal-{result.sign}-dates`.

6. **Internal links** (~60 words):
   - "Read more about your Sun sign personality" → `/essays/sun-in-{sign}`
   - "Why sidereal differs from tropical" → `/why-sidereal`
   - "Calculate your full birth chart" → `/chart`

**JSON-LD on page:**
- Article (headline, description, datePublished, author = Estrevia).
- BreadcrumbList (Home > Sidereal Dates > {Sign}).
- (Optionally) FAQPage if 3+ FAQ entries surface naturally from content writing.

**Metadata** (`createMetadata`):
- Title: "Sidereal {Sign} Dates {Year}: When Sun is in {Sign} (Lahiri)" / ES equivalent.
- Description: ≤155 chars summarizing date range + ayanamsa.
- Canonical: `https://estrevia.app/sidereal-{sign}-dates` (EN) / `https://estrevia.app/es/sidereal-{sign}-dates` (ES).
- hreflang: EN ↔ ES pair + x-default = EN.

### §4.3 Phase 3 — Content split

| Agent | Signs owned | EN+ES files | Total pages |
| --- | --- | --- | --- |
| `content-prog-a` | aries, taurus, gemini, cancer, leo, virgo | 12 (6 signs × 2 langs) | 12 |
| `content-prog-b` | libra, scorpio, sagittarius, capricorn, aquarius, pisces | 12 (6 signs × 2 langs) | 12 |

**Workflow per agent:**
1. Read existing `/essays/sun-in-{sign}` for context (does NOT duplicate that essay's content; complements it).
2. Draft EN content following the §4.2 template.
3. Draft ES translation following memory `feedback_spanish_style`: español neutro LATAM, `tú` form, sign names untranslated (Aries/Tauro/Géminis/Cáncer/Leo/Virgo/Libra/Escorpio/Sagitario/Capricornio/Acuario/Piscis), planet names translated (Sol/Luna/Mercurio).
4. Push commits per sign (12 commits ideally) or grouped (3 batches of 2 signs × 2 langs).
5. **Mutual review**: after own 12 pages done, review the OTHER agent's 12 pages using anti-AI-slop checklist (memory `feedback_anti_ai_slop`, 12 points).
6. Post review verdict via SendMessage + TaskList comment.

**Sitemap update:** sitemap.ts adds `/sidereal-{sign}-dates` × 12 × 2 locales = 24 entries. New total: 442 + 24 = 466 entries.

### §4.4 Anti-AI-slop checklist (mutual review)

Per memory, applied by each reviewer to the other's content:
1. No "In conclusion / it is important to note / let's explore" boilerplate.
2. No empty parallel structures.
3. Specific dates/numbers/names where possible.
4. No GPT-style hedging.
5. Active voice.
6. Sentence length variety.
7. No transitional throat-clearing.
8. No restating the question in the answer.
9. Real domain knowledge (Lahiri ayanamsa specifics, not generic astrology).
10. ES translation uses LATAM neutral + `tú`.
11. Internal links serve readers (not stuffed for SEO).
12. Date answers direct (first sentence answers; rest expands).

### §4.5 Acceptance criteria for ROLE 3

- ✅ `getSunInSignRange()` unit tests pass for all 12 signs × 3 sample years against Astro.com reference data, ±30 minutes tolerance.
- ✅ `/api/sidereal/sun-sign` returns valid response for sample dates; rate limit kicks in at 10 req/min/IP.
- ✅ All 24 routes return 200 with correct canonical + hreflang + lang attribute.
- ✅ Each page's `<main>` content ≥ 400 words (EN and ES separately).
- ✅ JSON-LD validates Rich Results Test (Article + BreadcrumbList minimum).
- ✅ Sun-sign widget E2E (qa-final): submit birthday → see correct sign + dates.
- ✅ Sitemap entry count = 466.
- ✅ Mutual review verdicts posted, anti-slop pass for all 24 pages.
- ✅ ES sign names preserved (Aries, Tauro, etc.); planet names translated (Sol/Luna).

---

## §5. Production verification protocol

**Mandatory for every verifier in every pair.** Same lesson from P0: skipping baseline = operating on faith in brief = wasted work.

### §5.1 Baseline phase (kickoff, before any code change)

Each verifier captures:
- `seo-verifier`: §2.1 checks above.
- `perf-verifier`: §3.2 bundle analyzer + Lighthouse 16 reports + summary report.
- `astro-eng`: existing astro-engine code review to identify reusable functions; reference Astro.com sample dates for unit test fixtures.

All baselines saved to `tmp/baselines/` (gitignored).

### §5.2 Per-group post-state phase

After each commit/group:
- ROLE 1: re-run §2.1 curl checks + sitemap entry count diff.
- ROLE 2: re-run Lighthouse 16 reports, append to `perf-baseline-report-2026-05-02.md` with delta column.
- ROLE 3: per-page acceptance check (curl 200, content word count, JSON-LD validation).

### §5.3 Final phase

Before founder merge gate, `qa-final` runs:
- Cross-pair E2E: navigate to `/sidereal-aries-dates`, click sun-sign widget, submit a date, verify result appears with correct sign + link.
- Mobile responsive screenshots on 3 sample sidereal-dates pages (different signs).
- Validate JSON-LD on 3 sample pages via Rich Results Test.
- Full Lighthouse on 3 new pages + 8 baseline pages (all 11) → confirm no regression.
- Consolidated QA report at `tmp/qa-reports/seo-phase2-2026-05-02.md`.

---

## §6. Agent team topology + dispatch

### §6.1 Team and members

`TeamCreate({ team_name: 'estrevia-seo-phase2', description: 'SEO Phase 2: GSC + Page Speed + 24 sidereal-dates pages session 2026-05-02' })`.

8 teammates spawned in a single multi-Agent message:

| Name | subagent_type | Role |
| --- | --- | --- |
| `seo-eng` | `seo-growth` | ROLE 1 implementer (image sitemap, robots, GSC TXT prep) |
| `seo-verifier` | `devops` | ROLE 1 verifier (env, sitemap, robots, /es/* curl matrix) |
| `perf-eng` | `frontend` | ROLE 2 implementer (Group A + B + optional C) |
| `perf-verifier` | `qa` | ROLE 2 verifier (baseline + per-group Lighthouse, bundle analyzer) |
| `astro-eng` | `astro-engine` | ROLE 3 infra (`getSunInSignRange()` helper + `/api/sidereal/sun-sign` endpoint) |
| `content-prog-a` | `content` | ROLE 3 first half (aries..virgo, EN+ES, 12 pages) |
| `content-prog-b` | `content` | ROLE 3 second half (libra..pisces, EN+ES, 12 pages) |
| `qa-final` | `qa` | Cross-pair E2E + consolidated final report |

### §6.2 TaskList structure

Lead creates the full task graph upfront. Tasks have:
- `subject`: short imperative title.
- `description`: full spec link + acceptance criteria.
- `owner`: pre-assigned per agent name above.
- `addBlockedBy`: dependency edges.

### §6.3 Dependency graph

```
Pre-flight phase (parallel, ~15-20 min):
  T1: seo-verifier baseline (GSC pre-check, sitemap, robots, /es/* curl, env)
  T2: perf-verifier baseline (Lighthouse 8 pages × 2, bundle analyzer, summary report)
  T3: astro-eng review existing astro-engine module (no code change yet; gathers Swiss Ephemeris call patterns + writes test fixtures from Astro.com)

Implementation phase (parallel after pre-flight unblocks):
  T4: seo-eng — image sitemap entries (blocked by T1)
  T5: seo-eng — robots audit + /es/* fix if any (blocked by T1)
  T6: seo-eng — GSC TXT record + founder workflow doc (blocked by T1)
  T7: perf-eng — Group A (font preload + display:swap + img audit) (blocked by T2)
  T8: astro-eng — `getSunInSignRange()` + unit tests (blocked by T3)
  T9: astro-eng — `/api/sidereal/sun-sign` endpoint + rate limit (blocked by T8)
  T10: content-prog-a — 12 pages (aries..virgo) (blocked by T9)
  T11: content-prog-b — 12 pages (libra..pisces) (blocked by T9)

Group A complete:
  T12: perf-verifier — Lighthouse re-measure + delta append (blocked by T7)

After T12:
  T13: perf-eng — Group B (Sentry tree-shake + chart dynamic import + bundle wins from baseline) (blocked by T12)

Group B complete:
  T14: perf-verifier — Lighthouse re-measure + delta append (blocked by T13)

Optional Group C (conditional, if any page <85 after Group B):
  T15: perf-eng — Critical CSS via critters/beasties (blocked by T14, gated on founder if visual risk surfaces)
  T16: perf-verifier — Lighthouse + visual diff + final perf report (blocked by T15 or T14 if T15 skipped)

Content phase complete:
  T17: content-prog-a — mutual review of T11 output (blocked by T11)
  T18: content-prog-b — mutual review of T10 output (blocked by T10)
  T19: seo-eng — sitemap update for 24 new entries (blocked by T10 + T11)

Final phase:
  T20: qa-final — cross-pair E2E + consolidated report (blocked by T16 + T17 + T18 + T19 + T4 + T5 + T6)
  T21: founder merge gate (blocked by T20)
  T22: lead — merge `seo-phase2` → `main`, push, Vercel auto-deploys, post-deploy curl verification (blocked by T21)
  T23: lead — memory updates (blocked by T22)
  T24: lead — team shutdown (blocked by T23)
```

### §6.4 Communication protocol

- **Within pair:** SendMessage for "ready for review" / "approved" / "issue found, see comment in task #N".
- **Cross-pair:** SendMessage when a dependency unblocks (e.g., astro-eng → content-prog-a/b: "API endpoint live at /api/sidereal/sun-sign, you can now call from page components").
- **To lead:** SendMessage on blocker, confusion, or completion of all owned tasks.
- **No raw status JSON** — plain text only; use TaskUpdate for state transitions.

### §6.5 Lead (Claude main thread) responsibilities

1. Create team.
2. Create all tasks T1-T24 with deps.
3. Spawn 8 teammates in one parallel message.
4. Monitor via TaskList. Respond to escalations.
5. When all implementer tasks completed → unblock qa-final.
6. When QA report posted → consolidate, present to founder.
7. On founder approval → merge feature branch → main → trigger Vercel prod deploy.
8. Post-deploy: re-run verification on prod, update memory, shutdown team.

---

## §7. Branch & merge strategy

| Branch | Owners | Rationale |
| --- | --- | --- |
| `seo-phase2` | All 8 teammates | Single feature branch (overrides default direct-to-main per memory `feedback_main_branch_workflow` because of high-blast-radius SEO + Page Speed + 24 new routes; merge gate by founder per consolidated QA) |

**Workflow:**
1. Lead creates `seo-phase2` from `main` after T1-T3 baseline tasks complete.
2. All teammates commit to `seo-phase2`.
3. qa-final runs final checks against `seo-phase2` head.
4. Founder reviews consolidated QA report, approves merge.
5. Lead merges `seo-phase2` → `main` via `git merge --no-ff` (preserves branch context in history) or fast-forward if no `main` divergence.
6. Lead pushes `main` → Vercel auto-deploys to production.
7. Post-deploy: lead runs §2.1 curl checks against estrevia.app to confirm prod state matches feature-branch state.

**Rollback plan:** `git revert` on the merge commit + `vercel rollback` to prior deployment if regression caught within minutes. For deeper regressions (e.g., wrong canonical leaking to Google for >1h), prefer forward-fix.

---

## §8. Risks & mitigations

| Risk | Severity | Mitigation |
| --- | --- | --- |
| `getSunInSignRange()` returns wrong dates due to Swiss Ephemeris API misuse | High | Unit tests against Astro.com reference data ±30 min for all 12 signs × 3 years (2024-2026) before content-prog agents start using it |
| 24 new pages fail Rich Results Test → wasted SEO work | Medium | qa-final validates JSON-LD on 3 sample pages before final approval; content-prog agents include validation step in their workflow |
| Group C critical CSS introduces visual regression on production | High | Visual diff via Playwright on all 8 pages × 6 viewports BEFORE merge; founder reviews 3 sample side-by-side screenshots in QA report |
| GSC verification TXT record propagates slowly → founder waits hours | Low | Document expected wait (10-30 min typical); founder can check propagation via `dig TXT estrevia.app +short` in shell |
| Image sitemap entries point to non-existent images → Google logs as soft 404 | Medium | seo-verifier audits each entry's image URL with HEAD request returning 200 before merge |
| Sun-sign API endpoint hit by bots → unreasonable load on Swiss Ephemeris | Low | Upstash rate limit per existing pattern (10 req/min/IP); cache responses for popular dates (current/recent years) at edge |
| /sidereal-{sign}-dates content is generic / Wikipedia-quality | Medium | Mutual review with anti-AI-slop checklist; founder spot-checks 2-3 random pages before merge |
| Bundle analyzer reveals unexpected heavy dependency that's hard to remove | Medium | Group B can be partial — fix top wins, defer hard-to-remove items to follow-up; baseline measurement quantifies what's left |
| Two content-prog agents conflict on same file (e.g., shared template change) | Low | Page template lives in single file owned by astro-eng (T8); content agents edit only their own page.tsx files. No file overlap. |
| Founder under-reviews QA report → broken canonical/perf regression ships | High | QA report formatted as concrete pass/fail table per acceptance criteria; merge command from founder is explicit |
| Memory/CLAUDE.md updates not made after merge → stale context for next session | Medium | Lead's final task (T23) explicitly: update memory + add ROLE 4/5 deferred note |
| Vercel preview SSO blocks public validators on `seo-phase2` branch | Low | Pre-merge testing via curl on preview hash URL (works behind SSO via Vercel's bypass token); public validators (Twitter Card, etc.) re-run post-merge against estrevia.app |

---

## §9. Memory and CLAUDE.md updates after merge

- **Update memory `feedback_brief_vs_code_priority`**: add observation that "verified §0 ground truth caught 2 null-work assumptions (PostHog already lazy, no `<img>` in TSX) before Page Speed sprint started — saved ~1h of wrong work."
- **Add memory `project_seo_phase2_shipped`**: note GSC Domain property setup, image sitemap entries, ROLE 4/5 deferred status, sun-sign API endpoint path, year-table accordion pattern.
- **Update memory `project_estrevia`**: increment shipped-features list with Phase 2 deliverables.
- **Memory cleanup**: remove or archive any stale entry referencing `/sidereal-{sign}-dates` as missing.

---

## §10. What lead needs from founder before dispatch

1. **This spec approval** — gate before invoking writing-plans.
2. **Confirmation** that founder is available for:
   - DNS TXT paste (~2 min, async, can happen anytime during session)
   - QA report merge gate (~3.5-4.5h after dispatch)
3. **Vercel access acknowledgment** — `seo-verifier` will run `vercel env ls` (read-only). No write actions on env vars expected this session.
4. **DNS provider clarification** when seo-eng asks (Vercel-managed / Cloudflare / Namecheap / Porkbun / other) — for paste workflow precision.

---

## §11. Open questions carried into writing-plans

- Exact Swiss Ephemeris flag set for sidereal Sun longitude calculation (astro-eng confirms in T3 review — likely `SEFLG_SIDEREAL | SEFLG_MOSEPH` based on existing module patterns).
- Whether `next/font` config already has `display: 'swap'` (perf-verifier confirms in T2 baseline).
- Whether bundle analyzer is configured (`@next/bundle-analyzer` installed) — perf-verifier installs as devDep if missing.
- Year range for year-table accordion: spec proposes ±3 years from current; alternatives are ±5 (more SEO depth, more SSR cost) or ±2 (lighter). Default ±3 unless founder requests otherwise.

---

## End of design spec
