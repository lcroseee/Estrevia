/**
 * Tests for the trial-expiration email sequence (T2).
 *
 * Covers:
 *   1. tryInsertOneShotTrial — new / retry / delivered returns
 *   2. DRY_RUN gate — sendTrialExpirationEmail returns { sent:false, reason:'dry_run' }
 *   3. Idempotency — 'delivered' claim prevents Resend call
 *   4. Template selection — step drives correct subject line
 *   5. Resend error → throws (for Sentry capture upstream)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// DB mock — mirrors sent-lead-emails.test.ts pattern
// ---------------------------------------------------------------------------
type TrialRow = {
  subscriptionId: string;
  step: string;
  resendMessageId: string | null;
};
const dbState: { rows: TrialRow[] } = { rows: [] };
let lastInsertVals: { subscriptionId: string; step: string; resendMessageId?: string | null } | null = null;

const onConflictMock = {
  returning: vi.fn(async () => {
    if (!lastInsertVals) return [];
    const exists = dbState.rows.some(
      (r) => r.subscriptionId === lastInsertVals!.subscriptionId && r.step === lastInsertVals!.step,
    );
    if (exists) return [];
    dbState.rows.push({
      subscriptionId: lastInsertVals.subscriptionId,
      step: lastInsertVals.step,
      resendMessageId: lastInsertVals.resendMessageId ?? null,
    });
    return [{ id: dbState.rows.length }];
  }),
};
const insertMock = {
  values: vi.fn((vals: typeof lastInsertVals) => {
    lastInsertVals = vals;
    return { onConflictDoNothing: vi.fn(() => onConflictMock) };
  }),
};
const selectChain = {
  from: vi.fn(() => ({
    where: vi.fn(() => ({
      limit: vi.fn(async () => {
        const match = dbState.rows.find(
          (r) =>
            r.subscriptionId === lastInsertVals?.subscriptionId &&
            r.step === lastInsertVals?.step,
        );
        return match ? [{ resendMessageId: match.resendMessageId }] : [];
      }),
    })),
  })),
};
const updateChain = {
  set: vi.fn((vals: { resendMessageId: string | null }) => ({
    where: vi.fn(async () => {
      const target = dbState.rows.find(
        (r) =>
          r.subscriptionId === lastInsertVals?.subscriptionId &&
          r.step === lastInsertVals?.step,
      );
      if (target && vals.resendMessageId !== null) {
        target.resendMessageId = vals.resendMessageId;
      }
    }),
  })),
};

vi.mock('@/shared/lib/db', () => ({
  getDb: () => ({
    insert: vi.fn(() => insertMock),
    select: vi.fn(() => selectChain),
    update: vi.fn(() => updateChain),
  }),
}));

// Resend mock — must be a class (constructor), not arrow function
const mockResendSend = vi.fn().mockResolvedValue({ data: { id: 'rsnd_test_001' }, error: null });
vi.mock('resend', () => ({
  Resend: class MockResend {
    emails = { send: mockResendSend };
  },
}));

// react-email render mock
vi.mock('@react-email/render', () => ({
  render: vi.fn().mockResolvedValue('<html>mock</html>'),
}));

// Email template mocks
vi.mock('@/emails/TrialReminder3dEmail', () => ({
  default: vi.fn(() => null),
}));
vi.mock('@/emails/TrialReminder1dEmail', () => ({
  default: vi.fn(() => null),
}));
vi.mock('@/emails/TrialEndedEmail', () => ({
  default: vi.fn(() => null),
}));

// unsubscribe token mock
vi.mock('@/shared/lib/unsubscribe-token', () => ({
  signUnsubscribeToken: vi.fn().mockResolvedValue('mock_token'),
}));

beforeEach(() => {
  dbState.rows = [];
  lastInsertVals = null;
  mockResendSend.mockResolvedValue({ data: { id: 'rsnd_test_001' }, error: null });
  vi.clearAllMocks();
  // Reset module cache so the lazy _resend singleton is re-created each test
  vi.resetModules();
  process.env.RESEND_API_KEY = 'test_resend_key';
  delete process.env.DRY_RUN;
  delete process.env.TRIAL_WINBACK_COUPON_CODE;
});

afterEach(() => {
  delete process.env.DRY_RUN;
  delete process.env.TRIAL_WINBACK_COUPON_CODE;
});

// ---------------------------------------------------------------------------
// T2.2 — sent-trial-emails library
// ---------------------------------------------------------------------------
describe('sent-trial-emails', () => {
  it("tryInsertOneShotTrial returns 'new' on first insert", async () => {
    const { tryInsertOneShotTrial } = await import('../sent-trial-emails');
    const claim = await tryInsertOneShotTrial('sub_abc', 'reminder_3d');
    expect(claim).toBe('new');
    expect(dbState.rows).toHaveLength(1);
  });

  it("tryInsertOneShotTrial returns 'retry' when prior row has no msgid", async () => {
    dbState.rows.push({ subscriptionId: 'sub_retry', step: 'reminder_3d', resendMessageId: null });
    const { tryInsertOneShotTrial } = await import('../sent-trial-emails');
    const claim = await tryInsertOneShotTrial('sub_retry', 'reminder_3d');
    expect(claim).toBe('retry');
    expect(dbState.rows).toHaveLength(1);
  });

  it("tryInsertOneShotTrial returns 'delivered' when prior row has msgid", async () => {
    dbState.rows.push({
      subscriptionId: 'sub_done',
      step: 'reminder_3d',
      resendMessageId: 'rsnd_existing',
    });
    const { tryInsertOneShotTrial } = await import('../sent-trial-emails');
    const claim = await tryInsertOneShotTrial('sub_done', 'reminder_3d');
    expect(claim).toBe('delivered');
    expect(dbState.rows).toHaveLength(1);
  });

  it('different steps for same subscription each get independent claims', async () => {
    const { tryInsertOneShotTrial } = await import('../sent-trial-emails');
    expect(await tryInsertOneShotTrial('sub_multi', 'reminder_3d')).toBe('new');
    expect(await tryInsertOneShotTrial('sub_multi', 'reminder_1d')).toBe('new');
    expect(dbState.rows).toHaveLength(2);
  });

  it('recordSentTrial populates resend_message_id', async () => {
    dbState.rows.push({ subscriptionId: 'sub_rec', step: 'reminder_3d', resendMessageId: null });
    lastInsertVals = { subscriptionId: 'sub_rec', step: 'reminder_3d' };
    const { recordSentTrial } = await import('../sent-trial-emails');
    await recordSentTrial('sub_rec', 'reminder_3d', 'rsnd_updated');
    expect(dbState.rows[0]?.resendMessageId).toBe('rsnd_updated');
  });
});

// ---------------------------------------------------------------------------
// T2.4 — sendTrialExpirationEmail
// ---------------------------------------------------------------------------
describe('sendTrialExpirationEmail', () => {
  const baseParams = {
    subscriptionId: 'sub_test',
    userId: 'user_clerk_test',
    email: 'test@example.com',
    locale: 'en' as const,
    trialEndDate: new Date('2026-05-26T05:07:00Z'),
    plan: 'pro_monthly' as const,
  };

  it('DRY_RUN=true → returns { sent: false, reason: "dry_run" } without calling Resend', async () => {
    process.env.DRY_RUN = 'true';
    const { sendTrialExpirationEmail } = await import('../trial-expiration-email');
    const result = await sendTrialExpirationEmail({ ...baseParams, step: 'reminder_3d' });
    expect(result).toEqual({ sent: false, reason: 'dry_run' });
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it("'delivered' claim → returns { sent: false, reason: 'already_sent' } without calling Resend", async () => {
    // Pre-seed delivered row
    dbState.rows.push({
      subscriptionId: 'sub_test',
      step: 'reminder_3d',
      resendMessageId: 'rsnd_pre',
    });
    const { sendTrialExpirationEmail } = await import('../trial-expiration-email');
    const result = await sendTrialExpirationEmail({ ...baseParams, step: 'reminder_3d' });
    expect(result).toEqual({ sent: false, reason: 'already_sent' });
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it('step=reminder_3d → sends with TrialReminder3d subject', async () => {
    const { sendTrialExpirationEmail } = await import('../trial-expiration-email');
    const result = await sendTrialExpirationEmail({ ...baseParams, step: 'reminder_3d' });
    expect(result.sent).toBe(true);
    expect(mockResendSend).toHaveBeenCalledOnce();
    const callArgs = mockResendSend.mock.calls[0]![0];
    expect(callArgs.subject).toBe('Your Estrevia Pro trial ends in 3 days');
  });

  it('step=reminder_1d → sends with TrialReminder1d subject', async () => {
    const { sendTrialExpirationEmail } = await import('../trial-expiration-email');
    const result = await sendTrialExpirationEmail({ ...baseParams, step: 'reminder_1d' });
    expect(result.sent).toBe(true);
    const callArgs = mockResendSend.mock.calls[0]![0];
    expect(callArgs.subject).toBe('Last day: your Estrevia Pro trial ends tomorrow');
  });

  it('step=trial_ended → sends with TrialEnded subject', async () => {
    const { sendTrialExpirationEmail } = await import('../trial-expiration-email');
    const result = await sendTrialExpirationEmail({ ...baseParams, step: 'trial_ended' });
    expect(result.sent).toBe(true);
    const callArgs = mockResendSend.mock.calls[0]![0];
    expect(callArgs.subject).toBe('Your Estrevia trial ended — your chart is still here');
  });

  it('Resend error → throws so caller can capture via Sentry', async () => {
    mockResendSend.mockResolvedValue({
      data: null,
      error: { message: 'Invalid To address', name: 'validation_error' },
    });
    const { sendTrialExpirationEmail } = await import('../trial-expiration-email');
    await expect(
      sendTrialExpirationEmail({ ...baseParams, step: 'reminder_3d' }),
    ).rejects.toThrow(/Resend rejected/);
  });

  it('TRIAL_WINBACK_COUPON_CODE is passed to trial_ended template', async () => {
    process.env.TRIAL_WINBACK_COUPON_CODE = 'WINBACK10';
    // Ensure TrialEndedEmail mock captures props
    const TrialEndedEmail = await import('@/emails/TrialEndedEmail');
    const mockDefault = vi.spyOn(TrialEndedEmail, 'default');
    const { sendTrialExpirationEmail } = await import('../trial-expiration-email');
    await sendTrialExpirationEmail({ ...baseParams, step: 'trial_ended' });
    expect(mockDefault).toHaveBeenCalledWith(
      expect.objectContaining({ couponCode: 'WINBACK10' }),
    );
  });
});
