# Paywall Teaser A/B Test — Brainstorm

**Date:** 2026-05-24  
**Context:** `lead_paywall_teaser` email (T+72h drip), 208 sent / 14d, open rate 17.5%, CTR 2.5%, ~0 trial-starts attributable to this step.

---

## 1. Problem hypothesis

The current email is generic. Subject "The full reading for your Capricorn chart" opens the brand right, but the body is a feature list, not a personal hook. Users who opened the email (17.5%) already signaled intent — the body copy needs to convert that intent into a click.

Three candidate drivers:
- **H1 Personalization lifts open rate.** Subject line with name + sign is already partially implemented (sunSign). Adding a specific named insight ("Saturn in 4th house…") creates curiosity. Expected: open rate +20–30 relative (17.5% → 21–23%).
- **H2 Discount overrides price objection.** 20% off annual ($34.99 → $27.99) is a concrete reason to click *now*. Expected: CTR +40–60 relative (2.5% → 3.5–4%). Risk: trains users to wait for discounts; may reduce post-trial LTV.
- **H3 Name personalization + discount is a bundle.** Harder to isolate which lever drove conversion. Justified as time-to-signal trade-off (see section 5).

**Pre-registered hypothesis:**  
"Personalization lifts open rate by reducing 'not relevant to me' dismissal. Discount lifts CTR by resolving 'I'd need to pay' friction. Both together (C) produce the highest trial-start rate but may reduce post-trial conversion due to discount dependency conditioning."

---

## 2. Variant rationale

### Variant A — Control
Current template as-is. `LeadPaywallTeaserEmail` unchanged. No name, no discount.

### Variant B — Personalized
- Subject: `{FirstName}, your {SunSign} chart has a reading waiting` (en) / `{FirstName}, tu carta {SunSign} tiene una lectura esperándote` (es)
- Body headline: uses name + dominant planet in house, e.g. "Hailey, your Saturn in Capricorn is one of the sharpest placements in the chart — here's what it means for you."
- Dominant planet derived via existing `pickDominantPlanet()` (Saturn/Mars/Venus/Mercury by essential dignity rule — already live in curiosity_hook email).
- House pulled from `planet.house` field on `PlanetPosition` (already computed, stored in chart JSON in `email_leads.chartId` lookup).
- If house is null (birth time unknown), fall back to sign-only: "your Saturn in Capricorn shapes how you…"
- CTA: same as control "Start 3-day free trial".
- Discount: none.

### Variant C — Personalized + Discount
- Everything from B.
- Subject suffix: ` — 20% off, 48h only` (en) / ` — 20% de descuento, solo 48h` (es)
- Body adds urgency block before CTA: "For the next 48 hours, unlock your full reading at 20% off annual — {discountPrice}/year instead of {fullPrice}."
- CTA: "Claim 20% off — start free trial".
- Technically: `allow_promotion_codes: true` already set on checkout; we pass `coupon_id` in the trialUrl as a query param `coupon=TEASER20` which the checkout page reads and applies via `discounts` param in Stripe session creation.
- Requires: `STRIPE_COUPON_TEASER20` env var pointing to a Stripe coupon with 20% off, no expiry (single-use per customer), duration=once.

**Bundle risk (explicit call-out per skill warning):**  
Variant C tests personalization + discount simultaneously. If C wins over B by a large margin, we cannot attribute the lift to one factor. Acceptable trade-off because: (1) current baseline is ~0 trial-starts → even detecting *any* winner provides actionable next step; (2) if C wins, we can run a sequential B vs C-no-name test later. The alternative (sequential A→B first, then B→C) extends timeline by ~8 weeks total at current send volume. Founder accepted parallel testing.

---

## 3. Power calculation

| Parameter | Value |
|-----------|-------|
| Baseline trial-start rate | ~1.5% (estimated from current 2/208 ~ 1.0%, rounded up) |
| Minimum detectable effect (relative) | 50% lift → 1.5% → 2.25% |
| Statistical power | 80% |
| Significance level | α = 0.05 (two-tailed) |
| Required N per variant | ~3,000 |
| Total required | ~9,000 sends |
| Current send rate | ~26/day (~780/month) |
| Time per variant | ~115 days |
| **Realistic duration at 1/3 allocation** | ~14–15 weeks per variant = 4–5 months |

**Key insight:** Statistical significance for the primary metric (trial-start rate) at current volume requires 4–5 months. This is a known limitation. We proceed because:
1. Secondary metrics (open rate, CTR) will be significant much sooner (~2 weeks each with 26/day × 3 variants = 78/day).
2. The experiment still provides directional signal on primary metric that can guide the next email iteration.
3. At 26/day now, if Meta campaigns scale to 100+ leads/day, duration drops to 4–6 weeks.

**Revised go/no-go window:**  
- **4 weeks post-launch (2026-06-21):** evaluate open rate + CTR with ~730 sends/variant. Power for CTR difference detectable at ~2 weeks (if effect ≥ 1.0 ppt absolute on 2.5% base).
- **12 weeks (2026-08-16):** primary metric interim check (alpha-spending: use Bonferroni p < 0.025 for each interim check).
- **Full 9000-send mark:** final analysis.

---

## 4. Success criteria

**Primary metric:**  
Trial-start rate = (leads who start subscription within 7d of paywall_teaser send) / (leads who received variant).

**Secondary metrics:**  
- Open rate (7d window after send)  
- CTR (clicks / delivered, 7d window)  
- Unsubscribe rate (7d window)  
- Complaint rate  

**Guardrails (early stopping):**  
- Variant C unsubscribe rate > 2% in any rolling 14d window → kill C immediately.
- Complaint rate (spam) > 0.1% for any variant → kill that variant.
- These thresholds are checked weekly by the weekly triage cron (manual review by founder).

---

## 5. Handling existing 208 already-sent leads

**Decision: exclude from experiment.** These leads already received Variant A (control, pre-experiment). Retroactively assigning a variant column would corrupt the analysis. The column `paywall_teaser_variant` is set NULL for all pre-existing rows and excluded from analysis queries.

**Assignment:** only `email_leads` rows created *after* migration 0014 (the T3 discount migration) get a variant assigned at INSERT time.

---

## 6. Assignment algorithm

Hash-based, deterministic, no PostHog dependency at send-time:

```
variant = ['A','B','C'][sha256(leadId) mod 3]
```

- Computed once at lead creation (INSERT into `email_leads`).
- Stored in `email_leads.paywall_teaser_variant` (`'A' | 'B' | 'C' | null`).
- Existing leads → NULL (excluded from experiment).
- Deterministic: given same `leadId`, always same variant.
- Replayable: can re-derive without DB to verify.

---

## 7. PostHog event tagging

All variant sends fire `paywall_teaser_sent` PostHog event with:
```json
{
  "experiment_variant": "A" | "B" | "C",
  "lead_id": "<hash, not raw>",
  "locale": "en" | "es"
}
```

For conversions, existing `subscription_started` event already fires with `utm_campaign`. We'll add `paywall_teaser_variant` to the conversion event by reading from DB at checkout time.

---

## 8. Risks

| Risk | Probability | Mitigation |
|------|-------------|------------|
| C trains discount-seeking behavior | Medium | Time-limit coupon in Stripe (duration=once), run 12 weeks max |
| Low statistical power at current volume | High | Accept directional; scale-dependent primary analysis |
| Name personalization breaks for missing names | Medium | Lead email captures name? Check at implement time; if no name field, fall back to sign-only subject |
| Coupon stacking with Allow Promotion Codes | Low | Use `discounts` array (not allow_promotion_codes) to prevent stacking |
| Lead data at send-time: chartId null | Medium | Variant B/C gracefully degrade to sign-only if house data unavailable |
