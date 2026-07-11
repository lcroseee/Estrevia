import { describe, it, expect, vi, beforeEach } from 'vitest';

// email.ts imports * as Sentry at module scope — mock it like every sibling
// test (email-curiosity-hook.test.ts:3) so importing '../email' never loads
// the real SDK.
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
  data: { id: 'resend_msg_123' },
  error: null,
}));
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: resendSendMock };
  },
}));

const wasSentWithinMock = vi.fn(async () => false);
const recordSentMock = vi.fn(async () => undefined);
vi.mock('@/shared/lib/sent-emails', () => ({
  tryInsertOneShot: vi.fn(async () => true),
  recordSent: recordSentMock,
  wasSentWithin: wasSentWithinMock,
}));

vi.mock('@/shared/lib/unsubscribe-token', () => ({
  signUnsubscribeToken: vi.fn(async (id: string) => `tok_${id}`),
  signLeadUnsubscribeToken: vi.fn(async (id: string) => `tok_${id}`),
}));

vi.mock('@/shared/lib/analytics', () => ({
  trackServerEvent: vi.fn(),
  AnalyticsEvent: new Proxy({}, { get: (_t, k) => String(k) }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  wasSentWithinMock.mockResolvedValue(false);
  resendSendMock.mockResolvedValue({ data: { id: 'resend_msg_123' }, error: null });
  vi.stubEnv('RESEND_API_KEY', 're_test_key_aaaaaaaaaaaaaaaaaa');
  vi.stubEnv('DRY_RUN', 'false');
});

const params = {
  userId: 'user_1',
  email: 'payer@example.com',
  locale: 'en' as const,
  subscriptionId: 'sub_123',
};

describe('sendPaidOnboardingEmail', () => {
  it('sends with a stable idempotency key and records the message id', async () => {
    const { sendPaidOnboardingEmail } = await import('../email');
    const res = await sendPaidOnboardingEmail(params);

    expect(res.sent).toBe(true);
    expect(resendSendMock).toHaveBeenCalledTimes(1);
    const [payload, opts] = resendSendMock.mock.calls[0];
    expect(payload.to).toBe('payer@example.com');
    expect(payload.subject).toBe('Your first AI reading is waiting');
    expect(payload.html).toContain('https://estrevia.app/chart');
    expect(opts).toMatchObject({ idempotencyKey: 'user_1:paid_onboarding:sub_123' });
    expect(recordSentMock).toHaveBeenCalledWith('user_1', 'paid_onboarding', 'resend_msg_123');
  });

  it('dedups via wasSentWithin — no Resend call, no record', async () => {
    wasSentWithinMock.mockResolvedValue(true);
    const { sendPaidOnboardingEmail } = await import('../email');
    const res = await sendPaidOnboardingEmail(params);

    expect(res).toEqual({ sent: false, reason: 'already_sent' });
    expect(resendSendMock).not.toHaveBeenCalled();
    expect(recordSentMock).not.toHaveBeenCalled();
  });

  it('throws on result.error and does NOT record (welcome-email lesson — retry next run)', async () => {
    resendSendMock.mockResolvedValue({
      data: null,
      error: { name: 'validation_error', message: 'invalid to' },
    });
    const { sendPaidOnboardingEmail } = await import('../email');

    await expect(sendPaidOnboardingEmail(params)).rejects.toThrow(/paid_onboarding/);
    expect(recordSentMock).not.toHaveBeenCalled();
  });

  it('DRY_RUN=true skips the send entirely', async () => {
    vi.stubEnv('DRY_RUN', 'true');
    const { sendPaidOnboardingEmail } = await import('../email');
    const res = await sendPaidOnboardingEmail(params);

    expect(res).toEqual({ sent: false, reason: 'dry_run' });
    expect(resendSendMock).not.toHaveBeenCalled();
  });

  it('ES locale uses the Spanish subject and the /es/chart CTA', async () => {
    const { sendPaidOnboardingEmail } = await import('../email');
    await sendPaidOnboardingEmail({ ...params, locale: 'es' });

    const [payload] = resendSendMock.mock.calls[0];
    expect(payload.subject).toBe('Tu primera lectura con IA te espera');
    expect(payload.html).toContain('https://estrevia.app/es/chart');
  });
});
