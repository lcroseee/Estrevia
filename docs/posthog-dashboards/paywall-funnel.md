# Paywall funnel — per-trigger dashboard runbook

**Dashboard name in PostHog:** `Estrevia / Paywall funnels`
**Owner:** founder
**Refresh:** rebuild if event names change in `src/shared/lib/analytics.ts` or trigger values change in `src/shared/components/PaywallModal.tsx`.

## Purpose

Measure per-feature paywall drop-off so Wave 2 paywall variant tests can target the weakest step in the worst-performing flow.

## Production trigger values (confirmed 2026-05-17)

| `trigger` value | Source component | What it gates |
|---|---|---|
| `celtic-cross` | `src/modules/esoteric/components/CelticCross.tsx` | 10-card Celtic spread |
| `three-card` | `src/modules/esoteric/components/ThreeCardSpread.tsx` | 3-card tarot reading |
| `synastry-ai` | `src/modules/astro-engine/components/SynastryClient.tsx` | Synastry chart AI reading |
| `natal-chart` | `src/modules/astro-engine/components/ChartReadingSection.tsx` | Natal chart AI reading |
| `essay` | `src/modules/esoteric/components/EssayPageClient.tsx` | Premium essay |
| `generic` | (fallback when no `triggerContext` passed) | Any caller missing the prop |

## Dashboard structure

Create one **Funnel insight** per trigger above (6 total — include `generic` to catch wiring bugs).

### Funnel steps (identical across all 6 insights)

| Step | Event | Filter |
|---|---|---|
| 1 | `paywall_opened` | `properties.trigger = <flow-trigger>` |
| 2 | `paywall_trial_clicked` | `properties.trigger = <flow-trigger>` |
| 3 | `checkout_stripe_redirected` | (no trigger filter — Stripe flow is shared) |
| 4 | `subscription_started` | (no trigger filter — fired by Stripe webhook) |

**Conversion window:** 24 hours.
**Aggregation:** Total persons (not events).
**Date range:** Last 30 days, refresh weekly.

## HogQL queries

If you prefer SQL views over the insight UI, paste these into a PostHog SQL insight:

```sql
-- Paywall funnel for trigger = '<flow>'
-- Replace <flow> with one of: 'celtic-cross', 'three-card', 'synastry-ai',
-- 'natal-chart', 'essay', 'generic'.
SELECT
  event,
  count(DISTINCT person_id) AS unique_persons
FROM events
WHERE timestamp > now() - INTERVAL 30 DAY
  AND (
    (event = 'paywall_opened' AND properties.trigger = '<flow>')
    OR (event = 'paywall_trial_clicked' AND properties.trigger = '<flow>')
    OR event IN ('checkout_stripe_redirected', 'subscription_started')
  )
GROUP BY event
ORDER BY event
```

## Acceptance check

After building the dashboard, confirm:

- [ ] Six funnel insights exist (one per trigger value above).
- [ ] At least one insight shows non-zero entries at step 1 — confirms the event is firing in production.
- [ ] If a funnel shows step-1 traffic but zero step-2 conversions, mark that flow for Wave 2 paywall variant test priority.
- [ ] Dashboard is shared with the founder Clerk admin user only (not public).

## When to rebuild

- A new paywall trigger is added in `src/`. Add a 7th funnel.
- Event names in `AnalyticsEvent` change. Search-and-replace in the queries above.
- Conversion windows need tightening (e.g. 1h instead of 24h) — Wave 2 decision.
