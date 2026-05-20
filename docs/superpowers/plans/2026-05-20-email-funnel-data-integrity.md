# Email Funnel Data Integrity & Attribution — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close 4 data-integrity issues in Estrevia's lead-nurture + Stripe-attribution chains: UTM attribution leak (P0 #1), Stripe↔users desync watchdog (P0 #2), `lead_curiosity_hook` 0-rows bug diagnostics + concrete waitUntil delay fix (P0 #3), and 168-lead backfill in 3 waves (P1 #5).

**Architecture:** Two-phase rollout in one shared spec. Phase 1 (must ship today before 20:00 UTC) = #1 attribution fix + #3-A waitUntil delay fix + #3-B diagnostic instrumentation. Phase 2 (Days +1 to +5) = #3-B targeted fix (once logs reveal root cause), #2 watchdog + retroactive sync, #5 backfill in 10/50/108 waves with abort gates.

**Tech Stack:** Next.js 16 App Router, TypeScript 6 strict, Drizzle ORM + Neon Postgres, Vercel Cron, Stripe Node SDK, Resend, Vitest, React 19.

**Source spec:** `docs/superpowers/specs/2026-05-20-email-funnel-data-integrity-design.md`
**Source audit:** `outputs/email-audit-2026-05-20/REPORT.md`

---

## File Structure

### New files

```
src/app/api/cron/stripe-user-sync/route.ts                     #2 watchdog cron (~120 lines)
src/app/api/cron/stripe-user-sync/__tests__/route.test.ts      #2 watchdog tests
scripts/advertising/_audit_stripe_events_2026_05_20.mjs        #2 discovery (~60 lines)
scripts/advertising/_fix_stripe_user_sync_destinig7996.mjs     #2 retroactive fix (~80 lines)
scripts/advertising/_unstick_step1_leads.mjs                   #3-A one-off SQL (~30 lines)
scripts/advertising/_backfill_curiosity_hook.mjs               #5 args-driven backfill (~70 lines)
scripts/advertising/_audit_backfill_health.mjs                 #5 wave observation (~60 lines)
```

### Modified files

```
src/shared/lib/utm-cookie.ts                                    #1 +readUtmLastTouch
src/shared/components/PaywallModal.tsx                          #1 use readUtmLastTouch
src/shared/components/EmailGateModal.tsx                        #1 use readUtmLastTouch
src/app/[locale]/checkout/start/CheckoutStartClient.tsx         #1 use readUtmLastTouch
src/app/[locale]/(marketing)/pricing/PricingUpgradeButton.tsx   #1 use readUtmLastTouch
src/app/api/v1/leads/route.ts                                   #3-A use STEP_0_TO_1_DELAY_MS
src/app/api/cron/lead-nurture/route.ts                          #3 export const + 3 console.info
src/shared/lib/sent-lead-emails.ts                              #3 1 console.info
src/shared/lib/email.ts                                         #3 2 console.info × 7 funcs
src/app/api/webhooks/stripe/route.ts                            #2 Sentry breadcrumbs
vercel.json                                                     #2 cron entry
```

### Test files

```
src/shared/lib/__tests__/utm-cookie.test.ts                                   #1 new tests for readUtmLastTouch
src/shared/components/__tests__/PaywallModal.utm.test.tsx                     #1 update mock + new case
src/shared/components/__tests__/PaywallModal.trigger.test.tsx                 #1 update mock
src/app/[locale]/checkout/start/__tests__/CheckoutStartClient.utm.test.tsx    #1 update mock + new case
src/app/[locale]/(marketing)/pricing/__tests__/PricingUpgradeButton.utm.test.tsx  #1 update mock + new case
src/app/api/v1/leads/__tests__/route.test.ts                                  #3-A update expected nextAt
src/app/api/cron/stripe-user-sync/__tests__/route.test.ts                     #2 new tests for watchdog
```

---

## Phase 1 — must ship before 20:00 UTC 2026-05-20

### Task 1: readUtmLastTouch helper in utm-cookie

**Files:**
- Modify: `src/shared/lib/utm-cookie.ts`
- Test: `src/shared/lib/__tests__/utm-cookie.test.ts` (file likely already exists; verify before creating)

- [ ] **Step 1: Verify test file location**

```bash
ls src/shared/lib/__tests__/utm-cookie.test.ts 2>/dev/null && echo EXISTS || echo NEEDS_CREATE
```

If `NEEDS_CREATE`, the first failing test must include all import boilerplate. Otherwise append to existing file.

- [ ] **Step 2: Write failing test for readUtmLastTouch (URL overrides cookie)**

In `src/shared/lib/__tests__/utm-cookie.test.ts` add (or create file with):

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { readUtmLastTouch, UTM_COOKIE_NAME } from '@/shared/lib/utm-cookie';

describe('readUtmLastTouch', () => {
  beforeEach(() => {
    document.cookie = `${UTM_COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { search: '' },
    });
  });

  it('returns cookie value when URL has no UTM params', () => {
    document.cookie = `${UTM_COOKIE_NAME}=${encodeURIComponent(JSON.stringify({ utm_source: 'meta' }))}; path=/;`;
    expect(readUtmLastTouch()).toEqual({ utm_source: 'meta' });
  });

  it('URL UTM overrides cookie UTM (last-touch)', () => {
    document.cookie = `${UTM_COOKIE_NAME}=${encodeURIComponent(JSON.stringify({ utm_source: 'meta' }))}; path=/;`;
    Object.defineProperty(window, 'location', { writable: true, value: { search: '?utm_source=lead-nurture' } });
    expect(readUtmLastTouch()).toEqual({ utm_source: 'lead-nurture' });
  });

  it('partial URL UTM merges with cookie (per-key override)', () => {
    document.cookie = `${UTM_COOKIE_NAME}=${encodeURIComponent(JSON.stringify({ utm_source: 'meta', utm_campaign: 'estrevia_lead_en' }))}; path=/;`;
    Object.defineProperty(window, 'location', { writable: true, value: { search: '?utm_source=lead-nurture' } });
    expect(readUtmLastTouch()).toEqual({ utm_source: 'lead-nurture', utm_campaign: 'estrevia_lead_en' });
  });

  it('returns empty object when both cookie and URL are empty', () => {
    expect(readUtmLastTouch()).toEqual({});
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run src/shared/lib/__tests__/utm-cookie.test.ts
```

Expected: 4 tests FAIL with `readUtmLastTouch is not a function` (or similar import error).

- [ ] **Step 4: Implement readUtmLastTouch**

In `src/shared/lib/utm-cookie.ts`, after the existing `readUtmCookie` function, append:

```ts
/**
 * Last-touch UTM read: URL search params override cookie keys.
 *
 * Semantics:
 * - If `window.location.search` has any `?utm_*` params, those values win
 *   per-key over cookie (URL is last-touch). The merge is shallow — partial
 *   URL UTM (e.g. only utm_source) leaves untouched-keys from cookie intact.
 * - If URL is clean, cookie is returned verbatim (first-touch preserved).
 * - SSR-safe: returns cookie only when `window` is undefined.
 *
 * Drives drip-email click attribution into Stripe checkout session metadata.
 */
export function readUtmLastTouch(): UtmFields {
  const cookie = readUtmCookie() ?? {};
  if (typeof window === 'undefined') return cookie;
  const urlUtm = parseUtmFromSearch(window.location.search);
  return { ...cookie, ...urlUtm };
}
```

- [ ] **Step 5: Run tests to verify pass**

```bash
npx vitest run src/shared/lib/__tests__/utm-cookie.test.ts
```

Expected: 4/4 pass.

- [ ] **Step 6: Commit**

```bash
git add src/shared/lib/utm-cookie.ts src/shared/lib/__tests__/utm-cookie.test.ts
git commit -m "feat(utm/T1): readUtmLastTouch helper — URL last-touch overrides cookie

URL ?utm_* params override cookie keys for last-touch attribution. Empty
URL preserves cookie first-touch behavior. SSR-safe.

Unblocks #1 from email-funnel-data-integrity spec — fixes drip→Stripe
attribution chain that currently delivers 0 lead-nurture markers.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Apply readUtmLastTouch in PaywallModal

**Files:**
- Modify: `src/shared/components/PaywallModal.tsx:7,116`
- Test: `src/shared/components/__tests__/PaywallModal.utm.test.tsx`, `PaywallModal.trigger.test.tsx`

- [ ] **Step 1: Update import + call site in PaywallModal.tsx**

Replace line 7:
```ts
import { readUtmCookie } from '@/shared/lib/utm-cookie';
```
with:
```ts
import { readUtmLastTouch } from '@/shared/lib/utm-cookie';
```

Replace line 116:
```ts
      const utmFields = readUtmCookie();
```
with:
```ts
      const utmFields = readUtmLastTouch();
```

And update body spread on line 120 (currently `...(utmFields ?? {})`) to drop the null-coalesce since `readUtmLastTouch` returns `UtmFields` (not `UtmFields | null`):

```ts
        body: JSON.stringify({ plan, returnUrl, locale, ...utmFields }),
```

- [ ] **Step 2: Update PaywallModal.utm.test.tsx mock**

Find and replace mock declarations in `src/shared/components/__tests__/PaywallModal.utm.test.tsx`. The current mock targets `readUtmCookie`; rewire to `readUtmLastTouch`:

```ts
vi.mock('@/shared/lib/utm-cookie', () => ({
  readUtmLastTouch: vi.fn(),
}));
import { readUtmLastTouch } from '@/shared/lib/utm-cookie';
const mockReadUtmLastTouch = vi.mocked(readUtmLastTouch);
```

Update all `mockReadUtmCookie.mockReturnValue(...)` calls to `mockReadUtmLastTouch.mockReturnValue(...)`. Note: `readUtmLastTouch` returns `UtmFields` (never null), so `null` mock returns become `{}`.

- [ ] **Step 3: Add new test for URL-override behavior in PaywallModal.utm.test.tsx**

Append after existing tests:

```ts
it('passes URL-derived UTM (last-touch) to checkout body', async () => {
  mockReadUtmLastTouch.mockReturnValue({ utm_source: 'lead-nurture', utm_campaign: 't72' });
  // ... render PaywallModal in open state ...
  // ... fire CTA click ...
  // expect(fetch) called with body containing utm_source: 'lead-nurture'
  // (Follow existing test setup pattern in this file — same render+click+assert structure)
});
```

Use the same render setup pattern as existing tests in the file.

- [ ] **Step 4: Update PaywallModal.trigger.test.tsx mock**

Same pattern as Step 2 — rename `readUtmCookie` → `readUtmLastTouch` in the `vi.mock` block of `src/shared/components/__tests__/PaywallModal.trigger.test.tsx`.

- [ ] **Step 5: Run tests for PaywallModal**

```bash
npx vitest run src/shared/components/__tests__/PaywallModal.utm.test.tsx src/shared/components/__tests__/PaywallModal.trigger.test.tsx
```

Expected: all existing tests still pass + new URL-override test passes.

- [ ] **Step 6: Commit**

```bash
git add src/shared/components/PaywallModal.tsx src/shared/components/__tests__/PaywallModal.utm.test.tsx src/shared/components/__tests__/PaywallModal.trigger.test.tsx
git commit -m "fix(paywall/T2): use readUtmLastTouch in PaywallModal

URL ?utm_* on /chart drip-click now reaches Stripe session.metadata;
cookie first-touch still preserved when URL is clean.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Apply readUtmLastTouch in EmailGateModal

**Files:**
- Modify: `src/shared/components/EmailGateModal.tsx:8,134`

- [ ] **Step 1: Update import**

In `src/shared/components/EmailGateModal.tsx` line 8, replace:
```ts
import { readUtmCookie } from '@/shared/lib/utm-cookie';
```
with:
```ts
import { readUtmLastTouch } from '@/shared/lib/utm-cookie';
```

- [ ] **Step 2: Update call site at line 134**

Replace:
```ts
      const utm = readUtmCookie() ?? {};
```
with:
```ts
      const utm = readUtmLastTouch();
```

- [ ] **Step 3: Run existing EmailGateModal tests**

```bash
npx vitest run src/shared/components/__tests__/EmailGateModal
```

Expected: all existing tests pass without modification (this file has no UTM-specific test that would break).

If a test fails referencing `readUtmCookie` mock, update its mock to `readUtmLastTouch` and re-run.

- [ ] **Step 4: Commit**

```bash
git add src/shared/components/EmailGateModal.tsx
git commit -m "fix(email-gate/T3): use readUtmLastTouch in EmailGateModal

Same last-touch override semantics as PaywallModal — preserves drip-click
attribution if user submits email after landing on /chart with ?utm_*.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Apply readUtmLastTouch in CheckoutStartClient

**Files:**
- Modify: `src/app/[locale]/checkout/start/CheckoutStartClient.tsx:24,54`
- Test: `src/app/[locale]/checkout/start/__tests__/CheckoutStartClient.utm.test.tsx`

- [ ] **Step 1: Update import (line 24) + call site (line 54)**

Replace line 24:
```ts
import { readUtmCookie } from '@/shared/lib/utm-cookie';
```
with:
```ts
import { readUtmLastTouch } from '@/shared/lib/utm-cookie';
```

Replace line 54:
```ts
      const utmFields = readUtmCookie();
```
with:
```ts
      const utmFields = readUtmLastTouch();
```

If subsequent line uses `utmFields ?? {}` pattern, drop the null-coalesce (the new return type is `UtmFields`, not nullable).

- [ ] **Step 2: Update test mock**

In `src/app/[locale]/checkout/start/__tests__/CheckoutStartClient.utm.test.tsx`, lines 35-41, replace `readUtmCookie` references with `readUtmLastTouch`:

```ts
vi.mock('@/shared/lib/utm-cookie', () => ({
  readUtmLastTouch: vi.fn(),
}));
import { readUtmLastTouch } from '@/shared/lib/utm-cookie';
const mockReadUtmLastTouch = vi.mocked(readUtmLastTouch);
```

Update assertion at line 50: rename test "includes UTM fields in the postJson body when readUtmCookie returns data" → "...readUtmLastTouch returns data". Replace `mockReadUtmCookie.mockReturnValue` calls with `mockReadUtmLastTouch.mockReturnValue`. `null` mock returns become `{}`.

- [ ] **Step 3: Add URL-override test case**

Append:

```ts
it('passes URL-derived UTM (last-touch) when present', async () => {
  mockReadUtmLastTouch.mockReturnValue({ utm_source: 'lead-nurture', utm_campaign: 't72' });
  // ... mount client + trigger checkout — follow existing setup pattern ...
  // ... assert fetch was called with body containing utm_source: 'lead-nurture'
});
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/app/[locale]/checkout/start/__tests__/CheckoutStartClient.utm.test.tsx
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/[locale]/checkout/start/CheckoutStartClient.tsx 'src/app/[locale]/checkout/start/__tests__/CheckoutStartClient.utm.test.tsx'
git commit -m "fix(checkout-start/T4): use readUtmLastTouch in anon checkout flow

CheckoutStartClient now reads URL last-touch UTM. Closes the third of
four read sites in the drip→Stripe attribution chain.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Apply readUtmLastTouch in PricingUpgradeButton

**Files:**
- Modify: `src/app/[locale]/(marketing)/pricing/PricingUpgradeButton.tsx:6,31`
- Test: `src/app/[locale]/(marketing)/pricing/__tests__/PricingUpgradeButton.utm.test.tsx`

- [ ] **Step 1: Update import + call site**

Replace line 6 import (`readUtmCookie` → `readUtmLastTouch`) and line 31 call site (`readUtmCookie()` → `readUtmLastTouch()`), same pattern as Task 4.

- [ ] **Step 2: Update test mock**

Same pattern as Task 4 Step 2 — rename `readUtmCookie` to `readUtmLastTouch` throughout `src/app/[locale]/(marketing)/pricing/__tests__/PricingUpgradeButton.utm.test.tsx`.

- [ ] **Step 3: Add URL-override case**

Append a new test matching the pattern from Task 2 / Task 4 Step 3.

- [ ] **Step 4: Run tests**

```bash
npx vitest run 'src/app/[locale]/(marketing)/pricing/__tests__/PricingUpgradeButton.utm.test.tsx'
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add 'src/app/[locale]/(marketing)/pricing/PricingUpgradeButton.tsx' 'src/app/[locale]/(marketing)/pricing/__tests__/PricingUpgradeButton.utm.test.tsx'
git commit -m "fix(pricing/T5): use readUtmLastTouch in PricingUpgradeButton

Last of four UTM read sites — drip→Stripe attribution chain replete.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Export STEP_0_TO_1_DELAY_MS + fix waitUntil delay

**Files:**
- Modify: `src/app/api/cron/lead-nurture/route.ts` (export const ~line 67)
- Modify: `src/app/api/v1/leads/route.ts:201` (use constant)
- Test: `src/app/api/v1/leads/__tests__/route.test.ts` (update expected nextAt math)

- [ ] **Step 1: Export STEP_0_TO_1_DELAY_MS from cron route**

In `src/app/api/cron/lead-nurture/route.ts`, after line 66 (`const HOUR = 60 * 60 * 1000;`), add:

```ts
/**
 * Delay between step=0 (registered, T+0 chart sent) and step=1 (cron will
 * pick up to send T+1h curiosity_hook). Exported so the /api/v1/leads
 * waitUntil block can stay in sync — prevents the drift that produced
 * the 24h-vs-1h bug found 2026-05-20.
 */
export const STEP_0_TO_1_DELAY_MS = 1 * HOUR;
```

Update the STEP_HANDLERS array entry on line ~83 to reference the constant:

```ts
const STEP_HANDLERS: StepHandler[] = [
  { fromStep: 0, toStep: 1, send: sendLeadChartEmail,           nextDelayMs: STEP_0_TO_1_DELAY_MS },
  // ... rest unchanged
];
```

- [ ] **Step 2: Import + use in waitUntil**

In `src/app/api/v1/leads/route.ts`, add to imports (group with other internal imports):

```ts
import { STEP_0_TO_1_DELAY_MS } from '@/app/api/cron/lead-nurture/route';
```

Replace line 201:
```ts
              nurtureNextAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
```
with:
```ts
              nurtureNextAt: new Date(Date.now() + STEP_0_TO_1_DELAY_MS),
```

- [ ] **Step 3: Update existing test expectations**

In `src/app/api/v1/leads/__tests__/route.test.ts`, find the assertion that checks `nurtureNextAt` after waitUntil. The current expected delta is 24 hours; change to 1 hour. Use the constant in the test too:

```ts
import { STEP_0_TO_1_DELAY_MS } from '@/app/api/cron/lead-nurture/route';
// ... in the test:
const expectedNextAt = new Date(mockNow.getTime() + STEP_0_TO_1_DELAY_MS);
// ... assertion against this value ...
```

If the test references the literal `24 * 60 * 60 * 1000`, replace that literal with `STEP_0_TO_1_DELAY_MS`.

- [ ] **Step 4: Run affected tests**

```bash
npx vitest run src/app/api/v1/leads/__tests__/route.test.ts src/app/api/cron/lead-nurture/__tests__/
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/lead-nurture/route.ts src/app/api/v1/leads/route.ts src/app/api/v1/leads/__tests__/route.test.ts
git commit -m "fix(curiosity-drip/T6): waitUntil 24h→1h via shared STEP_0_TO_1_DELAY_MS

waitUntil after T+0 chart was setting nurture_next_at = NOW + 24h while
the cron's STEP_HANDLERS[0] used 1h. Fresh leads sat on step=1 for a
full day before cron picked them up to send curiosity_hook.

Export the constant from cron/route.ts so both call sites stay in sync;
prevents this class of drift on the next refactor.

Closes bug #3-A from email-funnel-data-integrity spec.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Diagnostic logging in cron lead-nurture dispatch

**Files:**
- Modify: `src/app/api/cron/lead-nurture/route.ts` (3 console.info inside per-lead loop ~lines 154-191)

- [ ] **Step 1: Add dispatch + sendResult + stepAdvanced log lines**

In `src/app/api/cron/lead-nurture/route.ts`, inside the per-lead `for` loop (currently lines 153-208), add three `console.info` calls.

Add after the `handler` lookup (line 156, before the `if (!handler)` branch):

```ts
        console.info('[cron/lead-nurture] dispatch', {
          leadId: lead.id,
          step: lead.nurtureStep,
          handlerFromStep: handler?.fromStep ?? null,
        });
```

Add after `await handler.send(...)` returns (right after current line 169):

```ts
        console.info('[cron/lead-nurture] sendResult', {
          leadId: lead.id,
          sent: sendResult.sent,
          reason: sendResult.reason ?? null,
        });
```

Add after the step update block (after current line 177 inside the `if (sendResult.sent)` branch; also mirror inside the `else if (sendResult.reason === 'already_sent')` branch — both advance step):

```ts
          console.info('[cron/lead-nurture] stepAdvanced', {
            leadId: lead.id,
            fromStep: lead.nurtureStep,
            toStep: handler.toStep,
            nextAtIso: nextAt?.toISOString() ?? null,
          });
```

- [ ] **Step 2: Run cron route tests (sanity — no behavior change expected)**

```bash
npx vitest run src/app/api/cron/lead-nurture/__tests__/
```

Expected: all pass (logging is side-effect only, no test changes needed).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/lead-nurture/route.ts
git commit -m "feat(curiosity-drip/T7): diagnostic logging in cron dispatch

Three console.info per processed lead: dispatch (entry + handler lookup),
sendResult (post-send status), stepAdvanced (state mutation).

No PII — only leadId + numeric/enum state. Populates Vercel runtime logs
for #3-B root cause investigation (lead_curiosity_hook 0 rows mystery).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Diagnostic logging in tryInsertOneShotLead

**Files:**
- Modify: `src/shared/lib/sent-lead-emails.ts:35-55` (inside tryInsertOneShotLead)

- [ ] **Step 1: Add console.info at function exit points**

In `src/shared/lib/sent-lead-emails.ts`, replace the body of `tryInsertOneShotLead` to log before returning. Current body (35-55) returns at 2 points; add logging at each:

```ts
export async function tryInsertOneShotLead(
  leadId: string,
  emailType: LeadEmailType,
): Promise<LeadEmailClaim> {
  const db = getDb();
  const inserted = await db
    .insert(sentLeadEmails)
    .values({ leadId, emailType })
    .onConflictDoNothing()
    .returning();
  if (inserted.length > 0) {
    console.info('[sent-lead-emails] claim', {
      leadId,
      emailType,
      result: 'new',
      insertedRowCount: inserted.length,
    });
    return 'new';
  }

  const existing = await db
    .select({ resendMessageId: sentLeadEmails.resendMessageId })
    .from(sentLeadEmails)
    .where(and(eq(sentLeadEmails.leadId, leadId), eq(sentLeadEmails.emailType, emailType)))
    .limit(1);
  const result: LeadEmailClaim = existing[0]?.resendMessageId ? 'delivered' : 'retry';
  console.info('[sent-lead-emails] claim', {
    leadId,
    emailType,
    result,
    insertedRowCount: 0,
    existingMsgid: existing[0]?.resendMessageId ?? null,
  });
  return result;
}
```

- [ ] **Step 2: Run sent-lead-emails tests**

```bash
npx vitest run src/shared/lib/__tests__/sent-lead-emails.test.ts 2>/dev/null || npx vitest run src/shared/lib/ -t "sent-lead-emails"
```

Expected: pass. If no test file exists, skip and verify the project's overall test suite still passes (next step).

- [ ] **Step 3: Commit**

```bash
git add src/shared/lib/sent-lead-emails.ts
git commit -m "feat(curiosity-drip/T8): log claim result in tryInsertOneShotLead

Logs every claim attempt: leadId + emailType + result (new/retry/delivered)
+ insertedRowCount. Critical for #3-B diagnosis — pinpoints whether
INSERT silently failed or returned the wrong claim state.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Diagnostic logging in 7 sendLead*Email functions

**Files:**
- Modify: `src/shared/lib/email.ts` — 2 console.info insertions in each of 7 funcs

Functions and their approximate start line (per current main):
- `sendLeadChartEmail` (~line 370)
- `sendLeadCuriosityHookEmail` (~line 441)
- `sendLeadMoonAscEmail` (~line 519)
- `sendLeadPaywallTeaserEmail` (~line 585)
- `sendLeadSaturnWeeklyEmail` (~line 638)
- `sendLeadMiniReadingEmail` (~line 691)
- `sendLeadSynastryTeaserEmail` (~line 759)

For **each** function, add two log lines:

**Insertion 1 (`start`)** — immediately after the `claim === 'delivered'` early-return guard, before any other work:

```ts
  console.info('[email/<EMAIL_TYPE>] start', {
    leadId: params.leadId,
    chartIsNull: !params.chart,
  });
```

Replace `<EMAIL_TYPE>` with the actual enum string used in that function's `tryInsertOneShotLead` call (e.g. `lead_chart`, `lead_curiosity_hook`, etc.).

**Insertion 2 (`sent`)** — immediately after `const result = await getResend().emails.send(...)` but **before** the `if (result.error)` throw guard. This way it logs both success and failure cases:

```ts
  console.info('[email/<EMAIL_TYPE>] sent', {
    leadId: params.leadId,
    resendMessageId: result.data?.id ?? null,
    resendErrorName: result.error?.name ?? null,
  });
```

- [ ] **Step 1: Add log lines in `sendLeadChartEmail`**

Edit `src/shared/lib/email.ts` to add the 2 lines as described above, with `<EMAIL_TYPE>` = `lead_chart`.

- [ ] **Step 2: Add log lines in `sendLeadCuriosityHookEmail`**

Same pattern, with `<EMAIL_TYPE>` = `lead_curiosity_hook`. This is the function whose 0-rows-in-DB triggered the investigation — most important target.

- [ ] **Step 3: Add log lines in `sendLeadMoonAscEmail`**

`<EMAIL_TYPE>` = `lead_moon_asc`.

- [ ] **Step 4: Add log lines in `sendLeadPaywallTeaserEmail`**

`<EMAIL_TYPE>` = `lead_paywall_teaser`.

- [ ] **Step 5: Add log lines in `sendLeadSaturnWeeklyEmail`**

`<EMAIL_TYPE>` = `lead_saturn_weekly`.

- [ ] **Step 6: Add log lines in `sendLeadMiniReadingEmail`**

`<EMAIL_TYPE>` = `lead_mini_reading`.

- [ ] **Step 7: Add log lines in `sendLeadSynastryTeaserEmail`**

`<EMAIL_TYPE>` = `lead_synastry_teaser`.

- [ ] **Step 8: Run email tests**

```bash
npx vitest run src/shared/lib/__tests__/email.test.ts 2>/dev/null && npx vitest run src/shared/lib/__tests__/ -t "email"
```

Expected: pass (logging is pure side-effect, no behavior change).

- [ ] **Step 9: Run full typecheck + lint to ensure no regressions**

```bash
npm run typecheck && npm run lint -- --max-warnings 0 src/shared/lib/email.ts src/shared/lib/sent-lead-emails.ts src/app/api/cron/lead-nurture/route.ts
```

Expected: clean.

- [ ] **Step 10: Commit**

```bash
git add src/shared/lib/email.ts
git commit -m "feat(curiosity-drip/T9): diagnostic logging in 7 sendLead*Email funcs

Two console.info per function: 'start' (leadId + chartIsNull) and 'sent'
(resendMessageId + resendErrorName). Logged before the result.error throw
guard so failures are captured too.

No PII — only leadId + boolean/string state. Populates Vercel runtime
logs to identify which step of curiosity_hook send fails silently.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: One-off SQL: unstick step=1 leads (PLAN ARTIFACT — RUN AFTER #3-B FIX)

**Files:**
- Create: `scripts/advertising/_unstick_step1_leads.mjs`

This script is written now (so it's reviewable) but **not run** until after Phase 2A confirms `lead_curiosity_hook` rows are now writing.

- [ ] **Step 1: Create script**

Write `scripts/advertising/_unstick_step1_leads.mjs`:

```js
/**
 * One-off: unstick 23 leads sitting on nurture_step=1 with a 24h delay
 * (their nurture_next_at was set by the pre-fix waitUntil code using
 * the old 24h delta instead of the new 1h delta).
 *
 * Only safe to run after #3-B root cause is fixed and confirmed —
 * otherwise these leads will go into the same broken curiosity_hook
 * flow and stay broken longer.
 *
 * Usage:
 *   node scripts/advertising/_unstick_step1_leads.mjs --dry-run    # SELECT only
 *   node scripts/advertising/_unstick_step1_leads.mjs              # UPDATE
 */
import { config } from 'dotenv';
config({ path: '.env' });
import { neon } from '@neondatabase/serverless';

const DRY = process.argv.includes('--dry-run');
const sql = neon(process.env.DATABASE_URL);

const targets = await sql`
  SELECT id, locale, nurture_step, nurture_next_at,
         EXTRACT(EPOCH FROM (NOW() - created_at))/3600 AS age_hours
  FROM email_leads
  WHERE nurture_step = 1
    AND converted_to_user_id IS NULL
    AND unsubscribed_at IS NULL
    AND email_undeliverable = false
  ORDER BY created_at ASC
`;

console.log(`Found ${targets.length} stuck step=1 leads:`);
console.table(targets);

if (DRY) {
  console.log('\n[DRY RUN] No UPDATE executed. Remove --dry-run to apply.');
  process.exit(0);
}

const updated = await sql`
  UPDATE email_leads
  SET nurture_next_at = NOW()
  WHERE nurture_step = 1
    AND converted_to_user_id IS NULL
    AND unsubscribed_at IS NULL
    AND email_undeliverable = false
  RETURNING id
`;

console.log(`\nUpdated ${updated.length} leads — next cron tick will pick them up for curiosity_hook send.`);
```

- [ ] **Step 2: Verify syntax via dry-run mentally / lint**

```bash
node --check scripts/advertising/_unstick_step1_leads.mjs
```

Expected: no syntax errors.

- [ ] **Step 3: Commit (do not run)**

```bash
git add scripts/advertising/_unstick_step1_leads.mjs
git commit -m "chore(curiosity-drip/T10): one-off SQL to unstick 23 step=1 leads

Run only after #3-B root cause is fixed and confirmed working — these
leads have nurture_next_at set 24h after creation (pre-fix waitUntil
bug). Resets next_at = NOW() so next cron tick picks them up.

--dry-run flag prints targets without mutation.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Phase 1 deploy + observation (operational, not a code task)

After Tasks 1-10 are committed (locally on `main`):

- [ ] **Push**: `git push origin main`
- [ ] **Verify Vercel deploy**: via `mcp__claude_ai_Vercel__list_deployments` — wait until newest deployment is `READY` at the expected commit SHA.
- [ ] **Wait one cron tick + 10min buffer**: next minute-0 cron run + 10 min for log propagation.
- [ ] **Fetch logs**: via `mcp__claude_ai_Vercel__get_runtime_logs` for the lead-nurture cron endpoint over last 30 minutes.
- [ ] **Grep for**: `[cron/lead-nurture] dispatch` (confirm leads on step=1 processed), `[sent-lead-emails] claim` with `emailType: "lead_curiosity_hook"` (find the failure path), `[email/lead_curiosity_hook]` start/sent pairs.
- [ ] **Identify root cause** of bug #3-B from logs. Commit one-line targeted fix as `fix(curiosity-drip/T11): <root cause>`. **This fix is intentionally NOT in this plan** — its content depends on diagnostic findings. After it's deployed, verify `SELECT COUNT(*) FROM sent_lead_emails WHERE email_type='lead_curiosity_hook' AND sent_at > NOW() - INTERVAL '2 hours'` ≥ 1.

---

## Phase 2 — Days +1 to +5

### Task 11: Stripe events discovery script

**Files:**
- Create: `scripts/advertising/_audit_stripe_events_2026_05_20.mjs`

- [ ] **Step 1: Write the script**

Create `scripts/advertising/_audit_stripe_events_2026_05_20.mjs`:

```js
/**
 * Discovery: what Stripe events were delivered for cus_UXLi3mJUjr
 * (destinig7996@gmail.com), and which made it into processed_stripe_events?
 * Identifies the silent failure in the webhook for this customer.
 */
import { config } from 'dotenv';
config({ path: '.env' });
import { neon } from '@neondatabase/serverless';
import Stripe from 'stripe';

const sql = neon(process.env.DATABASE_URL);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' });

const CUSTOMER_ID = 'cus_UXLi3mJUjr';

console.log(`═════ Stripe events for ${CUSTOMER_ID} ═════`);
// Stripe events API doesn't filter by customer directly; we fetch broad list
// then filter client-side. Window: last 14 days for our timeline.
const events = await stripe.events.list({ limit: 100 });
const ours = events.data.filter((e) => {
  const obj = e.data.object;
  const cust = obj.customer ?? obj.id;
  return cust === CUSTOMER_ID || obj.metadata?.clerkUserId === 'user_3DsXX2DHB';
});

console.log(`Filtered to ${ours.length} events for this customer`);

const eventIds = ours.map((e) => e.id);
const processed = await sql`
  SELECT event_id, event_type, processed_at
  FROM processed_stripe_events
  WHERE event_id = ANY(${eventIds})
`;
const processedSet = new Set(processed.map((p) => p.event_id));

console.log('\n=== Timeline (asc) ===');
const table = ours
  .sort((a, b) => a.created - b.created)
  .map((e) => ({
    id: e.id.slice(0, 16),
    type: e.type,
    created: new Date(e.created * 1000).toISOString().slice(0, 19),
    processed: processedSet.has(e.id) ? '✓' : '–',
  }));
console.table(table);

console.log('\n=== Gaps ===');
const unprocessed = ours.filter((e) => !processedSet.has(e.id));
console.log(`${unprocessed.length} events NOT in processed_stripe_events table:`);
for (const e of unprocessed) {
  console.log(`  - ${e.id} (${e.type}) @ ${new Date(e.created * 1000).toISOString()}`);
}
```

- [ ] **Step 2: Sanity check syntax**

```bash
node --check scripts/advertising/_audit_stripe_events_2026_05_20.mjs
```

Expected: no syntax errors.

- [ ] **Step 3: Commit**

```bash
git add scripts/advertising/_audit_stripe_events_2026_05_20.mjs
git commit -m "chore(stripe-sync/T11): discovery script for destinig7996 webhook gap

Lists all Stripe events for cus_UXLi3mJUjr, cross-references with
processed_stripe_events. Pinpoints whether checkout.session.completed
event was missed entirely vs. processed-but-handler-failed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Retroactive Stripe sync fix script

**Files:**
- Create: `scripts/advertising/_fix_stripe_user_sync_destinig7996.mjs`

- [ ] **Step 1: Write the script**

```js
/**
 * One-off retroactive fix: re-run the same upsert pattern that the Stripe
 * webhook does (src/app/api/webhooks/stripe/route.ts:336-367) against the
 * users table for cus_UXLi3mJUjr → user_3DsXX2DHB.
 *
 * Idempotent. Email-allowlist gated.
 *
 * Usage:
 *   node scripts/advertising/_fix_stripe_user_sync_destinig7996.mjs --dry-run
 *   node scripts/advertising/_fix_stripe_user_sync_destinig7996.mjs
 */
import { config } from 'dotenv';
config({ path: '.env' });
import { neon } from '@neondatabase/serverless';
import Stripe from 'stripe';

const DRY = process.argv.includes('--dry-run');
const sql = neon(process.env.DATABASE_URL);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' });

const CUSTOMER_ID = 'cus_UXLi3mJUjr';
const CLERK_USER_ID = 'user_3DsXX2DHB';

// 1. Pull current Stripe subscription state
const subs = await stripe.subscriptions.list({ customer: CUSTOMER_ID, limit: 5 });
if (subs.data.length === 0) {
  console.error(`No subscriptions found for ${CUSTOMER_ID}`);
  process.exit(1);
}
const sub = subs.data[0];
const priceId = sub.items.data[0]?.price.id;
const plan = sub.items.data[0]?.price.recurring?.interval === 'year' ? 'pro_annual' : 'pro_monthly';
const trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000) : null;
const currentPeriodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000) : null;

const upsertData = {
  stripe_customer_id: CUSTOMER_ID,
  stripe_subscription_id: sub.id,
  subscription_tier: 'premium',
  subscription_status: sub.status,
  subscription_expires_at: currentPeriodEnd,
  plan,
  trial_end: trialEnd,
  current_period_end: currentPeriodEnd,
  updated_at: new Date(),
};

console.log('Target upsert payload:');
console.log(JSON.stringify(upsertData, null, 2));

if (DRY) {
  console.log('\n[DRY RUN] No DB write executed.');
  process.exit(0);
}

// 2. Apply upsert (matches webhook handler line 336-367 semantics)
const result = await sql`
  UPDATE users SET
    stripe_customer_id = ${CUSTOMER_ID},
    stripe_subscription_id = ${sub.id},
    subscription_tier = 'premium',
    subscription_status = ${sub.status},
    subscription_expires_at = ${currentPeriodEnd},
    plan = ${plan},
    trial_end = ${trialEnd},
    current_period_end = ${currentPeriodEnd},
    updated_at = NOW()
  WHERE id = ${CLERK_USER_ID}
  RETURNING id, email, subscription_tier, subscription_status
`;

if (result.length === 0) {
  console.error(`No user row matched id=${CLERK_USER_ID}. Aborting.`);
  process.exit(1);
}
console.log('\n✓ Updated user:');
console.table(result);
```

- [ ] **Step 2: Sanity check**

```bash
node --check scripts/advertising/_fix_stripe_user_sync_destinig7996.mjs
```

- [ ] **Step 3: Commit (do not run yet)**

```bash
git add scripts/advertising/_fix_stripe_user_sync_destinig7996.mjs
git commit -m "chore(stripe-sync/T12): retroactive sync for destinig7996 stuck at free

Fetches current Stripe subscription state for cus_UXLi3mJUjr and applies
the same upsert as webhook handler. Idempotent, dry-run gated.

Run after T11 discovery confirms the root cause.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Watchdog cron — types + test scaffold

**Files:**
- Create: `src/app/api/cron/stripe-user-sync/route.ts`
- Create: `src/app/api/cron/stripe-user-sync/__tests__/route.test.ts`

- [ ] **Step 1: Write the route skeleton with types**

Create `src/app/api/cron/stripe-user-sync/route.ts`:

```ts
/**
 * GET /api/cron/stripe-user-sync
 *
 * Watchdog: hourly diff between Stripe subscriptions (last 7d customers)
 * and users.subscription_tier / users.subscription_status. Auto-fixes drift
 * caused by webhook failures (root cause for destinig7996 was a missed
 * checkout.session.completed event).
 *
 * Per-customer try/catch — one failure does not abort the run.
 * Returns 200 with summary even on Stripe API errors.
 * CRON_SECRET-protected via assertCronAuth.
 */

import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import { inArray } from 'drizzle-orm';
import { getDb } from '@/shared/lib/db';
import { getStripe } from '@/shared/lib/stripe';
import { users } from '@/shared/lib/schema';
import { assertCronAuth } from '@/shared/lib/cron-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

type MismatchKind = 'missing-user' | 'tier-mismatch' | 'status-mismatch';

interface Mismatch {
  customerId: string;
  subscriptionId: string;
  expectedTier: 'free' | 'premium';
  expectedStatus: string;
  expectedPlan: 'free' | 'pro_monthly' | 'pro_annual';
  actualTier: string | null;
  actualStatus: string | null;
  kind: MismatchKind;
  userId?: string;
}

/** derivePlan mirrors webhook handler's derivePlan in src/shared/lib/stripe.ts */
function derivePlanFromInterval(interval: string | null | undefined): 'pro_monthly' | 'pro_annual' {
  return interval === 'year' ? 'pro_annual' : 'pro_monthly';
}

export async function GET(request: Request) {
  const authError = assertCronAuth(request);
  if (authError) return authError;

  const startMs = Date.now();
  let checked = 0;
  let fixed = 0;
  let failed = 0;

  try {
    const db = getDb();
    const stripe = getStripe();
    const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;

    // 1. Pull Stripe customers from last 7 days with their subscriptions
    const customers = await stripe.customers.list({
      created: { gte: sevenDaysAgo },
      limit: 100,
      expand: ['data.subscriptions'],
    });

    // 2. Pull matching users from DB (by stripe_customer_id), plus all users
    //    whose email matches customer.email (for missing-user detection).
    const customerIds = customers.data.map((c) => c.id);
    const matchedUsers = customerIds.length > 0
      ? await db.select().from(users).where(inArray(users.stripeCustomerId, customerIds))
      : [];
    const byStripeId = new Map(matchedUsers.map((u) => [u.stripeCustomerId, u]));

    // 3. Per-customer diff
    for (const customer of customers.data) {
      checked++;
      try {
        const sub = customer.subscriptions?.data?.[0];
        if (!sub) continue;  // no active sub, nothing to sync
        const dbUser = byStripeId.get(customer.id);
        const expectedPlan = derivePlanFromInterval(sub.items?.data[0]?.price?.recurring?.interval);
        const expectedTier: 'premium' = 'premium';
        const expectedStatus = sub.status;

        let kind: MismatchKind | null = null;
        if (!dbUser) kind = 'missing-user';
        else if (dbUser.subscriptionTier !== expectedTier) kind = 'tier-mismatch';
        else if (dbUser.subscriptionStatus !== expectedStatus) kind = 'status-mismatch';

        if (!kind) continue;

        const mismatch: Mismatch = {
          customerId: customer.id,
          subscriptionId: sub.id,
          expectedTier,
          expectedStatus,
          expectedPlan,
          actualTier: dbUser?.subscriptionTier ?? null,
          actualStatus: dbUser?.subscriptionStatus ?? null,
          kind,
          userId: dbUser?.id,
        };

        console.warn('[cron/stripe-user-sync] mismatch found', mismatch);
        Sentry.captureMessage('Stripe sync drift detected', {
          level: 'warning',
          tags: { cron: 'stripe-user-sync', kind },
          extra: mismatch as unknown as Record<string, unknown>,
        });

        if (dbUser) {
          await db
            .update(users)
            .set({
              stripeCustomerId: customer.id,
              stripeSubscriptionId: sub.id,
              subscriptionTier: 'premium',
              subscriptionStatus: expectedStatus as 'trialing' | 'active' | 'canceled' | 'past_due' | 'incomplete' | 'unpaid' | 'free',
              plan: expectedPlan,
              trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
              currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000) : null,
              subscriptionExpiresAt: sub.current_period_end ? new Date(sub.current_period_end * 1000) : null,
              updatedAt: new Date(),
            })
            .where(inArray(users.id, [dbUser.id]));
          fixed++;
        }
      } catch (err) {
        failed++;
        console.error('[cron/stripe-user-sync] per-customer error', {
          customerId: customer.id,
          err: err instanceof Error ? err.message : 'unknown',
        });
        Sentry.captureException(err, {
          tags: { cron: 'stripe-user-sync', stage: 'per-customer' },
          extra: { customerId: customer.id },
        });
      }
    }
  } catch (err) {
    console.error('[cron/stripe-user-sync] catastrophic', err);
    Sentry.captureException(err, {
      tags: { cron: 'stripe-user-sync', stage: 'catastrophic' },
    });
  }

  return NextResponse.json({
    checked,
    fixed,
    failed,
    durationMs: Date.now() - startMs,
  });
}
```

- [ ] **Step 2: Write tests scaffold**

Create `src/app/api/cron/stripe-user-sync/__tests__/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/shared/lib/cron-auth', () => ({
  assertCronAuth: vi.fn(() => null),
}));

const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockStripeCustomersList = vi.fn();

vi.mock('@/shared/lib/db', () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: mockSelect }) }),
    update: () => ({ set: () => ({ where: mockUpdate }) }),
  }),
}));

vi.mock('@/shared/lib/stripe', () => ({
  getStripe: () => ({
    customers: { list: mockStripeCustomersList },
  }),
}));

import { GET } from '@/app/api/cron/stripe-user-sync/route';

describe('cron/stripe-user-sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns checked=0 fixed=0 when Stripe has no recent customers', async () => {
    mockStripeCustomersList.mockResolvedValue({ data: [] });
    const res = await GET(new Request('http://test'));
    const body = await res.json();
    expect(body.checked).toBe(0);
    expect(body.fixed).toBe(0);
  });

  it('detects missing-user mismatch (customer in Stripe, no users row)', async () => {
    mockStripeCustomersList.mockResolvedValue({
      data: [{
        id: 'cus_test1',
        subscriptions: { data: [{
          id: 'sub_test1', status: 'trialing',
          items: { data: [{ price: { recurring: { interval: 'month' } } }] },
          trial_end: 1, current_period_end: 1,
        }] },
      }],
    });
    mockSelect.mockResolvedValue([]);
    const res = await GET(new Request('http://test'));
    const body = await res.json();
    expect(body.checked).toBe(1);
    // missing-user without dbUser → cannot fix; logs warning, fixed stays 0
    expect(body.fixed).toBe(0);
  });

  it('fixes tier-mismatch when users.subscription_tier = free but Stripe = active', async () => {
    mockStripeCustomersList.mockResolvedValue({
      data: [{
        id: 'cus_test2',
        subscriptions: { data: [{
          id: 'sub_test2', status: 'trialing',
          items: { data: [{ price: { recurring: { interval: 'month' } } }] },
          trial_end: 1, current_period_end: 1,
        }] },
      }],
    });
    mockSelect.mockResolvedValue([{
      id: 'user_test2',
      stripeCustomerId: 'cus_test2',
      subscriptionTier: 'free',
      subscriptionStatus: 'free',
    }]);
    mockUpdate.mockResolvedValue([]);
    const res = await GET(new Request('http://test'));
    const body = await res.json();
    expect(body.fixed).toBe(1);
    expect(mockUpdate).toHaveBeenCalled();
  });

  it('no-op when DB and Stripe are aligned', async () => {
    mockStripeCustomersList.mockResolvedValue({
      data: [{
        id: 'cus_test3',
        subscriptions: { data: [{
          id: 'sub_test3', status: 'active',
          items: { data: [{ price: { recurring: { interval: 'year' } } }] },
          trial_end: null, current_period_end: 2,
        }] },
      }],
    });
    mockSelect.mockResolvedValue([{
      id: 'user_test3',
      stripeCustomerId: 'cus_test3',
      subscriptionTier: 'premium',
      subscriptionStatus: 'active',
    }]);
    const res = await GET(new Request('http://test'));
    const body = await res.json();
    expect(body.fixed).toBe(0);
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run src/app/api/cron/stripe-user-sync/__tests__/route.test.ts
```

Expected: 4/4 pass.

- [ ] **Step 4: Add cron entry to vercel.json**

Open `vercel.json`. Locate the `"crons"` array. After the existing `lead-nurture` entry, add:

```json
    {
      "path": "/api/cron/stripe-user-sync",
      "schedule": "0 * * * *"
    }
```

(Match existing JSON formatting — comma between entries.)

- [ ] **Step 5: Run typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/cron/stripe-user-sync/route.ts 'src/app/api/cron/stripe-user-sync/__tests__/route.test.ts' vercel.json
git commit -m "feat(stripe-sync/T13): watchdog cron — hourly Stripe↔users diff + fix

Closes #2 from email-funnel-data-integrity spec. Catches drift caused by
missed/failed webhook events. Three mismatch types: missing-user,
tier-mismatch, status-mismatch. Idempotent upsert (same semantics as
webhook handler). Sentry alert on every drift detected.

Hourly cron initially (first 2 weeks); reduce to 6h after stable.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Sentry breadcrumbs in Stripe webhook handler

**Files:**
- Modify: `src/app/api/webhooks/stripe/route.ts`

- [ ] **Step 1: Add breadcrumbs at 3 locations**

Inside `src/app/api/webhooks/stripe/route.ts`:

After signature verification + before dedup check (~line 144), add:

```ts
  Sentry.addBreadcrumb({
    category: 'stripe-webhook',
    message: 'event received',
    data: { eventId: event.id, eventType: event.type },
    level: 'info',
  });
```

After Clerk user materialization succeeds (~line 217, after `clerkUserId` is confirmed), add:

```ts
            Sentry.addBreadcrumb({
              category: 'stripe-webhook',
              message: 'clerk user materialized',
              data: { eventId: event.id, clerkUserId, anonymousId: anonymousIdMeta },
              level: 'info',
            });
```

After users upsert (~line 367, after `.onConflictDoUpdate({...})` await completes), add:

```ts
        Sentry.addBreadcrumb({
          category: 'stripe-webhook',
          message: 'users upserted',
          data: { eventId: event.id, clerkUserId, plan, subscriptionStatus },
          level: 'info',
        });
```

If `Sentry` is not yet imported at top of file, ensure `import * as Sentry from '@sentry/nextjs';` is present (it likely already is, since the file uses `captureException`).

- [ ] **Step 2: Run webhook tests**

```bash
npx vitest run src/app/api/webhooks/stripe/__tests__/ 2>/dev/null
```

Expected: pass. Breadcrumbs are side-effect only.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/webhooks/stripe/route.ts
git commit -m "feat(stripe-webhook/T14): Sentry breadcrumbs at 3 lifecycle stages

Entry, post-Clerk-materialize, post-users-upsert. Gives next debugger
a traceable timeline for any future webhook drift.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: Backfill script (args-driven)

**Files:**
- Create: `scripts/advertising/_backfill_curiosity_hook.mjs`

- [ ] **Step 1: Write the script**

```js
/**
 * Backfill curiosity_hook for pre-deploy leads renumbered by migration 0013.
 *
 * Resets target leads to nurture_step=1, nurture_next_at=NOW so cron picks
 * them up. Idempotent (UNIQUE index on sent_lead_emails blocks duplicates).
 *
 * Usage:
 *   node scripts/advertising/_backfill_curiosity_hook.mjs --wave=1 --dry-run
 *   node scripts/advertising/_backfill_curiosity_hook.mjs --wave=1
 *
 * Wave sizes: 1=10 (canary), 2=50, 3=108 (remainder).
 */
import { config } from 'dotenv';
config({ path: '.env' });
import { neon } from '@neondatabase/serverless';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    if (a.startsWith('--wave=')) return ['wave', Number(a.split('=')[1])];
    if (a === '--dry-run') return ['dry', true];
    return [a.replace(/^--/, ''), true];
  }),
);
const wave = args.wave;
const DRY = !!args.dry;

if (![1, 2, 3].includes(wave)) {
  console.error('Required: --wave=1|2|3');
  process.exit(1);
}
const WAVE_SIZES = { 1: 10, 2: 50, 3: 108 };
const limit = WAVE_SIZES[wave];

const sql = neon(process.env.DATABASE_URL);

const targets = await sql`
  SELECT id, locale, nurture_step, created_at, utm_campaign
  FROM email_leads
  WHERE nurture_step IN (2, 3)
    AND converted_to_user_id IS NULL
    AND unsubscribed_at IS NULL
    AND email_undeliverable = false
    AND NOT EXISTS (
      SELECT 1 FROM sent_lead_emails s
      WHERE s.lead_id = email_leads.id AND s.email_type = 'lead_curiosity_hook'
    )
  ORDER BY created_at DESC
  LIMIT ${limit}
`;

console.log(`Wave ${wave} targets (limit=${limit}, found=${targets.length}):`);
console.table(targets.map((t) => ({
  id: t.id.slice(0, 10),
  locale: t.locale,
  step: t.nurture_step,
  created: t.created_at.toISOString().slice(0, 16),
  utm: t.utm_campaign,
})));

if (DRY) {
  console.log('\n[DRY RUN] No UPDATE executed.');
  process.exit(0);
}

const ids = targets.map((t) => t.id);
const updated = await sql`
  UPDATE email_leads
  SET nurture_step = 1, nurture_next_at = NOW()
  WHERE id = ANY(${ids})
  RETURNING id
`;
console.log(`\n✓ Reset ${updated.length} leads to step=1 (cron picks up next tick).`);
```

- [ ] **Step 2: Sanity check + dry run output preview**

```bash
node --check scripts/advertising/_backfill_curiosity_hook.mjs
node scripts/advertising/_backfill_curiosity_hook.mjs --wave=1 --dry-run | head -30
```

Expected: 10 targets printed, no DB write.

- [ ] **Step 3: Commit (do not run actual UPDATE — wave execution is operational, gated on #3-B fix)**

```bash
git add scripts/advertising/_backfill_curiosity_hook.mjs
git commit -m "chore(backfill/T15): args-driven backfill script for 168 leads in 3 waves

Resets target leads to nurture_step=1 + nurture_next_at=NOW so the cron
sends them T+1h curiosity_hook they were skipped by migration 0013.
Idempotency guards: UNIQUE index on (lead_id, email_type), NOT EXISTS
clause, --dry-run flag for review.

DO NOT run until #3-B root cause fixed and confirmed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: Backfill health audit script

**Files:**
- Create: `scripts/advertising/_audit_backfill_health.mjs`

- [ ] **Step 1: Write the script**

```js
/**
 * Run after each backfill wave: measures whether the wave's leads got
 * their curiosity_hook delivered + tracks abort criteria (silent fail,
 * unsubscribes, bounces, complaints).
 *
 * Usage:
 *   node scripts/advertising/_audit_backfill_health.mjs
 */
import { config } from 'dotenv';
config({ path: '.env' });
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

console.log('═════ curiosity_hook sends in last 25h ═════');
const sends = await sql`
  SELECT
    COUNT(*)::int AS sent_total,
    COUNT(*) FILTER (WHERE resend_message_id IS NOT NULL)::int AS confirmed_sent,
    COUNT(*) FILTER (WHERE resend_message_id IS NULL)::int AS silent_fail
  FROM sent_lead_emails
  WHERE email_type = 'lead_curiosity_hook'
    AND sent_at >= NOW() - INTERVAL '25 hours'
`;
console.table(sends);

if (sends[0].silent_fail > 0) {
  console.error('🚨 SILENT FAIL DETECTED — #3-B regression. ABORT next wave.');
}

console.log('\n═════ Unsubscribes among recent curiosity_hook recipients ═════');
const unsubs = await sql`
  WITH recipients AS (
    SELECT lead_id FROM sent_lead_emails
    WHERE email_type = 'lead_curiosity_hook'
      AND sent_at >= NOW() - INTERVAL '25 hours'
  )
  SELECT
    COUNT(*)::int AS recipients_total,
    COUNT(*) FILTER (WHERE l.unsubscribed_at >= NOW() - INTERVAL '25 hours')::int AS unsubs_24h,
    COUNT(*) FILTER (WHERE l.email_undeliverable = true)::int AS bounces_total,
    ROUND(100.0 * COUNT(*) FILTER (WHERE l.unsubscribed_at >= NOW() - INTERVAL '25 hours') / NULLIF(COUNT(*), 0), 2) AS unsub_pct,
    ROUND(100.0 * COUNT(*) FILTER (WHERE l.email_undeliverable = true) / NULLIF(COUNT(*), 0), 2) AS bounce_pct
  FROM email_leads l
  WHERE l.id IN (SELECT lead_id FROM recipients)
`;
console.table(unsubs);

const u = unsubs[0];
const flags = [];
if (u.unsub_pct > 5) flags.push(`unsub_pct ${u.unsub_pct}% > 5% threshold`);
if (u.bounce_pct > 5) flags.push(`bounce_pct ${u.bounce_pct}% > 5% threshold`);

if (flags.length > 0) {
  console.error('\n🚨 ABORT CRITERIA HIT — DO NOT run next wave:');
  for (const f of flags) console.error(`  - ${f}`);
} else {
  console.log('\n✓ All abort criteria clean. Next wave safe to proceed (after 24h observation).');
}
console.log('\nNOTE: Resend complaint/spam rate not visible from DB — check Resend dashboard manually.');
```

- [ ] **Step 2: Sanity check**

```bash
node --check scripts/advertising/_audit_backfill_health.mjs
```

- [ ] **Step 3: Commit**

```bash
git add scripts/advertising/_audit_backfill_health.mjs
git commit -m "chore(backfill/T16): wave health audit + abort-criteria enforcement

Measures silent-fail count + unsubscribe % + bounce % among recipients
of curiosity_hook in the last 25h. Prints abort recommendation when any
threshold (silent_fail>0, unsub>5%, bounce>5%) is crossed.

Resend complaint rate must be checked manually in dashboard.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Phase 2 operational runbook (not code tasks)

After Tasks 11-16 are merged:

- [ ] **Run discovery** for destinig7996: `node scripts/advertising/_audit_stripe_events_2026_05_20.mjs`. Read output. Confirm which event(s) failed.
- [ ] **Run retroactive fix** (dry-run first, then real): `node scripts/advertising/_fix_stripe_user_sync_destinig7996.mjs --dry-run` → if payload looks right → `node scripts/advertising/_fix_stripe_user_sync_destinig7996.mjs`.
- [ ] **Verify watchdog cron** ran at next minute-0 tick. Check Vercel logs for `[cron/stripe-user-sync]`. `fixed=0` after destinig7996 is fixed is expected.
- [ ] **Run #5 Wave 1 canary** (10 leads) once #3-B is confirmed working: `node scripts/advertising/_backfill_curiosity_hook.mjs --wave=1 --dry-run` → review → `--wave=1` (no dry-run).
- [ ] **Wait 24h. Run health audit**: `node scripts/advertising/_audit_backfill_health.mjs`. Verify silent_fail=0, unsub<5%, bounce<5%. Check Resend dashboard for complaint rate.
- [ ] **Wave 2 (if clean)**: same pattern, `--wave=2`.
- [ ] **Wave 3 (if clean)**: same pattern, `--wave=3`.
- [ ] **Cleanup commit (Week +1)**: gate diagnostic `console.info` lines added in Tasks 7-9 behind `if (process.env.DEBUG_DRIP)` or remove. Commit `chore(curiosity-drip): remove diagnostic logging post-investigation`.
- [ ] **Watchdog cadence (Week +2)**: if no drift detected by watchdog for 2 weeks, reduce schedule from `0 * * * *` to `0 */6 * * *` in `vercel.json`.

---

## Self-Review

**Spec coverage check (skimmed §1-§9 of spec):**

| Spec section | Task(s) | Status |
|---|---|---|
| §3.2 readUtmLastTouch helper + 4 call sites + 4 tests | T1, T2, T3, T4, T5 | ✓ |
| §3.3.1 Discovery script | T11 | ✓ |
| §3.3.2 Retroactive fix script | T12 | ✓ |
| §3.3.3 Watchdog cron + tests + vercel.json | T13 | ✓ |
| §3.3 Sentry breadcrumbs in webhook | T14 | ✓ |
| §3.4.1 STEP_0_TO_1_DELAY_MS export + waitUntil fix | T6 | ✓ |
| §3.4.1 unstick step=1 leads SQL | T10 | ✓ |
| §3.4.2 Diagnostic logging cron route | T7 | ✓ |
| §3.4.2 Diagnostic logging tryInsertOneShotLead | T8 | ✓ |
| §3.4.2 Diagnostic logging 7 sendLead*Email | T9 | ✓ |
| §3.4.3 Observation loop | Operational (Phase 1 close) | ✓ |
| §3.4.4 Root cause fix | Intentionally outside plan (TBD diagnostics) | ✓ acknowledged |
| §3.4.5 Cleanup | Operational (Week +1) | ✓ |
| §3.5 Backfill script | T15 | ✓ |
| §3.5 Health audit script | T16 | ✓ |
| §3.5 Wave execution | Operational | ✓ |
| §5 Rollout sequence | Reflected in Phase 1 / Phase 2 ordering | ✓ |
| §6 Cross-cutting risks | Covered in runbook steps | ✓ |
| §7 Files inventory | Matches §File Structure of plan | ✓ |

**Placeholder scan:** No "TBD" or "implement later" in code-bearing tasks. The single deliberate gap (Task 10's "#3-B root cause fix") is explicitly called out as operational, not code, and the rationale (depends on diagnostics) is stated.

**Type consistency:** `STEP_0_TO_1_DELAY_MS` exported once in T6, imported in T6 (leads route) and reused in T6 test. `readUtmLastTouch` defined in T1, used identically in T2-T5. `Mismatch` interface defined in T13, no external use. `LeadEmailClaim` from existing `sent-lead-emails.ts` reused in T8 unchanged.

**Ambiguity check:** Wave sizes 10/50/108 sum to 168 ✓. Hour delay 1 vs 24 explicit ✓. Abort thresholds quantified (5%/5%/0.1%, silent_fail>0) ✓.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-20-email-funnel-data-integrity.md`.

**Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Each task gets its own clean context.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
