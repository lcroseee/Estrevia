import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks must be hoisted alongside vi.mock() factories. vitest hoists vi.mock()
// to the top of the file; without vi.hoisted(), const-bound mocks would still
// be in their TDZ when the factory closure resolves them.
// ---------------------------------------------------------------------------
const {
  mockConstructEvent,
  mockSubscriptionsRetrieve,
  mockReturning,
  mockOnConflictDoNothing,
  mockOnConflictDoUpdate,
  mockInsertValues,
  mockInsert,
  mockUpdateWhere,
  mockUpdateSet,
  mockUpdate,
  mockSelectLimit,
  mockSelectWhere,
  mockSelectFrom,
  mockSelect,
  mockTrackServerEvent,
} = vi.hoisted(() => {
  const mockReturning = vi.fn().mockResolvedValue([{ eventId: 'evt_test_001' }]);
  const mockOnConflictDoNothing = vi.fn(() => ({ returning: mockReturning }));
  const mockOnConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
  const mockInsertValues = vi.fn(() => ({
    onConflictDoNothing: mockOnConflictDoNothing,
    onConflictDoUpdate: mockOnConflictDoUpdate,
  }));
  const mockInsert = vi.fn(() => ({ values: mockInsertValues }));
  const mockUpdateWhere = vi.fn().mockResolvedValue({ rowCount: 1 });
  const mockUpdateSet = vi.fn(() => ({ where: mockUpdateWhere }));
  const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }));
  const mockSelectLimit = vi.fn().mockResolvedValue([]);
  const mockSelectWhere = vi.fn(() => ({ limit: mockSelectLimit }));
  const mockSelectFrom = vi.fn(() => ({ where: mockSelectWhere }));
  const mockSelect = vi.fn(() => ({ from: mockSelectFrom }));
  return {
    mockConstructEvent: vi.fn(),
    mockSubscriptionsRetrieve: vi.fn(),
    mockReturning,
    mockOnConflictDoNothing,
    mockOnConflictDoUpdate,
    mockInsertValues,
    mockInsert,
    mockUpdateWhere,
    mockUpdateSet,
    mockUpdate,
    mockSelectLimit,
    mockSelectWhere,
    mockSelectFrom,
    mockSelect,
    mockTrackServerEvent: vi.fn(),
  };
});

vi.mock('next/headers', () => ({
  headers: async () => new Map([['stripe-signature', 't=1700000000,v1=sig']]),
}));

vi.mock('@/shared/lib/stripe', () => ({
  getStripe: () => ({
    webhooks: { constructEvent: mockConstructEvent },
    subscriptions: { retrieve: mockSubscriptionsRetrieve },
  }),
}));

vi.mock('@/shared/lib/db', () => ({
  getDb: () => ({
    insert: mockInsert,
    update: mockUpdate,
    select: mockSelect,
  }),
}));

vi.mock('@/shared/lib/analytics', () => ({
  trackServerEvent: mockTrackServerEvent,
  AnalyticsEvent: { SUBSCRIPTION_STARTED: 'subscription_started' },
}));

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

import { POST } from '../route';

function makeReq(): Request {
  return new Request('https://estrevia.app/api/webhooks/stripe', {
    method: 'POST',
    body: 'raw_stripe_body',
  });
}

beforeEach(() => {
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_stripe_test';
  process.env.STRIPE_PRICE_ID_PRO_MONTHLY = 'price_pro_monthly_test';
  mockConstructEvent.mockReset();
  mockSubscriptionsRetrieve.mockReset();
  mockTrackServerEvent.mockReset();
  vi.clearAllMocks();
  // Re-prime the dedup return path
  mockReturning.mockResolvedValue([{ eventId: 'evt_test_001' }]);
});

afterEach(() => {
  delete process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.STRIPE_PRICE_ID_PRO_MONTHLY;
});

describe('POST /api/webhooks/stripe — subscription_started firing', () => {
  it('fires subscription_started with UTM attribution on checkout.session.completed', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_test_001',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_001',
          mode: 'subscription',
          metadata: {
            clerkUserId: 'user_2checkout_001',
            utm_source: 'meta',
            utm_content: 'ad_001',
            utm_campaign: 'launch',
          },
          customer: 'cus_test_001',
          subscription: 'sub_test_001',
          amount_total: 999,   // $9.99 in cents
          currency: 'usd',
        },
      },
    });
    mockSubscriptionsRetrieve.mockResolvedValue({
      id: 'sub_test_001',
      status: 'active',
      trial_end: null,
      items: {
        data: [
          { current_period_end: 1735689600, price: { id: 'price_pro_monthly_test' } },
        ],
      },
    });

    const res = await POST(makeReq());
    expect(res.status).toBe(200);

    expect(mockTrackServerEvent).toHaveBeenCalledTimes(1);
    expect(mockTrackServerEvent).toHaveBeenCalledWith(
      'user_2checkout_001',
      'subscription_started',
      expect.objectContaining({
        plan: 'pro_monthly',
        amount_usd: 9.99,
        currency: 'usd',
        stripe_subscription_id: 'sub_test_001',
        utm_source: 'meta',
        utm_content: 'ad_001',
        utm_campaign: 'launch',
        $insert_id: 'sub_test_001:subscription_started',
      }),
    );
  });

  it('does NOT fire subscription_started on customer.subscription.updated', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_test_002',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_test_002',
          status: 'active',
          metadata: { clerkUserId: 'user_2update' },
          customer: 'cus_test_002',
          trial_end: null,
          items: {
            data: [
              { current_period_end: 1735689600, price: { id: 'price_pro_monthly_test' } },
            ],
          },
        },
      },
    });

    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    expect(mockTrackServerEvent).not.toHaveBeenCalled();
  });

  it('does NOT fire when checkout.session.completed has no clerkUserId in metadata', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_test_003',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_003',
          mode: 'subscription',
          metadata: {}, // no clerkUserId
          customer: 'cus_test_003',
          subscription: 'sub_test_003',
        },
      },
    });

    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    expect(mockTrackServerEvent).not.toHaveBeenCalled();
  });

  it('returns 200 when PostHog throws — Stripe must not retry', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_test_004',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_004',
          mode: 'subscription',
          metadata: { clerkUserId: 'user_2err' },
          customer: 'cus_test_004',
          subscription: 'sub_test_004',
          amount_total: 999,
          currency: 'usd',
        },
      },
    });
    mockSubscriptionsRetrieve.mockResolvedValue({
      id: 'sub_test_004',
      status: 'active',
      trial_end: null,
      items: { data: [{ current_period_end: 1735689600, price: { id: 'price_pro_monthly_test' } }] },
    });
    mockTrackServerEvent.mockImplementationOnce(() => {
      throw new Error('PostHog timeout');
    });

    const res = await POST(makeReq());
    expect(res.status).toBe(200);
  });
});
