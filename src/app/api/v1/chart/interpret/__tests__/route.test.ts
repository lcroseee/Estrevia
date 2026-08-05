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
      // Forward the row so tests can assert WHAT was written, not merely that
      // something was. Without this the cache-key columns are unobservable.
      values: (row: unknown) => ({
        onConflictDoNothing: () => mockInsertChartReading(row),
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

/** Shared chart fixture — hoisted so the variant tests reuse it. */
// NOTE: ayanamsa is a NUMBER and houses are HouseCusp OBJECTS in the real
// ChartResult. This fixture used to say `ayanamsa: 'lahiri'` and
// `houses: [0, 30, ...]`, which no assertion ever touched — so the mock
// silently disagreed with the type it stood in for, and the first prompt to
// actually read those fields threw.
const FIXTURE_CHART_DATA = {
          system: 'sidereal', houseSystem: 'Placidus', ayanamsa: 24.1,
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
          houses: [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map(
            (deg, i) => ({
              house: i + 1,
              siderealDegree: deg,
              tropicalDegree: (deg + 24.1) % 360,
              sign: ['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'][Math.floor(deg / 30)],
              signDegree: deg % 30,
            }),
          ),
          ascendant: {
            planet: 'Ascendant', absoluteDegree: 0, tropicalDegree: 24.1,
            sign: 'Aries', signDegree: 0, minutes: 0, seconds: 0,
            isRetrograde: false, speed: 0, house: 1,
          },
          midheaven: {
            planet: 'Midheaven', absoluteDegree: 270, tropicalDegree: 294.1,
            sign: 'Capricorn', signDegree: 0, minutes: 0, seconds: 0,
            isRetrograde: false, speed: 0, house: 10,
          },
          aspects: [{ planet1: 'Sun', planet2: 'Moon', type: 'square', orb: 0.5, applying: true }],
        };

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
        chartData: FIXTURE_CHART_DATA,
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

    // Guard the exact request shape that took this route down in production:
    // a retired model ID, and an omitted `thinking` field that would let
    // adaptive thinking eat the max_tokens budget and truncate the reading.
    const sent = JSON.parse(String((fetchSpy.mock.calls[0]![1] as RequestInit).body));
    expect(sent.model).toBe('claude-sonnet-5');
    expect(sent.thinking).toEqual({ type: 'disabled' });
    expect(sent.max_tokens).toBe(3400);

    fetchSpy.mockRestore();
  });

  it('defaults to the natal variant when the body omits it', async () => {
    mockRequirePremium.mockResolvedValueOnce({ userId: 'u1' });
    mockSelectChartReading.mockResolvedValueOnce([{ body: 'cached natal' }]);

    const { POST } = await import('../route');
    const res = await POST(makeRequest({ chartId: 'abc', locale: 'en' }));
    expect(res.status).toBe(200);
    expect((await res.json()).data.reading).toBe('cached natal');
  });

  it('rejects an unknown variant', async () => {
    mockRequirePremium.mockResolvedValueOnce({ userId: 'u1' });
    const { POST } = await import('../route');
    const res = await POST(
      makeRequest({ chartId: 'abc', locale: 'en', variant: 'horoscope' }),
    );
    expect(res.status).toBe(400);
  });

  it('caches the comparative variant under its own key', async () => {
    mockRequirePremium.mockResolvedValueOnce({ userId: 'u1' });
    mockSelectChartReading.mockResolvedValueOnce([]); // comparative not cached
    mockSelectNatalChart.mockResolvedValueOnce([
      { id: 'abc', chartData: FIXTURE_CHART_DATA },
    ]);

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ content: [{ type: 'text', text: 'comparative body' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const { POST } = await import('../route');
    const res = await POST(
      makeRequest({ chartId: 'abc', locale: 'en', variant: 'comparative' }),
    );
    expect(res.status).toBe(200);
    expect(mockInsertChartReading).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'comparative' }),
    );
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
