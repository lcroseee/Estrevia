import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks: vi.hoisted ensures these exist BEFORE vi.mock factories run
// (vi.mock is hoisted above plain `const` declarations by Vitest).
// Pattern mirrors src/app/[locale]/checkout/complete/__tests__/CheckoutCompleteClient.test.tsx.
// ---------------------------------------------------------------------------
const {
  sessionsRetrieveMock,
  sessionsUpdateMock,
  subsRetrieveMock,
  getUserListMock,
  createUserMock,
  createTokenMock,
  limitMock,
  trackServerEventMock,
  dbInsertValuesOnConflictDoUpdateMock,
  dbInsertValuesOnConflictDoNothingMock,
} = vi.hoisted(() => ({
  sessionsRetrieveMock: vi.fn(),
  sessionsUpdateMock: vi.fn(),
  subsRetrieveMock: vi.fn(),
  getUserListMock: vi.fn(),
  createUserMock: vi.fn(),
  createTokenMock: vi.fn(),
  limitMock: vi.fn().mockResolvedValue({ success: true }),
  trackServerEventMock: vi.fn(),
  dbInsertValuesOnConflictDoUpdateMock: vi.fn().mockResolvedValue(undefined),
  dbInsertValuesOnConflictDoNothingMock: vi.fn().mockResolvedValue(undefined),
}));

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
