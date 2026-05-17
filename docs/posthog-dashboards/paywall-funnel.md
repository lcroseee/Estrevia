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

**Why steps 3-4 have no trigger filter:** the Stripe flow is shared across all paywall triggers and the pricing page. At low traffic volumes, you may see step-3 counts that exceed step-2 counts for a given trigger — this is expected cross-funnel inflation, not a bug. The signal to monitor per-trigger is step 1 → step 2 drop-off; step 2 → step 3 → step 4 is a shared-funnel view, not a per-flow view.

**Note on step 2:** `paywall_trial_clicked` is also fired from `src/app/[locale]/(marketing)/pricing/PricingUpgradeButton.tsx` with a `source: 'pricing'` property but no `trigger`. The filter `properties.trigger = <flow>` on step 2 correctly excludes those pricing-page clicks.

**Conversion window:** 24 hours.
**Aggregation:** Total persons (not events).
**Date range:** Last 30 days, refresh weekly.

## HogQL queries

For a quick headcount sanity check (not a true ordered funnel — see warning in the query), paste into a PostHog SQL insight:

```sql
-- NOTE: This query is a per-event headcount sanity check ONLY. It does NOT
-- enforce step order or conversion windows. For actual drop-off rates with
-- ordered funnel semantics, use the PostHog Funnel insight UI documented above.
--
-- Paywall headcount for trigger = '<flow>'
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
- [ ] Dashboard visibility set to private (PostHog project settings → Members; do not set to public).

## When to rebuild

- A new paywall trigger is added in `src/`. Add a 7th funnel.
- Event names in `AnalyticsEvent` change. Search-and-replace in the queries above.
- Conversion windows need tightening (e.g. 1h instead of 24h) — Wave 2 decision.
