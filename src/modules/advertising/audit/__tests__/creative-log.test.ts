import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logCreativeEvent, getCreativeAudit } from '../creative-log';
import type { CreativeLogDb } from '../creative-log';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDb(): CreativeLogDb {
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
    insert: insertMock as unknown as CreativeLogDb['insert'],
    select: selectMock as unknown as CreativeLogDb['select'],
    _insertedValues: insertedValues,
    _insertValsMock: insertValsMock,
    _whereMock: whereMock,
  } as unknown as CreativeLogDb;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('logCreativeEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a CreativeAuditRecord with correct fields', async () => {
    const db = makeDb();

    const record = await logCreativeEvent(
      'bundle_001',
      'generated',
      'agent',
      { cost_usd: 0.02, generator: 'imagen-4-fast', locale: 'en' },
      db,
    );

    expect(record.creative_bundle_id).toBe('bundle_001');
    expect(record.event).toBe('generated');
    expect(record.actor).toBe('agent');
    expect(record.id).toMatch(/^[\w-]{21}$/);
    expect(record.timestamp).toBeInstanceOf(Date);
  });

  it('inserts a row into the DB on each call', async () => {
    const db = makeDb();

    await logCreativeEvent('bundle_001', 'generated', 'agent', {}, db);
    await logCreativeEvent('bundle_001', 'approved', 'founder', {}, db);

    const insertValsMock = (db as unknown as { _insertValsMock: ReturnType<typeof vi.fn> })
      ._insertValsMock;
    expect(insertValsMock).toHaveBeenCalledTimes(2);
  });

  it('maps event to correct DB status', async () => {
    const db = makeDb();
    const insertedValues: unknown[] = [];
    const insertValsMock = (db as unknown as { _insertValsMock: ReturnType<typeof vi.fn> })
      ._insertValsMock;
    insertValsMock.mockImplementation((row) => {
      insertedValues.push(row);
      return Promise.resolve();
    });

    await logCreativeEvent('bundle_001', 'approved', 'founder', {}, db);
    const row = insertedValues[0] as Record<string, unknown>;
    expect(row['status']).toBe('approved');
  });

  it('maps paused event to paused status', async () => {
    const db = makeDb();
    const insertedValues: unknown[] = [];
    const insertValsMock = (db as unknown as { _insertValsMock: ReturnType<typeof vi.fn> })
      ._insertValsMock;
    insertValsMock.mockImplementation((row) => {
      insertedValues.push(row);
      return Promise.resolve();
    });

    await logCreativeEvent('bundle_001', 'paused', 'meta', { ad_id: 'ad_001' }, db);
    const row = insertedValues[0] as Record<string, unknown>;
    expect(row['status']).toBe('paused');
  });

  it('does not expose update or delete methods', () => {
    const db = makeDb();
    expect((db as unknown as Record<string, unknown>)['update']).toBeUndefined();
    expect((db as unknown as Record<string, unknown>)['delete']).toBeUndefined();
  });

  it('each call generates a unique id', async () => {
    const db = makeDb();

    const r1 = await logCreativeEvent('b1', 'generated', 'agent', {}, db);
    const r2 = await logCreativeEvent('b1', 'approved', 'founder', {}, db);

    expect(r1.id).not.toBe(r2.id);
  });
});

describe('getCreativeAudit', () => {
  it('queries DB with bundleId filter', async () => {
    const db = makeDb();

    await getCreativeAudit('bundle_001', db);

    const whereMock = (db as unknown as { _whereMock: ReturnType<typeof vi.fn> })._whereMock;
    expect(whereMock).toHaveBeenCalledTimes(1);
  });

  it('returns rows from the DB', async () => {
    const db = makeDb();
    const fakeRow = {
      id: 'row_01',
      hookTemplateId: 'bundle_001',
      assetUrl: '',
      assetKind: 'image' as const,
      generator: 'imagen-4-fast',
      costUsd: 0.02,
      copy: '',
      cta: '',
      locale: 'en' as const,
      status: 'approved' as const,
      safetyChecks: [],
      metaAdId: null,
      approvedBy: null,
      approvedAt: null,
      createdAt: new Date(),
    };

    const whereMock = (db as unknown as { _whereMock: ReturnType<typeof vi.fn> })._whereMock;
    whereMock.mockResolvedValueOnce([fakeRow]);

    const rows = await getCreativeAudit('bundle_001', db);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.hookTemplateId).toBe('bundle_001');
  });
});
