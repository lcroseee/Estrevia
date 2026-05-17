# Wave 1 Instrumentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the minimum funnel instrumentation needed to measure each major leak in the Estrevia acquisition → activation → revenue funnel, plus a one-shot sanity check on the paid flow. This unblocks data-driven prioritization of Wave 2.

**Architecture:** Single code change (`EMAIL_GATE_VIEWED` event in `EmailGateModal`), three documentation files (PostHog runbooks + founder smoke test), and one manual checkpoint task for the founder to build the actual PostHog dashboards in the UI and record baseline numbers.

**Tech Stack:** TypeScript, React, Next.js App Router, Vitest + Testing Library (jsdom), PostHog (analytics + dashboards + HogQL), Resend (email — for smoke test verification), Stripe (checkout — for smoke test).

---

## Task ownership

| Task | Owner |
|---|---|
| T1: `EMAIL_GATE_VIEWED` event | engineer |
| T2: Paywall funnel runbook | engineer |
| T3: Founder smoke test runbook | engineer |
| T4: Full-funnel runbook | engineer |
| T5: Founder manual checkpoint | founder |

Engineer tasks (T1-T4) are TDD/doc work and can be executed start-to-finish in one session. T5 is asynchronous founder action (~1-2 hours) and must happen **after** T1 is deployed to production (Panel 2 of the full-funnel dashboard needs `email_gate_viewed` event data).

---

## File map

**Modify:**
- `src/shared/lib/analytics.ts` — add `EMAIL_GATE_VIEWED` enum value
- `src/shared/components/EmailGateModal.tsx` — fire event on `open` transition to true
- `src/shared/components/__tests__/EmailGateModal.test.tsx` — add 3 tests for the event

**Create:**
- `docs/posthog-dashboards/paywall-funnel.md` — T2 runbook (5-6 per-trigger paywall funnels)
- `docs/runbooks/founder-first-purchase-smoke.md` — T3 runbook (manual smoke test)
- `docs/posthog-dashboards/full-funnel.md` — T4 runbook (4-panel north-star dashboard)
- `outputs/wave-1-checkpoint/00-baseline.md` — T5 result (founder records baselines here)

---

## Task 1: `EMAIL_GATE_VIEWED` event in `EmailGateModal`

**Files:**
- Modify: `src/shared/lib/analytics.ts:229` (add enum entry after `EMAIL_GATE_DISMISSED`)
- Modify: `src/shared/components/EmailGateModal.tsx` (add `useRef` + `useEffect` near existing focus-trap `useEffect`, ~line 73)
- Test: `src/shared/components/__tests__/EmailGateModal.test.tsx` (add 3 tests inside the `describe('EmailGateModal', ...)` block)

### Step 1.1: Write the failing tests

- [ ] Add three new tests to `src/shared/components/__tests__/EmailGateModal.test.tsx` immediately after the `'renders nothing when open=false'` test (around line 62):

```tsx
  it('fires email_gate_viewed once when rendered with open=true', () => {
    const ph = makePosthogMock();
    render(<EmailGateModal {...baseProps} />);
    const viewedCalls = ph.capture.mock.calls.filter(
      (call: unknown[]) => call[0] === 'email_gate_viewed',
    );
    expect(viewedCalls).toHaveLength(1);
    expect(viewedCalls[0]?.[1]).toEqual({
      chartId: 'chart_test_1',
      locale: 'en',
    });
  });

  it('does NOT re-fire email_gate_viewed when re-rendered with the same open=true', () => {
    const ph = makePosthogMock();
    const { rerender } = render(<EmailGateModal {...baseProps} />);
    rerender(<EmailGateModal {...baseProps} />);
    rerender(<EmailGateModal {...baseProps} />);
    const viewedCalls = ph.capture.mock.calls.filter(
      (call: unknown[]) => call[0] === 'email_gate_viewed',
    );
    expect(viewedCalls).toHaveLength(1);
  });

  it('re-fires email_gate_viewed when open toggles false → true again', () => {
    const ph = makePosthogMock();
    const { rerender } = render(<EmailGateModal {...baseProps} />);
    rerender(<EmailGateModal {...baseProps} open={false} />);
    rerender(<EmailGateModal {...baseProps} open={true} />);
    const viewedCalls = ph.capture.mock.calls.filter(
      (call: unknown[]) => call[0] === 'email_gate_viewed',
    );
    expect(viewedCalls).toHaveLength(2);
  });
```

### Step 1.2: Run the tests to confirm they fail

- [ ] Run:
```bash
npx vitest run src/shared/components/__tests__/EmailGateModal.test.tsx -t 'email_gate_viewed'
```
Expected: 3 tests, all FAIL (event is not fired anywhere).

### Step 1.3: Add the enum entry

- [ ] Open `src/shared/lib/analytics.ts`. Find line 229:

```ts
  EMAIL_GATE_DISMISSED: 'email_gate_dismissed',     // PostHog only — no CAPI
```

- [ ] Replace it with the following two lines (preserve trailing comma + comment style):

```ts
  EMAIL_GATE_DISMISSED: 'email_gate_dismissed',     // PostHog only — no CAPI
  EMAIL_GATE_VIEWED: 'email_gate_viewed',           // PostHog only — no CAPI
```

### Step 1.4: Fire the event from `EmailGateModal`

- [ ] Open `src/shared/components/EmailGateModal.tsx`.

- [ ] Update the imports if needed — `useRef` is already imported (line 3). No change needed.

- [ ] Find the existing `useEffect` block that starts around line 73 (focus-trap / Escape handler). Immediately **above** that `useEffect`, insert a new `useEffect` plus its `useRef` guard:

```tsx
  const viewedFiredRef = useRef(false);

  useEffect(() => {
    if (open) {
      if (!viewedFiredRef.current) {
        trackEvent(AnalyticsEvent.EMAIL_GATE_VIEWED, { chartId, locale });
        viewedFiredRef.current = true;
      }
    } else {
      viewedFiredRef.current = false;
    }
  }, [open, chartId, locale]);
```

Why this shape:
- The `useRef` flag dedupes re-renders where `open=true` persists.
- The `else` branch resets the flag on `open=false` so the next true-transition fires again.
- Listing `chartId` and `locale` in deps satisfies the lint rule; the ref guard prevents re-fire when only those change while `open` stays true.

### Step 1.5: Run the tests to confirm they pass

- [ ] Run:
```bash
npx vitest run src/shared/components/__tests__/EmailGateModal.test.tsx
```
Expected: ALL tests pass, including the 3 new ones plus the 12 pre-existing ones.

### Step 1.6: Run full type-check + lint

- [ ] Run:
```bash
npm run typecheck
```
Expected: no errors.

- [ ] Run:
```bash
npm run lint -- --max-warnings=0 src/shared/components/EmailGateModal.tsx src/shared/lib/analytics.ts
```
Expected: no errors in the two modified files. (Per `feedback_lint_worktrees_pollution`, ignore pre-existing pollution from `.claude/worktrees/`.)

### Step 1.7: Commit

- [ ] Stage and commit:
```bash
git add src/shared/lib/analytics.ts src/shared/components/EmailGateModal.tsx src/shared/components/__tests__/EmailGateModal.test.tsx
git commit -m "$(cat <<'EOF'
feat(analytics/email-gate): EMAIL_GATE_VIEWED event for funnel measurement

Adds a one-fire-per-open analytics event on EmailGateModal mount.
Closes the largest blind drop in the funnel — until now we could
only measure email_lead_submitted but not how many users saw the
gate in the first place.

Pattern: useRef flag dedupes re-renders; flag resets on open=false
so a second open in the same session fires again.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Paywall funnel runbook

**Files:**
- Create: `docs/posthog-dashboards/paywall-funnel.md`

### Step 2.1: Write the runbook

- [ ] Create the directory if it doesn't exist:

```bash
mkdir -p docs/posthog-dashboards
```

- [ ] Create `docs/posthog-dashboards/paywall-funnel.md` with the following content:

````markdown
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
````

### Step 2.2: Commit

- [ ] Stage and commit:
```bash
git add docs/posthog-dashboards/paywall-funnel.md
git commit -m "$(cat <<'EOF'
docs(posthog): paywall per-trigger funnel runbook

Documents 6 funnel insights (5 production triggers + generic fallback)
plus HogQL queries so the dashboard is rebuildable. Pairs with the
Wave 1 spec L3-A.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Founder first-purchase smoke test runbook

**Files:**
- Create: `docs/runbooks/founder-first-purchase-smoke.md`

### Step 3.1: Write the runbook

- [ ] Create the directory if missing:

```bash
mkdir -p docs/runbooks
```

- [ ] Create `docs/runbooks/founder-first-purchase-smoke.md` with the following content:

````markdown
# Founder first-purchase smoke test

**Owner:** founder
**Duration:** ~1 hour
**Why:** `chart_readings = 0` at Wave 1 start (2026-05-17). Differentiate (a) no one wants to pay, (b) Stripe checkout broken, (c) post-purchase Pro flag not set, (d) AI Reading paywalled incorrectly. Without an end-to-end live test, Wave 2 paywall improvements are designed in the dark.

## Pre-flight

- [ ] Run the funnel baseline audit:
```bash
node scripts/advertising/_audit_funnel_baseline.mjs
```
Expected output includes a "Stripe prices validity" section showing `monthly` and `annual` both `active=true`, currency `usd`.

- [ ] Confirm Stripe is in **test mode** in the dashboard (top-right toggle). All steps below use a test card.

## Steps

1. **Open** `https://estrevia.com/en/pricing` in a fresh incognito window.

2. **Sign up** with a throwaway test email — suggested: `test+wave1-<YYYYMMDD>@estrevia.dev`. Complete Clerk sign-up flow.

3. **Click monthly upgrade.** Expected: redirect to Stripe Checkout within ~3 seconds. If a Clerk auth wall appears first, that is fine — sign in and continue.

4. **Fill Stripe Checkout** with test card:
   - Card number: `4242 4242 4242 4242`
   - Expiry: `12/30` (any future date)
   - CVC: `123`
   - ZIP: `10001` (any US ZIP for test mode)
   - Name on card: anything

5. **Submit payment.** Expected: success redirect to the Estrevia success page within ~5 seconds.

6. **Verify Welcome email** in Resend dashboard (https://resend.com/emails) arrives within 1 minute. Subject: `Welcome to Estrevia Pro` (or whatever the current `WelcomeEmail.tsx` produces).

7. **Verify DB state.** From a separate terminal:
```bash
node -e "
import('@neondatabase/serverless').then(async ({neon}) => {
  const sql = neon(process.env.DATABASE_URL);
  const rows = await sql\`SELECT email, subscription_tier, subscription_status FROM users WHERE email = 'test+wave1-<YYYYMMDD>@estrevia.dev'\`;
  console.log(rows);
});
"
```
Expected: `subscription_tier = 'pro'`, `subscription_status = 'active'`.

8. **Test AI Reading entitlement.** In the same incognito session:
   - Open `/en/chart`.
   - Submit a birth-data form (any synthetic birth data — do NOT use real PII).
   - On the chart page, locate the "Generate AI reading" CTA in `ChartReadingSection`.
   - Click it.
   - Expected: full reading content appears, **no paywall modal**.

## Cleanup

- [ ] In Stripe dashboard → Subscriptions → find the test sub → Cancel immediately (test mode is free; no charges, but keep the dashboard tidy).
- [ ] In Neon DB, optionally soft-delete the test user:
```sql
UPDATE users SET deleted_at = NOW() WHERE email = 'test+wave1-<YYYYMMDD>@estrevia.dev';
```

## Outcome

Record one of the following inline below this section:

- [ ] **PASS** — all 8 steps succeeded. AI Reading appeared without paywall. Sub active in DB. Welcome email received.
- [ ] **FAIL at step N** — describe what happened. Capture screenshots / curl outputs / DB query results.
- [ ] **PARTIAL** — describe which steps passed, which failed.

### Outcome (fill in)

_Date:_ ___
_Result:_ ___
_Notes:_

---

If FAIL: open a Sentry issue with the smoke-test outcome attached and pause Wave 1 progression. The fix becomes a Wave 1 hotfix and writing-plans gets re-invoked.

If PASS: proceed to the rest of Wave 1 with confidence that the paid path is wired correctly end-to-end.
````

### Step 3.2: Commit

- [ ] Stage and commit:
```bash
git add docs/runbooks/founder-first-purchase-smoke.md
git commit -m "$(cat <<'EOF'
docs(runbooks): founder first-purchase smoke test

Step-by-step manual smoke test of the Stripe → Pro upgrade → AI
Reading entitlement path. Run before Wave 2 paywall work to
differentiate technical block vs UX block on the chart_readings=0
problem. Pairs with Wave 1 spec L3-D.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Full-funnel PostHog runbook

**Files:**
- Create: `docs/posthog-dashboards/full-funnel.md`

### Step 4.1: Write the runbook

- [ ] Create `docs/posthog-dashboards/full-funnel.md` with the following content:

````markdown
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
````

### Step 4.2: Commit

- [ ] Stage and commit:
```bash
git add docs/posthog-dashboards/full-funnel.md
git commit -m "$(cat <<'EOF'
docs(posthog): full-funnel north-star dashboard runbook

4-panel dashboard runbook: weekly Pro trend, 8-step funnel, cohort
retention, per-channel utm_source breakdown. Pairs with Wave 1 spec
L4-A. Depends on Task 1 (EMAIL_GATE_VIEWED event) being deployed for
panel 2 step 3 to have data.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Founder manual checkpoint (asynchronous)

**Owner:** founder. **Engineer hands off after T1-T4 are merged and T1 is deployed to production.**

**Files:**
- Create: `outputs/wave-1-checkpoint/00-baseline.md`

### Step 5.1: Deploy `EMAIL_GATE_VIEWED` event to production

- [ ] After Tasks 1-4 are committed, push to `main`:
```bash
git push origin main
```
- [ ] Confirm Vercel deploy succeeds (https://vercel.com/dashboard).
- [ ] Wait ~1 hour for at least one production `email_gate_viewed` event to land in PostHog Live Events.

### Step 5.2: Build the paywall funnel dashboard in PostHog

- [ ] Open PostHog → New Dashboard → name `Estrevia / Paywall funnels`.
- [ ] Follow `docs/posthog-dashboards/paywall-funnel.md` to create the 6 funnel insights.
- [ ] Verify each insight loads without errors and step 1 has non-zero traffic.

### Step 5.3: Build the full-funnel dashboard in PostHog

- [ ] Open PostHog → New Dashboard → name `Estrevia / North Star`.
- [ ] Follow `docs/posthog-dashboards/full-funnel.md` to create the 4 panels.
- [ ] Verify Panel 2 step 3 (`email_gate_viewed`) shows non-zero entries — confirms the deploy worked.

### Step 5.4: Run the first-purchase smoke test

- [ ] Open `docs/runbooks/founder-first-purchase-smoke.md`.
- [ ] Follow all 8 steps + cleanup.
- [ ] Record outcome in the runbook's "Outcome (fill in)" section.
- [ ] If FAIL: pause Wave 1, open Sentry issue, re-invoke writing-plans for the hotfix.

### Step 5.5: Record baseline numbers

- [ ] Create `outputs/wave-1-checkpoint/00-baseline.md`:

```bash
mkdir -p outputs/wave-1-checkpoint
```

- [ ] Write a baseline document with the following structure (fill values from the dashboards):

````markdown
# Wave 1 baseline checkpoint

**Date recorded:** _YYYY-MM-DD_
**Recorded by:** Kirill
**Pairs with:** `docs/superpowers/specs/2026-05-17-wave-1-instrumentation-design.md`

## Email gate conversion (last 30 days)

| Step | Count | Conversion from previous |
|---|---|---|
| `chart_calculated` | __ | — |
| `email_gate_viewed` | __ | __% |
| `email_lead_submitted` | __ | __% |

## Per-paywall conversion (last 30 days, step 1 → step 4)

| Trigger | `paywall_opened` | `paywall_trial_clicked` | `checkout_stripe_redirected` | `subscription_started` |
|---|---|---|---|---|
| `celtic-cross` | __ | __ | __ | __ |
| `three-card` | __ | __ | __ | __ |
| `synastry-ai` | __ | __ | __ | __ |
| `natal-chart` | __ | __ | __ | __ |
| `essay` | __ | __ | __ | __ |
| `generic` | __ | __ | __ | __ |

## North-star (last 12 weeks)

| Week (start) | New `subscription_started` |
|---|---|
| W-1 | __ |
| W-2 | __ |
| W-3 | __ |
| ... | ... |

## Top 5 acquisition sources (last 30 days)

| `utm_source` | Leads | Subs |
|---|---|---|
| __ | __ | __ |
| __ | __ | __ |

## Smoke test outcome

- Pass / Fail-at-step / Partial: _____
- Notes: _____

## Wave 2 prioritization signal (founder reads this section before Wave 2 brainstorm)

- The largest drop in the email gate is between steps _____ and _____. _____% loss.
- The weakest paywall flow is _____ at step _____. _____% conversion.
- The strongest acquisition source by Pro conversion is _____.
- Top blockers requiring Wave 2 attention (rank-ordered):
  1. _____
  2. _____
  3. _____
````

### Step 5.6: Commit the baseline and close Wave 1

- [ ] Stage and commit:
```bash
git add outputs/wave-1-checkpoint/00-baseline.md
git commit -m "$(cat <<'EOF'
docs(wave-1-checkpoint): baseline funnel + paywall + smoke-test outcome

Founder-recorded checkpoint after T1-T4 deploy. Closes Wave 1 of the
2026-05-17 advertising improvements roadmap. Wave 2 prioritization
proceeds from these numbers.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

git push origin main
```

- [ ] Update the parent roadmap spec status footer in
`docs/superpowers/specs/2026-05-17-advertising-improvements-design.md`:
add a line **"Wave 1 closed YYYY-MM-DD — see `outputs/wave-1-checkpoint/00-baseline.md`."** and commit.

---

## Acceptance criteria for the whole plan

All of the following must be true before Wave 1 is considered complete:

- [ ] `EMAIL_GATE_VIEWED` event present in `AnalyticsEvent` enum and fires once per modal open in production (confirm via PostHog Live Events).
- [ ] All Vitest tests pass (`npm test`), including the 3 new ones.
- [ ] `npm run typecheck` clean.
- [ ] No new ESLint errors in modified files.
- [ ] `docs/posthog-dashboards/paywall-funnel.md` exists and committed.
- [ ] `docs/runbooks/founder-first-purchase-smoke.md` exists and committed.
- [ ] `docs/posthog-dashboards/full-funnel.md` exists and committed.
- [ ] PostHog `Estrevia / Paywall funnels` dashboard exists with 6 funnels.
- [ ] PostHog `Estrevia / North Star` dashboard exists with 4 panels.
- [ ] Founder smoke test outcome recorded (PASS / FAIL-at-step-N / PARTIAL).
- [ ] `outputs/wave-1-checkpoint/00-baseline.md` exists with baseline numbers filled in.
- [ ] Parent roadmap spec footer updated with Wave 1 close date.

---

## Success metric (from the spec)

After T1-T5 are complete, Kirill can answer these in under 1 minute each:

1. What % of `chart_calculated` events convert to `email_lead_submitted`?
2. Which of the 6 paywall flows has the worst drop-off, and at which step?
3. Did the first-purchase smoke test pass? If not, where?
4. What's the weekly trend of Pro subscriptions?
5. Which `utm_source` drives the most leads vs. the most Pro upgrades?

If any of those takes longer than a glance, T2 / T3 / T4 runbooks need revision.
