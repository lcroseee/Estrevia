import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/shared/lib/cron-auth', () => ({
  assertCronAuth: vi.fn(() => null),
}));

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

  it('detects missing-user mismatch (customer in Stripe, no users row)', async () => {
    mockStripeCustomersList.mockResolvedValue({
      data: [{
        id: 'cus_test1',
        subscriptions: { data: [{
          id: 'sub_test1', status: 'trialing',
          items: { data: [{ price: { recurring: { interval: 'month' } } }] },
          trial_end: 1, current_period_end: 1,
        }] },
      }],
    });
    mockSelect.mockResolvedValue([]);
    const res = await GET(new Request('http://test'));
    const body = await res.json();
    expect(body.checked).toBe(1);
    // missing-user without dbUser → cannot fix; logs warning, fixed stays 0
    expect(body.fixed).toBe(0);
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
