# Anonymous-Checkout Sign-In Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make anonymous paying users able to sign in by (a) stopping the webhook from mistaking an `anonymousId` for a Clerk user id, and (b) moving the sign-in ticket out of Stripe's 500-char metadata into Upstash Redis.

**Architecture:** A new `checkout-ticket.ts` helper stores the Clerk sign-in token in Redis keyed by Stripe `session_id` (TTL 900 s). The webhook's `extractClerkUserId` only treats `client_reference_id` as a Clerk id when it has the `user_` prefix, so anonymous sessions enter the materialization branch and create a real Clerk user. The webhook, `/recover`, and `/session-status` all read/write the ticket via the new helper instead of Stripe metadata. `/recover` also mirrors the webhook's `email_leads` linking. A one-time dry-run-first repair script re-keys already-orphaned premium rows.

**Tech Stack:** Next.js App Router route handlers, Stripe Node SDK, Clerk server SDK, `@upstash/redis`, Drizzle ORM, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-30-anon-checkout-signin-fix-design.md`

**Commit policy:** This repo commits only on the founder's say-so (CLAUDE.md). Each task lists its commit, but DO NOT run `git commit`/`push` until the founder approves at the end. Keep changes staged-but-uncommitted; the final task gathers everything for one founder-approved commit.

---

## File Structure

- NEW `src/shared/lib/checkout-ticket.ts` — Redis get/set for the sign-in ticket (one responsibility: ticket transport).
- NEW `src/shared/lib/__tests__/checkout-ticket.test.ts`
- MODIFY `src/app/api/webhooks/stripe/route.ts` — export+fix `extractClerkUserId`; ticket → Redis.
- MODIFY `src/app/api/webhooks/stripe/__tests__/anonymous-completion.test.ts` — regression + ticket-store tests.
- MODIFY `src/app/api/v1/checkout/recover/route.ts` — ticket → Redis; mirror `email_leads` link.
- MODIFY `src/app/api/v1/checkout/recover/__tests__/route.test.ts`
- MODIFY `src/app/api/v1/checkout/session-status/route.ts` — ticket ← Redis (Redis-only).
- MODIFY `src/app/api/v1/checkout/session-status/__tests__/route.test.ts`
- NEW `scripts/advertising/_repair_orphan_anon_payers_2026_05_30.mjs` — dry-run + `--apply`.

---

## Task 1: Redis ticket helper

**Files:**
- Create: `src/shared/lib/checkout-ticket.ts`
- Test: `src/shared/lib/__tests__/checkout-ticket.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const setMock = vi.fn();
const getMock = vi.fn();
vi.mock('@/shared/lib/redis', () => ({
  redis: {
    set: (...args: unknown[]) => setMock(...args),
    get: (...args: unknown[]) => getMock(...args),
  },
}));

import { storeCheckoutTicket, getCheckoutTicket } from '../checkout-ticket';

beforeEach(() => vi.clearAllMocks());

describe('checkout-ticket', () => {
  it('stores the ticket keyed by session id with a 900s TTL', async () => {
    await storeCheckoutTicket('cs_test_1', 'tok_long');
    expect(setMock).toHaveBeenCalledWith('checkout_ticket:cs_test_1', 'tok_long', { ex: 900 });
  });

  it('reads the ticket by session id', async () => {
    getMock.mockResolvedValue('tok_long');
    const t = await getCheckoutTicket('cs_test_1');
    expect(t).toBe('tok_long');
    expect(getMock).toHaveBeenCalledWith('checkout_ticket:cs_test_1');
  });

  it('returns null when no ticket present', async () => {
    getMock.mockResolvedValue(null);
    expect(await getCheckoutTicket('cs_missing')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shared/lib/__tests__/checkout-ticket.test.ts`
Expected: FAIL — cannot find module `../checkout-ticket`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/shared/lib/checkout-ticket.ts
/**
 * Ephemeral transport for the Clerk sign-in ticket handed to anonymous payers.
 *
 * The ticket is a ~552-char Clerk sign-in token — too long for Stripe's 500-char
 * metadata value cap. It is single-use and short-lived (Clerk token TTL 600 s),
 * so Upstash Redis with a 900 s TTL is the right home: no migration, not persisted
 * in the primary DB, not visible in the Stripe dashboard.
 *
 * Keyed by Stripe Checkout session_id, which the client already holds from the
 * success-url redirect. Written by the webhook (and /recover); read by
 * /session-status (and /recover fast path).
 */
import { redis } from '@/shared/lib/redis';

const KEY_PREFIX = 'checkout_ticket:';
const TTL_SECONDS = 900;

export async function storeCheckoutTicket(sessionId: string, token: string): Promise<void> {
  await redis.set(`${KEY_PREFIX}${sessionId}`, token, { ex: TTL_SECONDS });
}

export async function getCheckoutTicket(sessionId: string): Promise<string | null> {
  return redis.get<string>(`${KEY_PREFIX}${sessionId}`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/shared/lib/__tests__/checkout-ticket.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Stage (do not commit yet)**

```bash
git add src/shared/lib/checkout-ticket.ts src/shared/lib/__tests__/checkout-ticket.test.ts
```

---

## Task 2: Fix + export `extractClerkUserId`

**Files:**
- Modify: `src/app/api/webhooks/stripe/route.ts:47-56`
- Test: `src/app/api/webhooks/stripe/__tests__/extract-clerk-user-id.test.ts` (new)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { extractClerkUserId } from '../route';

describe('extractClerkUserId', () => {
  it('returns metadata.clerkUserId when present', () => {
    expect(extractClerkUserId({ metadata: { clerkUserId: 'user_abc' }, client_reference_id: 'anything' })).toBe('user_abc');
  });

  it('treats client_reference_id as a Clerk id only when it has the user_ prefix', () => {
    expect(extractClerkUserId({ metadata: {}, client_reference_id: 'user_xyz' })).toBe('user_xyz');
  });

  it('returns null for an anonymousId in client_reference_id (the bug)', () => {
    // anonymous checkouts set client_reference_id to a UUID anonymous_id
    expect(extractClerkUserId({ metadata: { anonymous_id: 'a1b2' }, client_reference_id: '7f3e9c2a-1b4d-4e5f-8a9b-0c1d2e3f4a5b' })).toBeNull();
  });

  it('returns null for null input', () => {
    expect(extractClerkUserId(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/webhooks/stripe/__tests__/extract-clerk-user-id.test.ts`
Expected: FAIL — `extractClerkUserId` is not exported (import is undefined), and/or the anonymousId case returns the UUID.

- [ ] **Step 3: Implement the fix**

Replace `src/app/api/webhooks/stripe/route.ts:47-56` with:

```ts
export function extractClerkUserId(
  obj: { metadata?: Stripe.Metadata | null; client_reference_id?: string | null } | null,
): string | null {
  if (!obj) return null;
  const fromMetadata = obj.metadata?.clerkUserId ?? null;
  if (fromMetadata) return fromMetadata;
  // client_reference_id holds the Clerk user id for AUTHENTICATED checkouts, but
  // the anonymous_id (a UUID) for ANONYMOUS checkouts. Only treat it as a Clerk id
  // when it carries the Clerk `user_` prefix, so anonymous sessions resolve to null
  // and enter the materialization branch below.
  const ref = obj.client_reference_id ?? null;
  return ref && ref.startsWith('user_') ? ref : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/webhooks/stripe/__tests__/extract-clerk-user-id.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Stage**

```bash
git add src/app/api/webhooks/stripe/route.ts src/app/api/webhooks/stripe/__tests__/extract-clerk-user-id.test.ts
```

---

## Task 3: Webhook stores the ticket in Redis (not metadata)

**Files:**
- Modify: `src/app/api/webhooks/stripe/route.ts:217-225` (and add import)
- Test: `src/app/api/webhooks/stripe/__tests__/anonymous-completion.test.ts`

- [ ] **Step 1: Add the regression + ticket-store tests (failing)**

In `anonymous-completion.test.ts`:

(a) Add a hoisted mock for the ticket helper near the other `vi.mock`s:

```ts
const storeTicketMock = vi.fn();
vi.mock('@/shared/lib/checkout-ticket', () => ({
  storeCheckoutTicket: (...args: unknown[]) => storeTicketMock(...args),
  getCheckoutTicket: vi.fn(),
}));
```

(b) Extend `makeSessionCompletedEvent` to accept `client_reference_id`:

```ts
function makeSessionCompletedEvent(opts: { metadata?: Record<string, string>; email?: string; clientReferenceId?: string }): Request {
  const event = {
    id: 'evt_test_1',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_xyz',
        mode: 'subscription',
        customer: 'cus_anonymous_1',
        subscription: 'sub_test_1',
        client_reference_id: opts.clientReferenceId ?? null,
        metadata: opts.metadata ?? {},
        customer_details: { email: opts.email ?? 'paid@example.com' },
        amount_total: 0,
        currency: 'usd',
      },
    },
  };
  constructEventMock.mockReturnValue(event);
  return new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers: { 'stripe-signature': 'sig_test' },
    body: JSON.stringify(event),
  });
}
```

(c) Add the regression test (this is the test that should have caught the prod bug):

```ts
it('still materializes the Clerk user when an anonymous session carries client_reference_id (the prod case)', async () => {
  getUserListMock.mockResolvedValue({ totalCount: 0, data: [] });
  createUserMock.mockResolvedValue({ id: 'user_anon_materialized' });

  await POST(makeSessionCompletedEvent({
    metadata: { anonymous_id: '7f3e9c2a-1b4d-4e5f-8a9b-0c1d2e3f4a5b' },
    clientReferenceId: '7f3e9c2a-1b4d-4e5f-8a9b-0c1d2e3f4a5b', // anonymous_id, NOT a clerk id
    email: 'anon@example.com',
  }));

  // Must NOT be treated as already-signed-in: branch must run.
  expect(createUserMock).toHaveBeenCalled();
  expect(createTokenMock).toHaveBeenCalledWith({ userId: 'user_anon_materialized', expiresInSeconds: 600 });
});
```

(d) Replace the existing test `writes signInTicket back to Stripe session metadata` with a Redis-store assertion + a realistic long token:

```ts
it('stores the sign-in ticket in Redis (not Stripe metadata) and tolerates a 552-char token', async () => {
  getUserListMock.mockResolvedValue({ totalCount: 0, data: [] });
  createUserMock.mockResolvedValue({ id: 'user_new' });
  const longToken = 'x'.repeat(552); // realistic Clerk JWT length > Stripe's 500-char metadata cap
  createTokenMock.mockResolvedValue({ token: longToken });

  const res = await POST(makeSessionCompletedEvent({
    metadata: { anonymous_id: 'anon-xyz', utm_source: 'meta' },
    email: 'new@example.com',
  }));

  expect(res.status).toBe(200);
  expect(storeTicketMock).toHaveBeenCalledWith('cs_test_xyz', longToken);
  expect(sessionsUpdateMock).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/api/webhooks/stripe/__tests__/anonymous-completion.test.ts`
Expected: FAIL — `storeTicketMock` not called (route still writes metadata); the regression test fails only if a stale `extractClerkUserId` is present (Task 2 already fixed it, so the regression test may pass — that is fine, keep it as a guard).

- [ ] **Step 3: Implement — replace the metadata write with the Redis store**

Add to the imports at the top of `src/app/api/webhooks/stripe/route.ts`:

```ts
import { storeCheckoutTicket } from '@/shared/lib/checkout-ticket';
```

Replace `route.ts:217-225` (the `createSignInToken` + `sessions.update` block) with:

```ts
            // Create single-use sign-in ticket and stash it in Redis keyed by
            // session_id (Stripe metadata caps values at 500 chars; the Clerk
            // token is ~552). /session-status and /recover read it back.
            const ticket = await clerk.signInTokens.createSignInToken({
              userId: clerkUserId,
              expiresInSeconds: 600,
            });
            await storeCheckoutTicket(session.id, ticket.token);
```

(The `existingMetadata` local and the `getStripe().checkout.sessions.update(...)` call are removed.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/api/webhooks/stripe/__tests__/anonymous-completion.test.ts`
Expected: PASS (all, including the two new/updated tests).

- [ ] **Step 5: Stage**

```bash
git add src/app/api/webhooks/stripe/route.ts src/app/api/webhooks/stripe/__tests__/anonymous-completion.test.ts
```

---

## Task 4: `/recover` uses Redis + mirrors the lead link

**Files:**
- Modify: `src/app/api/v1/checkout/recover/route.ts`
- Test: `src/app/api/v1/checkout/recover/__tests__/route.test.ts`

- [ ] **Step 1: Update the failing tests**

In `recover/__tests__/route.test.ts`:

(a) Add the ticket-helper mock (hoisted) and a `db.update` chain to the db mock:

```ts
const { getTicketMock, storeTicketMock } = vi.hoisted(() => ({
  getTicketMock: vi.fn(),
  storeTicketMock: vi.fn(),
}));
vi.mock('@/shared/lib/checkout-ticket', () => ({
  getCheckoutTicket: getTicketMock,
  storeCheckoutTicket: storeTicketMock,
}));
```

Extend the `@/shared/lib/db` mock so `update().set().where().returning()` resolves (mirrors the webhook test's link path):

```ts
vi.mock('@/shared/lib/db', () => ({
  getDb: () => ({
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: dbInsertValuesOnConflictDoUpdateMock,
        onConflictDoNothing: dbInsertValuesOnConflictDoNothingMock,
      }),
    }),
    update: () => ({
      set: () => ({ where: () => ({ returning: () => Promise.resolve([{ id: 'lead-1' }]) }) }),
    }),
  }),
}));
```

(b) Fast-path test → read from Redis instead of metadata:

```ts
it('fast-path: returns ticket from Redis when already stored', async () => {
  sessionsRetrieveMock.mockResolvedValue({
    id: 'cs_test_1', mode: 'subscription', payment_status: 'paid', status: 'complete',
    metadata: {}, customer_details: { email: 'u@example.com' },
  });
  getTicketMock.mockResolvedValue('ticket_already_here');
  const res = await POST(makeRequest({ session_id: 'cs_test_1' }));
  const json = await res.json();
  expect(json.data).toEqual({ ready: true, ticket: 'ticket_already_here' });
  expect(getUserListMock).not.toHaveBeenCalled();
});
```

(c) Provision test → assert `storeTicketMock` called, `sessionsUpdateMock` NOT called. In the existing `provisions: creates Clerk user...` test, set `getTicketMock.mockResolvedValue(null)` at the top, replace the `sessionsUpdateMock` assertion (lines ~227-232) with:

```ts
  expect(storeTicketMock).toHaveBeenCalledWith('cs_test_1', 'ticket_fresh');
  expect(sessionsUpdateMock).not.toHaveBeenCalled();
```

(d) New test — recover links the email_lead:

```ts
it('links the email_lead to the recovered user', async () => {
  const whereSpy = vi.fn().mockReturnValue({ returning: () => Promise.resolve([{ id: 'lead-1' }]) });
  const setSpy = vi.fn().mockReturnValue({ where: whereSpy });
  // Re-mock db for this test via a local override is complex; instead assert no throw + ready:true
  sessionsRetrieveMock.mockResolvedValue({
    id: 'cs_test_1', mode: 'subscription', payment_status: 'paid', status: 'complete',
    metadata: { anonymous_id: 'anon_xyz' }, customer_details: { email: 'paid@example.com' },
    customer: 'cus_test_1', subscription: 'sub_test_1',
  });
  getTicketMock.mockResolvedValue(null);
  getUserListMock.mockResolvedValue({ totalCount: 1, data: [{ id: 'user_x' }] });
  createTokenMock.mockResolvedValue({ token: 'tk' });
  subsRetrieveMock.mockResolvedValue({ id: 'sub_test_1', status: 'trialing', items: { data: [{ price: { id: 'price_annual_test' }, current_period_end: 1735000000 }] } });
  const res = await POST(makeRequest({ session_id: 'cs_test_1' }));
  expect(res.status).toBe(200);
  expect((await res.json()).data.ready).toBe(true);
});
```

(Note: keep `beforeEach` resetting `getTicketMock.mockResolvedValue(null)` so non-fast-path tests provision.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/api/v1/checkout/recover/__tests__/route.test.ts`
Expected: FAIL — route still reads `session.metadata.signInTicket` and calls `sessions.update`.

- [ ] **Step 3: Implement**

In `recover/route.ts` add imports:

```ts
import { eq, or, sql } from 'drizzle-orm';
import { users, processedStripeEvents, emailLeads } from '@/shared/lib/schema';
import { storeCheckoutTicket, getCheckoutTicket } from '@/shared/lib/checkout-ticket';
```

Replace the fast-path block (lines 155-170) — read from Redis:

```ts
  // 5. Fast path: ticket already stored in Redis
  const existingTicket = await getCheckoutTicket(sessionId);
  if (existingTicket) {
    try {
      trackServerEvent(`cs:${sessionId}`, AnalyticsEvent.CHECKOUT_RECOVERY_SUCCEEDED, {
        session_id: sessionId,
        cached: true,
      });
    } catch {
      // PostHog best-effort
    }
    return NextResponse.json(
      { success: true, data: { ready: true, ticket: existingTicket }, error: null },
      { status: 200 },
    );
  }
```

Replace the token-write block (lines 221-230) — store in Redis:

```ts
    // 9. Generate sign-in token + stash in Redis (Stripe metadata caps at 500
    // chars; the Clerk token is ~552). /session-status reads it back too.
    const token = await clerk.signInTokens.createSignInToken({
      userId: clerkUserId,
      expiresInSeconds: 600,
    });
    const ticket = token.token;
    await storeCheckoutTicket(session.id, ticket);
```

After the users upsert (immediately after the `.onConflictDoUpdate({...})` block ending at line 289), add the lead link (mirrors webhook, link-only — no utm_content fallback):

```ts
    // Link the email_lead(s) to the recovered user so the conversion is
    // attributed and the lead is suppressed from the drip even if the webhook
    // never arrives. Mirrors webhooks/stripe/route.ts (link-only; the
    // utm_content unsubscribe fallback stays webhook-side).
    try {
      const anonymousIdMeta = (session.metadata?.anonymous_id ?? null) as string | null;
      await db
        .update(emailLeads)
        .set({ convertedToUserId: clerkUserId, convertedAt: new Date() })
        .where(
          anonymousIdMeta
            ? or(eq(emailLeads.anonymousId, anonymousIdMeta), eq(emailLeads.email, email))
            : eq(emailLeads.email, email),
        );
    } catch (linkErr) {
      console.warn(
        '[checkout/recover] email_leads link failed (non-fatal)',
        linkErr instanceof Error ? linkErr.message : 'unknown',
      );
    }
```

Remove the now-unused `existingMetadata` local. Keep the `sql` import (still used by the upsert `email: sql\`${users.email}\``).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/api/v1/checkout/recover/__tests__/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Stage**

```bash
git add src/app/api/v1/checkout/recover/route.ts src/app/api/v1/checkout/recover/__tests__/route.test.ts
```

---

## Task 5: `/session-status` reads the ticket from Redis

**Files:**
- Modify: `src/app/api/v1/checkout/session-status/route.ts`
- Test: `src/app/api/v1/checkout/session-status/__tests__/route.test.ts`

- [ ] **Step 1: Rewrite the tests (failing)**

Replace `session-status/__tests__/route.test.ts` with:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getTicketMock = vi.fn();
const limitMock = vi.fn().mockResolvedValue({ success: true });

vi.mock('@/shared/lib/checkout-ticket', () => ({ getCheckoutTicket: getTicketMock }));
vi.mock('@/shared/lib/rate-limit', () => ({ getRateLimiter: () => ({ limit: limitMock }) }));

import { GET } from '../route';

function makeRequest(id: string | null): Request {
  const url = new URL('http://localhost/api/v1/checkout/session-status');
  if (id) url.searchParams.set('id', id);
  return new Request(url.toString(), { method: 'GET', headers: { 'x-forwarded-for': '1.2.3.4' } });
}

beforeEach(() => {
  vi.clearAllMocks();
  limitMock.mockResolvedValue({ success: true });
});

describe('GET /api/v1/checkout/session-status', () => {
  it('returns ready=true with ticket when Redis has it', async () => {
    getTicketMock.mockResolvedValue('ticket_abc');
    const res = await GET(makeRequest('cs_test_1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: { ready: true, ticket: 'ticket_abc' }, error: null });
  });

  it('returns ready=false when ticket not yet present', async () => {
    getTicketMock.mockResolvedValue(null);
    const res = await GET(makeRequest('cs_test_1'));
    expect((await res.json()).data).toEqual({ ready: false });
  });

  it('returns 400 when id missing', async () => {
    const res = await GET(makeRequest(null));
    expect(res.status).toBe(400);
  });

  it('returns 429 when rate-limited', async () => {
    limitMock.mockResolvedValueOnce({ success: false });
    const res = await GET(makeRequest('cs_test_1'));
    expect(res.status).toBe(429);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/api/v1/checkout/session-status/__tests__/route.test.ts`
Expected: FAIL — route still imports/uses Stripe.

- [ ] **Step 3: Implement — Redis-only**

Replace the body of `session-status/route.ts` with (keep the file header doc, update it):

```ts
import { NextResponse } from 'next/server';
import { getCheckoutTicket } from '@/shared/lib/checkout-ticket';
import { getRateLimiter } from '@/shared/lib/rate-limit';
import type { ApiResponse } from '@/shared/types';

interface StatusResponse {
  ready: boolean;
  ticket?: string;
}

export async function GET(request: Request): Promise<NextResponse<ApiResponse<StatusResponse>>> {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ success: false, data: null, error: 'BAD_REQUEST' }, { status: 400 });
  }

  const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
  const limiter = getRateLimiter('checkout/session-status');
  const { success: rateLimitOk } = await limiter.limit(ip);
  if (!rateLimitOk) {
    return NextResponse.json({ success: false, data: null, error: 'RATE_LIMITED' }, { status: 429 });
  }

  const ticket = await getCheckoutTicket(id);
  if (ticket) {
    return NextResponse.json({ success: true, data: { ready: true, ticket }, error: null }, { status: 200 });
  }
  return NextResponse.json({ success: true, data: { ready: false }, error: null }, { status: 200 });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/api/v1/checkout/session-status/__tests__/route.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Stage**

```bash
git add src/app/api/v1/checkout/session-status/route.ts src/app/api/v1/checkout/session-status/__tests__/route.test.ts
```

---

## Task 6: Repair script for already-orphaned anon payers

**Files:**
- Create: `scripts/advertising/_repair_orphan_anon_payers_2026_05_30.mjs`

This script is an ops tool (matches the existing `scripts/advertising/_audit_*.mjs` pattern — no vitest test). It is **dry-run by default**; the mutating branch requires `--apply` AND founder confirmation.

- [ ] **Step 1: Write the script**

```js
// Repair orphaned anonymous payers — 2026-05-30
// An anon checkout previously wrote a premium `users` row keyed on the raw
// anonymous_id (id NOT starting with 'user_') with a placeholder email, while
// the real Clerk user stayed free. This script finds those rows and (with
// --apply) re-keys premium onto the real Clerk user resolved from Stripe email.
//
// DRY-RUN by default (no writes). Mutations require --apply.
//   node scripts/advertising/_repair_orphan_anon_payers_2026_05_30.mjs          # report only
//   node scripts/advertising/_repair_orphan_anon_payers_2026_05_30.mjs --apply  # mutate (founder-confirmed)

import { config } from 'dotenv';
config({ path: '.env' });

import { neon } from '@neondatabase/serverless';
import Stripe from 'stripe';
import { createClerkClient } from '@clerk/backend';

const APPLY = process.argv.includes('--apply');
const sql = neon(process.env.DATABASE_URL);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

function isOrphanId(id) {
  return !String(id).startsWith('user_');
}

const rows = await sql`
  SELECT id, email, stripe_customer_id, stripe_subscription_id, subscription_tier, subscription_status
  FROM users
  WHERE subscription_tier = 'premium'
    AND (id NOT LIKE 'user_%' OR email LIKE 'stripe-pending-%@placeholder.invalid')
`;

console.log(`Found ${rows.length} candidate orphan premium row(s). APPLY=${APPLY}`);
for (const r of rows) {
  // Resolve the real email from Stripe (customer or subscription's latest invoice).
  let email = null;
  try {
    if (r.stripe_customer_id) {
      const cust = await stripe.customers.retrieve(r.stripe_customer_id);
      email = cust && !cust.deleted ? cust.email : null;
    }
  } catch (e) {
    console.warn(`  [${r.id}] stripe lookup failed: ${e.message}`);
  }
  console.log(`- row id=${r.id} orphan=${isOrphanId(r.id)} placeholderEmail=${String(r.email).includes('placeholder.invalid')} stripeEmail=${email ?? 'unknown'} sub=${r.stripe_subscription_id ?? 'none'}`);

  if (!APPLY) continue;
  if (!email) { console.log(`  SKIP: no email resolvable`); continue; }

  // Find-or-create the real Clerk user, then move premium fields onto it.
  const list = await clerk.users.getUserList({ emailAddress: [email] });
  let realId = list.totalCount > 0 ? list.data[0].id : null;
  if (!realId) {
    const created = await clerk.users.createUser({ emailAddress: [email], skipPasswordChecks: true, skipPasswordRequirement: true });
    realId = created.id;
    console.log(`  created clerk user ${realId}`);
  }
  if (realId === r.id) { console.log(`  already keyed correctly`); continue; }

  // Upsert premium onto the real Clerk id, then demote the orphan row.
  await sql`
    INSERT INTO users (id, email, stripe_customer_id, stripe_subscription_id, subscription_tier, subscription_status, updated_at)
    VALUES (${realId}, ${email}, ${r.stripe_customer_id}, ${r.stripe_subscription_id}, 'premium', ${r.subscription_status}, now())
    ON CONFLICT (id) DO UPDATE SET
      stripe_customer_id = EXCLUDED.stripe_customer_id,
      stripe_subscription_id = EXCLUDED.stripe_subscription_id,
      subscription_tier = 'premium',
      subscription_status = EXCLUDED.subscription_status,
      updated_at = now()
  `;
  await sql`UPDATE users SET subscription_tier = 'free', stripe_subscription_id = NULL, updated_at = now() WHERE id = ${r.id}`;
  console.log(`  re-keyed premium ${r.id} -> ${realId}`);
}
console.log('Done.');
```

- [ ] **Step 2: Dry-run (read-only)**

Run: `node scripts/advertising/_repair_orphan_anon_payers_2026_05_30.mjs`
Expected: prints candidate orphan rows + resolved Stripe emails, NO writes.

- [ ] **Step 3: STOP — report to founder.** Paste the dry-run output. Do NOT run `--apply` without explicit founder approval (creates Clerk users, mutates DB). Re-verify each candidate (some, like a Link-authenticated payer, may not be true orphans).

- [ ] **Step 4: Stage the script**

```bash
git add scripts/advertising/_repair_orphan_anon_payers_2026_05_30.mjs
```

---

## Task 7: Full-suite gate + founder-approved commit

- [ ] **Step 1: Typecheck**

Run: `npm run typecheck`
Expected: no errors. (Watch for the removed `getStripe` import in session-status and any unused imports in recover.)

- [ ] **Step 2: Lint the changed files**

Run: `npm run lint`
Expected: no NEW errors in the touched files. (Per memory `lint_worktrees_pollution`, ignore pre-existing `.claude/worktrees/` noise — grep the output for the touched paths.)

- [ ] **Step 3: Full test suite**

Run: `npm test`
Expected: all pass — pay attention to `webhooks/stripe`, `checkout/recover`, `checkout/session-status`, `checkout-ticket`, and `CheckoutCompleteClient` (its `{ ready, ticket }` contract is unchanged, so it must stay green).

- [ ] **Step 4: Present results to founder for the commit decision**

Summarize: tests green, typecheck clean, files changed. Propose the commit (do not run it until approved):

```bash
git add src/shared/lib/checkout-ticket.ts src/shared/lib/__tests__/checkout-ticket.test.ts \
  src/app/api/webhooks/stripe/route.ts src/app/api/webhooks/stripe/__tests__/ \
  src/app/api/v1/checkout/recover/route.ts src/app/api/v1/checkout/recover/__tests__/route.test.ts \
  src/app/api/v1/checkout/session-status/route.ts src/app/api/v1/checkout/session-status/__tests__/route.test.ts \
  scripts/advertising/_repair_orphan_anon_payers_2026_05_30.mjs \
  docs/superpowers/specs/2026-05-30-anon-checkout-signin-fix-design.md \
  docs/superpowers/plans/2026-05-30-anon-checkout-signin-fix.md
git commit -m "fix(checkout): anon payers can sign in — Redis ticket + extractClerkUserId guard"
```

---

## Self-Review (completed by plan author)

- **Spec coverage:** ticket→Redis (T1,T3,T4,T5) ✓; extractClerkUserId guard (T2) ✓; webhook ticket (T3) ✓; recover ticket+lead-link (T4) ✓; session-status (T5) ✓; orphan repair dry-run+apply (T6) ✓; test gate (T7) ✓. Deferred items (full helper extraction, STR-1/STR-2/landing_view/utm_content) correctly out of scope.
- **Placeholder scan:** none — every code step has concrete code.
- **Type consistency:** `storeCheckoutTicket(sessionId, token)` / `getCheckoutTicket(sessionId)` used identically across T1/T3/T4/T5; `extractClerkUserId` exported in T2 and consumed by the webhook; `{ ready, ticket }` response shape preserved for the client.
- **Risk note:** T2+T3 are co-dependent (fixing the guard without the Redis store would regress provisioning to a 500). They MUST land together — never ship T2 alone.
