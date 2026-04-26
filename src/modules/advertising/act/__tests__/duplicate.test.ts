import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { duplicate } from '../duplicate';
import { mockMetaApi } from '../../__tests__/mocks/meta-api';
import { mockTelegramBot } from '../../__tests__/mocks/telegram';
import { mockAdMetric } from '../../__tests__/fixtures';
import type { AdDecision } from '@/shared/types/advertising';
import type { DuplicateDeps } from '../duplicate';
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
    action: 'duplicate',
    reason: 'winning_creative',
    reasoning_tier: 'tier_1_rules',
    confidence: 1.0,
    metrics_snapshot: mockAdMetric(),
    ...overrides,
  };
}

function makeDeps(): DuplicateDeps {
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

describe('duplicate', () => {
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

  it('calls metaApi.duplicateAd with the correct ad_id', async () => {
    const deps = makeDeps();
    await duplicate(makeDecision(), deps);
    expect(deps.metaApi.duplicateAd).toHaveBeenCalledWith('ad_001');
  });

  it('returns a DecisionRecord with applied=true and new ad_id in meta_response', async () => {
    const deps = makeDeps();
    (deps.metaApi as ReturnType<typeof mockMetaApi>).duplicateAd.mockResolvedValue({
      ad_id: 'ad_new_001',
    });

    const record = await duplicate(makeDecision(), deps);
    expect(record.applied).toBe(true);
    expect((record.meta_response as Record<string, unknown>)?.['ad_id']).toBe('ad_new_001');
  });

  it('throws KillSwitchError before calling Meta API when kill switch is engaged', async () => {
    process.env.ADVERTISING_AGENT_ENABLED = 'false';
    const deps = makeDeps();

    await expect(duplicate(makeDecision(), deps)).rejects.toBeInstanceOf(KillSwitchError);
    expect(deps.metaApi.duplicateAd).not.toHaveBeenCalled();
  });

  it('throws when spend cap would be exceeded', async () => {
    const deps = makeDeps();
    (deps.metaApi as ReturnType<typeof mockMetaApi>).getInsights.mockResolvedValue([
      mockAdMetric({ spend_usd: 79 }),
    ]);

    // delta_budget_usd=10 → 79+10>80 → block
    await expect(duplicate(makeDecision({ delta_budget_usd: 10 }), deps)).rejects.toThrow('spend cap');
    expect(deps.metaApi.duplicateAd).not.toHaveBeenCalled();
  });

  it('writes audit record with applied=false on Meta failure', async () => {
    const deps = makeDeps();
    (deps.metaApi as ReturnType<typeof mockMetaApi>).duplicateAd.mockRejectedValueOnce(
      new Error('api_unavailable'),
    );

    await expect(duplicate(makeDecision(), deps)).rejects.toThrow('api_unavailable');

    const insertValsMock = (deps.decisionDb as unknown as { _insertValsMock: ReturnType<typeof vi.fn> })._insertValsMock;
    const row = insertValsMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(row['applied']).toBe(false);
    expect((row['applyError'] as string)).toContain('api_unavailable');
  });

  it('passes when no delta_budget_usd is set (defaults to 0)', async () => {
    const deps = makeDeps();
    const record = await duplicate(makeDecision({ delta_budget_usd: undefined }), deps);
    expect(record.applied).toBe(true);
  });
});
