# Attribution Windows — Hybrid by Purpose (v3a)

**Date:** 2026-05-03
**Status:** active
**Spec source:** `docs/superpowers/specs/2026-05-03-advertising-pre-flight-blockers-design.md` Q4

## Why hybrid

Meta, PostHog, and Stripe each disagree about what "attributed conversion"
means. The astrology vertical has a 30-50% delayed conversion tail in days
7-14 post-click. A single window choice optimises for one purpose at the
expense of others.

## Per-source windows

| Source | Window | Used for |
|---|---|---|
| Meta Insights | `7d_click` only (no view) | Phase detection (learning maturity, scale-eligibility) |
| PostHog HogQL | 14 days from first ad-click event per distinct_id | ROAS / CPA / drop detection |
| Stripe attribution | 14 days from `metadata.utm_click_timestamp` | Revenue + ROAS denominator |
| Reconciler comparison | 7 days everywhere — apples-to-apples | Detect Meta-vs-PostHog drift |

## Implementation references

- `src/modules/advertising/perceive/meta-insights.ts` — `action_attribution_windows: ['7d_click']`
- `src/modules/advertising/posthog/funnel-client.ts` — `attribution_window_days` parameter (default 14, reconciler 7)
- `src/modules/advertising/perceive/stripe-attribution.ts` — `attributionWindowDays` parameter (default 14)

## Recalibration

Re-evaluate after 3-6 months of production data. The 14-day default for
PostHog/Stripe assumes the astrology vertical's delayed-conversion tail
matches our prior. If we observe most conversions inside 3-7 days, tighten;
if more reach 21+ days, widen.

## Rationale for excluding view attribution from Meta

View-attribution counts impressions (not clicks) as conversion sources.
Awareness creatives inflate counts artificially under view-attribution,
which distorts phase-detection logic. Click-only attribution is more
conservative and matches the senior-buyer mental model: "did this ad cause
the conversion or just appear nearby?"
