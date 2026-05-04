import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tryInsertOneShot, wasSentWithin, recordSent } from '../sent-emails';

const mockDb = vi.hoisted(() => ({
  insert: vi.fn(),
  select: vi.fn(),
}));
vi.mock('../db', () => ({ getDb: () => mockDb }));

beforeEach(() => {
  vi.resetAllMocks();
});

describe('tryInsertOneShot', () => {
  it('returns true on first insert', async () => {
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 1 }]),
        }),
      }),
    });
    const result = await tryInsertOneShot('user_abc', 'welcome');
    expect(result).toBe(true);
  });
  it('returns false on conflict', async () => {
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const result = await tryInsertOneShot('user_abc', 'welcome');
    expect(result).toBe(false);
  });
});

describe('wasSentWithin', () => {
  it('returns true if a row exists within window', async () => {
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: 1 }]),
        }),
      }),
    });
    const result = await wasSentWithin('user_abc', 're_engagement_28d', 90 * 24 * 60 * 60 * 1000);
    expect(result).toBe(true);
  });
  it('returns false if no rows in window', async () => {
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const result = await wasSentWithin('user_abc', 're_engagement_28d', 90 * 24 * 60 * 60 * 1000);
    expect(result).toBe(false);
  });
});
