// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — must declare before `import('../route')`.
// ---------------------------------------------------------------------------
const mockRequirePremium = vi.fn();
vi.mock('@/modules/auth/lib/premium', () => ({
  requirePremium: () => mockRequirePremium(),
}));

const mockLimit = vi.fn();
vi.mock('@/shared/lib/rate-limit', () => ({
  getRateLimiter: () => ({ limit: (...args: unknown[]) => mockLimit(...args) }),
}));

const mockSelectChartReading = vi.fn();
const mockSelectNatalChart = vi.fn();
const mockInsertChartReading = vi.fn();

// Drizzle stores the table's SQL name in a Symbol — `_.name` is undefined,
// so we read the value via `Symbol.for('drizzle:Name')` look-alike: iterate
// the table's own symbols and return the one whose description matches.
function tableName(table: object): string | undefined {
  for (const sym of Object.getOwnPropertySymbols(table)) {
    if (sym.description === 'drizzle:Name') {
      return (table as Record<symbol, string>)[sym];
    }
  }
  return undefined;
}

vi.mock('@/shared/lib/db', () => ({
  getDb: () => ({
    select: () => ({
      from: (table: object) => ({
        where: () => ({
          limit: () => {
            const name = tableName(table);
            if (name === 'chart_readings') return mockSelectChartReading();
            if (name === 'natal_charts') return mockSelectNatalChart();
            return Promise.resolve([]);
          },
        }),
      }),
    }),
    insert: () => ({
      values: () => ({
        onConflictDoNothing: () => mockInsertChartReading(),
      }),
    }),
  }),
}));

vi.mock('nanoid', () => ({ nanoid: () => 'fixed-reading-id' }));

const ORIGINAL_ENV = process.env.ANTHROPIC_API_KEY;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ANTHROPIC_API_KEY = 'sk-test';
  mockLimit.mockResolvedValue({ success: true });
  mockInsertChartReading.mockResolvedValue(undefined);
});

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/v1/chart/interpret', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/v1/chart/interpret', () => {
  it('returns 401 when unauthenticated', async () => {
    mockRequirePremium.mockRejectedValueOnce(
      new Response(JSON.stringify({ success: false, data: null, error: 'UNAUTHORIZED' }), { status: 401 }),
    );
    const { POST } = await import('../route');
    const res = await POST(makeRequest({ chartId: 'abc', locale: 'en' }));
    expect(res.status).toBe(401);
  });

  it('returns 403 when authenticated but not premium', async () => {
    mockRequirePremium.mockRejectedValueOnce(
      new Response(JSON.stringify({ success: false, data: null, error: 'FORBIDDEN' }), { status: 403 }),
    );
    const { POST } = await import('../route');
    const res = await POST(makeRequest({ chartId: 'abc', locale: 'en' }));
    expect(res.status).toBe(403);
  });

  it('returns 400 on invalid body', async () => {
    mockRequirePremium.mockResolvedValueOnce({ userId: 'u1' });
    const { POST } = await import('../route');
    const res = await POST(makeRequest({})); // missing chartId
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_ERROR');
  });

  it('returns 429 when rate-limited', async () => {
    mockRequirePremium.mockResolvedValueOnce({ userId: 'u1' });
    mockLimit.mockResolvedValueOnce({ success: false });
    const { POST } = await import('../route');
    const res = await POST(makeRequest({ chartId: 'abc', locale: 'en' }));
    expect(res.status).toBe(429);
  });

  it('returns cached reading on cache hit and skips Anthropic call', async () => {
    mockRequirePremium.mockResolvedValueOnce({ userId: 'u1' });
    mockSelectChartReading.mockResolvedValueOnce([{ body: 'cached-text' }]);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { POST } = await import('../route');
    const res = await POST(makeRequest({ chartId: 'abc', locale: 'en' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ reading: 'cached-text', source: 'cache' });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('returns 404 when chart_id not in natal_charts', async () => {
    mockRequirePremium.mockResolvedValueOnce({ userId: 'u1' });
    mockSelectChartReading.mockResolvedValueOnce([]);
    mockSelectNatalChart.mockResolvedValueOnce([]);
    const { POST } = await import('../route');
    const res = await POST(makeRequest({ chartId: 'missing', locale: 'en' }));
    expect(res.status).toBe(404);
  });

  it('generates and caches on cache miss + chart found', async () => {
    mockRequirePremium.mockResolvedValueOnce({ userId: 'u1' });
    mockSelectChartReading.mockResolvedValueOnce([]);
    mockSelectNatalChart.mockResolvedValueOnce([
      {
        id: 'abc',
        chartData: {
          system: 'sidereal', houseSystem: 'Placidus', ayanamsa: 'lahiri',
          planets: [
            { planet: 'Sun', sign: 'Aries', longitude: 12, signDegree: 12, house: 1, retrograde: false },
            { planet: 'Moon', sign: 'Cancer', longitude: 95, signDegree: 5, house: 4, retrograde: false },
            { planet: 'Mercury', sign: 'Pisces', longitude: 340, signDegree: 10, house: 12, retrograde: true },
            { planet: 'Venus', sign: 'Taurus', longitude: 45, signDegree: 15, house: 2, retrograde: false },
            { planet: 'Mars', sign: 'Leo', longitude: 130, signDegree: 10, house: 5, retrograde: false },
            { planet: 'Jupiter', sign: 'Sagittarius', longitude: 250, signDegree: 10, house: 9, retrograde: false },
            { planet: 'Saturn', sign: 'Capricorn', longitude: 290, signDegree: 20, house: 10, retrograde: false },
            { planet: 'Uranus', sign: 'Aquarius', longitude: 310, signDegree: 10, house: 11, retrograde: false },
            { planet: 'Neptune', sign: 'Pisces', longitude: 345, signDegree: 15, house: 12, retrograde: false },
            { planet: 'Pluto', sign: 'Scorpio', longitude: 220, signDegree: 10, house: 8, retrograde: false },
            { planet: 'North Node', sign: 'Cancer', longitude: 100, signDegree: 10, house: 4, retrograde: true },
            { planet: 'Chiron', sign: 'Virgo', longitude: 160, signDegree: 10, house: 6, retrograde: false },
          ],
          houses: [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330],
          aspects: [{ planet1: 'Sun', planet2: 'Moon', type: 'square', orb: 0.5, applying: true }],
        },
      },
    ]);

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ content: [{ type: 'text', text: 'You are an Aries...' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const { POST } = await import('../route');
    const res = await POST(makeRequest({ chartId: 'abc', locale: 'en' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.reading).toBe('You are an Aries...');
    expect(body.data.source).toBe('generated');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(mockInsertChartReading).toHaveBeenCalledTimes(1);
    fetchSpy.mockRestore();
  });

  it('returns 502 when Anthropic returns non-OK', async () => {
    mockRequirePremium.mockResolvedValueOnce({ userId: 'u1' });
    mockSelectChartReading.mockResolvedValueOnce([]);
    mockSelectNatalChart.mockResolvedValueOnce([
      { id: 'abc', chartData: { planets: [], houses: null, aspects: [] } },
    ]);
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('upstream broken', { status: 500 }),
    );
    const { POST } = await import('../route');
    const res = await POST(makeRequest({ chartId: 'abc', locale: 'en' }));
    expect(res.status).toBe(502);
  });

  it('returns 503 when ANTHROPIC_API_KEY missing', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    mockRequirePremium.mockResolvedValueOnce({ userId: 'u1' });
    mockSelectChartReading.mockResolvedValueOnce([]);
    mockSelectNatalChart.mockResolvedValueOnce([
      { id: 'abc', chartData: { planets: [], houses: null, aspects: [] } },
    ]);
    const { POST } = await import('../route');
    const res = await POST(makeRequest({ chartId: 'abc', locale: 'en' }));
    expect(res.status).toBe(503);
    process.env.ANTHROPIC_API_KEY = 'sk-test';
  });

  it('still returns 200 when cache write fails (non-fatal)', async () => {
    mockRequirePremium.mockResolvedValueOnce({ userId: 'u1' });
    mockSelectChartReading.mockResolvedValueOnce([]);
    mockSelectNatalChart.mockResolvedValueOnce([
      {
        id: 'abc',
        chartData: { planets: [], houses: null, aspects: [] },
      },
    ]);
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ content: [{ type: 'text', text: 'ok' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    mockInsertChartReading.mockRejectedValueOnce(new Error('db down'));

    const { POST } = await import('../route');
    const res = await POST(makeRequest({ chartId: 'abc', locale: 'en' }));
    expect(res.status).toBe(200); // cache write failure non-fatal
  });
});

if (ORIGINAL_ENV !== undefined) process.env.ANTHROPIC_API_KEY = ORIGINAL_ENV;
