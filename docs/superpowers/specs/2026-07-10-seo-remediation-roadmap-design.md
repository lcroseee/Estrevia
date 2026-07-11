# SEO Remediation Roadmap — Design

**Status:** Approved design — not yet implemented
**Date:** 2026-07-10
**Source:** `outputs/seo-audit-2026-07-06/REPORT.md` (47-agent audit, finalized 2026-07-10; 30 auditor + 6 critic findings, 0 refuted end-to-end)
**Scope:** Single source-of-truth roadmap for the full SEO remediation. Phased: Wave 1 (Phase 1) specced to implementation-readiness; Wave 2 (Phase 2) at design level; backlog (Phase 3) captured with explicit unlock triggers.

**Baseline reality (verified in-session):**
- Prod = 2026-05-30 build `dpl_BUttqr1LDtUCstfsQeo2h5VxgBqr`; **zero deploys since** (`vercel ls`). Every audit finding re-checked live 2026-07-10 — all still live.
- Crash confirmed at `src/app/[locale]/(app)/tarot/[cardId]/page.tsx:239`; logo 404 at `src/shared/seo/json-ld.ts:50` + `:158`; ES-essay JSON-LD locale bug at `src/app/[locale]/(app)/essays/[slug]/page.tsx:90` + `:107–113`; hreflang `en-US` at `src/shared/seo/metadata.ts:137–138`; `/es/` home title at `messages/es.json:395`; compatibility routes at `src/app/[locale]/(marketing)/compatibility/`.

---

## 1. The organizing principle — a crawl-quality gate

The audit's central thesis is **not** "fix 21 things." It is: *3.3× more indexed pages bought only 2.2× impressions at worse positions, because two structurally-defective cohorts — 112 broken tarot URLs + 156 thin compatibility URLs (= 312 pages, ~38% of the sitemap) — are dragging crawl-quality signals for the healthy pages.* Google's Jun-12 de-index of exactly 32 pages happened with **no commit and no deploy** in the window — a Google-side quality re-evaluation of what it had just crawled.

So this roadmap is organized around one rule, not a flat checklist:

> **Every change must either (a) remove broken/thin URLs from Google's view, (b) emit correct signals for what remains, or (c) strengthen an already-proven cohort. No new programmatic page types are added until both defective cohorts either index or are noindexed and the "Crawled — currently not indexed" bucket falls.**

That gate is what sequences the work and what defers Phase 3.

## 2. Success metrics & baselines

Measured per wave at **+2 weeks / +4 weeks** post-deploy, from GSC:

| Metric | Baseline (2026-07-04) | Target direction |
|--------|----------------------|------------------|
| Indexed URLs | 476 | ↑ |
| "Crawled — currently not indexed" | 188 | ↓ (as tarot/compat resolve) |
| ES-calculator cluster CTR | 203 impr @ pos 16.2, 3 clicks | ↑ CTR + ↑ position |
| Tarot-ES cluster position | wavg pos 74, 0 clicks | ↑ (into rankable range) |
| ES essays with ≥1 impression | 4 / 120 | ↑ |
| Brand "estrevia" position | pos 3.61 / CTR 0.65% | ↑ (vs "Estreva" drug + www split) |

**Gate check (blocks Phase 3):** no new programmatic page types until both defective cohorts index-or-noindex and #2 ("Crawled — not indexed") is trending down.

---

## 3. Phase 1 — Recrawl Unblock *(Wave 1, ~1–1.5 days, implementation-ready)*

Goal: make the site worth recrawling, then request it. Tasks T1–T6 are code; O1–O3 are founder-owned ops run after deploy.

### T1 — Tarot P0 pair (crash guard + SSR 78-card grid) · P0, 112 URLs
Ships as **one unit** — fixing the crash without the grid leaves the pages as link-orphans (see audit §2b).

**T1a — Crash guard** — `src/app/[locale]/(app)/tarot/[cardId]/page.tsx`
- `:239` `card.treeOfLifeConnects.join(' ↔ ')` throws (TypeError) on all 56 minors, whose `treeOfLifePath` / `treeOfLifeConnects` / `hebrewLetter` / `liber777Column` are `null` in `content/tarot/cards.json`. Status 200 is already flushed → empty SSR shell to Google.
- **Fix:** build the Correspondences rows array **conditionally** — always render the `astrology` row (minors have it); push the `hebrewLetter` / `treeOfLifePath` / `connects` / `liber777Column` rows **only when non-null**. Minors render a valid, shorter Correspondences block; Majors unchanged.
- **Fix the type lie** at `:20–35`: `treeOfLifePath: number` → `number | null`, `treeOfLifeConnects: number[]` → `number[] | null`, `hebrewLetter` / `liber777Column` → `… | null`. The interface currently *guarantees* fields that are `null` in the data — that is exactly what let the crash type-check and pass tests for 3 months.

**T1b — SSR 78-card grid** — `src/app/[locale]/(app)/tarot/page.tsx` (serves `/tarot` and `/es/tarot`)
- Today `<TarotCatalogClient cards={cards} />` (`:87`) is a **client** component; crawlable minor-card anchors are absent from the initial SSR HTML (only in the RSC flight payload). The 56 minors are sitemap-only, zero internal PageRank.
- **Fix:** add a **server-rendered grid of all 78 cards as plain `Link` anchors** (localized names via `getCardName`), grouped by arcana/suit for anchor-text relevance. `TarotCatalogClient` layers on top for interactivity; the anchors are the always-present crawl base.

**Tests:** minor card (`two-of-wands`, `queen-of-cups`) renders without throwing and contains its name + astrology; hub renders 78 crawlable `<a>` anchors server-side, both locales.
**Exit:** curl `/tarot/two-of-wands` + `/es/tarot/queen-of-cups` → `<h1>` + body + Correspondences **outside `<script>`**; curl `/tarot` + `/es/tarot` → 78 crawlable `href`s.

### T2 — Compatibility noindex + sitemap drop · P1, 156 URLs
**Decision:** noindex now, enrich top pairs later (see §6, Decision 1).
- `src/app/[locale]/(marketing)/compatibility/[pair]/page.tsx` `generateMetadata` → add `robots: { index: false, follow: true }` (`follow` so any equity still flows). Pages stay **live** for UX; they leave the index only.
- `src/app/sitemap.ts` → stop emitting the 156 pair URLs.
- **Sub-decision (approved):** noindex the 156 *pair* pages only; **keep the 2 `/compatibility` hub pages indexed** (a directory, not a thin duplicate).

**Tests:** metadata test → a pair has `robots.index === false`; sitemap test → 0 `/compatibility/<pair>` entries (existing sitemap count assertion drops by 156).
**Exit:** curl a pair → `<meta name="robots" content="noindex">`; `sitemap.xml` has zero compatibility-pair URLs.

### T3 — Logo 404 → icon-512 · P1, sitewide (1 line ×2)
- `src/shared/seo/json-ld.ts:50` (`organizationSchema` logo) + `:158` (`articleSchema` publisher.logo): `${SITE_URL}/logo.png` (never existed → 404) → `${SITE_URL}/icons/icon-512.png` (verified 200; dims already 512). Blast radius: Organization block on every page + publisher.logo in every Article (240 essays, 156 compat, 40 cities).

**Test:** json-ld unit test asserts both logo URLs end `/icons/icon-512.png`.
**Exit:** Rich Results Test resolves the logo (part of O2).

### T4 — ES essay JSON-LD locale fix · P1, 120 URLs
- `src/app/[locale]/(app)/essays/[slug]/page.tsx:90`: `canonicalUrl` is built without a locale prefix, feeding `articleSchema.url` (`:95`) and all three breadcrumb URLs (`:107–113`) — every one hardcoded to the EN host, contradicting the page's own (correct) canonical + hreflang.
- **Fix:** locale-aware base — `const basePath = locale === 'es' ? '/es' : '';` → `canonicalUrl = ${SITE_URL}${basePath}/essays/${slug}`; apply the same prefix to the breadcrumb Home + sign URLs (and `mainEntityOfPage` if present). Bug is essay-route-specific (compat + city ES pages already emit correct `/es/` URLs).

**Test (new, per audit):** ES essay → `articleSchema.url` + all breadcrumb URLs start with `${SITE_URL}/es/`; EN unchanged.
**Exit:** curl `/es/essays/<slug>` → Article `url` + breadcrumb all `/es/`.

### T5 — `/es/` homepage title → calculator language · P1, ~203 ES impressions
- `messages/es.json` `pageMeta` home `title` (`:395` `"Astrología sideral — Carta natal real"`; `| Estrevia` appended by the title template) → **`Carta Natal Sideral Gratis — Calculadora Online (Lahiri)`** + a calculator-promise description. Confirm the exact key path in the plan; leave the second title at `:419` (calculator route) untouched. This is also the Chile (#1 market, 341 impr) + Peru fix — both dominated by `/es/` rankings.

**Exit:** curl `/es/` `<title>` contains "Carta Natal Sideral Gratis".

### T6 — FAQ regex bilingual + hreflang `en-US`→`en` · P1 / batch
- `src/app/[locale]/(app)/essays/[slug]/page.tsx:144`: `extractFaqItems` regex `/^##\s+FAQ/im` → `/^##\s+(FAQ|Preguntas Frecuentes)/im`; stop answers at `---`/blockquote so the last FAQ answer stops leaking raw markdown + disclaimer.
- `src/shared/seo/metadata.ts:137–138`: `hreflangLanguages` key `'en-US'` → `'en'`; mirror in `src/app/sitemap.ts` (`:67`); align the next-intl `Link` header (`alternateLinks: false` or matching codes).

**Tests:** ES essay with `## Preguntas Frecuentes` emits FAQPage; hreflang map keyed `en` not `en-US`.
**Exit:** curl ES FAQ essay → FAQPage JSON-LD present; `<head>` `hreflang="en"`.

### Founder-owned ops (non-code, after deploy)
- **O1 — www → 308:** Vercel → Domains → `www.estrevia.app` → permanent (currently 307 Temporary → www indexed separately). One toggle.
- **O2 — Rich Results Test:** one EN + one ES essay (logo resolves, Article `url` correct, FAQPage valid).
- **O3 — GSC recrawl request:** `/tarot/*` + both hubs, after the curl-verify suite passes.

### Phase 1 exit gate
`npm test` + `npm run typecheck` + `npm run lint` green → resolve deploy-isolation risk (§7) → deploy → **curl-verify suite** (tarot bodies present outside `<script>`, 78 anchors crawlable, compat noindex, `/es/` title, ES-essay `/es/` JSON-LD) → O1 → O2 → O3.

---

## 4. Phase 2 — Consolidate & Deepen *(2–4 weeks, design-level)*

Sequenced **after** Phase 1 indexes — strengthening surfaces Google now trusts.

- **T7 — Compatibility enrichment (top-12 pairs).** The "enrich-later" half of Decision 1. Enrich the 12 highest-intent pairs to 300+ unique words (dynamics; love/friendship/work; the sidereal angle; keyword `<h1>` replacing the bare "Aries × Leo"; FAQ; links to both signs' essays) → remove their `noindex` + re-add those 24 URLs (×2 locales) to the sitemap. Everything else stays noindexed.
- **T8 — CTR/description pass.** Madrid-pattern (concrete-today-value) descriptions for `los-angeles` / `ciudad-de-mexico` / `toronto` / `lima` / `santiago`; real date ranges into the 24 sidereal-dates descriptions ("Leo sideral: 10 ago – 15 sep"); `/es/signs` title. Folds in the batch fix for mid-word `…` title truncation on sidereal-dates pages.
- **T9 — ES internal linking.** Link ES essays from proven ES pages (`/es/` home @ pos 8.4; ES city pages) + a **"related placements" block** in the essay template (6–8 links: same planet across signs / same sign across planets). Directly attacks the 4/120-with-impressions problem (the other half of finding #4).
- **T10 — Token localization.** Display-name maps for planet/element/modality on ES compat + city tables (Fire→Fuego, Cardinal, Moon→Luna, Saturn→Saturno). Respects project rules: **planet names translated, sign names untranslated.** Recovers "hora de la luna" relevance on the best ES page type. Also: put the Spanish sign-name variant ("venus en escorpio") in the ES essay meta description, since sign names stay untranslated in the body.
- **T11 — Real content dates + `Article.image` + sitemap lastmod.** Drop the fake `2024-01-15` `updatedAt` placeholders across 240 essay files (git-mtime fallback in `sitemap-mtime.ts:55–70` takes over) or set real dates; pass the existing per-essay OG image (`/api/og/essay/*` → 200) as `Article.image` in `json-ld.ts`; extend `sitemap-mtime.ts` RouteType so compat/cities lastmod isn't `new Date()` at build. *(Touches `content/` frontmatter dates only — not essay prose.)*
- **T12 — Soft-404 guard.** Pre-stream slug validation for unknown essay/tarot slugs (`generateMetadata` `notFound()` or `dynamicParams = false`) so they 404 instead of 200 + noindex. (Compat + city routes already 404 correctly.)
- **T13 — `/about` + `/es/about`** *(Decision 3: founder-authored).* Founder named + methodology (Swiss Ephemeris, Lahiri, CI-verified ±0.01°) + contact; footer link; register as Organization anchor; **upgrade Article `author` from anonymous Organization → `Person`.** ⚠️ **Reverses** the 2026-05-03 founder call *"авторство не нужно"* (see `2026-05-03-seo-aeo-basics-design.md` §Dropped). Rationale for reversal: the brand SERP is now being lost to the "Estreva" estradiol drug (audit #17), making an entity-home + named human author a real E-E-A-T cost. Founder re-review point.
- **T14 — Perf (banner + Pixel + fonts only).** Render the cookie-consent banner server-side/immediately (drop the 800ms `setTimeout`, or reserve space) to fix the `/es/` LCP element (7.6s); gate Meta Pixel (248 KiB, currently consent-free sitewide) on consent — fixes both perf and consent-hygiene; subset/reduce Crimson Pro variants (4 preloaded woff2, 155 KiB) behind the essay LCP (10.0s). **Excludes the Clerk route-group move** (deferred, §5).
- **Batch cleanups** (cheap, fold in here): merge robots.txt's two `User-Agent: *` groups (`robots.ts`); add `/support` + `/tarot/spread` to the sitemap (spread already ranks @ pos 2); fix the `node="[object Object]"` prop leak on essay `<p>` tags (destructure `{node, ...props}` in the MDX component map).

---

## 5. Phase 3 — Backlog *(gated)*

**Unlock trigger (all new-page-type items):** both defective cohorts have index-or-noindexed **and** GSC "Crawled — currently not indexed" (188 baseline) is falling. This is the §1 crawl-quality gate made operational.

- **T15 — Per-planet "Hora de X hoy" pages** (7 planets × 2 locales) — replicates the proven planetary-hours cluster ("horas planetarias hoy" pos 8.6 / 71% CTR; Madrid ES 16.3% CTR). *Gated on the new-page-type rule.*
- **T16 — `/es/synastry` informational section + FAQPage** (173 impr @ pos 28 waiting; "que es sinastria" already pos 10.5).
- **T17 — Tarot deck-bridge + ES retitle test.** Public-domain "En el Tarot de Marsella / Rider-Waite esta carta se llama X…" paragraph; retitle ES tarot ("Nueve de Bastos: significado en el tarot (Thoth)"); 4-week capped measurement.
- **T18 — Tarot content depth + correct minor 777 data.** Where Decision 2 ("correct-minor-data-later") lands: founder authors the esoterically-correct minor correspondences — **sephirah + world for the 40 pips, element-of-element for the 16 courts** (minors map to sephiroth, not paths — hence they were `null`, not broken data) — plus upright/reversed + love/work content. Sources: Waite *Pictorial Key to the Tarot* (1911) + traditional Marseille, both public-domain (respects the Crowley pre-1929 constraint; **do not** use Thoth 1944 / Harris images).
- **T19 — Off-site brand anchors** vs the "Estreva" (estradiol) SERP collision (Product Hunt, Crunchbase, socials). Founder-owned marketing.

**Deferred to its own spec — Clerk route-group move.** Relocate essays/tarot out of the `(app)` route group (removing the 356 KiB / 6-script ClerkProvider load from anonymous SEO pages) or lazy-mount Clerk on interaction. High auth blast radius: `useUser`/`useAuth` only work inside `(app)` (see memory `feedback_clerk_provider_scope`), so relocation can silently break auth-dependent components. Referenced here; specced + tested separately.

---

## 6. Decisions log

1. **Compatibility → noindex now, enrich top pairs later.** 156 pairs `noindex` + dropped from sitemap in Phase 1 (T2); top-12 enriched + re-indexed in Phase 2 (T7). Stops crawl-quality dilution immediately; preserves upside on the ~40 pairs that get impressions.
2. **Tarot crash → guard now, correct minor data later.** T1 guard renders minors with a shorter (correct) Correspondences block; the esoterically-correct minor 777 data (sephirah/world, element-of-element) is founder-authored content in T18. A literal backfill of the majors' path/Hebrew-letter fields onto minors would be esoterically wrong.
3. **`/about` → founder-authored methodology page** + Article author Organization→Person (T13). Reverses the 2026-05-03 "авторство не нужно" call; rationale = brand-SERP erosion (audit #17). Founder re-review point.
4. **Perf pair → cookie-banner LCP + Pixel-consent + font subset in-roadmap (T14); Clerk route-group move deferred to its own spec** (§5) due to auth blast radius.

## 7. Cross-cutting

### Testing strategy
The audit's core lesson **is** a testing lesson: the crash type-checked and passed unit tests for 3 months because client React recovered — the SSR shell was empty and no unit test looked at server-rendered HTML. Therefore, for anything touching server render:
- **Unit tests (vitest, existing patterns):** minor-card renders without throw; hub emits 78 anchors; JSON-LD locale/logo/FAQ; sitemap counts; metadata `robots`.
- **Integration gate — curl-verify suite (mandatory, not optional):** assert the SSR body is present **outside `<script>`**, anchors are crawlable, and `noindex` is present, run against the deploy. Unit tests alone cannot catch an empty-SSR-shell regression.
- Zero-fail policy on the changed paths per CLAUDE.md.

### Measurement & rollout
Per-wave GSC page-indexing at +2wk / +4wk against the §2 baselines; Rich Results Test one EN + one ES essay after Wave 1. The §1 gate holds: **no new programmatic page types until both cohorts resolve.**

### ⚠️ Deploy-isolation risk (operational — resolve before Phase 1 deploy)
This would be the **first prod deploy since 2026-05-30 (41 days).** `main` carries accumulated unpushed work — the HALF50 discount blast, the anon-payer sign-in fix, migrations 0013–0018 — and the working tree has uncommitted changes + untracked scripts + `.env.meta.bak`. **The SEO deploy is not isolated: it ships everything currently on `main`.** Phase 1 must begin by reconciling working-tree/branch state and confirming exactly what a deploy would push — especially the gated HALF50 send path and any pending DB migrations (per memory `feedback_email_postal_address_gate`, `COMPANY_POSTAL_ADDRESS` must be set in Vercel prod before any marketing email renders). This is founder-owned and blocks the deploy step, not the code.

### Out of scope (this roadmap)
- Clerk route-group move — separate spec (§5).
- `content/` essay **prose** — proprietary; only frontmatter dates (T11) + linking blocks (T9) are touched.
- The `cache-control: private, no-store` / ISR-effectively-off observation — perf topic, not SEO; noted, not fixed.
- Off-site brand anchors (T19) — founder-owned marketing, not code.

## 8. Founder-owned checklist (spans phases)
- [ ] Reconcile `main` working-tree/branch state; confirm deploy payload (§7) — **blocks Phase 1 deploy**
- [ ] O1 — Vercel www → 308 permanent
- [ ] O2 — Rich Results Test (1 EN + 1 ES essay)
- [ ] O3 — GSC recrawl request `/tarot/*` + hubs
- [ ] T13 re-review — confirm reversing "авторство не нужно" (Person schema + named About page)
- [ ] T18 — author correct minor 777 correspondences (Phase 3)
- [ ] T19 — off-site brand anchors (Phase 3)
