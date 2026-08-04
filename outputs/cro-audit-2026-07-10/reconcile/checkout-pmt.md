# Reconcile #6 — "Bank app" on the live checkout page vs card+link-only policy

**Question:** Did a non-card payment method leak back into checkout?
**Claims in conflict:**
- `01-stripe.md` §6: "9/9 sessions: `subscription: card+link`. Zero wallet leaks (cashapp/klarna/amazon_pay/afterpay/affirm: 0)."
- `08-pricing-checkout.md` §3: "`payment_method_types` = `['card','link']` on both branches; no other `checkout.sessions.create` call sites in `src/` — baseline STR-5 leak closed."
- `10-live.md` LIVE-3 §3: "'Bank app' payment method visible on a trial subscription despite the card+link-only policy … → hand to Stripe sector to locate which checkout path leaks methods."

**Verdict: both partially right — no config leak occurred (01/08 correct on facts), but 10-live's observation is real and the risk behind it is real and already materialized. 10-live's *mechanism* ("payment_method_types leak") is wrong: "Bank app" is Link's bank-account funding rendered by Stripe *inside* the allowed `link` method.**

Derivation script: `scripts/advertising/_cro_audit_2026_07_10_reconcile_checkout_pmt.mjs` (read-only: Stripe list/GET only).

---

## (a) The walkthrough session — exact API state

Exactly **one** checkout session was created on 2026-07-10 (UTC), matching 10-live's `cs_live_b1GX…` and screenshot 12 (17:56 local = 21:56 UTC):

```
id:      cs_live_b1GXR3FtqlEujdHVHKNu6ERtimkSxmP2sc1sgbqrl1n9CMkW6fqUZCBG4A
created: 2026-07-10T21:55:39Z   status: open   mode: subscription   ui_mode: hosted
locale:  auto   amount_total: 0 (trial)   metadata: { anonymous_id: b9c3d5f9-…, locale: en }
payment_method_types: ["card", "link"]                       ← policy intact
payment_method_options: { card: { request_three_d_secure: "automatic" } }
payment_method_configuration_details: null                   ← dashboard dynamic PMs NOT applied
discounts: []
```

- `payment_method_types` is exactly `['card','link']` — matches deployed code `origin/main src/app/api/v1/stripe/checkout/route.ts:226` (anon) and `:350` (auth); grep confirms no other `checkout.sessions.create` call site.
- `payment_method_configuration_details: null` **rules out the "dynamic payment methods override" hypothesis**: when a session passes an explicit `payment_method_types` list, the dashboard payment-method configuration is bypassed, and Stripe records no pmc on the session. The dashboard default config (`pmc_1TJjPaDoVTUWyGzGops5qUaR`) does have cashapp/klarna/amazon_pay/affirm/pix/blik ON — a latent foot-gun if anyone ever drops the explicit list — but it did not touch this session. Notably, every standalone bank rail in it is **off**: `us_bank_account: off`, `pay_by_bank: off`, `acss_debit: off`.

## (b) What "Bank app" actually is

Screenshot `screenshots/12-stripe-checkout-annual-mobile.png` shows: Apple Pay button + Link button, then "Payment method: ◯ Card / ◯ **Bank app**" (bank icon). With the session's list being `['card','link']` and every standalone bank method disabled account-wide, the only rail "Bank app" can resolve to is **`link` — Link's Instant Bank Payments** (bank-account funding via Financial Connections, ACH-like). Stripe's hosted Checkout renders Link's bank funding as a first-class "Bank app" tile for US customers whenever `link` is in the list. Apple Pay likewise rides the `card` rail (wallet), not a separate type. **Nothing leaked; "Bank app" is a sub-option of the allowed `link` method.** 10-live's "locate which checkout path leaks methods" has no target — all paths are clean.

Charge-level proof that bank-funded Link is what type `link` produces here: all failed `link` payments in the account are **`py_`-prefixed** (non-card-rail payment objects) with `payment_method_details.type: "link"` and decline `partner_insufficient_funds` — "insufficient funds **with the payment provider**", i.e. the bank behind Link. Card-funded Link payments would instead appear as `ch_` card charges (wallet=link).

## (c) Founder-rule risk check — does "Bank app" create off-session billing risk?

**Yes — and it is not hypothetical; it is the account's #1 failure mode right now.**

- **Failed charges, last 30d (n=20): 17/20 (85%) are `py_`/`link` `partner_insufficient_funds`** — mpidarling90 ×9 ($34.99 trial-end, sub canceled 7/03, $0 collected) and divinelyguided2626 ×8 ($4.99 renewal, `past_due`, final smart-retry 2026-07-11). The other 3 are card declines (626lugo626 ×2 google_pay-wallet visa `insufficient_funds`, millyblack9206 ×1 `transaction_not_allowed`).
- **Subscription default PMs**: 5 of 15 subs ever carry `default_payment_method.type = link` — including both of the above. So a trial started via the "Bank app" tile (or Link bank funding) **does** end up as the sub's off-session default and **does** fail at trial-end/renewal exactly per the founder rule (`feedback_stripe_wallet_pmt_for_subs`).
- Counter-example proving the card rail is fine: the sole surviving payer (lainiekayg, sub_1TfWbY) defaults to `card visa/debit wallet:apple_pay` and successfully renewed off-session on 7/10.
- Nuance vs 01-stripe §6's caveat ("Link is not a wallet-rail problem — it retries fine"): retries *fire* fine, but **link-bank retries have recovered $0 lifetime**; mechanically it behaves exactly like the banned wallet/push rails at collection time. The precise restatement: *the card+link policy blocks cashapp/klarna/amazon_pay but does not block bank-account funding, because that funding lives inside `link` itself.*

## Exact risk statement

> Every checkout today offers a "Bank app" option that is Link Instant Bank Payments. Any trial user who picks it gets a bank-funded `link` default payment method on their subscription; at trial-end/renewal Stripe debits it off-session, and in this account that debit has failed 17 consecutive times across 2 customers in 30 days (`partner_insufficient_funds`) with $0 ever recovered by retries or dunning. The `['card','link']` policy does not and cannot prevent this via `payment_method_types`.

## Fix (goes in REPORT.md, replaces LIVE-3 item 3's "audit payment_method_types leak")

1. **No code audit needed** — the code and all live sessions are `card+link`; close that action.
2. **Dashboard, not code:** Stripe Dashboard → Settings → Payments → Payment methods → **Link → disable "Instant Bank Payments" / bank-account funding** (keeps Link's 1-click saved-*card* autofill, removes the "Bank app" tile). If the toggle isn't exposed on this account, ask Stripe support to disable Link bank funding, or fall back to (3).
3. **Fallback (code, heavier):** drop `'link'` from `payment_method_types` at `route.ts:226,350` for subscription mode — loses Link card autofill conversion lift, so prefer (2).
4. **Latent foot-gun:** the default payment-method configuration still has cashapp/klarna/amazon_pay/affirm ON; turn them off at dashboard level too, so a future code path that omits the explicit list can't resurrect the 05-29 STR-5 leak.
