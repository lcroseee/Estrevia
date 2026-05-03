import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── All hoisted mock handles — must be vi.hoisted() so factories can reference them. ──
const mocks = vi.hoisted(() => {
  function makeDbMockLocal(row: Record<string, unknown> | null) {
    const builder = {
      from: () => builder,
      where: () => builder,
      limit: () => Promise.resolve(row ? [row] : []),
    };
    return { select: () => builder };
  }

  const mockGetTranslations = vi.fn(async ({ locale, namespace }: { locale: string; namespace: string }) => {
    // Return a translator that echoes "[locale][namespace.key]"
    return ((key: string, vars?: Record<string, string>) => {
      const interpolated = vars
        ? key.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`)
        : key;
      return `[${locale}][${namespace}.${interpolated}]`;
    }) as unknown as ReturnType<typeof Object>;
  });

  const mockSentryCapture = vi.fn();
  const dbHandle = { current: makeDbMockLocal(null) };

  return { mockGetTranslations, mockSentryCapture, dbHandle, makeDbMockLocal };
});

vi.mock('next-intl/server', () => ({
  getTranslations: mocks.mockGetTranslations,
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: mocks.mockSentryCapture,
}));

vi.mock('@/shared/lib/db', () => ({
  getDb: () => mocks.dbHandle.current,
}));

vi.mock('@/shared/lib/rate-limit', () => ({
  getRateLimiter: () => ({
    limit: async () => ({ success: true, limit: 60, remaining: 59, reset: Date.now() + 60_000 }),
  }),
}));

// ImageResponse: replace with a constructor class that returns a 200 Response.
vi.mock('@vercel/og', () => ({
  ImageResponse: class MockImageResponse {
    status = 200;
    headers = new Headers({ 'Content-Type': 'image/png' });
    constructor() {
      return new Response('mock-png', {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      }) as unknown as MockImageResponse;
    }
  },
}));

// fs.promises.readFile for the font load — return a 4-byte fake buffer.
vi.mock('fs', () => ({
  promises: {
    readFile: vi.fn().mockResolvedValue(Buffer.from([0, 0, 0, 0])),
  },
}));

// ── Import the route under test AFTER all mocks are set up ──────────────────
import { GET } from '../route';

const baseRow = {
  id: 'test-id',
  sunSign: 'Aries',
  moonSign: 'Taurus',
  ascendantSign: 'Gemini',
  element: 'Fire',
  rulingPlanet: 'Mars',
  rarityPercent: 5.5,
  locale: 'en',
};

function buildRequest(): Request {
  return new Request('https://estrevia.app/api/og/passport/test-id?format=og', {
    method: 'GET',
    headers: { 'x-forwarded-for': '127.0.0.1' },
  });
}

const params = Promise.resolve({ id: 'test-id' });

beforeEach(() => {
  vi.clearAllMocks();
  // Restore the translator implementation after clearAllMocks resets it
  mocks.mockGetTranslations.mockImplementation(async ({ locale, namespace }: { locale: string; namespace: string }) => {
    return ((key: string, vars?: Record<string, string>) => {
      const interpolated = vars
        ? key.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`)
        : key;
      return `[${locale}][${namespace}.${interpolated}]`;
    }) as unknown as ReturnType<typeof Object>;
  });
});

describe('OG passport route — locale propagation (R1)', () => {
  it('passes locale=es to getTranslations when passport.locale is "es"', async () => {
    mocks.dbHandle.current = mocks.makeDbMockLocal({ ...baseRow, locale: 'es' });

    const res = await GET(buildRequest(), { params });

    expect(res.status).toBe(200);
    expect(mocks.mockGetTranslations).toHaveBeenCalledWith(
      expect.objectContaining({ locale: 'es', namespace: 'share.passport.og' }),
    );
    expect(mocks.mockGetTranslations).toHaveBeenCalledWith(
      expect.objectContaining({ locale: 'es', namespace: 'astro.rarityTier' }),
    );
  });

  it('passes locale=en when passport.locale is "en"', async () => {
    mocks.dbHandle.current = mocks.makeDbMockLocal({ ...baseRow, locale: 'en' });

    await GET(buildRequest(), { params });

    expect(mocks.mockGetTranslations).toHaveBeenCalledWith(
      expect.objectContaining({ locale: 'en', namespace: 'share.passport.og' }),
    );
  });
});

describe('OG passport route — invalid-locale fallback (R2)', () => {
  it('falls back to EN + reports Sentry when locale is unexpected', async () => {
    mocks.dbHandle.current = mocks.makeDbMockLocal({ ...baseRow, locale: 'fr' as 'en' | 'es' });

    const res = await GET(buildRequest(), { params });

    expect(res.status).toBe(200);
    // Fallback to EN
    expect(mocks.mockGetTranslations).toHaveBeenCalledWith(
      expect.objectContaining({ locale: 'en', namespace: 'share.passport.og' }),
    );
    // Sentry observability tag
    expect(mocks.mockSentryCapture).toHaveBeenCalled();
    const captured = mocks.mockSentryCapture.mock.calls[0]?.[0];
    const message = captured instanceof Error ? captured.message : String(captured);
    expect(message).toMatch(/og_locale_invalid/);
  });
});
