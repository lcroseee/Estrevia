# Viral Coefficient Dashboard — Founder Runbook

**Goal:** Build PostHog dashboard to monitor Cosmic Passport viral funnel weekly.

**Pre-conditions:**
- Wave 3 Section 1 deployed (commits Tn for SynastryResult fix).
- PostHog project 407908 active (production region: US).
- `passport_reshared`, `passport_viewed`, `passport_converted` events firing live (verify in PostHog Events tab).

## Setup steps

### 1. Create dashboard

PostHog → Dashboards → New dashboard → "Viral".

### 2. Insight 1 — Viral funnel (3 steps)

- Type: **Funnel**
- Steps:
  1. `passport_reshared` (any property)
  2. `passport_viewed`
  3. `passport_converted`
- Breakdown: event property `platform`
- Window: 7 days
- Conversion window: 7 days from step 1
- Save as "Viral funnel (7d)"

### 3. Insight 2 — Viral coefficient trend

- Type: **Trends**
- Series A: `passport_converted` — Total count
- Series B: `passport_reshared` — Total count
- Formula: `A / B` (use Formula mode in PostHog) — viral coefficient
- Date range: last 12 weeks, weekly aggregation
- Save as "Viral coefficient (weekly)"

### 4. Insight 3 — Per-channel share heatmap

- Type: **Trends**
- Series: `passport_reshared`
- Breakdown: event property `platform`
- Date range: last 12 weeks, weekly aggregation
- Chart type: Bar (stacked)
- Save as "Per-channel shares (weekly)"

### 5. Pin all 3 insights to "Viral" dashboard

## Weekly review checklist (5 min)

- [ ] Funnel step 1 → 2 conversion ≥ 5%? (if < 5%, share-URL UTM or attribution broken — check PostHog `passport_reshared` event `platform` distribution)
- [ ] Funnel step 2 → 3 conversion ≥ 1%? (if < 1%, /s/[id] PassportCta copy is leaking attention)
- [ ] Viral coefficient (formula) > 0.05? (if yes, paid-acquisition compounds at ROI multiplier `1/(1-VC)`)
- [ ] Top platform by `passport_reshared` count — note for L5-B prioritization
- [ ] Anomaly week with conversion >2× baseline — investigate ad creative / content shift

## When to take action

| Metric | Trigger | Action |
|---|---|---|
| Viral coefficient > 0.5 | 2 consecutive weeks | Start L5-B referral A/B (Wave 3.5) |
| Funnel step 1 → 2 < 3% | 2 consecutive weeks | Audit UTM wiring in `src/shared/lib/share.ts` |
| One platform contributes ≥ 80% reshares | 2 consecutive weeks | Optimize that platform's copy in `messages/{en,es}.json` `share.passport.copy.*` |

## Cross-references

- Spec §4: `docs/superpowers/specs/2026-05-17-wave-3-compound-growth-design.md`
- Wave 3.5 viral A/B (L5-B): blocked on 2 weeks of clean data from this dashboard
