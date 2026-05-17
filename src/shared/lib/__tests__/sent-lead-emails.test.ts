import { describe, it, expect, vi, beforeEach } from 'vitest';

type Row = { leadId: string; emailType: string; resendMessageId: string | null };
const dbState: { rows: Row[] } = { rows: [] };

let lastInsertVals: { leadId: string; emailType: string; resendMessageId?: string | null } | null = null;
let lastUpdateFilters: { leadId: string | null; emailType: string | null; setMsgId: string | null } = {
  leadId: null,
  emailType: null,
  setMsgId: null,
};

const onConflictMock = {
  returning: vi.fn(async () => {
    if (!lastInsertVals) return [];
    const exists = dbState.rows.some(
      (r) => r.leadId === lastInsertVals!.leadId && r.emailType === lastInsertVals!.emailType,
    );
    if (exists) return [];
    dbState.rows.push({
      leadId: lastInsertVals.leadId,
      emailType: lastInsertVals.emailType,
      resendMessageId: lastInsertVals.resendMessageId ?? null,
    });
    return [{ id: dbState.rows.length }];
  }),
};
const insertWithOnConflict = {
  values: vi.fn((vals: typeof lastInsertVals) => {
    lastInsertVals = vals;
    return { onConflictDoNothing: vi.fn(() => onConflictMock) };
  }),
};

// select().from().where().limit() — approximates Drizzle's chain to return
// the dedup row from the in-memory dbState matching the most-recent insert.
const selectChain = {
  from: vi.fn(() => ({
    where: vi.fn(() => ({
      limit: vi.fn(async () => {
        const match = dbState.rows.find(
          (r) =>
            r.leadId === lastInsertVals?.leadId &&
            r.emailType === lastInsertVals?.emailType,
        );
        return match ? [{ resendMessageId: match.resendMessageId }] : [];
      }),
    })),
  })),
};

// update().set().where() — used by recordSentLead.
const updateChain = {
  set: vi.fn((vals: { resendMessageId: string | null }) => {
    lastUpdateFilters.setMsgId = vals.resendMessageId;
    return {
      where: vi.fn(async () => {
        const target = dbState.rows.find(
          (r) =>
            r.leadId === lastInsertVals?.leadId &&
            r.emailType === lastInsertVals?.emailType,
        );
        if (target && lastUpdateFilters.setMsgId !== null) {
          target.resendMessageId = lastUpdateFilters.setMsgId;
        }
      }),
    };
  }),
};

vi.mock('@/shared/lib/db', () => ({
  getDb: () => ({
    insert: vi.fn(() => insertWithOnConflict),
    select: vi.fn(() => selectChain),
    update: vi.fn(() => updateChain),
  }),
}));

beforeEach(() => {
  dbState.rows = [];
  lastInsertVals = null;
  lastUpdateFilters = { leadId: null, emailType: null, setMsgId: null };
  vi.clearAllMocks();
});

describe('sent-lead-emails', () => {
  it("tryInsertOneShotLead returns 'new' on first insert", async () => {
    const { tryInsertOneShotLead } = await import('../sent-lead-emails');
    const claim = await tryInsertOneShotLead('lead_abc', 'lead_chart');
    expect(claim).toBe('new');
    expect(dbState.rows).toHaveLength(1);
  });

  it("tryInsertOneShotLead returns 'retry' when prior row has no msgid (prior send failed)", async () => {
    // Pre-seed a row WITHOUT resendMessageId — simulates a prior Resend reject
    // that left the dedup row in place but never recorded delivery.
    dbState.rows.push({ leadId: 'lead_retry', emailType: 'lead_chart', resendMessageId: null });
    const { tryInsertOneShotLead } = await import('../sent-lead-emails');
    const claim = await tryInsertOneShotLead('lead_retry', 'lead_chart');
    expect(claim).toBe('retry');
    expect(dbState.rows).toHaveLength(1);
  });

  it("tryInsertOneShotLead returns 'delivered' when prior row has msgid", async () => {
    dbState.rows.push({ leadId: 'lead_done', emailType: 'lead_chart', resendMessageId: 'resend_xxx' });
    const { tryInsertOneShotLead } = await import('../sent-lead-emails');
    const claim = await tryInsertOneShotLead('lead_done', 'lead_chart');
    expect(claim).toBe('delivered');
    expect(dbState.rows).toHaveLength(1);
  });

  it('different email types for same lead each get their own claim', async () => {
    const { tryInsertOneShotLead } = await import('../sent-lead-emails');
    expect(await tryInsertOneShotLead('lead_abc', 'lead_chart')).toBe('new');
    expect(await tryInsertOneShotLead('lead_abc', 'lead_moon_asc')).toBe('new');
    expect(dbState.rows).toHaveLength(2);
  });

  it('recordSentLead is a no-op when resendMessageId is null', async () => {
    dbState.rows.push({ leadId: 'lead_z', emailType: 'lead_chart', resendMessageId: null });
    lastInsertVals = { leadId: 'lead_z', emailType: 'lead_chart' };
    const { recordSentLead } = await import('../sent-lead-emails');
    await recordSentLead('lead_z', 'lead_chart', null);
    expect(dbState.rows[0]?.resendMessageId).toBeNull();
  });

  it('recordSentLead populates msgid when provided', async () => {
    dbState.rows.push({ leadId: 'lead_z', emailType: 'lead_chart', resendMessageId: null });
    lastInsertVals = { leadId: 'lead_z', emailType: 'lead_chart' };
    const { recordSentLead } = await import('../sent-lead-emails');
    await recordSentLead('lead_z', 'lead_chart', 'rsnd_777');
    expect(dbState.rows[0]?.resendMessageId).toBe('rsnd_777');
  });
});
