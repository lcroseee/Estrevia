import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { refreshCreative } from '../refresh-creative';
import { mockMetaApi } from '../../__tests__/mocks/meta-api';
import { mockAdMetric } from '../../__tests__/fixtures';
import type { AdDecision } from '@/shared/types/advertising';
import type { RefreshCreativeDeps } from '../refresh-creative';
import type { DecisionLogDb } from '../../audit/decision-log';
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

type RefreshDecision = AdDecision & { new_creative_id: string };

function makeDecision(overrides?: Partial<RefreshDecision>): RefreshDecision {
  return {
    ad_id: 'ad_001',
    action: 'refresh_creative',
    reason: 'phase_d_freq_3.2',
    reasoning_tier: 'tier_1_rules',
    confidence: 1.0,
    metrics_snapshot: mockAdMetric(),
    new_creative_id: 'cr_new_001',
    ...overrides,
  };
}

function makeDeps(): RefreshCreativeDeps {
  return {
    metaApi: mockMetaApi(),
    decisionDb: makeDecisionDb(),
  };
}

const origEnabled = process.env.ADVERTISING_AGENT_ENABLED;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('refreshCreative', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADVERTISING_AGENT_ENABLED = 'true';
  });

  afterEach(() => {
    if (origEnabled === undefined) delete process.env.ADVERTISING_AGENT_ENABLED;
    else process.env.ADVERTISING_AGENT_ENABLED = origEnabled;
  });

  it('throws immediately if new_creative_id is missing', async () => {
    const deps = makeDeps();
    const decision = makeDecision({ new_creative_id: '' });

    await expect(refreshCreative(decision, deps)).rejects.toThrow('new_creative_id');
    expect(deps.metaApi.replaceAdCreative).not.toHaveBeenCalled();
  });

  it('calls metaApi.replaceAdCreative with ad_id and new_creative_id', async () => {
    const deps = makeDeps();
    await refreshCreative(makeDecision(), deps);
    expect(deps.metaApi.replaceAdCreative).toHaveBeenCalledWith('ad_001', 'cr_new_001');
  });

  it('returns a DecisionRecord with applied=true and meta_response on success', async () => {
    const deps = makeDeps();
    (deps.metaApi as ReturnType<typeof mockMetaApi>).replaceAdCreative.mockResolvedValue({
      ad_id: 'ad_001',
      new_creative_id: 'cr_new_001',
    });

    const record = await refreshCreative(makeDecision(), deps);
    expect(record.applied).toBe(true);
    expect(record.apply_error).toBeUndefined();
    expect((record.meta_response as Record<string, unknown>)?.['new_creative_id']).toBe('cr_new_001');
  });

  it('throws KillSwitchError before calling Meta API when kill switch is engaged', async () => {
    process.env.ADVERTISING_AGENT_ENABLED = 'false';
    const deps = makeDeps();

    await expect(refreshCreative(makeDecision(), deps)).rejects.toBeInstanceOf(KillSwitchError);
    expect(deps.metaApi.replaceAdCreative).not.toHaveBeenCalled();
  });

  it('writes audit record with applied=false on Meta failure and re-throws', async () => {
    const deps = makeDeps();
    (deps.metaApi as ReturnType<typeof mockMetaApi>).replaceAdCreative.mockRejectedValueOnce(
      new Error('quota_exceeded'),
    );

    await expect(refreshCreative(makeDecision(), deps)).rejects.toThrow('quota_exceeded');

    const insertValsMock = (deps.decisionDb as unknown as { _insertValsMock: ReturnType<typeof vi.fn> })._insertValsMock;
    const row = insertValsMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(row['applied']).toBe(false);
    expect((row['applyError'] as string)).toContain('quota_exceeded');
  });
});
