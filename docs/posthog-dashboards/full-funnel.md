# Full funnel — Estrevia North Star dashboard runbook

**Dashboard name in PostHog:** `Estrevia / North Star`
**Owner:** founder
**Dependency:** Task 1 (`EMAIL_GATE_VIEWED` event) must be deployed to production for at least 1 hour before Panel 2 is meaningful.

## Purpose

One picture of the entire acquisition → activation → revenue funnel, replacing the 4-source manual rollup (Meta Ads Manager + Stripe + Neon + PostHog). Wave 2 prioritization references this dashboard as ground truth.

## Panel 1 — North-star: weekly Pro conversions

**Insight type:** Trends.
**Event:** `subscription_started`.
**Aggregation:** Total unique persons.
**Interval:** Weekly.
**Date range:** Last 12 weeks.

**HogQL alternative:**
```sql
SELECT
  toStartOfWeek(timestamp) AS week,
  count(DISTINCT person_id) AS new_subscribers
FROM events
WHERE event = 'subscription_started'
  AND timestamp > now() - INTERVAL 12 WEEK
GROUP BY week
ORDER BY week DESC
```

## Panel 2 — Full funnel

**Insight type:** Funnel.
**Window:** 24 hours per session.
**Date range:** Last 30 days.

| Step | Event | Filter |
|---|---|---|
| 1 | `landing_view` | — |
| 2 | `chart_calculated` | — |
| 3 | `email_gate_viewed` | — |
| 4 | `email_lead_submitted` | — |
| 5 | `paywall_opened` | — |
| 6 | `paywall_trial_clicked` | — |
| 7 | `checkout_stripe_redirected` | — |
| 8 | `subscription_started` | — |

Each step shows count + conversion rate from previous step.

**HogQL alternative (step-by-step counts only — funnel UI does conversion math):**
```sql
SELECT
  event,
  count(DISTINCT person_id) AS unique_persons
FROM events
WHERE event IN (
    'landing_view', 'chart_calculated', 'email_gate_viewed',
    'email_lead_submitted', 'paywall_opened', 'paywall_trial_clicked',
    'checkout_stripe_redirected', 'subscription_started'
  )
  AND timestamp > now() - INTERVAL 30 DAY
GROUP BY event
```

## Panel 3 — Cohort retention

**Insight type:** Retention.
**Cohort event:** `user_signed_up`.
**Return event:** any of (`chart_calculated`, `paywall_opened`, `subscription_started`).
**Period:** Weekly, 4 weeks deep.
**Cohorts:** Last 8 weeks of signups.

## Panel 4 — Per-channel acquisition

**Insight type:** Trends or table.
**Events:**
- `email_lead_submitted` (leads acquired)
- `subscription_started` (Pro conversions)
**Breakdown:** `properties.utm_source`.
**Date range:** Last 30 days.
**Limit:** Top 10 sources.

Highlight in the table: `meta`, `organic`, `chatgpt.com`, `passport`.

**HogQL alternative:**
```sql
SELECT
  properties.utm_source AS source,
  countIf(event = 'email_lead_submitted') AS leads,
  countIf(event = 'subscription_started') AS subs
FROM events
WHERE event IN ('email_lead_submitted', 'subscription_started')
  AND timestamp > now() - INTERVAL 30 DAY
GROUP BY source
ORDER BY subs DESC, leads DESC
LIMIT 10
```

## Acceptance check

- [ ] Dashboard `Estrevia / North Star` exists with all 4 panels.
- [ ] Panel 2 step 3 (`email_gate_viewed`) shows non-zero — confirms Task 1 deploy worked.
- [ ] Panel 4 shows `meta` and `organic` as top sources (sanity check on attribution).
- [ ] Dashboard shared with founder Clerk admin only.

## When to rebuild

- Event names change in `AnalyticsEvent`.
- Funnel order shifts (e.g. paywall moves before email-gate).
- Cohort definition expands (e.g. add `chart_saved` as cohort event).
