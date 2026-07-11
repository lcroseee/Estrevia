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
  data: { id: 'resend_msg_w1' },
  error: null,
}));
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: resendSendMock };
  },
}));

const claimUserMock = vi.fn(async () => 'new' as 'new' | 'retry' | 'delivered');
const recordUpdateMock = vi.fn(async () => undefined);
const tryInsertOneShotMock = vi.fn(async () => true);
const recordSentMock = vi.fn(async () => undefined);
vi.mock('@/shared/lib/sent-emails', () => ({
  tryInsertOneShot: tryInsertOneShotMock,
  recordSent: recordSentMock,
  tryInsertOneShotUser: claimUserMock,
  recordSentUpdate: recordUpdateMock,
  wasSentWithin: vi.fn(async () => false),
}));

vi.mock('@/shared/lib/unsubscribe-token', () => ({
  signUnsubscribeToken: vi.fn(async (id: string) => `tok_${id}`),
  signLeadUnsubscribeToken: vi.fn(async (id: string) => `tok_${id}`),
}));

vi.mock('@/shared/lib/analytics', () => ({
  trackServerEvent: vi.fn(),
  AnalyticsEvent: {
    PAYWALL_TEASER_EMAIL_SENT: 'paywall_teaser_email_sent',
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  claimUserMock.mockResolvedValue('new');
  resendSendMock.mockResolvedValue({ data: { id: 'resend_msg_w1' }, error: null });
  vi.stubEnv('RESEND_API_KEY', 're_test_key_aaaaaaaaaaaaaaaaaa');
});

const baseParams = {
  userId: 'user_w1',
  email: 'welcome@example.com',
  locale: 'en' as const,
  hasSavedChart: false,
};

describe('sendWelcomeEmail (claim/update pattern)', () => {
  it('success: sends, then UPDATEs the claimed row with the msgid (no second INSERT)', async () => {
    const { sendWelcomeEmail } = await import('../email');
    const res = await sendWelcomeEmail(baseParams);
    expect(res).toEqual({ sent: true });
    expect(claimUserMock).toHaveBeenCalledWith('user_w1', 'welcome');
    expect(resendSendMock).toHaveBeenCalledTimes(1);
    expect(recordUpdateMock).toHaveBeenCalledWith('user_w1', 'welcome', 'resend_msg_w1');
    // The old path INSERTed a colliding second row via recordSent — must be gone.
    expect(recordSentMock).not.toHaveBeenCalled();
  });

  it("'delivered' claim → already_sent, no Resend call", async () => {
    claimUserMock.mockResolvedValueOnce('delivered');
    const { sendWelcomeEmail } = await import('../email');
    const res = await sendWelcomeEmail(baseParams);
    expect(res).toEqual({ sent: false, reason: 'already_sent' });
    expect(resendSendMock).not.toHaveBeenCalled();
  });

  it("'retry' claim → proceeds with the send (prior attempt failed pre-delivery)", async () => {
    claimUserMock.mockResolvedValueOnce('retry');
    const { sendWelcomeEmail } = await import('../email');
    const res = await sendWelcomeEmail(baseParams);
    expect(res).toEqual({ sent: true });
    expect(resendSendMock).toHaveBeenCalledTimes(1);
  });

  it('Resend error → throws, never returns a false-positive sent:true', async () => {
    resendSendMock.mockResolvedValueOnce({
      data: null,
      error: { name: 'validation_error', message: 'Invalid To address' },
    });
    const { sendWelcomeEmail } = await import('../email');
    await expect(sendWelcomeEmail(baseParams)).rejects.toThrow(
      /Resend rejected welcome/,
    );
    // Claim row keeps its NULL msgid → the next call classifies as 'retry'.
    expect(recordUpdateMock).not.toHaveBeenCalled();
  });
});
