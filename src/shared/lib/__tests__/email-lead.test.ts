import { describe, it, expect, vi, beforeEach } from 'vitest';

type ResendResult =
  | { data: { id: string }; error: null }
  | { data: null; error: { name: string; message: string } };
const resendSendMock = vi.fn<
  (
    _payload: Record<string, unknown>,
    _opts?: Record<string, unknown>,
  ) => Promise<ResendResult>
>(async () => ({
  data: { id: 'resend_msg_123' },
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
  resendSendMock.mockResolvedValue({ data: { id: 'resend_msg_123' }, error: null });
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
    expect(recordSentMock).toHaveBeenCalledWith('lead_1', 'lead_chart', 'resend_msg_123');
    const callArgs = resendSendMock.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.to).toBe('test@example.com');
    expect((callArgs.subject as string).toLowerCase()).toContain('sidereal');
    expect(callArgs.headers).toMatchObject({ 'List-Unsubscribe': expect.stringContaining('tok_lead_1') });
    // Cliffhanger: T+0 reveals Sun but withholds Moon sign and Ascendant.
    expect(callArgs.html).toContain('Capricorn');     // Sun sign — revealed
    expect(callArgs.html).not.toContain('Pisces');    // Moon sign — withheld
    expect(callArgs.html).not.toContain('Leo');       // Ascendant sign — withheld
    // Hidden-planet tease: name only, no sign reveal.
    // sampleChart has no Saturn/Mars/Venus in essential dignity, so picker
    // falls back to Mercury — verify Mercury mentioned but not its sign.
    expect((callArgs.html as string).toLowerCase()).toContain('mercury');
  });

  it("returns sent:false reason already_sent when claim is 'delivered'", async () => {
    tryInsertMock.mockResolvedValueOnce('delivered');
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

  it("proceeds with send when claim is 'retry' (prior send failed)", async () => {
    tryInsertMock.mockResolvedValueOnce('retry');
    const { sendLeadChartEmail } = await import('../email');
    const res = await sendLeadChartEmail({
      leadId: 'lead_retry',
      email: 'retry@example.com',
      locale: 'en',
      chart: sampleChart as never,
      chartId: 'chart_r',
    });
    expect(res.sent).toBe(true);
    expect(resendSendMock).toHaveBeenCalledTimes(1);
    expect(recordSentMock).toHaveBeenCalledWith('lead_retry', 'lead_chart', 'resend_msg_123');
  });

  it('throws when Resend returns result.error (does not falsely report success)', async () => {
    resendSendMock.mockResolvedValueOnce({
      data: null,
      error: { name: 'rate_limit_exceeded', message: 'Too many requests' },
    });
    const { sendLeadChartEmail } = await import('../email');
    await expect(
      sendLeadChartEmail({
        leadId: 'lead_err',
        email: 'err@example.com',
        locale: 'en',
        chart: sampleChart as never,
        chartId: 'chart_err',
      }),
    ).rejects.toThrow(/Resend rejected lead_chart for lead_err.*Too many requests/);
    expect(recordSentMock).not.toHaveBeenCalled();
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
    expect(callArgs.html).toBeTruthy();
  });

  it('shows fallback path (no Moon/Asc tease) when chart has no houses (knowsBirthTime=false)', async () => {
    // When hasAscSign=false AND hasMoonSign=true, showCliffhanger still fires
    // (sunSign && (hasMoonSign || hasAscSign)). So Sun is revealed, Moon sign
    // is withheld (cliffhanger), and the moonAscTease phrase is shown.
    // The sign name "Leo" should NOT appear in the email body (withheld).
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
    expect(callArgs.html).toContain('Aries');   // Sun revealed
    expect(callArgs.html).not.toContain('Leo'); // Moon sign withheld (cliffhanger)
    // Anchor the negative assertion: ensure dominant planet name is present
    // so the test fails clearly if any sign-revealing copy is added.
    expect((callArgs.html as string).toLowerCase()).toContain('mercury');
    expect((callArgs.html as string).toLowerCase()).not.toContain('your rising in');
  });
});

describe('sendLeadMoonAscEmail', () => {
  it('sends T+24h with Moon insight + chart CTA (AI-reading teaser)', async () => {
    const { sendLeadMoonAscEmail } = await import('../email');
    const res = await sendLeadMoonAscEmail({
      leadId: 'lead_m24',
      email: 't24@example.com',
      locale: 'en',
      chart: sampleChart as never,
      chartId: 'chart_m24',
    });
    expect(res.sent).toBe(true);
    expect(tryInsertMock).toHaveBeenCalledWith('lead_m24', 'lead_moon_asc');
    const callArgs = resendSendMock.mock.calls[0][0] as Record<string, unknown>;
    expect((callArgs.subject as string).toLowerCase()).toContain('moon');
    expect(callArgs.html).toContain('Pisces');
    // CTA now points to /chart (paywall surface), NOT /sign-up.
    expect(callArgs.html).toContain('/chart?chartId=');
    expect(callArgs.html).toContain('utm_campaign=t24h');
    expect(callArgs.html).not.toContain('/sign-up');
    // AI-reading teaser copy mentions "full reading" or "AI"
    expect((callArgs.html as string).toLowerCase()).toMatch(/ai analysis|ai reading|generated/);
  });

  it("dedups on 'delivered' claim", async () => {
    tryInsertMock.mockResolvedValueOnce('delivered');
    const { sendLeadMoonAscEmail } = await import('../email');
    const res = await sendLeadMoonAscEmail({
      leadId: 'lead_m24_dup',
      email: 'dup@example.com',
      locale: 'en',
      chart: sampleChart as never,
      chartId: 'chart_x',
    });
    expect(res.sent).toBe(false);
    expect(resendSendMock).not.toHaveBeenCalled();
  });

  it('throws when Resend returns result.error', async () => {
    resendSendMock.mockResolvedValueOnce({
      data: null,
      error: { name: 'invalid_recipient', message: 'Bounced address' },
    });
    const { sendLeadMoonAscEmail } = await import('../email');
    await expect(
      sendLeadMoonAscEmail({
        leadId: 'lead_m24_err',
        email: 'bounced@example.com',
        locale: 'en',
        chart: sampleChart as never,
        chartId: 'chart_e',
      }),
    ).rejects.toThrow(/Resend rejected lead_moon_asc/);
  });

  it('falls back to homepage URL when chartId is null', async () => {
    const { sendLeadMoonAscEmail } = await import('../email');
    await sendLeadMoonAscEmail({
      leadId: 'lead_no_chart',
      email: 'nochart@example.com',
      locale: 'en',
      chart: sampleChart as never,
      chartId: null,
    });
    const callArgs = resendSendMock.mock.calls[0][0] as Record<string, unknown>;
    // Fallback URL points to homepage, not /chart, but still carries the utm tag
    expect(callArgs.html).toContain('utm_campaign=t24h');
    expect(callArgs.html).not.toContain('chart?chartId=');
    expect(callArgs.html).not.toContain('/sign-up');
  });
});

describe('sendLeadPaywallTeaserEmail', () => {
  it('sends T+72h with AI reading teaser + trial CTA', async () => {
    const { sendLeadPaywallTeaserEmail } = await import('../email');
    const res = await sendLeadPaywallTeaserEmail({
      leadId: 'lead_t72',
      email: 't72@example.com',
      locale: 'en',
      chart: sampleChart as never,
      chartId: 'chart_t72',
    });
    expect(res.sent).toBe(true);
    expect(tryInsertMock).toHaveBeenCalledWith('lead_t72', 'lead_paywall_teaser');
    const callArgs = resendSendMock.mock.calls[0][0] as Record<string, unknown>;
    expect((callArgs.subject as string).toLowerCase()).toMatch(/reading|capricorn/);
    expect((callArgs.html as string).toLowerCase()).toMatch(/trial|free/);
    expect(callArgs.html).toContain('checkout/start');
  });

  it("dedups on 'delivered' claim", async () => {
    tryInsertMock.mockResolvedValueOnce('delivered');
    const { sendLeadPaywallTeaserEmail } = await import('../email');
    const res = await sendLeadPaywallTeaserEmail({
      leadId: 'lead_t72_dup',
      email: 'dup@example.com',
      locale: 'en',
      chart: sampleChart as never,
      chartId: 'chart_x',
    });
    expect(res.sent).toBe(false);
    expect(resendSendMock).not.toHaveBeenCalled();
  });

  it('throws when Resend returns result.error', async () => {
    resendSendMock.mockResolvedValueOnce({
      data: null,
      error: { name: 'domain_unverified', message: 'Domain not verified' },
    });
    const { sendLeadPaywallTeaserEmail } = await import('../email');
    await expect(
      sendLeadPaywallTeaserEmail({
        leadId: 'lead_t72_err',
        email: 'err@example.com',
        locale: 'en',
        chart: sampleChart as never,
        chartId: 'chart_p',
      }),
    ).rejects.toThrow(/Resend rejected lead_paywall_teaser/);
  });
});
