# Phase 0 deploy gate — founder ops runbook

**Task:** Task 17 — `.superpowers/sdd/task-17-brief.md`
**Status:** Steps 1-8 below are NOT executed. Every step is founder-owned
(shared state: push / prod migration / env vars / paid-backfill `--apply` /
Meta `--apply` / Stripe & Meta dashboards). This document is the runbook only.
**Order matters — do not reorder.** Each step gates the next.

---

## Step 0: Merge `cro-plans-exec` → `main` FIRST (prerequisite, not in the
original Task 17 brief — added because of a branch-state fact discovered
while writing this checklist)

All Phase 0 code (30 commits ahead of `origin/main`, plus the 5 earlier
HALF50 commits already on this branch) currently lives on branch
`cro-plans-exec`, checked out in an **isolated worktree**
(`.claude/worktrees/cro-plans-exec`) — **not on `main`.** `main` itself has
moved since this branch was cut: a parallel SEO-remediation session has been
landing commits directly to `main` (per its own direct-to-main workflow) while
this Phase 0 work was in flight.

Confirmed by diffing both branches against their common ancestor
(`git merge-base cro-plans-exec main`): **both branches touch**
`src/app/[locale]/(app)/tarot/[cardId]/page.tsx` and `messages/es.json`.
- `main`'s SEO session is doing broader tarot/essay/compatibility SEO work
  (touches `tarotCards.ts`, `faq.ts`, `compatibility-*.ts`, `sitemap.ts`,
  `essays/[slug]/page.tsx`, `messages/en.json` + `messages/es.json`, and
  several `content/compatibility/enriched/*.json` files).
- `cro-plans-exec`'s Track 7 fix is narrow: the `.join` on null null-guard at
  `tarot/[cardId]/page.tsx:239` that crashes 112 tarot URLs, plus this
  branch's own `messages/es.json` copy fixes (Track 6: `pricing.startTrial`,
  `paywall.trialCta` "gratis" wording + modal l10n keys).

Both branches' changes to these two files are **additive in different
places** (SEO session: JSON-LD/content plumbing around the page; Phase 0:
the null-guard + copy strings) — expect Git to flag them as conflicts anyway
because they're the same files, but the actual changes are not
semantically overlapping.

**Founder merge steps:**
1. `git fetch origin && git checkout main && git pull`
2. `git merge cro-plans-exec` (or rebase, founder's call) from a **primary
   checkout**, not a worktree copy of a stale `main`.
3. On conflicts in `tarot/[cardId]/page.tsx` and `messages/{en,es}.json`:
   **take both sides' additions** — the null-guard/copy-string changes from
   `cro-plans-exec` and the SEO-plumbing changes from `main` are not
   mutually exclusive. Do not silently drop either side.
4. Re-run typecheck + the relevant test files for both touched areas
   (`tarot/[cardId]/__tests__/page.test.tsx`, SEO session's own tests) after
   resolving — a hand-merged file is the one place a gate report from either
   session can't have verified the *combined* result.
5. Only once `main` cleanly contains both sessions' work does Step 1 below
   begin. Everything from here on assumes you are now working from `main`.

---

## Step 1: Vercel prod env vars FIRST

Set in Vercel project settings (dashboard, or REST API — remember:
`type: 'encrypted'`, **NOT** `'sensitive'`, which silently drops the value):

- `COMPANY_POSTAL_ADDRESS` = founder's postal address (CAN-SPAM). **Without
  this, every marketing email throws after deploy.**
- `STRIPE_COUPON_HALF50` = `HALF50` (coupon is expired — harmless: checkout
  has the expired-coupon fallback from commit `7241c3b`; empty would also
  work but set it for config completeness).

Verify both appear in `vercel env ls` (or dashboard) for **Production**
before proceeding.

## Step 2: Apply migration 0018 to prod

```bash
node scripts/qa/_apply_migration_0018_2026_07_10.mjs
```

Expected: `verify: { table_exists: 'sent_discount_blast_emails', index_count: 2 }`
(or ≥2), `done.`

## Step 3: Push (founder-confirmed — this ships 6 HALF50 commits + all
Phase 0 commits)

```bash
git log origin/main..HEAD --oneline
```

Show the founder the full list. On explicit OK:

```bash
git push origin main
```

Expected: Vercel auto-deploys; watch the deployment to READY.

## Step 4: Post-deploy smoke (production)

- `curl -s https://estrevia.app/tarot/ace-of-wands | grep -c '<h1'` → ≥1
  (was: empty shell). Repeat for `/es/tarot/ace-of-wands`.
- Open `https://estrevia.app` on a phone-sized viewport (or devtools
  390×844), calculate a chart → open the paywall pre-consent → trial CTA
  visibly above the cookie banner and tappable.
- From the hero calculator result, click "See your full natal chart" →
  `/chart?chartId=…` renders the chart, NOT the empty form.
- PostHog Live Events: visit `/essays/<any>` → event's `locale` prop = `en`;
  visit `/` → a `landing_view` with `$lib=posthog-node` + `source:'server'`
  appears without touching the consent banner.
- Stripe webhook health: Stripe Dashboard → Webhooks → recent deliveries all
  2xx.

## Step 5: Run backfills with `--apply` (founder-confirmed, in this order)

```bash
node scripts/advertising/_backfill_placeholder_emails_2026_07_10.mjs --apply
node scripts/advertising/_backfill_converted_leads_2026_07_10.mjs --apply
```

Expected: A fixes the placeholder rows (audit: 2); B links at least
lainiekayg's lead. Save output to
`outputs/cro-phase0-2026-07/backfills-applied.txt`.

## Step 6: Meta scripts `--apply` (founder-confirmed, after reviewing
dry-run inventory)

```bash
node scripts/advertising/_relaunch_es_ads_repoint_2026_07_10.mjs --apply
node scripts/advertising/_relaunch_es_adset_cleanup_2026_07_10.mjs --apply
```

Expected: new PAUSED `_v2` ads exist in Ads Manager under the ES ad set;
targeting read-back shows no SV, `publisher_platforms=["facebook","instagram"]`.
Founder reviews the new ads (correct Page = Estrevia, `/es/` links) —
activation stays a relaunch-time decision.

## Step 7: Founder Stripe/Meta dashboard checklist (manual — no API exists
for these)

**Stripe Dashboard:**
1. Settings → Payment methods → Link → **disable Instant Bank Payments**
   (keeps Link card autofill; 17/20 recent failed charges were Link
   bank-funding `partner_insufficient_funds`).
2. Same page, default payment-method configuration: turn OFF cashapp /
   klarna / amazon_pay (foot-gun guard).
3. Settings → Business → Public business name → **Estrevia** (checkout page
   currently shows "Kirill Kovalenko").
4. Radar → Rules: exempt recurring/MIT charges from the high-risk block rule
   (3/43 failures were Radar blocking our own dunning retries).
5. Settings → Subscriptions and emails → enable auto-cancel for `past_due`
   subscriptions (kills the 44-day zombie emitting `invoice.payment_failed`
   forever).

**Meta Events Manager:**
6. Complete Task 15's outcome action — see
   `outputs/cro-phase0-2026-07/capi-422-diagnosis.md`: decision (A), most
   likely a stale/third-party-managed `capig.datah04.com` Conversions API
   Gateway instance for pixel `1945750759636135` — remove or reconfigure it
   in Events Manager → Data sources → pixel → Settings → Conversions API
   Gateway. No code change is involved (confirmed: zero repo code builds a
   `datah04`/`capig` request — see that doc's grep evidence).
7. Verify EMQ + event flow for pixel `1945750759636135` post-deploy —
   browser `PageView`/`Lead` events arriving, EMQ ≥7/10 for `Lead` (2026-05-11
   baseline was 4.6/10, expected to have improved after the 05-13 attribution
   fix; confirm it actually did).

## Step 8: Declare "ready to re-spend"

All of Steps 1-7 done → Phase 0 exit criteria met (spec's Success criteria
section). The actual re-spend decision (EN $25/day, two proven hooks) is the
relaunch runbook's territory — **NOT** part of this plan.

---

## What was and was not executed in this documentation pass

**Executed (read-only, in the isolated `cro-plans-exec` worktree):**
- `npm run typecheck`, `npx vitest run`, `npx eslint` on Phase 0 changed
  files — see `outputs/cro-phase0-2026-07/gate-report.md` for full results
  (GREEN, 2 environmental-only vitest file failures).
- Code read + repo-wide grep for the CAPI 422 diagnosis — see
  `outputs/cro-phase0-2026-07/capi-422-diagnosis.md`.
- Read-only `git diff`/`git merge-base` between `cro-plans-exec` and `main`
  to confirm the Step 0 conflict surface above.

**NOT executed — all founder-owned, all require shared-state credentials
this documentation task does not have (Vercel prod, git push, Stripe
dashboard, Meta Events Manager, Meta Graph API `--apply` writes):**
- Step 0 merge itself
- Step 1 Vercel env var writes
- Step 2 prod migration 0018
- Step 3 `git push origin main`
- Step 4 post-deploy smoke (no deploy has happened yet)
- Step 5 backfill `--apply` runs
- Step 6 Meta scripts `--apply` runs
- Step 7 Stripe/Meta dashboard manual checklist
- Step 8 re-spend declaration
