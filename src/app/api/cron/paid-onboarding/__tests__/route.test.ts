import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// Hoist mocks before imports (same layout as re-engagement cron test)
// ---------------------------------------------------------------------------
const sendPaidOnboardingMock = vi.hoisted(() => vi.fn());
vi.mock('@/shared/lib/email', () => ({
  sendPaidOnboardingEmail: sendPaidOnboardingMock,
}));

// db mock — candidates come from .select().from().innerJoin().where().limit()
const dbSelectMock = vi.hoisted(() => vi.fn());
vi.mock('@/shared/lib/db', () => ({
  getDb: () => ({ select: dbSelectMock }),
}));

vi.mock('@/shared/lib/cron-auth', () => ({
  assertCronAuth: vi.fn(() => null),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

import { GET } from '../route';
import { assertCronAuth } from '@/shared/lib/cron-auth';

function makeCronRequest(): Request {
  return new Request('http://localhost/api/cron/paid-onboarding', {
    method: 'GET',
    headers: { authorization: 'Bearer secret' },
  });
}

interface CandidateRow {
  userId: string;
  email: string;
  locale: 'en' | 'es';
  subscriptionId: string | null;
}

function mockCandidates(candidates: CandidateRow[]) {
  dbSelectMock.mockReturnValue({
    from: vi.fn().mockReturnValue({
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(candidates),
        }),
      }),
    }),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(assertCronAuth).mockReturnValue(null);
  sendPaidOnboardingMock.mockResolvedValue({ sent: true });
});

describe('GET /api/cron/paid-onboarding', () => {
  it('sends to each candidate with the right params and counts sent', async () => {
    mockCandidates([
      { userId: 'u1', email: 'a@x.test', locale: 'en', subscriptionId: 'sub_1' },
      { userId: 'u2', email: 'b@x.test', locale: 'es', subscriptionId: 'sub_2' },
    ]);

    const res = await GET(makeCronRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.sent).toBe(2);
    expect(body.skipped).toBe(0);
    expect(sendPaidOnboardingMock).toHaveBeenCalledWith({
      userId: 'u1',
      email: 'a@x.test',
      locale: 'en',
      subscriptionId: 'sub_1',
    });
    expect(sendPaidOnboardingMock).toHaveBeenCalledWith({
      userId: 'u2',
      email: 'b@x.test',
      locale: 'es',
      subscriptionId: 'sub_2',
    });
  });

  it('counts sender-level skips ({ sent: false }) as skipped, not sent', async () => {
    mockCandidates([
      { userId: 'u1', email: 'a@x.test', locale: 'en', subscriptionId: 'sub_1' },
    ]);
    sendPaidOnboardingMock.mockResolvedValue({ sent: false, reason: 'already_sent' });

    const res = await GET(makeCronRequest());
    const body = await res.json();

    expect(body.sent).toBe(0);
    expect(body.skipped).toBe(1);
  });

  it('isolates per-user failures — loop continues, error recorded, still 200', async () => {
    mockCandidates([
      { userId: 'u1', email: 'a@x.test', locale: 'en', subscriptionId: 'sub_1' },
      { userId: 'u2', email: 'b@x.test', locale: 'es', subscriptionId: 'sub_2' },
    ]);
    sendPaidOnboardingMock
      .mockRejectedValueOnce(new Error('Resend rejected paid_onboarding send: rate limit'))
      .mockResolvedValueOnce({ sent: true });

    const res = await GET(makeCronRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.sent).toBe(1);
    expect(body.errors).toHaveLength(1);
    expect(sendPaidOnboardingMock).toHaveBeenCalledTimes(2);
  });

  it('attempts a payer only once per run even with duplicate rows in the window', async () => {
    // Edge: a retried webhook can leave two purchase_confirmation rows.
    mockCandidates([
      { userId: 'u1', email: 'a@x.test', locale: 'en', subscriptionId: 'sub_1' },
      { userId: 'u1', email: 'a@x.test', locale: 'en', subscriptionId: 'sub_1' },
    ]);

    const res = await GET(makeCronRequest());
    const body = await res.json();

    expect(body.sent).toBe(1);
    expect(sendPaidOnboardingMock).toHaveBeenCalledTimes(1);
  });

  it('returns 401 when cron auth fails — no DB query, no sends', async () => {
    vi.mocked(assertCronAuth).mockReturnValueOnce(
      NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 }),
    );

    const res = await GET(makeCronRequest());

    expect(res.status).toBe(401);
    expect(dbSelectMock).not.toHaveBeenCalled();
    expect(sendPaidOnboardingMock).not.toHaveBeenCalled();
  });
});
