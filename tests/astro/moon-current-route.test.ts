import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from '@/app/api/v1/moon/current/route';

// Silence the shared rate limiter for these tests by always returning success
vi.mock('@/shared/lib/rate-limit', () => ({
  getRateLimiter: () => ({ limit: async () => ({ success: true }) }),
}));

function makeReq(url: string): Request {
  return new Request(url, { headers: { 'x-forwarded-for': '127.0.0.1' } });
}

describe('/api/v1/moon/current — time reference', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('honors ?t= ISO8601 and does not snap to UTC midnight', async () => {
    // Fix server clock to 2026-04-23T02:00:00Z
    vi.setSystemTime(new Date('2026-04-23T02:00:00Z'));
    // But the client passes its local evening moment as t
    const res = await GET(makeReq('https://x/test?t=2026-04-23T20:00:00Z'));
    const json = await res.json();
    expect(json.success).toBe(true);
    const illumAt20 = json.data.illumination;

    // Same server clock, t=morning → illumination should differ by ≥0.5%
    const res2 = await GET(makeReq('https://x/test?t=2026-04-23T00:00:00Z'));
    const json2 = await res2.json();
    const illumAt00 = json2.data.illumination;
    expect(Math.abs(illumAt20 - illumAt00)).toBeGreaterThanOrEqual(0.5);
  });

  it('falls back to current server moment (not UTC midnight) when t is absent', async () => {
    vi.setSystemTime(new Date('2026-04-23T18:30:00Z'));
    const res = await GET(makeReq('https://x/test'));
    const json = await res.json();
    // Angle at 18:30 UTC is ~6° further than at 00:00 UTC → reject the midnight value
    expect(json.success).toBe(true);
    // Angle should have moved forward — not be a "pinned to midnight" figure.
    // The old behavior would give the exact same angle as midnight; we assert it is
    // at least 0.5° past the midnight value.
    vi.setSystemTime(new Date('2026-04-23T00:00:00Z'));
    const mid = await GET(makeReq('https://x/test'));
    const midJson = await mid.json();
    expect(json.data.angle).toBeGreaterThan(midJson.data.angle + 0.5);
  });

  it('rejects malformed t and falls back silently', async () => {
    vi.setSystemTime(new Date('2026-04-23T12:00:00Z'));
    const res = await GET(makeReq('https://x/test?t=not-a-date'));
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(typeof json.data.illumination).toBe('number');
  });

  it('sets Cache-Control s-maxage=60', async () => {
    vi.setSystemTime(new Date('2026-04-23T12:00:00Z'));
    const res = await GET(makeReq('https://x/test'));
    expect(res.headers.get('Cache-Control')).toMatch(/s-maxage=60/);
  });
});
