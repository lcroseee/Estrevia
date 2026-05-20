import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/shared/lib/cron-auth', () => ({
  assertCronAuth: vi.fn(() => null),
}));

// Watchdog now does two `select().from(users).where(...)` calls per run:
// 2a) stripe_customer_id lookup, 2b) email fallback lookup. Each test enqueues
// rows for each call in order via mockResolvedValueOnce.
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockStripeCustomersList = vi.fn();

vi.mock('@/shared/lib/db', () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: mockSelect }) }),
    update: () => ({ set: () => ({ where: mockUpdate }) }),
  }),
}));

vi.mock('@/shared/lib/stripe', () => ({
  getStripe: () => ({
    customers: { list: mockStripeCustomersList },
  }),
}));

import { GET } from '@/app/api/cron/stripe-user-sync/route';

describe('cron/stripe-user-sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns checked=0 fixed=0 when Stripe has no recent customers', async () => {
    mockStripeCustomersList.mockResolvedValue({ data: [] });
    const res = await GET(new Request('http://test'));
    const body = await res.json();
    expect(body.checked).toBe(0);
    expect(body.fixed).toBe(0);
  });

  it('detects missing-user mismatch (Stripe customer with no DB match by id or email)', async () => {
    mockStripeCustomersList.mockResolvedValue({
      data: [{
        id: 'cus_test1',
        email: 'orphan@example.com',
        subscriptions: { data: [{
          id: 'sub_test1', status: 'trialing',
          items: { data: [{ price: { recurring: { interval: 'month' } } }] },
          trial_end: 1, current_period_end: 1,
        }] },
      }],
    });
    mockSelect.mockResolvedValue([]);  // both byStripeId and byEmail return empty
    const res = await GET(new Request('http://test'));
    const body = await res.json();
    expect(body.checked).toBe(1);
    // Truly missing-user (no email match either) → cannot UPDATE; logs warning, fixed stays 0
    expect(body.fixed).toBe(0);
  });

  it('fixes via email-fallback when stripe_customer_id is NULL but email matches', async () => {
    // destinig7996 scenario: Stripe customer exists with a known email,
    // but the matching users row has stripe_customer_id=NULL (webhook upsert
    // never completed). Watchdog should repair the linkage via email lookup.
    mockStripeCustomersList.mockResolvedValue({
      data: [{
        id: 'cus_destinig_like',
        email: 'destinig7996@example.com',
        subscriptions: { data: [{
          id: 'sub_destinig_like', status: 'trialing',
          items: { data: [{ price: { recurring: { interval: 'year' } } }] },
          trial_end: 1, current_period_end: 1,
        }] },
      }],
    });
    // 2a) byStripeId lookup → empty (stripe_customer_id is NULL in DB)
    mockSelect.mockResolvedValueOnce([]);
    // 2b) byEmail lookup → finds the user
    mockSelect.mockResolvedValueOnce([{
      id: 'user_destinig_like',
      email: 'destinig7996@example.com',
      stripeCustomerId: null,
      subscriptionTier: 'free',
      subscriptionStatus: 'free',
    }]);
    mockUpdate.mockResolvedValue([]);
    const res = await GET(new Request('http://test'));
    const body = await res.json();
    expect(body.fixed).toBe(1);
    expect(mockUpdate).toHaveBeenCalled();
  });

  it('fixes tier-mismatch when users.subscription_tier = free but Stripe = active', async () => {
    mockStripeCustomersList.mockResolvedValue({
      data: [{
        id: 'cus_test2',
        subscriptions: { data: [{
          id: 'sub_test2', status: 'trialing',
          items: { data: [{ price: { recurring: { interval: 'month' } } }] },
          trial_end: 1, current_period_end: 1,
        }] },
      }],
    });
    mockSelect.mockResolvedValue([{
      id: 'user_test2',
      stripeCustomerId: 'cus_test2',
      subscriptionTier: 'free',
      subscriptionStatus: 'free',
    }]);
    mockUpdate.mockResolvedValue([]);
    const res = await GET(new Request('http://test'));
    const body = await res.json();
    expect(body.fixed).toBe(1);
    expect(mockUpdate).toHaveBeenCalled();
  });

  it('no-op when DB and Stripe are aligned', async () => {
    mockStripeCustomersList.mockResolvedValue({
      data: [{
        id: 'cus_test3',
        subscriptions: { data: [{
          id: 'sub_test3', status: 'active',
          items: { data: [{ price: { recurring: { interval: 'year' } } }] },
          trial_end: null, current_period_end: 2,
        }] },
      }],
    });
    mockSelect.mockResolvedValue([{
      id: 'user_test3',
      stripeCustomerId: 'cus_test3',
      subscriptionTier: 'premium',
      subscriptionStatus: 'active',
    }]);
    const res = await GET(new Request('http://test'));
    const body = await res.json();
    expect(body.fixed).toBe(0);
  });
});
