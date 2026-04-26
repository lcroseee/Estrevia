import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { scale } from '../scale';
import { mockMetaApi } from '../../__tests__/mocks/meta-api';
import { mockTelegramBot } from '../../__tests__/mocks/telegram';
import { mockAdMetric } from '../../__tests__/fixtures';
import type { AdDecision } from '@/shared/types/advertising';
import type { ScaleDeps } from '../scale';
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
    action: 'scale_up',
    delta_budget_usd: 10,
    reason: 'strong_ctr',
    reasoning_tier: 'tier_1_rules',
    confidence: 1.0,
    metrics_snapshot: mockAdMetric(),
    ...overrides,
  };
}

function makeDeps(): ScaleDeps {
  const meta = mockMetaApi();
  meta.getInsights.mockResolvedValue([mockAdMetric({ spend_usd: 20 })]);
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

describe('scale', () => {
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

  it('throws immediately if delta_budget_usd is missing', async () => {
    const deps = makeDeps();
    const decision = makeDecision({ delta_budget_usd: undefined });

    await expect(scale(decision, deps)).rejects.toThrow('delta_budget_usd');
    expect(deps.metaApi.scaleBudget).not.toHaveBeenCalled();
  });

  it('calls metaApi.scaleBudget with correct adId and delta', async () => {
    const deps = makeDeps();
    await scale(makeDecision({ delta_budget_usd: 15 }), deps);
    expect(deps.metaApi.scaleBudget).toHaveBeenCalledWith('ad_001', 15);
  });

  it('returns a DecisionRecord with applied=true on success', async () => {
    const deps = makeDeps();
    const record = await scale(makeDecision(), deps);
    expect(record.applied).toBe(true);
    expect(record.apply_error).toBeUndefined();
  });

  it('throws KillSwitchError before calling Meta API when kill switch is engaged', async () => {
    process.env.ADVERTISING_AGENT_ENABLED = 'false';
    const deps = makeDeps();

    await expect(scale(makeDecision(), deps)).rejects.toBeInstanceOf(KillSwitchError);
    expect(deps.metaApi.scaleBudget).not.toHaveBeenCalled();
  });

  it('blocks and throws when spend cap is exceeded', async () => {
    const deps = makeDeps();
    (deps.metaApi as ReturnType<typeof mockMetaApi>).getInsights.mockResolvedValue([
      mockAdMetric({ spend_usd: 79 }),
    ]);

    await expect(scale(makeDecision({ delta_budget_usd: 10 }), deps)).rejects.toThrow('spend cap');
    expect(deps.metaApi.scaleBudget).not.toHaveBeenCalled();
  });

  it('does not check spend cap for negative delta (scale_down reduces budget)', async () => {
    const deps = makeDeps();
    // Meta at $79; delta is -10 (scale down) → plannedDelta = max(0, -10) = 0 → should pass
    (deps.metaApi as ReturnType<typeof mockMetaApi>).getInsights.mockResolvedValue([
      mockAdMetric({ spend_usd: 79 }),
    ]);

    const record = await scale(makeDecision({ delta_budget_usd: -10 }), deps);
    expect(record.applied).toBe(true);
    expect(deps.metaApi.scaleBudget).toHaveBeenCalledWith('ad_001', -10);
  });

  it('writes audit record with applied=false on Meta failure', async () => {
    const deps = makeDeps();
    (deps.metaApi as ReturnType<typeof mockMetaApi>).scaleBudget.mockRejectedValueOnce(
      new Error('api_error'),
    );

    await expect(scale(makeDecision(), deps)).rejects.toThrow('api_error');

    const insertValsMock = (deps.decisionDb as unknown as { _insertValsMock: ReturnType<typeof vi.fn> })._insertValsMock;
    const row = insertValsMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(row['applied']).toBe(false);
    expect((row['applyError'] as string)).toContain('api_error');
  });
});
