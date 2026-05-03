# Phase 2 Perf Baseline — 2026-05-02

Captured by: `perf-verifier` | Method: Lighthouse 13.2.0 against `https://estrevia.app` (production) + bundle analysis via network request audit.

---

## Lighthouse scores (pre-state, prod, Phase 2 start)

| Page | FF | Perf | A11y | BP | SEO | LCP (s) | TBT (ms) | CLS |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| / | mobile | 78 | 97 | 100 | 100 | 6.1 | 21 | 0.000 |
| / | desktop | 97 | 97 | 100 | 100 | 1.2 | 0 | 0.000 |
| /chart | mobile | 74 | 96 | 92 | 100 | 6.2 | 0 | 0.000 |
| /chart | desktop | 96 | 96 | 92 | 100 | 1.3 | 0 | 0.000 |
| /essays/sun-in-aries | mobile | 84 | 97 | 92 | 100 | 4.6 | 60 | 0.001 |
| /essays/sun-in-aries | desktop | 99 | 97 | 92 | 100 | 1.0 | 0 | 0.000 |
| /hours | mobile | 72 | 96 | 92 | 100 | 6.2 | 15 | 0.000 |
| /hours | desktop | 97 | 96 | 92 | 100 | 1.3 | 0 | 0.032 |
| /moon | mobile | 72 | 87 | 92 | 100 | 6.3 | 18 | 0.001 |
| /moon | desktop | 94 | 87 | 92 | 100 | 1.3 | 0 | 0.097 |
| /synastry | mobile | 73 | 96 | 92 | 100 | 6.4 | 9 | 0.000 |
| /synastry | desktop | 96 | 96 | 92 | 100 | 1.3 | 0 | 0.000 |
| /tree-of-life | mobile | 73 | 96 | 92 | 100 | 6.3 | 16 | 0.000 |
| /tree-of-life | desktop | 99 | 96 | 92 | 100 | 1.0 | 0 | 0.000 |
| /why-sidereal | mobile | 82 | 97 | 100 | 100 | 4.5 | 5 | 0.000 |
| /why-sidereal | desktop | 97 | 97 | 100 | 100 | 1.1 | 0 | 0.000 |

**Target: Perf ≥ 85 mobile + desktop. Accessibility ≥ 95. SEO = 100. BP ≥ 90.**

### Gates status (pre-state)
- ❌ Performance mobile: 7/8 pages below 85 (only essays=84 and why-sidereal=82 close; chart=74, hours=72, moon=72, synastry=73, tree-of-life=73 all well below)
- ✅ Performance desktop: all ≥ 94
- ❌ Accessibility: /moon = 87 on both mobile + desktop (P0 leftover, target ≥ 95)
- ✅ Accessibility all other pages: 96–97 ✅
- ✅ SEO: 100/100 all 16 runs ✅
- ✅ Best Practices: 92–100 (≥ 90) ✅
- ❌ /hours desktop CLS = 0.032 (amber — below 0.1 threshold but worth investigating)
- ❌ /moon desktop CLS = 0.097 (amber — approaching 0.1 threshold)

---

## LCP root-cause analysis

### FCP vs LCP gap on mobile

| Page | FCP | LCP | Gap |
| --- | --- | --- | --- |
| / | 1.3 s | 6.1 s | **4.8 s** |
| /chart | ~1.3 s | 6.2 s | **4.9 s** |
| /essays/sun-in-aries | ~1.5 s | 4.6 s | **3.1 s** |
| /why-sidereal | ~1.5 s | 4.5 s | **3.0 s** |

TTFB is excellent (37–49 ms on most pages, 134 ms on essays). First paint is fast. The ~3–5 s gap between FCP and LCP is the core problem.

**Root cause: Clerk UI bundle load + JS parse + hydration on mobile CPU.**

Clerk loads 4 JS bundles on every page:
- `ui-common_ui_ad69ce_1.7.0.js` → **114 KB** (Clerk UI framework)
- `vendors_ui_ad69ce_1.7.0.js` → **62 KB** (Clerk vendors)
- `framework_ui_ad69ce_1.7.0.js` → **43 KB** (Clerk React)
- `clerk.browser.js` → **69 KB** (Clerk auth session)
- `ui.browser.js` → **36 KB** (Clerk UI browser)
- **Subtotal: ~324 KB from Clerk** on every page load

At Lighthouse's 4G mobile throttle (~1.6 Mbps download, 6× CPU slowdown), parsing 324 KB of JS takes ~1.5–2 s. Combined with other app chunks, this pushes TTI and LCP to 6+ s.

---

## Bundle analysis (from Lighthouse network requests, home-mobile)

**Total first-load JS transferred: ~585 KB compressed** (approx. 1.4–1.8 MB parsed)

Note: `@next/bundle-analyzer` is incompatible with Turbopack builds (project uses Next.js 16 with Turbopack). Bundle data derived from Lighthouse network request audit. `next experimental-analyze` is the official alternative but does not generate static HTML artifacts.

| Chunk | Size (compressed) | Source |
| --- | --- | --- |
| `ui-common_ui_ad69ce_1.7.0.js` | 114 KB | Clerk UI |
| `clerk.browser.js` | 69 KB | Clerk auth |
| `0rwwge57xnfls.js` (main bundle) | 64 KB | App code |
| `vendors_ui_ad69ce_1.7.0.js` | 62 KB | Clerk UI vendors |
| `framework_ui_ad69ce_1.7.0.js` | 43 KB | Clerk React |
| `ui.browser.js` | 36 KB | Clerk UI browser |
| `05.3.qblp1e2..js` | 29 KB | App chunk |
| `0rk1bbko_.fd2.js` | 26 KB | App chunk |
| Remaining ~12 small chunks | ~162 KB | Next.js internals + app |
| **Total** | **~585 KB** | |

**Confirmed lazy: posthog-js** — does NOT appear in home-mobile network requests. §0 #6 confirmed ✅. PostHog Group B work = null.

**No `<img>` tags in TSX** — confirmed §0 #7 ✅. Image migration Group A work = null.

---

## Sentry client config

`sentry.client.config.ts`:
```ts
replaysSessionSampleRate: 0,
replaysOnErrorSampleRate: 1.0,
```

No explicit `replayIntegration()` in integrations array. In `@sentry/nextjs` 8+, setting `replaysOnErrorSampleRate > 0` triggers automatic inclusion of the Replay bundle (~50–80 KB gzipped). Since Estrevia is on the free tier (5K errors/month), Replay captures on error are useful but add ~50–80 KB to every page.

**Decision for Group B:** Remove `replaysSessionSampleRate`/`replaysOnErrorSampleRate` OR explicitly initialize `replayIntegration()` with minimal config. If Replay is desired on errors, it should be explicit and deliberate. If not — removing saves ~50–80 KB.

---

## §0 ground truth confirmations (spec §0 #6, #7)

| Claim | Expected action per spec | Verified result |
| --- | --- | --- |
| PostHog already lazy | Group B "PostHog tuning" = null work | ✅ Confirmed: posthog-js not in home-mobile bundle |
| No `<img>` in TSX | Group A "image migration" = null work | ✅ Confirmed: `grep "<img "` returns empty |

---

## Recommended Group A/B/C content

### Group A (low-risk wins — do first, ~1–2h)

**A1. `display: 'swap'` explicit on Geist + Geist_Mono** — Currently only `CrimsonPro` has explicit `display: "swap"`. `Geist` and `Geist_Mono` rely on next/font default (which is swap, but not explicit). Add `display: 'swap'` to both in `src/app/layout.tsx` for safety.

**A2. Verify static asset cache headers** — Confirm `/_next/static/` serves `immutable, max-age=31536000`. Check `next.config.ts` `headers()` doesn't accidentally match `/_next/static` with short TTL. Currently the global `/(.*)`  header rule applies security headers but shouldn't affect cache-control on static assets (Next.js manages those separately). Verify with `curl -I https://estrevia.app/_next/static/…` on any chunk.

**A3. CLS fix on `/moon` desktop (CLS = 0.097)** — Approaching the 0.1 bad threshold. Investigate what element is shifting. Likely a late-loading image or a sticky header reflow. Fix before Group B.

**A4. CLS fix on `/hours` desktop (CLS = 0.032)** — Minor but worth fixing. Check for unsized media or late-loading embeds.

**NOT in Group A (confirmed null):**
- PostHog lazy-loading: already done ✅
- `<img>` → `<Image>` migration: no `<img>` in TSX ✅

### Group B (JS bundle wins — do after Group A Lighthouse re-measure)

**B1. Sentry Replay decision** — Remove `replaysSessionSampleRate: 0` and `replaysOnErrorSampleRate: 1.0` from `sentry.client.config.ts` if Replay is not actively monitored. Or explicitly add `replayIntegration()` with `maskAllText: true, blockAllMedia: true` for GDPR compliance if keeping it. Saves ~50–80 KB from every page's client bundle.

**B2. Dynamic import for ChartWheel** — The chart wheel SVG renders only after form submission on `/chart`. Migrate to `dynamic(() => import('./ChartWheel'), { ssr: false, loading: () => <Skeleton /> })`. Removes SVG rendering code from initial parse.

**B3. Clerk UI loading strategy** — Clerk UI bundles (324 KB) load on every page because `ClerkProvider` is in the root layout. This is architecturally necessary for auth session management. However, check if Clerk's `<UserButton>` or `<SignedIn>/<SignedOut>` wrappers can be moved to client components that load lazily (only when navigation bar renders). If those components trigger the full Clerk UI download, lazy-loading them could defer 175+ KB to first interaction.

**NOT in Group B (confirmed null):**
- PostHog optimization: already lazy ✅

### Group C (critical CSS — conditional trigger)

**Trigger:** any page still < 85 Performance after Group A + Group B re-measure.

Given the LCP root cause (Clerk JS bundle), critical CSS will not fix LCP. Group C only helps FCP + Speed Index, not LCP. If mobile LCP remains at 5–6 s after B1+B2+B3, the ceiling for Group C improvement is limited (~3–5 Lighthouse points for CSS inlining).

**Option if triggered:** `beasties` (actively maintained Critters fork). Install as devDep, add to next.config.ts. Run Playwright visual diff on all 8 pages × 6 viewports before commit.

**Risk note:** Critical CSS with Tailwind 4 (JIT) can produce stale inline CSS if Tailwind 4's engine and beasties don't cooperate. Test carefully.

---

## /moon Accessibility = 87 (P0 leftover)

`/moon` is the only page with A11y below 95 (87 on both mobile + desktop). P0 QA report §7 #1 logged this.

**Likely cause:** interactive element added during P0 educational expansion lacks `aria-label` or has insufficient color contrast. Run axe-core on `/moon` to identify specific violation IDs.

**Owner:** `perf-eng` (T_moon task, parallel to Group A/B).

---

## Bundle analyzer note (Turbopack incompatibility)

`@next/bundle-analyzer` v16.2.4 installed and wired into `next.config.ts` as:
```ts
withBundleAnalyzer({ enabled: process.env.ANALYZE === 'true', openAnalyzer: false, analyzerMode: 'static' })
```

However, Next.js 16 production build uses Turbopack, and `@next/bundle-analyzer` explicitly does not support Turbopack builds. No HTML report was generated. Bundle data in this report comes from Lighthouse network request audit (accurate for transfer sizes; does not show treemap view).

**Alternative:** `next experimental-analyze` (Turbopack-native) generates `.next/analyze/` artifacts but requires interactive browser to view. For CI use, record chunk sizes from Lighthouse network audit as done here.

Recommendation for `perf-eng` T7: check if static cache headers are correct via `curl -I`, not via bundle analyzer HTML. Bundle analyzer HTML is not available for this project without switching to webpack mode.

---

## Files committed with this baseline

- `tmp/baselines/perf-phase2/lighthouse/*.report.json` — 16 Lighthouse JSON reports
- `tmp/baselines/perf-phase2/lighthouse/*.report.html` — 16 Lighthouse HTML reports  
- `tmp/baselines/perf-phase2/perf-baseline-report-2026-05-02.md` — this file
- `next.config.ts` — `@next/bundle-analyzer` wired (no-op with Turbopack, kept for non-Turbopack environments)
- `package.json` + `package-lock.json` — `@next/bundle-analyzer@^16.2.4` added as devDep
