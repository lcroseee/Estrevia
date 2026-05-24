import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be hoisted before imports that resolve the modules
// ---------------------------------------------------------------------------

type ResendResult =
  | { data: { id: string }; error: null }
  | { data: null; error: { name: string; message: string } };

const resendSendMock = vi.fn<
  (_payload: Record<string, unknown>, _opts?: Record<string, unknown>) => Promise<ResendResult>
>(async () => ({
  data: { id: 'resend_dunning_msg_001' },
  error: null,
}));

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: resendSendMock };
  },
}));

// Mock DB — tryInsertOneShotDunning and recordDunning* use getDb()
const dbInsertMock = vi.fn();
const dbUpdateMock = vi.fn();
const dbSelectMock = vi.fn();

const mockDb = {
  insert: vi.fn(() => ({
    values: vi.fn(() => ({
      onConflictDoNothing: vi.fn(() => ({
        returning: dbInsertMock,
      })),
    })),
  })),
  update: vi.fn(() => ({
    set: vi.fn(() => ({
      where: dbUpdateMock,
    })),
  })),
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: dbSelectMock,
      })),
    })),
  })),
};

vi.mock('@/shared/lib/db', () => ({
  getDb: () => mockDb,
}));

// Sentry mock — prevent actual Sentry calls in tests
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BILLING_PERIOD_START = new Date('2026-05-01T00:00:00.000Z');
const BASE_PARAMS = {
  userId: 'user_abc123',
  email: 'test@example.com',
  locale: 'en' as const,
  subscriptionId: 'sub_test_123',
  stripeInvoiceId: 'in_test_456',
  dunningStep: 'd0' as const,
  billingPeriodStart: BILLING_PERIOD_START,
  isHardDecline: false,
  billingPortalUrl: 'https://billing.stripe.com/p/test',
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();

  // Default: new insert (slot available)
  dbInsertMock.mockResolvedValue([{ id: 1 }]);
  // Default: Resend success
  resendSendMock.mockResolvedValue({ data: { id: 'resend_dunning_msg_001' }, error: null });
  // Default: no existing row (for delivered-check query)
  dbSelectMock.mockResolvedValue([]);
  dbUpdateMock.mockResolvedValue(undefined);

  vi.stubEnv('RESEND_API_KEY', 're_test_dunning_key');
});

// ---------------------------------------------------------------------------
// tryInsertOneShotDunning
// ---------------------------------------------------------------------------

describe('tryInsertOneShotDunning', () => {
  it("returns 'new' when row is inserted (no conflict)", async () => {
    dbInsertMock.mockResolvedValueOnce([{ id: 1 }]);
    const { tryInsertOneShotDunning } = await import('../dunning-emails');
    const result = await tryInsertOneShotDunning(
      'sub_1',
      'd0',
      BILLING_PERIOD_START,
      'user_1',
      'in_1',
      false,
    );
    expect(result).toBe('new');
  });

  it("returns 'delivered' when conflict and resend_message_id is set", async () => {
    dbInsertMock.mockResolvedValueOnce([]); // conflict — nothing inserted
    dbSelectMock.mockResolvedValueOnce([{ resendMessageId: 'resend_existing_123' }]);
    const { tryInsertOneShotDunning } = await import('../dunning-emails');
    const result = await tryInsertOneShotDunning(
      'sub_2',
      'd3',
      BILLING_PERIOD_START,
      'user_2',
      'in_2',
      false,
    );
    expect(result).toBe('delivered');
  });

  it("returns 'retry' when conflict and resend_message_id is NULL", async () => {
    dbInsertMock.mockResolvedValueOnce([]); // conflict
    dbSelectMock.mockResolvedValueOnce([{ resendMessageId: null }]);
    const { tryInsertOneShotDunning } = await import('../dunning-emails');
    const result = await tryInsertOneShotDunning(
      'sub_3',
      'd7',
      BILLING_PERIOD_START,
      'user_3',
      'in_3',
      true,
    );
    expect(result).toBe('retry');
  });
});

// ---------------------------------------------------------------------------
// sendDunningEmail
// ---------------------------------------------------------------------------

describe('sendDunningEmail', () => {
  it("returns { sent: false, reason: 'dry_run' } when DUNNING_DRY_RUN=true", async () => {
    vi.stubEnv('DUNNING_DRY_RUN', 'true');
    const { sendDunningEmail } = await import('../dunning-emails');
    const result = await sendDunningEmail(BASE_PARAMS);
    expect(result.sent).toBe(false);
    expect(result.reason).toBe('dry_run');
    expect(resendSendMock).not.toHaveBeenCalled();
    // Idempotency row NOT inserted on dry run
    expect(dbInsertMock).not.toHaveBeenCalled();
  });

  it("returns { sent: false, reason: 'already_sent' } when claim is 'delivered'", async () => {
    // Simulate conflict with resend_message_id set
    dbInsertMock.mockResolvedValueOnce([]); // conflict
    dbSelectMock.mockResolvedValueOnce([{ resendMessageId: 'resend_prev_123' }]);
    const { sendDunningEmail } = await import('../dunning-emails');
    const result = await sendDunningEmail(BASE_PARAMS);
    expect(result.sent).toBe(false);
    expect(result.reason).toBe('already_sent');
    expect(resendSendMock).not.toHaveBeenCalled();
  });

  it('sends email and records messageId on success', async () => {
    dbInsertMock.mockResolvedValueOnce([{ id: 1 }]); // new slot
    resendSendMock.mockResolvedValueOnce({ data: { id: 'resend_dunning_sent_789' }, error: null });
    const { sendDunningEmail } = await import('../dunning-emails');
    const result = await sendDunningEmail(BASE_PARAMS);
    expect(result.sent).toBe(true);
    expect(result.messageId).toBe('resend_dunning_sent_789');
    expect(resendSendMock).toHaveBeenCalledTimes(1);
    // Verify idempotency key passed to Resend
    const callOpts = resendSendMock.mock.calls[0][1] as Record<string, unknown>;
    expect(callOpts.idempotencyKey).toContain('dunning:sub_test_123:d0:');
    // UPDATE to record messageId
    expect(dbUpdateMock).toHaveBeenCalled();
  });

  it("returns { sent: false, reason: 'resend_error' } when Resend returns error", async () => {
    dbInsertMock.mockResolvedValueOnce([{ id: 1 }]); // new slot
    resendSendMock.mockResolvedValueOnce({
      data: null,
      error: { name: 'validation_error', message: 'Invalid to address' },
    });
    const { sendDunningEmail } = await import('../dunning-emails');
    const result = await sendDunningEmail(BASE_PARAMS);
    expect(result.sent).toBe(false);
    expect(result.reason).toBe('resend_error');
  });

  it('sends d10 step (final warning) without billingPortalUrl', async () => {
    dbInsertMock.mockResolvedValueOnce([{ id: 1 }]);
    const { sendDunningEmail } = await import('../dunning-emails');
    const result = await sendDunningEmail({
      ...BASE_PARAMS,
      dunningStep: 'd10',
      billingPortalUrl: undefined,
    });
    expect(result.sent).toBe(true);
    const callArgs = resendSendMock.mock.calls[0][0] as Record<string, unknown>;
    expect((callArgs.subject as string).toLowerCase()).toContain('last chance');
  });
});
