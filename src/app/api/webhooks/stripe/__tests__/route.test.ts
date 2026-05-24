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
  mockSendPurchaseConfirmationEmail,
  mockSendSubscriptionCanceledEmail,
  mockSendTrialEndingEmail,
  mockSendDunningEmail,
  mockChargesRetrieve,
  mockBillingPortalCreate,
  mockPaymentIntentsRetrieve,
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
    mockSendPurchaseConfirmationEmail: vi.fn().mockResolvedValue(undefined),
    mockSendSubscriptionCanceledEmail: vi.fn().mockResolvedValue(undefined),
    mockSendTrialEndingEmail: vi.fn().mockResolvedValue(undefined),
    // T1 dunning mocks — hoisted so the single vi.mock('@/shared/lib/stripe') can reference them
    mockSendDunningEmail: vi.fn().mockResolvedValue({ sent: true, messageId: 'resend_d0_001' }),
    mockChargesRetrieve: vi.fn().mockResolvedValue({
      payment_intent: { last_payment_error: { decline_code: null } },
    }),
    mockBillingPortalCreate: vi.fn().mockResolvedValue({ url: 'https://billing.stripe.com/p/test' }),
    mockPaymentIntentsRetrieve: vi.fn().mockResolvedValue({ last_payment_error: null }),
  };
});

vi.mock('next/headers', () => ({
  headers: async () => new Map([['stripe-signature', 't=1700000000,v1=sig']]),
}));

vi.mock('@/shared/lib/stripe', () => ({
  getStripe: () => ({
    webhooks: { constructEvent: mockConstructEvent },
    subscriptions: { retrieve: mockSubscriptionsRetrieve },
    paymentIntents: { retrieve: mockPaymentIntentsRetrieve },
    charges: { retrieve: mockChargesRetrieve },
    billingPortal: { sessions: { create: mockBillingPortalCreate } },
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

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), addBreadcrumb: vi.fn() }));

// Email helpers — mocked so no real Resend calls happen in tests
vi.mock('@/shared/lib/email', () => ({
  sendPurchaseConfirmationEmail: mockSendPurchaseConfirmationEmail,
  sendSubscriptionCanceledEmail: mockSendSubscriptionCanceledEmail,
  sendTrialEndingEmail: mockSendTrialEndingEmail,
}));

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
  mockSendPurchaseConfirmationEmail.mockReset();
  mockSendSubscriptionCanceledEmail.mockReset();
  mockSendTrialEndingEmail.mockReset();
  vi.clearAllMocks();
  // Re-prime the dedup return path
  mockReturning.mockResolvedValue([{ eventId: 'evt_test_001' }]);
  // Default: no user row for email queries
  mockSelectLimit.mockResolvedValue([]);
  mockSendPurchaseConfirmationEmail.mockResolvedValue(undefined);
  mockSendSubscriptionCanceledEmail.mockResolvedValue(undefined);
  // T1: dunning defaults
  mockSendDunningEmail.mockResolvedValue({ sent: true, messageId: 'resend_d0_001' });
  mockBillingPortalCreate.mockResolvedValue({ url: 'https://billing.stripe.com/p/test' });
  mockPaymentIntentsRetrieve.mockResolvedValue({ last_payment_error: null });
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
          customer_details: { email: 'paid-user@example.com' },
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
    // T18 (v3b): properties also include `value`, `predicted_ltv`, and
    // `email` so T11's analytics extension can forward CAPI Subscribe with
    // value-based bidding signals + Custom Audience matching.
    expect(mockTrackServerEvent).toHaveBeenCalledWith(
      'user_2checkout_001',
      'subscription_started',
      expect.objectContaining({
        plan: 'pro_monthly',
        amount_usd: 9.99,
        value: 9.99,                // CAPI custom_data.value
        currency: 'usd',
        predicted_ltv: 30,          // CAPI custom_data.predicted_ltv
        stripe_subscription_id: 'sub_test_001',
        utm_source: 'meta',
        utm_content: 'ad_001',
        utm_campaign: 'launch',
        email: 'paid-user@example.com', // for CAPI hashing in T11 wrapper
        $insert_id: 'cs_test_001:subscription_started',
      }),
    );
  });

  it('forwards CAPI-required fields ($insert_id + value + currency + email) for T11 to fire CAPI Subscribe', async () => {
    // T18: Wire-up test — locks in the contract that the webhook hands T11's
    // analytics extension everything it needs to fire a CAPI Subscribe event
    // matching the browser-side fbq Subscribe (deduped via event_id).
    // Actual CAPI fire is tested in src/shared/lib/__tests__/analytics-capi.test.ts.
    mockConstructEvent.mockReturnValue({
      id: 'evt_test_capi_001',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_capi',
          mode: 'subscription',
          metadata: { clerkUserId: 'user_test_clerk_id' },
          customer: 'cus_test_capi',
          customer_details: { email: 'capi-target@example.com' },
          subscription: 'sub_test_capi',
          amount_total: 4999,  // $49.99 annual
          currency: 'usd',
        },
      },
    });
    mockSubscriptionsRetrieve.mockResolvedValue({
      id: 'sub_test_capi',
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

    expect(mockTrackServerEvent).toHaveBeenCalledWith(
      'user_test_clerk_id',
      'subscription_started',
      expect.objectContaining({
        // Dedupe key reused as CAPI event_id (matches browser fbq Subscribe)
        $insert_id: 'cs_test_capi:subscription_started',
        // Value-based bidding signals
        value: 49.99,
        currency: 'usd',
        predicted_ltv: 30,
        // Plaintext email forwarded for CAPI hashing — never logged here
        email: 'capi-target@example.com',
      }),
    );
  });

  it('omits email when Stripe omits customer_details (no field forced)', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_test_no_email',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_no_email',
          mode: 'subscription',
          metadata: { clerkUserId: 'user_no_email' },
          customer: 'cus_no_email',
          // No customer_details — older sessions or incomplete objects
          subscription: 'sub_no_email',
          amount_total: 999,
          currency: 'usd',
        },
      },
    });
    mockSubscriptionsRetrieve.mockResolvedValue({
      id: 'sub_no_email',
      status: 'active',
      trial_end: null,
      items: { data: [{ current_period_end: 1735689600, price: { id: 'price_pro_monthly_test' } }] },
    });

    const res = await POST(makeReq());
    expect(res.status).toBe(200);

    // email defaults to undefined so T11's CAPI wrapper skips user_data.em
    expect(mockTrackServerEvent).toHaveBeenCalledWith(
      'user_no_email',
      'subscription_started',
      expect.objectContaining({ email: undefined, predicted_ltv: 30 }),
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

// ---------------------------------------------------------------------------
// T3: Purchase confirmation + cancellation email tests
// ---------------------------------------------------------------------------
describe('POST /api/webhooks/stripe — T3 email hookups', () => {
  it('checkout.session.completed sends purchase confirmation email with correct plan name', async () => {
    // Pro Annual — price has interval='year'
    mockConstructEvent.mockReturnValue({
      id: 'evt_purchase_annual',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_annual_001',
          mode: 'subscription',
          metadata: { clerkUserId: 'user_annual_001' },
          customer: 'cus_annual_001',
          customer_details: { email: 'buyer@example.com' },
          subscription: 'sub_annual_001',
          amount_total: 4999,
          currency: 'usd',
        },
      },
    });
    mockSubscriptionsRetrieve.mockResolvedValue({
      id: 'sub_annual_001',
      status: 'active',
      trial_end: null,
      items: {
        data: [{
          current_period_end: 1767225600, // 2026-01-01
          price: {
            id: 'price_pro_annual_test',
            recurring: { interval: 'year' },
          },
        }],
      },
    });
    // Mock user row for email query
    mockSelectLimit.mockResolvedValue([
      { email: 'buyer@example.com', locale: 'en' },
    ]);
    process.env.STRIPE_PRICE_ID_PRO_ANNUAL = 'price_pro_annual_test';

    const res = await POST(makeReq());
    expect(res.status).toBe(200);

    expect(mockSendPurchaseConfirmationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_annual_001',
        email: 'buyer@example.com',
        locale: 'en',
        plan: 'pro_annual',
        subscriptionId: 'sub_annual_001',
      }),
    );
    delete process.env.STRIPE_PRICE_ID_PRO_ANNUAL;
  });

  it('subscription.deleted sends cancellation email with formatted accessEndDate', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_cancel_001',
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_cancel_001',
          status: 'canceled',
          metadata: { clerkUserId: 'user_cancel_001' },
          customer: 'cus_cancel_001',
          trial_end: null,
          items: {
            data: [{
              current_period_end: 1767225600, // ~2026-01-01
              price: { id: 'price_pro_monthly_test', recurring: { interval: 'month' } },
            }],
          },
        },
      },
    });
    // Mock user row for cancellation email query
    mockSelectLimit.mockResolvedValue([
      { email: 'canceler@example.com', locale: 'es' },
    ]);

    const res = await POST(makeReq());
    expect(res.status).toBe(200);

    expect(mockSendSubscriptionCanceledEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_cancel_001',
        email: 'canceler@example.com',
        locale: 'es',
        subscriptionId: 'sub_cancel_001',
      }),
    );
    // accessEndDate must be a non-empty string
    const callArgs = mockSendSubscriptionCanceledEmail.mock.calls[0][0];
    expect(typeof callArgs.accessEndDate).toBe('string');
    expect(callArgs.accessEndDate.length).toBeGreaterThan(0);
  });

  it('purchase confirmation email failure does not fail the webhook — returns 200', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_purchase_email_fail',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_fail_001',
          mode: 'subscription',
          metadata: { clerkUserId: 'user_fail_001' },
          customer: 'cus_fail_001',
          customer_details: { email: 'fail@example.com' },
          subscription: 'sub_fail_001',
          amount_total: 999,
          currency: 'usd',
        },
      },
    });
    mockSubscriptionsRetrieve.mockResolvedValue({
      id: 'sub_fail_001',
      status: 'active',
      trial_end: null,
      items: {
        data: [{ current_period_end: 1767225600, price: { id: 'price_pro_monthly_test' } }],
      },
    });
    mockSelectLimit.mockResolvedValue([
      { email: 'fail@example.com', locale: 'en' },
    ]);
    mockSendPurchaseConfirmationEmail.mockRejectedValueOnce(new Error('Resend error'));

    const res = await POST(makeReq());
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// T1 (churn): Dunning sequence — invoice.payment_failed
// ---------------------------------------------------------------------------

vi.mock('@/shared/lib/dunning-emails', () => ({
  sendDunningEmail: mockSendDunningEmail,
}));

describe('POST /api/webhooks/stripe — T1 dunning sequence', () => {

  it('invoice.payment_failed attempt_count=1 → dispatches D0 dunning email', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_dunning_d0',
      type: 'invoice.payment_failed',
      data: {
        object: {
          id: 'in_test_d0',
          customer: 'cus_dunning_001',
          attempt_count: 1,
          period_start: 1748736000, // 2026-06-01
          payments: { data: [] },
          parent: {
            subscription_details: {
              subscription: 'sub_dunning_001',
            },
          },
        },
      },
    });
    mockSelectLimit.mockResolvedValue([
      { id: 'user_dunning_001', email: 'dunning@example.com', locale: 'en' },
    ]);

    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    expect(mockSendDunningEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_dunning_001',
        dunningStep: 'd0',
        subscriptionId: 'sub_dunning_001',
        stripeInvoiceId: 'in_test_d0',
        isHardDecline: false,
      }),
    );
  });

  it('invoice.payment_failed attempt_count=3 → dispatches D7 dunning email', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_dunning_d7',
      type: 'invoice.payment_failed',
      data: {
        object: {
          id: 'in_test_d7',
          customer: 'cus_dunning_002',
          attempt_count: 3,
          period_start: 1748736000,
          payments: { data: [] },
          parent: {
            subscription_details: {
              subscription: 'sub_dunning_002',
            },
          },
        },
      },
    });
    mockSelectLimit.mockResolvedValue([
      { id: 'user_dunning_002', email: 'dunning2@example.com', locale: 'en' },
    ]);

    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    expect(mockSendDunningEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        dunningStep: 'd7',
        subscriptionId: 'sub_dunning_002',
      }),
    );
    // D7: no billing portal session created (D0/D3 only)
    expect(mockBillingPortalCreate).not.toHaveBeenCalled();
  });

  it('invoice.payment_failed with no matching user → skips email, returns 200', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_dunning_no_user',
      type: 'invoice.payment_failed',
      data: {
        object: {
          id: 'in_test_no_user',
          customer: 'cus_unknown_xyz',
          attempt_count: 1,
          period_start: 1748736000,
          payments: { data: [] },
          parent: {
            subscription_details: {
              subscription: 'sub_unknown',
            },
          },
        },
      },
    });
    mockSelectLimit.mockResolvedValue([]); // user not found

    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    expect(mockSendDunningEmail).not.toHaveBeenCalled();
  });

  it('dunning email failure does not fail the webhook — returns 200', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_dunning_email_fail',
      type: 'invoice.payment_failed',
      data: {
        object: {
          id: 'in_test_fail',
          customer: 'cus_dunning_fail',
          attempt_count: 1,
          period_start: 1748736000,
          payments: { data: [] },
          parent: {
            subscription_details: {
              subscription: 'sub_dunning_fail',
            },
          },
        },
      },
    });
    mockSelectLimit.mockResolvedValue([
      { id: 'user_dunning_fail', email: 'fail@example.com', locale: 'en' },
    ]);
    mockSendDunningEmail.mockRejectedValueOnce(new Error('Resend down'));

    const res = await POST(makeReq());
    expect(res.status).toBe(200);
  });
});
