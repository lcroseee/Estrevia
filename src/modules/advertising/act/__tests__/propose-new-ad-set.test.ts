import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { proposeNewAdSet } from '../propose-new-ad-set';
import { mockMetaApi } from '../../__tests__/mocks/meta-api';
import { mockTelegramBot } from '../../__tests__/mocks/telegram';
import { mockAdMetric } from '../../__tests__/fixtures';
import type {
  ProposeNewAdSetDeps,
  ProposeNewAdSetDecision,
  ApprovalSender,
} from '../propose-new-ad-set';
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

function makeApprovalSender(approved: boolean): ApprovalSender & {
  requestApproval: ReturnType<typeof vi.fn>;
} {
  return {
    requestApproval: vi.fn().mockResolvedValue({
      approved: true, // Telegram always returns approved=true on button-press
      chosen_value: approved ? 'approve' : 'reject',
    }),
  };
}

function makeDecision(overrides?: Partial<ProposeNewAdSetDecision>): ProposeNewAdSetDecision {
  return {
    ad_id: 'ad_001',
    action: 'propose_new_ad_set',
    reason: 'phase_d_winning_pattern',
    reasoning_tier: 'tier_1_rules',
    confidence: 1.0,
    metrics_snapshot: mockAdMetric(),
    source_ad_set_id: 'adset_src_001',
    proposed_budget_cents: 1500, // $15/day
    rationale: 'expand_winning_audience_to_lookalike_5pct',
    ...overrides,
  };
}

function makeDeps(approved = true): ProposeNewAdSetDeps & {
  telegramApproval: ReturnType<typeof makeApprovalSender>;
} {
  const meta = mockMetaApi();
  meta.getInsights.mockResolvedValue([mockAdMetric({ spend_usd: 20 })]);
  return {
    metaApi: meta,
    insightsApi: meta,
    telegramApproval: makeApprovalSender(approved),
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

describe('proposeNewAdSet', () => {
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

  it('throws immediately if source_ad_set_id is missing', async () => {
    const deps = makeDeps();
    const decision = makeDecision({ source_ad_set_id: '' });

    await expect(proposeNewAdSet(decision, deps)).rejects.toThrow('source_ad_set_id');
    expect(deps.telegramApproval.requestApproval).not.toHaveBeenCalled();
  });

  it('throws immediately if proposed_budget_cents is non-positive', async () => {
    const deps = makeDeps();
    await expect(
      proposeNewAdSet(makeDecision({ proposed_budget_cents: 0 }), deps),
    ).rejects.toThrow('proposed_budget_cents');
    expect(deps.telegramApproval.requestApproval).not.toHaveBeenCalled();
  });

  it('throws KillSwitchError before requesting approval when kill switch is engaged', async () => {
    process.env.ADVERTISING_AGENT_ENABLED = 'false';
    const deps = makeDeps();

    await expect(proposeNewAdSet(makeDecision(), deps)).rejects.toBeInstanceOf(KillSwitchError);
    expect(deps.telegramApproval.requestApproval).not.toHaveBeenCalled();
    expect(deps.metaApi.duplicateAdSetWithChanges).not.toHaveBeenCalled();
  });

  it('requests HIGH_RISK approval before any Meta call', async () => {
    const deps = makeDeps();
    await proposeNewAdSet(makeDecision(), deps);

    expect(deps.telegramApproval.requestApproval).toHaveBeenCalledTimes(1);
    const args = deps.telegramApproval.requestApproval.mock.calls[0];
    expect(args?.[2]).toBe('HIGH_RISK');
    // Founder sees source ad set, budget, rationale
    expect(args?.[0]).toContain('adset_src_001');
    expect(args?.[0]).toContain('15.00');
    expect(args?.[0]).toContain('expand_winning_audience_to_lookalike_5pct');
  });

  it('returns applied=false with founder_rejected_proposal when founder rejects', async () => {
    const deps = makeDeps(false); // approval returns chosen_value='reject'

    const record = await proposeNewAdSet(makeDecision(), deps);
    expect(record.applied).toBe(false);
    expect(record.apply_error).toBe('founder_rejected_proposal');
    // Meta API never called
    expect(deps.metaApi.duplicateAdSetWithChanges).not.toHaveBeenCalled();

    const insertValsMock = (deps.decisionDb as unknown as { _insertValsMock: ReturnType<typeof vi.fn> })._insertValsMock;
    const row = insertValsMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(row['applied']).toBe(false);
    expect(row['reason']).toBe('founder_rejected_proposal');
  });

  it('throws when spend cap would be exceeded after approval', async () => {
    const deps = makeDeps();
    // proposed budget = $15. Today's spend = $70. Cap = $80. 70+15=85 > 80 → block.
    (deps.insightsApi as ReturnType<typeof mockMetaApi>).getInsights.mockResolvedValue([
      mockAdMetric({ spend_usd: 70 }),
    ]);

    await expect(proposeNewAdSet(makeDecision(), deps)).rejects.toThrow('spend cap');
    // Approval was requested (it's pre-flight 2), but Meta call never happened.
    expect(deps.telegramApproval.requestApproval).toHaveBeenCalled();
    expect(deps.metaApi.duplicateAdSetWithChanges).not.toHaveBeenCalled();
  });

  it('happy path: approval + spend cap pass → calls duplicateAdSetWithChanges and logs applied=true', async () => {
    const deps = makeDeps();
    (deps.metaApi as ReturnType<typeof mockMetaApi>).duplicateAdSetWithChanges.mockResolvedValue({
      ad_set_id: 'adset_new_999',
    });

    const record = await proposeNewAdSet(
      makeDecision({ proposed_audience_id: 'aud_lookalike_5' }),
      deps,
    );

    expect(deps.metaApi.duplicateAdSetWithChanges).toHaveBeenCalledWith({
      sourceAdSetId: 'adset_src_001',
      newAudience: 'aud_lookalike_5',
      newBudgetCents: 1500,
    });
    expect(record.applied).toBe(true);
    expect((record.meta_response as Record<string, unknown>)?.['ad_set_id']).toBe('adset_new_999');
  });

  it('writes audit record with applied=false on Meta failure and re-throws', async () => {
    const deps = makeDeps();
    (deps.metaApi as ReturnType<typeof mockMetaApi>).duplicateAdSetWithChanges.mockRejectedValueOnce(
      new Error('meta_unavailable'),
    );

    await expect(proposeNewAdSet(makeDecision(), deps)).rejects.toThrow('meta_unavailable');

    const insertValsMock = (deps.decisionDb as unknown as { _insertValsMock: ReturnType<typeof vi.fn> })._insertValsMock;
    const row = insertValsMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(row['applied']).toBe(false);
    expect((row['applyError'] as string)).toContain('meta_unavailable');
  });
});
