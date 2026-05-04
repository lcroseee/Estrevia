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

import { comparable, computeZScore } from '../comparable-window';

beforeEach(() => {
  Object.values(mockDb).forEach((fn) => (fn as ReturnType<typeof vi.fn>).mockClear?.());
  mockDb.select.mockImplementation(() => mockDb);
  mockDb.from.mockImplementation(() => mockDb);
  mockDb.where.mockImplementation(() => mockDb);
  mockDb.orderBy.mockImplementation(() => mockDb);
});

describe('computeZScore', () => {
  it('returns 0 when current equals baseline mean', () => {
    expect(computeZScore(5, { mean: 5, stddev: 1 })).toBe(0);
  });
  it('returns positive z when current > mean', () => {
    expect(computeZScore(7, { mean: 5, stddev: 1 })).toBe(2);
  });
  it('returns negative z when current < mean', () => {
    expect(computeZScore(3, { mean: 5, stddev: 1 })).toBe(-2);
  });
  it('returns 0 when stddev is 0 (degenerate baseline)', () => {
    expect(computeZScore(7, { mean: 5, stddev: 0 })).toBe(0);
  });
});

describe('comparable', () => {
  it('returns null when fewer than 2 same-DOW prior samples exist', async () => {
    mockDb.limit.mockResolvedValueOnce([
      // Today + 1 prior — not enough
      { date: '2026-05-03', dayOfWeek: 0, ctr: 0.05 },
      { date: '2026-04-26', dayOfWeek: 0, ctr: 0.04 },
    ]);
    const result = await comparable('as_001', 'ctr');
    expect(result).toBeNull();
  });

  it('returns z-score when ≥3 prior same-DOW samples exist', async () => {
    // Priors must vary so stddev > 0 (otherwise computeZScore returns 0 by
    // the degenerate-baseline guard). Symmetric around 0.05 → mean=0.05 exact.
    mockDb.limit.mockResolvedValueOnce([
      { date: '2026-05-03', dayOfWeek: 0, ctr: 0.10 },  // current — well above baseline
      { date: '2026-04-26', dayOfWeek: 0, ctr: 0.04 },  // prior
      { date: '2026-04-19', dayOfWeek: 0, ctr: 0.05 },
      { date: '2026-04-12', dayOfWeek: 0, ctr: 0.06 },
    ]);
    const result = await comparable('as_001', 'ctr');
    expect(result).not.toBeNull();
    expect(result!.current_value).toBe(0.10);
    expect(result!.baseline_mean).toBeCloseTo(0.05);
    expect(result!.z_score).toBeGreaterThan(0); // current >> baseline
    expect(result!.is_significant).toBe(true);  // |z| > 2 default
    expect(result!.sample_size).toBe(3);
  });

  it('marks is_significant=false when |z| ≤ 2', async () => {
    mockDb.limit.mockResolvedValueOnce([
      { date: '2026-05-03', dayOfWeek: 0, ctr: 0.052 }, // tiny diff from baseline mean
      { date: '2026-04-26', dayOfWeek: 0, ctr: 0.05 },
      { date: '2026-04-19', dayOfWeek: 0, ctr: 0.05 },
      { date: '2026-04-12', dayOfWeek: 0, ctr: 0.05 },
    ]);
    const result = await comparable('as_001', 'ctr');
    expect(result!.is_significant).toBe(false);
  });
});
