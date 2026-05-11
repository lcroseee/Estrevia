import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchMetaInsightsMock = vi.fn();
const createMetaAdClientMock = vi.fn(() => ({}));

const dbLimitMock = vi.fn();
const dbOrderByMock = vi.fn(() => ({ limit: dbLimitMock }));
const dbWhereMock = vi.fn(() => ({ orderBy: dbOrderByMock }));
const dbFromMock = vi.fn(() => ({ where: dbWhereMock }));
const dbSelectMock = vi.fn(() => ({ from: dbFromMock }));

vi.mock('@/modules/advertising/perceive', () => ({
  fetchMetaInsights: fetchMetaInsightsMock,
}));

vi.mock('@/modules/advertising/meta-graph-api', () => ({
  createMetaAdClient: createMetaAdClientMock,
}));

vi.mock('@/shared/lib/db', () => ({
  getDb: () => ({ select: dbSelectMock }),
}));

vi.mock('@/shared/lib/schema', () => ({
  advertisingDecisions: { __tableName: 'advertising_decisions', timestamp: 'timestamp' },
}));

beforeEach(() => {
  vi.clearAllMocks();
  fetchMetaInsightsMock.mockResolvedValue([]);
  dbLimitMock.mockResolvedValue([]);
});

describe('buildDigestData', () => {
  it('returns spend_total_usd=0 and decisions=[] with date="YYYY-MM-DD" when no data', async () => {
    const { buildDigestData } = await import('../digest-builder');
    const report = await buildDigestData({ date: new Date('2026-05-10T12:00:00Z') });
    expect(report.spend_total_usd).toBe(0);
    expect(report.impressions_total).toBe(0);
    expect(report.decisions).toEqual([]);
    expect(report.date).toBe('2026-05-10');
  });

  it('maps DB rows: adId→ad_id, reasoningTier→reasoning_tier, deltaBudgetUsd→delta_budget_usd', async () => {
    dbLimitMock.mockResolvedValueOnce([
      {
        id: 'd1',
        adId: 'ad-42',
        action: 'pause',
        reason: 'fatigue',
        reasoningTier: 'tier_1_rules',
        confidence: 0.95,
        deltaBudgetUsd: null,
        metricsSnapshot: {},
        timestamp: new Date('2026-05-10T10:00:00Z'),
        applied: true,
        appliedAt: new Date('2026-05-10T10:01:00Z'),
      },
    ]);
    const { buildDigestData } = await import('../digest-builder');
    const report = await buildDigestData({ date: new Date('2026-05-10T12:00:00Z') });
    expect(report.decisions).toHaveLength(1);
    expect(report.decisions[0]).toMatchObject({
      ad_id: 'ad-42',
      action: 'pause',
      reason: 'fatigue',
      reasoning_tier: 'tier_1_rules',
      confidence: 0.95,
    });
    expect(report.decisions[0].delta_budget_usd).toBeUndefined();
  });

  it('aggregates spend and impressions across per-ad-per-day metrics', async () => {
    fetchMetaInsightsMock.mockResolvedValueOnce([
      { ad_id: 'a1', adset_id: 'as-1', campaign_id: 'c-1', date: '2026-05-10', spend_usd: 5,  impressions: 500,  clicks: 25, ctr: 0.05,  cpc: 0.2,  cpm: 10, reach: 400,  frequency: 1.25, days_running: 3, status: 'ACTIVE' },
      { ad_id: 'a2', adset_id: 'as-1', campaign_id: 'c-1', date: '2026-05-10', spend_usd: 15, impressions: 1500, clicks: 50, ctr: 0.033, cpc: 0.3,  cpm: 10, reach: 1100, frequency: 1.36, days_running: 5, status: 'ACTIVE' },
    ]);
    const { buildDigestData } = await import('../digest-builder');
    const report = await buildDigestData({ date: new Date('2026-05-10T12:00:00Z') });
    expect(report.spend_total_usd).toBe(20);
    expect(report.impressions_total).toBe(2000);
  });
});
