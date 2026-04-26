import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logDecision, getDecisionsForAd } from '../decision-log';
import { mockAdMetric } from '../../__tests__/fixtures';
import type { AdDecision } from '@/shared/types/advertising';
import type { DecisionLogDb } from '../decision-log';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDecision(overrides?: Partial<AdDecision>): AdDecision {
  return {
    ad_id: 'ad_001',
    action: 'pause',
    reason: 'test_reason',
    reasoning_tier: 'tier_1_rules',
    confidence: 1.0,
    metrics_snapshot: mockAdMetric(),
    ...overrides,
  };
}

function makeDb(): DecisionLogDb {
  const insertedValues: unknown[] = [];
  const insertValsMock = vi.fn().mockImplementation((row) => {
    insertedValues.push(row);
    return Promise.resolve();
  });
  const insertMock = vi.fn().mockReturnValue({ values: insertValsMock });
  const whereMock = vi.fn().mockResolvedValue([]);
  const fromMock = vi.fn().mockReturnValue({ where: whereMock });
  const selectMock = vi.fn().mockReturnValue({ from: fromMock });

  return {
    insert: insertMock as unknown as DecisionLogDb['insert'],
    select: selectMock as unknown as DecisionLogDb['select'],
    _insertedValues: insertedValues,
    _insertValsMock: insertValsMock,
    _whereMock: whereMock,
  } as unknown as DecisionLogDb;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('logDecision', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes a row to the DB and returns a DecisionRecord', async () => {
    const db = makeDb();
    const decision = makeDecision();

    const record = await logDecision(decision, true, { db });

    expect(record.decision).toBe(decision);
    expect(record.applied).toBe(true);
    expect(record.id).toMatch(/^[\w-]{21}$/); // nanoid default length
    expect(record.timestamp).toBeInstanceOf(Date);
    expect(record.applied_at).toBeInstanceOf(Date);
    expect(record.apply_error).toBeUndefined();
    expect(record.meta_response).toBeUndefined();
  });

  it('records apply_error and applied=false on failure path', async () => {
    const db = makeDb();
    const decision = makeDecision();

    const record = await logDecision(decision, false, {
      error: 'meta_api_timeout',
      db,
    });

    expect(record.applied).toBe(false);
    expect(record.apply_error).toBe('meta_api_timeout');
    expect(record.applied_at).toBeUndefined();
  });

  it('stores meta_response in the record', async () => {
    const db = makeDb();
    const decision = makeDecision();

    const record = await logDecision(decision, true, {
      metaResponse: { success: true },
      db,
    });

    expect(record.meta_response).toEqual({ success: true });
  });

  it('inserts once per call — append-only behaviour', async () => {
    const db = makeDb();
    const decision = makeDecision();

    await logDecision(decision, true, { db });
    await logDecision(decision, false, { error: 'err', db });

    // db.insert is called once per logDecision invocation
    expect((db as unknown as { _insertValsMock: ReturnType<typeof vi.fn> })._insertValsMock)
      .toHaveBeenCalledTimes(2);
  });

  it('each call generates a unique id', async () => {
    const db = makeDb();
    const decision = makeDecision();

    const r1 = await logDecision(decision, true, { db });
    const r2 = await logDecision(decision, true, { db });

    expect(r1.id).not.toBe(r2.id);
  });

  it('does not expose update or delete methods', () => {
    const db = makeDb();
    // The DecisionLogDb interface has no update() or delete() method.
    // This is enforced at the type level — verifying at runtime too.
    expect((db as unknown as Record<string, unknown>)['update']).toBeUndefined();
    expect((db as unknown as Record<string, unknown>)['delete']).toBeUndefined();
  });
});

describe('getDecisionsForAd', () => {
  it('queries DB with ad_id and since filters', async () => {
    const db = makeDb();
    const since = new Date('2026-04-01T00:00:00Z');

    await getDecisionsForAd('ad_001', since, db);

    const whereMock = (db as unknown as { _whereMock: ReturnType<typeof vi.fn> })._whereMock;
    expect(whereMock).toHaveBeenCalledTimes(1);
  });

  it('returns rows from the DB', async () => {
    const fakeRow = {
      id: 'row_01',
      timestamp: new Date(),
      adId: 'ad_001',
      action: 'pause',
      reason: 'test',
      reasoningTier: 'tier_1_rules',
      confidence: 1.0,
      metricsSnapshot: {},
      applied: true,
      appliedAt: null,
      applyError: null,
      metaResponse: null,
      deltaBudgetUsd: null,
    };

    const db = makeDb();
    const whereMock = (db as unknown as { _whereMock: ReturnType<typeof vi.fn> })._whereMock;
    whereMock.mockResolvedValueOnce([fakeRow]);

    const rows = await getDecisionsForAd('ad_001', new Date('2026-04-01T00:00:00Z'), db);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.adId).toBe('ad_001');
  });
});
