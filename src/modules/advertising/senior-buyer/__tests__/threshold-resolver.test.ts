import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockDb } = vi.hoisted(() => {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn(() => chain);
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.orderBy = vi.fn(() => chain);
  chain.limit = vi.fn(() => Promise.resolve([]));
  return { mockDb: chain };
});

vi.mock('@/shared/lib/db', () => ({ getDb: () => mockDb }));

import { resolveThreshold } from '../threshold-resolver';
import { COLD_START_DEFAULTS } from '../targets';

beforeEach(() => {
  // mockReset (not mockClear) is required so mockResolvedValueOnce queues do
  // not leak between tests.
  Object.values(mockDb).forEach((fn) => (fn as ReturnType<typeof vi.fn>).mockReset?.());
  mockDb.select.mockImplementation(() => mockDb);
  mockDb.from.mockImplementation(() => mockDb);
  mockDb.where.mockImplementation(() => mockDb);
  mockDb.orderBy.mockImplementation(() => mockDb);
  mockDb.limit.mockResolvedValue([]);
});

describe('resolveThreshold — 4-step lookup', () => {
  it('falls back to code default when no DB row exists at any scope', async () => {
    const v = await resolveThreshold('target_cpa_subscription_usd', { ad_set_id: 'as1', campaign_id: 'cmp1' });
    expect(v).toBe(COLD_START_DEFAULTS.target_cpa_subscription_usd);
  });

  it('uses ad_set override when present (highest priority)', async () => {
    mockDb.limit
      .mockResolvedValueOnce([{ value: 99 }])  // ad_set hit
      .mockResolvedValueOnce([])               // campaign (not consulted)
      .mockResolvedValueOnce([]);              // global (not consulted)
    const v = await resolveThreshold('target_cpa_subscription_usd', { ad_set_id: 'as1', campaign_id: 'cmp1' });
    expect(v).toBe(99);
  });

  it('uses campaign override when ad_set missing', async () => {
    mockDb.limit
      .mockResolvedValueOnce([])               // ad_set miss
      .mockResolvedValueOnce([{ value: 77 }])  // campaign hit
      .mockResolvedValueOnce([]);
    const v = await resolveThreshold('target_cpa_subscription_usd', { ad_set_id: 'as1', campaign_id: 'cmp1' });
    expect(v).toBe(77);
  });

  it('uses global when ad_set + campaign missing', async () => {
    mockDb.limit
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ value: 55 }]);
    const v = await resolveThreshold('target_cpa_subscription_usd', { ad_set_id: 'as1', campaign_id: 'cmp1' });
    expect(v).toBe(55);
  });

  it('falls back to code default when DB returns NaN/null/Infinity', async () => {
    mockDb.limit.mockResolvedValueOnce([{ value: NaN }]);
    const v = await resolveThreshold('target_cpa_subscription_usd', { ad_set_id: 'as1', campaign_id: 'cmp1' });
    expect(v).toBe(COLD_START_DEFAULTS.target_cpa_subscription_usd);
  });

  it('falls back to code default when DB connection throws', async () => {
    mockDb.limit.mockRejectedValueOnce(new Error('connection lost'));
    const v = await resolveThreshold('target_cpa_subscription_usd', { ad_set_id: 'as1', campaign_id: 'cmp1' });
    expect(v).toBe(COLD_START_DEFAULTS.target_cpa_subscription_usd);
  });
});
