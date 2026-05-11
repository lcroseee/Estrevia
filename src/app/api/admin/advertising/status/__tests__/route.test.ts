import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Module mocks (hoisted by vitest before imports) ---
const fetchMetaInsightsMock = vi.fn();
const getReconStateMock = vi.fn();
const createMetaAdClientMock = vi.fn(() => ({ /* MetaInsightsApi shape — opaque */ }));

const dbLimitMock = vi.fn();
const dbOrderByMock = vi.fn(() => ({ limit: dbLimitMock }));
const dbWhereMock = vi.fn(() => ({ orderBy: dbOrderByMock }));
const dbFromMock = vi.fn(() => ({ where: dbWhereMock }));
const dbSelectMock = vi.fn(() => ({ from: dbFromMock }));

const getLatestBrandVoiceRunMock = vi.fn();

vi.mock('@/modules/advertising/decide/brand-voice-store', () => ({
  getLatestBrandVoiceRun: getLatestBrandVoiceRunMock,
}));

vi.mock('@/modules/advertising/perceive', () => ({
  fetchMetaInsights: fetchMetaInsightsMock,
}));

vi.mock('@/modules/advertising/perceive/recon-state-store', () => ({
  getReconState: getReconStateMock,
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

// --- Fixtures ---
function makeAdMetric(overrides: Partial<{
  ad_id: string; impressions: number; clicks: number; spend_usd: number;
  reach: number; frequency: number; days_running: number;
  status: 'ACTIVE' | 'PAUSED' | 'DELETED' | 'DISAPPROVED';
}> = {}) {
  return {
    ad_id: 'ad-1',
    adset_id: 'as-1',
    campaign_id: 'c-1',
    date: '2026-05-10',
    impressions: 1000,
    clicks: 50,
    spend_usd: 10,
    ctr: 0.05,
    cpc: 0.2,
    cpm: 10,
    frequency: 1.25,
    reach: 800,
    days_running: 5,
    status: 'ACTIVE' as const,
    ...overrides,
  };
}

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env.ADVERTISING_STATUS_BEARER = 'test-bearer';
  fetchMetaInsightsMock.mockResolvedValue([]);
  dbLimitMock.mockResolvedValue([]);
  getReconStateMock.mockResolvedValue({
    suspended: false,
    suspendedAt: null,
    suspendReason: null,
    autoResumeAt: null,
    lastDriftPct: null,
  });
  getLatestBrandVoiceRunMock.mockResolvedValue(null);
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.clearAllMocks();
});

describe('GET /api/admin/advertising/status — auth', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/admin/advertising/status');
    const res = await GET(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: 'UNAUTHORIZED' });
  });

  it('returns 401 when Authorization header is malformed', async () => {
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/admin/advertising/status', {
      headers: { Authorization: 'Token test-bearer' },
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 when Bearer token does not match', async () => {
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/admin/advertising/status', {
      headers: { Authorization: 'Bearer wrong-token' },
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });
});

describe('GET /api/admin/advertising/status — shape and includes', () => {
  it('returns 200 with ts + since + spend when include=spend', async () => {
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/admin/advertising/status?include=spend', {
      headers: { Authorization: 'Bearer test-bearer' },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('ts');
    expect(body).toHaveProperty('since');
    expect(body).toHaveProperty('spend');
    expect(body.spend).toMatchObject({ spend_usd: 0, impressions: 0, ad_count: 0 });
  });

  it('respects include filter — non-requested branches are absent', async () => {
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/admin/advertising/status?include=spend', {
      headers: { Authorization: 'Bearer test-bearer' },
    });
    const res = await GET(req);
    const body = await res.json();
    expect(body.decisions).toBeUndefined();
    expect(body.fatigued).toBeUndefined();
    expect(body.reconciler).toBeUndefined();
    expect(body.brand_voice).toBeUndefined();
  });

  it('respects since filter — decisions query is bounded via where()', async () => {
    const sinceIso = '2026-05-01T00:00:00.000Z';
    const { GET } = await import('../route');
    const req = new Request(`http://localhost/api/admin/advertising/status?include=decisions&since=${sinceIso}`, {
      headers: { Authorization: 'Bearer test-bearer' },
    });
    await GET(req);
    expect(dbWhereMock).toHaveBeenCalledTimes(1);
  });
});

describe('GET /api/admin/advertising/status — aggregateSpend', () => {
  it('computes weighted ctr / cpc_usd / cpm_usd / frequency_avg + ad_count', async () => {
    fetchMetaInsightsMock.mockResolvedValueOnce([
      makeAdMetric({ ad_id: 'a1', spend_usd: 10, impressions: 1000, clicks: 50, reach: 800, frequency: 2 }),
      makeAdMetric({ ad_id: 'a2', spend_usd: 20, impressions: 2000, clicks: 80, reach: 1500, frequency: 3 }),
    ]);
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/admin/advertising/status?include=spend', {
      headers: { Authorization: 'Bearer test-bearer' },
    });
    const res = await GET(req);
    const body = await res.json();
    expect(body.spend.spend_usd).toBe(30);
    expect(body.spend.impressions).toBe(3000);
    expect(body.spend.clicks).toBe(130);
    expect(body.spend.ad_count).toBe(2);
    expect(body.spend.ctr).toBeCloseTo(130 / 3000);
    expect(body.spend.cpc_usd).toBeCloseTo(30 / 130);
    expect(body.spend.cpm_usd).toBeCloseTo((30 / 3000) * 1000);
    // Weighted frequency = (2*1000 + 3*2000) / 3000 = 8000/3000 ≈ 2.667
    expect(body.spend.frequency_avg).toBeCloseTo(8000 / 3000);
  });
});

describe('GET /api/admin/advertising/status — aggregateFatigued', () => {
  it('surfaces only ads with weighted-mean frequency > 2.5 and assigns recommendation buckets', async () => {
    fetchMetaInsightsMock.mockResolvedValueOnce([
      makeAdMetric({ ad_id: 'ad-low',     impressions: 1000, frequency: 2.0 }),
      makeAdMetric({ ad_id: 'ad-monitor', impressions: 1000, frequency: 2.8 }),
      makeAdMetric({ ad_id: 'ad-refresh', impressions: 1000, frequency: 3.2 }),
      makeAdMetric({ ad_id: 'ad-pause',   impressions: 1000, frequency: 4.0 }),
    ]);
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/admin/advertising/status?include=fatigued', {
      headers: { Authorization: 'Bearer test-bearer' },
    });
    const res = await GET(req);
    const body = await res.json();
    expect(body.fatigued).toHaveLength(3);
    const byId = Object.fromEntries(body.fatigued.map((f: { ad_id: string }) => [f.ad_id, f]));
    expect(byId['ad-low']).toBeUndefined();
    expect(byId['ad-monitor'].recommendation).toBe('monitor');
    expect(byId['ad-refresh'].recommendation).toBe('refresh_creative');
    expect(byId['ad-pause'].recommendation).toBe('pause_now');
    // Descending frequency order
    expect(body.fatigued.map((f: { ad_id: string }) => f.ad_id)).toEqual(['ad-pause', 'ad-refresh', 'ad-monitor']);
  });
});

describe('GET /api/admin/advertising/status — brand_voice + reconciler branches', () => {
  it('include=brand_voice returns no_data with disabled reason when scorer flag unset', async () => {
    delete process.env.BRAND_VOICE_SCORER_ENABLED;
    getLatestBrandVoiceRunMock.mockResolvedValueOnce(null);
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/admin/advertising/status?include=brand_voice', {
      headers: { Authorization: 'Bearer test-bearer' },
    });
    const res = await GET(req);
    const body = await res.json();
    expect(body.brand_voice.status).toBe('no_data');
    expect(body.brand_voice.reason).toMatch(/disabled/);
  });

  it('include=brand_voice returns no_data with enabled-but-empty reason when flag on but DB empty', async () => {
    process.env.BRAND_VOICE_SCORER_ENABLED = 'true';
    getLatestBrandVoiceRunMock.mockResolvedValueOnce(null);
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/admin/advertising/status?include=brand_voice', {
      headers: { Authorization: 'Bearer test-bearer' },
    });
    const res = await GET(req);
    const body = await res.json();
    expect(body.brand_voice.status).toBe('no_data');
    expect(body.brand_voice.reason).toMatch(/enabled but no audit run/);
  });

  it('include=brand_voice returns ok + run_id + scores + flagged_count when DB has data', async () => {
    getLatestBrandVoiceRunMock.mockResolvedValueOnce({
      run_id: 'run-abc',
      reviewed_at: new Date('2026-05-10T10:00:00Z'),
      scores: [
        { ad_id: 'a1', depth: 8, scientific: 7, respectful: 9, no_manipulation: true,  overall: 8.2, needs_review: false, reviewed_by_claude_at: new Date('2026-05-10T10:00:00Z') },
        { ad_id: 'a2', depth: 5, scientific: 6, respectful: 7, no_manipulation: false, overall: 5.4, needs_review: true,  reviewed_by_claude_at: new Date('2026-05-10T10:00:00Z') },
      ],
    });
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/admin/advertising/status?include=brand_voice', {
      headers: { Authorization: 'Bearer test-bearer' },
    });
    const res = await GET(req);
    const body = await res.json();
    expect(body.brand_voice.status).toBe('ok');
    expect(body.brand_voice.run_id).toBe('run-abc');
    expect(body.brand_voice.reviewed_at).toBe('2026-05-10T10:00:00.000Z');
    expect(body.brand_voice.scores).toHaveLength(2);
    expect(body.brand_voice.flagged_count).toBe(1);
  });

  it('include=reconciler exposes suspended/suspended_at/last_drift_pct (no last_run)', async () => {
    getReconStateMock.mockResolvedValueOnce({
      suspended: true,
      suspendedAt: new Date('2026-05-09T12:00:00Z'),
      suspendReason: 'drift',
      autoResumeAt: new Date('2026-05-11T12:00:00Z'),
      lastDriftPct: 35,
    });
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/admin/advertising/status?include=reconciler', {
      headers: { Authorization: 'Bearer test-bearer' },
    });
    const res = await GET(req);
    const body = await res.json();
    expect(body.reconciler).toMatchObject({
      suspended: true,
      suspend_reason: 'drift',
      last_drift_pct: 35,
      status: 'warning', // 25 ≤ 35 < 50
    });
    expect(body.reconciler).not.toHaveProperty('last_run');
  });
});
