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

  it('passes a param-aware idempotencyKey (checkout:<id>:<plan>:<day>:<hash>) to sessions.create', async () => {
    authMock.mockResolvedValue({ userId: null });
    dbSelectMock.mockReturnValue([]);

    await POST(makeRequest({ plan: 'pro_annual' }));
    expect(sessionsCreateMock).toHaveBeenCalledTimes(1);
    const opts = sessionsCreateMock.mock.calls[0][1];
    expect(opts.idempotencyKey).toMatch(/^checkout:anon-xyz:pro_annual:\d{4}-\d{2}-\d{2}:[0-9a-f]{16,}$/);
  });

  it('produces DIFFERENT idempotencyKeys when only the locale differs (prevents StripeIdempotencyError)', async () => {
    authMock.mockResolvedValue({ userId: null });
    dbSelectMock.mockReturnValue([]);

    await POST(makeRequest({ plan: 'pro_annual', locale: 'es' }));
    await POST(makeRequest({ plan: 'pro_annual', locale: 'en' }));

    const key1 = sessionsCreateMock.mock.calls[0][1].idempotencyKey;
    const key2 = sessionsCreateMock.mock.calls[1][1].idempotencyKey;
    expect(key1).not.toBe(key2);
  });

  it('produces the SAME idempotencyKey for byte-identical requests (double-click dedup preserved)', async () => {
    authMock.mockResolvedValue({ userId: null });
    dbSelectMock.mockReturnValue([]);

    await POST(makeRequest({ plan: 'pro_annual', locale: 'es', utm_source: 'meta' }));
    await POST(makeRequest({ plan: 'pro_annual', locale: 'es', utm_source: 'meta' }));

    const key1 = sessionsCreateMock.mock.calls[0][1].idempotencyKey;
    const key2 = sessionsCreateMock.mock.calls[1][1].idempotencyKey;
    expect(key1).toBe(key2);
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

describe('POST /api/v1/stripe/checkout — payment_method_types (anonymous)', () => {
  it('restricts payment_method_types to ["card", "link"]', async () => {
    authMock.mockResolvedValue({ userId: null });
    dbSelectMock.mockReturnValue([]);

    await POST(makeRequest({ plan: 'pro_annual' }));
    const call = sessionsCreateMock.mock.calls[0][0];
    expect(call.payment_method_types).toEqual(['card', 'link']);
  });
});
