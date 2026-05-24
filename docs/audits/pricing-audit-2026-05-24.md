# Pricing Source-of-Truth Audit — 2026-05-24

**Audit scope:** pricing consistency across Stripe live, DB schema, frontend strings, checkout API,
docs, and memory. Read-only on Stripe and DB. Code fixes applied where obvious and low-risk.

---

## 1. TL;DR

**Actual current pricing (live Stripe, 2026-05-24):**

| Plan | Price | Stripe Price ID | Interval |
|------|-------|-----------------|----------|
| Pro Monthly | $4.99 USD | `price_1TO1TnDoVTUWyGzGtrBtPfqy` | every 1 month |
| Pro Annual | $34.99 USD | `price_1TO1TnDoVTUWyGzG41VXsKPk` | every 1 year |

**Is it consistent?** Mostly yes. The frontend, checkout API, and Stripe are fully aligned on
$4.99/month and $34.99/year. The $9.98 figure mentioned in memory was not a price — it was a
transient label for a duplicate-subscription risk ($4.99 × 2) surfaced in a May 2026 traffic
audit. No source contains $9.98 as an actual price.

**What is stale:** three internal docs (`docs/business.md`, `docs/PRD.md`, `docs/roadmap.md`,
`docs/technical/stack/payments.md`) still reference the pre-launch hypothesis of $9.99/month and
$79.99/year ("Star tier"). These are founder-maintained docs — flagged here, not auto-edited.

**Code gaps found and fixed:** `docs/` and `.env.example` both missing `STRIPE_PRICE_ID_PRO_MONTHLY`
/ `STRIPE_PRICE_ID_PRO_ANNUAL` documentation. `.env.example` patched in this commit.

---

## 2. Sources of Truth — Ranked

| Rank | Source | Authority | Current Values |
|------|--------|-----------|----------------|
| 1 | **Stripe Products & Prices (live)** | Canonical — the actual charged amounts | $4.99/mo, $34.99/yr |
| 2 | **DB `users` table** | Mirror of what Stripe reported at subscription event time | plan enum: `free`, `pro_monthly`, `pro_annual` |
| 3 | **Frontend i18n strings** (`messages/en.json`, `messages/es.json`) | Display layer — must match Stripe exactly | $4.99, $34.99 ✓ |
| 4 | **Checkout API** (`src/app/api/v1/stripe/checkout/route.ts`) | Reads from env vars `STRIPE_PRICE_ID_PRO_MONTHLY` / `STRIPE_PRICE_ID_PRO_ANNUAL` | Correct, env-driven |
| 5 | **`docs/`** | Reference / context — founder-maintained | Stale (see §8) |
| 6 | **Memory files** | Episodic audit notes — read-only, not authoritative | $9.98 was a risk label, not a price |

---

## 3. Reconciliation Table

### 3.1 Core prices

| Field | Stripe (live) | DB schema | EN frontend | ES frontend | Code (checkout API) |
|-------|--------------|-----------|-------------|-------------|---------------------|
| Monthly price | $4.99 | — (no price col in users) | $4.99 ✓ | $4.99 ✓ | env-driven ✓ |
| Annual price | $34.99 | — (no price col in users) | $34.99 ✓ | $34.99 ✓ | env-driven ✓ |
| Annual effective/mo | $2.92 | — | ~$2.92/mo ✓ | ~$2,92/mes ✓ | not displayed |
| Savings % | 41.57% → rounds to 42% | — | "Save 42%" ✓ | "Ahorra 42 %" ✓ | not in code |
| Monthly×12 reference | $59.88 | — | $59.88 (in saveBadgeLong) ✓ | $59.88 ✓ | not in code |

**No price mismatches found** across Stripe, frontend, and checkout API.

### 3.2 Plan names

| Name in Stripe | Name in code (`plan` enum) | Name in UI | Match? |
|---------------|--------------------------|------------|--------|
| `Estrevia Premium` (product) | `pro_monthly` / `pro_annual` | "Pro" | ✓ Consistent — Stripe has one product, two prices |
| — | `free` | "Free" | ✓ |

Note: Stripe product is called "Estrevia Premium"; the UI tier is called "Pro". This is intentional
— the product name is internal; the UI label is the marketing name.

### 3.3 Docs drift (stale references)

| File | Stale value | Correct value | Action |
|------|-------------|---------------|--------|
| `docs/business.md` | Star=$9.99/mo, $79.99/yr | Pro=$4.99/mo, $34.99/yr | Founder update (spec doc) |
| `docs/PRD.md` | Star=$9.99/mo | Pro=$4.99/mo | Founder update (spec doc) |
| `docs/roadmap.md` | Star=$9.99/mo | Pro=$4.99/mo | Founder update (spec doc) |
| `docs/technical/stack/payments.md` | Stripe fees table uses $9.99/mo, $79.99/yr | $4.99/mo, $34.99/yr | Founder update |
| `.env.example` | Missing `STRIPE_PRICE_ID_PRO_MONTHLY`, `STRIPE_PRICE_ID_PRO_ANNUAL` | Should document both keys | **Fixed in this commit** |

### 3.4 Memory entries citing prices

- `project_traffic_audit_2026_05_21_pm.md`: "$34.99/year × 2 = $69.98 risk" — this is a risk
  calculation (2 duplicate subs × annual price), not a separate price. Correct context.
- `feedback_baseline_verification.md`: "$9.98 double-charge risk" — same: $4.99 × 2 monthly price
  = $9.98. The memory itself explains this was a false alarm (sub already had
  `cancel_at_period_end=true`). Not a price called "$9.98".

**Conclusion on $9.98:** not a product price. Never existed as a Stripe price. The confusion comes
from two sources: (a) old planning docs used $9.99/mo as a hypothesis; (b) memory audit notes
computed $4.99 × 2 duplicate-sub risk = $9.98 as a financial exposure figure.

---

## 4. LATAM Currency Analysis

### 4.1 Displayed values

**ES-only badge** (rendered in `PricingToggle.tsx` and `PaywallModal.tsx` when `locale === 'es'`):

| USD price | MXN | COP | CLP | PEN | UYU |
|-----------|-----|-----|-----|-----|-----|
| $4.99/mo | 90 | 21 000 | 4 740 | 19 | 200 |
| $34.99/yr | 630 | 147 000 | 33 200 | 133 | 1 400 |

### 4.2 Implied FX rates

| Currency | Implied rate (USD=1) |
|----------|----------------------|
| MXN | 18.0 |
| COP | 4 208 |
| CLP | 950 |
| PEN | 3.81 |
| UYU | 40.1 |

**Rates are internally consistent**: the monthly and annual badges use the same implied FX rates
(max deviation <0.5%). The `≈` prefix correctly communicates approximation.

### 4.3 FX staleness risk

Values were set on 2026-05-21 (3 days ago). The spec mandates quarterly review with an alert at
USD/MXN drift >10% from baseline 18 (thresholds: <16.2 or >19.8).

As of 2026-05-24, MXN/USD is approximately 17.5–18.5 — within range. No refresh needed.
Next review: **2026-Q3** (around August 2026) or on USD/MXN crossing 16.2 / 19.8.

### 4.4 Two-source hardcode (known drift risk)

The LATAM equivalents are hardcoded in **two** places that must be kept in sync:

1. `messages/es.json` — `pricing.monthlyPriceEquiv`, `pricing.annualPriceEquiv` (displayed in UI)
2. `src/app/api/v1/stripe/checkout/route.ts` — lines 106–108 — `esCurrencyEquiv` in
   `custom_text.submit` (displayed inside Stripe Checkout for ES sessions)

Both currently match exactly. When refreshing FX rates, both must be updated together.
A comment on line 104 of `route.ts` already says "keep in sync with messages/es.json when FX rates
refresh (quarterly)" — the risk is adequately documented.

---

## 5. Anchoring Analysis

**Annual framing check:**

```
Monthly price:      $4.99
Monthly × 12:       $59.88
Annual price:       $34.99
Savings (absolute): $24.89
Savings (%):        41.57% → displayed as "Save 42%" ✓ (rounds correctly)
Effective/month:    $2.917 → displayed as "~$2.92/mo" ✓ (rounds correctly)
```

**Anchor chain presented to user:**
1. Toggle chip: "Save 42%" (small badge on Annual button)
2. Price row: "$34.99/year · ~$2.92/mo"
3. Banner: "Save 42% — pay $34.99 once vs $59.88 monthly"
4. ES users also see: "≈ 630 MXN · 147 000 COP · 33 200 CLP · 133 PEN · 1 400 UYU"

**Minor copy note — "once" is technically imprecise:**
The `saveBadgeLong` string says "pay $34.99 **once** vs $59.88 monthly". The Stripe annual price
is `recurring/interval=year` — it auto-renews each year, not a true one-time payment. "Once" reads
as "one-time purchase" in consumer psychology. The intent is "pay once per year" which is
colloquially common ("pay once a year"), but it could mislead some users into thinking it's
lifetime. This is a **marketing copy decision** — flagged for founder review, not auto-fixed.

---

## 6. Pricing-Strategy Analysis

### 6.1 Annual savings vs benchmark

| Metric | Estrevia | Industry benchmark (skill) |
|--------|----------|---------------------------|
| Annual savings % | 41.6% | 17–20% |
| Monthly price | $4.99 | N/A |
| Annual price | $34.99 | N/A |
| Annual vs monthly×12 | $34.99 vs $59.88 | — |

Estrevia's 41.6% annual savings is **more than 2× the typical SaaS benchmark** of 17–20%.

### 6.2 Trade-off assessment

**This appears to be an intentional growth decision, not an accident.** Evidence:
- `docs/superpowers/specs/2026-05-03-senior-media-buyer-design.md` explicitly states:
  "LTV math: Premium $4.99/mo or $34.99/yr ($2.92/mo eff)"
- The price was live before the first paying users (confirmed by Stripe Price IDs created on the
  same day, May 2026)
- Conversion funnel shows annual as the default toggle (PricingToggle initializes to `'annual'`)

**Business case for aggressive annual discount at early stage:**
- Captures cash upfront ($34.99 now vs $4.99 × n)
- Reduces monthly churn risk during the first year (locked in)
- Improves LTV predictability for CAC calibration
- Reduces Stripe fees per dollar (annual: ~3.3% effective vs monthly: ~5.9%)

**Trade-off (per pricing-strategy skill):**
- Deep discounts train users to expect deals. If a coupon campaign adds another 15–20% on top of
  the existing 41.6% annual saving, combined discount hits ~50–55% — which can anchor perceived
  "true value" dangerously low.
- Monthly price at $4.99 is at the floor of viable SaaS pricing. Any future price increase
  requires careful migration (existing subscribers grandfathered or churned).
- The $34.99/year effective rate of $2.92/mo is **extremely aggressive** — Nebula (competitor)
  charges $24.99/month.

---

## 7. Discount Stacking Risk

**Current baseline annual savings:** 41.6% off monthly×12

Per pricing-strategy skill: "total discount stack ≤ 50% to preserve anchor integrity."

**Safe upper bound for additional promotional discount:**
```
50% ceiling − 41.6% baseline = 8.4pp headroom
```

So: a cart-abandon coupon or promotional code can safely offer **at most ~8% additional off the
annual price** (bringing effective annual to ~$32.10) before hitting the 50% ceiling.

Any coupon larger than 8% off the annual ($34.99) or any discount on the monthly ($4.99) price
would result in a combined discount ≥50% and should be avoided.

**Current state:** `allow_promotion_codes: true` is set in both authenticated and anonymous
checkout branches. Stripe promotions are unrestricted in code — Stripe Dashboard controls which
codes exist and their limits. Founder should set a maximum discount cap in Stripe Dashboard
(recommend: 8% or $2.90 off annual; 0% off monthly).

---

## 8. Recommendations

### 8.1 Must-fix (code) — Fixed in this commit

| # | Issue | Fix |
|---|-------|-----|
| C1 | `.env.example` missing `STRIPE_PRICE_ID_PRO_MONTHLY` and `STRIPE_PRICE_ID_PRO_ANNUAL` — any new developer setting up the project would not know these env vars exist | Added both keys with comments |

### 8.2 Founder decision required

| # | Issue | Severity | Recommendation |
|---|-------|----------|----------------|
| F1 | `saveBadgeLong` says "pay $34.99 **once**" — annual is recurring, not one-time | Low | Change to "pay $34.99/year" or "pay $34.99 once a year". Equivalent change needed in `es.json`. |
| F2 | Coupon codes are unrestricted in Stripe Checkout (`allow_promotion_codes: true`) | Medium | Set a max discount cap in Stripe Dashboard: suggest ≤8% off annual, no discount on monthly |
| F3 | Annual savings at 41.6% is intentional but aggressive. If pricing is raised later (e.g. $6.99/mo), the annual needs to be re-anchored too | Low | Accepted risk. Note in business docs when pricing is reviewed. |

### 8.3 Docs to update (founder-maintained — do not auto-edit)

| File | Change needed |
|------|--------------|
| `docs/business.md` | Replace "Star tier $9.99/mo, $79.99/yr" with "Pro tier $4.99/mo, $34.99/yr" |
| `docs/PRD.md` | Same tier rename + price update |
| `docs/roadmap.md` | Same tier rename + price update |
| `docs/technical/stack/payments.md` | Update fees table for $4.99/mo and $34.99/yr |

### 8.4 Low-priority / accepted

| # | Note |
|---|------|
| A1 | ES-only keys `pricing.monthlyPriceEquiv` / `pricing.annualPriceEquiv` intentionally absent from `en.json` — documented exemption in `scripts/qa/i18n-key-parity.test.ts` |
| A2 | Stripe product named "Estrevia Premium" while UI shows "Pro" — intentional, no action needed |
| A3 | No Stripe lookup_key set on either Price object — lookup keys are optional; code uses env vars correctly |
| A4 | LATAM badge hardcoded in two places (es.json + route.ts) — documented, comment in route.ts is adequate. Refresh both together quarterly. |

---

## 9. Code Drift List

### Fixed in this commit

| File | Issue |
|------|-------|
| `.env.example` | Added `STRIPE_PRICE_ID_PRO_MONTHLY` and `STRIPE_PRICE_ID_PRO_ANNUAL` with comments |

### Not auto-fixed (founder or low-risk copy decisions)

| File | Lines | Issue | Severity |
|------|-------|-------|----------|
| `messages/en.json` | `pricing.saveBadgeLong` | "once" wording | Low |
| `messages/es.json` | `pricing.saveBadgeLong` | "una vez" wording | Low |
| `docs/business.md` | 12–13, 49, 128 | Star/$9.99 → Pro/$4.99 | Doc-only |
| `docs/PRD.md` | 497–498 | Star/$9.99 → Pro/$4.99 | Doc-only |
| `docs/roadmap.md` | 26, 63 | Star/$9.99 → Pro/$4.99 | Doc-only |
| `docs/technical/stack/payments.md` | 30–35 | Fee table uses $9.99/$79.99 | Doc-only |

---

## Appendix: Stripe Live Data (read-only, 2026-05-24)

```
Price ID: price_1TO1TnDoVTUWyGzGtrBtPfqy
  nickname: Premium — Monthly
  amount: 499 cents = $4.99 USD
  interval: every 1 month
  product: Estrevia Premium (prod_UMkzOTbmHwCeYs)
  active: true
  lookup_key: none

Price ID: price_1TO1TnDoVTUWyGzG41VXsKPk
  nickname: Premium — Annual
  amount: 3499 cents = $34.99 USD
  interval: every 1 year
  product: Estrevia Premium (prod_UMkzOTbmHwCeYs)
  active: true
  lookup_key: none
```

Active products: 1 (`Estrevia Premium`). No inactive prices. No archived prices.

---

*Audit conducted by Backend agent on 2026-05-24. Stripe API queried read-only. DB not queried
directly (no migration or write access in scope). All code changes limited to documentation files.*
