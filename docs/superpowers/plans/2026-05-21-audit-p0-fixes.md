# 2026-05-21 Marketing Audit P0 Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship three independent P0 fixes from the 2026-05-21 marketing audit — anon-checkout customer dedup, sub-mode payment_method_types restrict, PostHog locale super-prop race — in a single bundle.

**Architecture:** Minimal diffs to existing files. New helper module `findOrPrepareCustomer.ts` extracted for testability. Test-first per task; each task ends with a passing test suite and a commit.

**Tech Stack:** Stripe Node SDK (existing), `posthog-js` (existing), Drizzle ORM (existing), Vitest + jsdom (existing), TypeScript 6 strict.

**Spec:** `docs/superpowers/specs/2026-05-21-audit-p0-fixes-design.md` (commit `3e4a3eb`).

---

## File Structure

| File | Purpose | Action |
|---|---|---|
| `src/app/api/v1/stripe/checkout/findOrPrepareCustomer.ts` | Stripe customer lookup + block/reuse/create decision; UTC day-bucket helper | Create |
| `src/app/api/v1/stripe/checkout/__tests__/findOrPrepareCustomer.test.ts` | Unit tests for helper (7 scenarios) | Create |
| `src/app/api/v1/stripe/checkout/route.ts` | POST handler: wire helper into both branches + add `payment_method_types` + idempotency-key | Modify |
| `src/app/api/v1/stripe/checkout/__tests__/route.test.ts` | Authenticated-branch tests: extend with dedup + PMT + idempotency assertions | Modify |
| `src/app/api/v1/stripe/checkout/__tests__/anonymous.test.ts` | Anonymous-branch tests: extend with dedup + PMT + idempotency assertions | Modify |
| `src/shared/components/PostHogProvider.tsx` | Move `register({locale})` into `loaded` callback at `posthog.init` | Modify |
| `src/shared/components/__tests__/PostHogProvider.test.tsx` | Extend with `loaded` callback ordering test | Modify |

Seven files total. No migrations, no env vars, no new dependencies.

---

## Task 1: Extract `findOrPrepareCustomer` helper + unit tests

**Files:**
- Create: `src/app/api/v1/stripe/checkout/findOrPrepareCustomer.ts`
- Create: `src/app/api/v1/stripe/checkout/__tests__/findOrPrepareCustomer.test.ts`

- [ ] **Step 1.1: Write the failing test file**

Create `src/app/api/v1/stripe/checkout/__tests__/findOrPrepareCustomer.test.ts` with:

```ts
import { describe, it, expect, vi } from 'vitest';
import type Stripe from 'stripe';
import { findOrPrepareCustomer, utcDayBucket } from '../findOrPrepareCustomer';

type CustomersList = Stripe.Customer[];
type SubsList = Pick<Stripe.Subscription, 'status'>[];

function makeStripeMock(opts: {
  customers?: CustomersList;
  subscriptions?: SubsList;
  customersListThrows?: Error;
  subscriptionsListThrows?: Error;
}) {
  return {
    customers: {
      list: vi.fn().mockImplementation(() => {
        if (opts.customersListThrows) throw opts.customersListThrows;
        return Promise.resolve({ data: opts.customers ?? [] });
      }),
    },
    subscriptions: {
      list: vi.fn().mockImplementation(() => {
        if (opts.subscriptionsListThrows) throw opts.subscriptionsListThrows;
        return Promise.resolve({ data: opts.subscriptions ?? [] });
      }),
    },
  } as unknown as Stripe;
}

describe('findOrPrepareCustomer', () => {
  it('returns kind="create" when customers.list returns empty', async () => {
    const stripe = makeStripeMock({ customers: [] });
    const result = await findOrPrepareCustomer(stripe, 'new@example.com');
    expect(result).toEqual({ kind: 'create' });
  });

  it('returns kind="reuse" when customer exists with no subscriptions', async () => {
    const stripe = makeStripeMock({
      customers: [{ id: 'cus_existing' } as Stripe.Customer],
      subscriptions: [],
    });
    const result = await findOrPrepareCustomer(stripe, 'old@example.com');
    expect(result).toEqual({ kind: 'reuse', customerId: 'cus_existing' });
  });

  it('returns kind="reuse" when customer has only canceled subscriptions', async () => {
    const stripe = makeStripeMock({
      customers: [{ id: 'cus_canceled' } as Stripe.Customer],
      subscriptions: [{ status: 'canceled' }, { status: 'incomplete_expired' }],
    });
    const result = await findOrPrepareCustomer(stripe, 'former@example.com');
    expect(result).toEqual({ kind: 'reuse', customerId: 'cus_canceled' });
  });

  it('returns kind="block" when customer has an active subscription', async () => {
    const stripe = makeStripeMock({
      customers: [{ id: 'cus_active' } as Stripe.Customer],
      subscriptions: [{ status: 'active' }],
    });
    const result = await findOrPrepareCustomer(stripe, 'active@example.com');
    expect(result).toEqual({ kind: 'block', reason: 'already_subscribed' });
  });

  it('returns kind="block" when customer has a trialing subscription', async () => {
    const stripe = makeStripeMock({
      customers: [{ id: 'cus_trialing' } as Stripe.Customer],
      subscriptions: [{ status: 'trialing' }],
    });
    const result = await findOrPrepareCustomer(stripe, 'trial@example.com');
    expect(result).toEqual({ kind: 'block', reason: 'already_subscribed' });
  });

  it('returns kind="block" when customer has a past_due subscription', async () => {
    const stripe = makeStripeMock({
      customers: [{ id: 'cus_pastdue' } as Stripe.Customer],
      subscriptions: [{ status: 'past_due' }],
    });
    const result = await findOrPrepareCustomer(stripe, 'pastdue@example.com');
    expect(result).toEqual({ kind: 'block', reason: 'already_subscribed' });
  });

  it('returns kind="create" when customers.list throws (fail-open, do not block checkout)', async () => {
    const stripe = makeStripeMock({ customersListThrows: new Error('stripe-down') });
    const result = await findOrPrepareCustomer(stripe, 'x@example.com');
    expect(result).toEqual({ kind: 'create' });
  });

  it('returns kind="block" when subscriptions.list throws (fail-closed, safer to deny)', async () => {
    const stripe = makeStripeMock({
      customers: [{ id: 'cus_q' } as Stripe.Customer],
      subscriptionsListThrows: new Error('stripe-down'),
    });
    const result = await findOrPrepareCustomer(stripe, 'q@example.com');
    expect(result).toEqual({ kind: 'block', reason: 'already_subscribed' });
  });
});

describe('utcDayBucket', () => {
  it('returns ISO date string YYYY-MM-DD', () => {
    const out = utcDayBucket();
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns the UTC calendar date regardless of local timezone', () => {
    const fixed = new Date('2026-05-21T23:30:00Z');
    expect(utcDayBucket(fixed)).toBe('2026-05-21');
  });
});
```

- [ ] **Step 1.2: Run test to verify it fails**

Run: `npx vitest run src/app/api/v1/stripe/checkout/__tests__/findOrPrepareCustomer.test.ts`
Expected: FAIL with module-not-found error for `../findOrPrepareCustomer`.

- [ ] **Step 1.3: Write the helper module**

Create `src/app/api/v1/stripe/checkout/findOrPrepareCustomer.ts` with:

```ts
import type Stripe from 'stripe';

/**
 * Outcome of looking up a Stripe customer by email before creating a Checkout session.
 *
 *   block  — caller must NOT create a new session; redirect to /settings.
 *   reuse  — caller must pass `customer: customerId` (not `customer_email`) to Checkout.
 *   create — no existing customer found; caller proceeds with the normal create-path.
 */
export type FindOrPrepareCustomerResult =
  | { kind: 'block'; reason: 'already_subscribed' }
  | { kind: 'reuse'; customerId: string }
  | { kind: 'create' };

const BLOCKING_STATUSES = new Set<Stripe.Subscription.Status>([
  'active',
  'trialing',
  'past_due',
]);

/**
 * Look up the most-recent Stripe customer matching this email and decide
 * whether to block (existing active/trialing/past_due sub), reuse (existing
 * customer w/ no live sub), or create (no match).
 *
 * Fail-open on customers.list (analytics-style errors must not block checkout).
 * Fail-closed on subscriptions.list (safer to deny than risk a duplicate sub).
 */
export async function findOrPrepareCustomer(
  stripe: Stripe,
  email: string,
): Promise<FindOrPrepareCustomerResult> {
  let existing: Stripe.Customer | undefined;
  try {
    const list = await stripe.customers.list({ email, limit: 1 });
    existing = list.data[0];
  } catch {
    return { kind: 'create' };
  }
  if (!existing) return { kind: 'create' };

  let subs: Stripe.ApiList<Stripe.Subscription>;
  try {
    subs = await stripe.subscriptions.list({
      customer: existing.id,
      status: 'all',
      limit: 5,
    });
  } catch {
    return { kind: 'block', reason: 'already_subscribed' };
  }

  const blocking = subs.data.find((s) => BLOCKING_STATUSES.has(s.status));
  if (blocking) return { kind: 'block', reason: 'already_subscribed' };

  return { kind: 'reuse', customerId: existing.id };
}

/**
 * UTC calendar date as YYYY-MM-DD. Used as the day-bucket portion of the
 * checkout idempotency-key so the same anonymous_id (or user_id) + plan
 * combination resolves to the same Stripe Checkout session for 24h.
 *
 * Accepts an optional `now` parameter for testability; defaults to current time.
 */
export function utcDayBucket(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}
```

- [ ] **Step 1.4: Run test to verify it passes**

Run: `npx vitest run src/app/api/v1/stripe/checkout/__tests__/findOrPrepareCustomer.test.ts`
Expected: PASS — 9 tests.

- [ ] **Step 1.5: Run typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 1.6: Commit**

```bash
git add src/app/api/v1/stripe/checkout/findOrPrepareCustomer.ts \
        src/app/api/v1/stripe/checkout/__tests__/findOrPrepareCustomer.test.ts
git commit -m "feat(checkout/T1): findOrPrepareCustomer helper + UTC day-bucket"
```

---

## Task 2: Wire `findOrPrepareCustomer` + idempotency-key into anonymous branch

**Files:**
- Modify: `src/app/api/v1/stripe/checkout/route.ts:218-296` (anonymous branch)
- Modify: `src/app/api/v1/stripe/checkout/__tests__/anonymous.test.ts` (extend tests)

- [ ] **Step 2.1: Write the failing tests**

Open `src/app/api/v1/stripe/checkout/__tests__/anonymous.test.ts` and replace its full content with:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const authMock = vi.fn();
const limitMock = vi.fn().mockResolvedValue({ success: true });
const sessionsCreateMock = vi.fn();
const customersListMock = vi.fn();
const subscriptionsListMock = vi.fn();
const dbSelectMock = vi.fn();

vi.mock('@clerk/nextjs/server', () => ({
  auth: () => authMock(),
}));
vi.mock('@/shared/lib/rate-limit', () => ({
  getRateLimiter: () => ({ limit: limitMock }),
}));
vi.mock('@/shared/lib/stripe', () => ({
  getStripe: () => ({
    checkout: { sessions: { create: sessionsCreateMock } },
    customers: { list: customersListMock },
    subscriptions: { list: subscriptionsListMock },
  }),
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
  // Default: no existing Stripe customer.
  customersListMock.mockResolvedValue({ data: [] });
  subscriptionsListMock.mockResolvedValue({ data: [] });
});

describe('POST /api/v1/stripe/checkout — anonymous branch', () => {
  it('pre-fills customer_email when email_lead exists and no Stripe customer matches', async () => {
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

  it('passes idempotencyKey scoped to anonymousId+plan+UTC-day to sessions.create', async () => {
    authMock.mockResolvedValue({ userId: null });
    dbSelectMock.mockReturnValue([]);

    await POST(makeRequest({ plan: 'pro_annual' }));
    expect(sessionsCreateMock).toHaveBeenCalledTimes(1);
    const opts = sessionsCreateMock.mock.calls[0][1];
    expect(opts.idempotencyKey).toMatch(/^checkout:anon-xyz:pro_annual:\d{4}-\d{2}-\d{2}$/);
  });

  it('reuses existing customer (passes customer:cus_X, drops customer_email) when lookup finds no active sub', async () => {
    authMock.mockResolvedValue({ userId: null });
    dbSelectMock.mockReturnValue([{ email: 'reuse@example.com' }]);
    customersListMock.mockResolvedValue({ data: [{ id: 'cus_reuse', email: 'reuse@example.com' }] });
    subscriptionsListMock.mockResolvedValue({ data: [{ status: 'canceled' }] });

    const res = await POST(makeRequest({ plan: 'pro_annual' }));
    expect(res.status).toBe(200);

    const call = sessionsCreateMock.mock.calls[0][0];
    expect(call.customer).toBe('cus_reuse');
    expect(call.customer_email).toBeUndefined();
  });

  it('blocks and redirects to /settings?already_subscribed=1 when existing customer has active sub', async () => {
    authMock.mockResolvedValue({ userId: null });
    dbSelectMock.mockReturnValue([{ email: 'active@example.com' }]);
    customersListMock.mockResolvedValue({ data: [{ id: 'cus_active', email: 'active@example.com' }] });
    subscriptionsListMock.mockResolvedValue({ data: [{ status: 'active' }] });

    const res = await POST(makeRequest({ plan: 'pro_annual' }));
    expect(res.status).toBe(200);
    expect(sessionsCreateMock).not.toHaveBeenCalled();
    const json = await res.json();
    expect(json.data.url).toBe('https://estrevia.app/settings?already_subscribed=1');
  });

  it('blocks when existing customer has trialing sub', async () => {
    authMock.mockResolvedValue({ userId: null });
    dbSelectMock.mockReturnValue([{ email: 'trial@example.com' }]);
    customersListMock.mockResolvedValue({ data: [{ id: 'cus_trial', email: 'trial@example.com' }] });
    subscriptionsListMock.mockResolvedValue({ data: [{ status: 'trialing' }] });

    const res = await POST(makeRequest({ plan: 'pro_annual' }));
    const json = await res.json();
    expect(sessionsCreateMock).not.toHaveBeenCalled();
    expect(json.data.url).toBe('https://estrevia.app/settings?already_subscribed=1');
  });
});
```

- [ ] **Step 2.2: Run tests to verify they fail**

Run: `npx vitest run src/app/api/v1/stripe/checkout/__tests__/anonymous.test.ts`
Expected: 3 NEW tests FAIL — `customer:cus_reuse` not set, `idempotencyKey` undefined, `/settings?already_subscribed=1` not returned. Existing 5 tests should still pass.

- [ ] **Step 2.3: Modify route.ts anonymous branch**

Open `src/app/api/v1/stripe/checkout/route.ts`. Add import near top (after existing imports):

```ts
import { findOrPrepareCustomer, utcDayBucket } from './findOrPrepareCustomer';
```

Replace the anonymous branch starting at the marker comment `// 5b. ANONYMOUS branch` (currently ~line 216-296). The full replacement block:

```ts
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

  // Dedup: if we already know the email, ask Stripe whether a matching
  // customer + active sub already exists. Block-or-reuse before creating
  // a fresh Checkout session.
  let reuseCustomerId: string | undefined = undefined;
  if (prefilledEmail) {
    const stripe = getStripe();
    const dedup = await findOrPrepareCustomer(stripe, prefilledEmail);
    if (dedup.kind === 'block') {
      return NextResponse.json(
        { success: true, data: { url: `${appUrl}/settings?already_subscribed=1` }, error: null },
        { status: 200 },
      );
    }
    if (dedup.kind === 'reuse') {
      reuseCustomerId = dedup.customerId;
    }
  }

  try {
    const stripe = getStripe();
    const metadata: Record<string, string> = { ...utm };
    if (anonymousId) metadata.anonymous_id = anonymousId;
    if (localeFromBody) metadata.locale = localeFromBody;

    const idempotencyKey = `checkout:${anonymousId ?? 'noanon'}:${plan}:${utcDayBucket()}`;

    const session = await stripe.checkout.sessions.create(
      {
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        ...(reuseCustomerId
          ? { customer: reuseCustomerId }
          : prefilledEmail
          ? { customer_email: prefilledEmail }
          : {}),
        ...(anonymousId ? { client_reference_id: anonymousId } : {}),
        locale: stripeLocale,
        metadata,
        subscription_data: {
          trial_period_days: 3,
          metadata,
        },
        success_url: `${appUrl}/checkout/complete?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/pricing`,
        allow_promotion_codes: true,
        billing_address_collection: 'auto',
      },
      { idempotencyKey },
    );

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

- [ ] **Step 2.4: Run tests to verify they pass**

Run: `npx vitest run src/app/api/v1/stripe/checkout/__tests__/anonymous.test.ts`
Expected: 8 PASS (5 original + 3 new).

- [ ] **Step 2.5: Run typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 2.6: Commit**

```bash
git add src/app/api/v1/stripe/checkout/route.ts \
        src/app/api/v1/stripe/checkout/__tests__/anonymous.test.ts
git commit -m "feat(checkout/T2): anon-branch customer dedup + idempotency-key"
```

---

## Task 3: Wire `findOrPrepareCustomer` + idempotency-key into authenticated branch

**Files:**
- Modify: `src/app/api/v1/stripe/checkout/route.ts:118-214` (authenticated branch)
- Modify: `src/app/api/v1/stripe/checkout/__tests__/route.test.ts` (extend tests)

- [ ] **Step 3.1: Write the failing tests**

Open `src/app/api/v1/stripe/checkout/__tests__/route.test.ts` and locate the `mocks` definition in `vi.hoisted` (lines 6-41). Replace the `mockGetStripe` definition (around line 8-10) with:

```ts
  const mockSessionsCreate = vi.fn();
  const mockCustomersList = vi.fn().mockResolvedValue({ data: [] });
  const mockSubscriptionsList = vi.fn().mockResolvedValue({ data: [] });
  const mockGetStripe = vi.fn(() => ({
    checkout: { sessions: { create: mockSessionsCreate } },
    customers: { list: mockCustomersList },
    subscriptions: { list: mockSubscriptionsList },
  }));
```

Then add the new mocks to the `return {...}` of `vi.hoisted`:

```ts
  return {
    mockSessionsCreate,
    mockCustomersList,
    mockSubscriptionsList,
    mockGetStripe,
    mockAuth,
    mockCookieGet,
    mockCookies,
    mockComputeIsPremium,
    mockGetRateLimiter,
    mockSelectLimit,
    mockSelectWhere,
    mockSelectFrom,
    mockSelect,
    mockGetDb,
  };
```

In `beforeEach()` (around line 141-144) replace the existing `mocks.mockGetStripe.mockReturnValue(...)` with:

```ts
  mocks.mockCustomersList.mockResolvedValue({ data: [] });
  mocks.mockSubscriptionsList.mockResolvedValue({ data: [] });
  mocks.mockSessionsCreate.mockResolvedValue({ id: 'cs_test_abc123', url: CHECKOUT_URL });
  mocks.mockGetStripe.mockReturnValue({
    checkout: { sessions: { create: mocks.mockSessionsCreate } },
    customers: { list: mocks.mockCustomersList },
    subscriptions: { list: mocks.mockSubscriptionsList },
  });
```

Append the following new `describe` block at the end of the file:

```ts
describe('POST /api/v1/stripe/checkout — dedup + idempotency (authenticated)', () => {
  it('passes idempotencyKey scoped to userId+plan+UTC-day to sessions.create', async () => {
    const req = makeRequest({ plan: 'pro_annual' });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const opts = mocks.mockSessionsCreate.mock.calls[0][1];
    expect(opts.idempotencyKey).toMatch(/^checkout:user_xyz:pro_annual:\d{4}-\d{2}-\d{2}$/);
  });

  it('reuses existing Stripe customer when DB has no stripeCustomerId but email matches', async () => {
    // DB returns user with email but no stripeCustomerId (e.g. stripe-sync gap).
    mocks.mockSelectLimit.mockResolvedValue([{
      email: 'sync-gap@example.com',
      stripeCustomerId: null,
      subscriptionTier: 'free',
      subscriptionStatus: null,
      subscriptionExpiresAt: null,
    }]);
    mocks.mockCustomersList.mockResolvedValue({
      data: [{ id: 'cus_recovered', email: 'sync-gap@example.com' }],
    });
    mocks.mockSubscriptionsList.mockResolvedValue({ data: [{ status: 'canceled' }] });

    const res = await POST(makeRequest({}));
    expect(res.status).toBe(200);

    const call = mocks.mockSessionsCreate.mock.calls[0][0];
    expect(call.customer).toBe('cus_recovered');
    expect(call.customer_email).toBeUndefined();
  });

  it('blocks with /settings?already_subscribed=1 when fallback lookup finds active sub', async () => {
    mocks.mockSelectLimit.mockResolvedValue([{
      email: 'has-active@example.com',
      stripeCustomerId: null,
      subscriptionTier: 'free',
      subscriptionStatus: null,
      subscriptionExpiresAt: null,
    }]);
    mocks.mockCustomersList.mockResolvedValue({
      data: [{ id: 'cus_active_x', email: 'has-active@example.com' }],
    });
    mocks.mockSubscriptionsList.mockResolvedValue({ data: [{ status: 'active' }] });

    const res = await POST(makeRequest({}));
    const json = await res.json();
    expect(mocks.mockSessionsCreate).not.toHaveBeenCalled();
    expect(json.data.url).toBe('https://estrevia.app/settings?already_subscribed=1');
  });

  it('skips fallback lookup when DB already has stripeCustomerId (uses stored customer)', async () => {
    mocks.mockSelectLimit.mockResolvedValue([{
      email: 'stored@example.com',
      stripeCustomerId: 'cus_stored',
      subscriptionTier: 'free',
      subscriptionStatus: null,
      subscriptionExpiresAt: null,
    }]);

    const res = await POST(makeRequest({}));
    expect(res.status).toBe(200);
    expect(mocks.mockCustomersList).not.toHaveBeenCalled();
    const call = mocks.mockSessionsCreate.mock.calls[0][0];
    expect(call.customer).toBe('cus_stored');
  });
});
```

- [ ] **Step 3.2: Run tests to verify they fail**

Run: `npx vitest run src/app/api/v1/stripe/checkout/__tests__/route.test.ts`
Expected: NEW dedup-idempotency tests FAIL. Original 11 tests should still pass.

- [ ] **Step 3.3: Modify route.ts authenticated branch**

Open `src/app/api/v1/stripe/checkout/route.ts`. Locate the authenticated branch (starts `// 5a. AUTHENTICATED branch (preserves existing behavior)`, ends with `} catch (err) {` of the outer try/catch around line 202).

Replace the block from `if (isAlreadyPremium) {` through the closing `}` of the outer try/catch (lines 156-213 in original) with:

```ts
    if (isAlreadyPremium) {
      return NextResponse.json(
        { success: true, data: { url: `${appUrl}/settings?already_subscribed=1` }, error: null },
        { status: 200 },
      );
    }

    // Stripe-sync gap fallback: if we have an email but no stripeCustomerId
    // on file, ask Stripe directly. Catches new users between checkout and
    // T13.1 hourly watchdog reconciliation.
    if (!stripeCustomerId && userEmail) {
      try {
        const stripe = getStripe();
        const dedup = await findOrPrepareCustomer(stripe, userEmail);
        if (dedup.kind === 'block') {
          return NextResponse.json(
            { success: true, data: { url: `${appUrl}/settings?already_subscribed=1` }, error: null },
            { status: 200 },
          );
        }
        if (dedup.kind === 'reuse') {
          stripeCustomerId = dedup.customerId;
        }
      } catch (err) {
        console.warn(
          '[stripe/checkout] auth-branch dedup lookup failed (non-fatal)',
          err instanceof Error ? err.message : 'unknown',
        );
      }
    }

    try {
      const stripe = getStripe();
      const idempotencyKey = `checkout:${userId}:${plan}:${utcDayBucket()}`;

      const session = await stripe.checkout.sessions.create(
        {
          mode: 'subscription',
          line_items: [{ price: priceId, quantity: 1 }],
          ...(stripeCustomerId ? { customer: stripeCustomerId } : { customer_email: userEmail }),
          client_reference_id: userId,
          locale: stripeLocale,
          metadata: {
            clerkUserId: userId,
            ...utm,
            ...(localeFromBody ? { locale: localeFromBody } : {}),
          },
          subscription_data: {
            ...(stripeCustomerId ? {} : { trial_period_days: 3 }),
            metadata: {
              clerkUserId: userId,
              ...utm,
              ...(localeFromBody ? { locale: localeFromBody } : {}),
            },
          },
          success_url: `${appUrl}/checkout/complete?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${appUrl}/pricing`,
          allow_promotion_codes: true,
          billing_address_collection: 'auto',
        },
        { idempotencyKey },
      );

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
```

Note: `stripeCustomerId` must be `let` (not `const`) at its declaration (around line 121). If it's currently `let` (it is in original), no change. Otherwise change to `let`.

- [ ] **Step 3.4: Run tests to verify they pass**

Run: `npx vitest run src/app/api/v1/stripe/checkout/__tests__/route.test.ts`
Expected: 15 PASS (11 original + 4 new).

- [ ] **Step 3.5: Run typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 3.6: Commit**

```bash
git add src/app/api/v1/stripe/checkout/route.ts \
        src/app/api/v1/stripe/checkout/__tests__/route.test.ts
git commit -m "feat(checkout/T3): auth-branch dedup fallback + idempotency-key"
```

---

## Task 4: Restrict `payment_method_types` to `['card', 'link']` in both branches

**Files:**
- Modify: `src/app/api/v1/stripe/checkout/route.ts` (both `sessions.create` calls)
- Modify: `src/app/api/v1/stripe/checkout/__tests__/route.test.ts` (assertions)
- Modify: `src/app/api/v1/stripe/checkout/__tests__/anonymous.test.ts` (assertions)

- [ ] **Step 4.1: Write the failing tests**

Append to `src/app/api/v1/stripe/checkout/__tests__/route.test.ts`:

```ts
describe('POST /api/v1/stripe/checkout — payment_method_types (authenticated)', () => {
  it('restricts payment_method_types to ["card", "link"]', async () => {
    const req = makeRequest({ plan: 'pro_annual' });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const call = mocks.mockSessionsCreate.mock.calls[0][0];
    expect(call.payment_method_types).toEqual(['card', 'link']);
  });
});
```

Append to `src/app/api/v1/stripe/checkout/__tests__/anonymous.test.ts`:

```ts
describe('POST /api/v1/stripe/checkout — payment_method_types (anonymous)', () => {
  it('restricts payment_method_types to ["card", "link"]', async () => {
    authMock.mockResolvedValue({ userId: null });
    dbSelectMock.mockReturnValue([]);

    await POST(makeRequest({ plan: 'pro_annual' }));
    const call = sessionsCreateMock.mock.calls[0][0];
    expect(call.payment_method_types).toEqual(['card', 'link']);
  });
});
```

- [ ] **Step 4.2: Run tests to verify they fail**

Run: `npx vitest run src/app/api/v1/stripe/checkout/__tests__/`
Expected: BOTH new payment_method_types tests FAIL (undefined !== `['card','link']`).

- [ ] **Step 4.3: Modify route.ts — add payment_method_types to both sessions.create calls**

In `src/app/api/v1/stripe/checkout/route.ts`, locate the authenticated `sessions.create` call (introduced in Task 3). Add `payment_method_types: ['card', 'link'],` immediately after `mode: 'subscription',`:

```ts
      const session = await stripe.checkout.sessions.create(
        {
          mode: 'subscription',
          payment_method_types: ['card', 'link'],
          line_items: [{ price: priceId, quantity: 1 }],
          // ... rest unchanged ...
        },
        { idempotencyKey },
      );
```

Locate the anonymous `sessions.create` call (introduced in Task 2). Add the same line after `mode: 'subscription',`:

```ts
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'subscription',
        payment_method_types: ['card', 'link'],
        line_items: [{ price: priceId, quantity: 1 }],
        // ... rest unchanged ...
      },
      { idempotencyKey },
    );
```

- [ ] **Step 4.4: Run tests to verify they pass**

Run: `npx vitest run src/app/api/v1/stripe/checkout/__tests__/`
Expected: ALL tests pass (route.test.ts: 16, anonymous.test.ts: 9, findOrPrepareCustomer.test.ts: 9).

- [ ] **Step 4.5: Run typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 4.6: Commit**

```bash
git add src/app/api/v1/stripe/checkout/route.ts \
        src/app/api/v1/stripe/checkout/__tests__/route.test.ts \
        src/app/api/v1/stripe/checkout/__tests__/anonymous.test.ts
git commit -m "feat(checkout/T4): restrict payment_method_types to card+link for sub mode"
```

---

## Task 5: PostHog `loaded` callback for locale super-prop race fix

**Files:**
- Modify: `src/shared/components/PostHogProvider.tsx:86-113` (init block)
- Modify: `src/shared/components/__tests__/PostHogProvider.test.tsx` (new ordering test)

- [ ] **Step 5.1: Write the failing test**

Open `src/shared/components/__tests__/PostHogProvider.test.tsx`. At the top, extend the `vi.hoisted` block:

```ts
const hoisted = vi.hoisted(() => {
  const mockUsePathname = vi.fn();
  const mockRegister = vi.fn();
  const mockInit = vi.fn();
  return { mockUsePathname, mockRegister, mockInit };
});
```

Add the posthog-js mock under the `next/navigation` mock (around line 15-17):

```ts
vi.mock('posthog-js', () => ({
  default: {
    init: hoisted.mockInit,
    register: hoisted.mockRegister,
  },
}));
```

Append the following new `describe` block at the end of the file:

```ts
describe('PostHogProvider — first-pageview locale via loaded callback', () => {
  it('passes a loaded callback to posthog.init that calls register({locale}) BEFORE first capture', async () => {
    hoisted.mockUsePathname.mockReturnValue('/es/pricing');
    // Accept consent so init runs.
    window.localStorage.setItem('estrevia_cookie_consent', 'accepted');
    // Reset the window posthog stub from the outer beforeEach so the test
    // observes the import-path register, not the route-change useEffect.
    delete (window as unknown as Record<string, unknown>).posthog;

    render(<PostHogProvider><div /></PostHogProvider>);

    await waitFor(() => {
      expect(hoisted.mockInit).toHaveBeenCalledTimes(1);
    });

    const [, options] = hoisted.mockInit.mock.calls[0];
    expect(typeof options.loaded).toBe('function');

    // Invoke the loaded callback as PostHog would, with a fake ph stub.
    const fakePh = { register: hoisted.mockRegister };
    options.loaded(fakePh);

    expect(hoisted.mockRegister).toHaveBeenCalledWith({ locale: 'es' });
  });

  it('loaded callback uses locale="en" on EN/non-ES routes', async () => {
    hoisted.mockUsePathname.mockReturnValue('/sign-in');
    window.localStorage.setItem('estrevia_cookie_consent', 'accepted');
    delete (window as unknown as Record<string, unknown>).posthog;

    render(<PostHogProvider><div /></PostHogProvider>);

    await waitFor(() => {
      expect(hoisted.mockInit).toHaveBeenCalledTimes(1);
    });

    const [, options] = hoisted.mockInit.mock.calls[0];
    const fakePh = { register: hoisted.mockRegister };
    options.loaded(fakePh);

    expect(hoisted.mockRegister).toHaveBeenCalledWith({ locale: 'en' });
  });
});
```

- [ ] **Step 5.2: Run tests to verify they fail**

Run: `npx vitest run src/shared/components/__tests__/PostHogProvider.test.tsx`
Expected: NEW 2 tests FAIL — `options.loaded` is undefined. Existing 5 tests should still pass.

- [ ] **Step 5.3: Modify PostHogProvider.tsx**

Open `src/shared/components/PostHogProvider.tsx`. Locate the `initPostHog` function. Replace the `posthog.init(...)` call (lines 86-109 in original) with:

```ts
    // Compute locale BEFORE init — pathname is in scope of this provider
    // render. Required so the first $pageview (fired inside init when
    // capture_pageview: true) carries the locale super-property.
    const initialLocale = pathname?.startsWith('/es') ? 'es' : 'en';

    posthog.init(apiKey, {
      // Same-origin reverse proxy bypasses ad blockers that block us.i.posthog.com
      // directly. Rewrites in next.config.ts forward /ingest/* → PostHog hosts.
      // ui_host keeps toolbar/recording links pointing at the real PostHog UI.
      api_host: '/ingest',
      ui_host: 'https://us.posthog.com',
      capture_pageview: true,
      disable_session_recording: true,
      persistence: 'localStorage',
      autocapture: false,
      // Heatmaps + rage clicks + scroll depth without enabling full autocapture.
      // PII guard via sanitize_properties continues to strip birth-data params.
      enable_heatmaps: true,
      // Core Web Vitals (LCP, INP, CLS) from real users — feeds PostHog
      // Web Vitals dashboard. Lightweight, runs in browser idle time.
      capture_performance: { web_vitals: true },
      bootstrap: {},
      sanitize_properties: (properties: Record<string, unknown>) => ({
        ...properties,
        $current_url: stripPiiFromUrl(properties.$current_url),
        $referrer: stripPiiFromUrl(properties.$referrer),
        $initial_referrer: stripPiiFromUrl(properties.$initial_referrer),
      }),
      loaded: (ph: { register: (props: Record<string, unknown>) => void }) => {
        ph.register({ locale: initialLocale });
      },
    });
```

- [ ] **Step 5.4: Run tests to verify they pass**

Run: `npx vitest run src/shared/components/__tests__/PostHogProvider.test.tsx`
Expected: 7 PASS (5 original + 2 new).

- [ ] **Step 5.5: Run typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 5.6: Commit**

```bash
git add src/shared/components/PostHogProvider.tsx \
        src/shared/components/__tests__/PostHogProvider.test.tsx
git commit -m "fix(posthog/T5): set locale super-prop via init.loaded callback"
```

---

## Final verification

- [ ] **Step F.1: Run the full test suite**

Run: `npm test`
Expected: full pass (existing pre-fix count + 13 new tests).

- [ ] **Step F.2: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step F.3: Lint (touched files only — ignore `.claude/worktrees/` pollution)**

Run: `npx eslint src/app/api/v1/stripe/checkout/ src/shared/components/PostHogProvider.tsx src/shared/components/__tests__/PostHogProvider.test.tsx`
Expected: 0 errors on touched files (pre-existing warnings outside scope acceptable).

- [ ] **Step F.4: Manual smoke (post-deploy)**

After founder pushes + Vercel deploys:

1. Open `/es/pricing` incognito, submit email, complete to Stripe Checkout. Verify only Card + Link tabs (no Cash App, Klarna, Amazon Pay). Note the Stripe customer ID from the URL or webhook log.
2. Open `/es/pricing` in a different incognito (clears anonymous_id cookie), submit the SAME email. Verify response URL is `/settings?already_subscribed=1` (NOT a Stripe checkout URL). Confirm no new `cus_YYY` in Stripe Dashboard.
3. Open `/es/pricing` incognito, accept cookies, complete one flow. In PostHog Live Events, verify the first `$pageview` event has `properties.locale: 'es'`.
4. Run HogQL in PostHog: `SELECT count() FROM events WHERE timestamp > now() - INTERVAL 1 HOUR AND properties.locale IS NULL`. Expect 0 (was 86% before).

## Out of scope (do not implement in this plan)

- Backfill or merge of existing duplicate Stripe customers (gabrieljlugo, jaderising44 — handled manually 2026-05-21)
- Webhook merge for any race-condition dups (separate plan if observed post-deploy)
- Stripe Customer Portal setup for self-serve sub management
- Form-level submit-button debounce (UX concern, separate plan)
- PayPal / SEPA / BNPL integration
- Server-side locale super-prop on `trackServerEvent`
- Cookie-based locale detection for routes without `/es` prefix
- Historical PostHog event backfill (events immutable; only new benefit)

---

## Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| `customers.list` picks wrong cus when multiple match | Medium | Stripe default sort: created desc (most recent first); active-sub check blocks the worst case |
| Idempotency-key collision across legitimate retries | Low | 24h UTC-day bucket; different plans have different keys; same plan + same anon = intentional dedup |
| `loaded` callback runs after first `$pageview` despite SDK docs | Low | Tests verify via spy; if it ever regresses, the existing route-change useEffect still updates locale on next navigation |
| Removing wallet PMTs hurts LATAM conversion | Low | All current customers used card-backed PMTs; ES currency badge already shipped to address perceived-price concern |
| `subscription_data.trial_period_days: 3` applied to reused customer = abuse vector | Low | Block on active/trialing/past_due covers the worst path; if observed, separate ticket |
