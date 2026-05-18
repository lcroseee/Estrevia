# Wave 1 Baseline — 2026-05-17

**Closing artifact for Wave 1 T5** (instrumentation), establishing the snapshot against which Wave 2 and later A/B claims compare.

**Branch:** main
**Git SHA at snapshot:** `b276dcec6a9ccb4902102c367f0ffb2885cba838`
**Latest prod deploy:** `dpl_HqTjJzr5taYtFiUniaKmWYjNoVBg` (2026-05-17 evening session)
**Wave 1 spec:** `docs/superpowers/specs/2026-05-17-wave-1-instrumentation-design.md`
**Wave 1 plan:** `docs/superpowers/plans/2026-05-17-wave-1-instrumentation.md`
**Wave 2 closeout spec:** `docs/superpowers/specs/2026-05-17-wave-2-closeout-design.md`

## Funnel snapshot

| Metric | Value | Notes |
|---|---|---|
| Charts calculated /30d | `199` | from `natal_charts.created_at > NOW() - 30d` |
| Email leads /30d | `59` | from `email_leads.created_at > NOW() - 30d` |
| Email-gate conversion | `29.6%` | leads / charts |
| Email leads total | `59` | all-time |
| `sent_lead_emails` total | `59` | drip sends, all-time |
| `sent_lead_emails` by type | `{"lead_chart": 59}` | per-step breakdown |
| `sent_lead_emails` NULL msgid | `0` | Sev1 historical residue (pre-c94316f fix) |
| `chart_readings` total | `0` | paywall conversion proxy |
| Lead → user conversions | `0` | `email_leads.converted_to_user_id IS NOT NULL` |
| Lead → user % | `0.0%` | artifactual if drip just shipped — see note |

> **Note on lead→user %:** Drip first sends (T+0/T+24h/T+72h) shipped 2026-05-17 morning; T+7d/T+14d/T+21d shipped same day evening (Sev1 fix `c94316f`). Sub-1% conversion at snapshot reflects ~0-day exposure, not steady-state. Re-measure 2026-05-31 (2 weeks of T+7+ exposure) for first defensible number.

> **Note on NULL msgid:** The `sent_lead_emails_null_msgid` count is `0` at snapshot, meaning all existing rows have a `resend_message_id`. This may reflect the Sev1 fix having cleaned up prior state, or that the 59 lead_chart sends all succeeded. The prior audit (2026-05-17 evening) reported 32/33 NULL rows — those may now be resolved or the fix applied before those rows were written.

## Production deploy snapshot

| Component | Status |
|---|---|
| Sev1 result.error fix | Commit `c94316f`, live in `dpl_HqTjJzr5taYtFiUniaKmWYjNoVBg` |
| Wave 2 cron extension (T+7/14/21d) | Commit `74a67fc`, live in same deploy |
| Migrations applied | `13` |
| Latest migration | `9d7e960fffad...` at `2026-05-18T00:55:01.170Z` |
| Nurture partial-index predicate | `nurture_step < 6` (post-0012) |

## PostHog dashboards (created in Task 4)

- North Star: `https://us.posthog.com/project/407908/dashboard/1596577`
- Paywall funnel: `https://us.posthog.com/project/407908/dashboard/1596578`

## PostHog feature flags (created in Task 1)

- `wave2-demo-flag` — docs validation only, not wired to production logic. See `docs/posthog/feature-flags-guide.md:66`.

## Smoke test result

> **Pending — founder to fill via `docs/runbooks/founder-first-purchase-smoke.md`.**
>
> Smoke test goal: end-to-end first-purchase flow on production with real card, verifying chart calc → email gate → drip first send → checkout → confirmation email → chart_readings row created.
>
> Record below: date/time, outcome (pass/fail), any new bugs surfaced, link to Sev1 spec if applicable.

(Section to be filled by founder.)

## Wave 1 close footer

(Populated by Task 8 subagent after smoke result added.)

## Related memories

- `project_advertising_audit_2026_05_17_wave1` — Wave 1 instrumentation shipped
- `project_advertising_audit_2026_05_17_wave2` — Wave 2 conversion foundation shipped
- `project_lead_nurture_drip_fully_live` — Sev1 fix + cron extension + migration 0012 deploy
- `project_conversion_baseline_2026_05_17` — pre-baseline note (prior to drip running)
