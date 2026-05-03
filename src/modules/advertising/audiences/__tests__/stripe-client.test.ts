import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'crypto';

const sha256Hex = (s: string): string =>
  createHash('sha256').update(s.trim().toLowerCase()).digest('hex');

const { mockSubscriptionsList } = vi.hoisted(() => ({
  mockSubscriptionsList: vi.fn(),
}));

vi.mock('@/shared/lib/stripe', () => ({
  getStripe: () => ({
    subscriptions: { list: mockSubscriptionsList },
  }),
}));

import { listActiveCustomers } from '../stripe-client';

describe('listActiveCustomers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns deduplicated, hashed-email entries from active subscriptions', async () => {
    mockSubscriptionsList.mockResolvedValueOnce({
      data: [
        { id: 's_1', customer: { id: 'cus_a', email: 'Alice@Example.com' } },
        { id: 's_2', customer: { id: 'cus_b', email: 'bob@example.com' } },
        { id: 's_3', customer: { id: 'cus_a2', email: 'alice@example.com' } }, // dup email
        { id: 's_4', customer: { id: 'cus_c', email: null } }, // skip null email
      ],
      has_more: false,
    });

    const out = await listActiveCustomers();

    // Two unique emails — alice (case-insensitive dup) and bob.
    expect(out).toHaveLength(2);

    const aliceHash = sha256Hex('alice@example.com');
    const bobHash = sha256Hex('bob@example.com');
    const hashes = out.map((c) => c.email_hash).sort();
    expect(hashes).toEqual([aliceHash, bobHash].sort());

    // Every entry has a non-empty user_id (Stripe customer id).
    for (const c of out) {
      expect(c.user_id).toMatch(/^cus_/);
      // email_hash is lowercase hex (SHA-256 = 64 chars)
      expect(c.email_hash).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('paginates via starting_after when has_more is true', async () => {
    mockSubscriptionsList.mockResolvedValueOnce({
      data: [{ id: 's_a', customer: { id: 'cus_a', email: 'a@x.com' } }],
      has_more: true,
    });
    mockSubscriptionsList.mockResolvedValueOnce({
      data: [{ id: 's_b', customer: { id: 'cus_b', email: 'b@x.com' } }],
      has_more: false,
    });

    const out = await listActiveCustomers();

    expect(out).toHaveLength(2);
    expect(mockSubscriptionsList).toHaveBeenCalledTimes(2);
    expect(mockSubscriptionsList.mock.calls[1][0]).toMatchObject({
      starting_after: 's_a',
    });
  });

  it('skips subscriptions whose customer field is missing', async () => {
    mockSubscriptionsList.mockResolvedValueOnce({
      data: [
        { id: 's_x', customer: null },
        { id: 's_y', customer: 'cus_string_only' }, // Stripe sometimes returns the id only
        { id: 's_z', customer: { id: 'cus_z', email: 'z@x.com' } },
      ],
      has_more: false,
    });

    const out = await listActiveCustomers();

    expect(out).toHaveLength(1);
    expect(out[0].user_id).toBe('cus_z');
  });

  it('returns empty list when there are no active subscriptions', async () => {
    mockSubscriptionsList.mockResolvedValueOnce({ data: [], has_more: false });
    const out = await listActiveCustomers();
    expect(out).toEqual([]);
  });

  it('requests Stripe with status=active and limit=100', async () => {
    mockSubscriptionsList.mockResolvedValueOnce({ data: [], has_more: false });
    await listActiveCustomers();
    expect(mockSubscriptionsList.mock.calls[0][0]).toMatchObject({
      status: 'active',
      limit: 100,
      expand: ['data.customer'],
    });
  });
});
