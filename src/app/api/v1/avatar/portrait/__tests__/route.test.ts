import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  isPremium: vi.fn(),
  getRateLimiter: vi.fn(),
  checkAndIncrementUsage: vi.fn(),
  decrementUsage: vi.fn(),
  analyzeImage: vi.fn(),
  generateFromImage: vi.fn(),
  blobPut: vi.fn(),
  insertValues: vi.fn(),
  insert: vi.fn(),
  selectLimit: vi.fn(),
  selectWhere: vi.fn(),
  selectFrom: vi.fn(),
  select: vi.fn(),
  getDb: vi.fn(),
  checkDailyBudget: vi.fn(),
  consumeDailyBudget: vi.fn(),
  trackServerEvent: vi.fn(),
}));

mocks.insertValues.mockResolvedValue(undefined);
mocks.insert.mockImplementation(() => ({ values: mocks.insertValues }));
// natal_charts stores NO sign columns — only `chartData: jsonb<ChartResult>`
// (src/shared/lib/schema.ts:44). Signs are derived via generatePassport().
mocks.selectLimit.mockResolvedValue([{ id: 'chart_1', userId: 'user_1', chartData: { planets: [] } }]);
mocks.selectWhere.mockImplementation(() => ({ limit: mocks.selectLimit }));
mocks.selectFrom.mockImplementation(() => ({ where: mocks.selectWhere }));
mocks.select.mockImplementation(() => ({ from: mocks.selectFrom }));
mocks.getDb.mockReturnValue({ insert: mocks.insert, select: mocks.select });

vi.mock('@/modules/auth/lib/helpers', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/modules/auth/lib/premium', () => ({ isPremium: mocks.isPremium }));
vi.mock('@/shared/lib/rate-limit', () => ({ getRateLimiter: mocks.getRateLimiter }));
vi.mock('@/shared/lib/usage', () => ({
  checkAndIncrementUsage: mocks.checkAndIncrementUsage,
  decrementUsage: mocks.decrementUsage,
}));
vi.mock('@/shared/lib/db', () => ({ getDb: mocks.getDb }));
vi.mock('@/shared/lib/schema', () => ({
  avatars: {},
  natalCharts: { id: 'id', userId: 'user_id', chartData: 'chart_data' },
}));
vi.mock('drizzle-orm', () => ({ eq: vi.fn((c, v) => ({ c, v })), and: vi.fn((...a) => ({ a })) }));
vi.mock('@vercel/blob', () => ({ put: mocks.blobPut }));
// The route derives signs from the stored ChartResult rather than from columns.
vi.mock('@/modules/astro-engine/passport', () => ({
  generatePassport: vi.fn(() => ({
    sunSign: 'Scorpio',
    moonSign: 'Taurus',
    ascendantSign: 'Leo',
    element: 'Water',
    rulingPlanet: 'Mars',
    rarityPercent: 4.2,
  })),
}));
vi.mock('@/shared/lib/analytics', () => ({
  trackServerEvent: mocks.trackServerEvent,
  AnalyticsEvent: {
    AVATAR_PORTRAIT_GENERATED: 'avatar_portrait_generated',
    AVATAR_PORTRAIT_REJECTED: 'avatar_portrait_rejected',
    AVATAR_GENERATION_FAILED: 'avatar_generation_failed',
  },
}));
vi.mock('@/shared/lib/portrait-guards', async (orig) => {
  const actual = await orig<typeof import('@/shared/lib/portrait-guards')>();
  return {
    ...actual,
    checkDailyBudget: mocks.checkDailyBudget,
    consumeDailyBudget: mocks.consumeDailyBudget,
  };
});
vi.mock('@/shared/lib/gemini', () => ({
  GeminiImageClient: class {
    generateFromImage = mocks.generateFromImage;
  },
  GeminiVisionClient: class {
    analyzeImage = mocks.analyzeImage;
  },
}));

import { POST } from '../route';

const SAFE_ANALYSIS = {
  safe: true,
  reasons: [],
  traits: {
    hair: { texture: 'spiral curls', length: 'shoulder-length', colour: 'dark brown', style: 'loose' },
    face: { shape: 'oval', jaw: 'soft', brows: 'full' },
    skinTone: 'warm mid tone',
  },
  prose: 'A steady gaze.',
};

function makeRequest(fields: Record<string, string> = {}, bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4])) {
  const form = new FormData();
  form.set('file', new Blob([bytes], { type: 'image/jpeg' }), 'selfie.jpg');
  form.set('presentation', 'auto');
  form.set('style', 'cosmic');
  form.set('chartId', 'chart_1');
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return new Request('http://localhost/api/v1/avatar/portrait', { method: 'POST', body: form });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.AVATAR_PORTRAIT_ENABLED = 'true';
  process.env.GEMINI_API_KEY = 'k';
  process.env.BLOB_READ_WRITE_TOKEN = 't';
  mocks.requireAuth.mockResolvedValue({ id: 'user_1' });
  mocks.isPremium.mockResolvedValue(true);
  mocks.getRateLimiter.mockReturnValue({ limit: vi.fn().mockResolvedValue({ success: true }) });
  mocks.checkAndIncrementUsage.mockResolvedValue({ allowed: true, count: 1, limit: 30 });
  mocks.checkDailyBudget.mockResolvedValue(true);
  mocks.analyzeImage.mockResolvedValue({ json: SAFE_ANALYSIS, cost_usd: 0.0002 });
  mocks.generateFromImage.mockResolvedValue({ buffer: Buffer.from('img'), mimeType: 'image/jpeg' });
  mocks.blobPut.mockResolvedValue({ url: 'https://x/y.jpg', pathname: 'avatars/user_1/abc.jpg' });
  mocks.insertValues.mockResolvedValue(undefined);
  mocks.selectLimit.mockResolvedValue([
    { id: 'chart_1', sunSign: 'Scorpio', moonSign: 'Taurus', ascendantSign: 'Leo', rulingPlanet: 'Mars' },
  ]);
});

describe('POST /api/v1/avatar/portrait — guards, in order', () => {
  it('rejects a non-Pro user with 402 before spending anything', async () => {
    mocks.isPremium.mockResolvedValue(false);
    const res = await POST(makeRequest());
    expect(res.status).toBe(402);
    expect((await res.json()).error).toBe('PRO_REQUIRED');
    expect(mocks.checkAndIncrementUsage).not.toHaveBeenCalled();
    expect(mocks.analyzeImage).not.toHaveBeenCalled();
  });

  it('returns 503 FEATURE_DISABLED when the kill switch is off', async () => {
    process.env.AVATAR_PORTRAIT_ENABLED = 'false';
    const res = await POST(makeRequest());
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe('FEATURE_DISABLED');
    expect(mocks.analyzeImage).not.toHaveBeenCalled();
  });

  it('returns 429 when rate limited', async () => {
    mocks.getRateLimiter.mockReturnValue({ limit: vi.fn().mockResolvedValue({ success: false }) });
    const res = await POST(makeRequest());
    expect(res.status).toBe(429);
    expect(mocks.checkAndIncrementUsage).not.toHaveBeenCalled();
  });

  it('returns 503 BUDGET_EXCEEDED when the daily cap is hit', async () => {
    mocks.checkDailyBudget.mockResolvedValue(false);
    const res = await POST(makeRequest());
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe('BUDGET_EXCEEDED');
    expect(mocks.generateFromImage).not.toHaveBeenCalled();
  });

  it('returns 402 QUOTA_EXCEEDED when the monthly cap is reached, even for Pro', async () => {
    mocks.checkAndIncrementUsage.mockResolvedValue({ allowed: false, count: 30, limit: 30 });
    const res = await POST(makeRequest());
    expect(res.status).toBe(402);
    expect((await res.json()).error).toBe('QUOTA_EXCEEDED');
    expect(mocks.generateFromImage).not.toHaveBeenCalled();
  });

  it('rejects a non-cosmic style', async () => {
    const res = await POST(makeRequest({ style: 'geometric' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('STYLE_NOT_PORTRAIT_CAPABLE');
  });

  it('rejects a file whose bytes are not a real image', async () => {
    const res = await POST(makeRequest({}, new Uint8Array([0x3c, 0x73, 0x76, 0x67])));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVALID_IMAGE');
    expect(mocks.decrementUsage).toHaveBeenCalled();
  });
});

describe('POST /api/v1/avatar/portrait — safety gate', () => {
  it('refuses a likely minor with 422 and refunds the quota', async () => {
    mocks.analyzeImage.mockResolvedValue({
      json: { ...SAFE_ANALYSIS, safe: false, reasons: ['likely_minor'] },
      cost_usd: 0.0002,
    });
    const res = await POST(makeRequest());
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe('UNSAFE_IMAGE');
    expect(body.data.reasons).toContain('likely_minor');
    expect(mocks.generateFromImage).not.toHaveBeenCalled();
    expect(mocks.decrementUsage).toHaveBeenCalled();
  });

  it('refunds and 502s when pass 1 returns unparseable JSON', async () => {
    mocks.analyzeImage.mockRejectedValue(new Error('bad json'));
    const res = await POST(makeRequest());
    expect(res.status).toBe(502);
    expect(mocks.decrementUsage).toHaveBeenCalled();
  });
});

describe('POST /api/v1/avatar/portrait — happy path', () => {
  it('stores the portrait privately and returns the palette', async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    const [, , opts] = mocks.blobPut.mock.calls[0];
    expect(opts.access).toBe('private');

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.palette.lead).toBeTruthy();
    expect(body.data.scale).toBeTruthy();
    expect(mocks.consumeDailyBudget).toHaveBeenCalled();
    expect(mocks.insertValues).toHaveBeenCalledTimes(1);
  });

  it('persists no face-derived data', async () => {
    await POST(makeRequest());
    const row = mocks.insertValues.mock.calls[0][0];
    expect(JSON.stringify(row)).not.toMatch(/spiral curls|warm mid tone|oval/);
  });

  it('refunds the quota when generation fails', async () => {
    mocks.generateFromImage.mockRejectedValue(new Error('GEMINI_NO_IMAGE'));
    const res = await POST(makeRequest());
    expect(res.status).toBe(502);
    expect(mocks.decrementUsage).toHaveBeenCalled();
    expect(mocks.consumeDailyBudget).not.toHaveBeenCalled();
  });

  it('never echoes the selfie bytes back in the response', async () => {
    const res = await POST(makeRequest());
    expect(await res.text()).not.toContain('imageBase64');
  });

  it('still returns 200 and does not refund when consumeDailyBudget rejects after a successful insert', async () => {
    mocks.consumeDailyBudget.mockRejectedValue(new Error('redis down'));
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(mocks.insertValues).toHaveBeenCalledTimes(1);
    expect(mocks.decrementUsage).not.toHaveBeenCalled();
  });

  it('still refunds the quota when generation fails before the portrait is persisted', async () => {
    mocks.generateFromImage.mockRejectedValue(new Error('GEMINI_NO_IMAGE'));
    const res = await POST(makeRequest());
    expect(res.status).toBe(502);
    expect(mocks.insertValues).not.toHaveBeenCalled();
    expect(mocks.decrementUsage).toHaveBeenCalled();
  });
});
