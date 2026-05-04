import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDb } = vi.hoisted(() => {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn(() => chain);
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.orderBy = vi.fn(() => chain);
  chain.limit = vi.fn(() => Promise.resolve([]));
  chain.insert = vi.fn(() => chain);
  chain.values = vi.fn(() => chain);
  chain.onConflictDoUpdate = vi.fn(() => Promise.resolve());
  chain.delete = vi.fn(() => chain);
  return { mockDb: chain };
});

vi.mock('@/shared/lib/db', () => ({ getDb: () => mockDb }));
vi.mock('nanoid', () => ({ nanoid: () => 'nano_001' }));

import { getRange, pruneOldSnapshots, writeDailySnapshot } from '../metric-history';

beforeEach(() => {
  Object.values(mockDb).forEach((fn) => (fn as ReturnType<typeof vi.fn>).mockClear?.());
  mockDb.select.mockImplementation(() => mockDb);
  mockDb.from.mockImplementation(() => mockDb);
  mockDb.where.mockImplementation(() => mockDb);
  mockDb.orderBy.mockImplementation(() => mockDb);
  mockDb.limit.mockResolvedValue([]);
  mockDb.insert.mockImplementation(() => mockDb);
  mockDb.values.mockImplementation(() => mockDb);
  mockDb.onConflictDoUpdate.mockResolvedValue(undefined);
  mockDb.delete.mockImplementation(() => mockDb);
});

describe('writeDailySnapshot', () => {
  it('upserts a snapshot row keyed by adSetId+date', async () => {
    await writeDailySnapshot({
      adSetId: 'as_1',
      date: '2026-05-03',
      impressions: 1000,
      clicks: 50,
      spendUsd: 5,
      ctr: 0.05,
      cpc: 0.1,
      cpm: 5,
      frequency: 1.2,
      conversionsMeta: 3,
      conversionsPosthog: 4,
      revenueUsd: 14.97,
      roas: 2.99,
    });
    expect(mockDb.insert).toHaveBeenCalled();
    expect(mockDb.values).toHaveBeenCalledWith(
      expect.objectContaining({
        adSetId: 'as_1',
        date: '2026-05-03',
        impressions: 1000,
        dayOfWeek: expect.any(Number),
      }),
    );
    expect(mockDb.onConflictDoUpdate).toHaveBeenCalled();
  });

  it('computes dayOfWeek from the date (Sunday → 0)', async () => {
    await writeDailySnapshot({
      adSetId: 'as_1',
      date: '2026-05-03', // Sunday in UTC
      impressions: 0,
      clicks: 0,
      spendUsd: 0,
      ctr: 0,
      cpc: 0,
      cpm: 0,
      frequency: 0,
      conversionsMeta: 0,
      conversionsPosthog: 0,
      revenueUsd: 0,
      roas: null,
    });
    const args = mockDb.values.mock.calls[0]?.[0] as { dayOfWeek: number };
    expect(args.dayOfWeek).toBe(0);
  });

  it('passes a generated nanoid id and createdAt timestamp on insert', async () => {
    await writeDailySnapshot({
      adSetId: 'as_2',
      date: '2026-04-29', // Wednesday → 3
      impressions: 10,
      clicks: 1,
      spendUsd: 0.5,
      ctr: 0.1,
      cpc: 0.5,
      cpm: 50,
      frequency: 1,
      conversionsMeta: 0,
      conversionsPosthog: 0,
      revenueUsd: 0,
      roas: null,
    });
    const args = mockDb.values.mock.calls[0]?.[0] as {
      id: string;
      dayOfWeek: number;
      createdAt: Date;
      roas: number | null;
    };
    expect(args.id).toBe('nano_001');
    expect(args.dayOfWeek).toBe(3);
    expect(args.createdAt).toBeInstanceOf(Date);
    expect(args.roas).toBeNull();
  });
});

describe('getRange', () => {
  it('returns rows in date-desc order, capped at days', async () => {
    mockDb.limit.mockResolvedValueOnce([
      { date: '2026-05-03', impressions: 100 },
      { date: '2026-05-02', impressions: 90 },
    ]);
    const rows = await getRange('as_1', 30);
    expect(rows).toHaveLength(2);
    expect(mockDb.select).toHaveBeenCalled();
    expect(mockDb.from).toHaveBeenCalled();
    expect(mockDb.where).toHaveBeenCalled();
    expect(mockDb.orderBy).toHaveBeenCalled();
    expect(mockDb.limit).toHaveBeenCalledWith(30);
  });
});

describe('pruneOldSnapshots', () => {
  it('deletes rows older than retention days', async () => {
    await pruneOldSnapshots(90);
    expect(mockDb.delete).toHaveBeenCalled();
    expect(mockDb.where).toHaveBeenCalled();
  });
});
