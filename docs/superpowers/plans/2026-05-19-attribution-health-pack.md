# Attribution Health Pack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close two attribution gaps from the 2026-05-18 audit — (1) `utm_content` fallback in the Stripe webhook that unsubscribes leads whose email differs from the Stripe customer-email, and (2) ops verification of the already-shipped Resend bounce/complaint webhook.

**Architecture:** Two source files touched, zero migrations, zero schema changes. The Stripe webhook gains a second UPDATE path that fires only when the primary email/anonymous-id link returns zero rows AND `session.metadata.utm_content` matches the 21-char nanoid format. A new standalone `_audit_*.mjs` script reads Resend's webhook config and recent deliveries. Each guard (`pattern`, `isNull(unsubscribed_at)`, `isNull(converted_to_user_id)`) is introduced by its own failing test for clean bisect history.

**Tech Stack:** Next.js 16 App Router · TypeScript 6 · Drizzle ORM · Stripe SDK · Vitest · Resend SDK · Node.js (mjs scripts).

**Spec:** `docs/superpowers/specs/2026-05-18-attribution-health-pack-design.md`

---

## File Structure

| Path | Change | Responsibility |
|---|---|---|
| `src/app/api/webhooks/stripe/route.ts` | edit (lines 219-243) | Add `utm_content` fallback UPDATE after primary link; capture `linkedRows.length` via `.returning()`. |
| `src/app/api/webhooks/stripe/__tests__/anonymous-completion.test.ts` | edit (mock + append 6 cases) | Track update call args; assert fallback fires only with guards satisfied. |
| `scripts/advertising/_audit_resend_webhook_wiring.mjs` | new file | Read-only verification of `RESEND_WEBHOOK_SECRET`, configured endpoint, recent deliveries. |

No new files in `src/`. No migration. No schema change.

---

### Task 1: Extend Drizzle mock to support `.returning()` chain

The current mock returns `Promise.resolve(dbUpdateMock())` directly from `.where()`. The new Stripe webhook code chains `.returning({ id: emailLeads.id })` after `.where()` for the link UPDATE, while keeping the bare `.where()` for the fallback UPDATE. The mock must handle BOTH shapes from one chain.

**Files:**
- Modify: `src/app/api/webhooks/stripe/__tests__/anonymous-completion.test.ts:11-39` (the `dbUpdateMock` declaration and `vi.mock('@/shared/lib/db', ...)` block) and `:82-95` (`beforeEach`)

- [ ] **Step 1: Read the current mock block to confirm exact line ranges**

Run: `sed -n '9,40p' src/app/api/webhooks/stripe/__tests__/anonymous-completion.test.ts`
Expected: shows `const dbInsertMock`, `dbUpdateMock`, `dbDeleteMock` declarations and the `getDb` mock.

- [ ] **Step 2: Replace the `dbUpdateMock` declaration block (lines 9-12) with an extended call-tracker**

Replace this:

```ts
const dbInsertMock = vi.fn();
const dbUpdateMock = vi.fn();
const dbDeleteMock = vi.fn();
const sendEmailMock = vi.fn();
```

With:

```ts
const dbInsertMock = vi.fn();
const dbUpdateMock = vi.fn();
const dbDeleteMock = vi.fn();
const sendEmailMock = vi.fn();

// Captures every db.update().set().where()[.returning()] invocation in order.
// Tests assert on .length, .setArgs, .whereArgs, and .returningCalled.
type UpdateCall = {
  setArgs: unknown;
  whereArgs: unknown;
  returningCalled: boolean;
};
const dbUpdateCalls: UpdateCall[] = [];
// Result returned when the link UPDATE chains .returning(). Empty array = "no rows linked".
let dbUpdateReturningRows: Array<{ id: string }> = [];
```

- [ ] **Step 3: Replace the `update: () => ({ set: () => ({ where: ... }) })` line inside the db mock (line 35) with a thenable-plus-returning shape**

Replace this:

```ts
    update: () => ({ set: () => ({ where: () => Promise.resolve(dbUpdateMock()) }) }),
```

With:

```ts
    update: () => ({
      set: (setArgs: unknown) => ({
        where: (whereArgs: unknown) => {
          const call: UpdateCall = { setArgs, whereArgs, returningCalled: false };
          dbUpdateCalls.push(call);
          dbUpdateMock();
          // The fallback path awaits .where() directly (thenable resolves to undefined).
          // The link path calls .returning() first, which resolves to dbUpdateReturningRows.
          const thenable: PromiseLike<undefined> & { returning: () => Promise<Array<{ id: string }>> } = {
            then: (resolve) => Promise.resolve(undefined).then(resolve),
            returning: () => {
              call.returningCalled = true;
              return Promise.resolve(dbUpdateReturningRows);
            },
          };
          return thenable;
        },
      }),
    }),
```

- [ ] **Step 4: Reset the new state in `beforeEach` (after line 86, before `dbInsertMock.mockReturnValue(...)`)**

Insert:

```ts
  dbUpdateCalls.length = 0;
  dbUpdateReturningRows = [{ id: 'lead-default' }]; // default: link succeeds → fallback skipped
```

- [ ] **Step 5: Run the existing test file to confirm no regression**

Run: `npx vitest run src/app/api/webhooks/stripe/__tests__/anonymous-completion.test.ts`
Expected: `6 passed` (all existing tests still green).

- [ ] **Step 6: Commit**

```bash
git add src/app/api/webhooks/stripe/__tests__/anonymous-completion.test.ts
git commit -m "chore(attribution-health-pack/T1): extend stripe webhook test mock for .returning() chain

Captures setArgs/whereArgs/returningCalled per update call so the upcoming
utm_content fallback tests can assert on both the link UPDATE and the
fallback UPDATE in sequence. No behavior change; existing 6 tests still pass.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Restructure link UPDATE with `.returning()` + drive Test 1 + Test 2

This is the structural change: collapse the `if (anonymousIdMeta) {...} else {...}` into a single UPDATE with a ternary in `.where()`, add `.returning({ id })`, and conditionally fire the fallback UPDATE. Test 1 (email-match → no fallback) and Test 2 (email-mismatch + utm_content → fallback fires) are paired because they together prove `linkedRows.length === 0` is the correct gate.

**Files:**
- Modify: `src/app/api/webhooks/stripe/route.ts:219-243`
- Test: `src/app/api/webhooks/stripe/__tests__/anonymous-completion.test.ts` (append before line 185 `});`)

- [ ] **Step 1: Append Test 1 + Test 2 to the test file**

Insert before the closing `});` on line 185:

```ts
  it('linksByEmail_thenSkipsUtmFallback', async () => {
    // Lead-link UPDATE returns 1 row → fallback must NOT fire even with valid utm_content.
    dbUpdateReturningRows = [{ id: 'lead-matched-by-email' }];
    getUserListMock.mockResolvedValue({ totalCount: 1, data: [{ id: 'user_existing' }] });

    await POST(makeSessionCompletedEvent({
      metadata: {
        anonymous_id: 'anon-xyz',
        utm_content: 'qnU9lsC9dkhb8XUTXF4wZ', // valid 21-char lead id
      },
      email: 'paid@example.com',
    }));

    // Exactly one UPDATE: the link itself. No fallback UPDATE.
    expect(dbUpdateCalls).toHaveLength(1);
    expect(dbUpdateCalls[0].returningCalled).toBe(true);
  });

  it('emailMismatch_utmFallbackSetsUnsubscribed', async () => {
    // Lead-link UPDATE returns 0 rows (lead-email ≠ checkout-email, no anonymous_id cookie).
    dbUpdateReturningRows = [];
    getUserListMock.mockResolvedValue({ totalCount: 0, data: [] });
    createUserMock.mockResolvedValue({ id: 'user_new_mismatch' });

    await POST(makeSessionCompletedEvent({
      metadata: { utm_content: 'qnU9lsC9dkhb8XUTXF4wZ' },
      email: 'destinig7996@example.com',
    }));

    expect(dbUpdateCalls).toHaveLength(2);
    expect(dbUpdateCalls[0].returningCalled).toBe(true); // link UPDATE
    expect(dbUpdateCalls[1].returningCalled).toBe(false); // fallback UPDATE (no .returning())
    expect(dbUpdateCalls[1].setArgs).toMatchObject({ unsubscribedAt: expect.any(Date) });
  });
```

- [ ] **Step 2: Run the two new tests — expect FAIL**

Run: `npx vitest run src/app/api/webhooks/stripe/__tests__/anonymous-completion.test.ts -t "utmFallback"`
Expected: `emailMismatch_utmFallbackSetsUnsubscribed` FAILS — `dbUpdateCalls` has length 1 (only the link UPDATE; fallback not yet implemented).
Also: `linksByEmail_thenSkipsUtmFallback` FAILS — `returningCalled` is `false` because current code doesn't call `.returning()`.

- [ ] **Step 3: Replace the link UPDATE block in `route.ts:219-243` with the restructured version + fallback**

Read `src/app/api/webhooks/stripe/route.ts:219-243` first to confirm exact text.

Replace this block (lines 219-243):

```ts
            // Link the email_lead(s) to the new user — both anonymous_id and email paths
            const anonymousIdMeta = (session.metadata?.anonymous_id ?? null) as string | null;
            try {
              if (anonymousIdMeta) {
                await db
                  .update(emailLeads)
                  .set({ convertedToUserId: clerkUserId, convertedAt: new Date() })
                  .where(
                    or(
                      eq(emailLeads.anonymousId, anonymousIdMeta),
                      eq(emailLeads.email, email),
                    ),
                  );
              } else {
                await db
                  .update(emailLeads)
                  .set({ convertedToUserId: clerkUserId, convertedAt: new Date() })
                  .where(eq(emailLeads.email, email));
              }
            } catch (linkErr) {
              console.warn(
                '[stripe-webhook] email_leads link failed (non-fatal)',
                linkErr instanceof Error ? linkErr.message : 'unknown',
              );
            }
```

With:

```ts
            // Link the email_lead(s) to the new user — both anonymous_id and email paths.
            // Capture matched rows via .returning() so we can decide whether to run the
            // utm_content fallback below.
            const anonymousIdMeta = (session.metadata?.anonymous_id ?? null) as string | null;
            try {
              const linkedRows = await db
                .update(emailLeads)
                .set({ convertedToUserId: clerkUserId, convertedAt: new Date() })
                .where(
                  anonymousIdMeta
                    ? or(
                        eq(emailLeads.anonymousId, anonymousIdMeta),
                        eq(emailLeads.email, email),
                      )
                    : eq(emailLeads.email, email),
                )
                .returning({ id: emailLeads.id });

              // utm_content fallback. Fires only when the primary link matched zero rows
              // (lead-email differs from checkout-email AND browser dropped anonymous_id).
              // Sets ONLY unsubscribed_at — we cannot prove cross-email identity match.
              const utmContent = session.metadata?.utm_content;
              if (linkedRows.length === 0 && typeof utmContent === 'string') {
                await db
                  .update(emailLeads)
                  .set({ unsubscribedAt: new Date() })
                  .where(eq(emailLeads.id, utmContent));
                console.info('[stripe-webhook] utm_content fallback unsubscribed lead', {
                  sessionId: session.id,
                  leadId: utmContent,
                });
              }
            } catch (linkErr) {
              console.warn(
                '[stripe-webhook] email_leads link failed (non-fatal)',
                linkErr instanceof Error ? linkErr.message : 'unknown',
              );
            }
```

- [ ] **Step 4: Run the two tests — expect PASS**

Run: `npx vitest run src/app/api/webhooks/stripe/__tests__/anonymous-completion.test.ts -t "utmFallback|linksByEmail"`
Expected: both new tests PASS, total `8 passed`.

- [ ] **Step 5: Run full file to confirm no existing-test regression**

Run: `npx vitest run src/app/api/webhooks/stripe/__tests__/anonymous-completion.test.ts`
Expected: `8 passed`.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/webhooks/stripe/route.ts src/app/api/webhooks/stripe/__tests__/anonymous-completion.test.ts
git commit -m "feat(attribution-health-pack/T2): utm_content fallback for cross-email checkouts

When the primary email/anonymous_id link returns zero matched rows AND
session.metadata.utm_content is present, mark the lead row unsubscribed_at
to stop the drip cron. Sets only unsubscribed_at (not converted_to_user_id)
because we cannot prove identity match across different emails.

Tests: linksByEmail_thenSkipsUtmFallback, emailMismatch_utmFallbackSetsUnsubscribed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Add 21-char nanoid pattern validation (Test 4)

Without a format check, legacy ad-id-shaped `utm_content` values (e.g. `"ad_123"`) would trigger a fallback UPDATE that matches zero rows but still logs spuriously. The pattern check filters input at the source.

**Files:**
- Modify: `src/app/api/webhooks/stripe/route.ts` (the `if (linkedRows.length === 0 && typeof utmContent === 'string')` block from Task 2)
- Test: `src/app/api/webhooks/stripe/__tests__/anonymous-completion.test.ts` (append)

- [ ] **Step 1: Append Test 4**

Insert before the closing `});` on the line that was 185 (now further down):

```ts
  it('utmFallback_invalidFormatNoOp', async () => {
    // utm_content like a legacy ad_id (not a 21-char nanoid) → fallback must NOT fire.
    dbUpdateReturningRows = []; // link matched zero rows
    getUserListMock.mockResolvedValue({ totalCount: 0, data: [] });
    createUserMock.mockResolvedValue({ id: 'user_invalid_utm' });

    await POST(makeSessionCompletedEvent({
      metadata: { utm_content: 'ad_123' },
      email: 'paid@example.com',
    }));

    expect(dbUpdateCalls).toHaveLength(1); // only link UPDATE; no fallback
  });
```

- [ ] **Step 2: Run Test 4 — expect FAIL**

Run: `npx vitest run src/app/api/webhooks/stripe/__tests__/anonymous-completion.test.ts -t "invalidFormat"`
Expected: FAIL — `dbUpdateCalls.length === 2` because the current code accepts any string for `utm_content`.

- [ ] **Step 3: Add the nanoid pattern check in `route.ts`**

Replace this line from Task 2's impl:

```ts
              if (linkedRows.length === 0 && typeof utmContent === 'string') {
```

With:

```ts
              const looksLikeLeadId =
                typeof utmContent === 'string' && /^[A-Za-z0-9_-]{21}$/.test(utmContent);
              if (linkedRows.length === 0 && looksLikeLeadId) {
```

- [ ] **Step 4: Run Test 4 — expect PASS**

Run: `npx vitest run src/app/api/webhooks/stripe/__tests__/anonymous-completion.test.ts -t "invalidFormat"`
Expected: PASS.

- [ ] **Step 5: Run full file to confirm no regression**

Run: `npx vitest run src/app/api/webhooks/stripe/__tests__/anonymous-completion.test.ts`
Expected: `9 passed`.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/webhooks/stripe/route.ts src/app/api/webhooks/stripe/__tests__/anonymous-completion.test.ts
git commit -m "feat(attribution-health-pack/T3): pin utm_content fallback to 21-char nanoid format

Legacy ad_id-shaped utm_content (e.g. 'ad_123') would otherwise trigger a
no-op fallback UPDATE plus a spurious console.info log. Pattern check
gates the fallback to lead-id-shaped strings only.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Add `isNull(unsubscribed_at)` idempotency guard (Test 3)

Stripe retries `checkout.session.completed` on 5xx (we return 200 here, but a future change could differ). Without an `unsubscribed_at IS NULL` guard, retried webhooks would overwrite the timestamp on every fire. This task adds `and(..., isNull(emailLeads.unsubscribedAt))` to the fallback `.where()` and pulls in `and, isNull` from drizzle-orm.

**Files:**
- Modify: `src/app/api/webhooks/stripe/route.ts:35` (import) + the fallback `.where()` clause from Task 3
- Test: `src/app/api/webhooks/stripe/__tests__/anonymous-completion.test.ts` (append)

- [ ] **Step 1: Add `inspect` import at the top of the test file (after `import { describe, ... }`)**

If not already present, add at the top of the file:

```ts
import { inspect } from 'node:util';
```

- [ ] **Step 2: Append Test 3**

```ts
  it('utmFallback_idempotentOnRetry', async () => {
    // The fallback UPDATE's where clause must include an isNull(unsubscribed_at)
    // guard so a Stripe retry on the same checkout (or a future code path with
    // overlapping intent) does not overwrite the timestamp.
    //
    // util.inspect() on a Drizzle SQL object renders column references and
    // operator names (including "IsNull"). This is more stable than peeking
    // at .queryChunks internals across drizzle versions.
    dbUpdateReturningRows = [];
    getUserListMock.mockResolvedValue({ totalCount: 0, data: [] });
    createUserMock.mockResolvedValue({ id: 'user_retry' });

    await POST(makeSessionCompletedEvent({
      metadata: { utm_content: 'qnU9lsC9dkhb8XUTXF4wZ' },
      email: 'paid@example.com',
    }));

    expect(dbUpdateCalls).toHaveLength(2);
    const fallbackWhere = inspect(dbUpdateCalls[1].whereArgs, { depth: 8 });
    expect(fallbackWhere).toMatch(/isNull|IsNull/i);
    expect(fallbackWhere).toMatch(/unsubscribed_at/i);
  });
```

- [ ] **Step 3: Run Test 3 — expect FAIL**

Run: `npx vitest run src/app/api/webhooks/stripe/__tests__/anonymous-completion.test.ts -t "idempotentOnRetry"`
Expected: FAIL — current fallback uses `eq()` directly, not `and(eq(), isNull(...))`; the `inspect()` output will not contain "isNull".

- [ ] **Step 4: Extend the drizzle-orm import in `route.ts:35`**

Replace:

```ts
import { eq, or, sql } from 'drizzle-orm';
```

With:

```ts
import { and, eq, isNull, or, sql } from 'drizzle-orm';
```

- [ ] **Step 5: Add the `isNull(unsubscribedAt)` guard to the fallback `.where()`**

Replace:

```ts
                  .where(eq(emailLeads.id, utmContent));
```

With:

```ts
                  .where(
                    and(
                      eq(emailLeads.id, utmContent),
                      isNull(emailLeads.unsubscribedAt),
                    ),
                  );
```

- [ ] **Step 6: Run Test 3 — expect PASS**

Run: `npx vitest run src/app/api/webhooks/stripe/__tests__/anonymous-completion.test.ts -t "idempotentOnRetry"`
Expected: PASS — `inspect()` output now contains "isNull" and references `unsubscribed_at`.

- [ ] **Step 7: Run full file**

Run: `npx vitest run src/app/api/webhooks/stripe/__tests__/anonymous-completion.test.ts`
Expected: `10 passed`.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/webhooks/stripe/route.ts src/app/api/webhooks/stripe/__tests__/anonymous-completion.test.ts
git commit -m "feat(attribution-health-pack/T4): idempotency guard on utm_content fallback

Adds isNull(unsubscribed_at) to the fallback .where() so Stripe retries do
not overwrite the timestamp. Imports and, isNull from drizzle-orm.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Add `isNull(converted_to_user_id)` semantic guard (Test 5)

A lead row that has `converted_to_user_id` set was successfully linked by the primary path on a previous webhook fire. The fallback UPDATE must not flip it to `unsubscribed_at` — that lead is a customer, not a drip target.

**Files:**
- Modify: `src/app/api/webhooks/stripe/route.ts` (extend the `and(...)` clause from Task 4)
- Test: `src/app/api/webhooks/stripe/__tests__/anonymous-completion.test.ts` (append)

- [ ] **Step 1: Append Test 5**

```ts
  it('utmFallback_skipsAlreadyConverted', async () => {
    // The fallback UPDATE's where clause must contain TWO isNull guards:
    // one on unsubscribed_at (from T4) and one on converted_to_user_id (this task).
    // util.inspect() output must reference both column names.
    dbUpdateReturningRows = [];
    getUserListMock.mockResolvedValue({ totalCount: 0, data: [] });
    createUserMock.mockResolvedValue({ id: 'user_already_converted' });

    await POST(makeSessionCompletedEvent({
      metadata: { utm_content: 'qnU9lsC9dkhb8XUTXF4wZ' },
      email: 'paid@example.com',
    }));

    expect(dbUpdateCalls).toHaveLength(2);
    const fallbackWhere = inspect(dbUpdateCalls[1].whereArgs, { depth: 8 });
    expect(fallbackWhere).toMatch(/unsubscribed_at/i);
    expect(fallbackWhere).toMatch(/converted_to_user_id/i);
  });
```

- [ ] **Step 2: Run Test 5 — expect FAIL**

Run: `npx vitest run src/app/api/webhooks/stripe/__tests__/anonymous-completion.test.ts -t "skipsAlreadyConverted"`
Expected: FAIL — `and()` from Task 4 references only `unsubscribed_at`; the second isNull guard is missing.

- [ ] **Step 3: Extend the `and(...)` clause with `isNull(convertedToUserId)`**

Replace:

```ts
                  .where(
                    and(
                      eq(emailLeads.id, utmContent),
                      isNull(emailLeads.unsubscribedAt),
                    ),
                  );
```

With:

```ts
                  .where(
                    and(
                      eq(emailLeads.id, utmContent),
                      isNull(emailLeads.unsubscribedAt),
                      isNull(emailLeads.convertedToUserId),
                    ),
                  );
```

- [ ] **Step 4: Run Test 5 — expect PASS**

Run: `npx vitest run src/app/api/webhooks/stripe/__tests__/anonymous-completion.test.ts -t "skipsAlreadyConverted"`
Expected: PASS.

- [ ] **Step 5: Run full file**

Run: `npx vitest run src/app/api/webhooks/stripe/__tests__/anonymous-completion.test.ts`
Expected: `11 passed`.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/webhooks/stripe/route.ts src/app/api/webhooks/stripe/__tests__/anonymous-completion.test.ts
git commit -m "feat(attribution-health-pack/T5): skip utm_content fallback for converted leads

Adds isNull(converted_to_user_id) to the fallback .where() so a lead already
linked to a Clerk user (paid via a different funnel) is not retroactively
flagged as unsubscribed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: No-metadata defensive test (Test 6)

When `session.metadata.utm_content` is `undefined`, the existing `typeof utmContent === 'string'` check (Task 2) short-circuits. This task adds an explicit test for that branch — it should pass without code changes, but the test acts as a regression guard.

**Files:**
- Test: `src/app/api/webhooks/stripe/__tests__/anonymous-completion.test.ts` (append)

- [ ] **Step 1: Append Test 6**

```ts
  it('utmFallback_noMetadataNoOp', async () => {
    // session.metadata.utm_content undefined → fallback must NOT fire and must NOT throw.
    dbUpdateReturningRows = [];
    getUserListMock.mockResolvedValue({ totalCount: 0, data: [] });
    createUserMock.mockResolvedValue({ id: 'user_no_utm' });

    await POST(makeSessionCompletedEvent({
      metadata: { anonymous_id: 'anon-xyz' }, // no utm_content key
      email: 'paid@example.com',
    }));

    expect(dbUpdateCalls).toHaveLength(1); // only link UPDATE
  });
```

- [ ] **Step 2: Run Test 6 — expect PASS (no code change needed)**

Run: `npx vitest run src/app/api/webhooks/stripe/__tests__/anonymous-completion.test.ts -t "noMetadataNoOp"`
Expected: PASS.

- [ ] **Step 3: Run full file**

Run: `npx vitest run src/app/api/webhooks/stripe/__tests__/anonymous-completion.test.ts`
Expected: `12 passed` (6 original + 6 new).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/webhooks/stripe/__tests__/anonymous-completion.test.ts
git commit -m "test(attribution-health-pack/T6): defensive guard against missing utm_content

Regression test that asserts no fallback UPDATE fires when
session.metadata.utm_content is undefined. Passes without code change;
locks in the typeof check from T2.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Create Resend webhook wiring audit script

Standalone ops script that prints a 3-line health check. Read-only — does NOT write to Resend, Vercel, or the DB. Follows the established `_audit_*.mjs` pattern (dotenv + Resend SDK; falls back to raw `fetch` if the SDK lacks `webhooks.list()`).

**Files:**
- Create: `scripts/advertising/_audit_resend_webhook_wiring.mjs`

- [ ] **Step 1: Verify Resend SDK version and check for `webhooks` namespace**

Run: `node -e "import('resend').then(m => { const r = new m.Resend('test'); console.log(typeof r.webhooks, Object.keys(r)); })"`
Expected: prints whether `r.webhooks` exists. If `undefined`, the script must use the raw fetch fallback (which is what we plan for anyway).

- [ ] **Step 2: Create the audit script**

Write to `scripts/advertising/_audit_resend_webhook_wiring.mjs`:

```js
// Read-only audit of the Resend bounce/complaint webhook wiring.
//
// Prints a 3-line status report:
//   Check 1 (local RESEND_WEBHOOK_SECRET): ✓ present | ✗ missing
//   Check 2 (Resend webhook endpoint):     ✓ configured | ✗ not found
//   Check 3 (recent deliveries):           ✓ N events | ⚠ no events | ✗ all failed
//
// Does NOT mutate Resend or any DB. Run with: node scripts/advertising/_audit_resend_webhook_wiring.mjs
import { config } from 'dotenv';
config({ path: '.env' });

const TARGET_URL_FRAGMENT = 'estrevia.app/api/webhooks/resend';
const REQUIRED_EVENTS = ['email.bounced', 'email.complained'];
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET;

function pad(label) {
  return label.padEnd(44, ' ');
}

// Check 1: local env presence
const check1 = RESEND_WEBHOOK_SECRET
  ? '✓ present'
  : '✗ missing — set in Vercel env and pull locally with `vercel env pull`';
console.log(`${pad('Check 1 (local RESEND_WEBHOOK_SECRET):')}${check1}`);

if (!RESEND_API_KEY) {
  console.log(`${pad('Check 2 (Resend webhook endpoint):')}✗ skipped — RESEND_API_KEY missing`);
  console.log(`${pad('Check 3 (recent deliveries):')}✗ skipped`);
  process.exit(0);
}

// Check 2: webhook configured via raw fetch (SDK may not expose webhooks.list)
let webhookId = null;
let webhookEvents = [];
try {
  const res = await fetch('https://api.resend.com/webhooks', {
    headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
  });
  if (!res.ok) {
    console.log(`${pad('Check 2 (Resend webhook endpoint):')}✗ API ${res.status} — verify in https://resend.com/webhooks`);
    console.log(`${pad('Check 3 (recent deliveries):')}✗ skipped`);
    process.exit(0);
  }
  const body = await res.json();
  const hooks = body.data ?? body ?? [];
  const match = (Array.isArray(hooks) ? hooks : []).find((h) =>
    typeof h.endpoint === 'string' && h.endpoint.includes(TARGET_URL_FRAGMENT),
  );
  if (match) {
    webhookId = match.id;
    webhookEvents = Array.isArray(match.events) ? match.events : [];
    const missing = REQUIRED_EVENTS.filter((e) => !webhookEvents.includes(e));
    const tag = missing.length === 0
      ? '✓ configured'
      : `⚠ configured but missing events: ${missing.join(', ')}`;
    console.log(`${pad('Check 2 (Resend webhook endpoint):')}${tag}: ${webhookId} → /api/webhooks/resend`);
  } else {
    console.log(`${pad('Check 2 (Resend webhook endpoint):')}✗ not found — add at https://resend.com/webhooks → endpoint ${TARGET_URL_FRAGMENT}`);
    console.log(`${pad('Check 3 (recent deliveries):')}✗ skipped`);
    process.exit(0);
  }
} catch (err) {
  console.log(`${pad('Check 2 (Resend webhook endpoint):')}✗ ${err.message ?? 'unknown error'}`);
  console.log(`${pad('Check 3 (recent deliveries):')}✗ skipped`);
  process.exit(0);
}

// Check 3: recent deliveries for the matched webhook
try {
  const res = await fetch(`https://api.resend.com/webhooks/${webhookId}/events`, {
    headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
  });
  if (!res.ok) {
    if (res.status === 404) {
      console.log(`${pad('Check 3 (recent deliveries):')}⚠ no events yet — fire test via https://resend.com/webhooks`);
    } else {
      console.log(`${pad('Check 3 (recent deliveries):')}✗ API ${res.status}`);
    }
    process.exit(0);
  }
  const body = await res.json();
  const events = body.data ?? body ?? [];
  const list = Array.isArray(events) ? events : [];
  if (list.length === 0) {
    console.log(`${pad('Check 3 (recent deliveries):')}⚠ no events yet — fire test via https://resend.com/webhooks`);
    process.exit(0);
  }
  const last10 = list.slice(0, 10);
  const failures = last10.filter((e) => {
    const status = e.status ?? e.response_status ?? 0;
    return status >= 400 || e.error || e.failed;
  });
  if (failures.length === last10.length) {
    console.log(`${pad('Check 3 (recent deliveries):')}✗ all ${last10.length} recent attempts failed — inspect https://resend.com/webhooks`);
  } else if (failures.length > 0) {
    console.log(`${pad('Check 3 (recent deliveries):')}⚠ ${failures.length}/${last10.length} recent attempts failed`);
  } else {
    console.log(`${pad('Check 3 (recent deliveries):')}✓ ${last10.length} recent attempts OK`);
  }
} catch (err) {
  console.log(`${pad('Check 3 (recent deliveries):')}✗ ${err.message ?? 'unknown error'}`);
}
```

- [ ] **Step 3: Run the script locally**

Run: `node scripts/advertising/_audit_resend_webhook_wiring.mjs`
Expected: 3 lines printed, no stack traces. Each line is either `✓`, `⚠`, or `✗` with an actionable hint.

- [ ] **Step 4: If any line is `✗` or `⚠`, address it manually before commit**

This is the ops verification step:
- Check 1 `✗`: set `RESEND_WEBHOOK_SECRET` in Vercel (Production) and run `vercel env pull` locally.
- Check 2 `✗ not found`: open https://resend.com/webhooks → Add endpoint → `https://estrevia.app/api/webhooks/resend`, subscribe to `email.bounced` + `email.complained`, copy the signing secret to Vercel.
- Check 2 `⚠ missing events`: edit existing webhook to add missing events.
- Check 3 `⚠ no events yet`: fire a test event from the Resend Dashboard ("Send test") and re-run.
- Check 3 `✗ all failed`: open one of the failed attempts in the Resend Dashboard and read the response body — typically a 401 from svix signature mismatch (means `RESEND_WEBHOOK_SECRET` differs between Vercel and the Resend webhook config).

Record the resolved state in the commit message.

- [ ] **Step 5: Commit**

```bash
git add scripts/advertising/_audit_resend_webhook_wiring.mjs
git commit -m "feat(attribution-health-pack/T7): resend webhook wiring audit script

Read-only 3-check status: RESEND_WEBHOOK_SECRET present, Resend webhook
configured to /api/webhooks/resend with bounced+complained events,
recent deliveries succeed. Each red line includes an actionable hint.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Final verification

Confirm the full suite, lint, and typecheck are clean before pushing. Then verify the four acceptance criteria from the spec.

**Files:** none new — only verification commands.

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: all suites pass. Note: existing repo has unrelated test flakes — focus on `webhooks/stripe/__tests__/anonymous-completion.test.ts` showing `12 passed`. The new tests must show no failures.

- [ ] **Step 2: Type check**

Run: `npm run typecheck`
Expected: zero errors. Common gotcha: drizzle-orm `and()` requires at least one argument; the impl always passes ≥3 so no issue.

- [ ] **Step 3: Lint (scoped to the two edited files to avoid pre-existing repo noise)**

Run: `npx eslint src/app/api/webhooks/stripe/route.ts src/app/api/webhooks/stripe/__tests__/anonymous-completion.test.ts scripts/advertising/_audit_resend_webhook_wiring.mjs`
Expected: zero errors in these three files. Repo-wide lint has known noise from `.claude/worktrees/` (see `feedback_lint_worktrees_pollution` memory) — do not block on those.

- [ ] **Step 4: Acceptance criteria checklist**

Manually confirm each:

1. **utm_content fallback wired** — `git diff main -- src/app/api/webhooks/stripe/route.ts` shows the `linkedRows.length === 0 && looksLikeLeadId` branch with `and(eq, isNull, isNull)`.
2. **Cron skips unsubscribed leads** — already verified by spec reference: `src/app/api/cron/lead-nurture/route.ts` filters via `isNull(unsubscribedAt)`. Confirm with: `grep -n "unsubscribedAt" src/app/api/cron/lead-nurture/route.ts`.
3. **Audit script actionable** — re-run `node scripts/advertising/_audit_resend_webhook_wiring.mjs` and confirm output fits 3 lines, each with a clear next action.
4. **All 6 new tests + existing suite pass** — `npx vitest run src/app/api/webhooks/stripe/__tests__/anonymous-completion.test.ts` shows `12 passed`.

- [ ] **Step 5: Push and post-deploy smoke**

```bash
git push origin main
```

After Vercel deploys (~2 min):

- Visit Vercel deployment logs → confirm no runtime errors from the webhook route.
- Optional smoke (founder): create a test Stripe checkout via `scripts/advertising/_audit_full_state.mjs`-style pattern (or replay the MFR1 event from Stripe Dashboard → Webhooks → Events → Resend) with `metadata.utm_content` set to a known lead-id whose email differs from the checkout-email. Query: `SELECT id, email, unsubscribed_at FROM email_leads WHERE id = '<lead-id>';` — `unsubscribed_at` must be non-null after the webhook fires.

- [ ] **Step 6: Manual MFR1 lead cleanup (optional, one-shot)**

The MFR1 lead `qnU9lsC9dkhb8XUTXF4wZ` predates this fix. Founder may run once (outside the agent flow):

```sql
UPDATE email_leads
SET unsubscribed_at = NOW()
WHERE id = 'qnU9lsC9dkhb8XUTXF4wZ'
  AND unsubscribed_at IS NULL;
```

This is **not** part of the agent's commit history — it's an operational follow-up.

---

## Plan Summary

| # | Task | Files | Tests added | Commits |
|---|---|---|---|---|
| 1 | Mock extension | 1 test file | 0 (refactor) | 1 |
| 2 | Restructured link UPDATE + basic fallback | route + tests | 2 | 1 |
| 3 | 21-char pattern guard | route + tests | 1 | 1 |
| 4 | `isNull(unsubscribed_at)` guard | route + tests | 1 | 1 |
| 5 | `isNull(converted_to_user_id)` guard | route + tests | 1 | 1 |
| 6 | No-metadata defensive test | tests only | 1 | 1 |
| 7 | Resend wiring audit script | new mjs | 0 | 1 |
| 8 | Final verification | none | 0 | 0 (push only) |

**Total:** 6 new tests, 7 commits, ~2 hours dev + ~30 min ops verification (matches spec scope).

**Deferred to backlog (per spec non-goals):**
- Clerk-authed checkout lead-linking (shared helper across `if (!clerkUserId)` branches).
- Retroactive cleanup of orphan leads (one-shot SQL, founder-owned).
- PostHog metric distinguishing linkage path (`email` vs `anonymous_id` vs `utm_content`).
- Programmatic Resend webhook configuration (manual Dashboard step remains).
