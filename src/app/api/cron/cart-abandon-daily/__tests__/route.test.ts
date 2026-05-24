import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks set up before module imports
// ---------------------------------------------------------------------------

vi.mock('@/shared/lib/cron-auth', () => ({
  assertCronAuth: vi.fn(() => null), // null = auth ok
}));

vi.mock('@/shared/lib/temp-chart', () => ({
  fetchTempChart: vi.fn(async () => ({
    planets: [{ planet: 'Saturn', sign: 'Capricorn', degree: 15 }],
    houses: null,
  })),
}));

const sendCartAbandonMock = vi.fn(async () => ({ sent: true }));
vi.mock('@/shared/lib/email', () => ({
  sendCartAbandonEmail: sendCartAbandonMock,
}));

vi.mock('@/modules/advertising/audiences/cart-abandon-cohort', () => ({
  getCartAbandonCohort: vi.fn(async () => [
    { email: 'hot@example.com', lastPaywallAt: new Date(), checkoutClicks: 1 },
    { email: 'warm@example.com', lastPaywallAt: new Date(), checkoutClicks: 0 },
  ]),
}));

// DB mock — select returns leads from fixture, update is no-op
interface FakeLead {
  id: string;
  email: string;
  locale: 'en' | 'es';
  chartId: string | null;
}

let dbLeads: FakeLead[] = [
  { id: 'lead_hot', email: 'hot@example.com', locale: 'en', chartId: 'chart_1' },
  { id: 'lead_warm', email: 'warm@example.com', locale: 'es', chartId: null },
];

// hasCartAbandonSentRecently — controls frequency cap
const hasCartAbandonSentRecentlyMock = vi.fn(async () => false);
vi.mock('@/shared/lib/sent-cart-abandon-emails', () => ({
  hasCartAbandonSentRecently: hasCartAbandonSentRecentlyMock,
  recordCartAbandonSent: vi.fn(async () => {}),
}));

vi.mock('@/shared/lib/db', () => ({
  getDb: () => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          // Returns leads matching the cohort emails
          then: vi.fn(),
          // Async iterator pattern — return all dbLeads
          [Symbol.asyncIterator]: async function* () {
            for (const l of dbLeads) yield l;
          },
        })),
      })),
    })),
  }),
}));

// Patch DB select to return dbLeads directly (simpler than async iterator)
vi.mock('@/shared/lib/db', () => ({
  getDb: () => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(async () => dbLeads),
      })),
    })),
  }),
}));

vi.stubEnv('CART_ABANDON_DRY_RUN', 'false');

beforeEach(() => {
  dbLeads = [
    { id: 'lead_hot', email: 'hot@example.com', locale: 'en', chartId: 'chart_1' },
    { id: 'lead_warm', email: 'warm@example.com', locale: 'es', chartId: null },
  ];
  vi.clearAllMocks();
  // Re-stub mocks that were cleared
  hasCartAbandonSentRecentlyMock.mockResolvedValue(false);
  sendCartAbandonMock.mockResolvedValue({ sent: true });
});

describe('/api/cron/cart-abandon-daily', () => {
  it('DRY_RUN=true skips Resend call and returns dryRun:true', async () => {
    vi.stubEnv('CART_ABANDON_DRY_RUN', 'true');
    const { GET } = await import('../route');
    const res = await GET(new Request('http://localhost/api/cron/cart-abandon-daily'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.dryRun).toBe(true);
    expect(sendCartAbandonMock).not.toHaveBeenCalled();
    vi.stubEnv('CART_ABANDON_DRY_RUN', 'false');
  });

  it('already-sent lead is skipped (frequency cap)', async () => {
    hasCartAbandonSentRecentlyMock.mockResolvedValue(true); // already sent to both
    const { GET } = await import('../route');
    const res = await GET(new Request('http://localhost/api/cron/cart-abandon-daily'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.skipped).toBeGreaterThan(0);
    expect(sendCartAbandonMock).not.toHaveBeenCalled();
  });

  it('sends to eligible leads when not already sent', async () => {
    hasCartAbandonSentRecentlyMock.mockResolvedValue(false);
    const { GET } = await import('../route');
    const res = await GET(new Request('http://localhost/api/cron/cart-abandon-daily'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sent).toBeGreaterThan(0);
    expect(sendCartAbandonMock).toHaveBeenCalled();
  });

  it('idempotency — second run skips already-sent leads', async () => {
    hasCartAbandonSentRecentlyMock
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true); // all subsequent calls = already sent

    const { GET } = await import('../route');
    // First run
    await GET(new Request('http://localhost/api/cron/cart-abandon-daily'));
    const sentFirst = sendCartAbandonMock.mock.calls.length;

    // Second run — now hasCartAbandonSentRecently returns true for all
    await GET(new Request('http://localhost/api/cron/cart-abandon-daily'));
    const sentSecond = sendCartAbandonMock.mock.calls.length - sentFirst;

    expect(sentFirst).toBeGreaterThan(0);
    expect(sentSecond).toBe(0);
  });

  it('returns 401 when cron auth fails', async () => {
    const { assertCronAuth } = await import('@/shared/lib/cron-auth');
    (assertCronAuth as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      new Response('Unauthorized', { status: 401 }),
    );
    const { GET } = await import('../route');
    const res = await GET(new Request('http://localhost/api/cron/cart-abandon-daily'));
    expect(res.status).toBe(401);
  });

  it('returns 200 summary with cohort and sent counts', async () => {
    const { GET } = await import('../route');
    const res = await GET(new Request('http://localhost/api/cron/cart-abandon-daily'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      dryRun: false,
      durationMs: expect.any(Number),
    });
    expect(typeof json.sent).toBe('number');
    expect(typeof json.skipped).toBe('number');
    expect(typeof json.failed).toBe('number');
  });
});
