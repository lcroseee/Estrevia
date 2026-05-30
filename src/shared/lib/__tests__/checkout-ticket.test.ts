import { describe, it, expect, vi, beforeEach } from 'vitest';

const setMock = vi.fn();
const getMock = vi.fn();
vi.mock('@/shared/lib/redis', () => ({
  redis: {
    set: (...args: unknown[]) => setMock(...args),
    get: (...args: unknown[]) => getMock(...args),
  },
}));

import { storeCheckoutTicket, getCheckoutTicket } from '../checkout-ticket';

beforeEach(() => vi.clearAllMocks());

describe('checkout-ticket', () => {
  it('stores the ticket keyed by session id with a 900s TTL', async () => {
    await storeCheckoutTicket('cs_test_1', 'tok_long');
    expect(setMock).toHaveBeenCalledWith('checkout_ticket:cs_test_1', 'tok_long', { ex: 900 });
  });

  it('reads the ticket by session id', async () => {
    getMock.mockResolvedValue('tok_long');
    const t = await getCheckoutTicket('cs_test_1');
    expect(t).toBe('tok_long');
    expect(getMock).toHaveBeenCalledWith('checkout_ticket:cs_test_1');
  });

  it('returns null when no ticket present', async () => {
    getMock.mockResolvedValue(null);
    expect(await getCheckoutTicket('cs_missing')).toBeNull();
  });
});
