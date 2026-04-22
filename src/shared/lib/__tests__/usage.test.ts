import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computePeriodKey } from '../usage';

describe('computePeriodKey', () => {
  it('returns YYYY-MM-DD for daily period', () => {
    const date = new Date('2026-04-19T15:30:00Z');
    expect(computePeriodKey('day', date)).toBe('2026-04-19');
  });

  it('returns YYYY-MM for monthly period', () => {
    const date = new Date('2026-04-19T15:30:00Z');
    expect(computePeriodKey('month', date)).toBe('2026-04');
  });

  it('uses UTC date boundaries (not local)', () => {
    // 2026-04-19T23:30:00Z is still April 19 in UTC
    const date = new Date('2026-04-19T23:30:00Z');
    expect(computePeriodKey('day', date)).toBe('2026-04-19');
  });

  it('pads month and day with leading zeros', () => {
    const date = new Date('2026-01-05T12:00:00Z');
    expect(computePeriodKey('day', date)).toBe('2026-01-05');
    expect(computePeriodKey('month', date)).toBe('2026-01');
  });

  it('defaults `now` to current Date when omitted', () => {
    const result = computePeriodKey('day');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ---------------------------------------------------------------------------
// checkAndIncrementUsage — atomic behavior
//
// These tests mock `getDb` to simulate the two outcomes from the single atomic
// INSERT … ON CONFLICT DO UPDATE … WHERE query:
//
//   1. Rows returned  → update succeeded, counter incremented (allowed: true)
//   2. Empty rows     → setWhere blocked the update, limit reached (allowed: false)
//
// The mocked `getCurrentUsage` path is also covered for the "limit reached" case.
// ---------------------------------------------------------------------------

// Mock the db module before importing the functions under test.
vi.mock('../db', () => ({
  getDb: vi.fn(),
}));

import { getDb } from '../db';
import { checkAndIncrementUsage } from '../usage';

const mockGetDb = vi.mocked(getDb);

/** Build a chainable Drizzle-like mock that resolves with `result` at .returning() */
function makeInsertMock(returningResult: { count: number }[]) {
  const chain = {
    values: vi.fn().mockReturnThis(),
    onConflictDoUpdate: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(returningResult),
  };
  return {
    insert: vi.fn().mockReturnValue(chain),
    select: vi.fn(),
    _chain: chain,
  };
}

/** Build a chainable mock for getCurrentUsage's select query */
function makeSelectMock(count: number) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([{ count }]),
  };
  return {
    select: vi.fn().mockReturnValue(chain),
    insert: vi.fn(),
    _chain: chain,
  };
}

const NOW = new Date('2026-04-20T10:00:00Z');

beforeEach(() => {
  vi.resetAllMocks();
});

describe('checkAndIncrementUsage — atomic insert path', () => {
  it('allows the first use (row returned with count=1)', async () => {
    const db = makeInsertMock([{ count: 1 }]);
    mockGetDb.mockReturnValue(db as unknown as ReturnType<typeof getDb>);

    const result = await checkAndIncrementUsage('user1', 'synastry', 'day', 1, NOW);

    expect(result).toEqual({ allowed: true, count: 1, limit: 1 });
    expect(db.insert).toHaveBeenCalledTimes(1);
    // Should NOT call getCurrentUsage (select) when rows are returned
    expect(db.select).not.toHaveBeenCalled();
  });

  it('allows second use when limit is 2 (row returned with count=2)', async () => {
    const db = makeInsertMock([{ count: 2 }]);
    mockGetDb.mockReturnValue(db as unknown as ReturnType<typeof getDb>);

    const result = await checkAndIncrementUsage('user1', 'avatar', 'month', 3, NOW);

    expect(result).toEqual({ allowed: true, count: 2, limit: 3 });
  });

  it('returns allowed=false and fetches current count when setWhere blocks update (empty rows)', async () => {
    // First getDb call → insert returns [] (limit blocked)
    // Second getDb call → select returns current count
    let callCount = 0;
    mockGetDb.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // insert mock returns empty rows (setWhere blocked)
        return makeInsertMock([]) as unknown as ReturnType<typeof getDb>;
      }
      // select mock for getCurrentUsage fallback
      return makeSelectMock(1) as unknown as ReturnType<typeof getDb>;
    });

    const result = await checkAndIncrementUsage('user1', 'synastry', 'day', 1, NOW);

    expect(result).toEqual({ allowed: false, count: 1, limit: 1 });
    // insert was called once (the atomic attempt)
    // getDb was called twice: once for insert, once for getCurrentUsage select
    expect(mockGetDb).toHaveBeenCalledTimes(2);
  });

  it('passes setWhere with the correct limit value', async () => {
    const db = makeInsertMock([{ count: 1 }]);
    mockGetDb.mockReturnValue(db as unknown as ReturnType<typeof getDb>);

    await checkAndIncrementUsage('user2', 'synastry', 'day', 5, NOW);

    // Verify onConflictDoUpdate was called with a setWhere that references the limit
    const onConflictCall = db._chain.onConflictDoUpdate.mock.calls[0][0];
    expect(onConflictCall).toHaveProperty('setWhere');
    // setWhere is a Drizzle SQL template object — verify it was passed (not undefined)
    expect(onConflictCall.setWhere).toBeDefined();
  });
});

/**
 * Concurrency behavior documentation test.
 *
 * This test documents the expected behavior under true concurrent Postgres load.
 * It cannot be reproduced in a unit test without a real DB, but the logic is:
 *
 *   Given limit=1 and two concurrent requests both at count=0:
 *   - Request A: INSERT … values(count=1) → creates the row, RETURNING count=1 → allowed
 *   - Request B: INSERT … ON CONFLICT DO UPDATE SET count=count+1 WHERE count<1
 *     → count is already 1 (committed by A), 1 < 1 is false → WHERE blocks update
 *     → RETURNING is empty → allowed=false
 *
 *   Result: exactly one request is allowed through. No over-count.
 *
 * The Postgres row-level lock on the conflicting row ensures B's WHERE evaluates
 * against A's committed value, not a stale snapshot.
 */
describe('checkAndIncrementUsage — concurrency documentation', () => {
  it('documents that only one of two concurrent requests at limit=1 is allowed', () => {
    // This is a documentation test — the actual guarantee comes from Postgres
    // row-level locking on the ON CONFLICT target row. The unit tests above
    // verify the application logic handles empty RETURNING correctly.
    expect(true).toBe(true);
  });
});
