import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkSpendCap } from '../spend-cap';
import { mockMetaApi } from '../../__tests__/mocks/meta-api';
import { mockTelegramBot } from '../../__tests__/mocks/telegram';
import { mockAdMetric } from '../../__tests__/fixtures';
import type { SpendCapDb, SpendDailyRow } from '../spend-cap';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSpendCapDb(existingRow?: SpendDailyRow): SpendCapDb {
  const onConflictMock = vi.fn().mockResolvedValue(undefined);
  const insertValsMock = vi.fn().mockReturnValue({ onConflictDoUpdate: onConflictMock });
  const insertMock = vi.fn().mockReturnValue({ values: insertValsMock });
  const whereMock = vi.fn().mockResolvedValue(existingRow ? [existingRow] : []);
  const fromMock = vi.fn().mockReturnValue({ where: whereMock });
  const selectMock = vi.fn().mockReturnValue({ from: fromMock });

  return {
    insert: insertMock as unknown as SpendCapDb['insert'],
    select: selectMock as unknown as SpendCapDb['select'],
    _onConflictMock: onConflictMock,
    _insertValsMock: insertValsMock,
    _insertMock: insertMock,
    _whereMock: whereMock,
  } as unknown as SpendCapDb;
}

const origCapEnv = process.env.ADVERTISING_DAILY_SPEND_CAP_USD;
const origEnabledEnv = process.env.ADVERTISING_AGENT_ENABLED;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('checkSpendCap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set a known cap for tests
    process.env.ADVERTISING_DAILY_SPEND_CAP_USD = '80';
    process.env.ADVERTISING_AGENT_ENABLED = 'true';
  });

  afterEach(() => {
    if (origCapEnv === undefined) delete process.env.ADVERTISING_DAILY_SPEND_CAP_USD;
    else process.env.ADVERTISING_DAILY_SPEND_CAP_USD = origCapEnv;

    if (origEnabledEnv === undefined) delete process.env.ADVERTISING_AGENT_ENABLED;
    else process.env.ADVERTISING_AGENT_ENABLED = origEnabledEnv;
  });

  it('allows spend when today + planned is within cap', async () => {
    const meta = mockMetaApi();
    // Meta reports $20 spent today
    meta.getInsights.mockResolvedValue([mockAdMetric({ spend_usd: 20 })]);

    const telegram = mockTelegramBot();
    const db = makeSpendCapDb();

    const result = await checkSpendCap(10, { metaApi: meta, telegramBot: telegram, db });

    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
    expect(result.current_state.spent_usd).toBe(20);
    expect(result.current_state.cap_usd).toBe(80);
    expect(result.current_state.remaining_usd).toBe(60);
    expect(result.current_state.triggered_halt).toBe(false);
    expect(telegram.sendMessage).not.toHaveBeenCalled();
  });

  it('blocks spend when projected total exceeds cap', async () => {
    const meta = mockMetaApi();
    // Meta reports $75 spent today; planning to spend $10 more → $85 > $80
    meta.getInsights.mockResolvedValue([mockAdMetric({ spend_usd: 75 })]);

    const telegram = mockTelegramBot();
    const db = makeSpendCapDb();

    const result = await checkSpendCap(10, { metaApi: meta, telegramBot: telegram, db });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('spend_cap_exceeded');
    expect(result.current_state.triggered_halt).toBe(true);
    expect(telegram.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('sends Telegram alert with severity critical on block', async () => {
    const meta = mockMetaApi();
    meta.getInsights.mockResolvedValue([mockAdMetric({ spend_usd: 79 })]);

    const telegram = mockTelegramBot();
    const db = makeSpendCapDb();

    await checkSpendCap(5, { metaApi: meta, telegramBot: telegram, db });

    const callArg = telegram.sendMessage.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(callArg?.['severity']).toBe('critical');
    expect(typeof callArg?.['text']).toBe('string');
    expect((callArg?.['text'] as string)).toContain('SPEND CAP');
  });

  it('uses the greater of Meta spend and DB spend for safety', async () => {
    const meta = mockMetaApi();
    // Meta reports $30, but DB says $60 (discrepancy — take DB value)
    meta.getInsights.mockResolvedValue([mockAdMetric({ spend_usd: 30 })]);
    const db = makeSpendCapDb({ date: '2026-04-26', spentUsd: 60, capUsd: 80, triggeredHalt: false });

    const telegram = mockTelegramBot();

    const result = await checkSpendCap(5, { metaApi: meta, telegramBot: telegram, db });

    // Should use 60 (DB), not 30 (Meta)
    expect(result.current_state.spent_usd).toBe(60);
    expect(result.allowed).toBe(true); // 60 + 5 = 65 < 80
  });

  it('uses Meta spend when it is greater than DB spend', async () => {
    const meta = mockMetaApi();
    // Meta reports $70, DB says $20 — take $70
    meta.getInsights.mockResolvedValue([mockAdMetric({ spend_usd: 70 })]);
    const db = makeSpendCapDb({ date: '2026-04-26', spentUsd: 20, capUsd: 80, triggeredHalt: false });

    const telegram = mockTelegramBot();

    const result = await checkSpendCap(5, { metaApi: meta, telegramBot: telegram, db });

    expect(result.current_state.spent_usd).toBe(70);
    expect(result.allowed).toBe(true); // 70 + 5 = 75 < 80
  });

  it('upserts DB row with latest spend', async () => {
    const meta = mockMetaApi();
    meta.getInsights.mockResolvedValue([mockAdMetric({ spend_usd: 20 })]);
    const telegram = mockTelegramBot();
    const db = makeSpendCapDb();

    await checkSpendCap(5, { metaApi: meta, telegramBot: telegram, db });

    const onConflictMock = (db as unknown as { _onConflictMock: ReturnType<typeof vi.fn> })
      ._onConflictMock;
    expect(onConflictMock).toHaveBeenCalledTimes(1);
  });

  it('uses default cap of 80 when env var is absent', async () => {
    delete process.env.ADVERTISING_DAILY_SPEND_CAP_USD;

    const meta = mockMetaApi();
    meta.getInsights.mockResolvedValue([mockAdMetric({ spend_usd: 79 })]);
    const telegram = mockTelegramBot();
    const db = makeSpendCapDb();

    const result = await checkSpendCap(0, { metaApi: meta, telegramBot: telegram, db });
    expect(result.current_state.cap_usd).toBe(80);
  });

  it('throws on invalid env cap value', async () => {
    process.env.ADVERTISING_DAILY_SPEND_CAP_USD = 'not_a_number';

    const meta = mockMetaApi();
    meta.getInsights.mockResolvedValue([mockAdMetric({ spend_usd: 10 })]);
    const telegram = mockTelegramBot();
    const db = makeSpendCapDb();

    await expect(
      checkSpendCap(5, { metaApi: meta, telegramBot: telegram, db }),
    ).rejects.toThrow('ADVERTISING_DAILY_SPEND_CAP_USD is invalid');
  });

  it('returns remaining_usd=0 when already over cap (clamp)', async () => {
    process.env.ADVERTISING_DAILY_SPEND_CAP_USD = '50';
    const meta = mockMetaApi();
    // Already at $60, over the $50 cap
    meta.getInsights.mockResolvedValue([mockAdMetric({ spend_usd: 60 })]);
    const telegram = mockTelegramBot();
    const db = makeSpendCapDb();

    const result = await checkSpendCap(0, { metaApi: meta, telegramBot: telegram, db });
    expect(result.current_state.remaining_usd).toBe(0);
  });
});
