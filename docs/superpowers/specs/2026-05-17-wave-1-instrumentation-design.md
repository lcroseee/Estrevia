# Wave 1 — Instrumentation foundation

**Date:** 2026-05-17
**Parent spec:** [`2026-05-17-advertising-improvements-design.md`](./2026-05-17-advertising-improvements-design.md) — full audit + 3-wave roadmap
**Scope:** Top-4 Wave 1 items from the parent roadmap, selected as Wave 2 unblockers.
**Status:** Spec (approved 2026-05-17).

---

## 1. Goal

Unblock data-driven prioritization of Wave 2 by adding the minimum funnel instrumentation needed to measure each major leak end-to-end, plus a one-shot sanity check on the paid flow.

Wave 2 items (paywall variants, pricing CRO, email gate copy A/B, nurture re-engagement, geo expansion) require baseline conversion numbers per stage. Without those numbers, every Wave 2 design is speculation. Wave 1 closes that gap.

## 2. Constraints

- Solo founder; PostHog + Stripe + Resend already wired and healthy.
- No new astrology features.
- AGPL code / proprietary `content/` license split unchanged.
- PII (birth date/time/location) AES-256-GCM encrypted; not in URLs/logs/state.
- Code changes must come with tests (TDD per `feedback_follow_full_workflow`).
- Test-baseline: `npm test`, `npm run typecheck`, `npm run lint` must stay green.
- Per `feedback_lint_worktrees_pollution`: lint pre-existing pollution from `.claude/worktrees/` is not blocker; new lint issues are.

## 3. Sections

### 3.1. L2-A — `EMAIL_GATE_VIEWED` event

**Problem.** `src/shared/components/EmailGateModal.tsx` currently tracks `EMAIL_GATE_DISMISSED` and `EMAIL_LEAD_SUBMITTED` (via `/api/v1/leads`) but does not track when the gate is first shown. Without a "viewed" event we cannot compute the gate's conversion ratio (viewed → submitted), which is suspected to be the largest blind drop in the top half of the funnel.

**Change.**

1. Add `EMAIL_GATE_VIEWED: 'email_gate_viewed'` to `AnalyticsEvent` in `src/shared/lib/analytics.ts`.
2. In `EmailGateModal.tsx`, fire the event once per `open=true` transition using `useEffect`. Pass `{ chartId, locale }` to match the existing `EMAIL_GATE_DISMISSED` shape.
3. Important: do not fire on every re-render. Use a `useRef` "fired-for-this-open" flag, or list `open` as the only dependency and gate on previous value.

**Tests.** Update `src/shared/components/__tests__/EmailGateModal.test.tsx`:
- When rendered with `open={true}`, `trackEvent` called once with `EMAIL_GATE_VIEWED`, `{ chartId, locale }`.
- Re-render with same `open={true}` does not fire again.
- Toggle `open=false` → `open=true` fires again (second open of the modal in the same session).

**Acceptance.**
- Event present in `AnalyticsEvent` enum.
- Event fires in PostHog Live Events when the gate is opened in production.
- All tests green; `npm run typecheck` clean.

**Effort.** ~1 hour (30 min code, 30 min tests).

---

### 3.2. L3-A — Per-paywall funnel dashboard (PostHog UI + runbook)

**Problem.** Four paywall flows shipped recently (Celtic, 3-card, Synastry, Chart Reading) but we don't know per-flow drop-off rates. `PaywallModal` already tracks `PAYWALL_OPENED` with a `trigger` field; the funnel is build-able in PostHog but the dashboard does not exist yet.

**Change.**

1. Create one PostHog dashboard `Estrevia / Paywall funnels` containing 5 funnel reports — one per `trigger` value (values confirmed from production callers in `src/modules/`):
   - `celtic-cross` — from `CelticCross.tsx`
   - `three-card` — from `ThreeCardSpread.tsx`
   - `synastry-ai` — from `SynastryClient.tsx`
   - `natal-chart` — from `ChartReadingSection.tsx`
   - `essay` — from `EssayPageClient.tsx`
   `generic` is a fallback in `PaywallModal` for callers without a context; can be added as a 6th funnel for completeness.
2. Funnel steps for each:
   - Step 1: `paywall_opened` where `properties.trigger = <flow>`
   - Step 2: `paywall_trial_clicked` where `properties.trigger = <flow>`
   - Step 3: `checkout_stripe_redirected` (no trigger filter — checkout is shared)
   - Step 4: `subscription_started` (no trigger filter — webhook fire)
   Window: 24h (paywall → checkout typically same session).
3. Document the dashboard + HogQL queries in `docs/posthog-dashboards/paywall-funnel.md` so it is rebuildable.

**Tests.** No code tests (PostHog UI). Documentation is the artefact.

**Acceptance.**
- 5 funnels exist in PostHog and load without errors (6 if `generic` included).
- Runbook `docs/posthog-dashboards/paywall-funnel.md` committed with HogQL queries.

**Effort.** ~1-2 hours.

---

### 3.3. L3-D — Founder first-purchase smoke test runbook

**Problem.** `chart_readings = 0`. Unclear whether (a) no one wants to pay, (b) Stripe checkout is broken, (c) post-purchase entitlement is broken (user pays but Pro flag not set), or (d) AI Reading endpoint is paywalled wrong. Without an end-to-end smoke test on real Stripe, Wave 2 paywall improvements are designed in the dark.

**Change.**

Create `docs/runbooks/founder-first-purchase-smoke.md`:

```markdown
# Founder first-purchase smoke test

Goal: confirm the Pro upgrade path works end-to-end on real Stripe (test mode).
Budget: 1 hour, founder time only. Document any failures inline.

## Pre-flight
1. Run `node scripts/advertising/_audit_funnel_baseline.mjs`. Confirm:
   - `STRIPE_PRICE_ID_PRO_MONTHLY` and `STRIPE_PRICE_ID_PRO_ANNUAL` both `active=true`.
   - Currency `usd`, recurring `month` / `year`.
2. Confirm Stripe in test mode (toggle in dashboard). All steps use a test card.

## Steps
1. Open `https://estrevia.com/en/pricing` in incognito.
2. Sign up with a throwaway test email (e.g. `test+wave1@estrevia.dev`).
3. Click monthly upgrade.
4. Stripe Checkout opens.
5. Card: `4242 4242 4242 4242`, expiry `12/30`, CVC `123`, ZIP `10001`.
6. Submit. Expect: success redirect within 5s.
7. Confirm Welcome email arrives in Resend dashboard within 1 minute.
8. Check Neon DB:
   ```sql
   SELECT subscription_tier, subscription_status
   FROM users WHERE email = 'test+wave1@estrevia.dev';
   ```
   Expected: `pro` / `active`.
9. Open `/en/chart`. Calculate a chart. Click "Get AI reading".
10. Expected: full reading content, no paywall modal.

## Cleanup
- Stripe dashboard → cancel the test subscription.
- Delete the test user from Neon DB (or mark `deleted_at` per soft-delete pattern).

## Outcome
- [ ] Pass / [ ] Fail at step ___ / [ ] Partial — describe.
- Notes:
```

**Tests.** No automated tests (this is a manual runbook). Founder records outcome inline.

**Acceptance.**
- Runbook committed.
- Founder has run the test and recorded outcome (pass / fail-at-step-N) in the runbook itself or in `outputs/wave-1-checkpoint/`.

**Effort.** ~30 min to write runbook + 1 hour founder time to execute.

---

### 3.4. L4-A — Full-funnel PostHog dashboard

**Problem.** Metrics are split across Meta Ads Manager, Stripe, Neon DB, and PostHog. No single picture of `impressions → click → land → email-gate → lead → user → Pro`. Wave 2 prioritization without this is speculation.

**Change.**

1. Create PostHog dashboard `Estrevia / North Star` with 4 panels:
   - **Panel 1: North-star.** Weekly count of `subscription_started` events. Trend: last 12 weeks.
   - **Panel 2: Full funnel.** Sequence (24h windows, last 30 days):
     1. `landing_view`
     2. `chart_calculated`
     3. `email_gate_viewed` (requires Section 3.1 deployed first)
     4. `email_lead_submitted`
     5. `paywall_opened`
     6. `paywall_trial_clicked`
     7. `checkout_stripe_redirected`
     8. `subscription_started`
     Each step shows count + conversion-rate-from-previous.
   - **Panel 3: Cohort retention.** Users grouped by signup week × weeks since signup, cells showing % returning. Last 8 cohorts × 4 weeks each.
   - **Panel 4: Per-channel acquisition.** Group `email_lead_submitted` and `subscription_started` by `utm_source` property. Last 30 days, top 10 sources. Highlight `meta`, `organic`, `chatgpt.com`.
2. Document panel definitions + HogQL queries in `docs/posthog-dashboards/full-funnel.md`.

**Dependency on Section 3.1.** Panel 2 needs `email_gate_viewed`. Either:
- (a) Build the dashboard after Section 3.1 is deployed and the event has at least one data point, OR
- (b) Build the dashboard with a placeholder step ("event will land after L2-A merge") — but founder is solo, so (a) is simpler.

Recommend (a): build L4-A *after* L2-A is in production.

**Tests.** No code tests (PostHog UI).

**Acceptance.**
- Dashboard `Estrevia / North Star` exists in PostHog, loads, and contains all 4 panels with data.
- Runbook `docs/posthog-dashboards/full-funnel.md` committed.

**Effort.** ~2-3 hours.

---

## 4. Sequencing

```
Day 1 (sequential):
  09:00 — L2-A: code + tests + PR + deploy
  10:00 — L3-D: founder runs smoke test (in parallel with L3-A start)
  10:00 — L3-A: build PostHog paywall funnel + runbook
  14:00 — L4-A: build full-funnel dashboard (needs L2-A event data → wait ~1h after L2-A deploy)

Day 2:
  Document checkpoint baseline in outputs/wave-1-checkpoint/00-baseline.md.
```

Realistic spread: 3-4 working days end-to-end if founder is part-time. Real critical path:

- L2-A merge (1h) → blocks L4-A Panel 2.
- L3-A and L3-D run in parallel, independent of L2-A.
- L4-A waits for L2-A deploy + ~1h of event traffic to have at least one data point in Panel 2.

## 5. Wave 1 acceptance criteria (overall)

- ✅ `EMAIL_GATE_VIEWED` event present in `AnalyticsEvent` enum, fires correctly, covered by tests, deployed to production.
- ✅ Email gate conversion `email_gate_viewed → email_lead_submitted` has a measured baseline number (any value is valid).
- ✅ 5 paywall funnels exist in PostHog UI (one per production trigger context), runbook committed.
- ✅ Founder first-purchase smoke test executed; outcome recorded.
- ✅ Full-funnel dashboard exists in PostHog UI, runbook committed.
- ✅ `outputs/wave-1-checkpoint/00-baseline.md` records all baseline numbers (gate conversion %, per-paywall conversion %, north-star weekly count, top utm_sources).

## 6. Out of scope (deferred to Wave 2 or later)

- Email gate copy A/B test variants — needs L4-B feature flag infra.
- New EN ad creatives (`L1-A`) — moved out of Wave 1 to keep instrumentation foundation tight.
- Pause/replace ES Swiss creative (`L1-B`) — moved out of Wave 1 (5-min Meta Ads UI action, can happen anytime founder is in the manager).
- Resend read-only API key + extended audit (`L2-E`) — moved out of Wave 1.
- Per-creative ROI script (`L4-D`) — Wave 2.
- CAC + LTV tracking (`L4-C`) — Wave 2.

## 7. Risks and open questions

| Risk | Mitigation |
|---|---|
| PostHog data retention may not cover desired cohort window | Confirm plan retention before building Panel 3. Free plan = 12 months, sufficient. |
| `EMAIL_GATE_VIEWED` event spam from re-renders | Use `useRef` flag or open-transition gate; covered by test for re-render no-op. |
| L3-D smoke test reveals a critical bug | Pause Wave 1 progression, prioritize the fix as a hotfix outside this spec. |
| Stripe test mode mismatch with prod price IDs | Pre-flight step in L3-D explicitly verifies. |
| Founder runs smoke test but does not record outcome | Acceptance criterion requires recorded outcome; reviewer should not close Wave 1 without it. |

## 8. Success metric for Wave 1

The Wave 1 spec succeeds if, when handed the resulting dashboards and runbooks, Kirill can answer these questions in under 1 minute each:

1. What % of `chart_calculated` events convert to `email_lead_submitted`?
2. Which of the 4 paywall flows has the worst drop-off, and at which step?
3. Did the first-purchase smoke test pass? If not, where?
4. What's the weekly trend of Pro subscriptions?
5. Which `utm_source` drives the most leads vs. the most Pro upgrades?

If any of those takes longer than a glance, the dashboard / runbook needs revision.

## 9. References

- Parent roadmap: `docs/superpowers/specs/2026-05-17-advertising-improvements-design.md`
- Email gate component: `src/shared/components/EmailGateModal.tsx`
- Analytics events: `src/shared/lib/analytics.ts`
- Paywall components: `src/shared/components/PaywallModal.tsx`, `src/shared/components/PaywallCta.tsx`
- Stripe audit script: `scripts/advertising/_audit_funnel_baseline.mjs`
