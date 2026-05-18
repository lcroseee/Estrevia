# Anonymous Stripe Checkout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow anonymous users to complete Stripe Checkout without prior sign-up. Materialize Clerk account in the webhook and auto-sign-in via single-use Clerk sign-in ticket.

**Architecture:** One endpoint with conditional `auth()`. `success_url` → new public `/checkout/complete` route (outside `(app)` group). Webhook creates Clerk user via Backend SDK and writes the sign-in ticket into Stripe session metadata; `/checkout/complete` polls Stripe metadata for the ticket and redirects to `/sign-in?__clerk_ticket=…`, which Clerk consumes natively. Middleware narrowed so anonymous can reach `/api/v1/stripe/checkout`.

**Tech Stack:** Next.js 16 App Router, Clerk Backend SDK (`@clerk/nextjs/server`), Stripe SDK, Drizzle ORM, Upstash rate-limit, next-intl, vitest.

---

## File Structure

**New files:**
- `src/app/api/v1/checkout/session-status/route.ts` — public GET endpoint returning `{ ready, ticket? }`
- `src/app/[locale]/checkout/complete/page.tsx` — public server component (post-pay landing)
- `src/app/[locale]/checkout/complete/CheckoutCompleteClient.tsx` — client polling fallback
- `src/app/api/v1/stripe/checkout/__tests__/anonymous.test.ts`
- `src/app/api/webhooks/stripe/__tests__/anonymous-completion.test.ts`
- `src/app/api/v1/checkout/session-status/__tests__/route.test.ts`
- `src/app/[locale]/checkout/complete/__tests__/page.test.tsx`
- `src/app/[locale]/checkout/complete/__tests__/CheckoutCompleteClient.test.tsx`

**Modified files:**
- `src/middleware.ts` — narrow `/api/v1/stripe(.*)` to `/api/v1/stripe/portal(.*)`
- `src/shared/lib/analytics.ts` — 4 new event constants
- `src/shared/lib/rate-limit.ts` — add `checkout/session-status` limiter
- `src/app/api/v1/stripe/checkout/route.ts` — `requireAuth()` → `auth()`, anonymous branch
- `src/app/api/webhooks/stripe/route.ts` — anonymous `checkout.session.completed` materialization
- `src/shared/components/PaywallModal.tsx` — remove auth-redirect branch
- `src/shared/components/__tests__/PaywallModal.trigger.test.tsx` — update assertions
- `src/messages/en.json` + `src/messages/es.json` — add `checkout.complete.*` keys

---

## Task 1: Add analytics event constants

**Files:**
- Modify: `src/shared/lib/analytics.ts:236-240`

- [ ] **Step 1: Add four new event constants**

Insert AFTER line `CHECKOUT_STRIPE_REDIRECTED: 'checkout_stripe_redirected',` (line 238) and BEFORE `CHECKOUT_ERROR`:

```ts
  ANONYMOUS_CHECKOUT_STARTED: 'anonymous_checkout_started',
  ANONYMOUS_USER_MATERIALIZED: 'anonymous_user_materialized',
  CHECKOUT_TICKET_READY: 'checkout_ticket_ready',
  CHECKOUT_TICKET_TIMEOUT: 'checkout_ticket_timeout',
```

- [ ] **Step 2: Type-check passes**

Run: `npm run typecheck`
Expected: 0 errors (`AnalyticsEventName` union picks the new keys automatically).

- [ ] **Step 3: Commit**

```bash
git add src/shared/lib/analytics.ts
git commit -m "feat(analytics): add anonymous checkout funnel events"
```

---

## Task 2: Add rate-limit key for session-status endpoint

**Files:**
- Modify: `src/shared/lib/rate-limit.ts:73` (after the `stripe/portal` entry)

- [ ] **Step 1: Add the limiter**

Insert AFTER the `'stripe/portal'` block (line ~73):

```ts
  'checkout/session-status': new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(30, '1m'),
    prefix: 'rl:checkout/session-status',
  }),
```

30/min is generous because `/checkout/complete` client polls every 2s for up to 30s → 15 calls per legitimate session.

- [ ] **Step 2: Type-check passes**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/shared/lib/rate-limit.ts
git commit -m "feat(rate-limit): add checkout/session-status limiter (30/min)"
```

---

## Task 3: Narrow middleware protected matcher for `/api/v1/stripe/*`

**Files:**
- Modify: `src/middleware.ts:55` (inside `isProtectedRoute`)
- Modify: `src/middleware.ts:174` (inside `config.matcher`)

- [ ] **Step 1: Replace broad matcher with portal-specific in `isProtectedRoute`**

Change line 55 from:

```ts
  '/api/v1/stripe(.*)',
```

to:

```ts
  '/api/v1/stripe/portal(.*)',
```

- [ ] **Step 2: Replace broad matcher in `config.matcher`**

Change line 174 from:

```ts
    '/api/v1/stripe/:path*',
```

to:

```ts
    '/api/v1/stripe/portal/:path*',
    '/api/v1/stripe/checkout',
```

Both paths still need middleware to run (Clerk context required for `auth()` inside the checkout route). The difference: `checkout` is matched but not in `isProtectedRoute`, so `auth()` is callable but anonymous requests are NOT 401'd.

- [ ] **Step 3: Verify configuration**

Run: `npm run typecheck`
Expected: 0 errors.

Inspect:
```bash
grep -n "stripe" src/middleware.ts
```

Expected output (4 lines):
```
    '/api/v1/stripe/portal(.*)',
    '/api/v1/stripe/portal/:path*',
    '/api/v1/stripe/checkout',
```

- [ ] **Step 4: Commit**

```bash
git add src/middleware.ts
git commit -m "fix(middleware): narrow stripe auth scope to /portal only

Anonymous /api/v1/stripe/checkout becomes reachable; /portal stays
auth-required."
```

---

## Task 4: Anonymous branch in checkout route (TDD)

**Files:**
- Create: `src/app/api/v1/stripe/checkout/__tests__/anonymous.test.ts`
- Modify: `src/app/api/v1/stripe/checkout/route.ts` (full route rewrite below)

- [ ] **Step 1: Write the failing test**

Create `src/app/api/v1/stripe/checkout/__tests__/anonymous.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const authMock = vi.fn();
const limitMock = vi.fn().mockResolvedValue({ success: true });
const sessionsCreateMock = vi.fn();
const dbSelectMock = vi.fn();

vi.mock('@clerk/nextjs/server', () => ({
  auth: () => authMock(),
}));
vi.mock('@/shared/lib/rate-limit', () => ({
  getRateLimiter: () => ({ limit: limitMock }),
}));
vi.mock('@/shared/lib/stripe', () => ({
  getStripe: () => ({ checkout: { sessions: { create: sessionsCreateMock } } }),
}));
vi.mock('@/shared/lib/db', () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({ limit: () => Promise.resolve(dbSelectMock()) }),
          limit: () => Promise.resolve(dbSelectMock()),
        }),
      }),
    }),
  }),
}));
vi.mock('next/headers', () => ({
  cookies: () => ({ get: (k: string) => (k === 'anonymous_id' ? { value: 'anon-xyz' } : undefined) }),
}));

import { POST } from '../route';

function makeRequest(body: object): Request {
  return new Request('http://localhost/api/v1/stripe/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_PRICE_ID_PRO_MONTHLY = 'price_monthly_test';
  process.env.STRIPE_PRICE_ID_PRO_ANNUAL = 'price_annual_test';
  process.env.NEXT_PUBLIC_APP_URL = 'https://estrevia.app';
  sessionsCreateMock.mockResolvedValue({ id: 'cs_test_123', url: 'https://stripe.com/cs_test_123' });
});

describe('POST /api/v1/stripe/checkout — anonymous branch', () => {
  it('pre-fills customer_email when email_lead exists for the anonymous_id', async () => {
    authMock.mockResolvedValue({ userId: null });
    dbSelectMock.mockReturnValue([{ email: 'lead@example.com' }]);

    const res = await POST(makeRequest({ plan: 'pro_annual', utm_source: 'meta' }));
    expect(res.status).toBe(200);

    expect(sessionsCreateMock).toHaveBeenCalledTimes(1);
    const call = sessionsCreateMock.mock.calls[0][0];
    expect(call.customer_email).toBe('lead@example.com');
    expect(call.client_reference_id).toBe('anon-xyz');
    expect(call.metadata).toMatchObject({ anonymous_id: 'anon-xyz', utm_source: 'meta' });
    expect(call.metadata.clerkUserId).toBeUndefined();
    expect(call.subscription_data.trial_period_days).toBe(3);
  });

  it('omits customer_email when no email_lead is found', async () => {
    authMock.mockResolvedValue({ userId: null });
    dbSelectMock.mockReturnValue([]);

    const res = await POST(makeRequest({ plan: 'pro_annual' }));
    expect(res.status).toBe(200);

    const call = sessionsCreateMock.mock.calls[0][0];
    expect(call.customer_email).toBeUndefined();
    expect(call.client_reference_id).toBe('anon-xyz');
  });

  it('uses success_url = /checkout/complete?session_id={CHECKOUT_SESSION_ID}', async () => {
    authMock.mockResolvedValue({ userId: null });
    dbSelectMock.mockReturnValue([]);

    await POST(makeRequest({ plan: 'pro_annual' }));
    const call = sessionsCreateMock.mock.calls[0][0];
    expect(call.success_url).toBe('https://estrevia.app/checkout/complete?session_id={CHECKOUT_SESSION_ID}');
  });

  it('rate-limits anonymous by anonymous_id key', async () => {
    authMock.mockResolvedValue({ userId: null });
    dbSelectMock.mockReturnValue([]);

    await POST(makeRequest({ plan: 'pro_annual' }));
    expect(limitMock).toHaveBeenCalledWith('anon-xyz');
  });

  it('returns the Stripe URL', async () => {
    authMock.mockResolvedValue({ userId: null });
    dbSelectMock.mockReturnValue([]);

    const res = await POST(makeRequest({ plan: 'pro_annual' }));
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.url).toBe('https://stripe.com/cs_test_123');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/v1/stripe/checkout/__tests__/anonymous.test.ts`
Expected: FAIL — either `auth` import error or "requireAuth" throwing on null userId.

- [ ] **Step 3: Rewrite checkout route**

Replace `src/app/api/v1/stripe/checkout/route.ts` ENTIRELY with:

```ts
/**
 * POST /api/v1/stripe/checkout
 *
 * Creates a Stripe Checkout session for upgrading to Premium.
 * Works in two modes:
 *
 *   AUTHENTICATED — existing behavior: ties session to current user's email,
 *   reuses stripeCustomerId, short-circuits if already premium.
 *
 *   ANONYMOUS — new: when no Clerk session, looks up email from email_leads
 *   by anonymous_id cookie (best-effort pre-fill). Stripe Checkout collects
 *   email natively if no pre-fill available. Webhook materializes the Clerk
 *   user on payment success.
 *
 * Returns: { url: string } — the hosted Checkout URL.
 */

import { NextResponse } from 'next/server';
import { eq, desc } from 'drizzle-orm';
import { z } from 'zod';
import { auth } from '@clerk/nextjs/server';
import { cookies } from 'next/headers';
import { computeIsPremium } from '@/modules/auth/lib/premium';
import { getDb } from '@/shared/lib/db';
import { users, emailLeads } from '@/shared/lib/schema';
import { getStripe } from '@/shared/lib/stripe';
import { getRateLimiter } from '@/shared/lib/rate-limit';
import { trackServerEvent, AnalyticsEvent } from '@/shared/lib/analytics';
import type { ApiResponse } from '@/shared/types';

const checkoutBodySchema = z.object({
  plan: z.enum(['pro_monthly', 'pro_annual']).default('pro_annual'),
  utm_source: z.string().optional(),
  utm_medium: z.string().optional(),
  utm_campaign: z.string().optional(),
  utm_content: z.string().optional(),
  utm_term: z.string().optional(),
  utm_click_timestamp: z.string().datetime().optional(),
});

interface CheckoutResponse {
  url: string;
}

export async function POST(request: Request): Promise<NextResponse<ApiResponse<CheckoutResponse>>> {
  // ---------------------------------------------------------------------------
  // 1. Resolve auth state (may be null for anonymous)
  // ---------------------------------------------------------------------------
  const { userId } = await auth();
  const isAuthenticated = userId !== null && userId !== undefined;

  // For anonymous, key rate-limit by anonymous_id cookie; fall back to IP.
  const cookieStore = await cookies();
  const anonymousId = cookieStore.get('anonymous_id')?.value ?? null;
  const rateLimitKey = isAuthenticated
    ? userId
    : (anonymousId ?? request.headers.get('x-forwarded-for') ?? 'unknown');

  // ---------------------------------------------------------------------------
  // 2. Rate limiting
  // ---------------------------------------------------------------------------
  const limiter = getRateLimiter('stripe/checkout');
  const { success: rateLimitOk } = await limiter.limit(rateLimitKey);
  if (!rateLimitOk) {
    return NextResponse.json(
      { success: false, data: null, error: 'RATE_LIMITED' },
      { status: 429 },
    );
  }

  // ---------------------------------------------------------------------------
  // 3. Parse plan + UTM
  // ---------------------------------------------------------------------------
  let plan: 'pro_monthly' | 'pro_annual' = 'pro_annual';
  let utm: Record<string, string> = {};
  try {
    const body = await request.json();
    const parsed = checkoutBodySchema.parse(body);
    plan = parsed.plan;
    utm = Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => entry[0] !== 'plan' && entry[1] !== undefined,
      ),
    );
  } catch {
    plan = 'pro_annual';
  }

  // ---------------------------------------------------------------------------
  // 4. Resolve price ID
  // ---------------------------------------------------------------------------
  const priceIdMap: Record<string, string | undefined> = {
    pro_monthly: process.env.STRIPE_PRICE_ID_PRO_MONTHLY,
    pro_annual: process.env.STRIPE_PRICE_ID_PRO_ANNUAL,
  };
  const priceId = priceIdMap[plan] ?? process.env.STRIPE_PRICE_ID;
  if (!priceId) {
    console.error('[stripe/checkout] No price ID configured for plan', { plan });
    return NextResponse.json(
      { success: false, data: null, error: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://estrevia.app';

  // ---------------------------------------------------------------------------
  // 5a. AUTHENTICATED branch (preserves existing behavior)
  // ---------------------------------------------------------------------------
  if (isAuthenticated) {
    let stripeCustomerId: string | null = null;
    let userEmail = '';
    let isAlreadyPremium = false;
    try {
      const db = getDb();
      const rows = await db
        .select({
          email: users.email,
          stripeCustomerId: users.stripeCustomerId,
          subscriptionTier: users.subscriptionTier,
          subscriptionStatus: users.subscriptionStatus,
          subscriptionExpiresAt: users.subscriptionExpiresAt,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      const row = rows[0];
      stripeCustomerId = row?.stripeCustomerId ?? null;
      userEmail = row?.email ?? '';
      if (row) {
        isAlreadyPremium = computeIsPremium(
          row.subscriptionTier,
          row.subscriptionStatus,
          row.subscriptionExpiresAt,
        );
      }
    } catch (err) {
      console.error('[stripe/checkout] db lookup failed', { userId, err });
      return NextResponse.json(
        { success: false, data: null, error: 'DATABASE_ERROR' },
        { status: 500 },
      );
    }

    if (isAlreadyPremium) {
      return NextResponse.json(
        { success: true, data: { url: `${appUrl}/settings?already_subscribed=1` }, error: null },
        { status: 200 },
      );
    }

    try {
      const stripe = getStripe();
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        ...(stripeCustomerId ? { customer: stripeCustomerId } : { customer_email: userEmail }),
        client_reference_id: userId,
        metadata: { clerkUserId: userId, ...utm },
        subscription_data: {
          ...(stripeCustomerId ? {} : { trial_period_days: 3 }),
          metadata: { clerkUserId: userId, ...utm },
        },
        success_url: `${appUrl}/checkout/complete?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/pricing`,
        allow_promotion_codes: true,
        billing_address_collection: 'auto',
      });

      if (!session.url) {
        console.error('[stripe/checkout] session has no URL', { sessionId: session.id });
        return NextResponse.json(
          { success: false, data: null, error: 'INTERNAL_ERROR' },
          { status: 500 },
        );
      }

      return NextResponse.json(
        { success: true, data: { url: session.url }, error: null },
        { status: 200 },
      );
    } catch (err) {
      try {
        const { captureException } = await import('@sentry/nextjs');
        captureException(err, { tags: { checkout: 'authenticated', stage: 'session-create' } });
      } catch {
        console.error('[stripe/checkout] stripe error', { userId, err });
      }
      return NextResponse.json(
        { success: false, data: null, error: 'INTERNAL_ERROR' },
        { status: 500 },
      );
    }
  }

  // ---------------------------------------------------------------------------
  // 5b. ANONYMOUS branch
  // ---------------------------------------------------------------------------
  let prefilledEmail: string | undefined = undefined;
  if (anonymousId) {
    try {
      const db = getDb();
      const rows = await db
        .select({ email: emailLeads.email })
        .from(emailLeads)
        .where(eq(emailLeads.anonymousId, anonymousId))
        .orderBy(desc(emailLeads.createdAt))
        .limit(1);
      if (rows.length > 0) prefilledEmail = rows[0].email;
    } catch (err) {
      console.warn(
        '[stripe/checkout] anonymous email_lead lookup failed (non-fatal)',
        err instanceof Error ? err.message : 'unknown',
      );
    }
  }

  try {
    const stripe = getStripe();
    const metadata: Record<string, string> = { ...utm };
    if (anonymousId) metadata.anonymous_id = anonymousId;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      ...(prefilledEmail ? { customer_email: prefilledEmail } : {}),
      ...(anonymousId ? { client_reference_id: anonymousId } : {}),
      metadata,
      subscription_data: {
        trial_period_days: 3,
        metadata,
      },
      success_url: `${appUrl}/checkout/complete?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/pricing`,
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
    });

    if (!session.url) {
      console.error('[stripe/checkout] session has no URL (anonymous)', { sessionId: session.id });
      return NextResponse.json(
        { success: false, data: null, error: 'INTERNAL_ERROR' },
        { status: 500 },
      );
    }

    // Best-effort analytics fire (server-side PostHog). Non-blocking.
    try {
      trackServerEvent(anonymousId ?? `cs:${session.id}`, AnalyticsEvent.ANONYMOUS_CHECKOUT_STARTED, {
        email_known: Boolean(prefilledEmail),
        anonymous_id: anonymousId,
        plan,
        ...utm,
      });
    } catch {
      // PostHog failures must never break the checkout response.
    }

    return NextResponse.json(
      { success: true, data: { url: session.url }, error: null },
      { status: 200 },
    );
  } catch (err) {
    try {
      const { captureException } = await import('@sentry/nextjs');
      captureException(err, { tags: { checkout: 'anonymous', stage: 'session-create' } });
    } catch {
      console.error('[stripe/checkout] anonymous stripe error', { anonymousId, err });
    }
    return NextResponse.json(
      { success: false, data: null, error: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/v1/stripe/checkout/__tests__/anonymous.test.ts`
Expected: 5/5 PASS.

- [ ] **Step 5: Run pre-existing checkout tests to ensure no regression**

Run: `npx vitest run src/app/api/v1/stripe/checkout/__tests__/`
Expected: all pre-existing + new = PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/v1/stripe/checkout/route.ts src/app/api/v1/stripe/checkout/__tests__/anonymous.test.ts
git commit -m "feat(checkout): add anonymous branch to /api/v1/stripe/checkout

Pre-fills customer_email from email_leads via anonymous_id cookie;
falls back to Stripe-native email collection when no lead exists.
success_url now points to /checkout/complete (public route)."
```

---

## Task 5: Webhook anonymous materialization (TDD)

**Files:**
- Create: `src/app/api/webhooks/stripe/__tests__/anonymous-completion.test.ts`
- Modify: `src/app/api/webhooks/stripe/route.ts:158-343` (the `checkout.session.completed` case block)

- [ ] **Step 1: Write the failing test**

Create `src/app/api/webhooks/stripe/__tests__/anonymous-completion.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const constructEventMock = vi.fn();
const subsRetrieveMock = vi.fn();
const sessionsUpdateMock = vi.fn();
const getUserListMock = vi.fn();
const createUserMock = vi.fn();
const createTokenMock = vi.fn();
const dbInsertMock = vi.fn();
const dbUpdateMock = vi.fn();
const dbDeleteMock = vi.fn();
const sendEmailMock = vi.fn();

vi.mock('@/shared/lib/stripe', () => ({
  getStripe: () => ({
    webhooks: { constructEvent: constructEventMock },
    subscriptions: { retrieve: subsRetrieveMock },
    checkout: { sessions: { update: sessionsUpdateMock } },
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
        onConflictDoNothing: () => ({ returning: () => Promise.resolve(dbInsertMock()) }),
        onConflictDoUpdate: () => Promise.resolve(undefined),
      }),
    }),
    update: () => ({ set: () => ({ where: () => Promise.resolve(dbUpdateMock()) }) }),
    delete: () => ({ where: () => Promise.resolve(dbDeleteMock()) }),
    select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) }),
  }),
}));
vi.mock('next/headers', () => ({
  headers: async () => ({ get: () => 'sig_test' }),
}));
vi.mock('@/shared/lib/email', () => ({
  sendPurchaseConfirmationEmail: sendEmailMock,
}));
vi.mock('@/shared/lib/analytics', () => ({
  AnalyticsEvent: {
    SUBSCRIPTION_STARTED: 'subscription_started',
    ANONYMOUS_USER_MATERIALIZED: 'anonymous_user_materialized',
    CHECKOUT_TICKET_READY: 'checkout_ticket_ready',
  },
  trackServerEvent: vi.fn(),
}));

import { POST } from '../route';

function makeSessionCompletedEvent(opts: { metadata?: Record<string, string>; email?: string }): Request {
  const event = {
    id: 'evt_test_1',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_xyz',
        mode: 'subscription',
        customer: 'cus_anonymous_1',
        subscription: 'sub_test_1',
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

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
  process.env.STRIPE_PRICE_ID_PRO_ANNUAL = 'price_annual_test';
  dbInsertMock.mockReturnValue([{ eventId: 'evt_test_1' }]);
  subsRetrieveMock.mockResolvedValue({
    id: 'sub_test_1',
    status: 'trialing',
    items: { data: [{ price: { id: 'price_annual_test' }, current_period_end: 9999999999 }] },
    trial_end: 9999990000,
  });
  createTokenMock.mockResolvedValue({ token: 'ticket_abc123' });
  sessionsUpdateMock.mockResolvedValue({});
});

describe('webhook checkout.session.completed — anonymous branch', () => {
  it('reuses existing Clerk user when email matches', async () => {
    getUserListMock.mockResolvedValue({ totalCount: 1, data: [{ id: 'user_existing' }] });

    const res = await POST(makeSessionCompletedEvent({
      metadata: { anonymous_id: 'anon-xyz', utm_source: 'meta' },
      email: 'paid@example.com',
    }));

    expect(res.status).toBe(200);
    expect(getUserListMock).toHaveBeenCalledWith({ emailAddress: ['paid@example.com'] });
    expect(createUserMock).not.toHaveBeenCalled();
    expect(createTokenMock).toHaveBeenCalledWith({ userId: 'user_existing', expiresInSeconds: 600 });
  });

  it('creates new Clerk user when email is not found', async () => {
    getUserListMock.mockResolvedValue({ totalCount: 0, data: [] });
    createUserMock.mockResolvedValue({ id: 'user_new_xyz' });

    await POST(makeSessionCompletedEvent({
      metadata: { anonymous_id: 'anon-xyz' },
      email: 'new@example.com',
    }));

    expect(createUserMock).toHaveBeenCalledWith({
      emailAddress: ['new@example.com'],
      skipPasswordChecks: true,
      skipPasswordRequirement: true,
      externalId: 'stripe:cs_test_xyz',
    });
    expect(createTokenMock).toHaveBeenCalledWith({ userId: 'user_new_xyz', expiresInSeconds: 600 });
  });

  it('writes signInTicket back to Stripe session metadata', async () => {
    getUserListMock.mockResolvedValue({ totalCount: 0, data: [] });
    createUserMock.mockResolvedValue({ id: 'user_new' });

    await POST(makeSessionCompletedEvent({
      metadata: { anonymous_id: 'anon-xyz', utm_source: 'meta' },
      email: 'new@example.com',
    }));

    expect(sessionsUpdateMock).toHaveBeenCalledWith('cs_test_xyz', {
      metadata: expect.objectContaining({
        signInTicket: 'ticket_abc123',
        anonymous_id: 'anon-xyz',
        utm_source: 'meta',
      }),
    });
  });

  it('recovers from createUser race via retry getUserList', async () => {
    getUserListMock
      .mockResolvedValueOnce({ totalCount: 0, data: [] })
      .mockResolvedValueOnce({ totalCount: 1, data: [{ id: 'user_race_winner' }] });
    createUserMock.mockRejectedValue({ errors: [{ code: 'form_identifier_exists' }] });

    await POST(makeSessionCompletedEvent({
      metadata: { anonymous_id: 'anon-xyz' },
      email: 'race@example.com',
    }));

    expect(getUserListMock).toHaveBeenCalledTimes(2);
    expect(createTokenMock).toHaveBeenCalledWith({ userId: 'user_race_winner', expiresInSeconds: 600 });
  });

  it('deletes dedup row on Clerk failure to enable Stripe retry', async () => {
    getUserListMock.mockRejectedValue(new Error('Clerk API down'));

    const res = await POST(makeSessionCompletedEvent({
      metadata: { anonymous_id: 'anon-xyz' },
      email: 'paid@example.com',
    }));

    expect(dbDeleteMock).toHaveBeenCalled();
    expect(res.status).toBe(500);
  });

  it('preserves signed-in path when metadata.clerkUserId is present', async () => {
    await POST(makeSessionCompletedEvent({
      metadata: { clerkUserId: 'user_signed_in_abc' },
      email: 'signed@example.com',
    }));

    expect(getUserListMock).not.toHaveBeenCalled();
    expect(createUserMock).not.toHaveBeenCalled();
    expect(sessionsUpdateMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/webhooks/stripe/__tests__/anonymous-completion.test.ts`
Expected: FAIL — the route doesn't yet handle null `clerkUserId` (currently warns + breaks).

- [ ] **Step 3: Modify webhook to handle anonymous completion**

In `src/app/api/webhooks/stripe/route.ts`, INSIDE `case 'checkout.session.completed':`, REPLACE the block from `const clerkUserId = extractClerkUserId(session);` through `if (!clerkUserId) { … break; }` (lines ~169-175) with:

```ts
        let clerkUserId = extractClerkUserId(session);

        // ANONYMOUS branch: materialize Clerk user + sign-in ticket
        if (!clerkUserId) {
          const email = session.customer_details?.email;
          if (!email) {
            console.warn('[stripe-webhook] anonymous checkout.session.completed: no email on session', {
              sessionId: session.id,
            });
            break;
          }

          try {
            const clerk = await clerkClient();

            // Find-or-create with race recovery
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
                // Race: concurrent webhook retry created the user. Re-query.
                const retry = await clerk.users.getUserList({ emailAddress: [email] });
                if (retry.totalCount > 0) {
                  clerkUserId = retry.data[0].id;
                } else {
                  throw createErr;
                }
              }
            }

            // Create single-use sign-in ticket and write back to Stripe metadata
            const ticket = await clerk.signInTokens.createSignInToken({
              userId: clerkUserId,
              expiresInSeconds: 600,
            });
            const existingMetadata = session.metadata ?? {};
            await getStripe().checkout.sessions.update(session.id, {
              metadata: { ...existingMetadata, signInTicket: ticket.token },
            });

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

            // Observability — non-blocking
            try {
              trackServerEvent(clerkUserId, AnalyticsEvent.ANONYMOUS_USER_MATERIALIZED, {
                created_new: existing.totalCount === 0,
                session_id: session.id,
                anonymous_id: anonymousIdMeta,
              });
              trackServerEvent(clerkUserId, AnalyticsEvent.CHECKOUT_TICKET_READY, {
                session_id: session.id,
              });
            } catch {
              // PostHog must not break the webhook.
            }
          } catch (clerkErr) {
            // Roll back dedup row so Stripe retries
            try {
              await db
                .delete(processedStripeEvents)
                .where(eq(processedStripeEvents.eventId, event.id));
            } catch (delErr) {
              console.error(
                '[stripe-webhook] dedup rollback failed',
                delErr instanceof Error ? delErr.message : 'unknown',
              );
            }
            try {
              const { captureException } = await import('@sentry/nextjs');
              captureException(clerkErr, {
                tags: { webhook: 'stripe', checkout: 'anonymous', stage: 'webhook-materialize' },
              });
            } catch {
              // Sentry best-effort
            }
            throw clerkErr;
          }
        }
```

Also ADD these imports at top of `route.ts` (after existing imports):

```ts
import { clerkClient } from '@clerk/nextjs/server';
import { or } from 'drizzle-orm';
import { emailLeads } from '@/shared/lib/schema';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/webhooks/stripe/__tests__/anonymous-completion.test.ts`
Expected: 6/6 PASS.

- [ ] **Step 5: Run full webhook test suite**

Run: `npx vitest run src/app/api/webhooks/stripe/__tests__/`
Expected: existing + new = PASS, no regressions.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/webhooks/stripe/route.ts src/app/api/webhooks/stripe/__tests__/anonymous-completion.test.ts
git commit -m "feat(webhook): materialize Clerk user + sign-in ticket on anonymous checkout

When checkout.session.completed arrives without clerkUserId in metadata:
1. Find-or-create Clerk user by Stripe customer email
2. Generate 10-min sign-in ticket
3. Write ticket back to session metadata for /checkout/complete to consume
4. Link email_leads.converted_to_user_id
5. On Clerk failure: delete dedup row so Stripe retries"
```

---

## Task 6: session-status endpoint (TDD)

**Files:**
- Create: `src/app/api/v1/checkout/session-status/route.ts`
- Create: `src/app/api/v1/checkout/session-status/__tests__/route.test.ts`

- [ ] **Step 1: Write the failing test**

Create the test file:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sessionsRetrieveMock = vi.fn();
const limitMock = vi.fn().mockResolvedValue({ success: true });

vi.mock('@/shared/lib/stripe', () => ({
  getStripe: () => ({ checkout: { sessions: { retrieve: sessionsRetrieveMock } } }),
}));
vi.mock('@/shared/lib/rate-limit', () => ({
  getRateLimiter: () => ({ limit: limitMock }),
}));

import { GET } from '../route';

function makeRequest(id: string | null): Request {
  const url = new URL('http://localhost/api/v1/checkout/session-status');
  if (id) url.searchParams.set('id', id);
  return new Request(url.toString(), { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/v1/checkout/session-status', () => {
  it('returns ready=true with ticket when metadata has signInTicket', async () => {
    sessionsRetrieveMock.mockResolvedValue({
      id: 'cs_test_1',
      metadata: { signInTicket: 'ticket_abc', anonymous_id: 'xyz' },
    });

    const res = await GET(makeRequest('cs_test_1'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ success: true, data: { ready: true, ticket: 'ticket_abc' }, error: null });
  });

  it('returns ready=false when ticket not yet present', async () => {
    sessionsRetrieveMock.mockResolvedValue({
      id: 'cs_test_1',
      metadata: { anonymous_id: 'xyz' },
    });

    const res = await GET(makeRequest('cs_test_1'));
    const json = await res.json();
    expect(json.data).toEqual({ ready: false });
  });

  it('returns 400 when id missing', async () => {
    const res = await GET(makeRequest(null));
    expect(res.status).toBe(400);
  });

  it('returns 404 when Stripe session not found', async () => {
    sessionsRetrieveMock.mockRejectedValue({ type: 'StripeInvalidRequestError', code: 'resource_missing' });

    const res = await GET(makeRequest('cs_nonexistent'));
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/v1/checkout/session-status/__tests__/route.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the endpoint**

Create `src/app/api/v1/checkout/session-status/route.ts`:

```ts
/**
 * GET /api/v1/checkout/session-status?id=<stripe_session_id>
 *
 * Public (no auth) — used by /checkout/complete client polling fallback when
 * the server-side ticket wait times out. Returns:
 *   { ready: true,  ticket: '...' } when webhook has written signInTicket
 *   { ready: false }                when webhook has not arrived yet
 *
 * Rate-limited by IP (30 req/min — enough for 15 polls per legitimate session).
 */

import { NextResponse } from 'next/server';
import { getStripe } from '@/shared/lib/stripe';
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
    return NextResponse.json(
      { success: false, data: null, error: 'BAD_REQUEST' },
      { status: 400 },
    );
  }

  const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
  const limiter = getRateLimiter('checkout/session-status');
  const { success: rateLimitOk } = await limiter.limit(ip);
  if (!rateLimitOk) {
    return NextResponse.json(
      { success: false, data: null, error: 'RATE_LIMITED' },
      { status: 429 },
    );
  }

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(id);
    const ticket = session.metadata?.signInTicket;
    if (ticket) {
      return NextResponse.json(
        { success: true, data: { ready: true, ticket }, error: null },
        { status: 200 },
      );
    }
    return NextResponse.json(
      { success: true, data: { ready: false }, error: null },
      { status: 200 },
    );
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === 'resource_missing') {
      return NextResponse.json(
        { success: false, data: null, error: 'NOT_FOUND' },
        { status: 404 },
      );
    }
    console.error(
      '[checkout/session-status] retrieve failed',
      err instanceof Error ? err.message : 'unknown',
    );
    return NextResponse.json(
      { success: false, data: null, error: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/v1/checkout/session-status/__tests__/route.test.ts`
Expected: 4/4 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/v1/checkout/session-status/
git commit -m "feat(checkout): add public session-status endpoint

GET ?id=cs_xxx returns { ready, ticket? } by reading Stripe session
metadata.signInTicket. Used by /checkout/complete client polling
fallback when webhook lags."
```

---

## Task 7: Add i18n copy for /checkout/complete

**Files:**
- Modify: `src/messages/en.json`
- Modify: `src/messages/es.json`

- [ ] **Step 1: Add EN keys under `checkout`**

In `src/messages/en.json`, locate the `"checkout"` object (or add at top level if absent). Add:

```json
  "checkout": {
    "complete": {
      "title": "Finalizing your account",
      "description": "Your payment is confirmed. Setting up your Pro access — this takes a few seconds.",
      "redirecting": "Signing you in…",
      "checkEmail": "Account is being set up. Check your email for a sign-in link.",
      "contactSupport": "If this persists, email support@estrevia.app"
    }
  }
```

If `"checkout"` key already exists with `"start"` sub-object (used by `/checkout/start`), MERGE — do not overwrite:

```json
  "checkout": {
    "start": { /* ...existing... */ },
    "complete": { /* new keys above */ }
  }
```

- [ ] **Step 2: Add ES keys**

In `src/messages/es.json`, mirror the same structure with Spanish copy (español neutro LATAM, tú form per memory `feedback_spanish_style`):

```json
  "checkout": {
    "complete": {
      "title": "Activando tu cuenta",
      "description": "Tu pago se confirmó. Estamos preparando tu acceso Pro — esto toma unos segundos.",
      "redirecting": "Iniciando tu sesión…",
      "checkEmail": "Tu cuenta se está creando. Revisa tu correo para el enlace de acceso.",
      "contactSupport": "Si esto persiste, escríbenos a support@estrevia.app"
    }
  }
```

- [ ] **Step 3: Verify JSON validity**

Run:
```bash
node -e "JSON.parse(require('fs').readFileSync('src/messages/en.json','utf8'))"
node -e "JSON.parse(require('fs').readFileSync('src/messages/es.json','utf8'))"
```
Expected: silent (valid JSON).

- [ ] **Step 4: Commit**

```bash
git add src/messages/en.json src/messages/es.json
git commit -m "feat(i18n): add checkout.complete copy (EN + ES neutro)"
```

---

## Task 8: New `/checkout/complete` server page (TDD)

**Files:**
- Create: `src/app/[locale]/checkout/complete/page.tsx`
- Create: `src/app/[locale]/checkout/complete/__tests__/page.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/app/[locale]/checkout/complete/__tests__/page.test.tsx`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const sessionsRetrieveMock = vi.fn();
const redirectMock = vi.fn().mockImplementation(() => { throw new Error('NEXT_REDIRECT'); });

vi.mock('@/shared/lib/stripe', () => ({
  getStripe: () => ({ checkout: { sessions: { retrieve: sessionsRetrieveMock } } }),
}));
vi.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => redirectMock(...args),
}));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => `t:${key}`,
  getLocale: async () => 'en',
}));

import CheckoutCompletePage from '../page';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('/checkout/complete page', () => {
  it('redirects to /sign-in?__clerk_ticket=... when ticket is ready immediately', async () => {
    sessionsRetrieveMock.mockResolvedValue({
      id: 'cs_test_1',
      metadata: { signInTicket: 'ticket_xyz' },
    });

    await expect(
      CheckoutCompletePage({
        searchParams: Promise.resolve({ session_id: 'cs_test_1' }),
        params: Promise.resolve({ locale: 'en' }),
      }),
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(redirectMock).toHaveBeenCalledWith(
      '/sign-in?__clerk_ticket=ticket_xyz&redirect_url=%2Fsettings',
    );
  });

  it('renders the client polling fallback when ticket is not ready after server poll', async () => {
    sessionsRetrieveMock.mockResolvedValue({
      id: 'cs_test_1',
      metadata: {},
    });

    const result = await CheckoutCompletePage({
      searchParams: Promise.resolve({ session_id: 'cs_test_1' }),
      params: Promise.resolve({ locale: 'en' }),
    });
    render(result);
    expect(screen.getByText(/t:title/i)).toBeInTheDocument();
  }, 15000);  // server poll budget = 8s, test wait ~10s

  it('redirects to /pricing?error=session_not_found when sessionId missing', async () => {
    await expect(
      CheckoutCompletePage({
        searchParams: Promise.resolve({}),
        params: Promise.resolve({ locale: 'en' }),
      }),
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(redirectMock).toHaveBeenCalledWith('/pricing?error=session_not_found');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run 'src/app/[locale]/checkout/complete/__tests__/page.test.tsx'`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the page**

Create `src/app/[locale]/checkout/complete/page.tsx`:

```tsx
/**
 * /checkout/complete — public post-payment landing page.
 *
 * Outside the (app) route group so anonymous users can reach it without
 * Clerk middleware redirecting to /sign-in first.
 *
 * Server-component flow:
 *   1. Read ?session_id=cs_xxx
 *   2. Poll Stripe session metadata for signInTicket up to 8s
 *   3a. If ticket found: server-redirect to /sign-in?__clerk_ticket=…
 *   3b. If not found: render <CheckoutCompleteClient/> which polls the
 *       session-status endpoint every 2s for up to 30s, then falls back to
 *       a "check your email" message.
 *
 * Once Clerk consumes the ticket at /sign-in, the user lands on /settings
 * with a session cookie set; middleware then allows access normally.
 */

import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getStripe } from '@/shared/lib/stripe';
import { CheckoutCompleteClient } from './CheckoutCompleteClient';

const SERVER_POLL_MAX_MS = 8000;
const SERVER_POLL_INTERVAL_MS = 500;

async function waitForTicket(sessionId: string): Promise<string | null> {
  const stripe = getStripe();
  const deadline = Date.now() + SERVER_POLL_MAX_MS;
  while (Date.now() < deadline) {
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      const ticket = session.metadata?.signInTicket;
      if (ticket) return ticket;
    } catch {
      // Network / transient — keep polling until deadline
    }
    await new Promise((r) => setTimeout(r, SERVER_POLL_INTERVAL_MS));
  }
  return null;
}

interface PageProps {
  searchParams: Promise<{ session_id?: string }>;
  params: Promise<{ locale: string }>;
}

export default async function CheckoutCompletePage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const sessionId = sp.session_id;
  if (!sessionId) redirect('/pricing?error=session_not_found');

  const ticket = await waitForTicket(sessionId);
  if (ticket) {
    const target = `/sign-in?__clerk_ticket=${encodeURIComponent(ticket)}&redirect_url=${encodeURIComponent('/settings')}`;
    redirect(target);
  }

  const t = await getTranslations('checkout.complete');
  return (
    <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center px-4">
      <div className="max-w-sm text-center">
        <div
          className="inline-block w-8 h-8 border-2 border-[#FFD700]/30 border-t-[#FFD700] rounded-full animate-spin mb-5"
          role="status"
          aria-label={t('title')}
        />
        <h1
          className="text-lg font-light text-white mb-2"
          style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)' }}
        >
          {t('title')}
        </h1>
        <p className="text-sm text-white/50 mb-6">{t('description')}</p>
        <CheckoutCompleteClient sessionId={sessionId} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run page test to verify the first + third cases pass**

Run: `npx vitest run 'src/app/[locale]/checkout/complete/__tests__/page.test.tsx' -t 'redirects' `
Expected: 2/2 redirect tests PASS (the rendering test depends on Task 9).

- [ ] **Step 5: Commit**

```bash
git add 'src/app/[locale]/checkout/complete/page.tsx' 'src/app/[locale]/checkout/complete/__tests__/page.test.tsx'
git commit -m "feat(checkout/complete): public landing page with 8s server-side ticket poll

Outside (app) group → anonymous users reach it; once ticket is in Stripe
metadata, server-redirects to /sign-in?__clerk_ticket=. Falls back to
client polling component when 8s elapses without ticket."
```

---

## Task 9: `CheckoutCompleteClient` polling component (TDD)

**Files:**
- Create: `src/app/[locale]/checkout/complete/CheckoutCompleteClient.tsx`
- Create: `src/app/[locale]/checkout/complete/__tests__/CheckoutCompleteClient.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/app/[locale]/checkout/complete/__tests__/CheckoutCompleteClient.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const trackEventMock = vi.fn();

vi.mock('@/shared/lib/analytics', () => ({
  trackEvent: trackEventMock,
  AnalyticsEvent: {
    CHECKOUT_TICKET_TIMEOUT: 'checkout_ticket_timeout',
  },
}));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => `t:${key}`,
}));

const fetchMock = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  trackEventMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

import { CheckoutCompleteClient } from '../CheckoutCompleteClient';

describe('CheckoutCompleteClient', () => {
  it('redirects to /sign-in when poll returns ready=true', async () => {
    const setLoc = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { href: '', set href(v: string) { setLoc(v); } },
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { ready: true, ticket: 'ticket_zzz' } }),
    });

    render(<CheckoutCompleteClient sessionId="cs_test_1" />);

    await vi.advanceTimersByTimeAsync(2000);
    await waitFor(() => {
      expect(setLoc).toHaveBeenCalledWith(
        '/sign-in?__clerk_ticket=ticket_zzz&redirect_url=%2Fsettings',
      );
    });
  });

  it('fires CHECKOUT_TICKET_TIMEOUT and shows fallback after 30s', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { ready: false } }),
    });

    render(<CheckoutCompleteClient sessionId="cs_test_1" />);

    // 15 polls @ 2s
    await vi.advanceTimersByTimeAsync(31_000);

    await waitFor(() => {
      expect(trackEventMock).toHaveBeenCalledWith(
        'checkout_ticket_timeout',
        expect.objectContaining({ session_id: 'cs_test_1' }),
      );
      expect(screen.getByText(/t:checkEmail/)).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run 'src/app/[locale]/checkout/complete/__tests__/CheckoutCompleteClient.test.tsx'`
Expected: FAIL — component not found.

- [ ] **Step 3: Implement the component**

Create `src/app/[locale]/checkout/complete/CheckoutCompleteClient.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { trackEvent, AnalyticsEvent } from '@/shared/lib/analytics';

interface Props {
  sessionId: string;
}

const POLL_INTERVAL_MS = 2000;
const POLL_MAX_MS = 30_000;

interface StatusResponseOk {
  success: true;
  data: { ready: boolean; ticket?: string };
  error: null;
}

export function CheckoutCompleteClient({ sessionId }: Props) {
  const t = useTranslations('checkout.complete');
  const [timedOut, setTimedOut] = useState(false);

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
    return () => { cancelled = true; };
  }, [sessionId]);

  if (!timedOut) {
    return <p className="text-xs text-white/40">{t('redirecting')}</p>;
  }

  return (
    <div className="text-left">
      <p className="text-sm text-white/70 mb-3">{t('checkEmail')}</p>
      <p className="text-xs text-white/40">{t('contactSupport')}</p>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run 'src/app/[locale]/checkout/complete/__tests__/CheckoutCompleteClient.test.tsx'`
Expected: 2/2 PASS.

- [ ] **Step 5: Run the page test (third rendering case now resolvable)**

Run: `npx vitest run 'src/app/[locale]/checkout/complete/__tests__/page.test.tsx'`
Expected: 3/3 PASS.

- [ ] **Step 6: Commit**

```bash
git add 'src/app/[locale]/checkout/complete/CheckoutCompleteClient.tsx' 'src/app/[locale]/checkout/complete/__tests__/CheckoutCompleteClient.test.tsx'
git commit -m "feat(checkout/complete): client polling fallback for slow webhooks

Polls /api/v1/checkout/session-status every 2s for 30s; on ready=true
redirects to /sign-in?__clerk_ticket; on timeout fires
CHECKOUT_TICKET_TIMEOUT and shows 'check your email' fallback copy."
```

---

## Task 10: PaywallModal — remove auth-redirect branch

**Files:**
- Modify: `src/shared/components/PaywallModal.tsx:104-174` (the `handleCheckout` function)
- Modify: `src/shared/components/__tests__/PaywallModal.trigger.test.tsx` (assertions)

- [ ] **Step 1: Update existing test assertions**

Open `src/shared/components/__tests__/PaywallModal.trigger.test.tsx`. Find any assertion of the form:

```ts
expect(window.location.href).toContain('/sign-up');
// or:
expect(trackEventMock).toHaveBeenCalledWith('checkout_auth_redirect', ...);
```

REPLACE with:

```ts
expect(window.location.href).toBe('https://stripe.com/test-checkout-url');
expect(trackEventMock).toHaveBeenCalledWith(
  'checkout_stripe_redirected',
  expect.objectContaining({ plan: 'pro_annual' }),
);
```

The fetch mock for `/api/v1/stripe/checkout` should now return `{ success: true, data: { url: 'https://stripe.com/test-checkout-url' }, error: null }` for BOTH anonymous and authenticated test cases (no more 401 path).

- [ ] **Step 2: Run test to verify it FAILS against current implementation**

Run: `npx vitest run src/shared/components/__tests__/PaywallModal.trigger.test.tsx`
Expected: FAIL — current code still has auth-redirect branch.

- [ ] **Step 3: Simplify `handleCheckout` in `PaywallModal.tsx`**

REPLACE the entire `handleCheckout` function (lines 104-174) with:

```tsx
  async function handleCheckout() {
    if (loading) return;
    setLoading(true);
    setError(null);
    trackEvent(AnalyticsEvent.PAYWALL_TRIAL_CLICKED, {
      plan,
      trigger: triggerContext ?? 'generic',
      returnUrl: returnUrl ?? null,
    });

    try {
      const utmFields = readUtmCookie();
      const res = await fetch('/api/v1/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, returnUrl, ...(utmFields ?? {}) }),
      });

      let data: { success: boolean; data?: { url: string }; error?: string };
      try {
        data = (await res.json()) as typeof data;
      } catch {
        setError('Unexpected response from server. Please try again.');
        return;
      }

      if (!data.success || !data.data?.url) {
        setError('Something went wrong. Please try again.');
        return;
      }

      trackEvent(AnalyticsEvent.CHECKOUT_STRIPE_REDIRECTED, {
        plan,
        trigger: triggerContext ?? 'generic',
      });
      window.location.href = data.data.url;
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/shared/components/__tests__/PaywallModal.trigger.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run other PaywallModal tests to ensure no regression**

Run: `npx vitest run src/shared/components/__tests__/PaywallModal`
Expected: all PASS (UTM, trigger, etc. unchanged behavior).

- [ ] **Step 6: Commit**

```bash
git add src/shared/components/PaywallModal.tsx src/shared/components/__tests__/PaywallModal.trigger.test.tsx
git commit -m "refactor(paywall): remove auth-redirect branch from handleCheckout

Server-side endpoint now handles both anonymous and authenticated checkouts.
Client always expects a Stripe URL; the /sign-up bounce is dead code."
```

---

## Task 11: Final verification — typecheck, lint, full test suite

**Files:** none modified.

- [ ] **Step 1: Run TypeScript check**

Run: `npm run typecheck`
Expected: 0 errors.

If there are errors, fix them inline. Most likely culprits: import paths, optional metadata typing, or NextRequest types. Do not silence with `any` — narrow the types.

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: 100% of previously-passing tests + all new tests = PASS. No skipped tests added without reason.

If any pre-existing test now fails (e.g., a webhook test that asserted the old "no clerkUserId → break" path), update it to match the new behavior — but verify it's an intended consequence, not a regression.

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: 0 new warnings in our changed files. (Per memory `feedback_lint_worktrees_pollution`, ignore noise from `.claude/worktrees/`.)

Sanity-grep to confirm:
```bash
npm run lint 2>&1 | grep -v ".claude/worktrees" | tail -30
```

- [ ] **Step 4: Smoke verification — local dev server (founder-driven)**

Founder runs manually:
```bash
npm run dev
```

In a fresh incognito tab:
1. Visit `http://localhost:3000/chart` → fill HeroCalculator → see chart
2. Navigate to a paywall-gated section (`/tarot/spread` or chart AI section)
3. Click "Start Free Trial" → should land on Stripe Checkout (NOT `/sign-up`)
4. Pay with `4242 4242 4242 4242` (test mode)
5. Should land on `/checkout/complete?session_id=…` with spinner → auto-redirect through `/sign-in?__clerk_ticket=…` → land on `/settings` SIGNED IN with Premium badge
6. Logout, sign in again with the same email — same account

- [ ] **Step 5: Stage and commit nothing (verification-only task)**

```bash
git status
```
Expected: clean working tree. If anything is uncommitted, that's a missed step in an earlier task — go back and finish it.

- [ ] **Step 6: Push**

```bash
git push origin main
```

Direct-to-main per CLAUDE.md `feedback_main_branch_workflow`. The founder confirms shared-state action before push.

---

## Self-Review

**Spec coverage:**

- ✅ Goal 1 (anonymous Stripe Checkout without prior sign-up) — Task 3 (middleware) + Task 4 (route)
- ✅ Goal 2 (pre-fill `customer_email` from `email_leads`) — Task 4 (route anonymous branch)
- ✅ Goal 3 (post-payment auto-sign-in via ticket) — Task 5 (webhook materialization) + Task 8/9 (complete page)
- ✅ Goal 4 (preserve signed-in behavior) — Task 4 keeps the existing branch intact; Task 5 preserves `clerkUserId`-present path
- ✅ Goal 5 (UTM end-to-end) — Task 4 propagates metadata; Task 5 reads it back
- ✅ Decisions table — every decision maps to a task
- ✅ Error handling table — Tasks 4, 5, 6, 8, 9 implement the responses
- ✅ Edge cases — Tasks 5 + 8/9 cover races, mismatches, timeouts
- ✅ New analytics events — Task 1 declares; Tasks 4, 5, 9 emit
- ✅ i18n copy — Task 7 (EN + ES)
- ✅ Tests — Tasks 4, 5, 6, 8, 9, 10 each include test work

**Placeholder scan:** No TBD/TODO/"implement later"/"add appropriate error handling" present.

**Type consistency:** `signInTicket` name used identically in webhook write, session-status response, and `/checkout/complete` consumption. `anonymous_id` cookie name used identically in route + webhook metadata + checkout-status. `__clerk_ticket` param name matches Clerk SDK convention.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-17-anonymous-stripe-checkout.md`. Two execution options:

**1. Subagent-Driven (recommended)** — Dispatch a fresh subagent per task, review between tasks, fast iteration. Best for plans with cross-cutting changes where a fresh perspective per task helps catch context drift.

**2. Inline Execution** — Execute tasks in this session using `executing-plans`, batch execution with checkpoints. Faster wall-clock when the implementer already has the codebase context warm.

Which approach?
