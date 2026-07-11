# Local-currency billing for ES/LATAM — decision record (SP-B D5)

**Date:** 2026-07-11 · **Decision: STAY USD for now.** Display-only US$ framing +
fresh equivalents + trust pack (SP-B) ship first; real multi-currency is deferred
behind the trigger below.

## Why not now

Stripe `currency_options` on the two live Prices (`STRIPE_PRICE_ID_PRO_MONTHLY`,
`STRIPE_PRICE_ID_PRO_ANNUAL`) would make Checkout charge real MXN/COP/etc. by buyer
location with ZERO session-creation code change — which is exactly the problem:
every surface downstream assumes USD.

## What `currency_options` would take end-to-end

1. **Stripe:** add `currency_options` to both Prices (Dashboard or API `prices.update`);
   pick per-currency price points (psychological pricing per market, not raw FX).
2. **UI:** `US$4.99`/`US$34.99` strings (messages/*.json) and the entire FX-equivalence
   layer (`src/shared/lib/currency-equiv.ts`, `CurrencyEquivNote`, checkout
   `custom_text`) become WRONG the moment Stripe charges real MXN — all three would
   need per-currency display logic or removal.
3. **Webhooks/analytics:** `checkout.session.completed` amount fields arrive in the
   charged currency; revenue events (SUBSCRIPTION_STARTED value), dunning email copy
   ("$34.99"), and every audit script that sums `amount_total` assume USD cents.
4. **Meta constraint:** the Stripe-USD AR-exclusion in
   `scripts/advertising/setup-meta-campaign.ts` exists BECAUSE billing is USD;
   charging ARS would reopen Argentina targeting — a separate decision with its own
   FX-volatility risk.
5. **Ops:** refunds/disputes/support in 5+ currencies; FX spread on payouts;
   per-currency tax handling review.

Estimated effort: ~2–4 days code + audit-script sweep + a repricing decision per
market. pix/OXXO stay out regardless — settled NOT implementable for subscriptions
(`outputs/cro-audit-2026-07-10/09-es.md` ES-3).

## Uplift hypothesis (unproven)

The audit shows ES users abandon AT the card decision (21/22 sessions expired
pre-card-entry). Foreign-currency friction is one plausible cause; ambiguous
"$34.99" (reads as pesos) is another — SP-B removes the second cheaply. If
US$-framing + trust copy already lifts ES completion toward EN's 24%, multi-currency
buys little; if ES stays flat, currency itself is the stronger suspect.

## Revisit trigger

Re-open this decision if **ES Stripe-page completion (sessions created → completed)
is still <10% after 2 weeks of post-SP-B ES traffic** (baseline 4.5% — 1/22 sessions
in the 2026-07-10 audit — vs EN 24.1%). This mirrors the relaunch runbook's ES
re-spend gate (`docs/runbooks/2026-07-relaunch.md` §3): ES ads only turn on once
SP-B is deployed AND EN week-1 proves the funnel works end-to-end; once ES is live,
that same runbook explicitly routes back to this doc if the watch metric misses.

## Watch-metric runbook (post-ES-relaunch)

Metric: Stripe Checkout sessions created→completed, ES only. Target **>10%**
(baseline 4.5%).

Read-only check (run from repo root; uses `.env` `STRIPE_SECRET_KEY`):

    node --input-type=module -e "
    import { config } from 'dotenv'; config({ path: '.env' });
    import Stripe from 'stripe';
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const since = Math.floor(Date.now() / 1000) - 14 * 86400;
    let created = 0, completed = 0;
    for await (const s of stripe.checkout.sessions.list({ created: { gte: since }, limit: 100 })) {
      if (s.metadata?.locale !== 'es') continue;
      created += 1;
      if (s.status === 'complete') completed += 1;
    }
    console.log(\`ES sessions last 14d: created=\${created} completed=\${completed} rate=\${created ? ((100 * completed) / created).toFixed(1) : 'n/a'}%\`);
    "

Cross-check in PostHog: `checkout_stripe_redirected` vs `subscription_started`
by locale — derive locale from `$pathname` prefix until the super-prop backfill
settles (known /essays mislabel, fixed in CRO Phase 0).

## FX-freshness caveat (do this before ES Meta spend, not before reading this doc)

The LATAM equivalents shown alongside the US$ price (`src/shared/lib/currency-equiv.ts`,
mirrored into `messages/es.json`) are marked `[FOUNDER-VERIFY]` and are **2026-05-23
vintage** (USD→MXN ≈ 18, COP ≈ 4 210, CLP ≈ 950, PEN ≈ 3.8, UYU ≈ 40) — already
~7 weeks stale as of this doc's date. Staying on USD billing does not make this
free: the equivalence line is user-facing copy, and a stale FX line is its own
small trust leak (SP-B D2's whole point was to stop it drifting further, not that
it's now permanently correct). Per the module header's own instructions and the
SP-B founder checklist (Task 10, item 1): refresh the two strings in
`currency-equiv.ts` + the mirrored `messages/es.json` keys, and pass the sync test
(`npx vitest run src/shared/lib/__tests__/currency-equiv.test.ts`), **before**
re-enabling ES Meta spend — i.e. before relaunch runbook §3's gate is satisfied,
not as a follow-up after ES ads are already live.
