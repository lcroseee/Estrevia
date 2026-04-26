import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { pause } from '../pause';
import { mockMetaApi } from '../../__tests__/mocks/meta-api';
import { mockTelegramBot } from '../../__tests__/mocks/telegram';
import { mockAdMetric } from '../../__tests__/fixtures';
import type { AdDecision } from '@/shared/types/advertising';
import type { PauseDeps } from '../pause';
import type { DecisionLogDb } from '../../audit/decision-log';
import type { SpendCapDb } from '../../safety/spend-cap';
import { KillSwitchError } from '../../safety/kill-switch';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDecisionDb(): DecisionLogDb {
  const insertValsMock = vi.fn().mockResolvedValue(undefined);
  return {
    insert: vi.fn().mockReturnValue({ values: insertValsMock }),
    select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) }),
    _insertValsMock: insertValsMock,
  } as unknown as DecisionLogDb;
}

function makeSpendCapDb(): SpendCapDb {
  const onConflictMock = vi.fn().mockResolvedValue(undefined);
  return {
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockReturnValue({ onConflictDoUpdate: onConflictMock }) }),
    select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) }),
    _onConflictMock: onConflictMock,
  } as unknown as SpendCapDb;
}

function makeDecision(overrides?: Partial<AdDecision>): AdDecision {
  return {
    ad_id: 'ad_001',
    action: 'pause',
    reason: 'frequency_cap',
    reasoning_tier: 'tier_1_rules',
    confidence: 1.0,
    metrics_snapshot: mockAdMetric(),
    ...overrides,
  };
}

function makeDeps(): PauseDeps {
  const meta = mockMetaApi();
  // Meta reports low spend so spend cap passes
  meta.getInsights.mockResolvedValue([mockAdMetric({ spend_usd: 5 })]);

  return {
    metaApi: meta,
    telegramBot: mockTelegramBot(),
    spendCapDb: makeSpendCapDb(),
    decisionDb: makeDecisionDb(),
  };
}

const origEnabled = process.env.ADVERTISING_AGENT_ENABLED;
const origCap = process.env.ADVERTISING_DAILY_SPEND_CAP_USD;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('pause', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADVERTISING_AGENT_ENABLED = 'true';
    process.env.ADVERTISING_DAILY_SPEND_CAP_USD = '80';
  });

  afterEach(() => {
    if (origEnabled === undefined) delete process.env.ADVERTISING_AGENT_ENABLED;
    else process.env.ADVERTISING_AGENT_ENABLED = origEnabled;
    if (origCap === undefined) delete process.env.ADVERTISING_DAILY_SPEND_CAP_USD;
    else process.env.ADVERTISING_DAILY_SPEND_CAP_USD = origCap;
  });

  it('calls metaApi.pauseAd with the correct ad_id', async () => {
    const deps = makeDeps();
    await pause(makeDecision(), deps);
    expect(deps.metaApi.pauseAd).toHaveBeenCalledWith('ad_001');
  });

  it('returns a DecisionRecord with applied=true on success', async () => {
    const deps = makeDeps();
    const record = await pause(makeDecision(), deps);
    expect(record.applied).toBe(true);
    expect(record.id).toBeDefined();
    expect(record.apply_error).toBeUndefined();
  });

  it('throws KillSwitchError before calling Meta API when kill switch is engaged', async () => {
    process.env.ADVERTISING_AGENT_ENABLED = 'false';
    const deps = makeDeps();

    await expect(pause(makeDecision(), deps)).rejects.toBeInstanceOf(KillSwitchError);
    expect(deps.metaApi.pauseAd).not.toHaveBeenCalled();
  });

  it('throws when spend cap is exceeded before calling Meta API', async () => {
    const deps = makeDeps();
    // Simulate $79 already spent and planning to pause (0 delta) — but cap logic
    // here uses plannedDelta=0, so cap won't block. Instead test with explicit delta.
    const decision = makeDecision({ action: 'scale_up', delta_budget_usd: 20 });
    // Report $79 to trigger block at $79+20>80
    (deps.metaApi as ReturnType<typeof mockMetaApi>).getInsights.mockResolvedValue([
      mockAdMetric({ spend_usd: 79 }),
    ]);

    await expect(pause(decision, deps)).rejects.toThrow('spend cap');
    expect(deps.metaApi.pauseAd).not.toHaveBeenCalled();
  });

  it('writes an audit record with applied=false on Meta API failure', async () => {
    const deps = makeDeps();
    (deps.metaApi as ReturnType<typeof mockMetaApi>).pauseAd.mockRejectedValueOnce(
      new Error('meta_timeout'),
    );

    await expect(pause(makeDecision(), deps)).rejects.toThrow('meta_timeout');

    const insertValsMock = (deps.decisionDb as unknown as { _insertValsMock: ReturnType<typeof vi.fn> })._insertValsMock;
    expect(insertValsMock).toHaveBeenCalledTimes(1);
    const row = insertValsMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(row['applied']).toBe(false);
    expect(row['applyError']).toContain('meta_timeout');
  });

  it('pre-flight checks happen BEFORE Meta API call (order verification)', async () => {
    const calls: string[] = [];
    process.env.ADVERTISING_AGENT_ENABLED = 'false'; // kill switch on

    const deps = makeDeps();
    (deps.metaApi as ReturnType<typeof mockMetaApi>).pauseAd.mockImplementation(() => {
      calls.push('meta');
      return Promise.resolve({ success: true });
    });

    // Should throw before reaching Meta
    await expect(pause(makeDecision(), deps)).rejects.toBeInstanceOf(KillSwitchError);
    expect(calls).toHaveLength(0);
  });

  it('writes audit record with meta_response on success', async () => {
    const deps = makeDeps();
    (deps.metaApi as ReturnType<typeof mockMetaApi>).pauseAd.mockResolvedValue({
      success: true,
      ad_id: 'ad_001',
    });

    const record = await pause(makeDecision(), deps);
    expect(record.meta_response).toMatchObject({ success: true });
  });
});
