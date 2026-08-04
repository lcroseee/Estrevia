# Reconcile #3 — Where exactly does the ES paywall funnel leak?

**Date:** 2026-07-10 · **Scripts:** `scripts/advertising/_cro_audit_2026_07_10_reconcile_es_paywall.mjs` + `_es_paywall2.mjs` (read-only: HogQL SELECT + Stripe GET)

## Verdict

**Both partially — 09-es.md is right about WHERE (the Stripe payment page is the largest ES-specific leak), 07-paywall.md is right about the NUMBERS (its 60% vs 77% is real and exactly reproducible; 09's 49% vs 100% is a method artifact).** The modal gap exists (ES 54% vs EN 67% open→click, −12.5pp, ES at 0.81× of EN) but it is the *second* leak. The dominant relative ES-vs-EN gap is Stripe session created→complete: **ES 1/22 (4.5%) vs EN 13/54 (24.1%) — ES completes at 0.19× of EN**, roughly 4× larger a relative gap than the modal's.

## Canonical method (one consistent derivation)

PostHog HogQL, `count(DISTINCT person_id)`, window `2026-05-13 00:00` → `2026-07-10` (end-exclusive 07-11), locale = `$pathname` prefix (`/es/` or `/es` → es, else en) **at the paywall event itself**. Click/redirect steps restricted to modal origin (`paywall_trial_clicked` where `source != 'pricing'`; `checkout_stripe_redirected` where `trigger` is set — PricingUpgradeButton fires both with `source:'pricing'` and no trigger; CheckoutStartClient fires redirect with neither; verified in `src/shared/components/PaywallModal.tsx:65,110,137`, `PaywallCta.tsx:43`, `pricing/PricingUpgradeButton.tsx:28,67`, `checkout/start/CheckoutStartClient.tsx:70`). Stripe leg: `checkout.sessions.list` created in the same window, locale from `session.metadata.locale` (set by `api/v1/stripe/checkout/route.ts:284,291,372`).

## Definitive EN vs ES step table (uniques; Stripe leg = sessions)

| Step | EN | ES | EN rate | ES rate | ES÷EN |
|---|---|---|---|---|---|
| paywall_cta_viewed | 74 | 67 | — | — | — |
| paywall_opened | 27 | 24 | view→open 36.5% | 35.8% | 0.98 |
| paywall_trial_clicked (modal) | 18 | 13 | open→click 66.7% | **54.2%** | **0.81** |
| checkout_stripe_redirected (modal) | 15 | 12 | click→redir 83.3% | 92.3% | 1.11 |
| Stripe session created (all sources, window) | 54 | 22 | — | — | — |
| Stripe session complete | 13 | 1 | created→complete 24.1% | **4.5%** | **0.19** |

- Conditioned same-person funnel (same locale bucket, person must have the prior step) confirms the modal gap at the same magnitude: EN opened→clicked 16/27 = 59.3% vs ES 12/24 = 50.0%.
- Stripe caveats: (a) 14 pre-05-20 sessions predate locale metadata and sit in "en/unset"; 4 unset-metadata sessions on 05-21/05-23 have Stripe-page `locale=es` — reassigning them makes ES **1/26 (3.8%)**. Using only explicit metadata: EN 11/33 = 33.3% vs ES 1/22 = 4.5% → ES÷EN = **0.14**. Every cut says the same thing. (b) "complete" = card entered + $0 trial started (subscription mode); ES's single complete is 05-25 `es-419`. (c) Stripe leg includes /pricing and drip `/checkout/start` sessions, not only paywall-originated, and ES sessions cluster 05-20→06-02 (ads dark since 05-24).

**Largest relative ES-vs-EN gap: the Stripe payment page (created→complete, 0.19×), not the modal (open→click, 0.81×).** CTA→open and click→redirect are at parity. In absolute uniques ES reaches Stripe redirect at near-EN parity (12 vs 15) — the ES revenue hole cannot be primarily a modal problem.

## How each report got its number (both exactly reproduced)

**07-paywall's 60% vs 77%** = `distinct_id` uniques, **natal-chart trigger only**, pathname locale, window 05-13→07-10. Reproduced digit-for-digit: EN 75 cta / 22 opened / 17 clicked / 15 redir (17/22 = 77%); ES 68 / 25 / 15 / 13 (15/25 = 60%). Legitimate measurement; canonical person_id + all-trigger version lands at 67% vs 54%. Its only flaw is framing: it calls the modal "the ES break" while its own §1.3 notes Stripe-page abandonment dominates — it never computed the Stripe leg *by locale*.

**09-es's 49% vs 100%** = `distinct_id` uniques, **all-time**, locale from the racy `locale` super-prop with an es-path fallback. Reproduced digit-for-digit: en(prop) 49/18/18/16 → 18/18 = "100%"; es(prop) 22/17/10/9 + es-path 50/18/7/6 → combined 17/35 = 49%. Three artifacts stack:
1. **Asymmetric bucketing** — locale-null events on EN paths (34 cta / 7 opened / 6 clicked) were dropped from the EN row, while the analogous locale-null ES-path traffic was folded INTO the ES row. Symmetric treatment alone drops EN to ~24/25 = 96%.
2. **Pricing-click contamination** — `paywall_trial_clicked` from /pricing (fires with no modal open; 5 uniques / 11 events in the en-prop bucket all-time) inflates the EN numerator past its `paywall_opened` denominator → the impossible 100%.
3. **Super-prop race pollution of ES** — 8 uniques / 14 in-window `paywall_opened` events on **EN paths** carry `locale='es'` (mostly essay-modal opens, which click at 1/15); pathname-locale reassigns them to EN, lifting ES open→click from 49% to 54%.
So 09's step numbers are wrong, but its cross-source conclusion — 23/24 ES sessions abandoned before card entry — survives: canonical window count is 21/22 ES sessions expired (1 complete).

## What REPORT.md must say

1. ES leak ranking: **#1 Stripe payment page** (ES created→complete 4.5% vs EN 24.1%, 0.19×; 21/22 ES sessions expired) — **#2 inside the modal** (ES open→click 54.2% vs EN 66.7%, 0.81×; the STR-2/ES-1/ES-2 copy-and-l10n fixes remain justified as P1) — CTA→open and click→redirect at parity, no fix needed.
2. Quote **54% vs 67%** (canonical) or 07's 60% vs 77% (natal-chart-only) for the modal gap; **never** 09's 49% vs 100% — both of those digits are derivation artifacts.
3. The ES recommendation priority is 09's: fix the Stripe-page experience for LATAM (payment-method reality, trust, currency framing) before/alongside modal copy — the modal alone cannot close a 5× completion gap that sits after redirect.
