import { describe, it, expect, vi, beforeEach } from 'vitest';

const dbState: { rows: Array<{ leadId: string; emailType: string; resendMessageId: string | null }> } = { rows: [] };

let lastInsertVals: { leadId: string; emailType: string; resendMessageId?: string | null } | null = null;
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
const insertNoOnConflict = {
  values: vi.fn(async (vals: typeof lastInsertVals) => {
    if (!vals) return;
    dbState.rows.push({
      leadId: vals.leadId,
      emailType: vals.emailType,
      resendMessageId: vals.resendMessageId ?? null,
    });
  }),
};
const insertWithOnConflict = {
  values: vi.fn((vals: typeof lastInsertVals) => {
    lastInsertVals = vals;
    return { onConflictDoNothing: vi.fn(() => onConflictMock) };
  }),
};

vi.mock('@/shared/lib/db', () => ({
  getDb: () => ({
    insert: vi.fn((_table) => insertWithOnConflict),
  }),
}));

beforeEach(() => {
  dbState.rows = [];
  lastInsertVals = null;
  vi.clearAllMocks();
});

describe('sent-lead-emails', () => {
  it('tryInsertOneShotLead returns true on first insert', async () => {
    const { tryInsertOneShotLead } = await import('../sent-lead-emails');
    const ok = await tryInsertOneShotLead('lead_abc', 'lead_chart');
    expect(ok).toBe(true);
    expect(dbState.rows).toHaveLength(1);
  });

  it('tryInsertOneShotLead returns false on conflict (already sent)', async () => {
    const { tryInsertOneShotLead } = await import('../sent-lead-emails');
    await tryInsertOneShotLead('lead_abc', 'lead_chart');
    const ok = await tryInsertOneShotLead('lead_abc', 'lead_chart');
    expect(ok).toBe(false);
    expect(dbState.rows).toHaveLength(1);
  });

  it('different email types for same lead can both insert', async () => {
    const { tryInsertOneShotLead } = await import('../sent-lead-emails');
    expect(await tryInsertOneShotLead('lead_abc', 'lead_chart')).toBe(true);
    expect(await tryInsertOneShotLead('lead_abc', 'lead_moon_asc')).toBe(true);
    expect(dbState.rows).toHaveLength(2);
  });
});
