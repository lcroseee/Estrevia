import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// In-memory DB mock — mirrors sent-lead-emails.test.ts pattern
// ---------------------------------------------------------------------------
interface Row {
  leadId: string;
  resendMessageId: string | null;
  sentAt: Date;
  checkoutClicks: number;
}

const dbState: { rows: Row[] } = { rows: [] };

// insert().values().returning()
const insertMock = {
  values: vi.fn((vals: Omit<Row, 'sentAt'> & { sentAt?: Date }) => ({
    returning: vi.fn(async () => {
      const row: Row = {
        leadId: vals.leadId,
        resendMessageId: vals.resendMessageId ?? null,
        checkoutClicks: vals.checkoutClicks ?? 0,
        sentAt: vals.sentAt ?? new Date(),
      };
      dbState.rows.push(row);
      return [row];
    }),
  })),
};

// select().from().where().limit() — returns rows matching the where
const selectResults: Row[][] = [];

const selectChain = {
  from: vi.fn(() => ({
    where: vi.fn(() => ({
      limit: vi.fn(async () => selectResults.shift() ?? []),
    })),
  })),
};

vi.mock('@/shared/lib/db', () => ({
  getDb: () => ({
    insert: vi.fn(() => insertMock),
    select: vi.fn(() => selectChain),
  }),
}));

beforeEach(() => {
  dbState.rows = [];
  selectResults.length = 0;
  vi.clearAllMocks();
});

describe('sent-cart-abandon-emails', () => {
  it('hasCartAbandonSentRecently returns false when no rows', async () => {
    // select returns empty
    selectResults.push([]);
    const { hasCartAbandonSentRecently } = await import('../sent-cart-abandon-emails');
    const result = await hasCartAbandonSentRecently('lead_abc');
    expect(result).toBe(false);
  });

  it('hasCartAbandonSentRecently returns true after recordCartAbandonSent', async () => {
    // Seed a row for this lead within 90 days
    const row: Row = {
      leadId: 'lead_xyz',
      resendMessageId: 'resnd_111',
      sentAt: new Date(),
      checkoutClicks: 0,
    };
    selectResults.push([row]);
    const { hasCartAbandonSentRecently } = await import('../sent-cart-abandon-emails');
    const result = await hasCartAbandonSentRecently('lead_xyz');
    expect(result).toBe(true);
  });

  it('hasCartAbandonSentRecently returns false after 91 days (window expired)', async () => {
    // DB query with 90d window returns empty (no rows within window)
    selectResults.push([]);
    const { hasCartAbandonSentRecently } = await import('../sent-cart-abandon-emails');
    const result = await hasCartAbandonSentRecently('lead_old', 90);
    expect(result).toBe(false);
  });

  it('recordCartAbandonSent inserts a row', async () => {
    const { recordCartAbandonSent } = await import('../sent-cart-abandon-emails');
    await recordCartAbandonSent('lead_new', 'resnd_abc', { checkoutClicks: 2 });
    expect(insertMock.values).toHaveBeenCalledWith(
      expect.objectContaining({ leadId: 'lead_new', resendMessageId: 'resnd_abc', checkoutClicks: 2 }),
    );
  });

  it('recordCartAbandonSent handles null resendMessageId (Resend reject scenario)', async () => {
    const { recordCartAbandonSent } = await import('../sent-cart-abandon-emails');
    await recordCartAbandonSent('lead_fail', null, {});
    expect(insertMock.values).toHaveBeenCalledWith(
      expect.objectContaining({ leadId: 'lead_fail', resendMessageId: null }),
    );
  });
});
