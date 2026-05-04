import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockDb } = vi.hoisted(() => {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn(() => chain);
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.orderBy = vi.fn(() => chain);
  chain.limit = vi.fn(() => Promise.resolve([]));
  chain.insert = vi.fn(() => chain);
  chain.values = vi.fn(() => Promise.resolve());
  chain.update = vi.fn(() => chain);
  chain.set = vi.fn(() => chain);
  return { mockDb: chain };
});

vi.mock('@/shared/lib/db', () => ({ getDb: () => mockDb }));
vi.mock('nanoid', () => ({ nanoid: () => 'nano_001' }));

import {
  getAdSetState,
  upsertAdSetState,
  listAdSetsByPhase,
  recordPhaseTransition,
  recordMaturityTransition,
} from '../state-store';

beforeEach(() => {
  Object.values(mockDb).forEach((fn) => (fn as ReturnType<typeof vi.fn>).mockClear?.());
  mockDb.select.mockImplementation(() => mockDb);
  mockDb.from.mockImplementation(() => mockDb);
  mockDb.where.mockImplementation(() => mockDb);
  mockDb.orderBy.mockImplementation(() => mockDb);
  mockDb.limit.mockResolvedValue([]);
  mockDb.insert.mockImplementation(() => mockDb);
  mockDb.values.mockResolvedValue(undefined);
  mockDb.update.mockImplementation(() => mockDb);
  mockDb.set.mockImplementation(() => mockDb);
});

describe('state-store', () => {
  it('getAdSetState returns null when no row exists', async () => {
    expect(await getAdSetState('as_x')).toBeNull();
  });

  it('upsertAdSetState inserts when row missing', async () => {
    await upsertAdSetState({
      adSetId: 'as_x',
      campaignId: 'cmp_1',
      locale: 'en',
      currentPhase: 'A',
      dataMaturityMode: 'COLD_START',
      optimizationEvent: 'landing_page_view',
    });
    expect(mockDb.insert).toHaveBeenCalled();
  });

  it('upsertAdSetState updates when row exists', async () => {
    mockDb.limit.mockResolvedValueOnce([{ adSetId: 'as_x' }]);
    await upsertAdSetState({
      adSetId: 'as_x',
      campaignId: 'cmp_1',
      locale: 'en',
      currentPhase: 'C',
      dataMaturityMode: 'CALIBRATING',
      optimizationEvent: 'Lead',
    });
    expect(mockDb.update).toHaveBeenCalled();
  });

  it('listAdSetsByPhase returns rows for the requested phases', async () => {
    mockDb.where.mockImplementationOnce(() =>
      Promise.resolve([
        { adSetId: 'as_1', currentPhase: 'C' },
        { adSetId: 'as_2', currentPhase: 'B' },
      ]),
    );
    const result = await listAdSetsByPhase(['B', 'C']);
    expect(result).toHaveLength(2);
  });

  it('recordPhaseTransition appends to phase_transitions table', async () => {
    await recordPhaseTransition('as_x', 'B', 'C', 'meta_default_50/7d', { ctr: 0.05 });
    expect(mockDb.insert).toHaveBeenCalled();
    expect(mockDb.values).toHaveBeenCalledWith(
      expect.objectContaining({
        transitionKind: 'phase',
        fromValue: 'B',
        toValue: 'C',
        reason: 'meta_default_50/7d',
      }),
    );
  });

  it('recordMaturityTransition appends with kind=maturity', async () => {
    await recordMaturityTransition(
      'as_x',
      'COLD_START',
      'CALIBRATING',
      'graduated_to_calibrating',
      { sample: 1 },
    );
    expect(mockDb.values).toHaveBeenCalledWith(
      expect.objectContaining({
        transitionKind: 'maturity',
        fromValue: 'COLD_START',
        toValue: 'CALIBRATING',
      }),
    );
  });
});
