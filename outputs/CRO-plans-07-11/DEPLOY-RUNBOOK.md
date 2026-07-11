# CRO-plans-07-11 — Deploy Runbook (founder-gated)

**Status (2026-07-11):** all 7 plans implemented, per-plan reviewed, cross-plan integration-reviewed — **PASS, merge-ready**. All code lives on branch **`cro-plans-exec`** (tip `3fba75e`), an isolated git worktree. **Nothing is on `main` yet** and **nothing is deployed/pushed** — every step below is founder-owned.

## Why a branch (not direct-to-main)
A parallel Claude session was executing SEO remediation in the main checkout on `main`. To avoid two agent fleets clobbering the same working tree, this CRO work ran in an isolated worktree on `cro-plans-exec`. Merge is Step 0.

## What shipped (65 commits, `ac7ac2e..3fba75e`)
| Plan | Commits | What |
|---|---|---|
| **Phase 0** | 18 | 4 money-path P0s (placeholder-email heal in Stripe+Clerk webhooks; PaywallModal portal above cookie banner; `/chart?chartId=` server handoff; tarot SSR crash), relaunch instrumentation (server `landing_view`, PostHog `/es` locale fix), ES pre-spend batch, migration-0018 applier, 2 backfill scripts |
| **SP-A** | 7 | Post-purchase: `returnUrl` survives Stripe round-trip (+backslash open-redirect fix), `/checkout/complete` Redis ticket + real i18n, `PaidOnboardingEmail` + hourly cron |
| **SP-C** | 7 | Drip repair: Resend webhook real payload shape, welcome claim/update, drip `utm_content=leadId`, retire `synastry_teaser`, SAVE50 trial-end save offer (+gated coupon script) |
| **SP-D** | 8 | Product trust: honest `time:null` charts (no fabricated Ascendant), email-gate re-arm, ThreeCard paywall, anon `/chart` 401 fix, masked session recordings **with rrweb URL PII scrubber** |
| **SP-E** | 9 | Landing/pricing message-match: render-visible first paint, hero hook echo (no NASA), monthly-default + Pro-first pricing, phantom "Star"→"Included in Pro", synastry card variant, honest essay CTA |
| **SP-F** | 6 | Consent-gated `MetaPixelLoader` (+`_fbp`/`_fbc` expiry on decline), drizzle journal repair, `.env.example` completeness, `/privacy` disclosure |
| **SP-B** | 10 | ES/LATAM: US$ framing (ES-only), single-source `currency-equiv.ts`, in-modal trust row, **truthful cookie banner**, Spanish calendar + aria i18n |

**Gate state:** typecheck clean; full suite **2672 tests pass, 0 real failures**. (2 environmental file-collection errors — a Playwright baseline spec vitest mis-collects, and `next/server` resolving through the worktree's symlinked node_modules — both resolve on a normal `npm install` on `main`. Occasional non-deterministic cron dynamic-import timeout flakes that pass on re-run.)

---

## STEP 0 — Merge `cro-plans-exec` → `main` (do this FIRST)
```bash
git checkout main && git pull
git merge cro-plans-exec
```
Expect **resolvable conflicts** only on files the parallel SEO session also edited — most likely `src/app/[locale]/(app)/tarot/[cardId]/page.tsx` and `messages/*.json`. Resolve by **taking BOTH sides' additions** (the SEO tarot fix and this CRO tarot fix are the same class; the message keys are disjoint). After merge, run the full gate on `main` (real node_modules): `npm test && npm run typecheck && npm run lint`.

## STEP 1 — Vercel Production env vars (BEFORE push)
Set in Vercel (dashboard, or REST API with `type:'encrypted'` NOT `'sensitive'`):
- **`COMPANY_POSTAL_ADDRESS`** — your postal address. **Without this every marketing email throws after deploy.** (load-bearing)
- `STRIPE_COUPON_HALF50` = `HALF50` · `STRIPE_COUPON_SAVE50` = `SAVE50`
- `DRY_RUN`, `CART_ABANDON_DRY_RUN`, `DUNNING_DRY_RUN` (start `true`), `META_CAPI_GRAPH_VERSION` (e.g. `v22.0`)
- Confirm `NEXT_PUBLIC_META_PIXEL_ID` **and** `META_PIXEL_ID` both = `1945750759636135` (browser + server CAPI read different vars — see `outputs/cro-phase0-2026-07/capi-422-diagnosis.md`).

## STEP 2 — Apply migration 0018 to prod
```bash
node scripts/qa/_apply_migration_0018_2026_07_10.mjs        # dry-run
node scripts/qa/_apply_migration_0018_2026_07_10.mjs --apply
```
Uses Neon `Pool`+`ws` (HTTP driver silently fails DDL). Expect `sent_discount_blast_emails` + ≥2 indexes. Never `npm run db:migrate` (journal `__drizzle_migrations` empty).

## STEP 3 — Refresh FX + create SAVE50 (before ES respend / to enable the save offer)
- `src/shared/lib/currency-equiv.ts` FX constants are **`[FOUNDER-VERIFY]` 2026-05-23 vintage** — refresh to current MXN/COP/CLP/PEN/UYU rates and re-run its sync test before ES ad spend (`outputs/sp-b/currency-decision.md`).
- SAVE50 coupon (50% once, trial-end save offer):
  ```bash
  node scripts/advertising/_create_save50_coupon_2026_07_10.mjs --apply
  ```

## STEP 4 — Push & deploy
`git log origin/main..main --oneline` (review), then `git push origin main`. Watch Vercel to READY.

## STEP 5 — Post-deploy smoke (production)
- `curl -s https://estrevia.app/tarot/ace-of-wands | grep -c '<h1'` ≥1 (repeat `/es/...`).
- Mobile 390×844: calculate chart → paywall pre-consent → trial CTA above the cookie banner and tappable.
- Hero result → "See your full chart" → `/chart?chartId=…` renders the chart, not the empty form.
- PostHog Live: `/essays/*` event `locale=en`; `/` shows a `landing_view` (`$lib=posthog-node`, `source:'server'`) without touching consent.
- **Consent**: fresh visit → no `_fbp`, no facebook requests until Accept; Decline clears leftovers.
- Cookie banner copy now truthful (no "no third-party tracking").
- Stripe webhooks all 2xx; any new payer's `users.email` is a real address (no `stripe-pending-%`).

## STEP 6 — Backfills (`--apply`, in order)
```bash
node scripts/advertising/_backfill_placeholder_emails_2026_07_10.mjs --apply   # A: real emails onto placeholder rows
node scripts/advertising/_backfill_converted_leads_2026_07_10.mjs --apply       # B: link email_leads to anon payers
```
Save output to `outputs/cro-phase0-2026-07/backfills-applied.txt`.

## STEP 7 — Meta ES scripts (`--apply`, after reviewing dry-run)
```bash
node scripts/advertising/_relaunch_es_ads_repoint_2026_07_10.mjs --apply        # ES ads → /es/ (new PAUSED _v2 ads)
node scripts/advertising/_relaunch_es_adset_cleanup_2026_07_10.mjs --apply       # drop SV, publisher_platforms fb+ig
```
New ES ads stay PAUSED; review Page=Estrevia + `/es/` links before activating.

## STEP 8 — Stripe / Meta dashboard (manual, no API)
Stripe: disable Link **Instant Bank Payments**; turn off cashapp/klarna/amazon_pay defaults; business name → **Estrevia**; Radar exempt recurring/MIT from high-risk block; enable auto-cancel of `past_due` subs.
Meta Events Manager: execute the CAPI-422 gateway action (`outputs/cro-phase0-2026-07/capi-422-diagnosis.md`, decision A — remove/reconfigure the stale `datah04` Conversions API Gateway); verify EMQ + browser Lead events for pixel `1945750759636135`.

## STEP 9 — Relaunch (per `docs/runbooks/2026-07-relaunch.md`)
- **EN first**, $25/day, two proven hooks (recut the NASA headline — overclaim). Watch trial→paid.
- **ES only after**: SP-B live + FX refreshed + EN funnel proven end-to-end + Step 7 verified. Watch metric: ES Stripe session created→complete **>10%** (was 4.5%). Revisit `currency-decision.md` if it stays low.

## Known non-blockers (deferred, safe to merge)
- Environmental test-file collection errors + non-deterministic cron timeout flakes — infra, not logic; green on `main`/CI.
- FX constants 2026-05-23 vintage → refresh (Step 3).
- ES calendar is Sunday-first (LATAM often Monday-first) — cosmetic, internally consistent.
- Pre-existing lint (ChartDisplay ref-during-render error; PostHogProvider exhaustive-deps warnings) inherited from `main`, not introduced here.
