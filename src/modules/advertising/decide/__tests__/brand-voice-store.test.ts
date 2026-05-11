import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Module mocks ---
const valuesMock = vi.fn().mockResolvedValue(undefined);
const insertMock = vi.fn(() => ({ values: valuesMock }));

const limitMock = vi.fn();
const orderByMock = vi.fn(() => ({ limit: limitMock }));
const whereMock = vi.fn();

let selectCallCount = 0;
const selectMock = vi.fn(() => {
  selectCallCount++;
  if (selectCallCount % 2 === 1) {
    // Odd calls = "find latest" path (select → from → orderBy → limit)
    return { from: () => ({ orderBy: orderByMock }) };
  }
  // Even calls = "fetch by run_id" path (select → from → where)
  return { from: () => ({ where: whereMock }) };
});

vi.mock('@/shared/lib/db', () => ({
  getDb: () => ({ insert: insertMock, select: selectMock }),
}));

vi.mock('@/shared/lib/schema', () => ({
  advertisingBrandVoiceScores: {
    __tableName: 'advertising_brand_voice_scores',
    runId: { name: 'run_id' },
    reviewedByClaudeAt: { name: 'reviewed_by_claude_at' },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  selectCallCount = 0;
});

describe('saveBrandVoiceScores', () => {
  it('returns saved_count=0 with a fresh run_id and no insert call when input is empty', async () => {
    const { saveBrandVoiceScores } = await import('../brand-voice-store');
    const result = await saveBrandVoiceScores([]);
    expect(result.run_id).toBeTruthy();
    expect(result.run_id.length).toBeGreaterThan(0);
    expect(result.saved_count).toBe(0);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('inserts all rows under a single shared run_id', async () => {
    const { saveBrandVoiceScores } = await import('../brand-voice-store');
    const scores = [
      { ad_id: 'a1', depth: 8, scientific: 7, respectful: 9, no_manipulation: true,  overall: 8.2, needs_review: false, reviewed_by_claude_at: new Date('2026-05-10T10:00:00Z') },
      { ad_id: 'a2', depth: 5, scientific: 6, respectful: 7, no_manipulation: false, overall: 5.4, needs_review: true,  reviewed_by_claude_at: new Date('2026-05-10T10:00:00Z') },
    ];
    const result = await saveBrandVoiceScores(scores);

    expect(result.saved_count).toBe(2);
    expect(insertMock).toHaveBeenCalledTimes(1);
    const insertedRows = valuesMock.mock.calls[0][0] as Array<{ runId: string; adId: string; depth: number }>;
    expect(insertedRows).toHaveLength(2);
    expect(insertedRows[0].runId).toBe(result.run_id);
    expect(insertedRows[1].runId).toBe(result.run_id);
    expect(insertedRows[0].adId).toBe('a1');
    expect(insertedRows[1].adId).toBe('a2');
    expect(insertedRows[0].depth).toBe(8);
  });
});

describe('getLatestBrandVoiceRun', () => {
  it('returns null when the table has no rows', async () => {
    limitMock.mockResolvedValueOnce([]);
    const { getLatestBrandVoiceRun } = await import('../brand-voice-store');
    const result = await getLatestBrandVoiceRun();
    expect(result).toBeNull();
  });

  it('returns the run grouped by the latest run_id', async () => {
    limitMock.mockResolvedValueOnce([
      { runId: 'run-latest', reviewedAt: new Date('2026-05-10T10:00:00Z') },
    ]);
    whereMock.mockResolvedValueOnce([
      { id: 'r1', runId: 'run-latest', adId: 'a1', depth: 8, scientific: 7, respectful: 9, noManipulation: true,  overall: 8.2, needsReview: false, reviewedByClaudeAt: new Date('2026-05-10T10:00:00Z'), createdAt: new Date() },
      { id: 'r2', runId: 'run-latest', adId: 'a2', depth: 5, scientific: 6, respectful: 7, noManipulation: false, overall: 5.4, needsReview: true,  reviewedByClaudeAt: new Date('2026-05-10T10:00:00Z'), createdAt: new Date() },
    ]);

    const { getLatestBrandVoiceRun } = await import('../brand-voice-store');
    const result = await getLatestBrandVoiceRun();

    expect(result).not.toBeNull();
    expect(result!.run_id).toBe('run-latest');
    expect(result!.scores).toHaveLength(2);
    expect(result!.scores[0].ad_id).toBe('a1');
    expect(result!.scores[1].ad_id).toBe('a2');
  });

  it('maps DB camelCase columns to snake_case BrandVoiceScore fields', async () => {
    limitMock.mockResolvedValueOnce([
      { runId: 'run-1', reviewedAt: new Date('2026-05-10T10:00:00Z') },
    ]);
    whereMock.mockResolvedValueOnce([
      { id: 'r1', runId: 'run-1', adId: 'a1', depth: 8, scientific: 7, respectful: 9, noManipulation: true, overall: 8.2, needsReview: false, reviewedByClaudeAt: new Date('2026-05-10T10:00:00Z'), createdAt: new Date() },
    ]);

    const { getLatestBrandVoiceRun } = await import('../brand-voice-store');
    const result = await getLatestBrandVoiceRun();
    expect(result!.scores[0]).toMatchObject({
      ad_id: 'a1',
      no_manipulation: true,
      needs_review: false,
      reviewed_by_claude_at: new Date('2026-05-10T10:00:00Z'),
    });
  });
});
