import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// Hoist mocks before imports
// ---------------------------------------------------------------------------
const sendReEngagementMock = vi.hoisted(() => vi.fn());
vi.mock('@/shared/lib/email', () => ({
  sendReEngagementEmail: sendReEngagementMock,
}));

// db mock — returns candidates from .select().from().where()
const dbSelectMock = vi.hoisted(() => vi.fn());
vi.mock('@/shared/lib/db', () => ({
  getDb: () => ({ select: dbSelectMock }),
}));

vi.mock('@/shared/lib/cron-auth', () => ({
  assertCronAuth: vi.fn(() => null),
}));

// Sentry — stub so captureException doesn't throw
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import after mocks are registered
// ---------------------------------------------------------------------------
import { GET } from '../route';
import { assertCronAuth } from '@/shared/lib/cron-auth';

// Helper to build a valid cron request
function makeCronRequest(): Request {
  return new Request('http://localhost/api/cron/re-engagement', {
    method: 'GET',
    headers: { authorization: 'Bearer secret' },
  });
}

// Helper to set up dbSelectMock to return the given candidates
function mockCandidates(
  candidates: Array<{ id: string; email: string; locale: 'en' | 'es' }>,
) {
  dbSelectMock.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(candidates),
    }),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  // Default: cron auth passes
  vi.mocked(assertCronAuth).mockReturnValue(null);
});

describe('GET /api/cron/re-engagement', () => {
  // -------------------------------------------------------------------------
  // Test 1: candidates found → sends to each, returns sent count
  // -------------------------------------------------------------------------
  it('returns 200 with correct sent count when candidates found', async () => {
    mockCandidates([
      { id: 'u1', email: 'a@x.test', locale: 'en' },
      { id: 'u2', email: 'b@x.test', locale: 'es' },
    ]);
    sendReEngagementMock.mockResolvedValue(undefined);

    const res = await GET(makeCronRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.sent).toBe(2);
    expect(body.failed).toBe(0);
    expect(sendReEngagementMock).toHaveBeenCalledTimes(2);
    expect(sendReEngagementMock).toHaveBeenCalledWith({
      userId: 'u1',
      email: 'a@x.test',
      locale: 'en',
    });
    expect(sendReEngagementMock).toHaveBeenCalledWith({
      userId: 'u2',
      email: 'b@x.test',
      locale: 'es',
    });
  });

  // -------------------------------------------------------------------------
  // Test 2: one send fails → failed++, sent counts only successes, loop continues
  // -------------------------------------------------------------------------
  it('skips failed sends (failed++), continues loop, does not abort', async () => {
    mockCandidates([
      { id: 'u1', email: 'a@x.test', locale: 'en' },
      { id: 'u2', email: 'b@x.test', locale: 'es' },
    ]);
    sendReEngagementMock
      .mockRejectedValueOnce(new Error('Resend rate limit'))
      .mockResolvedValueOnce(undefined);

    const res = await GET(makeCronRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.sent).toBe(1);
    expect(body.failed).toBe(1);
    // Both users were attempted
    expect(sendReEngagementMock).toHaveBeenCalledTimes(2);
  });

  // -------------------------------------------------------------------------
  // Test 3: cron auth fails → 401, no DB query, no emails sent
  // -------------------------------------------------------------------------
  it('returns 401 when cron auth fails', async () => {
    vi.mocked(assertCronAuth).mockReturnValueOnce(
      NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 }),
    );

    const res = await GET(makeCronRequest());

    expect(res.status).toBe(401);
    expect(sendReEngagementMock).not.toHaveBeenCalled();
    expect(dbSelectMock).not.toHaveBeenCalled();
  });
});
