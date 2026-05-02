# SEO + UX + Content Overhaul — Design Spec

| Field | Value |
| --- | --- |
| Date | 2026-05-02 |
| Status | Draft → pending user review |
| Authors | Lead (Claude Opus 4.7) + brainstorming with founder |
| Scope tier | Full design for P0/P1/P2; **implementation only for P0 in this session** |
| Branch model | Hybrid C — safe changes → `main`; risky SEO foundation → `p0-seo-foundation` feature branch with manual gate |
| Spanish strategy | URL-prefix `/es/` via `next-intl` routing v4 (Q2 = B) |
| Agent topology | Single Agent Team `estrevia-p0-overhaul`, 10 named teammates, hybrid pair pattern III |
| Production verification | Mandatory baseline snapshots via WebFetch + Playwright MCP for every verifier |

## Decisions log (from brainstorming Q1–Q4)

| Q | Decision | Reasoning |
| --- | --- | --- |
| Q1 — session scope | **C** — full design for all 5 ROLES, implementation only for P0 | Avoids AI-slop on long content batches; surfaces real blockers before mass content generation |
| Q2 — Spanish/hreflang | **B** — `/es/` URL prefix via next-intl routing v4 | Cookie-only locale is a known SEO anti-pattern; 120 ES MDX essays already exist, infra investment justified by `docs/marketing.md` 70/30 ad split |
| Q3 — agent topology | **III** — hybrid: implementer+verifier for cross-cutting, split+mutual-review for content, QA-only for verification | Matches work shape per role; no wasted agents on cross-cutting tasks |
| Q4 — gating | **C** — safe changes direct to `main`, risky SEO foundation to feature branch + manual gate, **plus** mandatory production verification | Canonical/redirect mistakes have weeks-long blast radius on Google indexation |

---

## §0. Context: contradictions between brief and codebase

The founder's manual audit produced a brief with several factual errors. Spec design must **trust the verified codebase, not the brief, where they conflict**. Verifier agents resolve open ground-truth questions via WebFetch on production URLs.

| # | Brief claim | Verified codebase reality | Action |
| --- | --- | --- | --- |
| 1 | "Sitemap has 12 sun-in essays" | `src/app/sitemap.ts:167` calls `getAllEssaySlugs()` returning all 120 essays | Trust code. No "create moon-in essays" task — they exist. |
| 2 | "No moon-in or rising-in essays exist" | moon-in EN+ES MDX exist (24 files); rising-in genuinely missing | Only rising-in goes into P1 plan. |
| 3 | "No real Spanish content" | 120 ES MDX in `content/essays/es/`, `messages/es.json`, `next-intl` wired with cookie+Accept-Language | ES is launch-priority. Migrate to `/es/` URL prefix. |
| 4 | "Canonical points to vercel-deployment-domain" | `src/shared/seo/constants.ts:3-16` resolves SITE_URL via env cascade. Most likely `NEXT_PUBLIC_SITE_URL` is unset in Vercel prod env, not a code bug | ROLE 1 verifies env first via `vercel env ls` before touching code. |
| 5 | "hreflang en-US/es lead to same URL" | Confirmed — `metadata.ts:113-118` & `sitemap.ts:40-48` intentionally point both locales to same canonical | Real bug. Fix as part of `/es/` migration. |
| 6 | CLAUDE.md "Pre-MVP, no code" | Full Next.js 16 app with Clerk/Stripe/Sentry/advertising module/120 essays/78 tarot routes/30+ recent commits | Update CLAUDE.md + memory after this session. |
| 7 | "/tarot/{card} ~80 words in `<main>`" | Page template is 251 lines JSX — needs render-time word count verification on prod | qa-tech runs WebFetch + word-count on prod for all alleged thin pages before deciding scope. |
| 8 | Memory "MVP — EN only" | Outdated — ES infrastructure already substantial | Update memory after this session. |

**Genuinely missing (verified absent):** `/passport/[combo]`, `/glossary/[term]`, `/transits/today`, `/horoscope/[sign]/today`, `/sidereal-[sign]-dates`, `/rare`, `/essays/rising-in-[sign]`, `/es/` URL routing, vercel.app→estrevia.app 301 redirect.

---

## §1. Three-tier scope

### P0 — implemented this session
The minimum coherent slice that unblocks indexation and viral conversion. Everything else depends on these foundations being correct.

- **SEO foundation:** `/es/` URL migration, canonical+hreflang correctness, vercel.app→estrevia.app 301, dedupe Organization JSON-LD, UTM on share links, preserve `/s/[id]` noindex.
- **Frontend P0:** mobile horizontal overflow fix at 320–414px, dedup H1/H2 in DOM on `/hours` (and verify `/tree-of-life`), chart state persistence on reload, SSR verification on `/s/[id]`.
- **UI/UX P0:** OG image redesign (1200×630 + 1080×1920), share-section visual unification on `/s/[id]`, share-copy variants per channel.
- **Content P0:** expand `/hours`, `/moon`, `/synastry`, `/tree-of-life` to ≥600 words below the widget with FAQ JSON-LD, EN+ES.
- **QA P0:** Lighthouse, JSON-LD validation, share-flow E2E, production validators, final report → user merge gate.

### P1 — designed in this spec, implemented in subsequent sessions
Mass content production. Each is its own session because each requires its own template+JSON-LD+internal-links+EN+ES copy:

- `/tarot/[cardId]` content expansion (78 cards × 600–800 words × 2 langs ≈ 116K words).
- `/essays/rising-in-[sign]` (12 new MDX × 2 langs).
- `/passport/[combo]` SEO interpretation pages — start with 144 sun×moon combos × 2 langs.
- `/glossary/[term]` — 50 base terms × 2 langs.
- `/sidereal-[sign]-dates` × 12 × 2 langs.
- `/rare` honeypot — single page, public aggregated stats.

### P2 — designed in this spec, deferred
- `/transits/today`, `/horoscope/[sign]/today`, `/today` — daily-updated content for habit formation.
- A/B test infrastructure for share copy.
- Hub-and-spoke internal linking refactor around `/why-sidereal`.
- Phase 2 viral artifacts: Lunar Cards (2×/month), Birthday Wrapped (annual).

---

## §2. ROLE 1 — SEO/Tech foundation (feature branch `p0-seo-foundation`)

**Pair:** `seo-eng` (subagent_type: `seo-growth`) + `seo-verifier` (subagent_type: `devops`).

**Risk profile:** highest in this session. Mistakes here can drop the site from Google index for weeks. Therefore: feature branch + user merge gate + mandatory baseline+post snapshots.

### §2.1 Pre-flight verification (BEFORE any code change)

`seo-verifier` runs first and posts findings to TaskList:

1. `vercel env ls --environment=production` → check whether `NEXT_PUBLIC_SITE_URL=https://estrevia.app` is set in production. If missing, this single env var addition (`vercel env add NEXT_PUBLIC_SITE_URL https://estrevia.app production` + redeploy) likely fixes ~80% of the canonical-leak bug. Code-level changes proceed regardless, but the team needs ground truth.
2. `curl -s https://estrevia.app/chart | grep -E 'canonical|og:url|og:image|twitter:image'` → record actual canonical values served by production.
3. `curl -s https://estrevia.app/sitemap.xml | head -50` → record whether `<loc>` entries are estrevia.app or vercel.app.
4. `curl -sI https://estrevia-{any-recent-hash}-...vercel.app/` → record current behaviour (200 vs 301 vs other).
5. `curl -s https://estrevia.app/robots.txt` → record sitemap URL inside robots.
6. View-source of homepage + `/chart` + `/essays/sun-in-aries` + one `/s/[id]` (use a synthetic ID generated on staging) → record JSON-LD blocks present.

**Output:** `tmp/baselines/seo-baseline-2026-05-02.json` with all observations. This file is the diff target for post-implementation verification.

### §2.2 i18n migration to `/es/` URL prefix

**Goal:** every page is reachable at both `https://estrevia.app/<path>` and `https://estrevia.app/es/<path>`. Each emits its own canonical and a hreflang pair pointing to the other locale. Cookie-based locale switching is deprecated.

**Files modified or created:**

1. **`src/i18n/routing.ts` (NEW)** — defines next-intl `routing` object:
   ```ts
   import { defineRouting } from 'next-intl/routing';
   export const routing = defineRouting({
     locales: ['en', 'es'],
     defaultLocale: 'en',
     localePrefix: 'as-needed', // EN at root, ES under /es/
   });
   ```

2. **`src/i18n/request.ts`** — rewrite to consume `routing` instead of cookie/header detection. Locale comes from URL segment (handled by middleware). Keep messages loader.

3. **`src/i18n/navigation.ts` (NEW)** — exports next-intl `Link`, `redirect`, `usePathname`, `useRouter` bound to `routing`. Replaces `next/link` everywhere user-clickable links exist (headers, footers, in-page CTAs).

4. **`src/middleware.ts`** — combine three concerns in correct order. **The code below is ILLUSTRATIVE INTENT, not final**; `seo-eng` must research the exact composition pattern for the installed `next-intl@4.9.0` + `@clerk/nextjs@7.2.3` versions (their docs cover the canonical Clerk + next-intl integration recipe).

   Intent:
   ```ts
   import { NextResponse, type NextRequest } from 'next/server';
   import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
   import createIntlMiddleware from 'next-intl/middleware';
   import { routing } from '@/i18n/routing';

   const intlMiddleware = createIntlMiddleware(routing);
   const isProtectedRoute = createRouteMatcher([/* unchanged from current file */]);

   // 301 from any *.vercel.app deployment hash → estrevia.app same path.
   // Gate on VERCEL_ENV (not NODE_ENV) — Vercel preview deploys also have
   // NODE_ENV=production, but we want previews to remain reachable on their
   // vercel.app URL. Only the production deployment redirects.
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
     // 1. Canonical-host redirect first — short-circuits before i18n/auth.
     const hostRedirect = redirectVercelHostToCanonical(req);
     if (hostRedirect) return hostRedirect;

     // 2. Auth gate FIRST for protected routes (per Clerk + next-intl docs pattern).
     //    Calling auth.protect() inside the wrapper raises the redirect-to-sign-in.
     if (isProtectedRoute(req)) {
       await auth.protect();
     }

     // 3. Then run intl middleware — handles both rewrite (locale → URL) and
     //    redirect (e.g., /es/ default-locale stripping). Always return its response.
     return intlMiddleware(req);
   });

   export const config = {
     matcher: [
       // Match everything EXCEPT internals, static files, and API routes that
       // never need locale/auth (api/og, api/cron). Keep API auth matchers from
       // the existing config so Clerk runs on protected API routes.
       '/((?!_next|_vercel|api/og|api/cron|.*\\..*).*)',
       '/api/v1/(.*)',
       '/api/admin/(.*)',
     ],
   };
   ```
   **Critical:** the existing Clerk matcher list and `isProtectedRoute` rules must be preserved. After implementation, `seo-eng` must run E2E auth flow checks (sign-in, /admin access, /api/v1/chart/save POST) on the feature-branch preview deploy before signaling ready-for-review. Both the matcher pattern AND `isProtectedRoute` patterns must be kept in sync (current `src/middleware.ts` documents this constraint).

5. **`src/shared/seo/metadata.ts`** — `createMetadata` accepts `locale` (already does), but now produces:
   - `canonical`: `${SITE_URL}${locale === 'es' ? '/es' : ''}${path}` (drop trailing slash).
   - `alternates.languages`: `{ 'en-US': enUrl, 'es': esUrl, 'x-default': enUrl }` where each URL points to the locale-specific page.
   - `og:locale`: `en_US` or `es_ES`.
   - `alternateLocale`: opposite locale.

   The `path` argument convention does NOT include the `/es` prefix — the function adds it based on `locale`. Existing call sites pass `path` unchanged.

6. **`src/app/sitemap.ts`** — for every canonical path, emit one `<url>` entry per locale (EN at root, ES under `/es/`). Each entry's `alternates.languages` lists both locale URLs (and `x-default` → EN). Total ≈ 442 entries (221 paths × 2 locales). Each entry has its own `loc`, both share the same `lastmod` / `changefreq` / `priority`.

7. **`src/app/robots.ts`** — already uses SITE_URL, no change. Verify post-deploy.

8. **`next.config.ts`** — `withNextIntl` is already wired. No change unless `routing` import path differs from default.

9. **All page-level `generateMetadata()` calls** — must accept and forward `locale` from `getLocale()` from `next-intl/server`. Many already do; audit and fix gaps.

10. **`<Link>` audit** — replace `next/link` with `@/i18n/navigation` `Link` everywhere internal navigation happens. Skip external links and `/api/og/...` references. Use grep: `from 'next/link'` → switch to navigation export.

11. **Vercel env vars** — `vercel env add NEXT_PUBLIC_SITE_URL https://estrevia.app production preview` if missing.

### §2.3 OG / share / structured data hygiene

12. **Dedup Organization JSON-LD on homepage** — verifier identifies which file emits the duplicate (likely `src/app/(marketing)/layout.tsx` AND `src/app/(marketing)/page.tsx` both inject it). Keep the one in layout, remove from page.

13. **UTM params on share buttons** — every outbound share URL includes:
    - `utm_source`: one of `share_x`, `share_telegram`, `share_whatsapp`, `share_copy`, `share_native`, `share_stories`.
    - `utm_medium`: `passport_share`.
    - `utm_campaign`: `cosmic_passport`.
    - Use a small helper `buildShareUrl(targetUrl, channel)` in `src/shared/lib/share.ts`. Apply to all share-button components.

14. **`/s/[id]` noindex preserved** — verify `createMetadata({ noIndex: true })` is called. Keep robots.ts `Disallow: /s/`.

### §2.4 Acceptance criteria for ROLE 1

After feature branch deploys to preview Vercel URL (and after final user-gated merge to main):

- `curl -s https://estrevia.app/chart | grep canonical` → `https://estrevia.app/chart`.
- `curl -s https://estrevia.app/es/chart | grep canonical` → `https://estrevia.app/es/chart`.
- `curl -s https://estrevia.app/sitemap.xml | grep -c '<loc>'` → ≥ 442.
- `curl -s https://estrevia.app/sitemap.xml | grep estrevia-` → empty (no vercel.app refs).
- `curl -sI https://estrevia-{any-recent-hash}-...vercel.app/` → `301` with `Location: https://estrevia.app/`.
- Rich Results Test (via API or manual link in QA report) on `/`, `/chart`, `/essays/sun-in-aries`, `/es/essays/sun-in-aries`, `/why-sidereal` → no errors.
- `site:estrevia.app/s/` Google query → 0 results (verified via WebFetch on Google search result page count).
- Memory updates queued (see §13).

---

## §3. ROLE 2 — Frontend P0 (main branch)

**Pair:** `fe-eng` (subagent_type: `frontend`) + `fe-verifier` (subagent_type: `qa`).

### §3.1 Mobile horizontal overflow

**Verifier baseline:** Playwright at viewports 320 / 360 / 375 / 390 / 414 / 768 px. For each, capture:
- `document.documentElement.scrollWidth` vs `window.innerWidth`.
- DOM nodes whose `getBoundingClientRect().right` exceeds `window.innerWidth`.
- Screenshot of each viewport on `/`, `/chart`, `/s/sample-id`, `/hours`, `/why-sidereal`.

Most likely culprits per brief: header navigation (Tree of Life label wraps awkwardly on narrow widths), share-bar on `/s/[id]` (Copy/X/Telegram/WhatsApp/9:16/PNG in one row), Cosmic Passport card itself, Jupiter pill in header.

**Fix patterns:**
- Header nav on mobile: dropdown for secondary items (Tree of Life, Synastry, Hours).
- Share-bar: 2×3 grid on mobile, single row on ≥sm. Or horizontal-scroll with `scroll-snap-x`. Decision deferred to fe-eng based on baseline screenshots.
- City autocomplete input ("Start typing city name…"): force `min-width: 0` on parent flex container, `width: 100%` on input.

**Acceptance:** at every viewport in the test matrix, `documentElement.scrollWidth === window.innerWidth`.

### §3.2 Duplicate H1/H2 in DOM on `/hours`

The brief reports both mobile and desktop versions live in DOM with no `display:none`, so Google sees two H1s.

**Fix pattern:** consolidate into a single adaptive component. Two options:
- (preferred) Single component with Tailwind responsive utilities — eliminates the duplication entirely.
- (fallback if mobile/desktop UX truly diverges) keep two but use `hidden md:block` / `block md:hidden` AND add `aria-hidden="true"` on the inactive variant. CSS `display:none` does cause Google to deprioritize, so single component is cleaner.

**Acceptance:** `document.querySelectorAll('h1').length === 1` on `/hours`. Same check on `/tree-of-life` after verification.

### §3.3 Chart state persistence on reload

Currently `/chart` reload returns the user to an empty form. This kills the share-loop: "open my friend's passport → calculate my own → share my own → reload to come back".

**Mechanism:** URL query params (preferred over localStorage because shareable + survives clearing cookies):
- After successful calculation, push state with: `?bd=YYYY-MM-DD&bt=HH:mm&lat=&lon=&place=&tz=` (encoded).
- On `/chart` mount, if all required params present, skip the form and run calculation.
- "Edit" button restores the form with prefilled values.
- Privacy: birth time/location are PII. Encrypt at rest in DB only. URL params live in browser history but are NOT sent to PostHog (already filtered out per existing analytics config — verify).

**Acceptance:** fill form → calculate → reload → result re-renders with same data. No PII leaks to analytics events.

### §3.4 SSR verification on `/s/[id]`

Brief flagged a possible concern. The page is a Server Component (matches `src/app/s/[id]/page.tsx` pattern). Verifier confirms via `view-source` on a real `/s/[id]` URL that:
- canonical, og:image, og:title, og:description present in HTML before any JS runs.
- Body content (Passport card data) present in HTML.
- No "loading…" placeholders in initial HTML.

If any are missing, `fe-eng` migrates the relevant data fetch to server-side (fetch in the Page component, pass to client components only for interactivity).

**Acceptance:** Twitter Card Validator + Telegram instant view show correct preview without JS execution.

### §3.5 Files touched (anticipated)

- `src/app/(app)/(layout components)` — header nav responsive.
- `src/app/s/[id]/page.tsx` — share-bar grid + SSR audit.
- `src/app/(app)/chart/**` — state-in-URL hook, form prefill, edit toggle.
- `src/app/(app)/hours/page.tsx` — single adaptive component.
- `src/app/(app)/tree-of-life/page.tsx` — same pattern if dup confirmed.
- Component CSS / Tailwind class adjustments across `min-width: 0`, `flex-shrink`, `overflow-hidden` on parent containers.

---

## §4. ROLE 3 — UX/UI P0 (main branch)

**Pair:** `ui-eng` (subagent_type: `frontend`) + `ui-verifier` (subagent_type: `content`).

### §4.1 OG image redesign — `/api/og/passport/[id]`

**Current state per brief:** top and bottom quarters of canvas empty, rarity badge same size as Air/Mercury labels, no personalization, brand text 12px in corner.

**Target composition (1200×630):**
- Background: deep navy (#0A0A0F) gradient with subtle starfield (Satori SVG `<defs>` pattern) — fills entire canvas.
- Hero band (top 40% of canvas): user's display name or initials (large, 72px, Crimson Pro). If no name available, "Cosmic Blueprint".
- Center band (40%): the three sign glyphs (Sun / Moon / Rising) with sign names. Planetary colors per `docs/design.md`.
- Rarity stamp (top-right corner, rotated 8°): "1 of 5.4% — VERY RARE" inside a circular hatched stamp. This is the "main hero" and must dominate visually.
- Bottom band (20%): element + ruling planet line + small zodiac ornament motif on left and right edges.
- Brand: `estrevia.app` bottom-center, Geist Sans 18px white at 70% opacity, with small Estrevia logo glyph to the left.

**Stories template (1080×1920):**
- Same visual language, vertical layout: hero band top (35%), three signs middle (45%), rarity stamp overlapping bottom-right of middle band, brand bottom-center.
- Reused for PNG-export download for Instagram Stories.

**Implementation notes:**
- Satori does not support all CSS — verify `transform: rotate()` works on the rarity stamp; if not, use SVG `<g transform>`.
- Fonts: Crimson Pro and Geist Sans must be loaded via `Inter()` analog or `fetch()` from public/fonts. Check `src/app/api/og/...` existing pattern.
- Generation cost is on-CDN-cache-miss; not a runtime concern.

**Acceptance:** preview through Twitter Card Validator + Telegram instant view + LinkedIn Post Inspector → all show the new design correctly. Visual review by ui-verifier on at least 5 sample IDs covering rare/common rarities.

### §4.2 Share-section visual unification on `/s/[id]`

Currently the Cosmic Passport card and the golden "Share Passport" CTA read as two separate visual objects. Target: a single visual unit where the CTA's golden glow extends to embrace the card.

**Implementation:**
- Wrap card + CTA in a single `<section>` with shared `box-shadow` glow on the parent.
- Reduce gap between card and CTA from ~32px to ~12px.
- Match the card's bottom border-radius to the section's outer border-radius so the eye reads continuity.
- Preserve the rarity badge position; emphasize "Very Rare · 1 of 5.4%" by upping size +2 sizes.

### §4.3 Subdue Aspects/Houses checkboxes on `/chart` wheel

Currently bright golden (matches the Share CTA), pulling attention disproportionately.
**Fix:** desaturate to golden-700 with reduced opacity in the checkbox unchecked state; checked state remains golden-500 for clear toggle feedback.

### §4.4 Share copy variants per channel

`messages/en.json` and `messages/es.json` get new keys under `share.passport.copy`:

| Channel | EN copy | ES copy |
| --- | --- | --- |
| `x` | "Apparently I'm a 1-in-{rarity} cosmic blueprint 👀 {url}" | "Resulta que soy un blueprint cósmico de 1 entre {rarity} 👀 {url}" |
| `telegram` | "Just calculated my sidereal cosmic passport — Sun in {sun}, Moon in {moon}, Rising in {rising}. {url}" | "Acabo de calcular mi pasaporte cósmico sideral — Sol en {sun}, Luna en {moon}, Ascendente en {rising}. {url}" |
| `whatsapp` | "Look what I got 👇 {url}" | "Mira lo que me salió 👇 {url}" |
| `stories_caption` | "Cosmic blueprint unlocked 🌌" | "Blueprint cósmico desbloqueado 🌌" |
| `copy_link` | (no text — just URL) | (same) |
| `native_share` | "{name}'s Cosmic Passport — {url}" | "Pasaporte Cósmico de {name} — {url}" |

ES style: español neutro LATAM, `tú` form, sign names not translated, planet names translated (per memory).

### §4.5 Files touched (anticipated)

- `src/app/api/og/passport/[id]/route.ts` (or whatever the actual path is — verifier confirms first).
- `src/app/s/[id]/page.tsx` and child components for the share section.
- `src/app/(app)/chart/**` for checkbox styling.
- `messages/en.json`, `messages/es.json`.
- `src/shared/lib/share.ts` (built in §2.3, used here).

---

## §5. ROLE 4 — Content P0 (main branch)

**Pair:** `content-a` + `content-b` (both subagent_type: `content`). Pattern: split work + mutual review.

### §5.1 Split assignment

| Agent | Pages owned (EN+ES per page) | Word target below widget | JSON-LD added |
| --- | --- | --- | --- |
| `content-a` | `/hours` + `/moon` | ≥600 each | Article + FAQPage |
| `content-b` | `/synastry` + `/tree-of-life` | ≥600 each | Article + FAQPage |

Each agent:
1. Reads the existing page to understand the widget context.
2. Drafts EN content first (educational, non-fluff, founder-domain-accurate).
3. Drafts ES translation following neutro LATAM + `tú` + sign names untranslated rule.
4. Adds 5-question FAQ at the bottom with FAQPage JSON-LD.
5. Pushes commit. Then reviews the OTHER agent's commit using the AI-slop checklist (memory: 12-point design quality gate) for content quality, factual accuracy, and slop signals.
6. Posts review verdict via SendMessage + TaskList comment.

### §5.2 Content templates

#### `/hours` — Planetary Hours
**Sections:**
- "What are planetary hours?" (~150 words) — origins in Hellenistic / medieval astrology, Chaldean order Saturn–Jupiter–Mars–Sun–Venus–Mercury–Moon, day vs night hours.
- "How to use them" (~150 words) — choosing actions per planet (love → Venus, study → Mercury, ritual → Saturn, etc.), brief 777-correspondence link.
- "Day-ruler vs hour-ruler" (~100 words) — distinction.
- "Why this matters in sidereal" (~100 words) — clarification that planetary hours are tropical-natural (sunrise-relative), independent of zodiac framework.
- 5 FAQ entries (~100 words total) with FAQPage schema.

#### `/moon` — Lunar Cycle
**Sections:**
- "The 8 lunar phases" (~250 words) — New, Waxing Crescent, First Quarter, Waxing Gibbous, Full, Waning Gibbous, Last Quarter, Waning Crescent. One paragraph each.
- "Lunar magic in tradition" (~150 words) — references to Crowley pre-1929 Liber AL framing, sympathy with the moon's energy.
- "Sidereal moon vs tropical moon" (~100 words) — link to /why-sidereal.
- "How Estrevia calculates moon phase" (~50 words) — Swiss Ephemeris reference.
- 5 FAQ entries (~100 words total).

#### `/synastry` — Relationship Astrology
**Sections:**
- "What is synastry?" (~150 words) — overlay of two charts, compatibility interpretation, history.
- "Key aspects" (~200 words) — Sun-Moon, Venus-Mars, Saturn contacts, Moon-Moon. One paragraph each.
- "How to read the score" (~100 words) — what Estrevia's compatibility score means, weighting.
- "Sidereal vs tropical synastry" (~100 words) — link to /why-sidereal.
- 5 FAQ entries (~100 words).

#### `/tree-of-life` — Kabbalistic Tree
**Sections:**
- "The 10 sefirot" (~250 words) — Keter to Malkuth, one short paragraph each.
- "The 22 paths" (~150 words) — connection to Hebrew letters and Tarot Major Arcana.
- "How to read the diagram" (~100 words) — pillars (Severity / Mercy / Equilibrium), descent of light, ascent of soul.
- "Tree and Tarot" (~100 words) — internal link to `/tarot/[card]` pages.
- 5 FAQ entries (~100 words).

### §5.3 Implementation pattern

Two options for where the content lives:

**(A — preferred for P0)** Inline JSX content blocks added directly to `src/app/(app)/{hours,moon,synastry,tree-of-life}/page.tsx` below the existing widget, with i18n strings in `messages/{en,es}.json` under nested keys like `hours.educational.heading`. Reason: avoids creating a parallel MDX pipeline for these 4 pages; keeps everything in the existing pattern.

**(B — alternative)** Add new MDX files to `content/educational/{hours,moon,synastry,tree-of-life}.{en,es}.mdx` and a generic loader. Reason: cleaner separation. Cost: more infrastructure.

Decision: **(A)** for P0. Revisit if content scope expands in P1.

### §5.4 Anti-AI-slop checklist (mutual review)

Per memory `feedback_anti_ai_slop`, the 12-point gate. Each reviewer applies this to the other's content:
1. No "In conclusion / it is important to note / let's explore" boilerplate.
2. No empty parallel structures ("not just X but Y", repeated 3+ times).
3. Specific dates/numbers/names where possible.
4. No GPT-style hedging ("might be considered by some to potentially…").
5. Active voice.
6. Sentence length variety.
7. No transitional throat-clearing ("Now, let's talk about…").
8. No restating the question in the answer.
9. Real domain knowledge, not Wikipedia-level platitudes.
10. ES translation uses LATAM neutral + `tú`, not European Spanish.
11. Internal links serve readers (not stuffed for SEO).
12. FAQ answers are direct (first sentence answers; rest expands).

### §5.5 Acceptance criteria

- Word count below the existing widget on each of the 4 pages ≥ 600 in `<main>` for EN and ES separately.
- FAQPage JSON-LD validates via Rich Results Test (qa-tech runs).
- Mutual reviews posted in TaskList for all 4 pages, each with explicit verdict.
- ES sign names preserved in ES copy (Aries stays "Aries", not "Carnero"), planet names translated (Mercurio, Venus, etc.).

---

## §6. ROLE 5 — QA P0 (queued: blocked until ROLE 1+2+3+4 complete)

**Pair:** `qa-tech` (subagent_type: `qa`) + `qa-ux` (subagent_type: `qa`).

### §6.1 qa-tech responsibilities

- **Lighthouse mobile + desktop** on `/`, `/chart`, `/s/sample-id`, `/essays/sun-in-aries`, `/es/essays/sun-in-aries`, `/hours`, `/moon`, `/synastry`, `/tree-of-life`, `/why-sidereal`.
  - Targets: Performance ≥ 85, Accessibility ≥ 95, SEO = 100. Best Practices ≥ 90.
  - Output: aggregated table per page, per metric.
- **JSON-LD validation** — Google Rich Results Test on all P0 pages. Output: pass/fail + warnings per page.
- **Canonical / sitemap / robots / redirect** — re-runs the §2.1 checks against feature-branch preview deploy AND (after merge gate) against prod. Diff against baseline. Output: green/red per check.
- **DOM check** — Playwright assertion `querySelectorAll('h1').length === 1` on `/hours` and `/tree-of-life` after fixes. Same for navigation duplicates.
- **Indexation prediction** — WebFetch Google `site:estrevia.app` and `site:estrevia.app/s/`. The first should return ≥ ~200 (or whatever Google has indexed). The second should return 0.

### §6.2 qa-ux responsibilities

- **Share-flow E2E per channel** — Playwright opens `/chart`, fills synthetic data, calculates, navigates to `/s/[id]`, clicks each share button, intercepts the outbound URL, verifies UTM parameters present and correctly formatted.
- **Preview validators** — uses WebFetch against:
  - `https://cards-dev.twitter.com/validator?url=...` — capture screenshot/text of card preview.
  - `https://www.linkedin.com/post-inspector/` (note: requires login, may be limited; document workaround).
  - Telegram instant view — manually paste in a Telegram chat is the only true verifier; document procedure for founder.
- **Mobile responsive screenshots** — Playwright screenshot at every viewport in §3.1's matrix on every relevant page. Visual diff against baseline.
- **Chart state reload test** — fill `/chart`, reload, assert result re-renders.
- **OG image regression** — fetch `/api/og/passport/[id]` for ≥ 5 sample IDs, confirm they render the new design (basic dimension + non-empty buffer check; full visual review by `ui-verifier`).

### §6.3 Final QA report

Posted to TaskList as a TaskUpdate metadata blob + a Markdown file `tmp/qa-reports/p0-overhaul-2026-05-02.md`. Sections:
- Baseline vs current (per check).
- Pass/fail summary.
- Open issues with severity + suggested owner.
- Lighthouse table.
- Screenshots index.
- Recommendation: ready-for-merge or needs-fixes.

This report is what the founder sees before approving merge of `p0-seo-foundation` → `main`.

---

## §7. Production verification protocol

**Mandatory for every verifier in every pair.** Skipping baseline = the agent operates on faith in the brief; results in fixes for non-existent bugs.

### §7.1 Baseline phase (kickoff, before any code change)

Each verifier captures the relevant subset:

- `seo-verifier`: §2.1 checks above.
- `fe-verifier`: Playwright screenshots at every viewport on every page in scope; DOM h1/h2 count; chart-reload behavior recorded as video.
- `ui-verifier`: Twitter Card Validator + Telegram instant view + LinkedIn Post Inspector outputs for current `/s/[id]` and current OG image. Save image bytes.
- `qa-tech` and `qa-ux`: full baseline of everything in §6.

All baselines saved to `tmp/baselines/` (gitignored). Path convention:
`tmp/baselines/<role>-<topic>-2026-05-02.{json,png,html}`.

### §7.2 Post-implementation phase

Same checks, output saved with `-after` suffix. Each verifier posts a one-page diff summary into the relevant TaskUpdate metadata.

### §7.3 Why this matters

The brief contains 5+ factual errors (see §0 table). Without baseline verification, agents would have written code to "fix" things that aren't broken — wasted work, plus risk of regression on things that actually worked. Baseline-then-diff is cheap insurance.

---

## §8. Agent team topology + dispatch

### §8.1 Team and members

`TeamCreate({ team_name: 'estrevia-p0-overhaul', description: 'P0 SEO/UX/Content overhaul session 2026-05-02' })`.

10 teammates spawned in a single multi-Agent message:

| Name | subagent_type | Role |
| --- | --- | --- |
| `seo-eng` | `seo-growth` | ROLE 1 implementer |
| `seo-verifier` | `devops` | ROLE 1 verifier (env, redirects, validators) |
| `fe-eng` | `frontend` | ROLE 2 implementer |
| `fe-verifier` | `qa` | ROLE 2 verifier (Playwright, DOM, state) |
| `ui-eng` | `frontend` | ROLE 3 implementer (OG image + share section) |
| `ui-verifier` | `content` | ROLE 3 verifier (validators, copy review) |
| `content-a` | `content` | ROLE 4 first half (`/hours`, `/moon`) |
| `content-b` | `content` | ROLE 4 second half (`/synastry`, `/tree-of-life`) |
| `qa-tech` | `qa` | ROLE 5 technical QA |
| `qa-ux` | `qa` | ROLE 5 UX QA |

### §8.2 TaskList structure

I (lead) create the full task graph upfront. Tasks have:
- `subject`: short imperative title.
- `description`: full spec link + acceptance criteria.
- `owner`: pre-assigned per agent name above.
- `addBlockedBy`: dependency edges.

Dependency graph (high level):
- All baseline tasks (one per verifier) → unblocked at start.
- ROLE 1 implementation tasks → blocked by `seo-verifier-baseline-done`.
- ROLE 2 chart-state task → blocked by `seo-eng-i18n-routing-done` (because new `<Link>` usage may affect chart links).
- ROLE 3 share-copy task → blocked by ROLE 1 UTM helper landing.
- ROLE 4 → no hard block on ROLE 1 (content edits don't conflict with metadata files), but waiting for `/es/` routing decision is recommended (so ES copies use correct page templates).
- ROLE 5 (qa-tech, qa-ux) → blocked by ALL implementer tasks completing.
- Final merge-gate task → owned by `lead` (me), blocked by qa-tech and qa-ux reports.

### §8.3 Communication protocol

- **Within pair:** SendMessage for "ready for review" / "approved" / "issue found, see comment in task #N".
- **Cross-pair:** SendMessage when a dependency unblocks (e.g., seo-eng → fe-eng "i18n routing landed on feature branch, you can now use new Link from @/i18n/navigation").
- **To lead (me):** SendMessage on blocker, confusion, or completion of all owned tasks.
- **No raw status JSON** — plain text only; use TaskUpdate for state transitions.

### §8.4 What the lead (Claude main thread) does

1. Create team.
2. Create all P0 tasks with deps.
3. Spawn 10 teammates in one parallel message.
4. Monitor via TaskList. Respond to escalations.
5. When all P0 implementer tasks completed → unblock QA.
6. When QA reports posted → consolidate, present to founder.
7. On founder approval → merge feature branch → main → trigger Vercel prod deploy.
8. Post-deploy: re-run verification on prod, update memory, shutdown team.

---

## §9. Branch & merge strategy (per Q4 = C)

| Branch | Owners | Rationale |
| --- | --- | --- |
| `main` | `fe-eng`, `ui-eng`, `content-a`, `content-b` | Component/CSS/content changes — independent files, low blast radius, easy revert |
| `p0-seo-foundation` | `seo-eng` only | i18n migration / middleware / canonical / hreflang — high blast radius, manual gate required |

- `seo-verifier` checks `p0-seo-foundation` via Vercel preview deploy.
- `fe-verifier`, `ui-verifier`, content reviewers check `main` via local dev + ad-hoc preview deploys.
- `qa-tech` and `qa-ux` check both, but cannot certify final until BOTH are ready.
- Final merge: lead presents diff summary + QA report to founder. Founder runs `git merge p0-seo-foundation` (or approves via comment), lead pushes, Vercel auto-deploys prod.

**Rollback plan:** `git revert` on the merge commit + `vercel rollback` to the prior deployment if the issue is caught within minutes. For deeper regressions (e.g., wrong canonical leaking to Google for >1h), a forward-fix is preferred over revert because the fix is usually small.

---

## §10. P1 templates (designed now, implemented in subsequent sessions)

Each P1 item is a separate session: write per-template plan → dispatch fewer focused agents → ship.

### §10.1 `/tarot/[cardId]` content expansion

**Per-card template (≥600 words EN + ≥600 words ES):**
1. **Card overview** (~80 words): visual symbolism (Thoth-deck description in original prose, no copyrighted image), elemental + sefira + path correspondence.
2. **Upright meaning** (~120 words): keywords, expanded interpretation.
3. **Reversed meaning** (~80 words): inversion, shadow.
4. **Love & relationships** (~80 words).
5. **Career & money** (~80 words).
6. **Spirituality & inner journey** (~80 words).
7. **Kabbalistic correspondence** (~60 words): which sefira / which path / which Hebrew letter.
8. **Related cards** (~40 words): 2–3 cards with same element or connected by path. Internal links.

JSON-LD: Article + BreadcrumbList. Optionally CreativeWork for the card itself.

Image: NO Frieda Harris reproduction (copyright until 2064 per CLAUDE.md). Either:
- (a) Generate original illustrations via Imagen 4 Ultra one-time per card (78 × $0.06 = $4.68 — same images reused for ES, no double cost).
- (b) Geometric/symbolic SVG illustrations (free, more consistent with site aesthetic).
- Decision deferred to that session; lean toward (b) for brand cohesion.

### §10.2 `/essays/rising-in-[sign]` × 12 (24 with ES)

Use existing `/essays/sun-in-[sign]` MDX as template. Same sections (Key Traits, Sidereal vs Tropical, 777 Correspondences, Ephemeris, FAQ, CTA).
Note: rising sign requires birth time. Add disclaimer + link to `/chart` form for users to find their rising.

### §10.3 `/passport/sun-{x}-moon-{y}` (and later /rising-{z}) — public SEO interpretations

**Critical distinction from `/s/[id]`:**
- `/s/[id]`: noindex, viral share, personalized, requires the share link to exist.
- `/passport/[combo]`: indexed, public SEO, NO login/calculation needed, archetype-only content.

**Initial scope:** 144 sun×moon combos × 2 langs = 288 pages.
**Per-page template (~600 words):**
1. Archetype name (e.g., "The Magnetic Strategist" for Sun in Aries + Moon in Scorpio).
2. Core dynamic (~150 words).
3. Strengths (~120 words).
4. Growth areas (~120 words).
5. Famous public figures with this combo (~80 words) — public birthdate data only, no PII.
6. CTA: "Calculate your full passport" → `/chart`.
7. 3 internal links to similar combos (same sun OR same moon OR same element).

JSON-LD: Article + BreadcrumbList.

**Phase 2 expansion:** 1728 sun×moon×rising triples — only after the 144 baseline indexes well in GSC.

### §10.4 `/glossary/[term]`

50 base terms × 2 langs = 100 pages.
Terms: ayanamsa, placidus, midheaven, retrograde, conjunction, opposition, trine, square, sextile, ascendant, descendant, lunar nodes, sidereal, tropical, ephemeris, decanate, dwadasamsa, planetary hour, sefira, qliphoth, etc. (full list in dedicated session).

**Per-term template (~300–500 words):**
- Direct definition (1 sentence — answers "what is X" first).
- Etymology / origin (~50 words).
- How it works in astrology (~150 words).
- Sidereal vs tropical relevance (where applicable).
- 2 related terms (internal links).

JSON-LD: DefinedTerm.

### §10.5 `/sidereal-[sign]-dates` × 12 × 2

Targets queries like "what dates are sidereal aries", "when is sun in sidereal libra".
**Per-page template (~400 words):**
- Direct date answer (large, first paragraph).
- Why these dates differ from tropical.
- Annual variation (a few minutes per year due to precession adjustment).
- Embedded mini-calculator (reuses `/chart` API).
- Link to `/essays/sun-in-[sign]` and `/why-sidereal`.

### §10.6 `/rare` honeypot

Single page (×2 langs).
Aggregated stats from DB (rarest combinations, most common, etc.) — NO PII, just counts.
Goal: PR/backlink magnet ("estrevia.app calculated the rarest cosmic blueprints").

---

## §11. P2 designs (deferred entirely)

### §11.1 Daily pages

- `/transits/today` — current planetary positions, aspects, void-of-course moon, planetary hour now.
- `/horoscope/[sign]/today` × 12 × 2 — daily transit interpretation per sign.
- `/today` — combined dashboard.

ISR with ~1 hour revalidation. Build target: indexed for "today" queries.

### §11.2 A/B test infrastructure for share copy

- PostHog flag per copy variant.
- Track click-through on share buttons + downstream signups.
- Auto-promote winning variant after 95% confidence.

### §11.3 Hub-and-spoke around `/why-sidereal`

`/why-sidereal` already 1496 words — best content page on the site. Restructure as a hub:
- Add comparison table linking each sign to `/essays/sun-in-[sign]`, `/essays/moon-in-[sign]`, `/essays/rising-in-[sign]`, and `/sidereal-[sign]-dates`.
- Each spoke links back.
- Add a "Glossary" sidebar with internal links to relevant `/glossary/[term]` pages.

### §11.4 Phase 2 viral artifacts

Per CLAUDE.md `## Viral Share — «Cosmic Passport»`:
- Lunar Cards (2×/month on new/full moon) — auto-generated, sent to subscribers.
- Birthday Wrapped (annual on solar return) — full-year forecast card.

---

## §12. Risks & mitigations

| Risk | Severity | Mitigation |
| --- | --- | --- |
| i18n migration breaks Clerk auth on `/admin` or `/api/v1/...` | High | seo-verifier runs auth flow E2E on feature branch preview before signaling ready-for-review |
| `<Link>` migration misses some files → broken locale switching | Medium | grep audit + Playwright click-every-link test on staging |
| Sitemap doubling causes Vercel function timeout | Low | sitemap.ts is build-time, but verify generation completes within `vercel build` time budget |
| 301 from vercel.app catches preview URLs that legitimately need to stay vercel.app (e.g., Vercel preview comments) | Medium | gate on `NODE_ENV === 'production'` (not preview); even then test with a fresh preview after middleware lands |
| Two implementer agents conflict on same file | Low | Task graph dependencies + explicit pair-internal SendMessage before commit |
| OG image redesign fails Twitter preview cache invalidation | Low | versioned OG image URL via query param if needed |
| Founder under-reviews QA report → broken canonical ships to prod | High | QA report formatted as concrete pass/fail table; merge command from founder is explicit |
| ES translation is machine-quality vs requested neutral LATAM | Medium | Mutual review per §5.4; founder spot-check on 2 random pages before merge |
| Memory updates to "MVP — EN only" not made → future sessions repeat mistakes | Medium | Lead's final task in this session: update memory files |

---

## §13. Memory and CLAUDE.md updates after merge

- Update `feedback_mvp_priorities.md`: replace "EN only" with current truth — `/es/` URL prefix shipped, ES is launch-priority.
- Note in CLAUDE.md or new `project_estrevia.md` update: codebase is past initial MVP; "Pre-MVP, code not yet started" claim removed.
- Add `feedback_brief_vs_code_priority.md`: when founder brief contradicts verified codebase, trust code; surface contradiction explicitly. (This was the right call this session per Q1.)

---

## §14. What I (lead) need from founder before dispatch

1. **This spec approval** — gate before invoking writing-plans.
2. **Confirmation** that founder is available for the QA report merge gate within ~2–4 hours of dispatch (or timeline expectation if longer).
3. **Vercel access acknowledgment** — `seo-verifier` will run `vercel env ls` (read-only), and may need to run `vercel env add ...` (write). If the latter is gated, founder runs it manually when prompted.
4. **Confirm OG image rendering location** — single OG image endpoint at `/api/og/passport/[id]` per brief, or are there others (`/api/og/share/...`, `/opengraph-image.tsx`)? Verifier will discover, but founder confirmation saves a turn.

---

## §15. Open question carried into writing-plans

- Exact file path of OG passport image generator (verifier discovers in baseline phase).
- Whether `next-intl` `routing` v4 API is stable in installed version (`4.9.0` per package.json) — verifier confirms in pre-flight; if API differs from v3, adjust §2.2 details.
- Whether the existing `seo-growth`, `frontend`, `content`, `qa`, `devops` subagents in `.claude/agents/` have permissions for `Bash` + `WebFetch` + `Playwright MCP` (probably yes per their declared capabilities, but lead verifies before spawn).

---

## End of design spec
