# Email Funnel Data Integrity & Attribution — Design Spec

**Date:** 2026-05-20
**Author:** Claude (Opus 4.7) with founder direction
**Source audit:** `outputs/email-audit-2026-05-20/REPORT.md`
**Status:** Approved for implementation
**Scope:** One consolidated spec covering 4 problems (P0×3 + P1×1) in the lead-nurture and Stripe-attribution chains.

---

## 1. Problem statement

The 2026-05-20 email-drip audit (`outputs/email-audit-2026-05-20/REPORT.md`) surfaced 4 distinct integrity issues. All 4 are about **trust in our own data layer** — the drip mechanism itself works, but the observability and attribution around it are broken.

| # | Problem | Severity | Discovered |
|---|---|---|---|
| 1 | Drip → Stripe attribution chain delivers zero `utm_source=lead-nurture` markers. | P0 | Audit §3.1 |
| 2 | One Stripe-paid user (`destinig7996`) is stuck at `subscription_tier='free'` in our DB despite an active `trialing` subscription. | P0 | Audit §3.2 |
| 3 | `lead_curiosity_hook` has 0 rows in `sent_lead_emails` even though 7 freshly-created leads sit on `step=2` (which post-renumber means "got chart + curiosity_hook"). | P0 | Audit §3.3 / §3.9 |
| 5 | 168 pre-deploy leads were renumbered by migration 0013 and intentionally skipped T+1h `lead_curiosity_hook`. They represent ~88% of the current funnel. | P1 | Audit §3.3 / §3.5 |

(Problems #4 — Resend opens/clicks tracking — and #6-9 are out of scope here; tracked separately.)

## 2. Root-cause investigation results

This section records what was discovered during brainstorming exploration, not just the audit symptoms.

### 2.1 Problem #1 — UTM read path

The Stripe Checkout endpoint (`src/app/api/v1/stripe/checkout/route.ts:240`) writes its incoming UTM payload into `session.metadata` correctly. The **frontend** is where the chain breaks:

- `src/shared/components/PaywallModal.tsx:116` — `const utmFields = readUtmCookie();`
- `src/shared/components/EmailGateModal.tsx:134` — same
- `src/app/[locale]/checkout/start/CheckoutStartClient.tsx` — same
- `src/app/[locale]/(marketing)/pricing/PricingUpgradeButton.tsx` — same

`readUtmCookie()` returns ONLY cookie-stored UTM. The cookie is written by `UtmCapture.tsx:21` with first-touch semantics (`if (readUtmCookie() !== null) return;` — never overwrites). When a lead clicks a drip-email CTA with `?utm_source=lead-nurture`, the cookie still holds the original Meta first-touch value. PaywallModal reads cookie. Stripe gets Meta. lead-nurture vanishes.

### 2.2 Problem #2 — Stripe webhook already does upsert

Contrary to initial hypothesis, `src/app/api/webhooks/stripe/route.ts:336-367` already implements a proper pending-row + upsert pattern. It creates a placeholder user row with `subscription_tier='premium'` if Clerk has not yet inserted the user; on conflict, it updates subscription fields without overwriting email.

So `destinig7996`'s `tier='free'` is NOT explained by a missing pattern. It's an actual webhook failure or skip, root cause unknown. Possible causes:
- Stripe event for this customer was never delivered (network drop, dashboard misconfig).
- Handler ran but threw before line 336 (e.g., inside Clerk API materialization, lines 191-207).
- Event was deduped via `processed_stripe_events` after a partial run (rollback failed).

Diagnosis requires querying Stripe events API for `cus_UXLi3mJUjr` and cross-referencing with `processed_stripe_events`.

### 2.3 Problem #3 — Vercel deploy is up-to-date

The Vercel MCP confirms live production deployment = `dpl_taEJxjx6ocvVWtaGYM3HkWTTFuyk`, commit `f12b7b6d...` (= today's `audit-quick-wins/C1`), state READY. The earlier deployment `dpl_8nqCq377iCdqCMsgfXZJwNv2VYaP` shipped commit `cae2123` (curiosity-drip schema fix) ~17 hours ago. The new STEP_HANDLERS code is live. So the hypothesis "new code not deployed" is **wrong**.

Migration `0013_curiosity_hook_renumber.sql` is also applied — verified by `pg_indexes` query showing partial index predicate `nurture_step < 4` (the new bound).

**Concrete second-order bug found during exploration:** `src/app/api/v1/leads/route.ts:201` sets `nurtureNextAt = NOW + 24*60*60*1000` in the `waitUntil` block, but the cron's `STEP_HANDLERS[0].nextDelayMs = 1*HOUR`. Fresh leads sit on step=1 for 24h instead of 1h. This is **bug #3-A**.

The remaining mystery — why `lead_curiosity_hook` writes zero rows despite the cron supposedly firing for 17+ hours — is **bug #3-B**, root cause unknown. Diagnostic instrumentation is required.

### 2.4 Problem #5 — intentional skip

Migration 0013 explicitly skipped T+1h curiosity_hook for 168 pre-deploy leads ("Existing pre-deploy leads skip T+1h intentionally — no back-fill"). Their `nurture_step` was renumbered to 2 or 3 without sending the new email. Backfill is feasible but must follow safety gates.

## 3. Design

### 3.1 Architecture overview

All 4 fixes are local to existing files plus a small number of new files. No new services, no schema additions beyond watchdog auxiliary data.

**Two-phase rollout:**

- **Phase 1 (today, hard deadline ~20:00 UTC before first T+72h paywall fires):**
  - Fix #1 attribution (UTM last-touch override).
  - Fix #3-A (waitUntil delay 24h → 1h).
  - Add #3 diagnostic instrumentation.
  - Deploy → observe one cron tick → identify #3-B root cause → ship targeted fix.

- **Phase 2 (Days +1 to +5):**
  - #2 Stripe sync discovery + retroactive fix + watchdog cron.
  - #5 backfill in 3 waves (10 → 50 → 108) with 24h observation gates between each.

Phase 2 depends on Phase 1 success. Phase 2's wave 1 specifically depends on #3-B being demonstrably fixed (new leads must write `lead_curiosity_hook` rows in DB).

### 3.2 #1 — UTM last-touch override

**New helper** in `src/shared/lib/utm-cookie.ts`:

```ts
export function readUtmLastTouch(): UtmFields {
  const cookie = readUtmCookie() ?? {};
  if (typeof window === 'undefined') return cookie;
  const urlUtm = parseUtmFromSearch(window.location.search);
  return { ...cookie, ...urlUtm }; // URL params override cookie keys
}
```

Semantics: if URL has `?utm_*`, those values win over cookie. If URL is clean, cookie value preserved (first-touch). The merge is shallow — each UTM key is overridden independently, so partial URL UTM (e.g. only `utm_source` and `utm_campaign`) leaves `utm_content` from cookie intact.

**Call-site changes** (4 files, identical pattern: replace `readUtmCookie()` call site with `readUtmLastTouch()`):

- `src/shared/components/PaywallModal.tsx:116`
- `src/shared/components/EmailGateModal.tsx:134`
- `src/app/[locale]/checkout/start/CheckoutStartClient.tsx:54`
- `src/app/[locale]/(marketing)/pricing/PricingUpgradeButton.tsx:31`

**Existing tests to update** (each mocks `readUtmCookie` — must additionally cover the URL-override branch via `parseUtmFromSearch`):

- `src/shared/components/__tests__/PaywallModal.utm.test.tsx`
- `src/shared/components/__tests__/PaywallModal.trigger.test.tsx`
- `src/app/[locale]/checkout/start/__tests__/CheckoutStartClient.utm.test.tsx`
- `src/app/[locale]/(marketing)/pricing/__tests__/PricingUpgradeButton.utm.test.tsx`

**Tests** (new file `src/shared/lib/__tests__/utm-cookie.test.ts`, append cases):

1. URL without UTM + cookie `{utm_source: 'meta'}` → returns `{utm_source: 'meta'}`.
2. URL with `?utm_source=lead-nurture` + cookie `{utm_source: 'meta'}` → returns `{utm_source: 'lead-nurture'}`.
3. URL with `?utm_source=lead-nurture` + cookie with `{utm_source: 'meta', utm_campaign: 'X'}` → returns `{utm_source: 'lead-nurture', utm_campaign: 'X'}` (partial override).
4. SSR (no window) → returns cookie value verbatim.

**Risks:** Regression risk is very low. Behavior change is gated on `?utm_*` presence; in all other cases identical to current.

### 3.3 #2 — Stripe sync watchdog

Three deliverables:

#### 3.3.1 Discovery script (one-off)

`scripts/advertising/_audit_stripe_events_2026_05_20.mjs`:
- `stripe.events.list({customer: 'cus_UXLi3mJUjr'})` to retrieve all events.
- JOIN with `processed_stripe_events` to see which were processed.
- Output: timeline + processed status per event, surfacing the failure point.

#### 3.3.2 Retroactive fix script (one-off)

`scripts/advertising/_fix_stripe_user_sync_destinig7996.mjs`:
- Load current Stripe subscription state for `cus_UXLi3mJUjr`.
- Run the same upsert pattern as `webhooks/stripe/route.ts:336-367` against `users` table.
- Add Sentry breadcrumb tagged `manual-stripe-sync-fix` for audit.
- Allowlist-gated: rejects unless caller email is in `ADMIN_ALLOWED_EMAILS`.

#### 3.3.3 Watchdog cron (preventive)

New endpoint `src/app/api/cron/stripe-user-sync/route.ts`:

- Hourly initially (first 2 weeks), then 6-hourly.
- Query Stripe customers created in last 7 days, expand `subscriptions`.
- JOIN with `users.stripe_customer_id`.
- Three mismatch types:
  - **missing-user**: Stripe customer with no matching `users` row.
  - **tier-mismatch**: `users.subscription_tier !== derivePlan(subscription)`.
  - **status-mismatch**: `users.subscription_status !== subscription.status`.
- Per-mismatch fix: run the same idempotent upsert as webhook.
- Sentry alert if `fixed > 0` (indicates webhook drift).
- Returns 200 with `{checked, fixed, failed}` summary.
- CRON_SECRET-protected.

**Sentry breadcrumbs in webhook handler** (`src/app/api/webhooks/stripe/route.ts`):
- Add breadcrumb at handler entry with `eventType` and `eventId`.
- Add breadcrumb after Clerk user materialization (line ~207).
- Add breadcrumb after users upsert (line ~367).
- This gives traceable lifecycle for any future investigation; no new code paths.

**Files:**

```
NEW: src/app/api/cron/stripe-user-sync/route.ts
NEW: src/app/api/cron/stripe-user-sync/__tests__/route.test.ts
NEW: scripts/advertising/_audit_stripe_events_2026_05_20.mjs
NEW: scripts/advertising/_fix_stripe_user_sync_destinig7996.mjs
MOD: src/app/api/webhooks/stripe/route.ts          (Sentry breadcrumbs only)
MOD: vercel.json                                    (add stripe-user-sync cron entry)
```

**`vercel.json` cron entry:**

```json
{
  "path": "/api/cron/stripe-user-sync",
  "schedule": "0 * * * *"
}
```

**Tests** (`src/app/api/cron/stripe-user-sync/__tests__/route.test.ts`):
- missing-user → fix runs, returns count 1.
- tier-mismatch (free → premium) → fix runs.
- status-mismatch (active → canceled) → fix runs.
- all-aligned → no fixes, returns 0.
- Stripe API rate-limit → caught per-customer, summary continues.

**Risks:**
- False-positive fixes: a cancelled subscription in Stripe + already-cancelled in DB — must NOT re-mark "active". Diff logic must be precise.
- Race with real webhook: both upserts are idempotent; benign duplication.

### 3.4 #3 — Diagnostic-first + waitUntil fix

#### 3.4.1 Bug #3-A: waitUntil delay

**Change** in `src/app/api/cron/lead-nurture/route.ts` — export the constant for cross-module use:

```ts
export const STEP_0_TO_1_DELAY_MS = 1 * 60 * 60 * 1000;
// reference it in the STEP_HANDLERS array entry as well
```

**Change** in `src/app/api/v1/leads/route.ts` line 201:

```diff
- nurtureNextAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
+ nurtureNextAt: new Date(Date.now() + STEP_0_TO_1_DELAY_MS),
```

Import added at top of file.

**Optional retroactive next_at update** for 23 stuck step=1 leads — gated on #3-B confirmed working:

```sql
UPDATE email_leads SET nurture_next_at = NOW()
WHERE nurture_step = 1
  AND converted_to_user_id IS NULL
  AND unsubscribed_at IS NULL
  AND email_undeliverable = false;
```

Run this as a one-off SQL via `scripts/advertising/_unstick_step1_leads.mjs` AFTER bug #3-B fixed.

#### 3.4.2 Bug #3-B: diagnostic instrumentation

Goal: within 1-2 cron ticks of deploy, identify where `lead_curiosity_hook` rows are lost.

**Logging points** (4 files):

`src/app/api/cron/lead-nurture/route.ts` — three log lines per processed lead:

```ts
console.info('[cron/lead-nurture] dispatch', {
  leadId: lead.id,
  step: lead.nurtureStep,
  handlerFromStep: handler?.fromStep ?? null,
});
// after handler.send:
console.info('[cron/lead-nurture] sendResult', {
  leadId: lead.id,
  sent: sendResult.sent,
  reason: sendResult.reason ?? null,
});
// after step update:
console.info('[cron/lead-nurture] stepAdvanced', {
  leadId: lead.id,
  fromStep: lead.nurtureStep,
  toStep: handler.toStep,
  nextAtIso: nextAt?.toISOString() ?? null,
});
```

`src/shared/lib/sent-lead-emails.ts` — `tryInsertOneShotLead` end of function:

```ts
console.info('[sent-lead-emails] claim', {
  leadId,
  emailType,
  result, // 'new' | 'retry' | 'delivered'
  insertedRowCount: inserted.length,
  existingMsgid: existing[0]?.resendMessageId ?? null,
});
```

`src/shared/lib/email.ts` — each of 7 `sendLead*Email` functions gets 2 log lines:

```ts
// at start
console.info(`[email/${emailType}] start`, {
  leadId: params.leadId,
  chartIsNull: !params.chart,
});
// after Resend send (before throwing on error)
console.info(`[email/${emailType}] sent`, {
  leadId: params.leadId,
  resendMessageId: result.data?.id ?? null,
  resendErrorName: result.error?.name ?? null,
});
```

**Rules:**
- **No PII** — only `leadId`, `emailType`, status/count fields. Never log email addresses, chart data, or other identifying info.
- **`console.info`** — populates Vercel runtime logs (free, accessible via MCP `get_runtime_logs`).
- **No Sentry exceptions** for these — would blow the quota. Sentry breadcrumbs are fine if needed selectively.

#### 3.4.3 Observation loop

After Phase 1 deploy:
1. Wait for next cron minute-0 tick + 10min buffer = ~70 min after deploy.
2. Fetch logs: `mcp__claude_ai_Vercel__get_runtime_logs` for the deployment, filter `lead-nurture` path.
3. Grep for `[cron/lead-nurture] dispatch` — confirm leads on step=1 are being seen.
4. Grep for `[sent-lead-emails] claim` with `emailType='lead_curiosity_hook'` — see whether INSERT succeeded.
5. Grep for `[email/lead_curiosity_hook] sent` — see whether Resend send succeeded.
6. Identify which step is silently failing.

#### 3.4.4 Root-cause fix template

The exact code change depends on diagnostic findings. Likely scenarios and templates:

| Scenario | Signal | Fix |
|---|---|---|
| Drizzle `onConflictDoNothing().returning()` returns empty for valid INSERT | claim='retry' always, inserted.length=0 | Replace with explicit `INSERT ... ON CONFLICT DO NOTHING RETURNING id` raw SQL, or split into select-then-insert |
| Resend idempotencyKey collision | `resendErrorName` indicates duplicate | Drop the idempotencyKey on lead emails (DB unique index already dedupes) |
| `pickDominantPlanet(null)` throws when chart not loaded | `chartIsNull: true` in start log, no `sent` log follows | Add null-chart fallback in `pickDominantPlanet` |
| Handler dispatch finds wrong handler | `handlerFromStep` doesn't match `step` | Audit STEP_HANDLERS ordering / equality check |

#### 3.4.5 Cleanup

After bug #3-B identified and fixed (likely Day +1), remove the `console.info` lines OR gate them behind `if (process.env.DEBUG_DRIP)`. Single commit `chore(curiosity-drip): remove diagnostic logging`. Watchdog cron stays in place — it's permanent infra.

**Files:**

```
MOD: src/app/api/cron/lead-nurture/route.ts       (export STEP_0_TO_1_DELAY_MS + 3 log lines)
MOD: src/app/api/v1/leads/route.ts                (use STEP_0_TO_1_DELAY_MS)
MOD: src/shared/lib/sent-lead-emails.ts           (1 log line)
MOD: src/shared/lib/email.ts                      (2 log lines × 7 send funcs)
NEW: scripts/advertising/_unstick_step1_leads.mjs (one-off SQL gated on #3-B fix)
```

**Tests:**
- Unit: export `STEP_0_TO_1_DELAY_MS` sanity test (> 0, < 24h).
- Existing waitUntil unit test in `src/app/api/v1/leads/__tests__/route.test.ts` — update expected nextAt math.
- No new tests for logging (pure side-effect, no behavior change).

### 3.5 #5 — Backfill in 3 waves

**Pre-requisites (hard gates):**
1. #3-B root cause fixed AND confirmed via Vercel logs (new leads write `lead_curiosity_hook` rows).
2. Resend tracking enabled (preferred — for engagement measurement; not strict blocker).
3. #1 attribution chain fixed (preferred — so clicks-from-backfill are trackable).

**Wave structure:**

| Wave | Size | Cohort | Timing |
|---|---|---|---|
| Canary | 10 | newest 10 of 168 (created_at DESC) | Day +2 if pre-reqs hold |
| Wave 2 | 50 | next-newest 50 | Day +3 if canary clean |
| Wave 3 | 108 | remainder | Day +4-5 if Wave 2 clean |

**Wave SQL** (used by `scripts/advertising/_backfill_curiosity_hook.mjs` with args `--wave=1|2|3` and `--dry-run`):

```sql
WITH targets AS (
  SELECT id FROM email_leads
  WHERE nurture_step IN (2, 3)
    AND converted_to_user_id IS NULL
    AND unsubscribed_at IS NULL
    AND email_undeliverable = false
    AND NOT EXISTS (
      SELECT 1 FROM sent_lead_emails s
      WHERE s.lead_id = email_leads.id
        AND s.email_type = 'lead_curiosity_hook'
    )
  ORDER BY created_at DESC
  LIMIT :wave_size
)
UPDATE email_leads
SET nurture_step = 1,
    nurture_next_at = NOW()
WHERE id IN (SELECT id FROM targets);
```

Where `:wave_size` is 10 / 50 / 108 from the script arg.

**Subsequent lead behavior** (idempotency-protected):
- Cron tick #1 sends curiosity_hook → step=2, nextAt=NOW+23h.
- For leads originally at step=3 (already received moon_asc): cron tick #2 at +23h tries moon_asc, gets `delivered` claim, advances to step=3 without re-sending.
- Cron tick #3 at +2d sends paywall_teaser.

**Observation gate** (`scripts/advertising/_audit_backfill_health.mjs`, runs after each wave):

```sql
-- Sent count + msgid presence in last 25h for curiosity_hook
SELECT
  COUNT(*) FILTER (WHERE sent_at >= NOW() - INTERVAL '25 hours')::int AS sent_24h,
  COUNT(*) FILTER (WHERE sent_at >= NOW() - INTERVAL '25 hours' AND resend_message_id IS NULL)::int AS silent_fail
FROM sent_lead_emails
WHERE email_type = 'lead_curiosity_hook';

-- Unsubscribe + bounce rates within backfilled cohort
-- (script tracks wave lead IDs in a local file or queries by recent re-routed step=1 leads)
```

**Abort criteria** (any one stops next wave):
- `silent_fail > 0` — #3-B regression.
- Unsubscribe rate in wave > 5%.
- Resend complaint rate > 0.1%.
- Bounce rate > 5%.

**Files:**

```
NEW: scripts/advertising/_backfill_curiosity_hook.mjs   (args-driven, --wave=N --dry-run)
NEW: scripts/advertising/_audit_backfill_health.mjs
```

**Tests:**
- Manual: `--dry-run` SELECT shows expected target set before any UPDATE.
- Integration (one-time, against local DB seed): run twice, second run shows 0 affected (idempotency).
- Production canary = first wave size = 10 (not 50) for extra confidence.

**Risks:**
- Lead perceives backfilled email as spam — mitigated by neutral subject ("Your Saturn is doing something rare" — doesn't reference funnel timing).
- Resend rate-limit — 50 × 1.1s = 55s; well under free-tier 10/s = 100/10s.

**Rollback:** can't un-send email. Wave-based design IS the safety mechanism. Stop sending further waves if signals bad.

## 4. Success criteria

### Phase 1 (must hold by 20:00 UTC 2026-05-20)

- Vercel runtime logs show `[cron/lead-nurture] dispatch` for at least one lead on step=1.
- Vercel runtime logs show `[sent-lead-emails] claim` entry with `emailType='lead_curiosity_hook'`.
- `SELECT COUNT(*) FROM sent_lead_emails WHERE email_type='lead_curiosity_hook'` ≥ 1 (was 0).
- New unit test for `readUtmLastTouch()` passes.

### Phase 2 (Days +1 to +5)

- New Stripe checkout sessions created from drip-letter CTAs show `metadata.utm_source = 'lead-nurture'` in Stripe dashboard.
- `destinig7996` has `users.subscription_tier='premium'` after retroactive script.
- Watchdog cron 24h run: `fixed = 0` (i.e. no further drift).
- Backfill wave 1 + 2 + 3 cumulative: 168 curiosity_hook sent, deliverability ≥ 95%, unsubscribes < 5%, silent_fail = 0.

## 5. Rollout sequence

| Step | When | What | Owner |
|---|---|---|---|
| 0 | T+0 | Snapshot baseline (counts, deployment ID) | Claude |
| 1 | T+0 → T+30min | Commit Phase 1: `fix(curiosity-drip/T1): waitUntil + diagnostic logging` + `fix(checkout/T1): UTM last-touch override` | Claude; founder approves push |
| 2 | T+30min → T+35min | Vercel auto-deploy | Vercel |
| 3 | T+45min | Smoke check via MCP: deployment READY at commit SHA | Claude |
| 4 | T+45min → T+1h45min | Observation window 1 (1 cron tick + buffer) | Claude |
| 5 | T+1h45min → T+2h30min | Identify #3-B root cause from logs; write targeted fix | Claude; founder reviews |
| 6 | T+2h30min | Commit + push Phase 2A: `fix(curiosity-drip/T2): <root cause>` | Founder |
| 7 | +1h | Observation window 2: verify `lead_curiosity_hook` rows now in DB | Claude |
| 8 | ~20:00 UTC | Hard deadline: first T+72h paywall_teaser fires | — |
| 9 | Day +1 | #2 Stripe sync discovery + retroactive fix + watchdog cron | Claude |
| 10 | Day +2 | #5 Wave 1 canary (10 leads) | Claude; founder approves |
| 11 | Day +3 | #5 Wave 2 (50 leads) if canary clean | Claude; founder approves |
| 12 | Day +4-5 | #5 Wave 3 (108 leads) if Wave 2 clean | Claude; founder approves |
| 13 | Week +1 | Cleanup: remove diagnostic logging or DEBUG-gate it; reduce watchdog frequency | Claude |

## 6. Cross-cutting risks

| Risk | Severity | Mitigation |
|---|---|---|
| Vercel build fails (typecheck/lint) — deploy stuck on old commit | HIGH | Pre-push `npm run typecheck && npm run lint && npm test` |
| Phase 1 root cause not found in 1 cron tick | MEDIUM | +1h buffer; add more log points if needed; accept slipping past 20:00 if necessary (acceptable trade-off — 155 leads in first paywall cohort still get tracked retroactively via Resend) |
| First T+72h paywall fires before Phase 2 complete | MEDIUM | Acceptable; we lose first signal but retain ongoing |
| Stripe events were never delivered (#2 discovery shows nothing) | HIGH | Watchdog cron mitigates going forward; check Stripe dashboard webhook config |
| Backfill wave 1 shows > 5% unsubscribe | LOW (rollback exists) | Stop further waves; 50 was tolerance limit |

## 7. Files inventory

```
NEW:
  src/app/api/cron/stripe-user-sync/route.ts
  src/app/api/cron/stripe-user-sync/__tests__/route.test.ts
  scripts/advertising/_audit_stripe_events_2026_05_20.mjs
  scripts/advertising/_fix_stripe_user_sync_destinig7996.mjs
  scripts/advertising/_unstick_step1_leads.mjs
  scripts/advertising/_backfill_curiosity_hook.mjs
  scripts/advertising/_audit_backfill_health.mjs
  src/shared/lib/__tests__/utm-cookie.test.ts            (if not already)

MODIFIED:
  src/shared/lib/utm-cookie.ts                            (#1 readUtmLastTouch)
  src/shared/components/PaywallModal.tsx                  (#1)
  src/shared/components/EmailGateModal.tsx                (#1)
  src/app/[locale]/checkout/start/CheckoutStartClient.tsx (#1)
  src/app/[locale]/(marketing)/pricing/PricingUpgradeButton.tsx (#1)
  src/app/api/v1/leads/route.ts                           (#3-A)
  src/app/api/cron/lead-nurture/route.ts                  (#3 export + logs)
  src/shared/lib/sent-lead-emails.ts                      (#3 log)
  src/shared/lib/email.ts                                 (#3 logs in 7 funcs)
  src/app/api/webhooks/stripe/route.ts                    (#2 Sentry breadcrumbs)
  vercel.json                                              (#2 cron entry)
```

## 8. Out of scope

- Resend opens/clicks tracking (P1 from audit) — separate spec.
- 3% bounce-rate mitigation via email-format validation — separate spec.
- `lead_paywall_teaser` plan=pro_annual hardcode — separate spec.
- Re-evaluating drip step timings or copy — separate spec.
- Programmatic SEO / Wave 3 / other audit follow-ups — separate spec.

## 9. References

- Audit: `outputs/email-audit-2026-05-20/REPORT.md`
- Prior specs: `docs/superpowers/specs/2026-05-19-curiosity-drip-rebuild-design.md`, `docs/superpowers/specs/2026-05-18-attribution-health-pack-design.md`
- Memory: `project_email_audit_2026_05_20.md`
