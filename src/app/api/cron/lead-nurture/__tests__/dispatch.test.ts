import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendLeadChartEmailMock = vi.fn(async () => ({ sent: true }));
const sendLeadCuriosityHookEmailMock = vi.fn(async () => ({ sent: true }));
const sendLeadMoonAscEmailMock = vi.fn(async () => ({ sent: true }));
const sendLeadPaywallTeaserEmailMock = vi.fn(async () => ({ sent: true }));
const sendLeadSaturnWeeklyEmailMock = vi.fn(async () => ({ sent: true }));
const sendLeadMiniReadingEmailMock = vi.fn(async () => ({ sent: true }));
const sendLeadSynastryTeaserEmailMock = vi.fn(async () => ({ sent: true }));

vi.mock('@/shared/lib/email', () => ({
  sendLeadChartEmail: sendLeadChartEmailMock,
  sendLeadCuriosityHookEmail: sendLeadCuriosityHookEmailMock,
  sendLeadMoonAscEmail: sendLeadMoonAscEmailMock,
  sendLeadPaywallTeaserEmail: sendLeadPaywallTeaserEmailMock,
  sendLeadSaturnWeeklyEmail: sendLeadSaturnWeeklyEmailMock,
  sendLeadMiniReadingEmail: sendLeadMiniReadingEmailMock,
  sendLeadSynastryTeaserEmail: sendLeadSynastryTeaserEmailMock,
}));

vi.mock('@/shared/lib/cron-auth', () => ({
  assertCronAuth: vi.fn(() => null),
}));

vi.mock('@/shared/lib/temp-chart', () => ({
  fetchTempChart: vi.fn(async () => null),
}));

const updateMock = vi.fn(async () => undefined);
const selectMock = vi.fn();
vi.mock('@/shared/lib/db', () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: () => ({ limit: () => selectMock() }) }) }),
    update: () => ({ set: () => ({ where: () => updateMock() }) }),
  }),
}));

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
});

function makeLead(step: number, idSuffix: string) {
  return {
    id: `lead_${idSuffix}`,
    email: `lead-${idSuffix}@example.com`,
    locale: 'en' as 'en' | 'es',
    chartId: 'chart_x',
    nurtureStep: step,
    nurtureNextAt: new Date('2026-05-19T00:00:00Z'),
    createdAt: new Date('2026-05-18T00:00:00Z'),
  };
}

describe('cron lead-nurture dispatch (new step schema)', () => {
  it('step=0 invokes sendLeadChartEmail', async () => {
    selectMock.mockResolvedValueOnce([makeLead(0, 'a')]);
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/cron/lead-nurture', {
      headers: { authorization: 'Bearer test' },
    });
    await GET(req);
    expect(sendLeadChartEmailMock).toHaveBeenCalledTimes(1);
    expect(sendLeadCuriosityHookEmailMock).not.toHaveBeenCalled();
  });

  it('step=1 invokes sendLeadCuriosityHookEmail (NEW T+1h step)', async () => {
    selectMock.mockResolvedValueOnce([makeLead(1, 'b')]);
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/cron/lead-nurture', {
      headers: { authorization: 'Bearer test' },
    });
    await GET(req);
    expect(sendLeadCuriosityHookEmailMock).toHaveBeenCalledTimes(1);
    expect(sendLeadMoonAscEmailMock).not.toHaveBeenCalled();
  });

  it('step=2 invokes sendLeadMoonAscEmail (was step=1 in old schema)', async () => {
    selectMock.mockResolvedValueOnce([makeLead(2, 'c')]);
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/cron/lead-nurture', {
      headers: { authorization: 'Bearer test' },
    });
    await GET(req);
    expect(sendLeadMoonAscEmailMock).toHaveBeenCalledTimes(1);
  });

  it('step=3 invokes sendLeadPaywallTeaserEmail (was step=2)', async () => {
    selectMock.mockResolvedValueOnce([makeLead(3, 'd')]);
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/cron/lead-nurture', {
      headers: { authorization: 'Bearer test' },
    });
    await GET(req);
    expect(sendLeadPaywallTeaserEmailMock).toHaveBeenCalledTimes(1);
  });

  it('step=4 invokes sendLeadSaturnWeeklyEmail', async () => {
    selectMock.mockResolvedValueOnce([makeLead(4, 'e')]);
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/cron/lead-nurture', {
      headers: { authorization: 'Bearer test' },
    });
    await GET(req);
    expect(sendLeadSaturnWeeklyEmailMock).toHaveBeenCalledTimes(1);
  });

  it('step=5 invokes sendLeadMiniReadingEmail', async () => {
    selectMock.mockResolvedValueOnce([makeLead(5, 'f')]);
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/cron/lead-nurture', {
      headers: { authorization: 'Bearer test' },
    });
    await GET(req);
    expect(sendLeadMiniReadingEmailMock).toHaveBeenCalledTimes(1);
  });

  it('step=6 invokes sendLeadSynastryTeaserEmail (was step=5)', async () => {
    selectMock.mockResolvedValueOnce([makeLead(6, 'g')]);
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/cron/lead-nurture', {
      headers: { authorization: 'Bearer test' },
    });
    await GET(req);
    expect(sendLeadSynastryTeaserEmailMock).toHaveBeenCalledTimes(1);
  });

  it('step=7 is terminal — no send invoked, lead skipped', async () => {
    selectMock.mockResolvedValueOnce([makeLead(7, 'h')]);
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/cron/lead-nurture', {
      headers: { authorization: 'Bearer test' },
    });
    const res = await GET(req);
    const body = await res.json();
    expect(body.sent).toBe(0);
    expect(sendLeadChartEmailMock).not.toHaveBeenCalled();
    expect(sendLeadCuriosityHookEmailMock).not.toHaveBeenCalled();
  });
});
