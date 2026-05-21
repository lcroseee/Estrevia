import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — must be declared before vi.mock() factories reference them.
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => {
  const mockSessionsCreate = vi.fn();
  const mockCustomersList = vi.fn().mockResolvedValue({ data: [] });
  const mockSubscriptionsList = vi.fn().mockResolvedValue({ data: [] });
  const mockGetStripe = vi.fn(() => ({
    checkout: { sessions: { create: mockSessionsCreate } },
    customers: { list: mockCustomersList },
    subscriptions: { list: mockSubscriptionsList },
  }));

  const mockAuth = vi.fn();
  const mockCookieGet = vi.fn((): { value: string } | undefined => undefined);
  const mockCookies = vi.fn(() => Promise.resolve({ get: mockCookieGet }));

  const mockComputeIsPremium = vi.fn().mockReturnValue(false);
  const mockGetRateLimiter = vi.fn(() => ({
    limit: vi.fn().mockResolvedValue({ success: true }),
  }));

  const mockSelectLimit = vi.fn();
  const mockSelectWhere = vi.fn(() => ({ limit: mockSelectLimit }));
  const mockSelectFrom = vi.fn(() => ({ where: mockSelectWhere }));
  const mockSelect = vi.fn(() => ({ from: mockSelectFrom }));
  const mockGetDb = vi.fn(() => ({ select: mockSelect }));

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
});

vi.mock('@clerk/nextjs/server', () => ({
  auth: mocks.mockAuth,
}));

vi.mock('next/headers', () => ({
  cookies: mocks.mockCookies,
}));

vi.mock('@/modules/auth/lib/premium', () => ({
  computeIsPremium: mocks.mockComputeIsPremium,
}));

vi.mock('@/shared/lib/stripe', () => ({
  getStripe: mocks.mockGetStripe,
}));

vi.mock('@/shared/lib/db', () => ({
  getDb: mocks.mockGetDb,
}));

vi.mock('@/shared/lib/schema', () => ({
  users: {
    id: 'id',
    email: 'email',
    stripeCustomerId: 'stripe_customer_id',
    subscriptionTier: 'subscription_tier',
    subscriptionStatus: 'subscription_status',
    subscriptionExpiresAt: 'subscription_expires_at',
  },
  emailLeads: {
    email: 'email',
    anonymousId: 'anonymous_id',
    createdAt: 'created_at',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ col, val })),
  desc: vi.fn((col: unknown) => ({ col, dir: 'desc' })),
}));

vi.mock('@/shared/lib/rate-limit', () => ({
  getRateLimiter: mocks.mockGetRateLimiter,
}));

vi.mock('@/shared/lib/analytics', () => ({
  trackServerEvent: vi.fn(),
  AnalyticsEvent: { ANONYMOUS_CHECKOUT_STARTED: 'anonymous_checkout_started' },
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import route under test AFTER all mocks are wired up.
// ---------------------------------------------------------------------------
import { POST } from '../route';

const USER_ID = 'user_xyz';
const CHECKOUT_URL = 'https://stripe.com/pay/cs_test_abc123';

function makeRequest(body: unknown): Request {
  return new Request('https://estrevia.app/api/v1/stripe/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();

  process.env.STRIPE_PRICE_ID_PRO_ANNUAL = 'price_pro_annual_test';
  process.env.STRIPE_PRICE_ID_PRO_MONTHLY = 'price_pro_monthly_test';
  process.env.NEXT_PUBLIC_APP_URL = 'https://estrevia.app';

  mocks.mockAuth.mockResolvedValue({ userId: USER_ID });
  mocks.mockCookieGet.mockReturnValue(undefined);
  mocks.mockCookies.mockResolvedValue({ get: mocks.mockCookieGet });
  mocks.mockGetRateLimiter.mockReturnValue({
    limit: vi.fn().mockResolvedValue({ success: true }),
  });
  mocks.mockComputeIsPremium.mockReturnValue(false);

  // DB returns a free user row with no existing Stripe customer
  mocks.mockSelectLimit.mockResolvedValue([{
    email: 'test@example.com',
    stripeCustomerId: null,
    subscriptionTier: 'free',
    subscriptionStatus: null,
    subscriptionExpiresAt: null,
  }]);
  mocks.mockSelectWhere.mockImplementation(() => ({ limit: mocks.mockSelectLimit }));
  mocks.mockSelectFrom.mockImplementation(() => ({ where: mocks.mockSelectWhere }));
  mocks.mockSelect.mockImplementation(() => ({ from: mocks.mockSelectFrom }));
  mocks.mockGetDb.mockReturnValue({ select: mocks.mockSelect });

  mocks.mockCustomersList.mockResolvedValue({ data: [] });
  mocks.mockSubscriptionsList.mockResolvedValue({ data: [] });
  mocks.mockSessionsCreate.mockResolvedValue({ id: 'cs_test_abc123', url: CHECKOUT_URL });
  mocks.mockGetStripe.mockReturnValue({
    checkout: { sessions: { create: mocks.mockSessionsCreate } },
    customers: { list: mocks.mockCustomersList },
    subscriptions: { list: mocks.mockSubscriptionsList },
  });
});

describe('POST /api/v1/stripe/checkout — UTM metadata forwarding', () => {
  it('forwards utm_source and utm_click_timestamp to session metadata and subscription_data.metadata', async () => {
    const req = makeRequest({
      utm_source: 'meta',
      utm_click_timestamp: '2026-05-04T12:00:00.000Z',
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(mocks.mockSessionsCreate).toHaveBeenCalledOnce();
    const callArg = mocks.mockSessionsCreate.mock.calls[0][0];

    expect(callArg.metadata).toMatchObject({
      clerkUserId: USER_ID,
      utm_source: 'meta',
      utm_click_timestamp: '2026-05-04T12:00:00.000Z',
    });

    expect(callArg.subscription_data.metadata).toMatchObject({
      clerkUserId: USER_ID,
      utm_source: 'meta',
      utm_click_timestamp: '2026-05-04T12:00:00.000Z',
    });
  });

  it('omits all UTM keys from metadata when body is empty', async () => {
    const req = makeRequest({});

    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(mocks.mockSessionsCreate).toHaveBeenCalledOnce();
    const callArg = mocks.mockSessionsCreate.mock.calls[0][0];

    expect(callArg.metadata).toEqual({ clerkUserId: USER_ID });
    expect(callArg.subscription_data.metadata).toEqual({ clerkUserId: USER_ID });
  });
});

describe('POST /api/v1/stripe/checkout — locale forwarding (authenticated)', () => {
  it('passes locale="es" to Stripe Checkout when body.locale="es"', async () => {
    const req = makeRequest({ locale: 'es' });
    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(mocks.mockSessionsCreate).toHaveBeenCalledOnce();
    const callArg = mocks.mockSessionsCreate.mock.calls[0][0];
    expect(callArg.locale).toBe('es');
  });

  it('passes locale="auto" when body.locale="en"', async () => {
    const req = makeRequest({ locale: 'en' });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const callArg = mocks.mockSessionsCreate.mock.calls[0][0];
    expect(callArg.locale).toBe('auto');
  });

  it('passes locale="auto" when body.locale is omitted (backward compat)', async () => {
    const req = makeRequest({});
    const res = await POST(req);
    expect(res.status).toBe(200);

    const callArg = mocks.mockSessionsCreate.mock.calls[0][0];
    expect(callArg.locale).toBe('auto');
  });

  it('falls back to locale="auto" on invalid locale (lenient parse pattern)', async () => {
    // Existing route swallows zod errors silently and defaults to pro_annual
    // with empty utm. We preserve that contract; invalid locale → 'auto'.
    const req = makeRequest({ locale: 'fr' });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const callArg = mocks.mockSessionsCreate.mock.calls[0][0];
    expect(callArg.locale).toBe('auto');
  });

  it('includes locale in session metadata and subscription_data.metadata when set', async () => {
    const req = makeRequest({ locale: 'es', utm_source: 'meta' });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const callArg = mocks.mockSessionsCreate.mock.calls[0][0];
    expect(callArg.metadata).toMatchObject({
      clerkUserId: USER_ID,
      locale: 'es',
      utm_source: 'meta',
    });
    expect(callArg.subscription_data.metadata).toMatchObject({
      clerkUserId: USER_ID,
      locale: 'es',
      utm_source: 'meta',
    });
  });

  it('omits locale key from metadata when locale not set', async () => {
    const req = makeRequest({ utm_source: 'meta' });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const callArg = mocks.mockSessionsCreate.mock.calls[0][0];
    expect(callArg.metadata).not.toHaveProperty('locale');
    expect(callArg.subscription_data.metadata).not.toHaveProperty('locale');
  });
});

describe('POST /api/v1/stripe/checkout — locale forwarding (anonymous)', () => {
  beforeEach(() => {
    // Unauthenticate for the anonymous branch.
    mocks.mockAuth.mockResolvedValue({ userId: null });
    mocks.mockCookieGet.mockReturnValue({ value: 'anon_abc' });
  });

  it('passes locale="es" to anonymous Stripe Checkout', async () => {
    const req = makeRequest({ locale: 'es' });
    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(mocks.mockSessionsCreate).toHaveBeenCalledOnce();
    const callArg = mocks.mockSessionsCreate.mock.calls[0][0];
    expect(callArg.locale).toBe('es');
    expect(callArg.metadata).toMatchObject({ locale: 'es', anonymous_id: 'anon_abc' });
  });
});

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

describe('POST /api/v1/stripe/checkout — payment_method_types (authenticated)', () => {
  it('restricts payment_method_types to ["card", "link"]', async () => {
    const req = makeRequest({ plan: 'pro_annual' });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const call = mocks.mockSessionsCreate.mock.calls[0][0];
    expect(call.payment_method_types).toEqual(['card', 'link']);
  });
});
