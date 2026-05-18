import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock cron-auth so requests pass through
vi.mock('@/shared/lib/cron-auth', () => ({
  assertCronAuth: vi.fn(() => null), // null = auth ok
}));

// Mock fetchTempChart
vi.mock('@/shared/lib/temp-chart', () => ({
  fetchTempChart: vi.fn(async () => ({ planets: [], houses: null })),
}));

// Mock send functions
const sendChartMock = vi.fn(async () => ({ sent: true }));
const sendMoonAscMock = vi.fn(async () => ({ sent: true }));
const sendPaywallMock = vi.fn(async () => ({ sent: true }));
const sendSaturnMock = vi.fn(async () => ({ sent: true }));
const sendMiniReadingMock = vi.fn(async () => ({ sent: true }));
const sendSynastryMock = vi.fn(async () => ({ sent: true }));
vi.mock('@/shared/lib/email', () => ({
  sendLeadChartEmail: sendChartMock,
  sendLeadMoonAscEmail: sendMoonAscMock,
  sendLeadPaywallTeaserEmail: sendPaywallMock,
  sendLeadSaturnWeeklyEmail: sendSaturnMock,
  sendLeadMiniReadingEmail: sendMiniReadingMock,
  sendLeadSynastryTeaserEmail: sendSynastryMock,
}));

// Mock DB
interface FakeLead {
  id: string;
  email: string;
  locale: 'en' | 'es';
  chartId: string | null;
  nurtureStep: number;
  nurtureNextAt: Date | null;
  createdAt: Date;
}
let candidates: FakeLead[] = [];
const selectMock = vi.fn(() => ({
  from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn(async () => candidates) })) })),
}));
const updates: Array<{ id: string; vals: Record<string, unknown> }> = [];
const updateMock = vi.fn(() => ({
  set: vi.fn((vals) => ({
    where: vi.fn(async () => {
      // Capture which lead was updated (very approximate — depends on impl)
      updates.push({ id: 'captured', vals });
    }),
  })),
}));

vi.mock('@/shared/lib/db', () => ({
  getDb: () => ({ select: selectMock, update: updateMock }),
}));

beforeEach(() => {
  candidates = [];
  updates.length = 0;
  vi.clearAllMocks();
});

describe('/api/cron/lead-nurture', () => {
  it('returns 401 when cron auth fails', async () => {
    const { assertCronAuth } = await import('@/shared/lib/cron-auth');
    (assertCronAuth as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      new Response('Unauthorized', { status: 401 }),
    );
    const { GET } = await import('../route');
    const res = await GET(new Request('http://localhost/api/cron/lead-nurture'));
    expect(res.status).toBe(401);
  });

  it('returns 200 with zero candidates summary when empty', async () => {
    const { GET } = await import('../route');
    const res = await GET(new Request('http://localhost/api/cron/lead-nurture'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ candidates: 0, sent: 0, failed: 0 });
  });

  it('dispatches to sendLeadMoonAscEmail when step=1 and due', async () => {
    candidates = [{
      id: 'lead_s1',
      email: 's1@example.com',
      locale: 'en',
      chartId: 'chart_s1',
      nurtureStep: 1,
      nurtureNextAt: new Date(Date.now() - 60_000),
      createdAt: new Date(Date.now() - 25 * 3600_000),
    }];
    const { GET } = await import('../route');
    const res = await GET(new Request('http://localhost/api/cron/lead-nurture'));
    expect(res.status).toBe(200);
    expect(sendMoonAscMock).toHaveBeenCalledTimes(1);
    expect(sendChartMock).not.toHaveBeenCalled();
    expect(sendPaywallMock).not.toHaveBeenCalled();
  });

  it('dispatches to sendLeadPaywallTeaserEmail when step=2 and due', async () => {
    candidates = [{
      id: 'lead_s2',
      email: 's2@example.com',
      locale: 'en',
      chartId: 'chart_s2',
      nurtureStep: 2,
      nurtureNextAt: new Date(Date.now() - 60_000),
      createdAt: new Date(Date.now() - 73 * 3600_000),
    }];
    const { GET } = await import('../route');
    await GET(new Request('http://localhost/api/cron/lead-nurture'));
    expect(sendPaywallMock).toHaveBeenCalledTimes(1);
  });

  it('dispatches T+0 recovery to sendLeadChartEmail when step=0 stuck', async () => {
    candidates = [{
      id: 'lead_stuck',
      email: 'stuck@example.com',
      locale: 'en',
      chartId: null,
      nurtureStep: 0,
      nurtureNextAt: null,
      createdAt: new Date(Date.now() - 20 * 60_000),  // 20 min ago > 15min threshold
    }];
    const { GET } = await import('../route');
    await GET(new Request('http://localhost/api/cron/lead-nurture'));
    expect(sendChartMock).toHaveBeenCalledTimes(1);
  });

  it('isolates per-lead error and continues', async () => {
    sendMoonAscMock.mockRejectedValueOnce(new Error('Resend 5xx'));
    candidates = [
      { id: 'lead_fail', email: 'fail@example.com', locale: 'en', chartId: 'c1', nurtureStep: 1, nurtureNextAt: new Date(Date.now() - 60_000), createdAt: new Date(Date.now() - 25 * 3600_000) },
      { id: 'lead_ok', email: 'ok@example.com', locale: 'en', chartId: 'c2', nurtureStep: 1, nurtureNextAt: new Date(Date.now() - 60_000), createdAt: new Date(Date.now() - 25 * 3600_000) },
    ];
    const { GET } = await import('../route');
    const res = await GET(new Request('http://localhost/api/cron/lead-nurture'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.failed).toBe(1);
    expect(json.sent).toBe(1);
  });

  it('advances step 2 → 3 after T+72h teaser send and schedules T+7d (~96h later)', async () => {
    candidates = [{
      id: 'lead_s2_to_3',
      email: 's2@example.com',
      locale: 'en',
      chartId: 'chart_s2',
      nurtureStep: 2,
      nurtureNextAt: new Date(Date.now() - 60_000),
      createdAt: new Date(Date.now() - 73 * 3600_000),
    }];
    const before = Date.now();
    const { GET } = await import('../route');
    await GET(new Request('http://localhost/api/cron/lead-nurture'));
    const after = Date.now();
    expect(sendPaywallMock).toHaveBeenCalledTimes(1);
    expect(updates).toHaveLength(1);
    const update = updates[0]!;
    expect(update.vals.nurtureStep).toBe(3);
    const scheduled = (update.vals.nurtureNextAt as Date).getTime();
    expect(scheduled).toBeGreaterThanOrEqual(before + 96 * 3600_000);
    expect(scheduled).toBeLessThanOrEqual(after + 96 * 3600_000);
  });

  it('dispatches to sendLeadSaturnWeeklyEmail when step=3 and due', async () => {
    candidates = [{
      id: 'lead_s3',
      email: 's3@example.com',
      locale: 'en',
      chartId: 'chart_s3',
      nurtureStep: 3,
      nurtureNextAt: new Date(Date.now() - 60_000),
      createdAt: new Date(Date.now() - 170 * 3600_000),
    }];
    const before = Date.now();
    const { GET } = await import('../route');
    await GET(new Request('http://localhost/api/cron/lead-nurture'));
    expect(sendSaturnMock).toHaveBeenCalledTimes(1);
    expect(sendChartMock).not.toHaveBeenCalled();
    expect(sendMoonAscMock).not.toHaveBeenCalled();
    expect(sendPaywallMock).not.toHaveBeenCalled();
    expect(sendMiniReadingMock).not.toHaveBeenCalled();
    expect(sendSynastryMock).not.toHaveBeenCalled();
    expect(updates).toHaveLength(1);
    expect(updates[0]!.vals.nurtureStep).toBe(4);
    const scheduled = (updates[0]!.vals.nurtureNextAt as Date).getTime();
    expect(scheduled).toBeGreaterThanOrEqual(before + 168 * 3600_000);
  });

  it('dispatches to sendLeadMiniReadingEmail when step=4 and due', async () => {
    candidates = [{
      id: 'lead_s4',
      email: 's4@example.com',
      locale: 'en',
      chartId: 'chart_s4',
      nurtureStep: 4,
      nurtureNextAt: new Date(Date.now() - 60_000),
      createdAt: new Date(Date.now() - 340 * 3600_000),
    }];
    const before = Date.now();
    const { GET } = await import('../route');
    await GET(new Request('http://localhost/api/cron/lead-nurture'));
    expect(sendMiniReadingMock).toHaveBeenCalledTimes(1);
    expect(updates).toHaveLength(1);
    expect(updates[0]!.vals.nurtureStep).toBe(5);
    const scheduled = (updates[0]!.vals.nurtureNextAt as Date).getTime();
    expect(scheduled).toBeGreaterThanOrEqual(before + 168 * 3600_000);
  });

  it('dispatches to sendLeadSynastryTeaserEmail when step=5 and due (final state)', async () => {
    candidates = [{
      id: 'lead_s5',
      email: 's5@example.com',
      locale: 'en',
      chartId: 'chart_s5',
      nurtureStep: 5,
      nurtureNextAt: new Date(Date.now() - 60_000),
      createdAt: new Date(Date.now() - 508 * 3600_000),
    }];
    const { GET } = await import('../route');
    await GET(new Request('http://localhost/api/cron/lead-nurture'));
    expect(sendSynastryMock).toHaveBeenCalledTimes(1);
    expect(updates).toHaveLength(1);
    expect(updates[0]!.vals.nurtureStep).toBe(6);
    expect(updates[0]!.vals.nurtureNextAt).toBeNull();
  });

  it('does NOT advance step when sendLeadMiniReadingEmail throws (Sev1 regression)', async () => {
    sendMiniReadingMock.mockRejectedValueOnce(new Error('Resend rejected lead_mini_reading'));
    candidates = [{
      id: 'lead_s4_fail',
      email: 'fail@example.com',
      locale: 'en',
      chartId: 'chart_s4_fail',
      nurtureStep: 4,
      nurtureNextAt: new Date(Date.now() - 60_000),
      createdAt: new Date(Date.now() - 340 * 3600_000),
    }];
    const { GET } = await import('../route');
    const res = await GET(new Request('http://localhost/api/cron/lead-nurture'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.failed).toBe(1);
    expect(json.sent).toBe(0);
    expect(updates).toHaveLength(0);
  });
});
