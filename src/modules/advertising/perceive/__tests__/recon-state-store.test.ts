import { describe, it, expect, vi, beforeEach } from 'vitest';

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

vi.mock('@/shared/lib/db', () => ({ getDb: () => mockDb }));

import {
  getReconState,
  suspend,
  resume,
  checkAutoResume,
} from '../recon-state-store';

beforeEach(() => {
  // Reset all mocks but rebind their default chain implementations
  Object.values(mockDb).forEach((fn) =>
    (fn as ReturnType<typeof vi.fn>).mockClear?.(),
  );
  mockDb.select.mockImplementation(() => mockDb);
  mockDb.from.mockImplementation(() => mockDb);
  mockDb.where.mockImplementation(() => mockDb);
  mockDb.limit.mockResolvedValue([]);
  mockDb.insert.mockImplementation(() => mockDb);
  mockDb.values.mockResolvedValue(undefined);
  mockDb.update.mockImplementation(() => mockDb);
  mockDb.set.mockImplementation(() => mockDb);
});

describe('recon-state-store', () => {
  it('getReconState bootstraps singleton row when missing', async () => {
    mockDb.limit.mockResolvedValueOnce([]); // first call: no row
    const state = await getReconState();
    expect(mockDb.insert).toHaveBeenCalled();
    expect(state).toEqual({
      suspended: false,
      suspendedAt: null,
      suspendReason: null,
      autoResumeAt: null,
      lastDriftPct: null,
    });
  });

  it('getReconState returns the row when present', async () => {
    const row = {
      suspended: true,
      suspendedAt: new Date('2026-05-03T12:00:00Z'),
      suspendReason: 'critical_drift',
      autoResumeAt: new Date('2026-05-04T12:00:00Z'),
      lastDriftPct: 0.42,
    };
    mockDb.limit.mockResolvedValueOnce([row]);
    const state = await getReconState();
    expect(state).toEqual(row);
  });

  it('suspend writes suspended=true with computed autoResumeAt 24h out by default', async () => {
    const before = Date.now();
    await suspend('critical_drift: m=100 ph=50', 0.5);
    const setArg = mockDb.set.mock.calls[0][0] as Record<string, unknown>;
    expect(setArg.suspended).toBe(true);
    expect(setArg.suspendReason).toBe('critical_drift: m=100 ph=50');
    expect(setArg.lastDriftPct).toBe(0.5);
    const autoResumeMs = (setArg.autoResumeAt as Date).getTime();
    const expected = before + 24 * 3600 * 1000;
    expect(Math.abs(autoResumeMs - expected)).toBeLessThan(2000);
  });

  it('suspend honours custom autoResumeHours', async () => {
    const before = Date.now();
    await suspend('manual_test', 0.3, 1);
    const setArg = mockDb.set.mock.calls[0][0] as Record<string, unknown>;
    const autoResumeMs = (setArg.autoResumeAt as Date).getTime();
    const expected = before + 1 * 3600 * 1000;
    expect(Math.abs(autoResumeMs - expected)).toBeLessThan(2000);
  });

  it('resume clears suspended state', async () => {
    await resume('founder_manual_override');
    const setArg = mockDb.set.mock.calls[0][0] as Record<string, unknown>;
    expect(setArg.suspended).toBe(false);
    expect(setArg.suspendedAt).toBeNull();
    expect(setArg.suspendReason).toBeNull();
    expect(setArg.autoResumeAt).toBeNull();
  });

  it('checkAutoResume calls resume() when 24h elapsed', async () => {
    const past = new Date(Date.now() - 25 * 3600 * 1000);
    mockDb.limit.mockResolvedValueOnce([
      {
        suspended: true,
        suspendedAt: past,
        suspendReason: 'critical_drift',
        autoResumeAt: past,
        lastDriftPct: 0.3,
      },
    ]);
    const result = await checkAutoResume();
    expect(result.resumed).toBe(true);
    expect(result.reason).toBe('auto_resume_24h_elapsed');
    // Verify update was called (resume() path)
    expect(mockDb.update).toHaveBeenCalled();
  });

  it('checkAutoResume returns resumed=false when not suspended', async () => {
    mockDb.limit.mockResolvedValueOnce([
      {
        suspended: false,
        suspendedAt: null,
        suspendReason: null,
        autoResumeAt: null,
        lastDriftPct: null,
      },
    ]);
    const result = await checkAutoResume();
    expect(result).toEqual({ resumed: false });
  });

  it('checkAutoResume returns resumed=false when suspended but autoResumeAt in future', async () => {
    const future = new Date(Date.now() + 12 * 3600 * 1000);
    mockDb.limit.mockResolvedValueOnce([
      {
        suspended: true,
        suspendedAt: new Date(),
        suspendReason: 'critical_drift',
        autoResumeAt: future,
        lastDriftPct: 0.3,
      },
    ]);
    const result = await checkAutoResume();
    expect(result.resumed).toBe(false);
  });
});
