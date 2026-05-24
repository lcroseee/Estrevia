# Checkout Recovery on Timeout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the client-side 30s checkout-complete poll times out, call Stripe directly to verify payment and synchronously provision the Clerk user + sign-in ticket + DB row, instead of leaving the paying user with a dead-end "check email" message.

**Architecture:** New `POST /api/v1/checkout/recover` endpoint. Client `CheckoutCompleteClient` calls it as a last resort. No refactor of webhook handler — recovery does only the minimum (Clerk user + ticket + DB), webhook keeps doing all side effects (PostHog/CAPI/email). Idempotent via Clerk find-or-create + DB upsert + ticket cache.

**Tech Stack:** Next.js 16 App Router, TypeScript 6 strict, Vitest, Zod, Stripe SDK v22, Clerk, Drizzle (Neon Postgres), Upstash rate-limit.

**Spec:** [`docs/superpowers/specs/2026-05-24-checkout-recovery-on-timeout-design.md`](../specs/2026-05-24-checkout-recovery-on-timeout-design.md)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/shared/lib/analytics.ts` | Modify (+3 lines) | 3 new event constants |
| `src/shared/lib/rate-limit.ts` | Modify (+5 lines) | Rate limiter for new route |
| `src/app/api/v1/checkout/recover/route.ts` | **Create** (~210 lines) | POST handler — verify session paid, provision Clerk user + ticket + DB |
| `src/app/api/v1/checkout/recover/__tests__/route.test.ts` | **Create** (~240 lines) | Unit tests for all branches |
| `src/app/[locale]/checkout/complete/CheckoutCompleteClient.tsx` | Modify (~+25 lines) | On 30s timeout, call recover endpoint before showing fallback |
| `src/app/[locale]/checkout/complete/__tests__/CheckoutCompleteClient.test.tsx` | Modify (+~80 lines) | 2 new test cases for recovery integration |

---

## Task 1: Analytics Events + Rate Limit Entry

Add the 3 new event constants and a rate-limit slot. Pure config — no tests added (existing `analytics.ts` has no test file; constants are validated by usage in Tasks 2 & 3).

**Files:**
- Modify: `src/shared/lib/analytics.ts:241-243`
- Modify: `src/shared/lib/rate-limit.ts:74-78`

- [ ] **Step 1: Add 3 event constants to analytics.ts**

Read lines 240-244 first to anchor the edit, then insert 3 new constants between `CHECKOUT_TICKET_TIMEOUT` and `CHECKOUT_ERROR`:

Replace:
```ts
  CHECKOUT_TICKET_TIMEOUT: 'checkout_ticket_timeout',
  CHECKOUT_ERROR: 'checkout_error',
```

With:
```ts
  CHECKOUT_TICKET_TIMEOUT: 'checkout_ticket_timeout',
  CHECKOUT_RECOVERY_ATTEMPTED: 'checkout_recovery_attempted',
  CHECKOUT_RECOVERY_SUCCEEDED: 'checkout_recovery_succeeded',
  CHECKOUT_RECOVERY_FAILED: 'checkout_recovery_failed',
  CHECKOUT_ERROR: 'checkout_error',
```

- [ ] **Step 2: Add rate-limit entry to rate-limit.ts**

Insert after `'checkout/session-status'` block (line 74-78):

Find:
```ts
  'checkout/session-status': new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(30, '1m'),
    prefix: 'rl:checkout/session-status',
  }),
```

And add immediately after it:
```ts
  'checkout/recover': new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, '1m'),
    prefix: 'rl:checkout/recover',
  }),
```

- [ ] **Step 3: Verify typecheck still passes**

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/shared/lib/analytics.ts src/shared/lib/rate-limit.ts
git commit -m "feat(checkout-recovery/T1): add 3 PostHog events + rate-limit slot

CHECKOUT_RECOVERY_ATTEMPTED / SUCCEEDED / FAILED for observability on
the /api/v1/checkout/recover endpoint introduced in T2. Rate limit
5 req/min per IP (one legitimate user needs 1-2 calls).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Recover Route + Tests (TDD)

Implement the new POST endpoint. Write tests first (red), then implementation (green).

**Files:**
- Create: `src/app/api/v1/checkout/recover/route.ts`
- Create: `src/app/api/v1/checkout/recover/__tests__/route.test.ts`

- [ ] **Step 1: Create test file with all 10 cases (will fail — route doesn't exist)**

Write to `src/app/api/v1/checkout/recover/__tests__/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks: collected at top, reset in beforeEach.
// ---------------------------------------------------------------------------
const sessionsRetrieveMock = vi.fn();
const sessionsUpdateMock = vi.fn();
const subsRetrieveMock = vi.fn();
const getUserListMock = vi.fn();
const createUserMock = vi.fn();
const createTokenMock = vi.fn();
const limitMock = vi.fn().mockResolvedValue({ success: true });
const trackServerEventMock = vi.fn();
const dbInsertValuesOnConflictDoUpdateMock = vi.fn().mockResolvedValue(undefined);
const dbInsertValuesOnConflictDoNothingMock = vi.fn().mockResolvedValue(undefined);

vi.mock('@/shared/lib/stripe', () => ({
  getStripe: () => ({
    checkout: {
      sessions: {
        retrieve: sessionsRetrieveMock,
        update: sessionsUpdateMock,
      },
    },
    subscriptions: { retrieve: subsRetrieveMock },
  }),
}));

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: async () => ({
    users: { getUserList: getUserListMock, createUser: createUserMock },
    signInTokens: { createSignInToken: createTokenMock },
  }),
}));

vi.mock('@/shared/lib/db', () => ({
  getDb: () => ({
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: dbInsertValuesOnConflictDoUpdateMock,
        onConflictDoNothing: dbInsertValuesOnConflictDoNothingMock,
      }),
    }),
  }),
}));

vi.mock('@/shared/lib/rate-limit', () => ({
  getRateLimiter: () => ({ limit: limitMock }),
}));

vi.mock('@/shared/lib/analytics', () => ({
  trackServerEvent: trackServerEventMock,
  AnalyticsEvent: {
    CHECKOUT_RECOVERY_ATTEMPTED: 'checkout_recovery_attempted',
    CHECKOUT_RECOVERY_SUCCEEDED: 'checkout_recovery_succeeded',
    CHECKOUT_RECOVERY_FAILED: 'checkout_recovery_failed',
  },
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

// Import after mocks are registered.
import { POST } from '../route';

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/v1/checkout/recover', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  limitMock.mockResolvedValue({ success: true });
  dbInsertValuesOnConflictDoUpdateMock.mockResolvedValue(undefined);
  dbInsertValuesOnConflictDoNothingMock.mockResolvedValue(undefined);
  process.env.STRIPE_PRICE_ID_PRO_ANNUAL = 'price_annual_test';
});

describe('POST /api/v1/checkout/recover', () => {
  it('returns 400 when body is missing session_id', async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toEqual({ success: false, data: null, error: 'BAD_REQUEST' });
  });

  it('returns 400 when session_id is malformed (no cs_ prefix)', async () => {
    const res = await POST(makeRequest({ session_id: 'not_a_session' }));
    expect(res.status).toBe(400);
  });

  it('returns 429 when rate-limited', async () => {
    limitMock.mockResolvedValueOnce({ success: false });
    const res = await POST(makeRequest({ session_id: 'cs_test_1' }));
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error).toBe('RATE_LIMITED');
  });

  it('returns 404 when Stripe says session does not exist', async () => {
    sessionsRetrieveMock.mockRejectedValue({
      type: 'StripeInvalidRequestError',
      code: 'resource_missing',
    });
    const res = await POST(makeRequest({ session_id: 'cs_nonexistent' }));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('NOT_FOUND');
  });

  it('returns ready=false when session payment_status is not paid', async () => {
    sessionsRetrieveMock.mockResolvedValue({
      id: 'cs_test_1',
      mode: 'subscription',
      payment_status: 'unpaid',
      status: 'open',
      metadata: {},
      customer_details: { email: 'u@example.com' },
    });
    const res = await POST(makeRequest({ session_id: 'cs_test_1' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toEqual({ ready: false });
    // Must NOT have called Clerk
    expect(getUserListMock).not.toHaveBeenCalled();
  });

  it('returns ready=false when session mode is not subscription', async () => {
    sessionsRetrieveMock.mockResolvedValue({
      id: 'cs_test_1',
      mode: 'payment',
      payment_status: 'paid',
      status: 'complete',
      metadata: {},
      customer_details: { email: 'u@example.com' },
    });
    const res = await POST(makeRequest({ session_id: 'cs_test_1' }));
    const json = await res.json();
    expect(json.data).toEqual({ ready: false });
    expect(getUserListMock).not.toHaveBeenCalled();
  });

  it('fast-path: returns existing ticket when session metadata.signInTicket already set', async () => {
    sessionsRetrieveMock.mockResolvedValue({
      id: 'cs_test_1',
      mode: 'subscription',
      payment_status: 'paid',
      status: 'complete',
      metadata: { signInTicket: 'ticket_already_here' },
      customer_details: { email: 'u@example.com' },
    });
    const res = await POST(makeRequest({ session_id: 'cs_test_1' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toEqual({ ready: true, ticket: 'ticket_already_here' });
    // Must NOT have called Clerk (fast path)
    expect(getUserListMock).not.toHaveBeenCalled();
    expect(createTokenMock).not.toHaveBeenCalled();
    // Must fire SUCCEEDED with cached=true
    expect(trackServerEventMock).toHaveBeenCalledWith(
      expect.stringContaining('cs:cs_test_1'),
      'checkout_recovery_succeeded',
      expect.objectContaining({ cached: true }),
    );
  });

  it('provisions: creates Clerk user when none exists, generates ticket, upserts DB', async () => {
    sessionsRetrieveMock.mockResolvedValue({
      id: 'cs_test_1',
      mode: 'subscription',
      payment_status: 'paid',
      status: 'complete',
      metadata: { anonymous_id: 'anon_xyz' },
      customer_details: { email: 'paid@example.com' },
      customer: 'cus_test_1',
      subscription: 'sub_test_1',
    });
    getUserListMock.mockResolvedValue({ totalCount: 0, data: [] });
    createUserMock.mockResolvedValue({ id: 'user_new_123' });
    createTokenMock.mockResolvedValue({ token: 'ticket_fresh' });
    subsRetrieveMock.mockResolvedValue({
      id: 'sub_test_1',
      status: 'trialing',
      trial_end: 1735000000,
      items: { data: [{ price: { id: 'price_annual_test' }, current_period_end: 1735000000 }] },
    });

    const res = await POST(makeRequest({ session_id: 'cs_test_1' }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toEqual({ ready: true, ticket: 'ticket_fresh' });

    // Clerk find-or-create flow
    expect(getUserListMock).toHaveBeenCalledWith({ emailAddress: ['paid@example.com'] });
    expect(createUserMock).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAddress: ['paid@example.com'],
        externalId: 'stripe:cs_test_1',
      }),
    );
    // Ticket generated
    expect(createTokenMock).toHaveBeenCalledWith({
      userId: 'user_new_123',
      expiresInSeconds: 600,
    });
    // Stripe metadata updated
    expect(sessionsUpdateMock).toHaveBeenCalledWith(
      'cs_test_1',
      expect.objectContaining({
        metadata: expect.objectContaining({ signInTicket: 'ticket_fresh' }),
      }),
    );
    // DB upsert called (users + recovery marker)
    expect(dbInsertValuesOnConflictDoUpdateMock).toHaveBeenCalledTimes(1);
    expect(dbInsertValuesOnConflictDoNothingMock).toHaveBeenCalledTimes(1);
    // Telemetry
    expect(trackServerEventMock).toHaveBeenCalledWith(
      expect.stringContaining('cs:cs_test_1'),
      'checkout_recovery_attempted',
      expect.objectContaining({ session_id: 'cs_test_1' }),
    );
    expect(trackServerEventMock).toHaveBeenCalledWith(
      'user_new_123',
      'checkout_recovery_succeeded',
      expect.objectContaining({ cached: false }),
    );
  });

  it('provisions: reuses existing Clerk user (find-only, no create)', async () => {
    sessionsRetrieveMock.mockResolvedValue({
      id: 'cs_test_1',
      mode: 'subscription',
      payment_status: 'paid',
      status: 'complete',
      metadata: {},
      customer_details: { email: 'returning@example.com' },
      customer: 'cus_test_1',
      subscription: 'sub_test_1',
    });
    getUserListMock.mockResolvedValue({ totalCount: 1, data: [{ id: 'user_existing_42' }] });
    createTokenMock.mockResolvedValue({ token: 'ticket_ret' });
    subsRetrieveMock.mockResolvedValue({
      id: 'sub_test_1',
      status: 'active',
      items: { data: [{ price: { id: 'price_annual_test' }, current_period_end: 1735000000 }] },
    });

    const res = await POST(makeRequest({ session_id: 'cs_test_1' }));
    const json = await res.json();
    expect(json.data.ready).toBe(true);
    expect(createUserMock).not.toHaveBeenCalled();
    expect(createTokenMock).toHaveBeenCalledWith({
      userId: 'user_existing_42',
      expiresInSeconds: 600,
    });
  });

  it('provisions: handles Clerk race (createUser fails, retry getUserList finds it)', async () => {
    sessionsRetrieveMock.mockResolvedValue({
      id: 'cs_test_1',
      mode: 'subscription',
      payment_status: 'paid',
      status: 'complete',
      metadata: {},
      customer_details: { email: 'race@example.com' },
      customer: 'cus_test_1',
      subscription: 'sub_test_1',
    });
    // First call: not found. Second call (retry): found.
    getUserListMock
      .mockResolvedValueOnce({ totalCount: 0, data: [] })
      .mockResolvedValueOnce({ totalCount: 1, data: [{ id: 'user_raced' }] });
    createUserMock.mockRejectedValue(new Error('email already exists'));
    createTokenMock.mockResolvedValue({ token: 'ticket_race' });
    subsRetrieveMock.mockResolvedValue({
      id: 'sub_test_1',
      status: 'trialing',
      items: { data: [{ price: { id: 'price_annual_test' }, current_period_end: 1735000000 }] },
    });

    const res = await POST(makeRequest({ session_id: 'cs_test_1' }));
    const json = await res.json();
    expect(json.data.ready).toBe(true);
    expect(json.data.ticket).toBe('ticket_race');
    expect(getUserListMock).toHaveBeenCalledTimes(2);
    expect(createTokenMock).toHaveBeenCalledWith({
      userId: 'user_raced',
      expiresInSeconds: 600,
    });
  });

  it('returns 400 when paid session has no customer email', async () => {
    sessionsRetrieveMock.mockResolvedValue({
      id: 'cs_test_1',
      mode: 'subscription',
      payment_status: 'paid',
      status: 'complete',
      metadata: {},
      customer_details: { email: null },
    });
    const res = await POST(makeRequest({ session_id: 'cs_test_1' }));
    expect(res.status).toBe(400);
    expect(getUserListMock).not.toHaveBeenCalled();
  });

  it('returns 500 + fires FAILED telemetry when Clerk throws unexpectedly', async () => {
    sessionsRetrieveMock.mockResolvedValue({
      id: 'cs_test_1',
      mode: 'subscription',
      payment_status: 'paid',
      status: 'complete',
      metadata: {},
      customer_details: { email: 'broken@example.com' },
      customer: 'cus_test_1',
      subscription: 'sub_test_1',
    });
    getUserListMock.mockRejectedValue(new Error('Clerk API down'));

    const res = await POST(makeRequest({ session_id: 'cs_test_1' }));
    expect(res.status).toBe(500);
    expect(trackServerEventMock).toHaveBeenCalledWith(
      expect.stringContaining('cs:cs_test_1'),
      'checkout_recovery_failed',
      expect.objectContaining({ session_id: 'cs_test_1' }),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail (route doesn't exist yet)**

Run: `npx vitest run src/app/api/v1/checkout/recover/__tests__/route.test.ts`
Expected: ALL tests FAIL with "Cannot find module '../route'" or similar import error.

- [ ] **Step 3: Implement the route**

Write to `src/app/api/v1/checkout/recover/route.ts`:

```ts
/**
 * POST /api/v1/checkout/recover
 *
 * Last-resort safety net for /checkout/complete. When the client-side 30s poll
 * for a Clerk sign-in ticket times out (Stripe webhook delayed or dropped),
 * this endpoint asks Stripe directly whether the session is paid and
 * synchronously provisions the user.
 *
 * Mirrors the webhook handler's `checkout.session.completed` essentials —
 * Clerk find-or-create, sign-in ticket, DB upsert — but skips webhook-only
 * side effects (PostHog subscription_started, Meta CAPI Subscribe, Resend
 * purchase email). Those fire when (if) the webhook eventually arrives.
 *
 * Idempotent via:
 *   - Clerk find-or-create with race recovery
 *   - DB upsert (onConflictDoUpdate)
 *   - Fast-path step skipping if signInTicket already in session metadata
 *   - `recovery:<session_id>` marker row in processed_stripe_events
 *
 * Public endpoint, rate-limited by IP. The Stripe session_id IS the
 * authorization (only the paying user has it from the redirect).
 *
 * IMPORTANT: if you change the users upsert in webhooks/stripe/route.ts
 * `case 'checkout.session.completed'`, mirror the change here OR explicitly
 * decide the divergence is intentional.
 */

import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type Stripe from 'stripe';
import { clerkClient } from '@clerk/nextjs/server';
import { getStripe } from '@/shared/lib/stripe';
import { getDb } from '@/shared/lib/db';
import { users, processedStripeEvents } from '@/shared/lib/schema';
import { getRateLimiter } from '@/shared/lib/rate-limit';
import { trackServerEvent, AnalyticsEvent } from '@/shared/lib/analytics';
import type { ApiResponse } from '@/shared/types';

const bodySchema = z.object({
  session_id: z.string().min(1).startsWith('cs_'),
});

interface RecoverResponse {
  ready: boolean;
  ticket?: string;
}

type DbSubscriptionStatus =
  | 'free'
  | 'trialing'
  | 'active'
  | 'canceled'
  | 'past_due'
  | 'incomplete'
  | 'unpaid';

function periodEndToDate(p: number | null | undefined): Date | null {
  if (!p) return null;
  return new Date(p * 1000);
}

function derivePlan(sub: Stripe.Subscription): 'free' | 'pro_monthly' | 'pro_annual' {
  const priceId = sub.items?.data?.[0]?.price?.id;
  if (priceId === process.env.STRIPE_PRICE_ID_PRO_MONTHLY) return 'pro_monthly';
  if (priceId === process.env.STRIPE_PRICE_ID_PRO_ANNUAL) return 'pro_annual';
  if (priceId === process.env.STRIPE_PRICE_ID) return 'pro_monthly';
  return 'free';
}

function getSubPeriodEnd(sub: Stripe.Subscription): number | null {
  return sub.items?.data?.[0]?.current_period_end ?? null;
}

function toDbStatus(s: string): DbSubscriptionStatus {
  const allowed: DbSubscriptionStatus[] = [
    'free',
    'trialing',
    'active',
    'canceled',
    'past_due',
    'incomplete',
    'unpaid',
  ];
  if ((allowed as string[]).includes(s)) return s as DbSubscriptionStatus;
  return 'canceled';
}

export async function POST(
  request: Request,
): Promise<NextResponse<ApiResponse<RecoverResponse>>> {
  // 1. Rate limit by IP
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
  const limiter = getRateLimiter('checkout/recover');
  const { success: rateLimitOk } = await limiter.limit(ip);
  if (!rateLimitOk) {
    return NextResponse.json(
      { success: false, data: null, error: 'RATE_LIMITED' },
      { status: 429 },
    );
  }

  // 2. Parse body
  let sessionId: string;
  try {
    const body = await request.json();
    sessionId = bodySchema.parse(body).session_id;
  } catch {
    return NextResponse.json(
      { success: false, data: null, error: 'BAD_REQUEST' },
      { status: 400 },
    );
  }

  // 3. Retrieve Stripe session
  let session: Stripe.Checkout.Session;
  const stripe = getStripe();
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === 'resource_missing') {
      return NextResponse.json(
        { success: false, data: null, error: 'NOT_FOUND' },
        { status: 404 },
      );
    }
    console.error(
      '[checkout/recover] stripe retrieve failed',
      err instanceof Error ? err.message : 'unknown',
    );
    try {
      const { captureException } = await import('@sentry/nextjs');
      captureException(err, {
        tags: { route: 'checkout/recover', stage: 'stripe-retrieve' },
      });
    } catch {
      // Sentry best-effort
    }
    return NextResponse.json(
      { success: false, data: null, error: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }

  // 4. Guards: must be paid + subscription mode
  const isPaid = session.payment_status === 'paid' || session.status === 'complete';
  if (!isPaid || session.mode !== 'subscription') {
    return NextResponse.json(
      { success: true, data: { ready: false }, error: null },
      { status: 200 },
    );
  }

  // 5. Fast path: ticket already cached on session
  const existingTicket = session.metadata?.signInTicket;
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

  // 6. Need to provision — emit attempt event
  try {
    trackServerEvent(`cs:${sessionId}`, AnalyticsEvent.CHECKOUT_RECOVERY_ATTEMPTED, {
      session_id: sessionId,
    });
  } catch {
    // PostHog best-effort
  }

  // 7. Extract email
  const email = session.customer_details?.email;
  if (!email) {
    console.warn('[checkout/recover] no email on paid session', { sessionId });
    return NextResponse.json(
      { success: false, data: null, error: 'BAD_REQUEST' },
      { status: 400 },
    );
  }

  // 8-12. Provisioning block
  const db = getDb();
  try {
    const clerk = await clerkClient();

    // 8. Clerk find-or-create with race recovery
    let clerkUserId: string;
    const existing = await clerk.users.getUserList({ emailAddress: [email] });
    if (existing.totalCount > 0) {
      clerkUserId = existing.data[0].id;
    } else {
      try {
        const newUser = await clerk.users.createUser({
          emailAddress: [email],
          skipPasswordChecks: true,
          skipPasswordRequirement: true,
          externalId: `stripe:${session.id}`,
        });
        clerkUserId = newUser.id;
      } catch (createErr) {
        // Race: webhook (or another recovery call) created the user concurrently.
        const retry = await clerk.users.getUserList({ emailAddress: [email] });
        if (retry.totalCount > 0) {
          clerkUserId = retry.data[0].id;
        } else {
          throw createErr;
        }
      }
    }

    // 9. Generate sign-in token + write to Stripe metadata
    const token = await clerk.signInTokens.createSignInToken({
      userId: clerkUserId,
      expiresInSeconds: 600,
    });
    const ticket = token.token;
    const existingMetadata = session.metadata ?? {};
    await stripe.checkout.sessions.update(session.id, {
      metadata: { ...existingMetadata, signInTicket: ticket },
    });

    // 10. Fetch subscription for accurate plan + expiry
    let expiresAt: Date | null = null;
    let plan: 'free' | 'pro_monthly' | 'pro_annual' = 'free';
    let subscriptionStatus: DbSubscriptionStatus = 'active';
    let trialEnd: Date | null = null;
    let stripeSubscriptionId: string | null = null;

    if (session.subscription) {
      const subId =
        typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription.id;
      const sub = await stripe.subscriptions.retrieve(subId, { expand: ['items'] });
      expiresAt = periodEndToDate(getSubPeriodEnd(sub));
      plan = derivePlan(sub);
      subscriptionStatus = toDbStatus(sub.status);
      trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000) : null;
      stripeSubscriptionId = sub.id;
    }

    const stripeCustomerId =
      typeof session.customer === 'string'
        ? session.customer
        : (session.customer?.id ?? null);

    // 11. DB upsert — mirrors webhook checkout.session.completed branch.
    // Email column: insert uses placeholder; on conflict preserves existing
    // real email via `sql\`${users.email}\``.
    await db
      .insert(users)
      .values({
        id: clerkUserId,
        email: `stripe-pending-${clerkUserId}@placeholder.invalid`,
        stripeCustomerId,
        stripeSubscriptionId,
        subscriptionTier: 'premium',
        subscriptionExpiresAt: expiresAt,
        plan,
        subscriptionStatus,
        trialEnd,
        currentPeriodEnd: expiresAt,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          stripeCustomerId,
          stripeSubscriptionId,
          subscriptionTier: 'premium',
          subscriptionExpiresAt: expiresAt,
          plan,
          subscriptionStatus,
          trialEnd,
          currentPeriodEnd: expiresAt,
          updatedAt: new Date(),
          email: sql`${users.email}`,
        },
      });

    // 12. Marker row for observability. `recovery:` prefix cannot collide with
    // real Stripe event IDs (which start with `evt_`).
    try {
      await db
        .insert(processedStripeEvents)
        .values({
          eventId: `recovery:${session.id}`,
          eventType: 'checkout.session.completed.recovery',
        })
        .onConflictDoNothing();
    } catch (markerErr) {
      console.warn(
        '[checkout/recover] marker row insert failed (non-fatal)',
        markerErr instanceof Error ? markerErr.message : 'unknown',
      );
    }

    try {
      trackServerEvent(clerkUserId, AnalyticsEvent.CHECKOUT_RECOVERY_SUCCEEDED, {
        session_id: sessionId,
        cached: false,
      });
    } catch {
      // PostHog best-effort
    }

    console.info('[checkout/recover] provisioned premium via recovery', {
      clerkUserId,
      sessionId,
      plan,
      subscriptionStatus,
    });

    return NextResponse.json(
      { success: true, data: { ready: true, ticket }, error: null },
      { status: 200 },
    );
  } catch (err) {
    console.error(
      '[checkout/recover] provisioning failed',
      err instanceof Error ? err.message : 'unknown',
    );
    try {
      const { captureException } = await import('@sentry/nextjs');
      captureException(err, {
        tags: { route: 'checkout/recover', stage: 'provision' },
      });
    } catch {
      // Sentry best-effort
    }
    try {
      trackServerEvent(`cs:${sessionId}`, AnalyticsEvent.CHECKOUT_RECOVERY_FAILED, {
        session_id: sessionId,
        reason: err instanceof Error ? err.message : 'unknown',
      });
    } catch {
      // PostHog best-effort
    }
    return NextResponse.json(
      { success: false, data: null, error: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/api/v1/checkout/recover/__tests__/route.test.ts`
Expected: All 12 tests PASS.

- [ ] **Step 5: Verify typecheck passes**

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/app/api/v1/checkout/recover/
git commit -m "feat(checkout-recovery/T2): POST /api/v1/checkout/recover endpoint

When the /checkout/complete client poll times out, this endpoint asks
Stripe directly whether the session is paid and synchronously provisions
the Clerk user + sign-in ticket + DB row. Mirrors webhook's checkout
.session.completed essentials but skips side effects (PostHog/CAPI/email
fire from webhook when it eventually arrives).

Idempotent via Clerk find-or-create + DB upsert + ticket cache fast-path
+ recovery:<session_id> marker row.

12 tests cover: bad body, rate limit, 404, not-paid guard, mode guard,
fast-path cache, fresh provision, existing user reuse, Clerk race
recovery, no-email guard, unexpected error → FAILED telemetry.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Client Wiring + Tests

Modify `CheckoutCompleteClient` to call the recovery endpoint on 30s timeout.

**Files:**
- Modify: `src/app/[locale]/checkout/complete/CheckoutCompleteClient.tsx:46-54`
- Modify: `src/app/[locale]/checkout/complete/__tests__/CheckoutCompleteClient.test.tsx`

- [ ] **Step 1: Add 3 new failing test cases to existing test file**

Open `src/app/[locale]/checkout/complete/__tests__/CheckoutCompleteClient.test.tsx`. Find the existing `describe('CheckoutCompleteClient', () => {` block. Replace the entire existing `fires CHECKOUT_TICKET_TIMEOUT and shows fallback after 30s` test with the updated test, AND add 3 new tests inside the same `describe` block.

Replace:
```ts
  it('fires CHECKOUT_TICKET_TIMEOUT and shows fallback after 30s', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { ready: false } }),
    });

    render(<CheckoutCompleteClient sessionId="cs_test_1" />);

    // 15 polls @ 2s = 30s; advance past the deadline to trigger timeout branch.
    // Wrap in act() so React flushes the setTimedOut(true) state update.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000);
    });

    expect(trackEventMock).toHaveBeenCalledWith(
      'checkout_ticket_timeout',
      expect.objectContaining({ session_id: 'cs_test_1' }),
    );
    // getByText throws if no match — a truthy return means the fallback rendered.
    expect(screen.getByText(/t:checkEmail/)).toBeTruthy();
  });
});
```

With:
```ts
  it('on 30s timeout, calls /recover and redirects when recovery returns ready=true', async () => {
    const setLoc = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        set href(v: string) {
          setLoc(v);
        },
      },
    });
    // All status-poll calls return ready=false; the final /recover call returns ready=true.
    fetchMock.mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('/recover')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: { ready: true, ticket: 'ticket_recovered' },
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({ success: true, data: { ready: false } }),
      };
    });

    render(<CheckoutCompleteClient sessionId="cs_test_1" />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000);
    });

    expect(trackEventMock).toHaveBeenCalledWith(
      'checkout_ticket_timeout',
      expect.objectContaining({ session_id: 'cs_test_1' }),
    );
    expect(setLoc).toHaveBeenCalledWith(
      '/sign-in?__clerk_ticket=ticket_recovered&redirect_url=%2Fsettings',
    );
    // Fallback UI must NOT render — recovery succeeded.
    expect(screen.queryByText(/t:checkEmail/)).toBeNull();
  });

  it('on 30s timeout, falls back to "check email" UI when /recover returns ready=false', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('/recover')) {
        return {
          ok: true,
          json: async () => ({ success: true, data: { ready: false } }),
        };
      }
      return {
        ok: true,
        json: async () => ({ success: true, data: { ready: false } }),
      };
    });

    render(<CheckoutCompleteClient sessionId="cs_test_1" />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000);
    });

    expect(trackEventMock).toHaveBeenCalledWith(
      'checkout_ticket_timeout',
      expect.objectContaining({ session_id: 'cs_test_1' }),
    );
    expect(screen.getByText(/t:checkEmail/)).toBeTruthy();
  });

  it('on 30s timeout, falls back to "check email" UI when /recover network call throws', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('/recover')) {
        throw new Error('network down');
      }
      return {
        ok: true,
        json: async () => ({ success: true, data: { ready: false } }),
      };
    });

    render(<CheckoutCompleteClient sessionId="cs_test_1" />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000);
    });

    expect(trackEventMock).toHaveBeenCalledWith(
      'checkout_ticket_timeout',
      expect.objectContaining({ session_id: 'cs_test_1' }),
    );
    expect(screen.getByText(/t:checkEmail/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify the 3 new tests fail (current client doesn't call /recover)**

Run: `npx vitest run src/app/[locale]/checkout/complete/__tests__/CheckoutCompleteClient.test.tsx`
Expected:
- "redirects to /sign-in when poll returns ready=true" → PASS (unchanged)
- "on 30s timeout, calls /recover and redirects when recovery returns ready=true" → FAIL
- "on 30s timeout, falls back to 'check email' UI when /recover returns ready=false" → may PASS coincidentally (no /recover call expected today, but `getByText(/t:checkEmail/)` will succeed)
- "on 30s timeout, falls back to 'check email' UI when /recover network call throws" → may PASS coincidentally

The critical failure is the first new test (recovery success → redirect).

- [ ] **Step 3: Modify CheckoutCompleteClient.tsx**

Open `src/app/[locale]/checkout/complete/CheckoutCompleteClient.tsx`. Replace the entire `useEffect` body (lines 24-60) with the recovery-aware version:

Replace:
```tsx
  useEffect(() => {
    const startedAt = Date.now();
    let cancelled = false;

    async function poll() {
      while (!cancelled && Date.now() - startedAt < POLL_MAX_MS) {
        try {
          const res = await fetch(
            `/api/v1/checkout/session-status?id=${encodeURIComponent(sessionId)}`,
          );
          if (res.ok) {
            const json = (await res.json()) as StatusResponseOk;
            if (json.success && json.data.ready && json.data.ticket) {
              const target = `/sign-in?__clerk_ticket=${encodeURIComponent(json.data.ticket)}&redirect_url=${encodeURIComponent('/settings')}`;
              window.location.href = target;
              return;
            }
          }
        } catch {
          // Network blip; keep polling until deadline.
        }
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      }
      if (!cancelled) {
        trackEvent(AnalyticsEvent.CHECKOUT_TICKET_TIMEOUT, {
          session_id: sessionId,
          waited_ms: Date.now() - startedAt,
        });
        setTimedOut(true);
      }
    }

    void poll();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);
```

With:
```tsx
  useEffect(() => {
    const startedAt = Date.now();
    let cancelled = false;

    function redirectWithTicket(ticket: string): void {
      const target = `/sign-in?__clerk_ticket=${encodeURIComponent(ticket)}&redirect_url=${encodeURIComponent('/settings')}`;
      window.location.href = target;
    }

    async function poll() {
      while (!cancelled && Date.now() - startedAt < POLL_MAX_MS) {
        try {
          const res = await fetch(
            `/api/v1/checkout/session-status?id=${encodeURIComponent(sessionId)}`,
          );
          if (res.ok) {
            const json = (await res.json()) as StatusResponseOk;
            if (json.success && json.data.ready && json.data.ticket) {
              redirectWithTicket(json.data.ticket);
              return;
            }
          }
        } catch {
          // Network blip; keep polling until deadline.
        }
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      }
      if (cancelled) return;

      // Timeout reached. Record it for observability …
      trackEvent(AnalyticsEvent.CHECKOUT_TICKET_TIMEOUT, {
        session_id: sessionId,
        waited_ms: Date.now() - startedAt,
      });

      // … then ask the server to self-recover by hitting Stripe directly.
      // Fixes the silent revenue loss when the webhook is delayed/dropped.
      try {
        const res = await fetch('/api/v1/checkout/recover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId }),
        });
        if (res.ok) {
          const json = (await res.json()) as StatusResponseOk;
          if (json.success && json.data.ready && json.data.ticket) {
            redirectWithTicket(json.data.ticket);
            return;
          }
        }
      } catch {
        // Network blip on recovery — fall through to fallback UI.
      }

      if (!cancelled) setTimedOut(true);
    }

    void poll();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);
```

- [ ] **Step 4: Run tests to verify all 4 pass**

Run: `npx vitest run src/app/[locale]/checkout/complete/__tests__/CheckoutCompleteClient.test.tsx`
Expected: All 4 tests PASS.

- [ ] **Step 5: Verify typecheck**

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/app/[locale]/checkout/complete/
git commit -m "feat(checkout-recovery/T3): client calls /recover on 30s poll timeout

CheckoutCompleteClient now treats the 30s timeout as 'webhook may have
failed' rather than 'give up'. After firing CHECKOUT_TICKET_TIMEOUT for
observability, it POSTs /api/v1/checkout/recover with the session_id.
If the server can verify the session is paid and provision the user,
the page redirects to /sign-in with a fresh Clerk ticket — same UX as
the happy path.

If recovery says not-ready (session genuinely unpaid) or the network
call throws, falls back to the existing 'check your email' UI.

3 new test cases cover: recovery success → redirect, recovery
ready=false → fallback, recovery network error → fallback.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Full Verification

Run the full quality gate before declaring done.

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass. If pre-existing failures unrelated to this change show up, document them but do not fix here.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: no warnings on the 6 files touched by this change. Per [feedback_lint_worktrees_pollution](memory), pre-existing warnings from `.claude/worktrees/` stale copies should be filtered with:

```bash
npm run lint 2>&1 | grep -v '.claude/worktrees/' | grep -E '(error|warning)' | head -50
```

If any error/warning surfaces in the 6 touched files — fix it, re-run, re-verify.

- [ ] **Step 4: Confirm done**

If steps 1-3 are all green, the feature is complete. Summary:

- New endpoint: `POST /api/v1/checkout/recover` (~210 LoC + 12 tests)
- Client wired: 30s timeout now calls recovery before fallback
- 3 new PostHog events: `checkout_recovery_attempted` / `_succeeded` / `_failed`
- No production migrations needed (no schema changes)
- No new env vars (uses existing Stripe + Clerk + Postgres + Upstash)

Founder action items (not blocking):
- Push the worktree branch to main (or merge per direct-to-main workflow)
- Smoke test: Stripe Dashboard → temporarily disable webhook → complete test checkout → wait 30s → confirm redirect to /sign-in works
- After 7 days of prod data, check PostHog `checkout_recovery_*` events to confirm ~1/week silent-revenue-loss recovery rate

---

## Self-Review

**1. Spec coverage:**
- Spec §2 "Goals" all 5 items → Tasks 1-4 ✅
- Spec §5.1 file footprint → matches Task File Map ✅
- Spec §5.3 pseudocode 15 steps → Task 2 implementation ✅
- Spec §5.4 client change → Task 3 ✅
- Spec §5.5 idempotency table → handled in route (fast-path, Clerk find-or-create, DB upsert) ✅
- Spec §6 error handling → all 5 cases covered in route + tests ✅
- Spec §7.1 10 test cases → 12 tests in Task 2 (added 2: existing-user reuse and no-email guard) ✅
- Spec §7.2 3 client test cases → Task 3 ✅
- Spec §8 risks → addressed (rate limit, idempotency, comment for future maintainers) ✅

**2. Placeholder scan:** No TBDs, no "add appropriate handling" — all code is concrete. ✅

**3. Type consistency:**
- `RecoverResponse` interface used in route + tests ✅
- `DbSubscriptionStatus` type used consistently ✅
- `ApiResponse<RecoverResponse>` matches `/session-status` pattern ✅
- `StatusResponseOk` reused on the client (existing type in `CheckoutCompleteClient.tsx`) ✅

**4. Migration check:** No DB schema changes — `processed_stripe_events` already exists and accepts arbitrary `eventId` strings (the `recovery:` prefix coexists with `evt_*` IDs). ✅

Plan ready for execution.
