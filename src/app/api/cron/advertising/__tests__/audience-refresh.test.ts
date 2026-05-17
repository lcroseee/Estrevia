/**
 * Integration smoke test for the audience-refresh cron.
 *
 * Verifies the route's end-to-end wiring (Track 7): the real
 * stripe-client, posthog-emails, meta-custom-audiences, and
 * audience-row-store modules are exercised through the actual
 * runDailyAudienceRefresh -> refreshExclusions / refreshRetargeting
 * code paths. External SDKs (Stripe, fetch) are mocked at the boundary.
 *
 * Pattern follows cron-handlers.test.ts but DOES NOT mock
 * `@/modules/advertising/audiences/refresh-cycle` — that's the wholesale
 * mock the integration test is here to bypass.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHash } from 'crypto';

const { mockDb, mockFetch, mockStripeList } = vi.hoisted(() => {
  const dbChain: Record<string, ReturnType<typeof vi.fn>> = {};
  dbChain.select = vi.fn(() => dbChain);
  dbChain.from = vi.fn(() => dbChain);
  dbChain.where = vi.fn(() => dbChain);
  dbChain.limit = vi.fn(() => Promise.resolve([]));
  dbChain.insert = vi.fn(() => dbChain);
  dbChain.values = vi.fn(() => Promise.resolve());
  dbChain.update = vi.fn(() => dbChain);
  dbChain.set = vi.fn(() => dbChain);
  return {
    mockDb: dbChain,
    mockFetch: vi.fn(),
    mockStripeList: vi.fn(),
  };
});

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
vi.mock('@/shared/lib/db', () => ({ getDb: () => mockDb }));
vi.mock('@/shared/lib/stripe', () => ({
  getStripe: () => ({ subscriptions: { list: mockStripeList } }),
}));

const ORIGINAL_FETCH = global.fetch;
const CRON_SECRET = 'integration-cron-secret';

const sha256Hex = (s: string): string =>
  createHash('sha256').update(s.trim().toLowerCase()).digest('hex');

beforeEach(() => {
  // Reset chain returns between tests (vi.clearAllMocks wipes call history
  // AND impls; restore the chain so the route doesn't get raw vi.fn()s).
  for (const fn of Object.values(mockDb)) {
    (fn as ReturnType<typeof vi.fn>).mockClear();
  }
  mockDb.select.mockImplementation(() => mockDb);
  mockDb.from.mockImplementation(() => mockDb);
  mockDb.where.mockImplementation(() => mockDb);
  mockDb.limit.mockResolvedValue([]);
  mockDb.insert.mockImplementation(() => mockDb);
  mockDb.values.mockResolvedValue(undefined);
  mockDb.update.mockImplementation(() => mockDb);
  mockDb.set.mockImplementation(() => mockDb);

  mockStripeList.mockReset();
  mockFetch.mockReset();

  process.env.CRON_SECRET = CRON_SECRET;
  process.env.ADVERTISING_AGENT_ENABLED = 'true';
  process.env.META_ACCESS_TOKEN = 'tok';
  process.env.META_AD_ACCOUNT_ID = 'act_999';
  process.env.POSTHOG_PROJECT_ID = 'p1';
  process.env.POSTHOG_PERSONAL_API_KEY = 'k1';
  process.env.NEXT_PUBLIC_POSTHOG_HOST = 'https://us.posthog.com';
  global.fetch = mockFetch as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
  delete process.env.CRON_SECRET;
  delete process.env.ADVERTISING_AGENT_ENABLED;
  delete process.env.META_ACCESS_TOKEN;
  delete process.env.META_AD_ACCOUNT_ID;
  delete process.env.POSTHOG_PROJECT_ID;
  delete process.env.POSTHOG_PERSONAL_API_KEY;
  delete process.env.NEXT_PUBLIC_POSTHOG_HOST;
});

function makeRequest(): Request {
  return new Request('https://estrevia.app/api/cron/advertising/audience-refresh', {
    method: 'GET',
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  });
}

describe('audience-refresh route — real wiring (integration smoke)', () => {
  it('returns success and exercises stripe + posthog + meta + db calls', async () => {
    // Stripe returns 250 unique active subscribers (above META_MINIMUM_AUDIENCE_SIZE=100)
    const stripeRows = Array.from({ length: 250 }, (_, i) => ({
      id: `s_${i}`,
      customer: { id: `cus_${i}`, email: `paid${i}@example.com` },
    }));
    mockStripeList.mockResolvedValueOnce({ data: stripeRows, has_more: false });

    // PostHog returns empty rows for all three queries (keeps the test cheap;
    // exclusion still hits Meta because Stripe alone passes the 100 threshold).
    // Meta CA: lookup returns no existing audiences, create returns id, upload returns OK.
    let createCallCount = 0;
    mockFetch.mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
      const u = typeof url === 'string' ? url : url.toString();
      const method = (init?.method ?? 'GET').toUpperCase();

      if (u.includes('posthog.com')) {
        return new Response(JSON.stringify({ results: [] }), { status: 200 });
      }

      if (u.includes('graph.facebook.com')) {
        // Lookup is GET, create is POST to /customaudiences, upload is POST to /<id>/users
        if (method === 'GET' && u.includes('/customaudiences')) {
          return new Response(JSON.stringify({ data: [] }), { status: 200 });
        }
        if (method === 'POST' && u.includes('/customaudiences') && !u.includes('/users')) {
          createCallCount += 1;
          return new Response(JSON.stringify({ id: `aud_${createCallCount}` }), { status: 200 });
        }
        if (method === 'POST' && u.includes('/users')) {
          return new Response(JSON.stringify({ num_received: 1 }), { status: 200 });
        }
      }
      return new Response('not-found', { status: 404 });
    });

    const { GET } = await import('../audience-refresh/route');
    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      summary: { total_audiences: number; failed_audiences: number };
    };
    expect(body.success).toBe(true);
    expect(body.summary.total_audiences).toBeGreaterThan(0);
    expect(body.summary.failed_audiences).toBe(0);

    // Stripe was called
    expect(mockStripeList).toHaveBeenCalled();

    // PostHog was hit (at least one of the three HogQL queries fired)
    const posthogCalls = mockFetch.mock.calls.filter((c) =>
      String(c[0]).includes('posthog.com'),
    );
    expect(posthogCalls.length).toBeGreaterThan(0);

    // Meta lookup + at least one create + at least one users upload
    const metaCalls = mockFetch.mock.calls.filter((c) =>
      String(c[0]).includes('graph.facebook.com'),
    );
    expect(metaCalls.length).toBeGreaterThan(0);

    // DB upsert was attempted (insert OR update — first run hits insert path
    // because the lookup returns []).
    expect(mockDb.insert).toHaveBeenCalled();

    // PII safety: every email field uploaded to Meta is a 64-char SHA-256 hex,
    // never a plain-text email.
    const usersUploadCalls = mockFetch.mock.calls.filter((c) => {
      const u = String(c[0]);
      return u.includes('graph.facebook.com') && u.includes('/users');
    });
    for (const call of usersUploadCalls) {
      const init = call[1] as RequestInit;
      const body = JSON.parse(init.body as string) as {
        payload: { schema: string[]; data: string[][] };
      };
      expect(body.payload.schema).toEqual(['EMAIL']);
      for (const row of body.payload.data) {
        for (const value of row) {
          expect(value).toMatch(/^[0-9a-f]{64}$/);
          expect(value).not.toContain('@');
        }
      }
    }

    // Spot-check: alice's hash made it through if she was in the input.
    // Confirms the source -> hash -> Meta path is intact.
    const expectedHash = sha256Hex('paid0@example.com');
    const allUploadedHashes = usersUploadCalls.flatMap((c) => {
      const init = c[1] as RequestInit;
      const body = JSON.parse(init.body as string) as {
        payload: { data: string[][] };
      };
      return body.payload.data.flat();
    });
    expect(allUploadedHashes).toContain(expectedHash);
  });
});
