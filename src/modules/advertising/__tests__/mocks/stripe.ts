import { vi } from 'vitest';
import { mockStripeAttribution } from '../fixtures';

export const mockStripe = () => ({
  listSubscriptionsCreatedBetween: vi.fn().mockResolvedValue([mockStripeAttribution()]),
  listActiveCustomers: vi.fn().mockResolvedValue([
    { email_hash: 'abc123hash', user_id: 'u1' },
  ]),
});

export type MockStripe = ReturnType<typeof mockStripe>;
