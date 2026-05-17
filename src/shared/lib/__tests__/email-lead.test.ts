import { describe, it, expect, vi, beforeEach } from 'vitest';

const resendSendMock = vi.fn(
  async (_payload: Record<string, unknown>, _opts?: Record<string, unknown>) => ({
    data: { id: 'resend_msg_123' },
    error: null,
  }),
);
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: resendSendMock };
  },
}));

const tryInsertMock = vi.fn(async () => true);
const recordSentMock = vi.fn(async () => undefined);
vi.mock('@/shared/lib/sent-lead-emails', () => ({
  tryInsertOneShotLead: tryInsertMock,
  recordSentLead: recordSentMock,
}));

vi.mock('@/shared/lib/unsubscribe-token', () => ({
  signLeadUnsubscribeToken: vi.fn(async (id: string) => `tok_${id}`),
}));

beforeEach(() => {
  vi.clearAllMocks();
  tryInsertMock.mockResolvedValue(true);
  vi.stubEnv('RESEND_API_KEY', 're_test_key_aaaaaaaaaaaaaaaaaa');
});

const sampleChart = {
  planets: [
    { planet: 'Sun', sign: 'Capricorn', signDegree: 12.5 },
    { planet: 'Moon', sign: 'Pisces', signDegree: 3.2 },
  ],
  houses: [{ sign: 'Leo', cusp: 0 }],
} as const;

describe('sendLeadChartEmail', () => {
  it('returns sent:true on first call (happy path EN)', async () => {
    const { sendLeadChartEmail } = await import('../email');
    const res = await sendLeadChartEmail({
      leadId: 'lead_1',
      email: 'test@example.com',
      locale: 'en',
      chart: sampleChart as never,
      chartId: 'chart_abc',
    });
    expect(res.sent).toBe(true);
    expect(tryInsertMock).toHaveBeenCalledWith('lead_1', 'lead_chart');
    expect(resendSendMock).toHaveBeenCalledTimes(1);
    const callArgs = resendSendMock.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.to).toBe('test@example.com');
    expect((callArgs.subject as string).toLowerCase()).toContain('sidereal');
    expect(callArgs.html).toContain('Capricorn');
    expect(callArgs.headers).toMatchObject({ 'List-Unsubscribe': expect.stringContaining('tok_lead_1') });
  });

  it('returns sent:false reason already_sent on conflict', async () => {
    tryInsertMock.mockResolvedValueOnce(false);
    const { sendLeadChartEmail } = await import('../email');
    const res = await sendLeadChartEmail({
      leadId: 'lead_dup',
      email: 'dup@example.com',
      locale: 'en',
      chart: sampleChart as never,
      chartId: 'chart_x',
    });
    expect(res.sent).toBe(false);
    expect(res.reason).toBe('already_sent');
    expect(resendSendMock).not.toHaveBeenCalled();
  });

  it('uses ES subject + body for locale=es', async () => {
    const { sendLeadChartEmail } = await import('../email');
    await sendLeadChartEmail({
      leadId: 'lead_es',
      email: 'es@example.com',
      locale: 'es',
      chart: sampleChart as never,
      chartId: 'chart_y',
    });
    const callArgs = resendSendMock.mock.calls[0][0] as Record<string, unknown>;
    expect((callArgs.subject as string).toLowerCase()).toContain('sideral');
  });

  it('falls back to generic copy when chart is null', async () => {
    const { sendLeadChartEmail } = await import('../email');
    await sendLeadChartEmail({
      leadId: 'lead_no_chart',
      email: 'nochart@example.com',
      locale: 'en',
      chart: null,
      chartId: null,
    });
    const callArgs = resendSendMock.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.html).not.toContain('Capricorn');
    // Should still send, just less personalized
    expect(callArgs.html).toBeTruthy();
  });

  it('skips Ascendant line when chart has no houses (knowsBirthTime=false)', async () => {
    const noTimeChart = {
      planets: [
        { planet: 'Sun', sign: 'Aries', signDegree: 5 },
        { planet: 'Moon', sign: 'Leo', signDegree: 20 },
      ],
      houses: null,
    };
    const { sendLeadChartEmail } = await import('../email');
    await sendLeadChartEmail({
      leadId: 'lead_notime',
      email: 'notime@example.com',
      locale: 'en',
      chart: noTimeChart as never,
      chartId: 'chart_z',
    });
    const callArgs = resendSendMock.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.html).toContain('Aries');
    expect(callArgs.html).toContain('Leo');
    // No Ascendant teaser line ("Your Rising in <sign>") should render
    expect((callArgs.html as string).toLowerCase()).not.toContain('your rising in');
    expect((callArgs.html as string).toLowerCase()).not.toContain('ascendant');
  });
});
