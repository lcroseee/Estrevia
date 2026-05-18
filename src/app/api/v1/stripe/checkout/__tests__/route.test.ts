import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — must be declared before vi.mock() factories reference them.
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => {
  const mockSessionsCreate = vi.fn();
  const mockGetStripe = vi.fn(() => ({
    checkout: { sessions: { create: mockSessionsCreate } },
  }));

  const mockAuth = vi.fn();
  const mockCookieGet = vi.fn(() => undefined);
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

  mocks.mockSessionsCreate.mockResolvedValue({ id: 'cs_test_abc123', url: CHECKOUT_URL });
  mocks.mockGetStripe.mockReturnValue({
    checkout: { sessions: { create: mocks.mockSessionsCreate } },
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
