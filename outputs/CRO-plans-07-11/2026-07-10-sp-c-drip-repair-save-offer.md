# SP-C — Drip Engine Repair & Trial-End Save Offer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the four verified drip-engine defects (bounce webhook parses fields that don't exist; welcome sender false-positives + 23505-collides on success; drip links carry no utm_medium/content/term; synastry_teaser drives 6/10 lifetime unsubs) and ship the env-gated SAVE50 trial-end save offer (50% off, T-1d reminder + trial_ended win-back, coupon applied by URL).

**Architecture:** Five independent repair tracks over existing modules — the Resend webhook (`src/app/api/webhooks/resend/`), the `sent_emails` dedup lib + welcome sender (`src/shared/lib/sent-emails.ts`, `email.ts`), UTM construction in the 7 drip senders + cart-abandon (`email.ts`), the lead-nurture step table (`src/app/api/cron/lead-nurture/route.ts`), and the trial-expiration sender + two templates (`src/shared/lib/trial-expiration-email.ts`, `src/emails/TrialReminder1dEmail.tsx`, `TrialEndedEmail.tsx`) — plus one new gated Stripe ops script. No new services, **no DB schema changes** (the `lead_synastry_teaser` enum value and all indexes stay — rows exist). Spec: `docs/superpowers/specs/2026-07-10-sp-c-drip-repair-save-offer-design.md`.

**Tech Stack:** Next.js 16 (App Router), TypeScript strict, Drizzle ORM + Neon, Resend SDK v6 (`resend@^6.10.0`, svix webhook verification), Stripe, React Email (`@react-email/render`), Vitest.

## Global Constraints

- Email copy lives inline in each template's `STRINGS = { en, es }` object (`src/emails/*.tsx`) — `messages/en.json` / `messages/es.json` are NOT touched by this plan (no app-UI strings change).
- ES copy = español neutro LATAM, `tú` form; sign names untranslated; percent style matches existing email subjects (`"20% de desc."` — no space before `%`).
- Webhooks never log raw errors or email addresses (PII rule) — log `{ message }`, counts, and event types only. Non-fatal side-effects use try/catch + `console.error` and must not 500-loop Resend retries.
- Resend SDK v6: `idempotencyKey` is the SECOND argument to `emails.send(payload, { idempotencyKey })` — keep that shape everywhere.
- Prod-mutating scripts are dry-run by default with `--apply` gate (house convention: `const APPLY = process.argv.includes('--apply')`). The SAVE50 Stripe coupon is created by a GATED script (Task 7) — **never run `--apply` during implementation**; the founder runs it at deploy time (Task 10).
- Never run `npm run db:migrate` against prod (journal drift 0013–0017). Irrelevant here — this plan ships zero migrations.
- Tests: `npx vitest run <path>` for single files; full gate = `npx vitest run` + `npm run typecheck` + `npm run lint` (lint: ignore `.claude/worktrees/**` noise). All new tests in this plan run in the default node environment — no `// @vitest-environment jsdom` pragma needed (no DOM rendering; React Email renders to strings).
- Commit style: `fix(sp-c/T<n>): ...` / `feat(sp-c/T<n>): ...` / `test(sp-c/T<n>): ...` / `chore(sp-c/T<n>): ...`.
- UTM contract (D3, non-negotiable): `utm_content` = the 21-char leadId — the Stripe webhook lead-link fallback (`src/app/api/webhooks/stripe/route.ts:289-291`) regex-matches `/^[A-Za-z0-9_-]{21}$/` against it. NEVER put template names in `utm_content`; templates go in `utm_term`.
- Cross-plan (SP-A): SP-A lands first and inserts ~50 lines into `email.ts` (import, `SUBJECTS.paid_onboarding`, `sendPaidOnboardingEmail` after `sendPurchaseConfirmationEmail`) and ~5 into `schema.ts` — resolve all `email.ts`/`schema.ts` refs by symbol name, not line number.
- Cross-plan (SP-F): `TRIAL_WINBACK_COUPON_CODE` is dead after T8 — do not document it in `.env.example` (SP-F coordination).

---

### Task 1: Resend webhook — real SDK payload shape + Permanent-only suppression policy (D1)

**Files:**
- Modify: `src/app/api/webhooks/resend/route.ts` (event interfaces :24-39; handler section 4 :96-168; header doc :1-10)
- Test: `src/app/api/webhooks/resend/__tests__/route.test.ts` (FULL REWRITE — the current file encodes the wrong payload shape at lines 89, 138, 156, 173 and self-confirms the bug)

**Interfaces:**
- Consumes: `getDb()` from `@/shared/lib/db`; `users`, `emailLeads` from `@/shared/lib/schema`; `eq`, `sql` from `drizzle-orm` (add `sql` to the existing import); svix `Webhook` verification (UNCHANGED — :41-91 stays byte-identical).
- Produces: on `email.bounced` with `data.bounce.type === 'Permanent'` → `users.emailUndeliverable = true` + `emailLeads.emailUndeliverable = true` for every address in `data.to[]` (lowercased, `lower()` match on users so stored-case never misses). `Transient`/`Undetermined`/missing → log only. `email.complained` → same iteration, leads additionally get `unsubscribedAt`. Per-address failures isolated; ALL-addresses-failed → 500 (Resend retries).
- SDK ground truth (cite in code comment): `node_modules/resend/dist/index.d.mts` — `BaseEmailEventData` has `to: string[]` (no `email` field); `EmailBouncedEvent.data = BaseEmailEventData & { bounce: EmailBounce }` where `EmailBounce = { message: string; subType: string; type: string }`. Live values observed: `Permanent | Transient | Undetermined` (audit `outputs/cro-audit-2026-07-10/04-resend.md:59`).

- [ ] **Step 1: Rewrite the test file with real-shape fixtures**

Replace the ENTIRE contents of `src/app/api/webhooks/resend/__tests__/route.test.ts` with:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoist mocks before imports
// ---------------------------------------------------------------------------
const dbUpdateMock = vi.hoisted(() => vi.fn());
vi.mock('@/shared/lib/db', () => ({
  getDb: () => ({ update: dbUpdateMock }),
}));

const verifyMock = vi.hoisted(() => vi.fn());
vi.mock('svix', () => ({
  // Regular function (not arrow) so `new Webhook()` works as a constructor
  Webhook: vi.fn(function MockWebhook() {
    return { verify: verifyMock };
  }),
}));

// next/headers mock — provide the svix headers the route reads
const headersMock = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  headers: headersMock,
}));

// ---------------------------------------------------------------------------
// Import after mocks are registered
// ---------------------------------------------------------------------------
import { POST } from '../route';

// Helper: build a standard POST request with svix headers
function makeResendRequest(body = '{}'): Request {
  return new Request('http://localhost/api/webhooks/resend', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'svix-id': 'msg_test_id',
      'svix-timestamp': '1234567890',
      'svix-signature': 'v1,test_signature',
    },
    body,
  });
}

// Configure headers() mock to return the expected svix headers
function mockHeaders() {
  const map = new Map([
    ['svix-id', 'msg_test_id'],
    ['svix-timestamp', '1234567890'],
    ['svix-signature', 'v1,test_signature'],
  ]);
  headersMock.mockResolvedValue({ get: (k: string) => map.get(k) ?? null });
}

// REAL Resend payload shape — matches resend@6.10.0 SDK types
// (node_modules/resend/dist/index.d.mts: BaseEmailEventData.to: string[],
// EmailBouncedEvent.data.bounce: { message, subType, type }). The pre-2026-07-10
// version of this file used a fictional { email, bounce_type } shape that made
// the handler a permanent no-op in prod (audit 04-resend.md R-2).
function bouncedEvent(to: string[], bounceType: string) {
  return {
    type: 'email.bounced',
    created_at: '2026-07-10T12:00:00.000Z',
    data: {
      created_at: '2026-07-10T12:00:00.000Z',
      email_id: 'ae2014de-c168-4c61-8f4b-1f4e2f3a1b2c',
      from: 'Estrevia <hello@estrevia.app>',
      to,
      subject: 'Your sidereal chart',
      bounce: {
        message: 'smtp; 550 5.1.1 user unknown',
        subType: 'General',
        type: bounceType,
      },
    },
  };
}

function complainedEvent(to: string[]) {
  return {
    type: 'email.complained',
    created_at: '2026-07-10T12:00:00.000Z',
    data: {
      created_at: '2026-07-10T12:00:00.000Z',
      email_id: 'ae2014de-c168-4c61-8f4b-1f4e2f3a1b2c',
      from: 'Estrevia <hello@estrevia.app>',
      to,
      subject: 'Your sidereal chart',
    },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('RESEND_WEBHOOK_SECRET', 'test-resend-secret');
  mockHeaders();
  // Default db.update chain: update().set().where() → resolves
  dbUpdateMock.mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  });
});

describe('POST /api/webhooks/resend', () => {
  it('returns 401 on bad signature', async () => {
    verifyMock.mockImplementation(() => {
      throw new Error('Invalid signature');
    });

    const res = await POST(makeResendRequest());
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe('UNAUTHORIZED');
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });

  it('Permanent bounce flags users AND email_leads (single recipient)', async () => {
    verifyMock.mockReturnValue(bouncedEvent(['bounced@example.com'], 'Permanent'));

    const res = await POST(makeResendRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.received).toBe(true);
    // Two UPDATEs per recipient: users, then email_leads
    expect(dbUpdateMock).toHaveBeenCalledTimes(2);
    const usersSet = dbUpdateMock.mock.results[0].value.set;
    const leadsSet = dbUpdateMock.mock.results[1].value.set;
    expect(usersSet).toHaveBeenCalledWith({ emailUndeliverable: true });
    expect(leadsSet).toHaveBeenCalledWith({ emailUndeliverable: true });
  });

  it('Permanent bounce iterates data.to[] — every recipient gets flagged', async () => {
    verifyMock.mockReturnValue(
      bouncedEvent(['first@example.com', 'Second@Example.COM'], 'Permanent'),
    );

    const res = await POST(makeResendRequest());
    expect(res.status).toBe(200);
    // 2 recipients × (users + email_leads) = 4 UPDATEs
    expect(dbUpdateMock).toHaveBeenCalledTimes(4);
  });

  it('Transient bounce is log-only (no DB write)', async () => {
    verifyMock.mockReturnValue(bouncedEvent(['soft@example.com'], 'Transient'));

    const res = await POST(makeResendRequest());
    expect(res.status).toBe(200);
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });

  it('Undetermined bounce is log-only (no DB write)', async () => {
    verifyMock.mockReturnValue(bouncedEvent(['maybe@example.com'], 'Undetermined'));

    const res = await POST(makeResendRequest());
    expect(res.status).toBe(200);
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });

  it('REGRESSION: old fictional payload shape must NOT flag anything and must not 500', async () => {
    // The shape this handler (and its tests) wrongly assumed before 2026-07-10.
    verifyMock.mockReturnValue({
      type: 'email.bounced',
      data: { email: 'bounced@example.com', bounce_type: 'hard' },
    });

    const res = await POST(makeResendRequest());
    expect(res.status).toBe(200);
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });

  it('complaint flags users + unsubscribes lead for every recipient', async () => {
    verifyMock.mockReturnValue(complainedEvent(['complained@example.com']));

    const res = await POST(makeResendRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.received).toBe(true);
    expect(dbUpdateMock).toHaveBeenCalledTimes(2);
    const usersSet = dbUpdateMock.mock.results[0].value.set;
    const leadsSet = dbUpdateMock.mock.results[1].value.set;
    expect(usersSet).toHaveBeenCalledWith({ emailUndeliverable: true });
    expect(leadsSet).toHaveBeenCalledWith(
      expect.objectContaining({
        emailUndeliverable: true,
        unsubscribedAt: expect.any(Date),
      }),
    );
  });

  it('per-address failure is isolated — other recipients still get flagged, 200', async () => {
    verifyMock.mockReturnValue(
      bouncedEvent(['dead-row@example.com', 'fine@example.com'], 'Permanent'),
    );
    // 1st update (users, recipient 1) rejects → its leads update is skipped;
    // recipient 2 proceeds (calls 2 and 3 succeed).
    let callIdx = 0;
    dbUpdateMock.mockImplementation(() => {
      callIdx += 1;
      const rejects = callIdx === 1;
      return {
        set: vi.fn().mockReturnValue({
          where: rejects
            ? vi.fn().mockRejectedValue(new Error('row lock timeout'))
            : vi.fn().mockResolvedValue(undefined),
        }),
      };
    });

    const res = await POST(makeResendRequest());
    expect(res.status).toBe(200);
    expect(dbUpdateMock).toHaveBeenCalledTimes(3);
  });

  it('ALL addresses failing returns 500 so Resend retries', async () => {
    verifyMock.mockReturnValue(
      bouncedEvent(['a@example.com', 'b@example.com'], 'Permanent'),
    );
    dbUpdateMock.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockRejectedValue(new Error('db down')),
      }),
    });

    const res = await POST(makeResendRequest());
    expect(res.status).toBe(500);
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run src/app/api/webhooks/resend/__tests__/route.test.ts`
Expected: FAIL — the real-shape fixtures have no `data.bounce_type`/`data.email`, so the current handler writes 0 updates on `Permanent` ("flags users AND email_leads" and the complaint/multi-recipient/isolation tests all fail). The 401 and Transient tests pass.

- [ ] **Step 3: Implement — rewrite types + handler section 4**

In `src/app/api/webhooks/resend/route.ts`:

1. Header doc (lines 4-6) — replace:

```ts
 * Receives Resend bounce and complaint events via svix-signed webhooks.
 * On Permanent bounce or complaint → sets email_undeliverable = true on
 * BOTH users and email_leads for every address in data.to[]. Transient /
 * Undetermined bounces are log-only (transient failure, do not suppress).
```

2. Add `sql` to the drizzle import (line 15): `import { eq, sql } from 'drizzle-orm';`

3. Replace the event interfaces (lines 21-39) with:

```ts
// ---------------------------------------------------------------------------
// Resend webhook event types (only the ones we handle).
// Shape matches the installed SDK — resend@6.10.0, node_modules/resend/dist/
// index.d.mts: BaseEmailEventData carries `to: string[]` (there is NO
// `data.email` field) and EmailBouncedEvent adds `bounce: { message, subType,
// type }`. Live bounce.type values: Permanent | Transient | Undetermined —
// NOT the 'hard'/'soft' shape this file assumed before 2026-07-10, which made
// suppression a permanent no-op (CRO audit 04-resend.md R-2).
// ---------------------------------------------------------------------------
interface ResendEmailEventData {
  created_at: string;
  email_id: string;
  from: string;
  to: string[];
  subject: string;
}

interface ResendBouncedEvent {
  type: 'email.bounced';
  created_at: string;
  data: ResendEmailEventData & {
    bounce: { message: string; subType: string; type: string };
  };
}

interface ResendComplainedEvent {
  type: 'email.complained';
  created_at: string;
  data: ResendEmailEventData;
}

type ResendEvent = ResendBouncedEvent | ResendComplainedEvent | { type: string; data: unknown };
```

4. Replace handler section 4 — lines 96-158, i.e. the whole `try { const db = getDb(); ... }` block through AND INCLUDING the existing `} catch (err) {` line (the replacement block below ends with that same line); the existing catch BODY (lines 159-168) and the final return stay unchanged — with:

```ts
  try {
    const db = getDb();

    if (evt.type === 'email.bounced') {
      // Defensive: verify() output is only cast, never validated — treat every
      // field as possibly absent (legacy/foreign payloads must not 500-loop).
      const data = (evt as ResendBouncedEvent).data as
        | Partial<ResendBouncedEvent['data']>
        | undefined;
      const bounceType = data?.bounce?.type;
      const recipients = Array.isArray(data?.to) ? data.to : [];

      if (bounceType === 'Permanent') {
        // Hard (permanent) bounce → suppress every recipient on BOTH tables.
        // lower() match on users so stored-case never misses; leads are stored
        // normalized lowercase in /api/v1/leads. Per-address failures are
        // isolated so one bad row doesn't block the rest; if ALL addresses
        // fail we rethrow → 500 → Resend retries the whole event.
        let failedCount = 0;
        let firstErr: unknown = null;
        for (const recipient of recipients) {
          const email = recipient.toLowerCase();
          try {
            await db
              .update(users)
              .set({ emailUndeliverable: true })
              .where(sql`lower(${users.email}) = ${email}`);
            await db
              .update(emailLeads)
              .set({ emailUndeliverable: true })
              .where(eq(emailLeads.email, email));
          } catch (addrErr) {
            failedCount += 1;
            firstErr ??= addrErr;
            // Log message only — never the email address (PII)
            console.error('[resend-webhook] bounce suppression failed for one recipient (isolated)', {
              message: addrErr instanceof Error ? addrErr.message : 'unknown',
            });
          }
        }
        if (recipients.length > 0 && failedCount === recipients.length) throw firstErr;
        console.info('[resend-webhook] permanent bounce → emailUndeliverable=true', {
          recipients: recipients.length,
          failed: failedCount,
        });
      } else {
        // Transient / Undetermined (or malformed payload): log only, no DB
        // write. Revisit the Undetermined policy if volume shows up in logs.
        console.info('[resend-webhook] non-permanent bounce ignored', {
          bounceType: bounceType ?? 'missing',
        });
      }
    } else if (evt.type === 'email.complained') {
      const data = (evt as ResendComplainedEvent).data as
        | Partial<ResendComplainedEvent['data']>
        | undefined;
      const recipients = Array.isArray(data?.to) ? data.to : [];

      // Complaint is stronger than a bounce: the recipient marked us as spam.
      // Flag undeliverable on users AND both flag + unsubscribe the lead so a
      // re-submitted email stays out of the drip. Same per-address isolation
      // as the bounce path.
      let failedCount = 0;
      let firstErr: unknown = null;
      for (const recipient of recipients) {
        const email = recipient.toLowerCase();
        try {
          await db
            .update(users)
            .set({ emailUndeliverable: true })
            .where(sql`lower(${users.email}) = ${email}`);
          await db
            .update(emailLeads)
            .set({ emailUndeliverable: true, unsubscribedAt: new Date() })
            .where(eq(emailLeads.email, email));
        } catch (addrErr) {
          failedCount += 1;
          firstErr ??= addrErr;
          console.error('[resend-webhook] complaint suppression failed for one recipient (isolated)', {
            message: addrErr instanceof Error ? addrErr.message : 'unknown',
          });
        }
      }
      if (recipients.length > 0 && failedCount === recipients.length) throw firstErr;
      console.info('[resend-webhook] complaint → unsubscribed + emailUndeliverable=true', {
        recipients: recipients.length,
        failed: failedCount,
      });
    }
    // Unknown event types are silently accepted (forward-compatible)
  } catch (err) {
```

(The existing `catch (err)` body — `console.error('[resend-webhook] DB operation failed', ...)` + 500 response — and the final `return NextResponse.json({ received: true }, { status: 200 });` are unchanged.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/api/webhooks/resend/__tests__/route.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/webhooks/resend/route.ts src/app/api/webhooks/resend/__tests__/route.test.ts
git commit -m "fix(sp-c/T1): Resend webhook parses real SDK payload — Permanent bounces finally flag undeliverable"
```

---

### Task 2: sent-emails.ts — claim/update pattern for `welcome` (D2 lib)

**Files:**
- Modify: `src/shared/lib/sent-emails.ts` (add `tryInsertOneShotUser` + `recordSentUpdate`; narrow `tryInsertOneShot` to `'account_deletion'`)
- Test: `src/shared/lib/__tests__/sent-emails.test.ts` (extend; retype existing `tryInsertOneShot` tests)

**Interfaces:**
- Produces: `tryInsertOneShotUser(userId: string, emailType: 'welcome'): Promise<'new' | 'retry' | 'delivered'>` and `recordSentUpdate(userId: string, emailType: 'welcome', resendMessageId: string | null): Promise<void>` — mirrors `sent-lead-emails.ts:35-93` exactly (claim inserts a NULL-msgid row; success path UPDATEs it — a second INSERT collides with the one-shot partial unique index `sent_emails_oneshot_idx` at `schema.ts:484-486` and raises 23505). Consumed by Task 3.
- Deliberately NOT converted: `account_deletion` stays on the boolean `tryInsertOneShot` — that flow never records a message id (the user row cascade-deletes right after, `email.ts:283`), so a claim-based 'retry' would re-send on EVERY call. Narrowing `tryInsertOneShot`'s param type to `'account_deletion'` makes the split compiler-enforced.

- [ ] **Step 1: Write the failing tests**

In `src/shared/lib/__tests__/sent-emails.test.ts`:

1. Add `update: vi.fn(),` to the hoisted `mockDb` object (line 4-7 block becomes `{ insert: vi.fn(), select: vi.fn(), update: vi.fn() }`).
2. Line 2: extend the import to `import { tryInsertOneShot, tryInsertOneShotUser, recordSentUpdate, wasSentWithin, recordSent } from '../sent-emails';`
3. In the two existing `tryInsertOneShot` tests (lines 23 and 34), change `'welcome'` → `'account_deletion'` (the param type narrows in Step 3).
4. Append:

```ts
describe('tryInsertOneShotUser (claim/update pattern — welcome)', () => {
  it("returns 'new' on first insert", async () => {
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 1 }]),
        }),
      }),
    });
    const result = await tryInsertOneShotUser('user_abc', 'welcome');
    expect(result).toBe('new');
  });

  it("returns 'retry' on conflict when the existing row has a NULL msgid", async () => {
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ resendMessageId: null }]),
        }),
      }),
    });
    expect(await tryInsertOneShotUser('user_abc', 'welcome')).toBe('retry');
  });

  it("returns 'delivered' on conflict when the msgid is populated", async () => {
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ resendMessageId: 'rsnd_prior' }]),
        }),
      }),
    });
    expect(await tryInsertOneShotUser('user_abc', 'welcome')).toBe('delivered');
  });
});

describe('recordSentUpdate', () => {
  it('UPDATEs the claimed row with the message id (never a second INSERT)', async () => {
    const whereMock = vi.fn().mockResolvedValue(undefined);
    const setMock = vi.fn().mockReturnValue({ where: whereMock });
    mockDb.update.mockReturnValue({ set: setMock });
    await recordSentUpdate('user_abc', 'welcome', 'rsnd_new');
    expect(setMock).toHaveBeenCalledWith({ resendMessageId: 'rsnd_new' });
    expect(whereMock).toHaveBeenCalled();
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('no-ops on null msgid (claim row stays NULL → next claim returns retry)', async () => {
    await recordSentUpdate('user_abc', 'welcome', null);
    expect(mockDb.update).not.toHaveBeenCalled();
  });
});
```

(The `recordSent` import addition keeps the file compiling — it was already imported at line 2; keep `recordSent` in the list.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/shared/lib/__tests__/sent-emails.test.ts`
Expected: FAIL — `tryInsertOneShotUser`/`recordSentUpdate` are not exported.

- [ ] **Step 3: Implement**

In `src/shared/lib/sent-emails.ts`:

1. Extend the doc comment + narrow `tryInsertOneShot`. Replace lines 8-20 — the comment block and signature, through and including the `): Promise<boolean> {` line — keeping the existing body from line 21:

```ts
/**
 * Inserts a one-shot dedup row. Returns true if inserted, false on UNIQUE conflict
 * (caller should skip sending in that case).
 *
 * account_deletion ONLY: that flow intentionally never records a message id
 * (the user row cascade-deletes right after the send), so the claim/update
 * pattern below would classify it as 'retry' forever and re-send on every
 * call. `welcome` uses tryInsertOneShotUser instead.
 *
 * For repeatable types (re_engagement_28d, etc.) use wasSentWithin + recordSent.
 */
export async function tryInsertOneShot(
  userId: string,
  emailType: 'account_deletion',
): Promise<boolean> {
```

2. Append after `recordSent` (line 37):

```ts
/**
 * Result of claiming the one-shot `welcome` send slot.
 * Mirrors sent-lead-emails.ts LeadEmailClaim — see that file for the full
 * rationale. Without 'retry', a Resend rejection after the dedup-row insert
 * cements the user at "already sent" forever with a NULL resend_message_id
 * (the exact false-positive the 2026-07-10 audit found on welcome rows).
 */
export type UserEmailClaim = 'new' | 'retry' | 'delivered';

/**
 * Claims the one-shot send slot for `welcome` (covered by the partial UNIQUE
 * index sent_emails_oneshot_idx). On conflict, cross-checks resend_message_id:
 * NULL → 'retry' (prior attempt claimed the slot but never delivered);
 * populated → 'delivered' (skip send).
 */
export async function tryInsertOneShotUser(
  userId: string,
  emailType: 'welcome',
): Promise<UserEmailClaim> {
  const db = getDb();
  const inserted = await db
    .insert(sentEmails)
    .values({ userId, emailType })
    .onConflictDoNothing()
    .returning();
  if (inserted.length > 0) return 'new';

  const existing = await db
    .select({ resendMessageId: sentEmails.resendMessageId })
    .from(sentEmails)
    .where(and(eq(sentEmails.userId, userId), eq(sentEmails.emailType, emailType)))
    .limit(1);
  return existing[0]?.resendMessageId ? 'delivered' : 'retry';
}

/**
 * Records the Resend message id on the row claimed by tryInsertOneShotUser.
 * UPDATEs in place — a second INSERT would collide with the one-shot partial
 * unique index (sent_emails_oneshot_idx) and raise 23505, which is why
 * successful welcome sends never carried a msgid before 2026-07-10.
 */
export async function recordSentUpdate(
  userId: string,
  emailType: 'welcome',
  resendMessageId: string | null,
): Promise<void> {
  if (!resendMessageId) return;
  const db = getDb();
  await db
    .update(sentEmails)
    .set({ resendMessageId })
    .where(and(eq(sentEmails.userId, userId), eq(sentEmails.emailType, emailType)));
}
```

(`and`, `eq` are already imported at line 2 — no import change.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/shared/lib/__tests__/sent-emails.test.ts`
Expected: PASS (9 tests). Note: `npm run typecheck` would fail HERE because `email.ts:149` still calls `tryInsertOneShot(params.userId, 'welcome')` — Task 3 fixes that immediately; do not run the full gate between T2 and T3.

- [ ] **Step 5: Commit**

```bash
git add src/shared/lib/sent-emails.ts src/shared/lib/__tests__/sent-emails.test.ts
git commit -m "feat(sp-c/T2): claim/update one-shot pattern for sent_emails welcome (tryInsertOneShotUser + recordSentUpdate)"
```

---

### Task 3: sendWelcomeEmail — throw on Resend error + UPDATE the claimed row (D2 sender)

**Files:**
- Modify: `src/shared/lib/email.ts` (import line 22; `sendWelcomeEmail` :142-181)
- Test: Create `src/shared/lib/__tests__/email-welcome.test.ts`

**Interfaces:**
- Consumes: `tryInsertOneShotUser`, `recordSentUpdate` from Task 2 (`./sent-emails`).
- Produces: `sendWelcomeEmail` signature UNCHANGED (`Promise<{ sent: boolean; reason?: string }>`). Behavior: 'delivered' claim → `{ sent: false, reason: 'already_sent' }`; Resend `result.error` → throws (caller `src/app/api/webhooks/clerk/route.ts:180-208` already wraps in try/catch + Sentry — non-fatal to the webhook); success → row UPDATEd with msgid (no 23505).

- [ ] **Step 1: Write the failing tests**

```ts
// src/shared/lib/__tests__/email-welcome.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

type ResendResult =
  | { data: { id: string }; error: null }
  | { data: null; error: { name: string; message: string } };
const resendSendMock = vi.fn<
  (
    _payload: Record<string, unknown>,
    _opts?: Record<string, unknown>,
  ) => Promise<ResendResult>
>(async () => ({
  data: { id: 'resend_msg_w1' },
  error: null,
}));
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: resendSendMock };
  },
}));

const claimUserMock = vi.fn(async () => 'new' as 'new' | 'retry' | 'delivered');
const recordUpdateMock = vi.fn(async () => undefined);
const tryInsertOneShotMock = vi.fn(async () => true);
const recordSentMock = vi.fn(async () => undefined);
vi.mock('@/shared/lib/sent-emails', () => ({
  tryInsertOneShot: tryInsertOneShotMock,
  recordSent: recordSentMock,
  tryInsertOneShotUser: claimUserMock,
  recordSentUpdate: recordUpdateMock,
  wasSentWithin: vi.fn(async () => false),
}));

vi.mock('@/shared/lib/unsubscribe-token', () => ({
  signUnsubscribeToken: vi.fn(async (id: string) => `tok_${id}`),
  signLeadUnsubscribeToken: vi.fn(async (id: string) => `tok_${id}`),
}));

vi.mock('@/shared/lib/analytics', () => ({
  trackServerEvent: vi.fn(),
  AnalyticsEvent: {
    PAYWALL_TEASER_EMAIL_SENT: 'paywall_teaser_email_sent',
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  claimUserMock.mockResolvedValue('new');
  resendSendMock.mockResolvedValue({ data: { id: 'resend_msg_w1' }, error: null });
  vi.stubEnv('RESEND_API_KEY', 're_test_key_aaaaaaaaaaaaaaaaaa');
});

const baseParams = {
  userId: 'user_w1',
  email: 'welcome@example.com',
  locale: 'en' as const,
  hasSavedChart: false,
};

describe('sendWelcomeEmail (claim/update pattern)', () => {
  it('success: sends, then UPDATEs the claimed row with the msgid (no second INSERT)', async () => {
    const { sendWelcomeEmail } = await import('../email');
    const res = await sendWelcomeEmail(baseParams);
    expect(res).toEqual({ sent: true });
    expect(claimUserMock).toHaveBeenCalledWith('user_w1', 'welcome');
    expect(resendSendMock).toHaveBeenCalledTimes(1);
    expect(recordUpdateMock).toHaveBeenCalledWith('user_w1', 'welcome', 'resend_msg_w1');
    // The old path INSERTed a colliding second row via recordSent — must be gone.
    expect(recordSentMock).not.toHaveBeenCalled();
  });

  it("'delivered' claim → already_sent, no Resend call", async () => {
    claimUserMock.mockResolvedValueOnce('delivered');
    const { sendWelcomeEmail } = await import('../email');
    const res = await sendWelcomeEmail(baseParams);
    expect(res).toEqual({ sent: false, reason: 'already_sent' });
    expect(resendSendMock).not.toHaveBeenCalled();
  });

  it("'retry' claim → proceeds with the send (prior attempt failed pre-delivery)", async () => {
    claimUserMock.mockResolvedValueOnce('retry');
    const { sendWelcomeEmail } = await import('../email');
    const res = await sendWelcomeEmail(baseParams);
    expect(res).toEqual({ sent: true });
    expect(resendSendMock).toHaveBeenCalledTimes(1);
  });

  it('Resend error → throws, never returns a false-positive sent:true', async () => {
    resendSendMock.mockResolvedValueOnce({
      data: null,
      error: { name: 'validation_error', message: 'Invalid To address' },
    });
    const { sendWelcomeEmail } = await import('../email');
    await expect(sendWelcomeEmail(baseParams)).rejects.toThrow(
      /Resend rejected welcome/,
    );
    // Claim row keeps its NULL msgid → the next call classifies as 'retry'.
    expect(recordUpdateMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/shared/lib/__tests__/email-welcome.test.ts`
Expected: FAIL — first test: `recordSentMock` WAS called (old INSERT path) and `recordUpdateMock` never called; 'delivered' test fails too — the old path consults the boolean `tryInsertOneShot` mock (which returns `true`), so it sends and resolves `{ sent: true }` instead of `{ sent: false, reason: 'already_sent' }`; the Resend-error test fails for the same result-shape reason — the old path never checks `result.error` and resolves `{ sent: true }` instead of throwing. (The 'retry' test passes by accident of the boolean mock.)

- [ ] **Step 3: Implement**

In `src/shared/lib/email.ts`:

1. Extend the existing `./sent-emails` import on line 22 with `tryInsertOneShotUser, recordSentUpdate` — keep ALL existing named imports (including `wasSentWithin`, added by SP-A T4). Do not paste a full replacement line; add the two new symbols to whatever the import currently contains.
2. Replace the body of `sendWelcomeEmail` (lines 148-180):

```ts
  // 1. DB-layer dedup — claim/update pattern (mirrors sent-lead-emails).
  // 'delivered' = a prior send recorded a Resend message id; 'retry' = a prior
  // attempt claimed the slot but never delivered (msgid NULL) — safe to retry.
  const claim = await tryInsertOneShotUser(params.userId, 'welcome');
  if (claim === 'delivered') return { sent: false, reason: 'already_sent' };

  // 2. Render
  const html = await render(
    WelcomeEmail({ locale: params.locale, hasSavedChart: params.hasSavedChart }),
  );
  const text = await render(
    WelcomeEmail({ locale: params.locale, hasSavedChart: params.hasSavedChart }),
    { plainText: true },
  );

  // 3. Send (Resend idempotencyKey = belt-and-suspenders; passed as second arg in SDK v6)
  const result = await getResend().emails.send(
    {
      from: FROM_ADDRESS,
      to: params.email,
      subject: SUBJECTS.welcome[params.locale],
      html,
      text,
      headers: {
        'List-Unsubscribe': `<${SETTINGS_URL(params.locale)}>`,
      },
    },
    { idempotencyKey: `${params.userId}:welcome` },
  );

  // Throw on rejection so the caller's try/catch surfaces via Sentry and the
  // claim row keeps its NULL msgid ('retry' next time) — no false "sent".
  if (result.error) {
    throw new Error(
      `Resend rejected welcome for ${params.userId}: ${result.error.message ?? 'unknown'}`,
    );
  }

  // 4. UPDATE the claimed row with the message id. An INSERT here collides
  // with sent_emails_oneshot_idx (partial UNIQUE on welcome) → 23505.
  await recordSentUpdate(params.userId, 'welcome', result.data?.id ?? null);
  return { sent: true };
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run src/shared/lib/__tests__/email-welcome.test.ts src/shared/lib/__tests__/sent-emails.test.ts src/app/api/webhooks/clerk/__tests__/route.test.ts && npm run typecheck`
Expected: PASS — clerk webhook tests mock `sendWelcomeEmail` wholesale (route.test.ts:26), so its rejection path is already covered by their "welcome email failed (non-fatal)" test; typecheck now clean (the `'welcome'` boolean-path call is gone).

- [ ] **Step 5: Commit**

```bash
git add src/shared/lib/email.ts src/shared/lib/__tests__/email-welcome.test.ts
git commit -m "fix(sp-c/T3): sendWelcomeEmail — throw on Resend error + UPDATE msgid (no 23505, no false sent)"
```

---

### Task 4: Drip links carry utm_medium / utm_content=leadId / utm_term=template (D3)

**Files:**
- Modify: `src/shared/lib/email.ts` (new `dripUtm` helper after `SETTINGS_URL` :136-137; URL lines 434-436, 508-510, 598-600, 685, 814-816, 878-880, 955, 1037)
- Test: Create `src/shared/lib/__tests__/email-drip-utm.test.ts`

**Interfaces:**
- Produces: private helper `dripUtm(campaign: string, leadId: string, template: string): string` returning `utm_source=lead-nurture&utm_medium=email&utm_campaign=<campaign>&utm_content=<leadId>&utm_term=<template>`. All 7 drip senders use it; cart-abandon keeps its own source/campaign and appends `utm_content`/`utm_term` inline. `utm_term` values = the `sent_lead_emails.email_type` names (`lead_chart`, `lead_curiosity_hook`, `lead_moon_asc`, `lead_paywall_teaser`, `lead_saturn_weekly`, `lead_mini_reading`, `lead_synastry_teaser`) + `cart_abandon` — directly joinable against the sends table. `utm_campaign` keeps the existing step names (t0/t1h/t24h/t72/t7d/t14d/t21d) so historic dashboards keep working.
- Downstream (no changes needed, verify only): checkout API already accepts + forwards `utm_content`/`utm_term`/`utm_medium` (`checkout/route.ts:41-45` → session metadata); Stripe webhook lead-link fallback regex-matches the 21-char leadId in `utm_content` (`webhooks/stripe/route.ts:289-291`) — this scheme REPAIRS that fallback for drip traffic instead of disabling it.

- [ ] **Step 1: Write the failing tests**

```ts
// src/shared/lib/__tests__/email-drip-utm.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock harness mirrors email-lead.test.ts, plus cart-abandon's dedup module.
type ResendResult =
  | { data: { id: string }; error: null }
  | { data: null; error: { name: string; message: string } };
const resendSendMock = vi.fn<
  (
    _payload: Record<string, unknown>,
    _opts?: Record<string, unknown>,
  ) => Promise<ResendResult>
>(async () => ({
  data: { id: 'resend_msg_utm' },
  error: null,
}));
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: resendSendMock };
  },
}));

const tryInsertMock = vi.fn(async () => 'new' as 'new' | 'retry' | 'delivered');
const recordSentMock = vi.fn(async () => undefined);
vi.mock('@/shared/lib/sent-lead-emails', () => ({
  tryInsertOneShotLead: tryInsertMock,
  recordSentLead: recordSentMock,
}));

vi.mock('@/shared/lib/sent-cart-abandon-emails', () => ({
  hasCartAbandonSentRecently: vi.fn(async () => false),
  recordCartAbandonSent: vi.fn(async () => undefined),
}));

vi.mock('@/shared/lib/unsubscribe-token', () => ({
  signLeadUnsubscribeToken: vi.fn(async (id: string) => `tok_${id}`),
  signUnsubscribeToken: vi.fn(async (id: string) => `tok_${id}`),
}));

vi.mock('@/shared/lib/analytics', () => ({
  trackServerEvent: vi.fn(),
  AnalyticsEvent: {
    PAYWALL_TEASER_EMAIL_SENT: 'paywall_teaser_email_sent',
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  tryInsertMock.mockResolvedValue('new');
  resendSendMock.mockResolvedValue({ data: { id: 'resend_msg_utm' }, error: null });
  vi.stubEnv('RESEND_API_KEY', 're_test_key_aaaaaaaaaaaaaaaaaa');
});

const sampleChart = {
  planets: [
    { planet: 'Sun', sign: 'Capricorn', signDegree: 12.5 },
    { planet: 'Moon', sign: 'Pisces', signDegree: 3.2 },
  ],
  houses: [{ sign: 'Leo', cusp: 0 }],
} as const;

// 21 chars — must survive intact so the Stripe webhook lead-link fallback
// (/^[A-Za-z0-9_-]{21}$/ against utm_content) keeps matching.
const LEAD_ID = 'utmlead_aaaabbbbccccd';

const leadParams = {
  leadId: LEAD_ID,
  email: 'utm@example.com',
  locale: 'en' as const,
  chart: sampleChart as never,
  chartId: 'chart_utm',
};

function sentHtml(): string {
  const callArgs = resendSendMock.mock.calls[0][0] as Record<string, unknown>;
  return callArgs.html as string;
}

function expectUtm(html: string, campaign: string, template: string) {
  expect(html).toContain('utm_medium=email');
  expect(html).toContain(`utm_content=${LEAD_ID}`);
  expect(html).toContain(`utm_term=${template}`);
  expect(html).toContain(`utm_campaign=${campaign}`);
}

describe('drip CTA links carry utm_medium + utm_content=leadId + utm_term=template', () => {
  it('T+0 lead_chart', async () => {
    const { sendLeadChartEmail } = await import('../email');
    await sendLeadChartEmail(leadParams);
    expectUtm(sentHtml(), 't0', 'lead_chart');
  });

  it('T+1h lead_curiosity_hook', async () => {
    const { sendLeadCuriosityHookEmail } = await import('../email');
    await sendLeadCuriosityHookEmail(leadParams);
    expectUtm(sentHtml(), 't1h', 'lead_curiosity_hook');
  });

  it('T+24h lead_moon_asc', async () => {
    const { sendLeadMoonAscEmail } = await import('../email');
    await sendLeadMoonAscEmail(leadParams);
    expectUtm(sentHtml(), 't24h', 'lead_moon_asc');
  });

  it('T+72h lead_paywall_teaser (params live on the outer checkout URL)', async () => {
    const { sendLeadPaywallTeaserEmail } = await import('../email');
    await sendLeadPaywallTeaserEmail({ ...leadParams, variant: 'A' });
    expectUtm(sentHtml(), 't72', 'lead_paywall_teaser');
  });

  it('T+7d lead_saturn_weekly', async () => {
    const { sendLeadSaturnWeeklyEmail } = await import('../email');
    await sendLeadSaturnWeeklyEmail(leadParams);
    expectUtm(sentHtml(), 't7d', 'lead_saturn_weekly');
  });

  it('T+14d lead_mini_reading', async () => {
    const { sendLeadMiniReadingEmail } = await import('../email');
    await sendLeadMiniReadingEmail(leadParams);
    expectUtm(sentHtml(), 't14d', 'lead_mini_reading');
  });

  it('T+21d lead_synastry_teaser (sender kept for history; step retired in cron)', async () => {
    const { sendLeadSynastryTeaserEmail } = await import('../email');
    await sendLeadSynastryTeaserEmail(leadParams);
    expectUtm(sentHtml(), 't21d', 'lead_synastry_teaser');
  });

  it('cart_abandon keeps its own source/campaign and gains content + term', async () => {
    const { sendCartAbandonEmail } = await import('../email');
    await sendCartAbandonEmail({ ...leadParams, checkoutClicks: 2 });
    const html = sentHtml();
    expect(html).toContain('utm_source=cart-abandon');
    expect(html).toContain('utm_medium=email');
    expect(html).toContain('utm_campaign=cart-abandon-20off');
    expect(html).toContain(`utm_content=${LEAD_ID}`);
    expect(html).toContain('utm_term=cart_abandon');
  });

  it('homepage fallback (no chartId) also carries the full UTM set', async () => {
    const { sendLeadChartEmail } = await import('../email');
    await sendLeadChartEmail({ ...leadParams, chartId: null });
    expectUtm(sentHtml(), 't0', 'lead_chart');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/shared/lib/__tests__/email-drip-utm.test.ts`
Expected: FAIL — every `expectUtm` fails on `utm_medium=email` (drip links carry only source+campaign today); cart-abandon fails on `utm_content`/`utm_term`.

- [ ] **Step 3: Implement the helper**

In `src/shared/lib/email.ts`, after `SETTINGS_URL` (line 137), insert:

```ts
// ---------------------------------------------------------------------------
// UTM suffix for drip CTA links (audit 2026-07-10 finding #5: utm_content was
// null on 77/77 drip pageviews — per-template attribution was blind).
//   utm_content = leadId — the Stripe-webhook lead-link fallback regex-matches
//     a 21-char leadId in session metadata (webhooks/stripe/route.ts:289-291)
//     to attribute anonymous purchases back to the lead. Never put template
//     names here: that would permanently disable the fallback.
//   utm_term = email template (sent_lead_emails.email_type) — joins sends to
//     pageviews/checkouts per template in PostHog + Stripe metadata.
//   utm_campaign keeps the historic step names (t0/t1h/…) for old dashboards.
// ---------------------------------------------------------------------------
function dripUtm(campaign: string, leadId: string, template: string): string {
  return `utm_source=lead-nurture&utm_medium=email&utm_campaign=${campaign}&utm_content=${leadId}&utm_term=${template}`;
}
```

- [ ] **Step 4: Rewire all 8 URL sites**

Each is a mechanical replacement of the literal `utm_source=lead-nurture&utm_campaign=<step>` suffix. Exact edits (old → new):

1. `sendLeadChartEmail` (lines 434-436):
```ts
  const chartPath = params.chartId
    ? `/${params.locale === 'es' ? 'es/' : ''}chart?chartId=${params.chartId}&${dripUtm('t0', params.leadId, 'lead_chart')}`
    : `/${params.locale === 'es' ? 'es' : ''}?${dripUtm('t0', params.leadId, 'lead_chart')}`;
```

2. `sendLeadCuriosityHookEmail` (lines 508-510):
```ts
  const chartPath = params.chartId
    ? `/${params.locale === 'es' ? 'es/' : ''}chart?chartId=${params.chartId}&${dripUtm('t1h', params.leadId, 'lead_curiosity_hook')}`
    : `/${params.locale === 'es' ? 'es' : ''}?${dripUtm('t1h', params.leadId, 'lead_curiosity_hook')}`;
```

3. `sendLeadMoonAscEmail` (lines 598-600):
```ts
  const chartPath = params.chartId
    ? `/${params.locale === 'es' ? 'es/' : ''}chart?chartId=${params.chartId}&${dripUtm('t24h', params.leadId, 'lead_moon_asc')}`
    : `/${params.locale === 'es' ? 'es/' : ''}?${dripUtm('t24h', params.leadId, 'lead_moon_asc')}`;
```

4. `sendLeadPaywallTeaserEmail` (line 685):
```ts
  const baseTrialPath = `/${params.locale === 'es' ? 'es/' : ''}checkout/start?plan=pro_annual&return=${encodeURIComponent(returnPath)}&${dripUtm('t72', params.leadId, 'lead_paywall_teaser')}`;
```

5. `sendLeadSaturnWeeklyEmail` (lines 814-816):
```ts
  const chartPath = params.chartId
    ? `/${params.locale === 'es' ? 'es/' : ''}chart?chartId=${params.chartId}&${dripUtm('t7d', params.leadId, 'lead_saturn_weekly')}`
    : `/${params.locale === 'es' ? 'es' : ''}?${dripUtm('t7d', params.leadId, 'lead_saturn_weekly')}`;
```

6. `sendLeadMiniReadingEmail` (lines 878-880):
```ts
  const chartPath = params.chartId
    ? `/${params.locale === 'es' ? 'es/' : ''}chart?chartId=${params.chartId}&${dripUtm('t14d', params.leadId, 'lead_mini_reading')}`
    : `/${params.locale === 'es' ? 'es' : ''}?${dripUtm('t14d', params.leadId, 'lead_mini_reading')}`;
```

7. `sendLeadSynastryTeaserEmail` (line 955):
```ts
  const synastryPath = `/${params.locale === 'es' ? 'es/' : ''}synastry?${dripUtm('t21d', params.leadId, 'lead_synastry_teaser')}`;
```

8. `sendCartAbandonEmail` (line 1037 — different source/campaign, so inline append; keep the existing comment above it):
```ts
  const ctaPath = `/${params.locale === 'es' ? 'es/' : ''}checkout/start?plan=pro_annual&coupon=TEASER20&utm_source=cart-abandon&utm_medium=email&utm_campaign=cart-abandon-20off&utm_content=${params.leadId}&utm_term=cart_abandon`;
```

- [ ] **Step 5: Run the new tests + the existing sender suites**

Run: `npx vitest run src/shared/lib/__tests__/email-drip-utm.test.ts src/shared/lib/__tests__/email-lead.test.ts src/shared/lib/__tests__/email-curiosity-hook.test.ts`
Expected: PASS — existing assertions (`utm_campaign=t24h`, `/chart?chartId=`, etc.) remain true; dripUtm only ADDS params.

- [ ] **Step 6: Commit**

```bash
git add src/shared/lib/email.ts src/shared/lib/__tests__/email-drip-utm.test.ts
git commit -m "feat(sp-c/T4): drip links carry utm_medium/content/term — leadId fallback + per-template attribution"
```

---

### Task 5: Retire synastry_teaser — drip terminates at step 6 (D5)

**Files:**
- Modify: `src/app/api/cron/lead-nurture/route.ts` (header doc :13-16; import :52; candidates comment + filter :124, :142, :153; `STEP_HANDLERS` :93-101)
- Test: `src/app/api/cron/lead-nurture/__tests__/dispatch.test.ts` (db mock + step 5/6 tests), `src/app/api/cron/lead-nurture/__tests__/route.test.ts` (step 5/6 tests :217-253)

**Interfaces:**
- Produces: `STEP_HANDLERS` has 6 rows (0→1 … 5→6); the 5→6 row (mini reading) gets `nextDelayMs: null` (terminal — `nurtureNextAt` set NULL on advance). Candidates filter tightens `lt(nurtureStep, 7)` → `lt(nurtureStep, 6)` so leads already sitting at step 6 with a stale non-NULL `nurtureNextAt` are never re-selected hourly forever. `sendLeadSynastryTeaserEmail` stays exported from `email.ts` (history + audit scripts import it); `SynastryTeaserEmail.tsx` template stays; the `lead_synastry_teaser` enum value stays (rows exist). NO schema change.

- [ ] **Step 1: Update the failing tests first**

In `src/app/api/cron/lead-nurture/__tests__/dispatch.test.ts`:

1. Extend the db mock (lines 29-36) to capture `set` values:

```ts
const updateMock = vi.fn(async () => undefined);
const setCalls: Array<Record<string, unknown>> = [];
const selectMock = vi.fn();
vi.mock('@/shared/lib/db', () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: () => ({ limit: () => selectMock() }) }) }),
    update: () => ({
      set: (vals: Record<string, unknown>) => {
        setCalls.push(vals);
        return { where: () => updateMock() };
      },
    }),
  }),
}));
```

and add `setCalls.length = 0;` inside the existing `beforeEach` (line 40-42).

2. Replace the step=5 test (lines 109-117) with:

```ts
  it('step=5 invokes sendLeadMiniReadingEmail and is now TERMINAL (synastry retired)', async () => {
    selectMock.mockResolvedValueOnce([makeLead(5, 'f')]);
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/cron/lead-nurture', {
      headers: { authorization: 'Bearer test' },
    });
    await GET(req);
    expect(sendLeadMiniReadingEmailMock).toHaveBeenCalledTimes(1);
    expect(setCalls[0]).toMatchObject({ nurtureStep: 6, nurtureNextAt: null });
  });
```

3. Replace the step=6 test (lines 119-127) with:

```ts
  it('step=6 no longer sends synastry_teaser (retired 2026-07-10 — 6/10 lifetime unsubs)', async () => {
    selectMock.mockResolvedValueOnce([makeLead(6, 'g')]);
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/cron/lead-nurture', {
      headers: { authorization: 'Bearer test' },
    });
    const res = await GET(req);
    const body = await res.json();
    expect(sendLeadSynastryTeaserEmailMock).not.toHaveBeenCalled();
    expect(body.sent).toBe(0);
  });
```

(The `vi.mock('@/shared/lib/email')` factory keeps exporting `sendLeadSynastryTeaserEmail` — harmless once the route stops importing it.)

In `src/app/api/cron/lead-nurture/__tests__/route.test.ts`:

4. In the step=5 test (lines 217-235): change the title to `'dispatches to sendLeadMiniReadingEmail when step=5 and due (terminal — synastry retired)'`, delete the `const before = Date.now();` line and the last two assertions (`const scheduled = ...` / `expect(scheduled)...`), and replace them with:

```ts
    expect(updates[0]!.vals.nurtureNextAt).toBeNull();
```

5. Replace the step=6 synastry test (lines 237-253) with:

```ts
  it('step=6 lead gets NO send and NO step change (synastry_teaser retired)', async () => {
    candidates = [{
      id: 'lead_s6',
      email: 's6@example.com',
      locale: 'en',
      chartId: 'chart_s6',
      nurtureStep: 6,
      nurtureNextAt: new Date(Date.now() - 60_000),
      createdAt: new Date(Date.now() - 508 * 3600_000),
    }];
    const { GET } = await import('../route');
    const res = await GET(new Request('http://localhost/api/cron/lead-nurture'));
    const json = await res.json();
    expect(sendSynastryMock).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
    expect(json.skipped).toBe(1);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/api/cron/lead-nurture/__tests__/`
Expected: FAIL — step=5 still schedules `nurtureNextAt` +7d (not null); step=6 still calls the synastry sender.

- [ ] **Step 3: Implement in the route**

In `src/app/api/cron/lead-nurture/route.ts`:

1. Header doc — replace lines 15-16 (`step 6` / `step 7` rows) with:

```ts
 *   step 5 → T+14d mini reading        (brand-building, TERMINAL)
 *   step 6 → terminal                  (synastry_teaser retired 2026-07-10 —
 *                                       drove 6/10 lifetime unsubs, audit #6)
```

2. Remove `sendLeadSynastryTeaserEmail,` from the import block (line 52).
3. `STEP_HANDLERS` (lines 93-101) — the 4→5 row is unchanged; the 5→6 row goes terminal; the 6→7 row is deleted:

```ts
const STEP_HANDLERS: StepHandler[] = [
  { fromStep: 0, toStep: 1, send: sendLeadChartEmail,           nextDelayMs: STEP_0_TO_1_DELAY_MS },
  { fromStep: 1, toStep: 2, send: sendLeadCuriosityHookEmail,   nextDelayMs: 23 * HOUR },
  { fromStep: 2, toStep: 3, send: sendLeadMoonAscEmail,         nextDelayMs: 2 * DAY },
  { fromStep: 3, toStep: 4, send: sendLeadPaywallTeaserEmail,   nextDelayMs: 4 * DAY },
  { fromStep: 4, toStep: 5, send: sendLeadSaturnWeeklyEmail,    nextDelayMs: 7 * DAY },
  // Terminal: synastry_teaser (step 6→7) retired 2026-07-10 — it drove 6 of 10
  // lifetime unsubscribes (CRO audit finding #6). Leads already AT step 6 are
  // excluded by the step<6 filter below and simply never get the last send.
  { fromStep: 5, toStep: 6, send: sendLeadMiniReadingEmail,     nextDelayMs: null },
];
```

4. Candidates filter — comment at line 124: change `step < 7 (final step is 7 after T+21d synastry teaser)` to `step < 6 (terminal after T+14d mini reading; synastry retired)`; line 142: `lt(emailLeads.nurtureStep, 7)` → `lt(emailLeads.nurtureStep, 6)`; comment at line 153: `steps 1..6 with due nextAt (T+1h, T+24h, T+72h, T+7d, T+14d, T+21d)` → `steps 1..5 with due nextAt (T+1h, T+24h, T+72h, T+7d, T+14d)`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/api/cron/lead-nurture/__tests__/ src/app/api/v1/leads/__tests__/route.test.ts && npm run typecheck`
Expected: PASS (the leads route test only mocks the sender module — unaffected); typecheck clean (no unused-import error since the import was removed).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/lead-nurture/route.ts src/app/api/cron/lead-nurture/__tests__/dispatch.test.ts src/app/api/cron/lead-nurture/__tests__/route.test.ts
git commit -m "feat(sp-c/T5): retire synastry_teaser — drip terminal at mini_reading (6/10 lifetime unsubs)"
```

---

### Task 6: SAVE50 coupon registry entry + env docs (D4 registry + D6)

**Files:**
- Modify: `src/shared/lib/coupons.ts` (`ALLOWED_COUPON_CODES` :14; `COUPON_CONFIG` :26-31)
- Modify: `.env.example` (after the `STRIPE_COUPON_HALF50=` block, line 41)
- Test: `src/shared/lib/__tests__/coupons.test.ts` (extend)

**Interfaces:**
- Produces: `'SAVE50'` in `ALLOWED_COUPON_CODES` + `COUPON_CONFIG.SAVE50 = { envVar: 'STRIPE_COUPON_SAVE50', allowedPlans: ['pro_monthly', 'pro_annual'] }`. This AUTOMATICALLY extends the checkout API's `z.enum(ALLOWED_COUPON_CODES)` body schema (`src/app/api/v1/stripe/checkout/route.ts:46`) and `CheckoutStartClient`'s `isAllowedCouponCode` URL allowlist — `&coupon=SAVE50` on `/checkout/start` works end-to-end with zero further wiring. Consumed by Tasks 7-8.

- [ ] **Step 1: Write the failing tests**

In `src/shared/lib/__tests__/coupons.test.ts`:

1. In the `isAllowedCouponCode` "accepts known codes" test (after line 13): add `expect(isAllowedCouponCode('SAVE50')).toBe(true);`
2. In the `resolveCouponId` describe, extend `envBoth` (lines 30-33) with `STRIPE_COUPON_SAVE50: 'co_save',` and append after the HALF50 test (line 43):

```ts
    it('SAVE50 applies to BOTH plans (trial-end save offer)', () => {
      expect(resolveCouponId('SAVE50', 'pro_monthly', envBoth)).toBe('co_save');
      expect(resolveCouponId('SAVE50', 'pro_annual', envBoth)).toBe('co_save');
    });

    it('SAVE50 returns null when env unset (save offer fully disabled)', () => {
      expect(resolveCouponId('SAVE50', 'pro_monthly', {})).toBeNull();
    });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/shared/lib/__tests__/coupons.test.ts`
Expected: FAIL — TS error / runtime: `'SAVE50'` is not assignable to `AllowedCouponCode`.

- [ ] **Step 3: Implement**

In `src/shared/lib/coupons.ts`:

1. Line 14: `export const ALLOWED_COUPON_CODES = ['TEASER20', 'HALF50', 'SAVE50'] as const;`
2. Add to `COUPON_CONFIG` (after the HALF50 entry, line 30):

```ts
  // Trial-end save offer — both plans, first charge only (duration: once).
  // NO redeem_by: per-send urgency lives in the email copy, not in coupon
  // immutability (the HALF50 7-day window expired unsent — lesson learned).
  SAVE50: { envVar: 'STRIPE_COUPON_SAVE50', allowedPlans: ['pro_monthly', 'pro_annual'] },
```

3. In `.env.example`, after the `STRIPE_COUPON_HALF50=` line (41), append:

```
# SAVE50 — trial-end save offer: 50% off first charge (duration: once), BOTH plans,
# no redeem_by (urgency lives in email copy). Created via
# scripts/advertising/_create_save50_coupon_2026_07_10.mjs (gated, founder-run).
# Delivered by trial-expiration reminder_1d + trial_ended emails (&coupon=SAVE50).
# Leave empty to disable the save offer entirely — those emails render exactly
# as before, no coupon block, no URL param. Supersedes TRIAL_WINBACK_COUPON_CODE.
STRIPE_COUPON_SAVE50=
```

Note (SP-F coordination): `TRIAL_WINBACK_COUPON_CODE` is dead after T8 — do NOT add a `TRIAL_WINBACK_COUPON_CODE=` line to `.env.example`; the comment above is its only (historical) mention.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/shared/lib/__tests__/coupons.test.ts && npm run typecheck`
Expected: PASS — typecheck confirms the widened enum flows through the checkout schema and `CheckoutStartClient` without further edits.

- [ ] **Step 5: Commit**

```bash
git add src/shared/lib/coupons.ts src/shared/lib/__tests__/coupons.test.ts .env.example
git commit -m "feat(sp-c/T6): SAVE50 coupon registry entry — both plans, env STRIPE_COUPON_SAVE50"
```

---

### Task 7: Gated SAVE50 Stripe coupon-creation script (D4 coupon)

**Files:**
- Create: `scripts/advertising/_create_save50_coupon_2026_07_10.mjs`

**Interfaces:**
- Consumes: `.env` `STRIPE_SECRET_KEY`. Mirrors `scripts/advertising/_create_half50_coupon_2026_05_30.mjs` with the D4 differences: NO `redeem_by` on the coupon, NO `expires_at` on the promotion code.
- Produces (only when the founder runs `--apply` — Task 10): Stripe coupon `SAVE50` (50% off, `duration: once`) + promotion code `SAVE50` (typed-code path for users who see the code but don't click the link).

No unit test — one-shot ops script; the dry-run output IS the verification (house convention, cf. `_create_half50_coupon_2026_05_30.mjs`).

- [ ] **Step 1: Write the script**

```js
#!/usr/bin/env node
/**
 * Create the SAVE50 trial-end save-offer coupon — 2026-07-10 (SP-C, D4)
 *
 * 50% off, duration: once (first charge only), both plans, NO redeem_by —
 * per-send urgency lives in the email copy, not coupon immutability (the
 * HALF50 7-day window expired before its blast ever went out).
 * Creates a Stripe Coupon (id = SAVE50) + a Promotion Code (SAVE50) so the
 * offer works BOTH via auto-apply deep-links (?coupon=SAVE50 →
 * discounts:[{coupon}]) and as a typed code (allow_promotion_codes path).
 *
 * Idempotent: skips creation if the coupon / promotion code already exists.
 * DRY-RUN by default; pass --apply to actually write to Stripe (founder-authorized).
 *   node scripts/advertising/_create_save50_coupon_2026_07_10.mjs            # preview
 *   node scripts/advertising/_create_save50_coupon_2026_07_10.mjs --apply    # create (LIVE)
 */
import { config } from 'dotenv';
config({ path: '.env' });
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' });

const APPLY = process.argv.includes('--apply');
const COUPON_ID = 'SAVE50';
const PROMO_CODE = 'SAVE50';
const PERCENT_OFF = 50;

console.log(`SAVE50 coupon — ${PERCENT_OFF}% off, duration=once, no redeem_by. APPLY=${APPLY}\n`);

// 1) Coupon -----------------------------------------------------------------
let coupon = null;
try {
  coupon = await stripe.coupons.retrieve(COUPON_ID);
  console.log(`coupon ${COUPON_ID} already exists (percent_off=${coupon.percent_off}, duration=${coupon.duration}, valid=${coupon.valid}) — skip create`);
} catch (e) {
  if (e?.statusCode !== 404 && e?.code !== 'resource_missing') throw e;
  if (!APPLY) {
    console.log(`would CREATE coupon ${COUPON_ID}: percent_off=${PERCENT_OFF}, duration=once, no redeem_by`);
  } else {
    coupon = await stripe.coupons.create({
      id: COUPON_ID,
      percent_off: PERCENT_OFF,
      duration: 'once',
      name: '50% off — trial-end save offer',
    });
    console.log(`CREATED coupon ${coupon.id} (valid=${coupon.valid})`);
  }
}

// 2) Promotion code (typed-code path) ---------------------------------------
const existingPromos = await stripe.promotionCodes.list({ code: PROMO_CODE, limit: 1 });
if (existingPromos.data.length > 0) {
  const p = existingPromos.data[0];
  console.log(`promotion_code ${PROMO_CODE} already exists (${p.id}, active=${p.active}, coupon=${p.coupon?.id ?? p.coupon}) — skip create`);
} else if (!APPLY) {
  console.log(`would CREATE promotion_code ${PROMO_CODE} → coupon ${COUPON_ID}, no expiry`);
} else {
  const promo = await stripe.promotionCodes.create({
    coupon: COUPON_ID,
    code: PROMO_CODE,
  });
  console.log(`CREATED promotion_code ${promo.code} (${promo.id})`);
}

console.log('\n=== NEXT STEPS ===');
console.log(`  • Set Vercel prod env:  STRIPE_COUPON_SAVE50 = ${COUPON_ID}`);
console.log('  • Delivery is automatic: trial-expiration reminder_1d + trial_ended emails append &coupon=SAVE50 once the env var is set.');
console.log(APPLY ? '\nLIVE write complete.' : '\nDRY-RUN — no Stripe writes. Re-run with --apply to create.');
```

- [ ] **Step 2: Dry-run (read-only Stripe calls) to validate the report**

Run: `node scripts/advertising/_create_save50_coupon_2026_07_10.mjs`
Expected: `would CREATE coupon SAVE50: percent_off=50, duration=once, no redeem_by` + `would CREATE promotion_code SAVE50 → coupon SAVE50, no expiry`. **Do NOT pass `--apply`** — that happens in Task 10, founder-confirmed.

- [ ] **Step 3: Commit**

```bash
git add scripts/advertising/_create_save50_coupon_2026_07_10.mjs
git commit -m "feat(sp-c/T7): gated SAVE50 Stripe coupon-creation script (dry-run default)"
```

---

### Task 8: Trial-end save offer — SAVE50 in reminder_1d + trial_ended emails (D4 delivery)

**Files:**
- Modify: `src/shared/lib/trial-expiration-email.ts` (imports :1-9; URL/coupon block :93-119)
- Modify: `src/emails/TrialReminder1dEmail.tsx` (Props :5-10; STRINGS :14-44; JSX :62-93)
- Modify: `src/emails/TrialEndedEmail.tsx` (STRINGS `couponIntro` :28-29 en, :49-50 es)
- Modify: `scripts/qa/_send_trial_expiration_backfill.mjs` (docstring line 20 — stale `TRIAL_WINBACK_COUPON_CODE` reference)
- Test: `src/shared/lib/__tests__/trial-expiration.test.ts` (env hooks :121, :126; replace test :246-256; add 3), Create `src/emails/__tests__/TrialReminder1dEmail.test.tsx`, Create `src/emails/__tests__/TrialEndedEmail.test.tsx`

**Interfaces:**
- Consumes: `resolveCouponId` from `./coupons` (Task 6).
- Produces: when `STRIPE_COUPON_SAVE50` is set, `reminder_1d` and `trial_ended` sends get `&coupon=SAVE50` appended to `proUrl` + `couponCode: 'SAVE50'` passed to the template (50%-off copy block renders). `reminder_3d` NEVER carries the offer (don't discount people who might convert at full price). Env unset → both emails render exactly as today: no coupon prop, no URL param — the offer degrades to the plain email, never blocks the send. `TRIAL_WINBACK_COUPON_CODE` reading REMOVED (superseded — it was display-only, never appended to the URL). `TrialReminder1dEmail` gains optional `couponCode?: string`; `TrialEndedEmail`'s existing optional `couponCode` keeps its type, its copy changes from "10% off, type at checkout" to "50% off, auto-applied by your link".

- [ ] **Step 1: Write the failing sender tests**

In `src/shared/lib/__tests__/trial-expiration.test.ts`:

1. Lines 121 and 126: change `delete process.env.TRIAL_WINBACK_COUPON_CODE;` → `delete process.env.STRIPE_COUPON_SAVE50;` (both `beforeEach` and `afterEach`).
2. Replace the `'TRIAL_WINBACK_COUPON_CODE is passed to trial_ended template'` test (lines 246-256) with these four (same spyOn idiom the old test used):

```ts
  it('SAVE50 env set → reminder_1d gets couponCode + &coupon=SAVE50 on proUrl', async () => {
    process.env.STRIPE_COUPON_SAVE50 = 'SAVE50';
    const TrialReminder1dEmail = await import('@/emails/TrialReminder1dEmail');
    const mockDefault = vi.spyOn(TrialReminder1dEmail, 'default');
    const { sendTrialExpirationEmail } = await import('../trial-expiration-email');
    await sendTrialExpirationEmail({ ...baseParams, step: 'reminder_1d' });
    expect(mockDefault).toHaveBeenCalledWith(
      expect.objectContaining({
        couponCode: 'SAVE50',
        proUrl: expect.stringContaining('&coupon=SAVE50'),
      }),
    );
  });

  it('SAVE50 env set → trial_ended win-back gets couponCode + coupon on URL', async () => {
    process.env.STRIPE_COUPON_SAVE50 = 'SAVE50';
    const TrialEndedEmail = await import('@/emails/TrialEndedEmail');
    const mockDefault = vi.spyOn(TrialEndedEmail, 'default');
    const { sendTrialExpirationEmail } = await import('../trial-expiration-email');
    await sendTrialExpirationEmail({ ...baseParams, step: 'trial_ended' });
    expect(mockDefault).toHaveBeenCalledWith(
      expect.objectContaining({
        couponCode: 'SAVE50',
        proUrl: expect.stringContaining('&coupon=SAVE50'),
      }),
    );
  });

  it('SAVE50 env set → reminder_3d proUrl carries NO coupon (offer is T-1d + post-trial only)', async () => {
    process.env.STRIPE_COUPON_SAVE50 = 'SAVE50';
    const TrialReminder3dEmail = await import('@/emails/TrialReminder3dEmail');
    const mockDefault = vi.spyOn(TrialReminder3dEmail, 'default');
    const { sendTrialExpirationEmail } = await import('../trial-expiration-email');
    await sendTrialExpirationEmail({ ...baseParams, step: 'reminder_3d' });
    const props = mockDefault.mock.calls[0]![0] as { proUrl: string };
    expect(props.proUrl).not.toContain('coupon=');
  });

  it('SAVE50 env unset → reminder_1d renders exactly as before (no coupon prop, no URL param)', async () => {
    const TrialReminder1dEmail = await import('@/emails/TrialReminder1dEmail');
    const mockDefault = vi.spyOn(TrialReminder1dEmail, 'default');
    const { sendTrialExpirationEmail } = await import('../trial-expiration-email');
    await sendTrialExpirationEmail({ ...baseParams, step: 'reminder_1d' });
    const props = mockDefault.mock.calls[0]![0] as { proUrl: string; couponCode?: string };
    expect(props.couponCode).toBeUndefined();
    expect(props.proUrl).not.toContain('coupon=');
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/shared/lib/__tests__/trial-expiration.test.ts`
Expected: FAIL — reminder_1d props carry no `couponCode`; no URL contains `&coupon=SAVE50`.

- [ ] **Step 3: Implement the sender**

In `src/shared/lib/trial-expiration-email.ts`:

1. Add import after line 8: `import { resolveCouponId } from './coupons';`
2. Replace the URL/coupon block (lines 93-119, from `// 3. Build URLs` through the end of the template `if/else`) with:

```ts
  // 3. Build URLs
  const localePath = locale === 'es' ? 'es/' : '';
  const checkoutPlan = plan === 'pro_annual' ? 'pro_annual' : 'pro_monthly';
  // SAVE50 save offer (50% off first charge, duration: once) — env-gated via
  // the coupon registry: resolveCouponId returns null while STRIPE_COUPON_SAVE50
  // is unset, so the emails render exactly as before (no offer, no URL param).
  // Offered at T-1d and the post-trial win-back ONLY — never at T-3d (don't
  // discount people who might convert at full price). Supersedes the old
  // display-only TRIAL_WINBACK_COUPON_CODE (it was never appended to the URL).
  const saveOfferActive =
    (step === 'reminder_1d' || step === 'trial_ended') &&
    resolveCouponId('SAVE50', checkoutPlan) !== null;
  const couponCode = saveOfferActive ? 'SAVE50' : undefined;
  const proUrl =
    `${SITE_URL}/${localePath}checkout/start?plan=${checkoutPlan}` +
    `&utm_source=trial-expiration&utm_campaign=${step}` +
    (saveOfferActive ? '&coupon=SAVE50' : '');
  const billingPortalUrl = `${SITE_URL}/${localePath}settings`;
  const chartUrl = `${SITE_URL}/${localePath}chart?utm_source=trial-expiration&utm_campaign=${step}`;

  // 4. Render the correct template
  let html: string;
  let text: string;

  if (step === 'reminder_3d') {
    const props = { locale, trialEndDate, proUrl, billingPortalUrl };
    html = await render(TrialReminder3dEmail(props));
    text = await render(TrialReminder3dEmail(props), { plainText: true });
  } else if (step === 'reminder_1d') {
    const props = { locale, trialEndDate, proUrl, billingPortalUrl, couponCode };
    html = await render(TrialReminder1dEmail(props));
    text = await render(TrialReminder1dEmail(props), { plainText: true });
  } else {
    // trial_ended — win-back
    const props = { locale, proUrl, chartUrl, couponCode };
    html = await render(TrialEndedEmail(props));
    text = await render(TrialEndedEmail(props), { plainText: true });
  }
```

3. One-line docstring fix in `scripts/qa/_send_trial_expiration_backfill.mjs` — line 20 still documents the now-dead env var. Replace:

```
 *   - TRIAL_WINBACK_COUPON_CODE (optional, for trial_ended win-back)
```

with:

```
 *   - STRIPE_COUPON_SAVE50 (optional — enables the SAVE50 save offer in reminder_1d/trial_ended)
```

- [ ] **Step 4: Run the sender tests**

Run: `npx vitest run src/shared/lib/__tests__/trial-expiration.test.ts`
Expected: PASS (templates are mocked there, so the missing prop/JSX doesn't matter yet). `npm run typecheck` would flag the unknown `couponCode` prop on `TrialReminder1dEmail` — fixed in the next step; don't run the gate in between.

- [ ] **Step 5: Write the failing template tests**

```tsx
// src/emails/__tests__/TrialReminder1dEmail.test.tsx
import { describe, it, expect } from 'vitest';
import { render } from '@react-email/render';
import TrialReminder1dEmail from '../TrialReminder1dEmail';

const TRIAL_DATE = new Date('2026-07-15T14:00:00Z');
const PRO_URL =
  'https://estrevia.app/checkout/start?plan=pro_monthly&utm_source=trial-expiration&utm_campaign=reminder_1d';
const PORTAL_URL = 'https://estrevia.app/settings';

describe('TrialReminder1dEmail', () => {
  it('renders EN without a save-offer block when couponCode is absent', async () => {
    const html = await render(
      TrialReminder1dEmail({
        locale: 'en',
        trialEndDate: TRIAL_DATE,
        proUrl: PRO_URL,
        billingPortalUrl: PORTAL_URL,
      }),
    );
    expect(html).toContain('Last day of your trial');
    expect(html).not.toContain('SAVE50');
    expect(html).not.toContain('50% off');
  });

  it('renders the EN save-offer block (auto-apply framing) when couponCode is set', async () => {
    const html = await render(
      TrialReminder1dEmail({
        locale: 'en',
        trialEndDate: TRIAL_DATE,
        proUrl: `${PRO_URL}&coupon=SAVE50`,
        billingPortalUrl: PORTAL_URL,
        couponCode: 'SAVE50',
      }),
    );
    expect(html).toContain('SAVE50');
    expect(html).toContain('50% off your first charge');
  });

  it('renders the ES save-offer block (español neutro, tú form)', async () => {
    const html = await render(
      TrialReminder1dEmail({
        locale: 'es',
        trialEndDate: TRIAL_DATE,
        proUrl: `${PRO_URL}&coupon=SAVE50`,
        billingPortalUrl: PORTAL_URL,
        couponCode: 'SAVE50',
      }),
    );
    expect(html).toContain('SAVE50');
    expect(html).toContain('50% de descuento en tu primer cobro');
  });
});
```

```tsx
// src/emails/__tests__/TrialEndedEmail.test.tsx
import { describe, it, expect } from 'vitest';
import { render } from '@react-email/render';
import TrialEndedEmail from '../TrialEndedEmail';

const PRO_URL =
  'https://estrevia.app/checkout/start?plan=pro_monthly&utm_source=trial-expiration&utm_campaign=trial_ended&coupon=SAVE50';
const CHART_URL = 'https://estrevia.app/chart?utm_source=trial-expiration&utm_campaign=trial_ended';

describe('TrialEndedEmail', () => {
  it('renders EN without a coupon block when couponCode is absent', async () => {
    const html = await render(
      TrialEndedEmail({ locale: 'en', proUrl: PRO_URL, chartUrl: CHART_URL }),
    );
    expect(html).toContain('Your trial has ended');
    expect(html).not.toContain('SAVE50');
  });

  it('renders the EN coupon block with 50% auto-apply framing (no stale 10% copy)', async () => {
    const html = await render(
      TrialEndedEmail({ locale: 'en', proUrl: PRO_URL, chartUrl: CHART_URL, couponCode: 'SAVE50' }),
    );
    expect(html).toContain('SAVE50');
    expect(html).toContain('50% off your first charge');
    expect(html).not.toContain('10% off');
  });

  it('renders the ES coupon block (español neutro, tú form)', async () => {
    const html = await render(
      TrialEndedEmail({ locale: 'es', proUrl: PRO_URL, chartUrl: CHART_URL, couponCode: 'SAVE50' }),
    );
    expect(html).toContain('SAVE50');
    expect(html).toContain('50% de descuento en tu primer cobro');
  });
});
```

- [ ] **Step 6: Run to verify they fail**

Run: `npx vitest run src/emails/__tests__/TrialReminder1dEmail.test.tsx src/emails/__tests__/TrialEndedEmail.test.tsx`
Expected: FAIL — TrialReminder1dEmail has no `couponCode` prop (TS error at test compile) and no save-offer block; TrialEndedEmail still says "10% off your first month".

- [ ] **Step 7: Implement the templates**

In `src/emails/TrialReminder1dEmail.tsx`:

1. Props (lines 5-10):

```tsx
interface Props {
  locale: 'en' | 'es';
  trialEndDate: Date;
  proUrl: string;
  billingPortalUrl: string;
  /** Registry code (SAVE50) — proUrl already carries &coupon=; block hidden when absent */
  couponCode?: string;
}
```

2. STRINGS — add a `saveOffer` entry to BOTH locales, after `body3` (EN after line 23, ES after line 38):

```tsx
    saveOffer: (code: string) =>
      `Not ready to decide? Keep Pro at half price — the button below applies code ${code} automatically: 50% off your first charge.`,
```

```tsx
    saveOffer: (code: string) =>
      `¿No estás seguro todavía? Conserva Pro a mitad de precio — el botón de abajo aplica el código ${code} automáticamente: 50% de descuento en tu primer cobro.`,
```

3. Component signature (line 58): `export default function TrialReminder1dEmail({ locale, trialEndDate, proUrl, billingPortalUrl, couponCode }: Props) {`
4. JSX — insert between the `body3` `<Text>` (ends line 78) and `<Button href={proUrl}>` (line 80), same visual idiom as TrialEndedEmail's coupon block:

```tsx
      {couponCode ? (
        <Text
          style={{
            fontSize: 14,
            lineHeight: 1.6,
            marginBottom: 24,
            padding: '12px 16px',
            backgroundColor: 'rgba(255,215,0,0.08)',
            borderLeft: '3px solid #FFD700',
            color: 'rgba(255,255,255,0.85)',
          }}
        >
          {t.saveOffer(couponCode)}
        </Text>
      ) : null}
```

In `src/emails/TrialEndedEmail.tsx` — replace `couponIntro` in both locales (the coupon is now auto-applied by the link, and it's 50%, not 10%):

EN (lines 28-29):
```tsx
    couponIntro: (code: string) =>
      `Want to continue? Your link applies code ${code} automatically — 50% off your first charge.`,
```

ES (lines 49-50):
```tsx
    couponIntro: (code: string) =>
      `¿Quieres continuar? Tu enlace aplica el código ${code} automáticamente — 50% de descuento en tu primer cobro.`,
```

- [ ] **Step 8: Run all Task 8 tests + typecheck**

Run: `npx vitest run src/emails/__tests__/TrialReminder1dEmail.test.tsx src/emails/__tests__/TrialEndedEmail.test.tsx src/shared/lib/__tests__/trial-expiration.test.ts && npm run typecheck`
Expected: PASS (6 template tests + full sender suite); typecheck clean.

- [ ] **Step 9: Commit**

```bash
git add src/shared/lib/trial-expiration-email.ts src/emails/TrialReminder1dEmail.tsx src/emails/TrialEndedEmail.tsx scripts/qa/_send_trial_expiration_backfill.mjs src/shared/lib/__tests__/trial-expiration.test.ts src/emails/__tests__/TrialReminder1dEmail.test.tsx src/emails/__tests__/TrialEndedEmail.test.tsx
git commit -m "feat(sp-c/T8): trial-end save offer — SAVE50 auto-applied in reminder_1d + trial_ended emails"
```

---

### Task 9: Full verification gate

**Files:** none (verification only)

- [ ] **Step 1: Full unit suite**

Run: `npx vitest run`
Expected: 0 failures. This plan adds ~30 tests and rewrites the Resend webhook suite; watch specifically for stragglers that grep `synastry` or `TRIAL_WINBACK` (e.g. `src/app/api/v1/leads/__tests__/route.test.ts` mocks the sender module — should be unaffected).

- [ ] **Step 2: Types + lint**

Run: `npm run typecheck && npm run lint`
Expected: typecheck clean; lint — no NEW issues in files this plan touched (`.claude/worktrees/**` noise is pre-existing).

- [ ] **Step 3: Commit any stragglers**

Only if Steps 1-2 forced fixes; commit as `chore(sp-c/T9): test/type stragglers from drip repair`. Otherwise nothing to commit.

---

### Task 10: Deploy gate + founder ops checklist (STRICT ORDER)

**Files:** none (ops runbook — each step is a gate; do not reorder)

- [ ] **Step 1: Create the SAVE50 coupon in Stripe (founder-confirmed)**

Run: `node scripts/advertising/_create_save50_coupon_2026_07_10.mjs` — review the dry-run report, then on explicit founder OK: `node scripts/advertising/_create_save50_coupon_2026_07_10.mjs --apply`
Expected: `CREATED coupon SAVE50 (valid=true)` + `CREATED promotion_code SAVE50`.

- [ ] **Step 2: Vercel prod env var**

Set `STRIPE_COUPON_SAVE50` = `SAVE50` in Vercel → Production (dashboard, or REST API — remember: `type: 'encrypted'`, NOT `'sensitive'` which silently drops the value). The save offer stays fully dark until this is set — deploying first is safe.
Also verify `RESEND_WEBHOOK_SECRET` is still set (T1 changes the handler, not the auth).

- [ ] **Step 3: Push (founder-confirmed)**

Run: `git log origin/main..HEAD --oneline` and show the founder the full list. On explicit OK: `git push origin main`. Watch the Vercel deployment to READY.

- [ ] **Step 4: Post-deploy smoke**

- Resend dashboard → Webhooks: confirm the endpoint subscribes to `email.bounced` + `email.complained`; send a test event (svix replay) and check the function logs for `[resend-webhook] permanent bounce → emailUndeliverable=true` (the audit's ES pool guarantees a real bounce candidate fast — verify `email_undeliverable` flips in prod on first occurrence).
- Test-mode Stripe: create SAVE50 in TEST mode by re-running the T7 script with the test secret key (`STRIPE_SECRET_KEY=sk_test_... node scripts/advertising/_create_save50_coupon_2026_07_10.mjs --apply` — test mode, no live writes), then create a test-mode Checkout session with `discounts: [{ coupon: 'SAVE50' }]` (Stripe CLI `stripe checkout sessions create ...` or dashboard) and confirm the session shows 50% off.
- Live-mode smoke (no charge — abandon the session): open `https://estrevia.app/checkout/start?plan=pro_monthly&coupon=SAVE50` → Stripe Checkout shows the 50% discount attached; close the tab without paying.
- Next real signup: `SELECT resend_message_id FROM sent_emails WHERE email_type='welcome' ORDER BY sent_at DESC LIMIT 1` → non-NULL.
- Next drip send: click a CTA and confirm the landing URL carries `utm_medium=email&utm_content=<leadId>&utm_term=<template>`.

- [ ] **Step 5: Sequencing dependency (verify, not do)**

The save offer only reaches the paying anon cohort AFTER Phase 0's P0-1 placeholder-email backfill is live (`stripe-pending-*@placeholder.invalid` addresses bounce). Confirm `SELECT count(*) FROM users WHERE email LIKE 'stripe-pending-%@placeholder.invalid'` is 0 (or near it) before treating a quiet save offer as a copy problem.

---

## Self-review notes

- **Spec coverage:** Goal 1 / D1 (bounce suppression, real payload) → Task 1. Goal 2 / D2 (claim→update welcome) → Tasks 2-3. Goal 3 / D3 (UTM scheme) → Task 4. Goal 5 / D5 (synastry retired) → Task 5. Goal 4 / D4 (save offer: registry → Task 6, coupon script → Task 7, delivery + templates → Task 8, coupon creation + env → Task 10). D6 (env docs, TRIAL_WINBACK removal) → Tasks 6 + 8. Error-handling section: webhook 200-on-unknown + per-address isolation → T1; save-offer degrade-to-plain → T8 (`resolveCouponId` null path); throw-on-`result.error` + claim/retry kept → T3/T8. All five Testing bullets have dedicated tests (T1, T3, T4, T8, T5 respectively).
- **Deviation (D2 scope):** `account_deletion` stays on the boolean `tryInsertOneShot` rather than the claim/update pattern — that flow intentionally never records a message id (the user row cascade-deletes immediately, `email.ts:283`), so a claim-based `'retry'` would re-send on every invocation. The param-type narrowing makes the split compiler-enforced; Goal 2's "all one-shot types" is satisfied where it can be sound.
- **Deviation (D3 naming):** `utm_term` uses the full `sent_lead_emails.email_type` names (`lead_chart`, `lead_curiosity_hook`, …) instead of the spec's mixed shorthand "(t0/curiosity_hook/…)" — directly joinable against the sends table; the step shorthand already lives in `utm_campaign` and stays there.
- **Addition (D5 mechanism):** retiring the 6→7 handler alone would leave existing step-6 leads (stale non-NULL `nurtureNextAt`) re-selected by the cron every hour forever; the plan therefore also tightens the candidates filter `lt(nurtureStep, 7)` → `lt(nurtureStep, 6)`. Same observable behavior the spec asks for ("leads at step 6 simply never get the last send"), without the perpetual no-op churn.
- **Deliberately untouched hazards:** `sendLeadSynastryTeaserEmail` stays exported (audit scripts import it; it still gets the T4 UTM update for consistency); the `lead_synastry_teaser` enum value and `SynastryTeaserEmail.tsx` stay (rows/history); `purchase_confirmation` keeps Resend-idempotencyKey-only dedup (repeatable type, unaffected by the partial index); the `DiscountLaunchEmail`/HALF50 blast infrastructure is left exactly as shipped (D4 keeps HALF50 history clean by cutting a NEW code); the placeholder-email fix itself is Phase 0's (SP-C only sequences behind it, Task 10 Step 5); users-table bounce match switched to `lower()` comparison — a deliberate superset of the old exact match, noted here in case anyone diffs behavior.
