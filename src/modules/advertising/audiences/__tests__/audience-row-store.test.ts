import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted mock chain — pattern from cron-handlers.test.ts. The chain object
// re-references itself for fluent .select().from().where().limit() calls and
// for .insert().values() / .update().set().where().
const { mockDb } = vi.hoisted(() => {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn(() => chain);
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.limit = vi.fn(() => Promise.resolve([]));
  chain.insert = vi.fn(() => chain);
  chain.values = vi.fn(() => Promise.resolve());
  chain.update = vi.fn(() => chain);
  chain.set = vi.fn(() => chain);
  return { mockDb: chain };
});

vi.mock('@/shared/lib/db', () => ({
  getDb: () => mockDb,
}));

vi.mock('nanoid', () => ({ nanoid: () => 'nano_001' }));

import { upsertAudienceRow } from '../audience-row-store';

beforeEach(() => {
  // Re-set chain returns after vi.clearAllMocks() in case the test runner
  // resets call history between tests.
  for (const fn of Object.values(mockDb)) {
    (fn as ReturnType<typeof vi.fn>).mockClear();
  }
  mockDb.select.mockImplementation(() => mockDb);
  mockDb.from.mockImplementation(() => mockDb);
  mockDb.where.mockImplementation(() => mockDb);
  mockDb.limit.mockResolvedValue([]);
  mockDb.insert.mockImplementation(() => mockDb);
  mockDb.values.mockResolvedValue(undefined);
  mockDb.update.mockImplementation(() => mockDb);
  mockDb.set.mockImplementation(() => mockDb);
});

describe('upsertAudienceRow', () => {
  it('inserts a new row with a generated nanoid when none exists for the kind', async () => {
    const now = new Date('2026-04-26T06:00:00Z');
    const result = await upsertAudienceRow({
      kind: 'exclusion',
      metaAudienceId: 'aud_111',
      size: 5,
      lastRefreshedAt: now,
      sourceQuery: 'stripe.subscriptions.active',
      activeInCampaigns: [],
    });

    expect(result.id).toBe('nano_001');
    expect(result.kind).toBe('exclusion');
    expect(result.metaAudienceId).toBe('aud_111');
    expect(result.size).toBe(5);

    expect(mockDb.select).toHaveBeenCalled();
    expect(mockDb.insert).toHaveBeenCalled();
    expect(mockDb.values).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'nano_001',
        kind: 'exclusion',
        metaAudienceId: 'aud_111',
        size: 5,
        sourceQuery: 'stripe.subscriptions.active',
        lastRefreshedAt: now,
      }),
    );
  });

  it('updates the existing row in-place when one exists for the kind', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'existing_001' }]);

    const now = new Date('2026-04-26T06:00:00Z');
    const result = await upsertAudienceRow({
      kind: 'exclusion',
      metaAudienceId: 'aud_222',
      size: 7,
      lastRefreshedAt: now,
      sourceQuery: 'stripe.subscriptions.active',
      activeInCampaigns: [],
    });

    expect(result.id).toBe('existing_001');
    expect(mockDb.update).toHaveBeenCalled();
    expect(mockDb.set).toHaveBeenCalledWith(
      expect.objectContaining({
        metaAudienceId: 'aud_222',
        size: 7,
        sourceQuery: 'stripe.subscriptions.active',
        lastRefreshedAt: now,
      }),
    );
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('respects an explicit row.id override on insert (used by tests)', async () => {
    const now = new Date('2026-04-26T06:00:00Z');
    const result = await upsertAudienceRow({
      id: 'caller_provided_id',
      kind: 'retargeting_calc_no_register',
      metaAudienceId: 'aud_xyz',
      size: 200,
      lastRefreshedAt: now,
      sourceQuery: 'posthog_calc_no_register_14d',
      activeInCampaigns: [],
    });

    expect(result.id).toBe('caller_provided_id');
    expect(mockDb.values).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'caller_provided_id' }),
    );
  });
});
