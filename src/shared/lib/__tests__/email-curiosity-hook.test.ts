import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

type ResendResult =
  | { data: { id: string }; error: null }
  | { data: null; error: { name: string; message: string } };
const resendSendMock = vi.fn<
  (
    _payload: Record<string, unknown>,
    _opts?: Record<string, unknown>,
  ) => Promise<ResendResult>
>(async () => ({
  data: { id: 'resend_msg_curiosity' },
  error: null,
}));
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: resendSendMock };
  },
}));

const tryInsertMock = vi.fn(async () => 'new' as 'new' | 'retry' | 'delivered');
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
  tryInsertMock.mockResolvedValue('new');
  resendSendMock.mockResolvedValue({ data: { id: 'resend_msg_curiosity' }, error: null });
  vi.stubEnv('RESEND_API_KEY', 're_test_key_aaaaaaaaaaaaaaaaaa');
});

const saturnChart = {
  planets: [
    { planet: 'Saturn', sign: 'Capricorn', signDegree: 5 },
    { planet: 'Sun', sign: 'Leo', signDegree: 15 },
  ],
  houses: null,
} as const;

describe('sendLeadCuriosityHookEmail', () => {
  it('sends curiosity-hook email with Saturn-Capricorn reveal (EN)', async () => {
    const { sendLeadCuriosityHookEmail } = await import('../email');
    const res = await sendLeadCuriosityHookEmail({
      leadId: 'lead_c1',
      email: 'test@example.com',
      locale: 'en',
      chart: saturnChart as never,
      chartId: 'chart_c1',
    });
    expect(res.sent).toBe(true);
    expect(tryInsertMock).toHaveBeenCalledWith('lead_c1', 'lead_curiosity_hook');
    expect(recordSentMock).toHaveBeenCalledWith('lead_c1', 'lead_curiosity_hook', 'resend_msg_curiosity');
    const callArgs = resendSendMock.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.to).toBe('test@example.com');
    expect(callArgs.subject as string).toContain('Saturn');
    expect(callArgs.html).toContain('Capricorn');
    expect(callArgs.html).toContain('chartId=chart_c1');
    expect(callArgs.html).toContain('utm_campaign=t1h');
    expect(callArgs.headers).toMatchObject({ 'List-Unsubscribe': expect.stringContaining('tok_lead_c1') });
  });

  it('uses ES locale strings when locale=es', async () => {
    const { sendLeadCuriosityHookEmail } = await import('../email');
    await sendLeadCuriosityHookEmail({
      leadId: 'lead_c2',
      email: 'es@example.com',
      locale: 'es',
      chart: saturnChart as never,
      chartId: 'chart_c2',
    });
    const callArgs = resendSendMock.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.subject as string).toContain('Saturno');
    expect(callArgs.html).toContain('Capricornio');
    expect(callArgs.html).toContain('utm_campaign=t1h');
  });

  it("returns reason already_sent when claim is 'delivered'", async () => {
    tryInsertMock.mockResolvedValueOnce('delivered');
    const { sendLeadCuriosityHookEmail } = await import('../email');
    const res = await sendLeadCuriosityHookEmail({
      leadId: 'lead_dup',
      email: 'dup@example.com',
      locale: 'en',
      chart: saturnChart as never,
      chartId: 'chart_x',
    });
    expect(res.sent).toBe(false);
    expect(res.reason).toBe('already_sent');
    expect(resendSendMock).not.toHaveBeenCalled();
  });

  it('throws when Resend returns result.error (does not falsely report success)', async () => {
    resendSendMock.mockResolvedValueOnce({
      data: null,
      error: { name: 'validation_error', message: 'suppressed recipient' },
    });
    const { sendLeadCuriosityHookEmail } = await import('../email');
    await expect(
      sendLeadCuriosityHookEmail({
        leadId: 'lead_err',
        email: 'bad@example.com',
        locale: 'en',
        chart: saturnChart as never,
        chartId: 'chart_e',
      }),
    ).rejects.toThrow(/Resend rejected/);
    expect(recordSentMock).not.toHaveBeenCalled();
  });

  it('uses Mercury/Gemini fallback when chart is null', async () => {
    const { sendLeadCuriosityHookEmail } = await import('../email');
    await sendLeadCuriosityHookEmail({
      leadId: 'lead_null',
      email: 'null@example.com',
      locale: 'en',
      chart: null,
      chartId: null,
    });
    const callArgs = resendSendMock.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.subject as string).toContain('Mercury');
    expect(callArgs.html).toContain('Mercury');
    expect(callArgs.html).toContain('Gemini');
  });

  it("proceeds with send when claim is 'retry' (prior send failed)", async () => {
    tryInsertMock.mockResolvedValueOnce('retry');
    const { sendLeadCuriosityHookEmail } = await import('../email');
    const res = await sendLeadCuriosityHookEmail({
      leadId: 'lead_retry',
      email: 'retry@example.com',
      locale: 'en',
      chart: saturnChart as never,
      chartId: 'chart_r',
    });
    expect(res.sent).toBe(true);
    expect(resendSendMock).toHaveBeenCalledTimes(1);
    expect(recordSentMock).toHaveBeenCalledWith('lead_retry', 'lead_curiosity_hook', 'resend_msg_curiosity');
  });
});
