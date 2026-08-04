# SEO Audit — estrevia.app — 2026-07-06 → finalized 2026-07-10

**Method:** 6 parallel specialist auditors (live-tech, repo-seo, content-quality, indexation, performance, serp-opportunity) → adversarial verification of every critical/high/medium finding → completeness critic. 47 agents / ~2.5M tokens across two sessions: the 2026-07-06 session hit its usage limit mid-verification; the 9 remaining verifications + the critic re-ran 2026-07-10 against the live site (deployment unchanged since 2026-05-30 — every re-check confirmed the issue still live).
**Data sources:** live curl checks (07-06 + 07-10), repo `main` (prod = 2026-05-30 build `dpl_BUttqr1LDtUCstfsQeo2h5VxgBqr`; `vercel ls` confirms zero deploys since), GSC indexing export, GSC 3-month performance export to 2026-07-04 (214 queries / 296 pages), PageSpeed Insights API v5 + local Lighthouse 13.2.
**Verification integrity:** 30 auditor findings + 6 critic findings; **0 refuted end-to-end** (one half-refuted headline, 3 severities downgraded to low, 2 upgraded in scope). Scope: 100% read-only, no code changed.

---

## HEADLINE

**The site's biggest SEO problem is a code bug, not content: all 56 Minor Arcana tarot pages (112 URLs = 17% of the sitemap) have crashed during server rendering since 2026-04-09 and serve empty ~31-word shells to Google — still broken as of 2026-07-10.** `card.treeOfLifeConnects.join(' ↔ ')` throws on the 56 minors whose Tree-of-Life fields are `null` in `cards.json`. Google sees HTTP 200 + a promising `<title>` + no `<h1>`, no body, no JSON-LD. Humans see the cards (client React recovers), which is why the bug hid for 3 months.

**Critical amendment from the completeness critic: fixing the crash alone won't recover these pages — they are also orphans.** The `/tarot` hub server-renders anchors for only the 22 Majors + `/tarot/spread`; the 56 minors exist solely in a client-side gallery Googlebot won't traverse. 112 URLs are sitemap-only, zero internal links, effective crawl depth ∞. The fix must ship as a pair: **guard the crash + server-render the full 78-card grid on both hubs.**

Two more levers complete the picture: **compatibility pages are 42-word template stubs** (115/156 refused by Google), and **the `/es/` homepage title doesn't say "calculadora"/"gratis"** while the ES calculator cluster (203 impressions @ pos 16.2 — the product conversion path) is the largest striking-distance mass.

Fix order: tarot (crash + links) → compatibility → `/es/` title → the one-line JSON-LD fixes below. Then request recrawl.

---

## Scoreboard

| # | Sev | Finding | Verdict | Fix cost |
|---|-----|---------|---------|----------|
| 1 | **P0** | 56 Minor Arcana pages (112 URLs) crash during SSR since Apr 9 — empty shells to Google | CONFIRMED ×5, still live 07-10 | ~1-line guard |
| 2 | **P0** | …and the same 112 URLs are internal-link orphans (hub anchors = 22 Majors only) | CONFIRMED (critic) | SSR the 78-card grid |
| 3 | **P1** | Compatibility pairs: 42-word stubs, ~25 sentences across 156 URLs; 115/156 zero impressions | CONFIRMED | enrich or noindex |
| 4 | **P1** | ES essays invisible: 4/120 with impressions despite healthy 1,061-word pages | CONFIRMED | internal links + #6 |
| 5 | **P1** | `/es/` homepage title misses calculator cluster (203 impr @ pos 16.2) | CONFIRMED | title/meta edit |
| 6 | **P1** | ES essays' Article JSON-LD `url`/`mainEntityOfPage`/BreadcrumbList all point to EN URLs | CONFIRMED (critic) | locale-aware URL, 1 file |
| 7 | **P1** | Sitewide JSON-LD logo `https://estrevia.app/logo.png` → 404 (never existed) | CONFIRMED (critic) | 1-line: use icon-512 |
| 8 | **P1** | Mobile lab LCP 7.6–10.0s on every page; `/es/` LCP element = the cookie-consent banner | CONFIRMED (Lighthouse) | see §6 |
| 9 | **P1** | Tarot content 26 words/card, zero coverage of query intent (upright/reversed/love/deck names) | CONFIRMED | content (after #1) |
| 10 | **P2** | www→apex redirect is 307 Temporary → www indexed separately, brand dilution | CONFIRMED | Vercel toggle → 308 |
| 11 | **P2** | Essays declare fake dates 2024-01-15 in sitemap lastmod (240 entries) + Article JSON-LD | CONFIRMED | frontmatter fix |
| 12 | **P2** | 356 KiB compressed Clerk JS (6 scripts) on essay/tarot pages; Meta Pixel 248 KiB consent-free everywhere | CONFIRMED (understated) | route-group split |
| 13 | **P2** | Soft-404: unknown essay/tarot slugs return HTTP 200 (with noindex) | CONFIRMED | pre-stream notFound() |
| 14 | **P2** | ES pages leak English tokens (Fire/Cardinal/Moon/Saturn) in body copy | CONFIRMED | i18n display maps |
| 15 | **P2** | Brand "estrevia" pos 3.61 / CTR 0.65% — "Estreva" estradiol-drug collision + www split | CONFIRMED | off-site + #10 |
| 16 | **P2** | Low-CTR pages at good positions (/es/ 1.37% @ 8.4, /es/signs 0% @ 11.1, cities, dates) | CONFIRMED | title/meta pass |
| 17 | **P2** | E-E-A-T: /about and /contact are 404; author = anonymous Organization; sameAs = 1 X account | CONFIRMED (critic) | /about page |
| 18 | **P2** | 3.3× indexing bought only 2.2× impressions at worse positions — stop adding page types | CONFIRMED | strategy |
| 19 | P3 | ES essays lack FAQPage schema (regex misses "## Preguntas Frecuentes"); tarot lacks Article schema | CONFIRMED, downgraded | regex one-liner |
| 20 | P3 | Trailing-slash 200-duplicates (canonical rescues; GSC shows 0 duplicate issues in 7 weeks) | CONFIRMED, downgraded | optional 308 |
| 21 | P3 | Locale-detection 307 for Spanish browsers (Googlebot unaffected — always 200 EN) | CONFIRMED, downgraded | optional |

---

## 1. The story the GSC data tells

- **May 21:** sitemap (670 URLs) submitted. Indexed count 143.
- **Jun 1–8:** Google mass-crawls: 217 → 402 → 508 indexed. Impressions rise 36 → 58/day, but **avg position degrades from ~8–15 to 18–30** — the new pages (tarot, compatibility) enter at positions 40–100.
- **Jun 12:** Google drops exactly 32 pages (508 → 476; not-indexed 313 → 347). **No commit (git log: nothing after May 30) and no deploy (`vercel ls`: newest prod deployment 41 days old) happened in the window** — verified negative. This is Google-side **quality re-evaluation** of what it just crawled: empty tarot shells and 42-word compatibility stubs.
- **Jun 20 – Jul 4:** clicks recover to ~2.9/day (from 0.64 in May) via the healthy cohorts: EN essays (103 pages, 970 impr, wavg pos 7.6, 4.1% CTR), planetary-hours cities (Madrid ES 16.3% CTR, "horas planetarias hoy" pos 8.6 / 71% CTR), sidereal-dates.

**Indexation state (823 known URLs): 476 indexed / 347 not.** Bucket arithmetic verified: 188 "Crawled — currently not indexed" + 153 "Discovered — currently not indexed" + 3 redirect + 1 404 + 1 blocked-4xx + 1 alternate-canonical = 347. Pages.csv cross-check: 294/296 impression rows are sitemap URLs (the 2 strays = www homepage + `/tarot/spread`); ~182 indexed pages have zero impressions. Composition of the not-indexed mass: **116/120 ES essays, 115/156 compatibility pairs, and the crashed tarot minors** — the two structurally defective cohorts (312 URLs) plus authority-starved ES essays account for essentially all of it. The 823 − 670 delta ≈ www-host duplicates + strays.

**Bottom line:** 3.3× more indexed pages bought 2.2× impressions and near-zero clicks. The site has proven it can rank (essays, cities, dates); tarot and compatibility drag crawl-quality signals for everything else. No new programmatic page types until these two cohorts index or are noindexed.

---

## 2. P0 — tarot: one bug, two halves

### 2a. The SSR crash (112 URLs, since 2026-04-09)

`src/app/[locale]/(app)/tarot/[cardId]/page.tsx:239` renders `card.treeOfLifeConnects.join(' ↔ ')` unconditionally; in `content/tarot/cards.json` all 56 minors have `treeOfLifePath` / `treeOfLifeConnects` / `hebrewLetter` / `liber777Column` = `null` (22 Majors have them; the local interface at `page.tsx:32` even types the field as required `number[]`). TypeError during streaming SSR → status 200 already flushed → body never renders. Introduced in commit `4920722` (2026-04-09).

**Live proof (5 independent reproductions, latest 2026-07-10):** `/tarot/two-of-wands` → HTTP 200, **0 `<h1>`, 188 chars of visible text** (nav shell + title), RSC error digest `3201531845`; `/es/tarot/queen-of-cups` → same (205 chars). Control Major `/tarot/the-fool` → 1 `<h1>`, 714 chars, BreadcrumbList JSON-LD. Identical for Googlebot UA. Nuance: the "Something went wrong" error screen is client-side after hydration; the SEO-fatal fact is the empty SSR shell.

**Direct GSC damage:** ES tarot queries are the 2nd-largest non-brand cluster (130 impr: "9 de bastos", "reina de copas"…) at wavg pos 74 with 0 clicks — the ranking pages are precisely the broken minors.

**Fix (~30 min):** guard the correspondences block (`card.treeOfLifeConnects?.join(...) ?? null` or render only for majors) **or** backfill the 4 fields for the minors in `cards.json` (esoterically defensible: minors map to sephiroth, not paths). Deploy → curl-verify card body + "Correspondences" outside `<script>` → GSC recrawl request for `/tarot/*`.

### 2b. The orphan problem (same 112 URLs) — fixing the crash alone is NOT enough

`/tarot` and `/es/tarot` server-render exactly **23 unique card anchors: the 22 Majors + `/tarot/spread`**. Minor-card slugs appear in the hub HTML only inside the RSC `<script>` flight payload (client-side gallery) — 0 crawlable `<a>` tags, and no other page links them. The minors are **sitemap-only URLs with zero internal PageRank**, which Google systematically deprioritizes — consistent with them dominating the not-indexed buckets even where crawled.

**Fix:** server-render the full 78-card grid on both hubs as plain anchors (the interactive gallery can layer on top). Optional: suit hub pages and prev/next links for crawl paths + anchor-text relevance. Ship together with 2a, then request hub reindexing.

---

## 3. P1 — structural levers

### 3a. Compatibility pages: enrich or noindex (156 URLs)

All body text is assembled from ~25 canned sentences (`elementCompatibility()` 12, `modalityCompatibility()` 6, `aspectByDistanceIdx()` 7 — `page.tsx:35-93`). Live `<main>` = 42 visible words; same-element pairs 65% character-identical. Google's verdict is in: **30/78 EN and 11/78 ES pairs have any impressions; whole page type = 1 click / 82 impressions in 3 months.** Technical health verified (200, self-canonical, index-follow) — purely a quality gate.

**Options:** enrich to 300+ unique words per pair (dynamics, love/friendship/work, the sidereal angle, keyword H1 — current H1 is just "Aries × Leo" — FAQ, links to both signs' essays), starting with the 12 same-sign + highest-volume pairs; **or** noindex/drop from sitemap until enriched so 156 thin URLs stop diluting sitewide quality signals.

### 3b. ES essays: invisible for authority + broken structured-data locale (120 URLs)

Content is genuinely good — 120 real translations, avg 761 words, fully server-rendered (1,061 visible words verified). Yet **only 4/120 have a single impression** (vs 103/120 EN). Two causes, both actionable:

1. **Authority/internal linking:** every essay carries only 1 hub link + ≤2 sibling links. Fix: link ES essays from proven ES pages — `/es/` homepage (584 impr, pos 8.4), ES city pages (Madrid 16.3% CTR) — and add a "related placements" block to the essay template (same planet across signs / same sign across planets, 6–8 links).
2. **Cross-locale JSON-LD (critic, new):** on all 120 ES essays the Article `url` + `mainEntityOfPage` **and the entire BreadcrumbList point to EN URLs** — contradicting the page's own (correct) canonical and hreflang. Root cause: `essays/[slug]/page.tsx:90` builds `canonicalUrl` without the locale prefix; breadcrumbs at :108-112 hardcode `SITE_URL`. Bug is essay-route-specific — compat and city ES pages emit correct `/es/` URLs. Fix locale-aware, add a test.

Also consider the Spanish query-form problem: "Venus en Scorpio" can't match "venus en escorpio" searches — sign names stay untranslated per project rules, so put the Spanish variant in the meta description.

### 3c. `/es/` homepage title — the single highest-leverage edit

Current: `Astrología sideral — Carta natal real | Estrevia`. The ES calculator cluster — "carta natal sideral" (72 impr, pos 10.5, 0 clicks), "carta sideral" (66, 12.1), "calcular…"/"…gratis" variants — totals **203 impressions @ wavg pos 16.2 with 3 clicks**, and it's the conversion path. Competitor above ranks with "Calculadora de Carta Natal Sidérea (Gratis)".

**Fix:** `Carta Natal Sideral Gratis — Calculadora Online (Lahiri) | Estrevia` + calculator-promise description. Optionally a dedicated `/es/carta-natal-sideral` landing embedding HeroCalculator. **This is also the Chile+Peru fix** (Chile #1 market: 341 impr @ 8.3, 1.17% CTR; Peru 57 impr @ 9.7, 0 clicks — both dominated by `/es/` rankings).

### 3d. Sitewide JSON-LD logo is a 404 (critic, new)

`src/shared/seo/json-ld.ts:50` (Organization.logo) and `:158` (Article publisher.logo) emit `${SITE_URL}/logo.png` — **which has never existed** (`public/` has no logo.png; live → 404). Blast radius: Organization block on every page + publisher.logo in every Article (240 essays, 156 compat, 40 cities). A 404 logo silently voids Article rich-result / knowledge-panel eligibility. **Fix: point both to `/icons/icon-512.png` (verified 200) — one line.** Then check one page in Rich Results Test post-deploy.

### 3e. Tarot content depth (after 2a+2b)

26 words/card + keyword chips + 5-row table answers none of the observed intent (upright/reversed, "en el amor", Marseille/RWS naming). ES titles already use Spanish card names (good). Post-fix: upright/reversed paragraphs, love/work context, deck-bridge paragraph ("En el Tarot de Marsella / Rider-Waite esta carta se llama X; el Thoth la lee como Y"). Legal-safe: Waite's *Pictorial Key* (1911) + traditional Marseille meanings are public domain (respects Crowley pre-1929 constraint). Cheap first test: retitle ES tarot to `Nueve de Bastos: significado en el tarot (Thoth)`, measure 4 weeks, cap effort.

---

## 4. P2 — confirmed secondary findings

**www → apex is 307 Temporary (should be 308).** Vercel platform-level (no code involved). Google keeps `https://www.estrevia.app/` as a separate Top Page (165 impr, pos 14.78) + 3 "Page with redirect". **Fix: Vercel → Domains → www.estrevia.app → permanent (308).** One click; then re-index request. (HTTP→HTTPS already 308; HSTS preload set.)

**Fake content dates.** All 240 essay files carry `publishedAt`/`updatedAt: "2024-01-15"` — 2.2 years before the repo existed. Emitted into 240 sitemap `<lastmod>` entries and every essay's Article JSON-LD (`datePublished`/`dateModified`). `sitemap-mtime.ts:55-70` prefers frontmatter over git mtime, so the placeholder wins. **Fix: delete the placeholder `updatedAt` lines (git-mtime fallback takes over) or set real dates.** Fake freshness signals are a trust liability, and `changefreq=daily` pages showing a 2024 date is incoherent.

**JS weight on SEO pages (confirmed, actually understated).** Essays/tarot sit in the `(app)` route group → ClerkProvider: an anonymous mobile load of one essay downloads **6 Clerk scripts = 356 KiB compressed / 1.21 MB uncompressed** with zero interaction (`/es/` marketing page: none — the SEO-Phase-2 split works, essays just live on the wrong side). Meta Pixel (248.5 KiB) loads **consent-free on every page** including pure SEO pages — both a perf and a consent-hygiene issue. Fix: move essay/tarot routes out of the Clerk-wrapped group or lazy-mount Clerk on interaction; gate Pixel on consent.

**Mobile LCP (confirmed HIGH via local Lighthouse; keyless PSI was quota-blocked).** `/es/` LCP 7.6s, essay 10.0s under slow-4G simulation (= LATAM mobile audience). Two concrete causes: (1) **the `/es/` LCP element is the cookie-consent banner** — a `'use client'` component mounted after an 800ms `setTimeout`; (2) essay LCP is a text paragraph waiting on 4 preloaded woff2 fonts (155 KiB, Crimson Pro ×3 weights ×2 styles). No CrUX field data exists yet (below threshold), so this is not a ranking factor today — but it's the user experience ads pay for. Fixes: render the banner server-side/immediately (or reserve space and drop the delay), subset/reduce Crimson Pro variants. CLS ≈ 0 and TTFB 20–170 ms are excellent; desktop scores 89.

**Soft-404 on unknown essay/tarot slugs.** HTTP 200 + "not found" UI (with noindex — mitigates). Fix: validate slug pre-stream (`generateMetadata` / `dynamicParams = false`). Compat and city routes already 404 correctly.

**ES pages leak English tokens.** "Elemento **Fire + Fire**", "Modalidad **Cardinal + Fixed**", planet column **Moon/Saturn/Jupiter** on city tables (violates "planet names translated" rule; costs "hora de la luna" relevance on the best ES page type). Fix: display-name maps.

**Brand collision.** "Estreva" (estradiol gel) outranks the site for "estrevia" (DDG: drug pages #1–2, site #3). Don't chase drug-intent impressions; fix www consolidation, add off-site anchors (Product Hunt, Crunchbase, socials), and ship `/about` (below).

**E-E-A-T surface (critic, new).** `/about` and `/contact` → 404 (`/support` exists); Article author = anonymous Organization; `sameAs` = one X account. For a YMYL-adjacent vertical losing its brand SERP to a drug, an About/entity-home page is a real cost. llms.txt names the founder but no crawlable HTML page does. **Fix: `/about` + `/es/about`** (founder, methodology: Swiss Ephemeris, Lahiri, CI-verified accuracy, contact), footer link, reference as Organization anchor.

**CTR pass over pages already ranking.** `/es/` 584 impr / 1.37% @ 8.38 (fixed by 3c), `/es/signs` 87 / 0% @ 11.1, ES `ciudad-de-mexico` 51 / 1.96% @ 6.8, ES `los-angeles` 40 / 0% @ 9.9, `/sidereal-leo-dates` 34 / 0% @ 15.1 (`/terms` 65 / 0% @ 6.3 = brand-SERP filler, leave it). The template converts when the snippet answers the query — Madrid ES 16.3% CTR, EN ciudad-de-mexico 18.2%. Pattern: today's concrete value in the description ("Horas planetarias de hoy en Los Ángeles: tabla de amanecer a amanecer, hora de Venus…"); real date ranges in sidereal-dates descriptions ("Leo sideral: 10 ago – 15 sep").

---

## 5. Re-verification results (the 9 pending findings, checked live 2026-07-10)

| Finding | Verdict | Notes |
|---------|---------|-------|
| Tarot crash "Something went wrong" | **CONFIRMED · critical** | Still live 07-10; error screen is client-side, SSR shell empty — SEO impact identical |
| Mobile lab LCP 7.2–10.2s | **CONFIRMED · high** | Reproduced 7.6s/10.0s via local Lighthouse; `/es/` LCP element = cookie banner; PSI API quota-blocked |
| Unused JS / Clerk on content pages | **CONFIRMED · medium, understated** | 6 Clerk scripts 356 KiB (auditor counted 3/255); + Meta Pixel 248 KiB consent-free sitewide |
| Fake 2024-01-15 dates | **CONFIRMED · medium** | 240 sitemap entries + Article JSON-LD; frontmatter beats git-mtime in `sitemap-mtime.ts` |
| Jun-12 de-index has no code/deploy cause | **CONFIRMED · medium** | git log + `vercel ls`: zero deploys May 30 → Jul 10; drop = exactly −32 |
| Composition of the 347 | **CONFIRMED · medium** | Buckets sum exactly; 116/120 ES essays + 115/156 compat zero-impression |
| Tarot ships zero JSON-LD | **HALF-REFUTED · low** | Majors DO ship BreadcrumbList; zero-JSON-LD on minors is a crash artifact. Real residuals: ES FAQPage regex + no Article schema on tarot |
| Trailing-slash 200-duplicates | **CONFIRMED · low (was medium)** | Canonical fully rescues; GSC shows 1 alternate-canonical page and 0 duplicates in 7 weeks |
| Locale-detection 307 for ES browsers | **CONFIRMED · low (was medium)** | Googlebot (no Accept-Language) always gets 200 EN — no cloak, no crawl impact. Side observation: all pages serve `cache-control: private, no-store` + `x-vercel-cache: MISS` despite `revalidate=86400` — ISR is effectively off (perf topic, not SEO) |

---

## 6. Low-severity items (batch)

| Item | Fix |
|------|-----|
| hreflang uses `en-US` instead of `en` (head + sitemap, 670×) | 2 lines: `metadata.ts:138`, `sitemap.ts:67` |
| ES essays FAQPage regex | `/^##\s+(FAQ|Preguntas Frecuentes)/im`; also stop answers at `---`/blockquote — last FAQ answer currently leaks raw markdown + disclaimer |
| Article JSON-LD omits `image` everywhere | pass the existing per-essay OG image (`/api/og/essay/*` → 200) as `Article.image` in `json-ld.ts` |
| Tarot pages lack Article/WebPage schema (1 block vs 2–3 elsewhere) | add after crash fix |
| Compat/cities sitemap lastmod = `new Date()` at build (5 weeks stale vs `changefreq=daily`) | extend `sitemap-mtime.ts` RouteType |
| next-intl `Link` header says `hreflang="en"` vs HTML `en-US` | `alternateLinks: false` or align codes |
| Title truncation appends `…` mid-word and strips `| Estrevia` on all 24 sidereal-dates pages | shorten source titles; word-boundary truncate |
| robots.txt has two `User-Agent: *` groups | merge in `robots.ts` |
| `/support` + `/tarot/spread` indexable but absent from sitemap (spread already has impressions @ pos 2) | add or noindex |
| Trailing-slash + uppercase variants 200 (canonicals correct) | optional middleware 308 |
| React prop leak `node="[object Object]"` on essay `<p>` tags | destructure `{node, ...props}` in MDX map |
| Essay-to-essay links: only 2 sibling links per essay | "related placements" block (see 3b) |
| No CrUX field data; desktop-vs-mobile position gap is query-mix, not perf (desktop Lighthouse 89) | re-check quarterly |

---

## 7. What is healthy (verified — don't touch)

- **Sitemap:** exactly 670 URLs matching code inventory; absolute non-www; full hreflang trios **including self-reference** (the common Next.js omission does NOT occur).
- **Canonicals:** correct per locale everywhere sampled; ES self-canonicalizes to `/es/…`.
- **robots.txt** sane; no noindex leakage; no auth-gating on any sitemap page type.
- **ES essays are real translations** (avg 761 words); essay paywall truncation is CSS-only — Googlebot sees full text.
- **Homepage JSON-LD rich:** Organization, WebSite, SoftwareApplication, FAQPage, HowTo.
- **OG/social tags complete and correct** on all sampled pages (og:locale en_US/es_MX + alternates, per-essay dynamic 1200×630 og:image) — never audited before, critic confirmed healthy.
- **AEO readiness better than any auditor recorded:** `llms.txt` exists and is well-formed (site summary, public API + OpenAPI, both locale Atom feeds, citation policy, license split, contact).
- **Performance fundamentals:** TTFB 20–170 ms, CLS ≈ 0, desktop Lighthouse 89, HTTP→HTTPS 308 + HSTS preload.
- **Winners to replicate:** "horas planetarias hoy" pos 8.6 / **71% CTR**; Madrid ES **16.3% CTR**; EN essays cluster wavg pos 7.6 / 4.1% CTR.

---

## 8. Action plan

### Wave 1 — this week (~1–1.5 days, unblocks everything)
1. **Tarot crash guard** (`page.tsx:239` + neighbors) **+ SSR 78-card grid on `/tarot` hubs** → deploy → curl-verify → GSC recrawl `/tarot/*` + hubs. *(P0, 112 URLs)*
2. **`json-ld.ts` logo 404 fix** → `/icons/icon-512.png`. *(1 line, sitewide)*
3. **ES essay JSON-LD locale fix** (`essays/[slug]/page.tsx:90` + breadcrumbs :108-112) + test. *(120 URLs)*
4. **Vercel Domains: www → 308 permanent** + GSC re-index. *(1 click)*
5. **`/es/` homepage title/meta** → calculator language. *(~500 ES impressions' CTR)*
6. **FAQ regex bilingual** + answer-boundary fix; **hreflang `en-US`→`en`** while in there.

### Wave 2 — next 2–4 weeks
7. **Compatibility decision:** enrich top-12 pairs (300+ words, keyword H1, FAQ, sign-essay links) or noindex the cohort.
8. **CTR pass:** Madrid-style descriptions → los-angeles / ciudad-de-mexico / toronto / lima / santiago; date ranges into sidereal-dates; `/es/signs` title.
9. **ES internal linking:** `/es/` home + city pages → ES essays; "related placements" block in essay template.
10. **Localize planet/element/modality tokens** on ES compat + city tables.
11. **Real content dates** (drop 2024-01-15 placeholders) + `Article.image`.
12. **Soft-404 fix** (pre-stream slug validation).
13. **`/about` + `/es/about`** (founder, methodology, contact) + footer link + Organization anchor.
14. **Perf pair:** cookie-banner LCP fix (no 800ms client delay) + Clerk out of essay/tarot routes; gate Meta Pixel on consent.

### Backlog (only after the above index and move)
15. Per-planet "Hora de X hoy" pages (7 × 2 locales — proven 16–71% CTR cluster).
16. `/es/synastry` informational section + FAQPage (173 impr @ pos 28 waiting; "que es sinastria" already pos 10.5).
17. Tarot deck-bridge paragraphs + ES retitle test (4-week measurement, capped).
18. Tarot content depth (public-domain Waite/Marseille sources).
19. Off-site brand anchors vs Estreva-drug SERP.

### Measurement
- GSC page-indexing at +2/+4 weeks per wave: "Crawled — currently not indexed" (188) should fall as tarot/compat resolve; indexed count vs 476 baseline.
- Clusters: ES calculator CTR (203 impr @ 16.2 baseline), tarot-ES position (74), brand pos (3.61), ES essays with impressions (4/120).
- Rich Results Test one essay EN + ES after Wave 1 (logo, Article url, FAQPage, image).
- No new programmatic page types until both defective cohorts index or are noindexed.

---

*Appendix — provenance: 2026-07-06 session (37 agents) produced 30 findings, 21 verified same-day; session hit usage limit before 9 verifications + critic. 2026-07-10 continuation (10 agents) recovered the persisted workflow result, re-verified all 9 against the live site (deployment unchanged), and ran the completeness critic (6 new findings, 3 material). GSC CSVs recovered from the 07-06 session transcript after macOS revoked Downloads access; copies in session scratchpad `gsc/`. Full machine-readable results: session workflow states `wf_3fbf04b4-8d1.json` (07-06) and `wf_978a27f4-71b.json` (07-10).*
