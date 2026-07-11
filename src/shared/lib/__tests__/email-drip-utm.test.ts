import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock harness mirrors email-lead.test.ts, plus cart-abandon's dedup module.
type ResendResult =
  | { data: { id: string }; error: null }
  | { data: null; error: { name: string; message: string } };
const resendSendMock = vi.fn<
  (
    _payload: Record<string, unknown>,
    _opts?: Record<string, unknown>,
  ) => Promise<ResendResult>
>(async () => ({
  data: { id: 'resend_msg_utm' },
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

vi.mock('@/shared/lib/sent-cart-abandon-emails', () => ({
  hasCartAbandonSentRecently: vi.fn(async () => false),
  recordCartAbandonSent: vi.fn(async () => undefined),
}));

vi.mock('@/shared/lib/unsubscribe-token', () => ({
  signLeadUnsubscribeToken: vi.fn(async (id: string) => `tok_${id}`),
  signUnsubscribeToken: vi.fn(async (id: string) => `tok_${id}`),
}));

vi.mock('@/shared/lib/analytics', () => ({
  trackServerEvent: vi.fn(),
  AnalyticsEvent: {
    PAYWALL_TEASER_EMAIL_SENT: 'paywall_teaser_email_sent',
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  tryInsertMock.mockResolvedValue('new');
  resendSendMock.mockResolvedValue({ data: { id: 'resend_msg_utm' }, error: null });
  vi.stubEnv('RESEND_API_KEY', 're_test_key_aaaaaaaaaaaaaaaaaa');
});

const sampleChart = {
  planets: [
    { planet: 'Sun', sign: 'Capricorn', signDegree: 12.5 },
    { planet: 'Moon', sign: 'Pisces', signDegree: 3.2 },
  ],
  houses: [{ sign: 'Leo', cusp: 0 }],
} as const;

// 21 chars — must survive intact so the Stripe webhook lead-link fallback
// (/^[A-Za-z0-9_-]{21}$/ against utm_content) keeps matching.
const LEAD_ID = 'utmlead_aaaabbbbccccd';

const leadParams = {
  leadId: LEAD_ID,
  email: 'utm@example.com',
  locale: 'en' as const,
  chart: sampleChart as never,
  chartId: 'chart_utm',
};

function sentHtml(): string {
  const callArgs = resendSendMock.mock.calls[0][0] as Record<string, unknown>;
  return callArgs.html as string;
}

function expectUtm(html: string, campaign: string, template: string) {
  expect(html).toContain('utm_medium=email');
  expect(html).toContain(`utm_content=${LEAD_ID}`);
  expect(html).toContain(`utm_term=${template}`);
  expect(html).toContain(`utm_campaign=${campaign}`);
}

describe('drip CTA links carry utm_medium + utm_content=leadId + utm_term=template', () => {
  it('T+0 lead_chart', async () => {
    const { sendLeadChartEmail } = await import('../email');
    await sendLeadChartEmail(leadParams);
    expectUtm(sentHtml(), 't0', 'lead_chart');
  });

  it('T+1h lead_curiosity_hook', async () => {
    const { sendLeadCuriosityHookEmail } = await import('../email');
    await sendLeadCuriosityHookEmail(leadParams);
    expectUtm(sentHtml(), 't1h', 'lead_curiosity_hook');
  });

  it('T+24h lead_moon_asc', async () => {
    const { sendLeadMoonAscEmail } = await import('../email');
    await sendLeadMoonAscEmail(leadParams);
    expectUtm(sentHtml(), 't24h', 'lead_moon_asc');
  });

  it('T+72h lead_paywall_teaser (params live on the outer checkout URL)', async () => {
    const { sendLeadPaywallTeaserEmail } = await import('../email');
    await sendLeadPaywallTeaserEmail({ ...leadParams, variant: 'A' });
    expectUtm(sentHtml(), 't72', 'lead_paywall_teaser');
  });

  it('T+7d lead_saturn_weekly', async () => {
    const { sendLeadSaturnWeeklyEmail } = await import('../email');
    await sendLeadSaturnWeeklyEmail(leadParams);
    expectUtm(sentHtml(), 't7d', 'lead_saturn_weekly');
  });

  it('T+14d lead_mini_reading', async () => {
    const { sendLeadMiniReadingEmail } = await import('../email');
    await sendLeadMiniReadingEmail(leadParams);
    expectUtm(sentHtml(), 't14d', 'lead_mini_reading');
  });

  it('T+21d lead_synastry_teaser (sender kept for history; step retired in cron)', async () => {
    const { sendLeadSynastryTeaserEmail } = await import('../email');
    await sendLeadSynastryTeaserEmail(leadParams);
    expectUtm(sentHtml(), 't21d', 'lead_synastry_teaser');
  });

  it('cart_abandon keeps its own source/campaign and gains content + term', async () => {
    const { sendCartAbandonEmail } = await import('../email');
    await sendCartAbandonEmail({ ...leadParams, checkoutClicks: 2 });
    const html = sentHtml();
    expect(html).toContain('utm_source=cart-abandon');
    expect(html).toContain('utm_medium=email');
    expect(html).toContain('utm_campaign=cart-abandon-20off');
    expect(html).toContain(`utm_content=${LEAD_ID}`);
    expect(html).toContain('utm_term=cart_abandon');
  });

  it('homepage fallback (no chartId) also carries the full UTM set', async () => {
    const { sendLeadChartEmail } = await import('../email');
    await sendLeadChartEmail({ ...leadParams, chartId: null });
    expectUtm(sentHtml(), 't0', 'lead_chart');
  });
});
