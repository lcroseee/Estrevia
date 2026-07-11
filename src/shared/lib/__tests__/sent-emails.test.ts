import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tryInsertOneShot, tryInsertOneShotUser, recordSentUpdate, wasSentWithin, recordSent } from '../sent-emails';

const mockDb = vi.hoisted(() => ({
  insert: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
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
    const result = await tryInsertOneShot('user_abc', 'account_deletion');
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
    const result = await tryInsertOneShot('user_abc', 'account_deletion');
    expect(result).toBe(false);
  });
});

describe('tryInsertOneShotUser (claim/update pattern — welcome)', () => {
  it("returns 'new' on first insert", async () => {
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 1 }]),
        }),
      }),
    });
    const result = await tryInsertOneShotUser('user_abc', 'welcome');
    expect(result).toBe('new');
  });

  it("returns 'retry' on conflict when the existing row has a NULL msgid", async () => {
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ resendMessageId: null }]),
        }),
      }),
    });
    expect(await tryInsertOneShotUser('user_abc', 'welcome')).toBe('retry');
  });

  it("returns 'delivered' on conflict when the msgid is populated", async () => {
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ resendMessageId: 'rsnd_prior' }]),
        }),
      }),
    });
    expect(await tryInsertOneShotUser('user_abc', 'welcome')).toBe('delivered');
  });
});

describe('recordSentUpdate', () => {
  it('UPDATEs the claimed row with the message id (never a second INSERT)', async () => {
    const whereMock = vi.fn().mockResolvedValue(undefined);
    const setMock = vi.fn().mockReturnValue({ where: whereMock });
    mockDb.update.mockReturnValue({ set: setMock });
    await recordSentUpdate('user_abc', 'welcome', 'rsnd_new');
    expect(setMock).toHaveBeenCalledWith({ resendMessageId: 'rsnd_new' });
    expect(whereMock).toHaveBeenCalled();
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('no-ops on null msgid (claim row stays NULL → next claim returns retry)', async () => {
    await recordSentUpdate('user_abc', 'welcome', null);
    expect(mockDb.update).not.toHaveBeenCalled();
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
