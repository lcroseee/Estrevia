import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AdDecision } from '../approval-router';
import type { AdSetState } from '../state-store';

// ── Mock every policy + the account-emergency module so we can verify
// pure routing behaviour without re-asserting each policy's internals.
vi.mock('../policies/phase-a', () => ({
  evaluatePhaseA: vi.fn(
    (i: { ad_id: string }): AdDecision => ({
      ad_id: i.ad_id,
      action: 'hold',
      reason: 'phase_a_pre_launch',
    }),
  ),
}));

vi.mock('../policies/phase-b', () => ({
  evaluatePhaseB: vi.fn(
    async (i: { ad_id: string }): Promise<AdDecision> => ({
      ad_id: i.ad_id,
      action: 'hold',
      reason: 'learning_in_progress',
    }),
  ),
}));

vi.mock('../policies/phase-c', () => ({
  evaluatePhaseC: vi.fn(
    async (i: { ad_id: string }): Promise<AdDecision> => ({
      ad_id: i.ad_id,
      action: 'maintain',
      reason: 'phase_c_steady_state',
    }),
  ),
}));

vi.mock('../policies/phase-d', () => ({
  evaluatePhaseD: vi.fn(
    async (i: { ad_id: string }): Promise<AdDecision> => ({
      ad_id: i.ad_id,
      action: 'maintain',
      reason: 'phase_d_no_action_yet',
    }),
  ),
}));

vi.mock('../policies/account-emergency', () => ({
  // Default: no account emergency. Individual tests override per-call.
  evaluateAccountEmergency: vi.fn(async (): Promise<AdDecision | null> => null),
}));

// Imports MUST come after vi.mock() so the mocked modules are wired in.
import { evaluatePhase, type PhaseEvaluatorInput } from '../phase-evaluator';
import { evaluatePhaseA } from '../policies/phase-a';
import { evaluatePhaseB } from '../policies/phase-b';
import { evaluatePhaseC } from '../policies/phase-c';
import { evaluatePhaseD } from '../policies/phase-d';
import { evaluateAccountEmergency } from '../policies/account-emergency';

// ──────────────────────────────────────────────────────────────────────────
// Fixtures: build a minimal PhaseEvaluatorInput. The state is cast through
// `as AdSetState` because the schema-derived row type carries many columns
// the orchestrator never reads (timestamps, audit flags, etc.).
// ──────────────────────────────────────────────────────────────────────────

function mkState(overrides: Partial<Record<keyof AdSetState, unknown>> = {}): AdSetState {
  return {
    adSetId: 'as_test',
    campaignId: 'cmp_test',
    locale: 'en',
    currentPhase: 'A',
    ...overrides,
  } as AdSetState;
}

function mkInput(state: AdSetState): PhaseEvaluatorInput {
  return {
    ad_id: 'ad_test',
    state,
    current: {
      status: 'ACTIVE',
      frequency: 1.5,
      spend_usd: 5.0,
      impressions: 1000,
      ctr: 0.02,
      cpc: 0.5,
    },
    account: {
      disapproval_rate: 0.0,
      quality_rating: 'AVERAGE',
      status: 'ACTIVE',
    },
    metric: {
      cpa_7d: 10.0,
      roas_7d: 2.0,
      roas_14d: 2.0,
      frequency_current: 1.5,
      sustained_days_above_cpa: 0,
      sustained_days_below_roas14d: 0,
      sustained_days_above_scale_criteria: 0,
      sustained_days_above_decline_freq: 0,
      days_in_phase_c: 0,
    },
    signups_per_week: { lead: 0, subscribe: 0 },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default mock state restored after vi.clearAllMocks.
  vi.mocked(evaluateAccountEmergency).mockResolvedValue(null);
});

describe('evaluatePhase — routes to phase-specific policy', () => {
  it('routes Phase A to evaluatePhaseA', async () => {
    const result = await evaluatePhase(mkInput(mkState({ currentPhase: 'A' })));

    expect(evaluatePhaseA).toHaveBeenCalledWith({
      ad_id: 'ad_test',
      ad_set_id: 'as_test',
    });
    expect(evaluatePhaseB).not.toHaveBeenCalled();
    expect(result.action).toBe('hold');
    expect(result.reason).toBe('phase_a_pre_launch');
  });

  it('routes Phase B to evaluatePhaseB with spend_cap_hit defaulted to false', async () => {
    const result = await evaluatePhase(mkInput(mkState({ currentPhase: 'B' })));

    expect(evaluatePhaseB).toHaveBeenCalledTimes(1);
    const arg = vi.mocked(evaluatePhaseB).mock.calls[0]![0];
    expect(arg.ad_id).toBe('ad_test');
    expect(arg.account.spend_cap_hit).toBe(false);
    expect(arg.account.disapproval_rate).toBe(0.0);
    expect(result.action).toBe('hold');
  });

  it('routes Phase C to evaluatePhaseC with metric + signups passed through', async () => {
    const input = mkInput(mkState({ currentPhase: 'C' }));
    const result = await evaluatePhase(input);

    expect(evaluatePhaseC).toHaveBeenCalledTimes(1);
    const arg = vi.mocked(evaluatePhaseC).mock.calls[0]![0];
    expect(arg.metric).toBe(input.metric);
    expect(arg.signups_per_week).toBe(input.signups_per_week);
    expect(result.action).toBe('maintain');
    expect(result.reason).toBe('phase_c_steady_state');
  });

  it('routes Phase D to evaluatePhaseD with metric passed through', async () => {
    const input = mkInput(mkState({ currentPhase: 'D' }));
    const result = await evaluatePhase(input);

    expect(evaluatePhaseD).toHaveBeenCalledTimes(1);
    const arg = vi.mocked(evaluatePhaseD).mock.calls[0]![0];
    expect(arg.metric).toBe(input.metric);
    expect(result.action).toBe('maintain');
    expect(result.reason).toBe('phase_d_no_action_yet');
  });
});

describe('evaluatePhase — account-emergency override', () => {
  it('overrides phase routing when account-emergency triggers', async () => {
    vi.mocked(evaluateAccountEmergency).mockResolvedValueOnce({
      ad_id: '*',
      action: 'pause',
      reason: 'account_emergency_status_disabled',
    });

    const result = await evaluatePhase(mkInput(mkState({ currentPhase: 'C' })));

    // No phase policy should run when an emergency fires.
    expect(evaluatePhaseA).not.toHaveBeenCalled();
    expect(evaluatePhaseB).not.toHaveBeenCalled();
    expect(evaluatePhaseC).not.toHaveBeenCalled();
    expect(evaluatePhaseD).not.toHaveBeenCalled();

    // ad_id must be rewritten from '*' to the per-ad ad_id.
    expect(result.ad_id).toBe('ad_test');
    expect(result.action).toBe('pause');
    expect(result.reason).toBe('account_emergency_status_disabled');
  });

  it('overrides even when phase is PAUSED (cross-phase)', async () => {
    vi.mocked(evaluateAccountEmergency).mockResolvedValueOnce({
      ad_id: '*',
      action: 'pause',
      reason: 'account_emergency_quality_below_avg',
    });

    const result = await evaluatePhase(mkInput(mkState({ currentPhase: 'PAUSED' })));

    expect(result.action).toBe('pause');
    expect(result.reason).toBe('account_emergency_quality_below_avg');
  });
});

describe('evaluatePhase — terminal phases hold', () => {
  it('returns hold with reason=phase_paused for PAUSED ad sets', async () => {
    const result = await evaluatePhase(mkInput(mkState({ currentPhase: 'PAUSED' })));

    expect(evaluatePhaseA).not.toHaveBeenCalled();
    expect(evaluatePhaseB).not.toHaveBeenCalled();
    expect(evaluatePhaseC).not.toHaveBeenCalled();
    expect(evaluatePhaseD).not.toHaveBeenCalled();
    expect(result).toEqual({
      ad_id: 'ad_test',
      action: 'hold',
      reason: 'phase_paused',
    });
  });

  it('returns hold with reason=phase_retired for RETIRED ad sets', async () => {
    const result = await evaluatePhase(mkInput(mkState({ currentPhase: 'RETIRED' })));

    expect(result).toEqual({
      ad_id: 'ad_test',
      action: 'hold',
      reason: 'phase_retired',
    });
  });
});

describe('evaluatePhase — defensive fallthrough', () => {
  it('returns hold with unknown_phase reason for an unrecognised phase', async () => {
    // Cast through unknown to bypass the union; simulates a future enum value
    // or a corrupt DB row reaching the orchestrator.
    const result = await evaluatePhase(
      mkInput(mkState({ currentPhase: 'WAT' as unknown as AdSetState['currentPhase'] })),
    );

    expect(result).toEqual({
      ad_id: 'ad_test',
      action: 'hold',
      reason: 'unknown_phase_WAT',
    });
  });
});
