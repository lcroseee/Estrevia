# SEO Audit Fixes — Design Spec

**Date:** 2026-08-03
**Source:** `outputs/seo-audit-2026-08-02/REPORT.md` (35-agent audit, 16 adversarial verification passes)
**Branch:** `seo-audit-fixes` (off `ffd6dbe`)
**Baseline:** 2790 tests pass, 1 todo. Two test *files* error under vitest because `tests/baselines/*.spec.ts` are Playwright specs and `vitest.config.ts` excludes only `tests/e2e/**`. Pre-existing, unrelated, fixed here as W1-8.

## Purpose

Implement every audit finding that is fixable in code, on a branch, without pushing or deploying.

The audit's own conclusion frames this work: no P0 and no P1 survived verification. The site has a demand-capture problem, not a defect problem. Almost nothing here will move traffic, and the spec says so per item. What it buys is that the site stops shipping objectively broken output: a 500ing image endpoint, 179 titles with the brand amputated, 20 English links on a Spanish hub, five route families answering 200 for URLs that do not exist, and a `sameAs` pointing at a 404.

Two items carry a real (if unproven) traffic hypothesis: W2-10 (Spanish sign names in ES essays) and W1-1 (de-orphaning the ES cities hub). Both are instrumented in the audit's measurement plan with explicit stop conditions.

## Decisions taken before design

Three scope questions were put to the founder on 2026-08-03:

1. **ES sign names.** CLAUDE.md says "Sign names untranslated (Aries/Taurus/...)". W2-10 requires the opposite for ES essays. **Decision: amend the rule for ES content.** Rendered Spanish sign names, English `sign` frontmatter token preserved, canonical URLs unchanged. This also removes an existing contradiction: `/es/sidereal-cancer-dates` already renders "Cáncer" while `/es/signs/cancer` renders "Cancer".
2. **Compatibility cluster (U11).** **Decision: retarget `ENRICHED_PAIRS` to the six demand-ranked pairs; do not author content, do not touch the `isPairReady()` gate.** Pages stay `noindex` until real prose exists. Content authoring stays a founder decision.
3. **Landing zone.** **Decision: branch `seo-audit-fixes`, no push, no deploy.** `main` carries three unpushed docs-only commits from a separate Cosmic Portrait workstream; keeping these histories apart lets the founder choose the merge order.

## Scope

### In scope — 23 changes: 21 numbered across three risk-tiered waves, plus two unnumbered (the `Vary` header, and F5 which is a documentation fetch)

Risk tiering, not the report's week/month/quarter horizons. The risk distribution here is bimodal: sixteen changes are near-zero risk, one can break every route on the site. Tiering by blast radius means the safe majority lands and is independently verifiable regardless of what happens to the risky one.

#### Wave 1 — strings and one-liners, no shared code touched

| # | Change | File | Audit ref |
|---|---|---|---|
| W1-1 | `next/link` to `@/i18n/navigation`; drop the inert `locale` prop | `(marketing)/planetary-hours-cities/page.tsx:2` | U1 |
| W1-2 | ES landing title to 47 chars so the brand survives truncation | `messages/es.json` | P2-1 fix 1 |
| W1-3 | Remove the 404ing `x.com/estrevia_app` from `SAME_AS_URLS`; correct the false comment at `constants.ts:41`; fix the matching footer href | `constants.ts`, `SeoChrome.tsx` | P3-1 |
| W1-4 | Delete `.slice(0, 155)`; let `createMetadata` truncate on a word boundary | `(content)/tarot/[cardId]/page.tsx:93` | P2-7 fix 1 |
| W1-5 | Add `'/api/og/**'` to `outputFileTracingIncludes` with the `@vercel/og` compiled dir and `public/fonts` | `next.config.ts` | P2-2 |
| W1-6 | `pageMeta.essays` in both catalogues; replace the two English literals | `(content)/essays/page.tsx`, `messages/{en,es}.json` | P3-5 |
| W1-7 | Synastry title and description, both locales | `messages/{en,es}.json` | P3-4 |
| W1-8 | `vitest.config.ts` exclude `tests/baselines/**` | `vitest.config.ts` | baseline hygiene |

#### Wave 2 — shared code and tests, each under TDD

| # | Change | Audit ref |
|---|---|---|
| W2-9 | `buildTitle()` reserves `TITLE_SUFFIX` before truncating. Repairs the two tests that assert the current broken behaviour (`metadata.test.ts:32`, `:241-251`) and adds an invariant test over both message catalogues | P2-1 fix 2 |
| W2-10 | ES essay sign localization at the render layer via the existing `spanishSignVariant()`. Title, H1, `Article.headline`, breadcrumb, OG. Zero MDX edits. Amend CLAUDE.md and the now-false comment at `astro-i18n.ts:78-81` | P2-3 T1 |
| W2-11 | `localeUrl(path, locale)` helper in `json-ld.ts`; apply at the verified call sites across 14 files. Path-boundary parity test | P2-5 |
| W2-12 | De-orphan `/sidereal-*-dates`: reciprocal links from `/signs/{sign}`, differentiated titles in both title sources, fix the invalid BreadcrumbList | P2-8 (a) |
| W2-13 | Single source for sidereal date ranges plus a 12-sign parity test | U8 |
| W2-14 | Tarot internal link graph with an exhaustive null-safe sign map (30 of 78 cards have no zodiac sign) | P3-6 (B) |
| W2-15 | `ENRICHED_PAIRS` retargeted to six demand-ranked pairs | U11 |
| W2-16 | ES tarot correspondences rendered in Spanish (planet-in-sign, sephirah, world) | U14 |
| W2-17 | `Article.image` on signs and sidereal-dates; `Product` completeness on pricing; remove the two `/why-sidereal` FAQ entries that do not appear in the rendered page | P3-7 |
| W2-18 | Source-side description lengths: city template, 24 `siderealDates.*`, `signs/[sign]`. Tests assert sources and interpolated templates, not just outputs | P2-7 fix 2 |
| W2-19 | `LanguageSwitcher` renders real `<a href>` anchors instead of `<button onClick>` | U3 |

#### Wave 3 — architectural, gated

| # | Change | Gate |
|---|---|---|
| W3-20 | Soft-404s: resolve the slug and call `notFound()` inside `generateMetadata` for essays, tarot, signs, sidereal-dates. Playwright spec asserting `response.status() === 404` for all five bogus-slug families | None. Do **not** delete the two `loading.tsx` files |
| W3-21 | Hoist `getLocale()` and the two `getTranslations()` calls out of `src/app/layout.tsx:59-64` into `src/app/[locale]/layout.tsx` | **Hard gate:** `npm run build` must flip essays and tarot from dynamic to SSG. If it does not, revert the change and record the hypothesis as refuted. Do not proceed to cookie removal |

Plus `Vary: Accept-Language` on locale redirects (U6). `localeDetection` stays **on** — disabling it changes behaviour for live Spanish users on a conversion path, which is a product decision, not an SEO fix.

### Out of scope, with reasons

| Item | Why |
|---|---|
| F1 www to 308 | Vercel dashboard toggle. No code path exists. The audit also refuted the harm — Google already canonicalized www to apex on its own |
| F3 `FOUNDER_NAME` | `constants.ts:4-9` documents a deliberate privacy gate. Setting it publishes a real person's name to `/about`, the sitemap, the footer, and `Article.author` on every essay |
| F4, F8 | Actions inside Search Console |
| F6, F7 | Authoring prose in `content/`, which is proprietary and out of scope per CLAUDE.md without an explicit ask |
| U10, U12 | New page types (`/methodology`, `/tree-of-life/{sephira}`, a "true sidereal" disambiguation page). These are new features, not fixes |
| U16 | Case and trailing-slash variants return 200, but each self-canonicalizes correctly and zero appear in 347 rows of GSC data |
| P2-4 step 3 (cookie removal) | Gated behind W3-21 succeeding. `ensureAnonymousIdCookie` feeds attribution; moving it is a separate change with its own blast radius |

F5 (confirming the 2023 rich-result deprecation dates) is reclassified as in scope — it is one documentation fetch and it removes a founder gate.

## Architecture of the change set

Four shared seams absorb most of the work. Everything else is a leaf edit.

1. **`src/shared/seo/metadata.ts` — `buildTitle()`.** One ordering bug radiating to 179 URLs. Fixing it inverts what two existing tests assert, so the tests move with the code in the same commit. The correct pattern already exists in-repo at `tarot-title.ts:24`, which is exactly why zero tarot URLs are affected today.
2. **`src/shared/seo/json-ld.ts` — new `localeUrl(path, locale)`.** Thirty JSON-LD call sites across twenty files each build URLs from bare `SITE_URL`. One helper plus a parity test replaces the per-file discipline that failed. The `path === '/'` guard is load-bearing: without it the ES root renders `https://estrevia.app/es/` while canonical and sitemap use `https://estrevia.app/es`.
3. **`src/shared/lib/astro-i18n.ts` — `spanishSignVariant()`.** Already written, already tested, wired only into `<meta name="keywords">`. W2-10 routes it to the surfaces Google reads.
4. **Locale-aware `Link` from `@/i18n/navigation`.** The cities hub is the only file in `src/app` importing raw `next/link`. W1-1 removes the exception; a lint-style test prevents its return.

**Isolation rule for this work:** no change may alter a canonical URL, a route path, or a frontmatter token. Every fix operates on rendered text, emitted metadata, internal hrefs, or build configuration. That invariant is what makes the whole set revertible commit by commit.

## Testing strategy

Follows the repo's existing TDD convention: failing test first, then the fix.

- **Per change:** a test that fails against current `main` and passes after. For string-only changes in `messages/*.json`, the test is an assertion over the catalogue (length budget, key presence, parity between locales), not a snapshot of the copy.
- **Per wave:** `npm test` and `npm run typecheck` must both be clean before the wave's final commit. `npm run lint` is checked but its output is filtered — the repo reports 5500+ false errors from stale `.claude/worktrees/` copies.
- **W3-20** needs a real Playwright spec under `npm run test:e2e` asserting status codes against the local server. A unit test cannot observe an HTTP status, which is precisely why the existing guard at `soft-404.test.ts:17-23` shipped green while the bug was live.
- **W1-5 cannot be verified locally.** `next dev` resolves from `node_modules` directly and cannot reproduce an output-file-tracing gap. The change ships with a GET assertion (never HEAD — HEAD returns 200 on the broken route, which is why every prior smoke check passed) for the founder to run post-deploy.

## Risks

| Risk | Mitigation |
|---|---|
| W3-21 breaks every route | Hard build gate; revert on failure. `<html lang={locale}>` in the root layout is the known obstacle and is resolved in the plan, not inline |
| W2-9 cascades into essay titles | The reorder converts 151 essay titles from "brand missing" to "epithet cut mid-title". Accepted: strictly better output. Rewriting `content/` frontmatter titles is out of scope |
| W2-14 repeats the July crash | 30 of 78 cards have a null zodiac sign, including two of the five click-earning pages. An exhaustive map with a null fallback, routed through the existing `buildCorrespondenceRows` choke point, plus a test asserting no card with a null sign emits a `/signs/` href |
| W2-10 contradicts a shipped i18n parity test | `astro-i18n.test.ts` asserts the current contract. The amendment updates the test and CLAUDE.md together, so the rule and its guard never diverge |
| Merge conflict with the Portrait workstream | Those three commits touch only two markdown files under `docs/superpowers/`. No overlap |

## Success criteria

1. All 21 changes committed on `seo-audit-fixes`, one commit per change, conventional-scope messages.
2. `npm test` and `npm run typecheck` clean at the end of each wave.
3. Every change has a test that fails before and passes after, except W1-5 (unverifiable locally, ships with a documented post-deploy check) and W3-21 (verified by the build's route table).
4. A handoff note listing what the founder must do: the Vercel toggle, the GSC actions, the post-deploy GET check, and the W3-21 outcome.
5. Nothing pushed, nothing deployed.
