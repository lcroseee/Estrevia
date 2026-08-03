# SEO Audit — estrevia.app

## 1. Header

| | |
|---|---|
| **Site** | https://estrevia.app (EN root + `/es/`, Next.js 16 App Router, Vercel) |
| **Data window** | 2026-05-21 .. 2026-07-31 (72 days), Search type = Web |
| **Totals (verified)** | 126 clicks / 5,672 impressions / CTR 2.221% / impression-weighted position 14.43 |
| **Export** | `/Users/kirillkovalenko/Downloads/estrevia-3/` (Chart, Countries, Devices, Pages, Queries, Search appearance, Filters) |
| **Repo state** | HEAD = origin/main = `60d3377`, 2026-07-11 15:16 -0400. Zero commits since. |
| **Audit date** | 2026-08-02 (live checks 2026-08-02 / 2026-08-03 UTC) |
| **Method** | 13 parallel investigators, 4 finding generators, 16 adversarial verification passes. Every finding below was attacked by a verifier instructed to refute it. |

Reconciliation note used throughout: `Chart.csv`, `Devices.csv` and `Countries.csv` each sum to exactly **126 / 5,672**. `Pages.csv` sums to **126 / 6,511** — the +839 impression excess (+14.8%) is normal GSC page-vs-property dedup (one SERP showing two of your URLs logs two page impressions, one property impression). Percentages computed against 6,511 are labelled "page-dimension". `Queries.csv` covers only **24 clicks / 2,007 impressions** — 81% of clicks and 65% of impressions are query-anonymized, so every query-level number is a **floor**, not a census.

---

## 2. Executive summary

**The defining fact: sixteen adversarial verification passes downgraded every single finding. Not one P0 and not one P1 survived contact with the evidence.** The audit generated eleven P0/P1 claims; verification reduced all of them to P2 or P3, usually because the mechanism was real but the traffic at stake was one to twenty clicks per quarter on a property that earns **1.75 organic clicks per day**.

**Diagnosis in one sentence: estrevia.app does not have an SEO defect problem, it has a demand-capture problem — the 2026-07-11 remediation already closed the genuine blockers, and what remains is a long list of cheap correctness bugs whose combined measured cost is smaller than the noise in a 126-click sample.**

Five things that matter:

1. **The July fix worked, and it bought impressions, not clicks.** Pre-2026-07-11: 66.6 impressions/day, 2.56% CTR, weighted position 15.50. Post: 108.4 impressions/day (+63%), 1.71% CTR, weighted position 12.83. Clicks/day moved 1.71 to 1.86 (+8.8%). CTR fell because the denominator grew, not because snippets regressed. Do not treat site-wide CTR% as a KPI.
2. **One template earns nearly half the site.** EN `/essays/*` = 108 URLs, 1,470 impressions, **59 of 126 clicks (46.8%)** at 4.01% CTR, weighted position 8.51. Its Spanish twin — same 120-essay corpus, ~15% longer bodies — earns **33 impressions and 0 clicks**. That 44x gap is the largest unexploited asset on the property.
3. **The second-best template is orphaned by a one-line bug.** ES `/planetary-hours-cities/*` converts at **4.37% CTR (16 of 126 clicks)** with zero internal inbound links, because `planetary-hours-cities/page.tsx:2` imports `next/link` instead of the locale-aware Link and emits 20 English hrefs on the Spanish hub. One import swap. (Not independently verified — see section 4.5.)
4. **Zero rich results is the correct output, not a bug.** `Search appearance.csv` is header-only. Every schema type the site emits is either not a GSC search-appearance dimension (BreadcrumbList, Article, Organization) or was retired by Google in 2023 (FAQ restricted to gov/health, HowTo removed). Stop investigating it.
5. **`buildTitle()` amputates the brand on 179 of 518 sitemap URLs**, 114 of which literally render `|…`, including `/es/` — the site's biggest page at 1,487 impressions. A position-matched test shows **no measurable CTR penalty** (truncated group 2.74% at weighted position 7.32 vs clean group 2.71% at 7.30), so fix it because it is objectively broken output, not for traffic.

The honest strategic read: there is no technical lever here worth more than about 10 clicks a quarter. The leverage is content and market selection — the ES essay corpus, the ES cities template, and stopping work on tarot.

---

## 3. The numbers

### 2.1 Traffic by 7-day bucket (Chart.csv, 72 rows)

| Week | Clicks | Impressions | CTR | Weighted pos |
|---|---|---|---|---|
| 1 (05-21) | 6 | 178 | 3.37% | 12.58 |
| 2 | 12 | 330 | 3.64% | 8.69 |
| 3 | 7 | 376 | 1.86% | 14.05 |
| 4 | 8 | 567 | 1.41% | 22.21 |
| 5 | 19 | 529 | 3.59% | 18.10 |
| 6 | 20 | 571 | 3.50% | 13.09 |
| 7 | 11 | 716 | 1.54% | 14.96 |
| 8 | 11 | 598 | 1.84% | 13.60 |
| 9 | 16 | 816 | 1.96% | 12.07 |
| 10 | 12 | 795 | 1.51% | 12.66 |
| 11 (2 days) | 4 | 196 | 2.04% | 15.44 |

OLS over the 72 daily rows: impressions **+1.2478/day** (r2=0.710, t=+13.10, fitted 34.5 to 123.1 = 3.57x). Clicks **+0.0133/day** (r2=0.042, t=+1.75 — **not significant**). Linear position slope +0.0027/day, r2=0.000 — but that means a line is the wrong model, not that position is flat; weighted position by ISO week ranges 10.36 (wk27) to 21.07 (wk25).

### 2.2 Pre vs post the 2026-07-11 remediation

| | PRE (05-21..07-10, 51d) | POST (07-11..07-31, 21d) | Delta |
|---|---|---|---|
| Clicks | 87 | 39 | — |
| Impressions | 3,395 | 2,277 | — |
| Clicks/day | 1.71 | 1.86 | **+8.8%** |
| Impressions/day | 66.6 | 108.4 | **+62.8%** |
| CTR | 2.56% | 1.71% | **-33%** |
| Weighted position | 15.50 | 12.83 | **-2.67 (better)** |

Two-proportion z on the CTR drop = -2.129 (p~0.033). Poisson check: 35.8 post clicks expected at the pre rate, 39 observed — **clicks did not fall in absolute terms**. Also note the impression ramp is **not** a step change at 07-11: pre-only OLS on impressions gives +1.4399/day (r2=0.635, t=9.24) while post-only gives +0.6208/day (r2=0.049, t=0.99, not significant). The expansion completed *before* the deploy and plateaued after. Do not credit the 49 SEO commits with the impression growth.

### 2.3 Performance by template group (Pages.csv, page-dimension)

| Group | URLs | Clicks | Impr | CTR | Weighted pos |
|---|---|---|---|---|---|
| ES home `/es/` | 1 | 19 | 1,487 | 1.28% | 8.68 |
| **EN `/essays/*`** | 108 | **59** | 1,470 | **4.01%** | 8.51 |
| ES other (incl. `/es/synastry` 554) | 8 | 2 | 935 | 0.21% | 22.93 |
| EN other | 10 | 1 | 370 | 0.27% | 10.20 |
| **ES `/planetary-hours-cities/*`** | 15 | **16** | 366 | **4.37%** | 15.85 |
| EN home `/` | 1 | 4 | 338 | 1.18% | 14.64 |
| ES `/tarot/*` | 55 | 6 | 326 | 1.84% | 38.28 |
| EN `/planetary-hours-cities/*` | 18 | 5 | 252 | 1.98% | 9.00 |
| EN `/signs/*` | 8 | 2 | 192 | 1.04% | 7.05 |
| www homepage (duplicate host) | 1 | 2 | 165 | 1.21% | 14.78 |
| EN `/sidereal-*-dates` | 11 | 3 | 148 | 2.03% | 9.95 |
| ES `/sidereal-*-dates` | 12 | 1 | 137 | 0.73% | 7.83 |
| ES `/signs/*` | 10 | 4 | 125 | 3.20% | 6.28 |
| EN `/compatibility/*` | 35 | 2 | 81 | 2.47% | 26.26 |
| EN `/tarot/*` | 27 | **0** | 58 | 0.00% | 51.38 |
| **ES `/essays/*`** | 13 | **0** | 33 | 0.00% | 7.54 |
| ES `/compatibility/*` | 14 | 0 | 28 | 0.00% | 61.68 |

Two templates (EN essays + ES cities) produce **75 of 126 clicks = 59.5%** from 123 URLs. Tarot is **160 of 518 sitemap URLs (30.9%)** and produces 6 clicks (4.8%).

### 2.4 EN vs ES

| | URLs | Clicks | Impr | CTR | Weighted pos |
|---|---|---|---|---|---|
| EN | 219 | 78 (61.9%) | 3,074 | 2.54% | 11.02 |
| ES | 128 | 48 (38.1%) | 3,437 | 1.40% | 16.43 |

ES draws **more** impressions than EN and converts them at 55% of the EN rate.

### 2.5 Geo blocks (Countries.csv, sums to 126 / 5,672)

| Block | Clicks | Impr | % impr | CTR | Weighted pos |
|---|---|---|---|---|---|
| LATAM (19 countries) | 30 | 2,078 | 36.6% | 1.44% | 12.38 |
| US + CA | 34 | 1,312 | 23.1% | 2.59% | 13.10 |
| APAC (26) | 16 | 726 | 12.8% | 2.20% | 13.34 |
| Spain | 18 | 693 | 12.2% | 2.60% | 24.79 |
| EU other (40) | 18 | 639 | 11.3% | 2.82% | 13.36 |
| Other (35) | 9 | 175 | 3.1% | 5.14% | 14.65 |
| Brazil | 1 | 49 | 0.9% | 2.04% | 19.02 |

Spanish-speaking markets combined: **48 clicks / 2,771 impressions = 48.9% of impressions, 38.1% of clicks**. Notable outlier: **Chile 5 clicks / 656 impressions / 0.76% CTR at position 6.22** — see [P3-1].

### 2.6 Device

| Device | Clicks | Impr | CTR | Position |
|---|---|---|---|---|
| Mobile | 94 (74.6%) | 3,115 (54.9%) | 3.02% | 9.05 |
| Desktop | 29 (23.0%) | 2,512 (44.3%) | 1.15% | 21.22 |
| Tablet | 3 | 45 | 6.67% | 7.09 |

A 12.2-position desktop/mobile gap. Query-mix is the likely cause (desktop's visible query set is 40.8% the brand term and 45.0% position >20; mobile is 10.4% brand and 9.8% position >20), and mobile-first indexing is confirmed (`crawledAs: MOBILE` on all five URLs inspected), which rules out a separate desktop index. Not fully proven — would need a device x page cross-tab.

### 2.7 Top query clusters (Queries.csv — 35% impression coverage, floors not totals)

| Cluster | Queries | Clicks | Impr | CTR | Weighted pos |
|---|---|---|---|---|---|
| Brand `estrevia` | 1 | 5 | 584 | 0.86% | 2.72 |
| ES sidereal calculator | 29 | 11 | 638-711 | ~1.6% | 9.51-12.05 |
| ES synastry / compatibility | 37 | 0 | 205 | 0% | 60.81 |
| ES minor arcana (tarot) | 73 | 0 | 141 | 0% | 73.72 |
| Sidereal generic | 18 | 0 | 82 | 0% | 40.00 |
| Planetary hours | 21 | 7 | 76 | **9.21%** | 23.62 |
| EN sidereal calculator | 18 | 0 | 75 | 0% | 35.48 |
| Sign meanings / dates | 29 | 1 | 71 | 1.41% | 27.24 |
| EN Thoth tarot | 29 | 0 | 44 | 0% | 37.05 |
| Sign-pair compatibility | 20 | 0 | 31 | 0% | 80.74 |
| Kabbalah / Tree of Life | 13 | 0 | 16 | 0% | 30.44 |
| **LLM/citation research** | 7 | 0 | 8 | 0% | **8.75** |

Best single query on the property: **`horas planetarias hoy` — 15 impressions, 5 clicks, 33.33% CTR, position 8.47** (Spain). 215 of 315 queries (68.3%) sit beyond position 40 and produce 527 impressions and 0 clicks.

---

## 4. Findings

All 15 verified findings carry verdict **PARTIAL**: the defect reproduced, but severity, root cause, fix or impact model was wrong in each case. Verdicts and severities below are the **post-verification** ones.

### P0 — none

No finding survived adversarial verification at P0. Every candidate was downgraded. This is itself the report's main result.

### P1 — none verified

No finding survived at P1 either. Five unverified P1 candidates appear in section 4.5.

---

### P2

#### [P2-1] `buildTitle()` truncates the brand off 179 of 518 sitemap URLs; 114 render a dangling `|…`

*(Consolidates two independently-generated findings, `es-title-brand-amputation` and `title-truncation-eats-brand`, which verification showed are the same defect.)*

**Evidence.** Full live census of all 518 sitemap URLs fetched as Googlebot, 2026-08-02: **179 (34.6%) contain no "Estrevia"; 114 end literally in `|…`**. Max rendered title length across the whole corpus = 60, zero over — the cap is being enforced by eating the brand. Live `/es/`: `<title>Carta Natal Sideral Gratis — Calculadora Online (Lahiri) |…</title>` (59 chars); the same broken string leaks into `og:title`, `twitter:title` and `og:image:alt`. Breakdown: 151 essay detail pages + both essay index pages + 24 `/sidereal-*-dates` + `/es/` + `/es/compatibility`. 0 of 79 tarot URLs affected. Those 179 URLs carry 55 clicks and 2,843 page-dimension impressions (43.7%). `/es/` alone is 19 clicks / 1,487 impressions / 1.28% CTR / position 8.68.

**Root cause.** `src/shared/seo/metadata.ts:97-99` concatenates the 11-char suffix and *then* truncates, so any source title over 49 chars sacrifices the brand rather than its own tail. `metadata.ts:58` strips trailing `[\s.,;:—–-]+` but not the pipe, hence the orphan `|`. `TITLE_SUFFIX = ' | Estrevia'`, `MAX_TITLE_LENGTH = 60` at `constants.ts:54-55`. Commit `6a28c5f` (seo-p1/T5, 2026-07-11) lengthened `messages/es.json` `pageMeta.landing.title` to 56 chars, which pushed `/es/` over for the first time. The reserve-the-budget pattern already exists in-repo at `src/shared/seo/tarot-title.ts:24`, which is exactly why zero tarot URLs are affected.

**Fix.** Two changes, ship the cheap one first.

1. *5 minutes, zero code risk.* `messages/es.json:396` to `"Carta Natal Sideral Gratis — Calculadora Lahiri"` (47 chars). Simulated against the current unmodified `buildTitle`: renders `Carta Natal Sideral Gratis — Calculadora Lahiri | Estrevia` (58 chars), brand intact. Fixes the only affected page with material traffic without touching code.
2. *Code fix, M not S.* Reorder `buildTitle` to reserve the suffix: build `full`, return it if it fits, otherwise `truncate(title, MAX_TITLE_LENGTH - TITLE_SUFFIX.length)` and append the suffix. This **breaks two existing tests** and must be shipped with them: `metadata.test.ts:32` asserts `title.endsWith('…')`, change to `endsWith(TITLE_SUFFIX)` plus `toContain('…')`; the T8a word-boundary test at `:241-251` extracts the body via `.replace('…','').trim()` and must instead slice off `TITLE_SUFFIX.length` first. Add an invariant test asserting every `createMetadata` title both `.endsWith(TITLE_SUFFIX)` and `.length <= MAX_TITLE_LENGTH`, table-driven over `messages/{en,es}.json`. **Drop** the proposed `|` addition to the strip class at `metadata.ts:58` — after the reorder the pipe can never be in the truncatable segment.
3. **Do not** rewrite the 151 over-budget essay frontmatter titles as part of this. Measured: 74/120 EN and 77/120 ES essay titles exceed the 49-char post-fix budget (median 50.5/51.0, max 66/75), so the code fix alone converts them from "brand missing" to "epithet cut mid-title" (`Saturn in Taurus (Sidereal) — The Architecture… | Estrevia`, losing "of Security"). Fixing that means editing proprietary `content/` frontmatter and needs an explicit founder ask.

**Files.** `messages/es.json`, `src/shared/seo/metadata.ts`, `src/shared/seo/__tests__/metadata.test.ts`, optionally `content/essays/**`.

**Effort.** S for the JSON line; M for the code + tests; L if content titles are included.

**Expected impact.** **No demonstrable click gain.** A position-matched test on the truncated group excluding `/es/` (74 pages, 949 impressions, weighted position 7.32, CTR 2.74%) vs the clean group (116 pages, 1,511 impressions, weighted position 7.30, CTR 2.71%) shows positions matched to 0.02 and CTRs indistinguishable. Value is: objectively malformed output on 179 URLs stops shipping, `og:title`/`twitter:title` cards stop being broken on every social and Meta-ad share, and the brand token reappears on the ES landing page.

**Verification.** PARTIAL. Verifier 1: *"REFUTED CLAIM #1 — 'ES-specific', 'hit roughly twice as often as EN': FALSE. ES 92/259 = 35.5%, EN 87/259 = 33.6%. Ratio 1.06x, not 2x... EN actually has MORE literal orphan-pipe titles (63 vs ES 51). This is a site-wide bug; theme 'spanish-latam' is mis-assigned."* And: *"'~546 of /es/'s 1,487 impressions come from the brand query' is not derivable from this export... Assigning 546 (93.5%) of them to /es/ alone is an assumption presented as measurement."* Verifier 2: *"the position-normalised test is null... even an implausible 20% CTR lift is ~11 clicks/quarter."*

---

#### [P2-2] `/api/og/essay/*` returns HTTP 500 on every GET — 264 of 268 sitemap `<image:loc>` entries and the `og:image` of all 242 essay pages

**Evidence.** `GET https://estrevia.app/api/og/essay/sun-in-leo` returns **500**, `text/html`, 10,941 bytes, `x-matched-path: /500`. `HEAD` on the same URL returns **200 `image/png`** with the route's own immutable Cache-Control — which is why every prior header-only smoke check passed. A bogus slug returns 404 `text/plain` 9 bytes on the route's own path, so slug lookup and content tracing work. Vercel runtime errors for `/api/og/essay/[slug]` reproduce the cause verbatim: `Error: failed to pipe response`, `[cause] Cannot find module '/var/task/node_modules/next/dist/compiled/@vercel/og/index.node.js' imported from /var/task/node_modules/next/dist/server/og/image-response.js`, `ERR_MODULE_NOT_FOUND`. Live sitemap: 518 `<loc>`, 268 `<image:loc>`, 264 matching `api/og/essay`. Live `/essays/jupiter-in-taurus` emits `og:image` pointing at the failing route.

**Root cause.** *Corrected by verification — the obvious diagnosis is wrong.* The route imports `ImageResponse` from `'@vercel/og'` (`route.tsx:1`), but Next 16 hard-aliases that bare specifier to its own shim (`node_modules/next/dist/build/create-compiler-aliases.js:125`, and the same pair is baked into the Turbopack alias table in `next-swc.darwin-arm64.node`). `next/og.js` is literally `require('./dist/server/og/image-response')`, so `next/og` and `@vercel/og` resolve to the **same module** on the Node runtime. The production stack trace names that shim as the *importer*, proving the alias already fired. The real failure is an output-file-tracing gap: the shim does a runtime dynamic `import('...index.node.js')` that nft did not trace into the function bundle, and `next.config.ts:120-122` whitelists only `'./data/ephe/**'` for `'/api/**'`. `src/app/opengraph-image.tsx` works because of `runtime = 'edge'` (line 3), not its import specifier.

**Fix.** Replace `next.config.ts:120-122` so `outputFileTracingIncludes` keeps `'/api/**': ['./data/ephe/**']` and adds `'/api/og/**': ['./node_modules/next/dist/compiled/@vercel/og/**', './public/fonts/**']`.

**Do not** change the import specifier to `next/og` — it resolves to the identical module and produces a green-looking commit that fixes nothing. **Do not** switch to `runtime = 'edge'` — `route.tsx:103` does `fs.readFile` on the astro font, and the passport route uses the Neon HTTP driver. Keep `@vercel/og` installed: `src/modules/advertising/creative-gen/composition/passport-satori.tsx:92` loads a font from its dist/, and `src/app/api/og/passport/[id]/__tests__/route.test.ts:49` mocks it.

Verification must be a real deploy (`next dev` resolves from node_modules directly and cannot reproduce this):
`curl -sS -o /dev/null -w '%{http_code} %{content_type} %{size_download}\n' https://estrevia.app/api/og/essay/sun-in-leo` expecting `200 image/png <nonzero>`. Add that **GET** (never HEAD) assertion to the curl smoke suite. Fix `src/app/api/og/passport/[id]/route.tsx` in the same change — identical import, identical nodejs runtime, and it is the Cosmic Passport share card.

**Files.** `next.config.ts`, `src/app/api/og/essay/[slug]/route.tsx`, `src/app/api/og/passport/[id]/route.tsx`, `src/app/sitemap.ts`.

**Effort.** XS.

**Expected impact.** Restores 264 of 268 sitemap image entries (98.5%) and `og:image`/`twitter:image` on 242 essay URLs. **No measurable organic click recovery** — see verification.

**Verification.** PARTIAL. *"THE DEFECT IS REAL AND REPRODUCED... But the root cause, the one-line fix, the 'regressed on 07-11' story, and the P0 severity are all wrong."* On severity: *"Vercel runtime errors for this route: count=2 over a 7d window, users=1 — and those two events are my own verification curls from this session. That means essentially ZERO real GETs (Googlebot, Google Images, Facebook/Meta scraper, Twitter) hit /api/og/essay/* in the last 7 days."* On timing: *"the route file's only commits are dcf16a9 and 404c52f... the endpoint has most likely never worked in production."* On the impact framing: *"the impact paragraph borrows the essay cluster's 46.8% click share to imply organic value at risk, which is a non-sequitur: those 59 clicks are web results and are entirely unaffected by a broken og:image."* Note: the passport route is high-confidence-but-unverified (bogus IDs 404 before reaching ImageResponse). **If a real passport ID also 500s, bump to P1** — that is the viral share mechanic.

---

#### [P2-3] ES essay corpus is 89% dark because it never contains the Spanish sign name

**Evidence.** ES `/es/essays/*` = 13 URLs with impressions of 120, **33 impressions, 0 clicks**, weighted position 7.54. EN twin = 108/120, 1,470 impressions, 59 clicks (46.8% of all site clicks), 4.01% CTR, position 8.51. The corpus itself is real: 120 EN + 120 ES MDX, ES bodies average 689 words vs EN 601, 0.0% 8-word shingle overlap with EN on all 7 live page pairs tested, Spanish-stopword fraction 0.94-0.97. This is not an EN fallback and not thin content.

The mechanism, established with a control the original finding did not run — split both corpora by whether the Spanish sign form differs from English (same-spelled = Aries/Leo/Virgo/Libra, 40 URLs; differing = other 8 signs, 80 URLs):

| | URLs w/ impressions | Impressions | Impr/URL |
|---|---|---|---|
| EN same-spelled | 37/40 | 465 | 11.62 |
| EN differing | 71/80 | 1,005 | 12.56 |
| **ES same-spelled** | 9/40 | 29 | **0.72** |
| **ES differing** | 4/80 | 4 | **0.05** |

EN ratio 0.93 (no effect — English queries match both, which rules out sign popularity as a confounder). ES ratio **14.4x**. Binomial P(>=29 of 33 ES impressions landing on the 40/120 same-spelled URLs under a proportional null) = **1.3e-10**.

Source-side: `content/essays/es/` contains **Acuario 0, Tauro 0, Geminis 0, Cancer(accented) 0, Escorpio 0, Capricornio 0, Sagitario 0, Piscis 0** — zero occurrences across all 120 files, against 1,589 occurrences of the English forms. 80/120 ES titles carry a differing English sign (`content/essays/es/jupiter-in-aquarius.mdx:2` reads `title: "Júpiter en Aquarius (Sideral) — Sabiduría Colectiva"`). All 120 ES files have byte-identical English `keywords:` frontmatter to their EN twin.

**The repo already built the fix and wired it to a dead end.** `src/shared/lib/astro-i18n.ts:82-98` contains `SIGN_ES_VARIANTS` (all 12) and `esEssaySignPhrase()`, shipped in `176027c` (seo-p2/T10a). Grep of all non-test src: the **only** production consumer is `src/app/[locale]/(content)/essays/[slug]/page.tsx:67`, which appends the phrase to `<meta name="keywords">`. Verified live on `/es/essays/jupiter-in-aquarius`. Google has ignored meta keywords since 2009.

Self-contradiction, live: `/es/sidereal-cancer-dates` reads "Fechas de Cáncer Sideral 2026" but `/es/signs/cancer` reads "Cancer sideral". The `/es/sidereal-*-dates` family already violates the CLAUDE.md rule.

**Root cause.** CLAUDE.md's i18n rule ("Sign names untranslated") was applied to the ES essay corpus, so the 120 Spanish essays never contain the token a Spanish searcher types. Secondary: the ES hub, the entry point Google crawls to reach all 120 children, presents itself as an English document at position 24.19.

**Fix.** Do **not** find/replace over `content/essays/es/*.mdx`: `content/` is proprietary, frontmatter `sign: "Aquarius"` is a canonical token read by `src/modules/esoteric/lib/essays.ts`, and blind substitution breaks gender agreement.

- **T1 (S, no content edits, one-line revert).** In `src/app/[locale]/(content)/essays/[slug]/page.tsx`, when `locale === 'es'`, pass `meta.title`/`meta.description` through a helper that swaps the English sign token for `spanishSignVariant(parsed.sign)` (already exported at `astro-i18n.ts:97`). Apply to `createMetadata`, the rendered H1, `articleSchema` headline, `breadcrumbSchema`, and the OG text. One transform fixes 120 titles + H1s + JSON-LD; touches zero MDX. Guard with a test asserting `getEssayBySlug('jupiter-in-aquarius','es')` renders "Júpiter en Acuario" while frontmatter `sign` stays "Aquarius" and the canonical stays `/es/essays/jupiter-in-aquarius`. Do not break the existing `astro-i18n.test.ts` parity assertion. Update the now-false comment at `astro-i18n.ts:78-81` ("Never render these in the body").
- **T2 (S, ship regardless).** `src/app/[locale]/(content)/essays/page.tsx:22-28` hardcodes an English title/description literal; add `pageMeta.essays` to both message catalogues and use `getTranslations`. `getTranslations` is already imported at line 10, so this is 3 lines plus one JSON key per locale. Live `/es/essays` currently serves an English title under a Spanish H1 at 86 impressions / 0 clicks / position 24.19.
- **T3 (M, gated).** Only after T1 has run 4-6 weeks and GSC shows ES differing-sign essays moving off 0.05 impr/URL: hand-edit body prose per file. Requires an explicit CLAUDE.md i18n amendment.
- **DROP** rewriting the 120 `keywords:` arrays to Spanish. That repeats the seo-p2/T10a mistake.

**Files.** `src/app/[locale]/(content)/essays/[slug]/page.tsx`, `src/app/[locale]/(content)/essays/page.tsx`, `src/shared/lib/astro-i18n.ts`, `messages/{en,es}.json`, later `content/essays/es/`, `CLAUDE.md`.

**Effort.** S for T1+T2 (about 2 hours combined). L only if T3 is included.

**Expected impact.** Unlocks 107 currently-dead URLs (21% of the sitemap) in the market supplying 48.9% of impressions. **State the demand ceiling honestly:** visible Spanish queries containing *any* sign token total **13 queries / 39 impressions / 0 clicks** over 72 days, of which differing-form signs are about 6 impressions. Zero Spanish planet+sign combination queries appear at all. Queries.csv covers only 35% of impressions so real demand may be larger, but the extrapolation "bring ES to 30% of EN density gives ~13 clicks/window" is modelling, not measurement.

**Verification.** PARTIAL. *"Every hard fact in the finding reproduces, and the causal mechanism survives a control test the finding didn't run — but the P0 label, the impact model, and the proposed fix are all wrong, and the finding missed that the repo already built the fix and wired it into a dead end."* On severity: *"Visible Spanish demand is head calculator intent, not planet-in-sign: 'carta natal sideral' 236 impr, 'carta sideral' 219, 'carta astral sideral' 71. Already served by /es/ at 1,487 impr / 19 clicks / pos 8.68... Nothing is blocked or broken. This is a content bet on a market whose demand is unproven at this sample size."*

---

#### [P2-4] Nothing is prerendered; `revalidate`/`dynamicParams` are inert; four route families return HTTP 200 for arbitrary invalid slugs

**Evidence.** `npm run build` (exit 0): **104 dynamic / 3 static / 0 SSG**. The 3 static routes are `/icon.svg`, `/robots.txt`, `/sitemap.xml`. `.next/server/app` holds one `.html` (`_global-error.html`); `prerender-manifest.json` has `dynamicRoutes: {}`. Live headers on 8/8 sampled pages: `cache-control: private, no-cache, no-store, max-age=0, must-revalidate`, `x-vercel-cache: MISS`, `age: 0`, 2 Set-Cookie. So `revalidate = 86400` at `essays/[slug]/page.tsx:36` and `tarot/[cardId]/page.tsx:49` is dead code, and the comment at `essays/[slug]/page.tsx:35` ("TTFB ~500ms to ~50ms") was never true.

Soft-404s, live as Googlebot 2026-08-02: **200** on `/essays/zzz-not-real`, `/es/essays/zzz-not-real`, `/tarot/zzz-not-real`, `/signs/notasign`, `/sidereal-notasign-dates`; correct **404** on `/compatibility/foo-bar`, `/planetary-hours-cities/nowhere`. Mechanism proof: `/signs/notasign` returns the `(app)` loading skeleton as the committed 200 shell and *terminates* the RSC stream with a `NEXT_HTTP_ERROR_FALLBACK;404` digest push. Route-group correlation is exact: `loading.tsx` exists only in `(app)` and `(content)`; both correctly-404ing routes live in `(marketing)`.

**Mitigation the original finding omitted:** all five soft-404 shells emit `<meta name="robots" content="noindex"/>`; valid pages emit `index, follow`. Zero invalid or odd URLs appear in any of the 347 rows of Pages.csv over 72 days (regex-scanned for `?`, `#`, `%`, `undefined`, `null`, bracket chars).

**Root cause.** *Corrected.* Primary (labelled a strongly-supported hypothesis, not proven — an isolating experiment was not run under the read-only mandate): `src/app/layout.tsx:59-64` — the **root** layout, which sits outside `[locale]` and therefore has no locale param and never calls `setRequestLocale`, awaits `getLocale()` and two `getTranslations()` calls. next-intl resolves those from request headers; a dynamic API in the outermost layout opts every route out of static generation. Corroboration: the only 3 static outputs are exactly the 3 routes that bypass the root layout, and routes with no dynamic APIs of their own (`/[locale]/why-sidereal`, `/[locale]/terms`) are still dynamic. This predates the SEO work (commit `b04ed9a`); CRO commit `6334379` added the third dynamic read. Middleware `Set-Cookie` is a real but **secondary** blocker (Vercel CDN never caches a Set-Cookie response), not the cause. **Refuted sub-claim:** `setRequestLocale` is not the discriminator — `compatibility/[pair]/page.tsx:127` and `planetary-hours-cities/[city]/page.tsx:45` both call it, are still dynamic, and 404 correctly.

Secondary (soft-404s): the `loading.tsx` Suspense boundary flushes the 200 shell before `notFound()` resolves. The existing guard `src/shared/seo/__tests__/soft-404.test.ts:17-23` only asserts `expect(essayDynamicParams).toBe(false)` — it never checks a status code, which is why this shipped green.

**Fix.** In this order.

1. **Soft-404s (cheap, safe, do first).** In `generateMetadata()` of `essays/[slug]/page.tsx` (which currently returns an "Essay not found" Metadata object instead of throwing), `tarot/[cardId]/page.tsx`, `signs/[sign]/page.tsx` and `sidereal-dates/[sign]/page.tsx`, resolve the slug and call `notFound()` there — `generateMetadata` runs before the Suspense boundary commits, so the status is still mutable. **Do not** delete the two `loading.tsx` files; that removes the skeleton UX on every `(app)`/`(content)` route to fix four pages.
2. **The actual prerender blocker.** Hoist `getLocale()`, `getTranslations('appShell')` and `getTranslations('cookieConsent')` (and their consumers) out of `src/app/layout.tsx:59-64` down into `src/app/[locale]/layout.tsx`, which already has the param, already calls `setRequestLocale(locale)` at :45, and already declares `generateStaticParams` at :8. The one real obstacle is `<html lang={locale}>` in the root layout — resolve in a plan, not inline. Re-run `npm run build` and **require** essays/tarot to flip to SSG. If they do not, the hypothesis is wrong and steps 3-4 should be dropped, not cargo-culted.
3. **Only after step 2 turns green.** Stop unconditional cookie writes on HTML GETs: move `ensureAnonymousIdCookie` (`src/middleware.ts:149`) to first-touch client/API issuance, and set `localeCookie: false` in `src/i18n/routing.ts` (verify this does not regress locale persistence for returning ES users — that is a live conversion path). **Do not** UA-sniff bots to vary caching.
4. **Test.** Replace the assertion-only `soft-404.test.ts` with a Playwright spec under `npm run test:e2e` asserting `response.status() === 404` for all five bogus-slug families against the local server. Do not curl production from a unit test.
5. **Note, not a fix.** `sidereal-dates/[sign]/page.tsx:39` declares `export const dynamic = 'force-dynamic'`, so that route stays uncacheable regardless.

**Files.** `src/app/layout.tsx`, `src/app/[locale]/layout.tsx`, `src/middleware.ts`, `src/i18n/routing.ts`, the four `page.tsx` files above, `src/shared/seo/__tests__/soft-404.test.ts`.

**Effort.** M.

**Expected impact.** Eliminates an unbounded soft-404 URL space across 4 route patterns and removes 518 full origin function invocations per crawl pass. Relevant because 48.9% of impressions come from Spanish-speaking markets while all functions run in `iad1`. **No click recovery is claimable.** Measured TTFB as Googlebot is already fine: 240ms (`/es/`), 246ms (`/es/tarot/the-fool`), 302-319ms (`/essays/sun-in-leo`).

**Verification.** PARTIAL. *"The observable symptoms are all real and I reproduced every one of them, but the primary root cause is misdiagnosed, one fix step provably does not work, and the severity is inflated."* On severity: *"every soft-404 shell carries `<meta name="robots" content="noindex"/>`... Combined with zero invalid/odd URLs anywhere in Pages.csv across 72 days, there is no evidence Google has ever discovered one."* And: *"'Crawl budget' on a 518-URL sitemap with 126 clicks/72 days is not a real constraint... Leaning on it edges toward folklore."*

---

#### [P2-5] The 2026-07-11 ES JSON-LD fix covered essays only; 113 of 259 ES URLs still emit EN URLs

**Evidence.** Live, parsed as Googlebot 2026-08-02. `/es/signs/gemini` canonical is `https://estrevia.app/es/signs/gemini` but `Article.url` is `https://estrevia.app/signs/gemini`, `WebPage.@id` the same, BreadcrumbList items all EN. Also broken live: `/es/synastry`, `/es/tarot/*` (all 80), `/es/why-sidereal` (`Article.url` + `WebPage.@id`), `/es/moon`, `/es/hours`, `/es/tree-of-life`, `/es/chart`, `/es/pricing`, `/es/tarot`, `/es/tarot/spread`, `/es/essays` hub. Already correct: `/es/essays/<slug>` (fixed by `92a3707`), `/es/planetary-hours-cities/*`, `/es/compatibility`, `/es/about`.

Two cases the original finding **understated**: `/es/signs` emits an ItemList carrying **14** EN URLs (`signs/page.tsx:66` ItemList.url plus `:72` x 12 ListItem.url) not just a breadcrumb, and an ItemList of URLs is plausible crawl-discovery surface pointing from an ES page at EN equivalents. `/es/pricing` emits **three** `Offer.url = https://estrevia.app/pricing` (`pricing/page.tsx:66,72,78`) in addition to the breadcrumb — `Offer.url` is the field Google actually consumes.

Corrected scope: **fully broken 69 rows / 12 clicks / 1,345 impressions (20.66% of page-dimension)**; plus 12 partially-broken `/es/sidereal-*-dates` (Article.url already correct at `:128`; the defect is breadcrumb position 2 at `:135`) / 1 click / 137 impressions. Combined **13 clicks / 1,482 impressions = 22.76%**; **113 of 259 ES sitemap URLs (43.6%)**.

Decoy warning: commit `69e3803` "fix(seo-phase3/T3): localize signs/[sign] JSON-LD per locale" is an ancestor of HEAD and *sounds* like it fixes signs, but it localized only schema title/description text via `tSchema()`. Anyone re-verifying by git-log alone will wrongly conclude signs is fixed.

**Root cause.** The 07-06 audit sampled only compatibility and city pages, concluded "essay-route-specific", and remediation `92a3707` faithfully fixed only `essays/[slug]`. Every other call site builds URLs from bare `SITE_URL`. There are 30 `breadcrumbSchema`/`articleSchema`/`itemListSchema` call sites across 20 files under `src/app` and no shared locale-aware helper, so the CLAUDE.md rule is satisfied for the generators but violated for the URLs fed into them.

**Fix.** Add a `localeUrl(path, locale)` helper to `src/shared/seo/json-ld.ts` returning `SITE_URL` + (`/es` when locale is es) + path, with a `path === '/'` guard. That guard matters — without it the site root renders as `https://estrevia.app/es/` with a trailing slash while the sitemap and canonical use `https://estrevia.app/es`.

Call sites (verified line numbers; every file already calls `getLocale()`): `(app)/signs/page.tsx:66,:72,:110`; `(app)/signs/[sign]/page.tsx:145,:170`; `(app)/synastry/page.tsx:58`; `(app)/moon/page.tsx:40`; `(app)/hours/page.tsx:49`; `(app)/chart/page.tsx:71`; `(app)/tree-of-life/page.tsx:73`; `(app)/sidereal-dates/[sign]/page.tsx:135` **only** (`:128`/`:136` already correct); `(content)/tarot/page.tsx:55`; `(content)/tarot/spread/page.tsx:41,42`; `(content)/tarot/[cardId]/page.tsx:129,130,131` plus delete the stale comment at `:126-127`; `(content)/essays/page.tsx:138`; `(marketing)/why-sidereal/page.tsx:93` (define, not the `:144` consumer); `(marketing)/pricing/page.tsx:38` **and** `:66,:72,:78`.

**Do not** touch `Organization.url`, the publisher logo `ImageObject`, or `chart/page.tsx` `SoftwareApplication.url` — those are site-level entity identifiers and locale-prefixing them fragments the Organization entity.

Test: for each ES route family assert every BreadcrumbList `item`, every ItemList/ListItem `url`, and page-level `Article.url` / `WebPage.@id` / `Offer.url` start with `https://estrevia.app/es`. Whitelist Organization.url, publisher logo and `/api/og/*`. Match on a **path boundary** — a bare substring test for `estrevia.app/es` is true for `https://estrevia.app/essays`.

**Files.** `src/shared/seo/json-ld.ts` plus the 14 page files above.

**Effort.** M.

**Expected impact.** Signal hygiene only. Removes a self-contradiction (JSON-LD says EN URL, canonical + hreflang say ES) from 113 of 259 ES URLs. **Do not attach a rank-recovery expectation to `/es/synastry`** — at position 29.48 its problem is relevance.

**Verification.** PARTIAL. *"TRIED TO REFUTE, FAILED ON THE FACTS — the defect is real and live... Author did NOT inflate by counting already-fixed pages."* On severity: *"Search appearance.csv is header-only, so GSC reports ZERO rich results for the entire window — no breadcrumb rich result is being served, therefore none is being lost. The 1345 impressions are impressions ON affected pages, not impressions lost TO the defect... JSON-LD `url`/`@id` is not a documented Google canonicalization signal."*

---

#### [P2-6] `www.estrevia.app` redirects 307 Temporary, not 308

**Evidence.** `curl -sSI https://www.estrevia.app/` returns `HTTP/2 307`, `location: https://estrevia.app/`, `server: Vercel`, bare HSTS. The response omits every header `next.config.ts:101-116` applies via `source: '/(.*)'` and omits the middleware's `x-clerk-auth-status`, proving no Next function runs — the redirect is emitted at the Vercel domain layer. Host-wide, not root-only: `/es/` and `/tarot` also 307. Contrast: `http://estrevia.app/` returns `HTTP/1.0 308`. Pages.csv line 7: `https://www.estrevia.app/,2,165,1.21%,14.78`; line 4: `https://estrevia.app/,4,338,1.18%,14.64`. www holds 32.8% of the 503 combined homepage impressions and is the only non-apex host across 347 rows; it appears 0 times in the 518-URL sitemap.

**Root cause.** Vercel Domain redirect at the default 307 status. Not in `next.config.ts` (only `headers()` at :141 and `rewrites()` at :151, no `redirects()`), not in `vercel.json` (crons only), and `src/middleware.ts:80-90` `redirectVercelHostToCanonical` matches only `host.endsWith('.vercel.app')`. Google treats 301/308 as a strong permanent-canonicalization signal and 302/303/307 as weak, defaulting to keeping the *source* URL canonical.

**Fix.** Vercel Dashboard, project `estrevia`, Settings, Domains, `www.estrevia.app`, change redirect status from 307 to **308 Permanent**. This cannot be done in code. **Do not** un-configure the domain redirect and add a host-matched rule to `next.config.ts` `redirects()` — that routes every www request through a Next function and interacts with `localePrefix: 'as-needed'` and `skipTrailingSlashRedirect: true`. Verify with `curl -sSI https://www.estrevia.app/ | head -1` expecting `HTTP/2 308`.

**Files.** None (Vercel dashboard).

**Effort.** XS (60-second toggle).

**Expected impact.** 2 clicks / 165 impressions over 72 days = 0.028 clicks/day, with both hosts already at effectively the same position (14.78 vs 14.64). Consolidation merges two near-identical SERP entries rather than unlocking new clicks. Do it because it is free, and drop the brand-SERP justification from any roadmap copy.

**Verification.** PARTIAL. *"MECHANISM AND CORE NUMBERS: CONFIRMED, NOT FIXED. Severity inflated and two sub-claims are fabricated."* Specifically: *"'www alone contributes 110 of those brand impressions at position 6.49' and '31 distinct Estrevia URLs' cannot be derived from this export... The literal string 6.49 appears nowhere in any CSV. These two figures are hallucinated, and they are precisely the figures used to justify the P1 upgrade."* Also: *"The 2026-07-06 audit graded this exact item P2 at REPORT.md:34 with the same 165 impr / pos 14.78 evidence."* Evidence gap the verifier flagged: Pages.csv has no date dimension, so it cannot be shown whether the 165 impressions are still accruing or are a decaying pre-fix tail. **A separate 16th verification pass on the same defect returned REFUTED** — see section 5.

---

#### [P2-7] 506 of 518 descriptions exceed the mobile fold; 125 tarot descriptions are hard-cut mid-word

**Evidence.** Re-crawled all 518 sitemap URLs as Googlebot; 518/518 returned a description. Median 151, mean 149.2, min 61, max 155. **506 (97.7%) exceed 120 chars. 305 (58.9%) end in "…". 127 are exactly 155 chars with no ellipsis, of which 125 are `/tarot/`.** Live mid-word cuts: `/es/tarot/queen-of-wands` ends "…y la presencia magné"; `/tarot/the-fool` ends "…carrying nothing and pos"; `/es/tarot/the-magus` ends "…canalizando la Palabra que transf".

Cause chain in source: `src/shared/seo/metadata.ts:52` short-circuits (`if (value.length <= maxLength) return value;`) on the exactly-155 string produced by `src/app/[locale]/(content)/tarot/[cardId]/page.tsx:93` (`description: localizedDescription.slice(0, 155)`), with `MAX_DESCRIPTION_LENGTH = 155`. So the route's defensive slice defeats the shared word-boundary logic it duplicates.

Source-side over-authoring: `messages/en.json` `siderealDates.*.description` = 12 strings of 183-210 chars; `messages/es.json` = 12 of 207-241 — all 24 blow the cap, so `truncate()` is the routine path. `planetary-hours-cities/[city]/page.tsx:32-33` renders about 170 chars; live `/planetary-hours-cities/barcelona` is 150 chars ending "…computed with the Swiss Ephemeris…", dropping "(sidereal, Lahiri)".

**Corrected exposure:** joining the crawl to Pages.csv, only **2,405 impressions (36.9%)** fall on ellipsis-truncated URLs and 262 (4.0%) on hard-cut tarot URLs. **3,735 impressions (57.4%) are on descriptions that were never truncated** — including `/es/` at 1,487 impressions, whose description is 141 chars.

**Root cause.** Descriptions authored to the 155-char desktop cap rather than to the mobile fold, with the truncate safety net hit as the routine path. The tarot route additionally duplicates truncation with a raw `.slice()`.

**Fix.**
1. **The only concrete code defect:** `tarot/[cardId]/page.tsx:93` becomes `description: localizedDescription,` and lets `createMetadata()` truncate. One line, no other caller depends on the pre-slice. Restores word-boundary plus "…" on 125 live URLs. Do **not** shorten card descriptions — `content/tarot/cards.json` is proprietary and the Book-of-Thoth constraint blocks new card text.
2. **Re-target the copy work.** Drop `messages/es.json` `pageMeta.landing` from the list (141 chars, never truncated — its 1,487 impressions belong on a separate "is this copy persuasive at 1.28% CTR" ticket). Real priority by truncated impressions: `planetary-hours-cities/[city]/page.tsx:32-33` (618 impressions, 21 clicks — highest-click truncated template), the 24 `siderealDates.*.description` entries (285 impressions, worst offenders at 183-241 chars), `signs/[sign]/page.tsx` (317 impressions).
3. **Do not hard-cap at 120.** The mobile fold is pixel-width-based and variable, and descriptions carry zero ranking weight. The defensible rule: keep every **source** description at or under 150 so `truncate()` never fires, and front-load the differentiator into the first ~110 chars. For the city template specifically, move "(sidereal, Lahiri)" ahead of the hour-ruler parenthetical.
4. **Test against sources, not outputs.** `metadata.test.ts:42-52` already asserts output at or under 155. The new assertion must iterate `messages/{en,es}.json` `pageMeta.*` and `siderealDates.*` descriptions asserting 150 or less, **plus** render the inline city and sign templates with the longest slug in `ALL_CITY_SLUGS` and assert the interpolated result is 150 or less.

**Files.** `src/app/[locale]/(content)/tarot/[cardId]/page.tsx`, `messages/{en,es}.json`, `src/app/[locale]/(marketing)/planetary-hours-cities/[city]/page.tsx`, `src/app/[locale]/(app)/signs/[sign]/page.tsx`, `src/shared/seo/__tests__/metadata.test.ts`.

**Effort.** M (XS for the tarot line alone).

**Expected impact.** Stops shipping visibly machine-cut copy. The tarot fix touches 125 URLs carrying **262 impressions and 4 clicks** in the whole window. No modelled click gain is defensible.

**Verification.** PARTIAL. *"'Affects every impression the site serves' is false... 3735 impr (57.4%) are on descriptions that were never truncated. Critically, the single biggest page, /es/ (28.6% of all page impressions), has a 141-char description that createMetadata leaves untouched. The finding lists it as fix priority #1 for a truncation defect it does not have."* Folklore rejected: *"'A mid-clause author-supplied ellipsis is a signal to Google to discard the description' — no evidence for this"*; and the "+20 clicks/window" estimate rests on a fixed CTR-by-position table and should not be quoted.

---

#### [P2-8] All 24 `/sidereal-{sign}-dates` URLs are server-side internal-link orphans; the sign/dates title pair is undifferentiated

*(Retitled by verification. "Cannibalization" is an unproven hypothesis; the orphan status is measured fact.)*

**Evidence.** Orphan proof, live as Googlebot with `<script>` stripped: `/signs` hub 24 hrefs, **0** dates links; `/why-sidereal` 21 hrefs, 12 `/signs/*`, 0 dates; `/signs/cancer` 23 hrefs, 0 dates; `/es/signs/cancer` 23 hrefs, 0 dates; `/essays/sun-in-cancer` 18 hrefs, links `/signs/cancer`, 0 dates. Repo grep: the only dates href in `src/` is `src/app/[locale]/(app)/sidereal-dates/[sign]/SunSignWidget.tsx:127`, inside a `'use client'` component whose href depends on a user-submitted date — not crawlable. All 24 are in the sitemap. **Sitemap-only reachability.**

Titles collide verbatim: `/signs/cancer` is "Sidereal Cancer — Traits, **Dates** & Meaning" vs `/sidereal-cancer-dates` "Sidereal Cancer **Dates** 2026: When Sun Enters Cancer".

Numbers by type (the split that matters): `/essays/sun-in-{s}` 14 URLs / 344 impr / 13 clicks / **3.78%** at weighted position 8.93 (healthy, different intent, exclude); `/signs/{s}` 18 URLs / 317 impr / 6 clicks / 1.89% at 6.75; `/sidereal-{s}-dates` 23 URLs / 285 impr / 4 clicks / 1.40% at 8.93. Weak set = signs plus dates = **41 URLs / 602 impr / 10 clicks / 1.66%**.

Corrected breadcrumb claim: `sidereal-dates/[sign]/page.tsx:133-137` emits position 1 = `SITE_URL` and position 2 named "Sidereal dates" with `url = SITE_URL + '/'` — **the same URL twice**, which is an invalid BreadcrumbList. `/sidereal-dates` does 404, but nothing links to it, it is not in the sitemap, and no hub route ever existed.

Two bonus defects on the same surface: `/sidereal-dates/cancer` returns **HTTP 200** (the pre-rewrite internal path, `next.config.ts:151-173`), self-canonicalizes correctly but carries `index, follow` — a second crawlable copy of all 24 pages. And `messages/es.json` `.siderealDates.*.title` translates sign names ("Fechas de Cáncer Sideral 2026", "Tauro", "Géminis") while `es .pageMeta.signsDetail.title` uses "Cancer" — violates CLAUDE.md and means the ES pair targets different query strings.

**Root cause.** `/sidereal-{sign}-dates` shipped as a programmatic surface whose promise is a strict subset of `/signs/{sign}`, with no differentiating angle in the title, no reciprocal link, and no parent hub.

**Fix.** Do (a) only. Drop (b).

**(a) De-orphan and differentiate — XS, no downside:**
1. `src/app/[locale]/(app)/signs/[sign]/page.tsx` — insert a link **after line 337** (the closing `</section>` of the essays list; **not** line 365, which is inside the Chart CTA heading). Use the next-intl locale-aware `Link` already imported from `@/i18n/navigation`; the rewrite at `next.config.ts:151-173` maps `/sidereal-:sign-dates` to `/sidereal-dates/:sign` for both locales, so a bare `/sidereal-${sign}-dates` href is locale-safe. Anchor text goes in **both** `messages/en.json` and `messages/es.json` (an i18n parity guard exists, commit `3fba75e`).
2. `sidereal-dates/[sign]/page.tsx` — add a reciprocal `<li>` inside the existing "See also" list (around lines 213-241) pointing to `/signs/${sign}`.
3. Retitle `/signs/{sign}` to remove the "Dates" collision, updating **both** `messages/{en,es}.json` `.pageMeta.signsDetail.title` **and** `.signDetail.schema.title` (the latter is the live Article JSON-LD headline; they will silently diverge otherwise). Also fix `es.json .siderealDates.*.title` to stop translating sign names.
4. Fix the BreadcrumbList at `:135` — point position 2 at a real hub or delete it.

**(b) DROP the 301 consolidation test.** `/sidereal-cancer-dates` is the best dates page at 3 clicks / 39 impressions, and the entire cohort is 4 clicks / 285 impressions over 72 days — there is no statistical power to read a 6-week single-sign A/B, and a 301 destroys the page type that carries the 7-year date table the sign page lacks. Instead, after (a), wait 6-8 weeks and re-pull GSC with the **query x page** dimension. The flat CSV export cannot prove cannibalization.

Optional hardening: convert the `next.config.ts` rewrites to also 301 `/sidereal-dates/:sign` to `/sidereal-:sign-dates`, removing 24 duplicate crawl targets.

**Files.** `src/app/[locale]/(app)/signs/[sign]/page.tsx`, `src/app/[locale]/(app)/sidereal-dates/[sign]/page.tsx`, `messages/{en,es}.json`, `next.config.ts`.

**Effort.** S for (a).

**Expected impact.** Absolute ceiling: signs plus dates = 602 impressions / 10 clicks over 72 days; lifting them to the essay cohort's 3.78% yields **about +13 clicks per 72-day window** (~0.18 clicks/day against a site total of 1.75/day). Nothing is gated on it.

**Verification.** PARTIAL. *"GSC ARITHMETIC: perfect, recomputed independently... Every per-family and per-URL number in the finding reproduces to the digit."* But: *"ORPHAN STATUS IS WORSE THAN STATED AND IS THE REAL DEFECT... all 24 /sidereal-{sign}-dates URLs have ZERO server-rendered internal inbound links sitewide."* Refuted: *"'The dates hub the breadcrumbs point at does not exist' FALSE as causal framing"*; *"'946 impressions at wpos ~8 should yield ~28-38 clicks at a normal position-8 CTR of 3-4%' is a fixed CTR-by-position table treated as law... the cohort's 2.43% CTR is ABOVE the site-wide 2.22%, so 'converts at 2.43% despite position ~8' describes an above-average cohort as an underperformer."*

---

### P3

#### [P3-1] Brand query "estrevia" resolves to stevia (ES) / Estreva estradiol (EN): 584 impressions at position 2.72 return 5 clicks

**Evidence.** `Queries.csv:2` reads `estrevia,5,584,0.86%,2.72` — the largest single query by impressions (next: `carta natal sideral,3,236,1.27%,8.5`). 584 = 10.30% of impressions. Live Google Suggest probes reproduced: `hl=es&gl=cl` returns 10/10 stevia completions; `hl=en&gl=us` returns estreva gel / estreva / estroven. Chile is the #3 country by impressions (656) with the shallowest average position of any market (6.22) and near-zero clicks (5, 0.76% CTR) — the signature of high-visibility, wrong-intent impressions, and the market where Suggest maps "estrevia" to a sweetener.

Page attribution: the brand query resolves to the ES homepage. (584 x 2.72 + 903 x 12.55) / 1487 = 8.68 reconciles exactly with the `/es/` row. So Google already places estrevia.app at about #2-3 for its own brand string.

Repo defects confirmed: `constants.ts:10` `FOUNDER_NAME = '__FOUNDER_NAME__'`; `:48-50` `SAME_AS_URLS = ['https://x.com/estrevia_app']` and **that URL returns HTTP 404** (control `x.com/vercel` = 200, syndication API returns empty), while it also ships as the sitewide footer link in `SeoChrome.tsx`; `constants.ts:41` documents it as "the live X account". `/about` ships `noindex, nofollow` and is excluded from the sitemap.

Metrics have **improved** since the 2026-07-06 audit graded this P2: position 3.61 to 2.72, CTR 0.65% to 0.86%.

**Root cause.** Google's query-understanding layer maps the literal string to higher-volume near-neighbours. This is a searcher-intent problem, not an entity-recognition failure — a genuine entity failure looks like position 25+, not 2.7.

**Fix.** Reframe as "P3 entity hygiene plus one live defect".
1. **Do now (about 5 min).** `constants.ts:48-50` — either register `@estrevia_app` or delete the entry and leave `SAME_AS_URLS` empty. Fix the false comment at `:41`. Check `src/shared/seo/__tests__/` tolerates an empty array first (it currently validates URL shape, not non-emptiness).
2. **Later.** Append only real, live, self-controlled profiles as they go live. **Drop the Wikidata recommendation** — WD:N notability makes a self-created item for a pre-revenue solo product a deletion candidate, and a sameAs to a deleted item recreates defect #1.
3. **Founder decision, not an engineering task.** Do not set `FOUNDER_NAME`. `constants.ts:4-9` documents it as a deliberate dormant privacy gate; flipping it publishes a real individual's name to `/about` (both locales), the sitemap, the footer, and `Article.author` on every essay. See section 7.
4. **Do not** build content targeting "estrevia"/stevia/Estreva disambiguation, and do not budget effort against the 584 impressions as recoverable demand.

**Files.** `src/shared/seo/constants.ts`, `src/shared/components/SeoChrome.tsx`.

**Effort.** S.

**Expected impact.** Of 584 impressions, the click data implies on the order of **5-15 genuine brand searches per 72-day window**. Recoverable upside from entity work is single-digit clicks per window.

**Verification.** PARTIAL. *"Every raw number and every repo/live-site claim reproduces exactly — but the causal model, the CTR-deficit math, and the P0 severity do not survive scrutiny."* Key refutation: *"Google already ranks estrevia.app at average position 2.72 for the exact string — i.e. Google HAS resolved the token to this site... sameAs/Wikidata/Person schema change what Google believes the entity IS; they cannot change what a person typing 'estrevia' in es-CL wanted, which the finding's own Suggest evidence (10/10 stevia) demonstrates is a sweetener. The finding cites evidence that undermines its own conclusion."* Also: *"outputs/seo-audit-2026-07-06/REPORT.md:39 already logged this as P2 and :129 explicitly says 'Don't chase drug-intent impressions.'"*

---

#### [P3-2] The "CTR collapse" is index expansion, not a snippet regression

**Evidence.** Impressions slope +1.2478/day (r2=0.7103, fitted 34.5 to 123.1 = 3.57x) while clicks slope +0.0133/day (r2=0.0417, t=1.75, not significant). Clicks/day by third: 1.21, 2.17, 1.88. CTR by third: 2.66%, 2.49%, 1.81%. **No clicks were lost.** 215 of 315 queries (68.3%) sit beyond position 40 and produce 527 impressions with 0 clicks.

**Root cause.** CTR is a ratio; adding impressions at positions where structural CTR is under 0.5% mechanically drives site CTR down. *Corrected:* the expansion is **not** attributable to the 07-11 remediation (pre-only OLS +1.4399/day r2=0.635 t=9.24; post-only +0.6208/day r2=0.049 t=0.99 not significant). The cause of the expansion is unidentified.

**Fix.** No code.
1. Stop reporting site-wide CTR% as a health KPI. Report clicks/day and non-brand clicks/day as the primary series, with CTR shown only within position bands (3 or less, 3-10, 10-20, over 20).
2. Delete the attribution to the 07-11 remediation from any report.
3. Delete the "+52 clicks / 41% lift" estimate and the "0.62x expected" ratios — they assume a universal 3.50% CTR at position 5-10. If a snippet-opportunity pool is wanted, define it per-URL: exclude `/es/` (1,487 impressions, 37.7% of the pos-5-10 bucket, needs its own head-query analysis) and `/terms` (155 impressions, 0 clicks, a legal page). Residual: 2,460 impressions / 67 clicks / **2.72%** — no deficit.
4. Add the sampling caveat wherever Queries.csv is used: 35.4% of impressions, 19.0% of clicks.
5. At 90 days post-deploy, re-run **pre-only vs post-only split regressions** and compare **impression-weighted position**, not the OLS position slope.

**Files.** None (reporting discipline).

**Effort.** XS.

**Expected impact.** Prevents misallocation. No direct click gain.

**Verification.** PARTIAL. *"RECOMPUTED EVERY NUMBER — the raw arithmetic is exact, but the root cause is refuted by timing and the 'flat position' inference is a statistical misreading."* Specifically: *"r2 near 0 on a linear fit means 'a straight line explains nothing,' not 'the series is flat.' Impression-weighted position PRE = 15.50 vs POST = 12.83, a 2.67-position IMPROVEMENT... the load-bearing inference 'none of the added impressions represent a ranking gain' is false."*

---

#### [P3-3] 54 URLs at position 12 or better with zero clicks is a low-traffic artifact, not a CTR anomaly

**Evidence.** Filter (clicks=0, impressions 10 or more, position 12 or better) returns 54 URLs / 1,339 impressions / 20.6% of page-dimension. But the qualifying pool is 106 pages / 4,092 impressions / 91 clicks = **2.22% CTR — the site average**. Under a binomial null at that rate you **expect 65.1 zero-click pages holding 1,243 impressions**. Observed 54 pages / 1,339 impressions — *fewer* zero-click pages than chance. Median zero-click page has **18 impressions**, where P(0 clicks) = 67%. 46 of 54 have fewer than 30 impressions. Defensible headroom is about **2 clicks/window**, not 33.

The pos-5-10 "deficit" is one page: 1,487 of 3,947 impressions (38%) are `/es/`; 155 more are `/terms` at 0%. Excluding both: 2,305 impressions / 67 clicks = 2.91%.

Real defects surviving in this theme: `/signs/leo` description leads with taxonomy ("Sidereal Leo — Traits, Dates & Meaning") rather than the answer; `/planetary-hours-cities/barcelona` truncates away "(sidereal, Lahiri)". Already shipped and not a defect: `/sidereal-leo-dates` already front-loads the date range. Misquoted: `/moon`'s description *does* contain phase plus illumination; only the title was quoted.

**Data contradiction the fix would have shipped:** `content/signs/descriptions.json` leo = "August 16 – September 15" vs `messages/en.json` siderealDates.leo = "August 17 to September 17". Taurus and Sagittarius also diverge. Both live, both indexable, competing for the same query. Reconcile before any copy quoting a range ships — see section 4.5, U8.

**Root cause.** Selection artifact plus two genuinely weak templates.

**Fix.** (1) Lead `/signs/{sign}` descriptions with the date range, editing **only** `messages/{en,es}.json` `pageMeta.signsDetail.description`; do not touch `content/signs/descriptions.json`. (2) Rewrite the city description template to fit 155 chars with the useful datum first; do **not** inject "which planet rules the hour right now" (time-dependent, statically rendered, would be stale). (3) Drop the `/terms` description edit entirely — meta descriptions do not control which queries a page matches. (4) Demote `/moon` (14 impressions).

**Files.** `messages/{en,es}.json`, `src/app/[locale]/(marketing)/planetary-hours-cities/[city]/page.tsx`.

**Effort.** S.

**Expected impact.** Single-digit to low-teens clicks per window at best, and that is a hypothesis.

**Verification.** PARTIAL. *"the filter arithmetic reproduces exactly... So the numbers are right — the INTERPRETATION is not."* And: *"FIX (e) IS OUTRIGHT FOLKLORE AND MUST BE DROPPED. 'Remove sidereal astrology platform from the /terms description so it stops matching brand/topical SERPs' — meta descriptions are not a retrieval or matching signal."*

---

#### [P3-4] `/es/synastry` (554 impressions, 0 clicks) sells a calculator while its only near-page-one query asks for a definition

**Evidence.** `Pages.csv` reads `https://estrevia.app/es/synastry,0,554,0%,29.48` — largest zero-click URL, #2 by impressions (8.51% of page-dimension). Live title: `Sinastría — Análisis de compatibilidad | Estrevia`; description opens with the imperative "Calcula...". The page already answers the question — 1,452 visible words, an H2 `¿Qué es la sinastría?`, and a live 6-question FAQPage whose Q1 is that exact string (added 2026-07-11 by `abdeeaa`).

Corrected: visible `sinastr*` queries total **165** impressions (not 171), split **40 at position 12 or better, 20 at 12-50, 105 above 50**. The largest is `que es sinastria,0,39,0%,10.92` — **position 10.92 is page two**, not "page one bottom". There is no page-one query on this URL. Residual unattributed = 389 impressions; sitewide Queries.csv exposes 54% of impressions, so the remainder is real but its intent mix is unknowable.

**Root cause.** Rank, not snippet copy. Average position 29.48 with 105 of 165 visible query impressions below position 50.

**Fix.** One JSON edit, near-zero risk, but reframe as opportunistic hygiene.
- `messages/es.json` `pageMeta.synastry.title` to `Sinastría: qué es y calculadora gratis` (38 chars, 49 with suffix). Do **not** use `Qué es la sinastría + calculadora gratis` — the accented interrogative "Qué" in a non-question reads wrong in español neutro, and `+` in titles is a common Google rewrite trigger.
- Description to `La sinastría compara dos cartas natales para medir la compatibilidad real. Calcula gratis conexión emocional, comunicación y pasión.` (132 chars).
- `messages/en.json` `pageMeta.synastry.title` to `Synastry: What It Is + Free Calculator`. Ship it because it is free, but book no upside — `/synastry` has **zero impressions** in the entire window despite being 200, `index, follow`, self-canonical and in the sitemap. That is a separate discoverability problem.
- Verify with `npx vitest run src/shared/i18n/__tests__/spb-keys-parity.test.ts src/shared/i18n/__tests__/spe-keys-parity.test.ts` plus `npm run typecheck`.

**Files.** `messages/es.json`, `messages/en.json`.

**Effort.** XS.

**Expected impact.** About 0-1 incremental clicks per 72-day window, addressing only the 40 impressions above position 12. **Do not log this as recovering the 554.** The real lever on this URL is ranking and internal linking for `sinastria` head terms.

**Verification.** PARTIAL. *"Every hard number I could recheck is correct, the live snippet is exactly as quoted, and it is NOT already fixed — but the causal story and the severity are inflated."* Two folklore flags: *"'a definition-led snippet at page-one bottom realistically converts 2-4%' — this is a fixed CTR-by-position table applied as law, and applied to the wrong position band"*; and *"'front 100 chars survives the mobile fold' — description truncation is pixel-width-based and variable."* One unsubstantiated claim removed: *"I read src/shared/seo/metadata.ts:97-100 — there is no bug to work around."*

---

#### [P3-5] `/es/essays` serves a hardcoded English title and description on a Spanish URL

**Evidence.** `src/app/[locale]/(content)/essays/page.tsx:21-37` — `getLocale()` at :22 feeds only canonical/hreflang/og:locale; `:24` and `:25-26` are English string literals. `getTranslations` is already imported at line 10. Both `messages/en.json` and `messages/es.json` have exactly 22 `pageMeta` namespaces and **neither** has `essays`. Live `/es/essays`: `<title>Sidereal Astrology Essays — Planet in Sign Interpretations…</title>` with `lang="es"` and `<h1>Ensayos de Astrología Sideral</h1>`. GSC: 0 clicks / 86 impressions / position 24.19. The trailing "…" is [P2-1] on the same page: 58-char title plus 11-char suffix = 69 over 60, so the brand is stripped too.

**Root cause.** The essays index predates the `pageMeta` i18n convention and was never migrated.

**Fix.** Mirror `src/app/[locale]/(app)/signs/page.tsx:32-40`: add `const tMeta = await getTranslations('pageMeta.essays')` and swap the two literals. Add the key to **both** catalogues (the SP-B/SP-E parity guards stay green that way). Budgets verified: ES title 47 chars, 58 with suffix (brand survives, which also repairs the truncation); EN 40, 51; descriptions 141 and 117, both under 155. No test couples to the current string (a grep for "Sidereal Astrology Essays" hits only this file and the unrelated `src/app/feed.xml/route.ts:41`).

**Files.** `src/app/[locale]/(content)/essays/page.tsx`, `messages/es.json`, `messages/en.json`.

**Effort.** XS (3 lines plus 2 JSON keys).

**Expected impact.** Fraction of a click per window. **Do not sell this as unlocking the ES essay cluster** — the 120 ES essay detail pages already emit correct Spanish titles (verified live: `/es/essays/sun-in-aries` renders `Sol en Aries (Sideral) — El Fuego Pionero | Estrevia`).

**Verification.** PARTIAL. *"CONFIRMED AS DESCRIBED — code, catalogues, live HTML, and GSC numbers all reproduce exactly."* But: *"the language-to-0%-CTR causation is refuted by the finding's own comparison page. The EN hub /essays has a perfectly language-matched title at position 11.00 and ALSO takes 0 clicks (0/22)... The explanation covering both hubs is position: avg 24.19 is page 3."* And: *"'An English-titled hub is a live relevance handicap on that entire subtree' is an unsupported mechanism, and it is the sole basis for P1."*

---

#### [P3-6] Tarot is 30.5% of the sitemap for 4.8% of clicks; the only winnable slice is deck-qualified queries

**Evidence.** 158 of 518 sitemap URLs (30.50%) are `/tarot/`; 76 of those have zero impressions. Returns: EN `/tarot/*` 27 URLs / 58 impressions / 0 clicks / weighted position 51.38; ES 55 URLs / 326 impressions / 6 clicks / 1.84% / 38.28. Combined 384 impressions (5.90% of page-dimension), 6 clicks (4.76%).

Query split: ES suit queries strictly **deck-agnostic** (Thoth removed) = 67 queries / 134 impressions / 0 clicks / weighted position **74.21**. ES suit **plus Thoth** = 6 queries / 13 impressions / 0 clicks / weighted position **9.31**. Gap 8.0x — but on a 13-impression sample with no query x page attribution available. EN Thoth-qualified = 22 queries / 30 impressions / position 48.53.

Thinness confirmed live: `/tarot/nine-of-wands` = 119 words, 8 unique internal hrefs of which exactly **one** is topical (`/tarot`); the other 7 are nav/footer. `/es/` mirror 128 words. Contrast `/signs/cancer` = 664 words / 21 unique internal / 12 topical. `cards.json` description median 26 words EN; `deckBridge` authored on **0 of 78** cards despite the render path shipping in `81a5dea`.

**Contamination the original finding omitted, and it is decisive:** the tarot minors SSR crash and hub orphaning were both fixed 2026-07-11 (commits `1fa9728`, `c55d367`, `9db3d12`) — **day 52 of 72**. 51 of 72 days (71%) of this data was collected on empty-shell, zero-inbound-link pages. All 5 tarot pages that earned clicks are Minor Arcana — the broken cohort.

**Root cause.** Built card-by-card at about 120 words with no interlinking, chasing generic Spanish card-name queries owned by established ES portals (Tarot de Tiziana appears as its own branded query: `6 de copas tiziana` 3 impressions, `10 de espadas tiziana` 2). The one differentiator — the Thoth deck plus the 777 correspondence graph — is nowhere in the internal link graph.

**Fix.** In this order.

**A. Measure before acting (costs nothing).** Pull GSC for 2026-07-11 onward only, page-filtered to `/tarot/`, against the 05-21..07-10 baseline. Re-pull at 8 and 12 weeks post-fix (about 2026-09-05 and 2026-10-03). Only then is a STOP/prune decision defensible.

**B. Ship the link graph now (S, half a day incl. tests).** `tarot/[cardId]/page.tsx` currently has one `<Link>` (line 140). Use the already-imported locale-aware `Link`. Mapping `card.astrology` to `/signs/{sign}` **must** go through an explicit exhaustive map or a validated regex with a null fallback: **30 of 78 cards have no zodiac sign** in that field (all 16 courts, all 4 aces, 10 majors), including `queen-of-swords` and `knight-of-swords` — two of the five click-earning pages. An unguarded parse is the same null hazard as the original `treeOfLifeConnects.join()` crash. Route `treeOfLifePath` through `buildCorrespondenceRows` (accept an optional href) so the crash guard stays the single choke point. Add sibling prev/next and suit-court links (pure derivation from `cards.json`). Add reciprocal links from `/signs/{sign}` and `/tree-of-life`. Test: every card page renders 3 or more topical anchors, and no card with a null astrology-sign emits a `/signs/` href.

**C. Content depth — founder-authored, wider legal corpus (L, cap at about 15 cards).** Fill the existing `deckBridge` field rather than inventing a mechanism. The legal corpus is wider than assumed: pre-1929 Crowley **and** Waite's *Pictorial Key to the Tarot* (1911) **and** traditional Marseille meanings are all public domain (REPORT.md:111 already cleared these). Book of Thoth (1944) text and Harris imagery remain off-limits; `cards.json` correctly has no image field. Drop the "400+ words" bar — it is not a Google threshold. Note the queries are Marseille-flavoured as much as Thoth (`10 de bastos tarot marsella` position 53, `6 de copas tarot marsella` 81, `9 de bastos tarot marsella` 69), so a public-domain Marseille/Waite bridge paragraph serves both from one authoring pass.

**DROP the prune.** Do not noindex the 76 zero-impression tarot URLs or remove them from `src/app/sitemap.ts`. Their zero-impression status was measured across 51 days of empty shells; `tarot/page.tsx` now server-renders 79 crawlable anchors (`9db3d12`), so noindexing 76 re-creates the crawl dead-end the P0 fix just removed; `isPairReady` gates on **authored-content validity**, not impressions, so mirroring it against traffic inverts its semantics; and crawl-budget savings at 518 URLs are negligible.

**Do not reallocate freed effort to ES essays** as the original finding proposed. The 4.01% CTR template is **EN** essays. ES essays are 13 URLs / 33 impressions / 0 clicks / 0.00% at weighted position 7.54 — the worst family measured, below ES tarot, and a demand problem rather than a ranking problem. The demonstrated best template is **ES planetary-hours-cities** (15 URLs / 366 impressions / 16 clicks / 4.37%).

**Files.** `src/app/[locale]/(content)/tarot/[cardId]/page.tsx`, `src/app/[locale]/(app)/signs/[sign]/page.tsx`, `src/app/[locale]/(app)/tree-of-life/page.tsx`, `content/tarot/cards.json`.

**Effort.** S for B; L for C.

**Expected impact.** B is cheap structural repair. C targets about 15 deck-qualified cards already at weighted position 9.31 — moving 13 impressions to top-5 at 6% CTR is roughly 1 click/window.

**Verification.** PARTIAL. *"the arithmetic is almost all correct, but the causal inference is contaminated and the redeployment recommendation is factually wrong."* On contamination: *"For 51 of 72 days the tarot minors served empty SSR shells AND had zero crawlable internal links... 'EN tarot 0 clicks, therefore not winnable' are inferences drawn overwhelmingly from a period in which those pages were structurally incapable of ranking."* On the fix: *"MATERIAL FACTUAL ERROR — the 4.01% CTR belongs to EN essays. ES essays are the worst-converting family in the entire export."* And: *"A CRASH-CLASS BUG IN THE PROPOSED LINK WIRING — 30 of 78 cards have no zodiac sign."*

---

#### [P3-7] Zero rich-result appearances is the correct output for this schema mix

**Evidence.** `Search appearance.csv` is 49 bytes, header row only; the GSC API confirms 0 rows at `dataState='final'` and `'all'`. Yet all JSON-LD parses: `/` and `/es/` emit Organization + SoftwareApplication + WebSite + HowTo + FAQPage; `/essays/sun-in-leo` emits Organization + Article + FAQPage + BreadcrumbList; `/pricing` emits Product. URL Inspection returns `richResultsResult` verdict **PASS** with `detectedItems [{richResultType: 'Breadcrumbs'}]` on `/es/synastry` and `/essays/sun-in-scorpio` — Google *is* detecting breadcrumbs.

Mapping each emitted type: FAQPage was restricted to authoritative government/health sites (Aug 2023) so it cannot fire here; HowTo rich results were retired entirely (Sep 2023); `WebSite.potentialAction` is deliberately null (`json-ld.ts:143-145`, and the sitelinks searchbox was removed Nov 2024 anyway); Article/Organization/SoftwareApplication/DefinedTerm/ItemList are not GSC Search-Appearance dimension values; BreadcrumbList is reported under Enhancements, never as a Search Appearance row.

**Root cause.** The two rich-result-capable types the site emits were both deprecated by Google in 2023.

**Fix.** Record in the roadmap that an empty Search appearance report is **expected** for this schema mix, so it stops being re-audited. Then close two real gaps: (1) pass an `image` to `articleSchema` in `signs/[sign]/page.tsx:164` and `sidereal-dates/[sign]/page.tsx` (26 URLs currently ineligible for any image treatment — reuse the OG asset once [P2-2] lands, or `/opengraph-image` as fallback); (2) in `pricing/page.tsx:36-57` add `image`, `priceValidUntil`, per-offer `name`/`sku`, and make the offer `url` locale-aware. **Do not invent `aggregateRating`** — fabricated ratings violate Google's review policy. Also fix the two hardcoded FAQPage questions on `/why-sidereal` ("How accurate is Estrevia's chart calculation?" and "Is Vedic astrology the same as sidereal astrology?") that do not appear in the rendered page — visible-content mismatch is a structured-data quality violation regardless of whether the rich result exists.

**Files.** `src/shared/seo/json-ld.ts`, `src/app/[locale]/(app)/signs/[sign]/page.tsx`, `src/app/[locale]/(app)/sidereal-dates/[sign]/page.tsx`, `src/app/[locale]/(marketing)/pricing/page.tsx`, `src/app/[locale]/(marketing)/why-sidereal/page.tsx`.

**Effort.** S.

**Expected impact.** No rich results recovered — that is the finding. Value is avoided waste plus removing a policy exposure on `/why-sidereal` in both locales.

**Verification.** Not independently attacked (this finding *is* an anti-claim). The 2023 deprecation dates come from model knowledge, not a doc fetched during the audit — **confirm against developers.google.com/search/docs/appearance/structured-data/search-gallery before acting.**

---

### 4.5 Not independently verified

These were generated by investigators but did **not** go through an adversarial verification pass. Severities are the generators' own and should be treated as unconfirmed. Several are the highest-leverage items in the report, which is exactly why they need verification before they are trusted.

| # | Title | Claimed sev | Core claim | What would confirm it |
|---|---|---|---|---|
| U1 | **ES cities hub links to English URLs** — **VERIFIED 2026-08-02 by the lead auditor, treat as CONFIRMED** | P1 | `planetary-hours-cities/page.tsx:2` imports `next/link` (the only such import in `src/app`) and passes an inert `locale` prop at about line 55, so `/es/planetary-hours-cities` emits 20 unprefixed EN hrefs and zero `/es/` hrefs. Those 15 ES city URLs earn **16 of 126 clicks (12.7%)** at 4.37% CTR with zero inbound internal links. Fix is one import swap to `@/i18n/navigation` plus dropping the dead prop. | **Done.** Live fetch of `https://estrevia.app/es/planetary-hours-cities` as Googlebot, 2026-08-02: `href="/es/planetary-hours-cities/<city>"` = **0**, `href="/planetary-hours-cities/<city>"` = **20** (amsterdam, barcelona, bogota, buenos-aires, …). Source line 2 confirmed as `import Link from 'next/link';`. The remaining unverified half is the *click attribution* (whether de-orphaning is what lifts those 16 clicks) — that stays a hypothesis, testable at 8 weeks per section 8. |
| U2 | **Three clusters have zero inbound internal links** | P1 | 24 `/sidereal-*-dates` (285 impr / 4 clicks), 40 city URLs plus 2 hubs (618 impr / 21 clicks), 2 compatibility hubs (7 impr) have zero server-rendered anchors. Overlaps [P2-8], which verified the dates half. | Re-run the href grep over the full fetched corpus for the cities and compatibility patterns. |
| U3 | **No crawlable EN/ES anchor exists** | P1 | `LanguageSwitcher.tsx:43-57` renders a `<button role="radio" onClick>`, not an anchor, so zero internal PageRank crosses the locale boundary in either direction. `/es/` links to only 9 ES sections and zero to `/es/hours`, `/es/planetary-hours-cities`, `/es/signs`, or any `/es/sidereal-*-dates`. Six ES pages recorded zero impressions in 72 days. | Confirm hreflang is present (it is), then test whether adding real anchors moves ES impressions over 8 weeks. Note this competes with [P3-5]'s finding that position, not linking, explains the EN hub's zero clicks. |
| U4 | **ES synastry cluster has no destination for its definitional intent** | P1 | 36 queries / 204 impressions / 0 clicks / weighted position 60.78, bimodal at `que es sinastria` (39 impr, position 10.92) vs head terms at 48-96. Proposes a dedicated `/es/que-es-la-sinastria` explainer. | Overlaps [P3-4], whose verifier established position 10.92 is page **two** and that the existing page already answers the question in an H2 plus FAQPage. Treat the new-page proposal as unjustified until the title change in [P3-4] has been measured. |
| U5 | **ES sign-name policy contradiction** | P1 | Same mechanism as [P2-3], stated as a policy conflict: `/es/signs/gemini` renders "Gemini sideral" while `/es/sidereal-gemini-dates` renders "Fechas de Géminis Sideral". Proposes dual-form titles plus rewriting 120 keyword arrays. | [P2-3]'s verifier already established the keyword-array half is folklore. The dual-form title proposal is untested. |
| U6 | **Accept-Language 307-redirects every EN URL** | P2 | A request with `Accept-Language: es-MX` to `/essays/sun-in-leo` returns 307 to `/es/essays/sun-in-leo`, with `cache-control: public` and **no `Vary` header**. Applies to every unprefixed path, not just root. next-intl `localeDetection` defaults on and `src/i18n/routing.ts` never disables it. Risk: if Google starts locale-adaptive crawling, all 259 EN URLs (78 of 126 clicks) become 307s. | Vercel/Cloudflare logs filtered to Googlebot plus non-empty Accept-Language. No evidence Googlebot currently sends one — EN indexes fine today. |
| U7 | **Tarot metadata streams into the body for Googlebot** | P2 | On `/es/tarot/nine-of-wands`, `</head>` closes at byte 3,222 and `<title>` first appears at byte 193,027. For Twitterbot the same URL puts it in `<head>` at byte 2,774. Next.js `htmlLimitedBots` behaviour; scope is 156 of 518 URLs. Googlebot's rendered pass probably recovers the tags, so this likely does **not** explain the position-70 rankings — but Bingbot's fast path, GPTBot, ClaudeBot and PerplexityBot see no title at all. | Byte-index assertion in a smoke test; and confirm whether non-rendering crawlers matter given the LLM-citation query cluster at weighted position 8.75. |
| U8 | **Contradictory sidereal date ranges across two indexable pages** | P2 | `/signs/leo` says "August 16 – September 15"; `/sidereal-leo-dates` says "August 17 to September 17". Spanish twins carry the same contradiction. Three independent sources: `content/signs/descriptions.json`, hand-written `messages/*.json` literals, and the live `getSunInSignRange()` ephemeris. Taurus and Sagittarius also diverge. | Trivially checkable. Fix by making the ephemeris the single source and adding a 12-sign parity test. This is a factual-accuracy problem on the one page type whose entire value proposition is date accuracy. |
| U9 | **E-E-A-T dormant** | P2 | `FOUNDER_NAME` placeholder means 264 indexable articles carry `author: Organization` with no `url`/`sameAs`; `/about` noindexed and out of the sitemap; the single `sameAs` 404s. | The 404 sameAs is confirmed in [P3-1]. The authorship half is a founder decision (section 7), not an engineering finding. |
| U10 | **Missing methodology / Tree-of-Life child pages** | P2 | 9 queries / 11 impressions at weighted position **8.73** — better than any other cluster — are documentation-shaped ("swiss ephemeris official documentation sidereal lahiri ayanamsha" position 7, "kabbalistic tree of life chesed jupiter correspondence golden dawn" position 4). No `/methodology`, no `/lahiri-ayanamsa`, no `/tree-of-life/{sephira}` exists. Source data is in-repo and unexposed (`content/correspondences/777.json`, `content/kabbalah/`). | Click upside is about zero by construction (these are retrieval-shaped queries). Value is AI-citation surface, which GSC cannot measure. Verify by tracking mentions in ChatGPT/Perplexity/Claude answers, not by clicks. |
| U11 | **Compatibility enrichment allowlist is demand-blind** | P2 | All 12 files in `content/compatibility/enriched/` contain 21 occurrences of `__PLACEHOLDER__` each, so `isPairReady()` returns false for every pair and all 156 URLs stay noindex indefinitely. The 12 allowlisted pairs cover 9 of 109 observed pair impressions (8.3%) and contain **zero** of the top-12 by demand. | Trivially checkable. Decide explicitly: author 6 demand-ranked pairs, or delete the machinery. Do not leave it half-built. |
| U12 | **EN calculator cluster is unwinnable as framed** | P2 | 15 EN queries / 70 impressions / 0 clicks / weighted position 35.33, of which the "true sidereal" subfamily is 8 queries / 19 impressions — intent the Lahiri-only engine cannot serve by design. Recommends stopping EN calculator optimization and publishing one honest disambiguation page. | The 19 impressions of unservable intent are directly checkable in Queries.csv. The "stop" recommendation needs no verification to act on. |
| U13 | **"carta astral" appears zero times in the ES corpus** | P2 | A grep for "carta astral" over `messages/es.json` and all 120 files in `content/essays/es/` returns 0 matches, yet the phrase family draws 123 impressions including `carta astral sideral` at 71 impressions / position 9.76. Also flags `/es/` outranking `/es/chart` 92%/8% for the calculator cluster. | Grep is trivially reproducible. The cannibalization half needs a query x page cross-tab. |
| U14 | **ES tarot renders correspondences in English** | P2 | `/es/tarot/nine-of-wands` renders "Moon in Sagittarius" (twice), "Yesod (Foundation)", "Atziluth (Emanation / Fire)" inside a 128-word Spanish page, because `cards.json` stores `astrology` as a bare English string with no locale object. About 12 planet-by-sign strings plus 10 sephirah and 4 world names. | Trivially checkable live. Small bounded fix on the locale where tarot currently ranks best. |
| U15 | **hreflang verdict: keep bare `es`** | P3 | Explicitly closes the es-419 question. Spain is the #2 country by clicks (18 / 693) and es-419 excludes Spain, so switching would drop 693 impressions to x-default = English. Also flags the `/es` vs `/es/` trailing-slash mismatch across HTML canonical, sitemap and the next-intl `Link:` header. | The Spain numbers are verified in section 3.5. Record the decision in a comment at `metadata.ts:142-146` so it is not relitigated. |
| U16 | **Case and trailing-slash variants serve 200s** | P3 | `/Terms`, `/signs/ARIES`, `/terms/`, `/es/TAROT/two-of-disks` all return 200 with correct self-canonicals. `next.config.ts:128` sets `skipTrailingSlashRedirect: true` (added for the PostHog proxy). Zero of 347 Pages.csv rows contain such a variant, so nothing is indexed through them. | Fix alongside [P2-4], not on its own. |
| U17 | **`/sidereal-*-dates` breadcrumb middle node points at the homepage** | P3 | Positions 1 and 2 are the same URL differing only by trailing slash; `/sidereal-dates` 404s and is linked from nothing. Overlaps [P2-8] item 4. | Confirmed in [P2-8]'s verification. |

---

## 5. Already fixed or refuted

Do not re-litigate these.

| Item | Status | Evidence |
|---|---|---|
| **Tarot SSR crash on 112 URLs** (prior P0) | **FIXED 2026-07-11** | `/tarot/two-of-wands` = 1 `<h1>`, 768 visible chars (audit measured 188 chars, 0 h1). `/es/tarot/queen-of-cups` 898 chars. Commits `c55d367`, `1fa9728`, `245b931`. |
| **Tarot orphans** (prior P0) | **FIXED** | Both hubs server-render 79 crawlable card anchors. Commit `9db3d12`. |
| **Fake 2024 lastmod dates on 240 sitemap entries** | **FIXED** | 518 `<lastmod>`, zero starting with 2024. Commits `39cc155`, `77b4d64`. |
| **404 Organization logo** | **FIXED** | All JSON-LD emits `https://estrevia.app/icons/icon-512.png` returning HTTP 200, 29,773 bytes. Commit `0ef3f57`. |
| **hreflang used `en-US`** | **FIXED** | Now bare `en`/`es`/`x-default` in both `<head>` and sitemap. Commit `c0ac2c0`. |
| **robots.txt had two `User-Agent: *` groups** | **FIXED** | Single group. Commit `0eedc4a`. |
| **Compatibility pair stubs indexed** | **FIXED** | All 156 return `noindex, follow`; 0 pair URLs in the sitemap. Commit `abc7e2f`. |
| **ES pages emitting EN URLs in essay JSON-LD** | **FIXED for essays only** | `/es/essays/sun-in-leo` emits `/es/` throughout. Commit `92a3707`. 113 other ES URLs still broken, see [P2-5]. |
| **Clerk JS on essay/tarot pages; Meta Pixel pre-consent** | **FIXED** | Essay HTML has 4 `clerk` occurrences (preconnect only) vs 17 on `/chart`. Landing page pre-consent has 0 `fbq`. Commits `5884420`, `2c50f36`, `5424c9b`. |
| **ES pages rendering English planet names** | **FIXED** | `/es/planetary-hours-cities/madrid` renders Luna/Saturno/Júpiter/Marte/Sol/Venus/Mercurio. Commits `176027c`, `f348805`. |
| **react-markdown `node="[object Object]"` prop leak** | **FIXED** | 0 occurrences. Commit `0a74808`. |
| **ES FAQPage missing on essays and synastry** | **FIXED** | 6 questions live on both. Commits `f0bdec1`, `abdeeaa`. |
| **www.estrevia.app "remains indexed as a second homepage"** | **REFUTED** | GSC API with `dimensions=date,page`: www has exactly 18 daily rows, all between 2026-05-21 and **2026-06-07**. Zero www impressions on every day from 06-08 through 08-01 (55 consecutive days). Apex impressions grew monotonically over the same sub-windows (0, 20, 48, 64, 96, 110) as www decayed (61, 104, 0, 0, 0, 0), crossing over in **mid-June, a month before the 07-11 deploy**. URL Inspection on the www URL: `coverage_state: "Page with redirect"`, `google_canonical: "https://estrevia.app/"`, `match: true`. **Google already consolidated www to apex on its own despite the 307.** All 165 impressions are stale data trapped in the 3-month window. The 307-to-308 toggle in [P2-6] is still worth doing as free hygiene, but the harm it describes is already gone. Also: query `estrevia` over 2026-07-11..07-31 is 2 clicks / 190 impressions at **position 1.8**, better than the 2.72 full-window average and far better than the 3.61 baseline in the 07-06 audit. |
| **Founder-op O1 gating T19 (SAME_AS_URLS appends)** | **Gate can be released** | `outputs/SEO-plans-07-11/03-phase3-gated-backlog.md:919-921` gates T19 on O1 shipping first. Google already canonicalizes www to the apex, so profile anchors point at a consolidated entity regardless. |

---

## 6. Prioritized action plan

Ordered by **impact divided by effort**, stated explicitly. Because no P0 or P1 survived verification, "This week" is a list of cheap high-confidence correctness fixes, not emergency work.

### This week — 6 items, all XS or S, roughly half a day total

| # | What | File | Effort | Expected impact | Why this rank |
|---|---|---|---|---|---|
| 1 | **Swap the Link import.** Change line 2 to `import { Link } from '@/i18n/navigation'` and delete the inert `locale` prop at about :55 | `src/app/[locale]/(marketing)/planetary-hours-cities/page.tsx` | XS (1 line) | Gives 15-20 ES city URLs their first inbound internal links. That template already converts at **4.37% CTR, 16 of 126 clicks** with zero internal support. Best ratio in the report. **The 0-vs-20 href count was verified live on 2026-08-02** (see U1) — no pre-check needed; the click *upside* remains a hypothesis | Highest claimed impact, smallest diff, on the site's second-best template |
| 2 | **Shorten the ES landing title.** `messages/es.json:396` to `"Carta Natal Sideral Gratis — Calculadora Lahiri"` (47 chars) | `messages/es.json` | XS | Restores the brand token on the page carrying 1,487 impressions (26% of the property) with no code change. Simulated: renders 58 chars, brand intact | Fixes the most-seen instance of [P2-1] without the test churn |
| 3 | **www to 308.** Vercel Dashboard, Domains, `www.estrevia.app`, 308 Permanent | (none) | XS | About 0 clicks (Google already consolidated, see section 5). Do it because it is a 60-second toggle with zero risk | Free; also releases the T19 gate |
| 4 | **Delete the 404 sameAs.** Remove `https://x.com/estrevia_app` from `SAME_AS_URLS` (or register the handle), fix the false comment at `:41`, and fix the matching footer href | `src/shared/seo/constants.ts`, `src/shared/components/SeoChrome.tsx` | XS | Stops advertising a dead profile in Organization JSON-LD on about 380 pages and as a sitewide footer link | Self-inflicted, zero-risk, currently shipping a broken outbound link everywhere |
| 5 | **Remove the tarot `.slice()`.** `description: localizedDescription,` and let `createMetadata` truncate | `src/app/[locale]/(content)/tarot/[cardId]/page.tsx:93` | XS (1 line) | Restores word-boundary plus "…" on 125 URLs currently cut mid-word ("…y la presencia magné"). Those URLs carry 262 impressions / 4 clicks | One line, visibly broken output |
| 6 | **Fix the OG tracing include.** Add the `@vercel/og` compiled dir and `public/fonts` to `outputFileTracingIncludes` under `'/api/og/**'`; fix the passport route in the same change; add a **GET** smoke assertion | `next.config.ts` | XS | Restores 264 sitemap image entries and 242 essay `og:image`. Zero measured organic demand, but the Cosmic Passport share card is likely broken too | Cheap, and the passport half is the product's viral mechanic |

Also this week, at zero cost: **stop reporting site-wide CTR% as a KPI** ([P3-2]) and **record that an empty Search appearance report is expected** ([P3-7]), so neither is re-investigated.

### This month

| # | What | File | Effort | Expected impact |
|---|---|---|---|---|
| 7 | **ES essay sign localization (T1).** Render-layer swap of the English sign token via the existing `spanishSignVariant()` — title, H1, Article headline, breadcrumb, OG. Zero MDX edits, one-line revert | `src/app/[locale]/(content)/essays/[slug]/page.tsx`, `src/shared/lib/astro-i18n.ts` | S (about 1h) | Unlocks 107 dead URLs (21% of sitemap) in the market supplying 48.9% of impressions. Demand ceiling honestly small (39 visible Spanish sign-token impressions), but the corpus already exists and the map is already written |
| 8 | **Essays hub metadata (T2).** Add `pageMeta.essays` to both catalogues and use `getTranslations` | `src/app/[locale]/(content)/essays/page.tsx`, `messages/{en,es}.json` | XS | Stops serving an English snippet on an ES URL. Also repairs that page's brand truncation. Ship regardless of the T1 outcome |
| 9 | **De-orphan `/sidereal-*-dates` and differentiate titles.** Reciprocal links, retitle both title sources, fix the invalid breadcrumb | `src/app/[locale]/(app)/signs/[sign]/page.tsx:337`, `sidereal-dates/[sign]/page.tsx`, `messages/{en,es}.json` | S | 24 URLs get their first internal inbound links. Ceiling about +13 clicks/window |
| 10 | **Reconcile the sidereal date ranges (U8).** Make `getSunInSignRange()` the single source; add a 12-sign parity test | `sidereal-dates/[sign]/page.tsx`, `signs/[sign]/page.tsx`, `content/signs/descriptions*.json` | S | Stops publishing two different answers to the same factual question on the page type whose value proposition is date accuracy. Do this **before** any copy quoting a date range ships |
| 11 | **`buildTitle` reorder plus test repair.** Reserve `TITLE_SUFFIX` before truncating; fix `metadata.test.ts:32` and `:241-251`; add the invariant test | `src/shared/seo/metadata.ts`, `src/shared/seo/__tests__/metadata.test.ts` | M | 179 URLs stop shipping brand-less titles and 114 stop shipping an orphan-pipe ellipsis. Also fixes `og:title`/`twitter:title` cards. **No CTR gain is expected** (position-matched test is null) |
| 12 | **Tarot internal link graph (B only).** Sibling/suit/sign/tree links with the exhaustive null-safe sign map | `tarot/[cardId]/page.tsx`, `signs/[sign]/page.tsx`, `tree-of-life/page.tsx` | S (half day) | Structural repair on 30.5% of the sitemap. **Do not prune the 76 zero-impression URLs** — only 21 days of clean post-fix data exist |
| 13 | **Decide the compatibility cluster (U11).** Either swap `ENRICHED_PAIRS` to the six demand-ranked slugs and author real 300+ word EN and ES bodies, or delete the machinery and repoint the hub at `/synastry` | `src/shared/seo/compatibility-pairs.ts`, `content/compatibility/enriched/` | M or XS | Option A targets 32% of pair demand instead of 8.3%. Option B removes 156 crawl sinks. Either beats 12 placeholder files that can never open the gate |

### This quarter

| # | What | Effort | Expected impact |
|---|---|---|---|
| 14 | **Prerendering plus soft-404 fix** ([P2-4], staged: soft-404s, then root-layout hoist, then cookie removal, then Playwright test). Gate step 3 on step 2 actually flipping routes to SSG in the build | M | Removes an unbounded soft-404 space and 518 origin invocations per crawl pass. Relevant because 48.9% of impressions come from Spanish-speaking markets served from `iad1`. No click recovery claimable |
| 15 | **ES JSON-LD locale helper** ([P2-5]) across 14 files plus parity test | M | Removes a self-contradiction on 113 of 259 ES URLs. Signal hygiene, not a rank play |
| 16 | **Description source-length pass** ([P2-7]): city template, 24 `siderealDates.*` strings, `signs/[sign]`, plus source-side tests including interpolated templates | M | Stops shipping machine-cut copy on the highest-click truncated template (618 impressions / 21 clicks) |
| 17 | **Publish `/methodology` and `/tree-of-life/{sephira}`** (U10) from `content/correspondences/777.json` and `content/kabbalah/` | M | Click upside about zero by construction. Value is AI-citation surface: 7 documentation-shaped queries already sit at weighted position **8.75**, the best of any cluster. Measure via LLM answer mentions, not GSC |
| 18 | **Tarot content depth (C), capped at about 15 cards with impressions**, using the public-domain Waite/Marseille corpus for `deckBridge` | L | Only after the step-A measurement at 8 and 12 weeks post-fix says the cluster is recoverable |
| 19 | **STOP list.** Do not optimize for "true sidereal" (U12 — 19 impressions of intent a Lahiri-only engine cannot serve). Do not chase generic ES minor-arcana (134 impressions / 0 clicks at weighted position 74). Do not rewrite the 120 ES `keywords` arrays. Do not build content targeting the stevia/Estreva collision | — | Avoided waste |

---

## 7. Gated on the founder

A developer cannot do these.

| # | Action | Exact step | Blocking |
|---|---|---|---|
| F1 | **www to 308 Permanent** | Vercel Dashboard, project `estrevia`, Settings, Domains, `www.estrevia.app`, change redirect status code from 307 Temporary to 308 Permanent. Verify: `curl -sSI https://www.estrevia.app/` piped to `head -1` returns `HTTP/2 308`. Also re-check `/es/` and one deep path | Founder-op O1, never executed (`outputs/SEO-plans-07-11/00-roadmap-spec.md:95`, unchecked box at `01-phase1-recrawl-unblock.md:961`) |
| F2 | **@estrevia_app X handle** | Either register the handle, or tell the developer to delete the entry from `SAME_AS_URLS`. It currently 404s and ships on every page plus the footer | Action item 4 |
| F3 | **`FOUNDER_NAME` — personal disclosure decision** | `constants.ts:4-9` documents this as a deliberate dormant privacy gate: "nothing publishes the founder's identity until it is set to a real name here." Setting it publishes a real individual's name to `/about` (both locales), the sitemap, the footer, and `Article.author` on **every essay**. This is a yes/no personal decision, not an engineering task. If yes, the code change is one line and the gate handles the rest | [P3-1] item 3, U9 |
| F4 | **GSC recrawl for `/tarot/*` and both hubs** | Search Console, URL Inspection, request indexing on `/tarot`, `/es/tarot` and a sample of 5-10 card URLs. Prior founder-op O3; no evidence it was ever submitted, and tarot head terms are still at position about 70 three weeks post-fix | Blocks the tarot measurement in section 8 |
| F5 | **Confirm the 2023 rich-result deprecation dates** | One page load: developers.google.com/search/docs/appearance/structured-data/search-gallery. [P3-7]'s conclusion (stop investigating the empty Search appearance report) rests on FAQ being restricted to gov/health in Aug 2023 and HowTo removed Sep 2023, which came from model knowledge rather than a fetched doc | [P3-7] |
| F6 | **Compatibility enrichment content** | 6 demand-ranked pairs, both locales, 300+ words each meeting `isPairReady()` (3+ sections, 3+ FAQ, no `__PLACEHOLDER__`). Or authorize deleting the machinery. `content/` is proprietary and needs an explicit ask | Action item 13 |
| F7 | **ES essay body prose (T3)** | Only after T1 has run 4-6 weeks. Requires an explicit CLAUDE.md i18n amendment (the "sign names untranslated" rule is already violated by `/es/sidereal-*-dates`). Hand-edited per file, not sed — gender and article agreement | [P2-3] T3 |
| F8 | **Rich Results Test on one EN and one ES essay** | Prior founder-op O2, unconfirmed. Cheap sanity check that `Article.image` is valid once [P2-2] lands | [P3-7] |

---

## 8. Measurement plan

Baselines are the verified 2026-05-21..07-31 window. **Primary KPI is clicks/day and non-brand clicks/day, not site-wide CTR%** ([P3-2]). Current baseline: 1.75 clicks/day overall, 1.86 clicks/day post-07-11.

### At 2 weeks (about 2026-08-16) — did the cheap fixes deploy correctly?

Binary checks, not traffic:

| Check | Command / source | Pass condition |
|---|---|---|
| OG route | `curl -sS -o /dev/null -w '%{http_code} %{content_type}\n' https://estrevia.app/api/og/essay/sun-in-leo` | `200 image/png` (GET, never HEAD) |
| Passport OG | same, with a real passport ID | `200 image/png` |
| ES cities hub | grep the live ES hub HTML for `href="/es/planetary-hours-cities/` | **20** (was 0) |
| www redirect | `curl -sSI https://www.estrevia.app/` piped to `head -1` | `HTTP/2 308` |
| ES landing title | grep the live `<title>` on `/es/` | contains the ` \| Estrevia` suffix, no trailing orphan pipe |
| sameAs | grep live JSON-LD for `x.com/estrevia_app` | absent, or the URL returns 200 |
| Tarot descriptions | crawl 10 `/es/tarot/*`, measure description length | none exactly 155 with no ellipsis |

### At 4 weeks (about 2026-08-30) — early directional signal

| Metric | Baseline | Target | Source |
|---|---|---|---|
| Clicks/day (28d) | 1.86 (post-fix) | 1.86 or better, i.e. no regression | Chart.csv |
| ES `/planetary-hours-cities/*` impressions | 366 / 72d = 5.1/day | 6.5/day or better (+27%) if U1 shipped | Pages.csv filtered |
| ES `/planetary-hours-cities/*` clicks | 16 / 72d | 9 or more in 28d (pro-rata is 6.2) | Pages.csv |
| ES `/essays/*` URLs with 1 or more impressions | 13 of 120 | **25 or more** if [P2-3] T1 shipped | Pages.csv |
| ES `/essays/*` impressions | 33 / 72d | 30 or more in 28d | Pages.csv |
| ES differing-sign essays impr/URL | 0.05 | **0.30 or better** (this is the single number that tests the T1 hypothesis) | Pages.csv, split by sign |
| `/es/essays` hub position | 24.19 | any improvement; expect little | Pages.csv |
| `/sidereal-*-dates` clicks | 4 / 72d | 3 or more in 28d | Pages.csv |
| Soft-404s | 5 route families return 200 | all five return 404 | curl |
| Search appearance rows | 0 | **still 0 — this is the expected result** | Search appearance export |

Also at 4 weeks: pull GSC with the **query x page** dimension (the flat CSV export cannot do this). Two questions it answers that nothing else can: whether any single query alternates between `/signs/{s}` and `/sidereal-{s}-dates` (the cannibalization hypothesis in [P2-8]), and what the 389 unattributed impressions on `/es/synastry` actually are.

### At 8 weeks (about 2026-09-27) — verdicts

| Question | Metric | Verdict threshold |
|---|---|---|
| Did ES sign localization work? | ES `/essays/*` impressions and clicks | **150+ impressions and 2+ clicks** in 28d means continue to T3. **Under 60 impressions** means the Spanish sign-token demand does not exist at this sample size; stop, and do not spend on T3 |
| Did the cities de-orphaning work? | ES cities clicks, 28d | **12 or more** means the internal-linking hypothesis holds; extend the pattern. **7 or fewer** means linking was not the constraint |
| Is tarot recoverable? | `/tarot/*` and `/es/tarot/*` impressions vs the 05-21..07-10 baseline (58 EN / 326 ES), post-07-11 window only | Weighted position **under 30** and 2+ clicks means author `deckBridge` for the ~15 cards with impressions. Position still over 40 means cap tarot investment permanently |
| Did prerendering land? | `npm run build` route table | essays and tarot show SSG, not dynamic. If not, the root-layout hypothesis in [P2-4] is wrong; drop steps 3-4 rather than cargo-culting them |
| Is the property actually growing? | non-brand clicks/day, 28d, excluding query `estrevia` | Baseline 121 clicks / 72d = 1.68/day. **2.1/day or better (+25%)** would be the first evidence any of this moved the needle |
| Re-run the trend correctly | pre-only vs post-only split OLS on impressions; impression-weighted position by ISO week | Do **not** fit one line across the whole window, and do not read r2 near 0 as "flat" |

Sampling caveat to carry into every re-measurement: Queries.csv covers 35.4% of impressions and 19.0% of clicks, and Pages.csv sums to 114.8% of the property impression total. Query-level tail counts are floors; page-dimension percentages are not shares of the site denominator.

---

## 9. Appendix

### A. Query clusters (Queries.csv, 315 rows, 24 clicks / 2,007 impressions = 35.4% impression coverage)

| Cluster | Queries | Clicks | Impressions | CTR | Weighted position |
|---|---|---|---|---|---|
| Brand (`estrevia`) | 1 | 5 | 584 | 0.86% | 2.72 |
| ES natal chart calculator | 29 | 11 | 638 | 1.72% | 12.05 |
| ES synastry / compatibility | 37 | 0 | 205 | 0.00% | 60.81 |
| ES tarot minor arcana | 73 | 0 | 141 | 0.00% | 73.72 |
| Sidereal generic | 18 | 0 | 82 | 0.00% | 40.00 |
| Planetary hours | 21 | 7 | 76 | **9.21%** | 23.62 |
| EN sidereal calculator | 18 | 0 | 75 | 0.00% | 35.48 |
| Sign meanings / dates | 29 | 1 | 71 | 1.41% | 27.24 |
| EN Thoth tarot | 29 | 0 | 44 | 0.00% | 37.05 |
| Sign-pair compatibility | 20 | 0 | 31 | 0.00% | 80.74 |
| Madrid planetarium (off-intent) | 9 | 0 | 24 | 0.00% | 79.71 |
| Kabbalah / Tree of Life | 13 | 0 | 16 | 0.00% | 30.44 |
| **LLM / citation research** | 7 | 0 | 8 | 0.00% | **8.75** |
| EN tarot other | 7 | 0 | 7 | 0.00% | 73.29 |

Sub-cluster worth noting: **ES suit plus Thoth** = 6 queries / 13 impressions at weighted position **9.31**, versus ES suit deck-agnostic = 67 queries / 134 impressions at **74.21**. An 8.0x gap on a 13-impression sample with no query x page attribution — treat as a hypothesis.

Position distribution across all 315 queries: 0-3 = 3 queries / 586 impressions / 5 clicks (99.8% of those impressions are the brand row); 3-10 = 31 / 427 / 12; 10-20 = 27 / 371 / 6; 20-100 = **254 queries (80.6%) / 623 impressions / 1 click / 0.16% CTR**. Excluding the brand row, query-weighted average position is 33.44, not 24.50.

Data artifact: `Queries.csv` line 58 is a row whose *query text* is itself a pasted CSV record (`"virgo capricorn,2,1060,0.19%,51.08",0,4,0%,97.5`). Correctly RFC4180-quoted, so `csv.DictReader` handles it; naive line-splitting parsers will shift every column on that row. Its metrics (0/4/0%/97.5) match `/compatibility/capricorn-virgo` exactly.

### B. Zero-click pages at position 12 or better with 10 or more impressions — 54 URLs / 1,339 impressions

**Read this table with [P3-3]'s correction in mind: the binomial null at the site's own 2.22% CTR predicts 65.1 such pages. Observed 54 is *fewer* than chance.**

| URL | Impressions | Position |
|---|---|---|
| /terms | 155 | 6.10 |
| /es/signs | 127 | 10.44 |
| /signs/pisces | 50 | 6.32 |
| /planetary-hours-cities/barcelona | 45 | 7.16 |
| /es/sidereal-leo-dates | 44 | 8.05 |
| /planetary-hours-cities/toronto | 41 | 9.80 |
| /es/planetary-hours-cities/los-angeles | 40 | 9.93 |
| /essays/saturn-in-taurus | 31 | 7.71 |
| /es/planetary-hours-cities/bogota | 29 | 7.55 |
| /essays/saturn-in-pisces | 29 | 8.52 |
| /essays/saturn-in-aquarius | 29 | 8.69 |
| /essays/sun-in-aquarius | 27 | 6.48 |
| /es/signs/leo | 26 | 6.69 |
| /essays/sun-in-libra | 26 | 7.88 |
| /essays/pluto-in-sagittarius | 25 | 5.32 |
| /essays/mars-in-taurus | 24 | 6.08 |
| /essays/uranus-in-taurus | 24 | 8.62 |
| /essays/sun-in-sagittarius | 23 | 8.78 |
| /essays | 22 | 11.00 |
| /essays/saturn-in-libra | 21 | 6.86 |
| /essays/jupiter-in-leo | 21 | 8.38 |
| /tarot | 21 | 10.00 |

(22 of 54 shown; the remaining 32 each hold 10-20 impressions. Median across all 54 is 18 impressions, where P(0 clicks) = 67%.)

Separately, the largest zero-click URLs regardless of position: `/es/synastry` 554 impressions at 29.48, `/es/essays` 86 at 24.19, `/sidereal-leo-dates` 55 at 12.49.

### C. Sitemap vs GSC reconciliation

| | Count |
|---|---|
| Live sitemap `<loc>` entries | **518** (259 EN / 259 ES, perfectly symmetric) |
| `xhtml:link` alternates | 1,554 (exactly 3 per URL: en, es, x-default; self-reference present on all) |
| `<image:loc>` entries | 268 (264 point at `/api/og/essay/*`, all currently 500; 4 point at `/opengraph-image`, 200) |
| Sitemap URLs with 1 or more impressions | **297 (57.3%)** |
| Sitemap URLs with **zero** impressions | **221 (42.7%)** |
| GSC URLs **not** in the sitemap | 50 (49 `/compatibility/<pair>` deliberately noindexed plus 1 `www.estrevia.app/`) |
| File size | 267,830 bytes (0.255 MB), far under the 50k URL / 50 MB caps. Sitemaps API: 0 errors, 0 warnings |

Zero-impression concentration:

| Cohort | Dark / total | Dark % |
|---|---|---|
| **ES `/essays/*`** | **107 / 120** | **89%** |
| **EN `/tarot/*`** | **52 / 79** | **66%** |
| ES `/tarot/*` | 24 / 79 | 30% |
| EN `/essays/*` | 12 / 120 | 10% |
| ES `/planetary-hours-cities/*` | 5 / 20 | 25% |
| EN `/signs/*` | 4 / 12 | 33% |
| ES `/signs/*` | 2 / 12 | 17% |
| EN `/planetary-hours-cities/*` | 2 / 20 | 10% |

Whole pages with zero impressions in 72 days despite HTTP 200 plus `index, follow` plus correct self-canonical: `/chart` (EN), `/synastry` (EN), `/hours`, `/es/hours`, `/es/moon`, `/es/pricing`, `/es/why-sidereal`, `/es/tree-of-life`, `/es/tarot` (hub), `/privacy`, `/support`, `/es/support`, `/sidereal-pisces-dates`. None is technically blocked, so this is a demand or authority gap, not a crawl problem. Note the EN/ES asymmetry: `/es/chart` (127 impressions) and `/es/synastry` (554) surface while their EN twins draw literally zero.

`lastmod` distribution: 2026-07-11 (254), 2026-04-07 (120), 2026-04-26 (93), 2026-04-09 (27), 2026-01-01 (24). Zero future dates, zero 2024 placeholders.

Sitemap composition vs return: `/tarot/` is **158 of 518 URLs (30.5%)** and returns 384 impressions (5.9%) and 6 clicks (4.8%) — the worst impressions-per-URL and clicks-per-URL of any cohort. `/essays/` is 242 URLs (46.7%) and returns 1,503 impressions and 59 clicks (46.8%), almost all of it from the EN half.
