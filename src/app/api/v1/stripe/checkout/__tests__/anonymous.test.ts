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
