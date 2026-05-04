import { describe, it, expect, vi, beforeEach } from 'vitest';

import { COLD_START_DEFAULTS, type ThresholdName } from '../../targets';

// Mock threshold-resolver to deterministically return code defaults so the
// tests aren't coupled to DB state. Individual tests can then override.
vi.mock('../../threshold-resolver', () => ({
  resolveThreshold: vi.fn(
    async (metric: ThresholdName) => COLD_START_DEFAULTS[metric] as number,
  ),
}));

// Import AFTER vi.mock so the mocked module is wired into evaluatePhaseC.
import { evaluatePhaseC, type PhaseCInput, type PhaseCMetrics } from '../phase-c';
import type { AdSetState } from '../../state-store';

// ──────────────────────────────────────────────────────────────────────────
// Test fixtures: build minimal AdSetState + PhaseCMetrics objects. We cast
// through `as AdSetState` because the schema-derived row type carries many
// columns the policy never reads (timestamps, audit flags, etc.).
// ──────────────────────────────────────────────────────────────────────────

function mkState(overrides: Partial<Record<keyof AdSetState, unknown>> = {}): AdSetState {
  return {
    adSetId: 'as_test',
    campaignId: 'cmp_test',
    locale: 'en',
    currentPhase: 'C',
    optimizationEvent: 'Subscribe',
    conversions7dMeta: 0,
    duplicatesCount: 0,
    ...overrides,
  } as AdSetState;
}

/** Healthy steady-state metrics: not pausing, not scaling, frequency safe. */
function healthyMetrics(overrides: Partial<PhaseCMetrics> = {}): PhaseCMetrics {
  return {
    cpa_7d: 10.0, // == target_cpa_subscription_usd → not above pause threshold
    roas_7d: 2.0, // == target_roas_subscription
    roas_14d: 2.0,
    frequency_current: 1.5,
    sustained_days_above_cpa: 0,
    sustained_days_below_roas14d: 0,
    sustained_days_above_scale_criteria: 0,
    ...overrides,
  };
}

function mkInput(
  state: AdSetState,
  metric: PhaseCMetrics,
  signups: { lead: number; subscribe: number } = { lead: 0, subscribe: 0 },
): PhaseCInput {
  return { ad_id: 'ad_test', state, metric, signups_per_week: signups };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('evaluatePhaseC — Q9 pause path', () => {
  it('pauses when cpa_7d > 2× target AND sustained ≥ 7d', async () => {
    const result = await evaluatePhaseC(
      mkInput(
        mkState(),
        healthyMetrics({ cpa_7d: 25.0, sustained_days_above_cpa: 8 }),
      ),
    );
    expect(result.action).toBe('pause');
    expect(result.reason).toContain('cpa_above_2x');
  });

  it('does NOT pause when cpa is high but not sustained long enough', async () => {
    const result = await evaluatePhaseC(
      mkInput(
        mkState(),
        healthyMetrics({ cpa_7d: 25.0, sustained_days_above_cpa: 3 }),
      ),
    );
    expect(result.action).not.toBe('pause');
  });

  it('pauses when roas_14d < 0.5× target AND sustained ≥ 14d', async () => {
    const result = await evaluatePhaseC(
      mkInput(
        mkState(),
        healthyMetrics({ roas_14d: 0.4, sustained_days_below_roas14d: 14 }),
      ),
    );
    expect(result.action).toBe('pause');
    expect(result.reason).toContain('roas_below_0.5x');
  });

  it('does NOT pause when low roas hasn\'t held the full 14d window', async () => {
    const result = await evaluatePhaseC(
      mkInput(
        mkState(),
        healthyMetrics({ roas_14d: 0.4, sustained_days_below_roas14d: 7 }),
      ),
    );
    expect(result.action).not.toBe('pause');
  });

  it('escalates to Phase D when frequency_current exceeds saturation cap', async () => {
    const result = await evaluatePhaseC(
      mkInput(mkState(), healthyMetrics({ frequency_current: 4.5 })),
    );
    expect(result.action).toBe('maintain');
    expect(result.reason).toContain('escalate_to_phase_d');
    expect(result.reason).toContain('4.50');
  });
});

describe('evaluatePhaseC — Q11 hybrid event switch', () => {
  it('switches LPV → Lead when conversions_7d_meta ≥ 50', async () => {
    const result = await evaluatePhaseC(
      mkInput(
        mkState({ optimizationEvent: 'landing_page_view', conversions7dMeta: 60 }),
        healthyMetrics(),
      ),
    );
    expect(result.action).toBe('hybrid_event_switch');
    expect(result.reason).toContain('switch_to_Lead');
  });

  it('does NOT switch LPV → Lead when conversions_7d_meta < 50', async () => {
    const result = await evaluatePhaseC(
      mkInput(
        mkState({ optimizationEvent: 'landing_page_view', conversions7dMeta: 20 }),
        healthyMetrics(),
      ),
    );
    expect(result.action).toBe('maintain');
  });

  it('switches Lead → Subscribe when both lead/wk and sub/wk thresholds met', async () => {
    const result = await evaluatePhaseC(
      mkInput(
        mkState({ optimizationEvent: 'Lead' }),
        healthyMetrics(),
        { lead: 120, subscribe: 12 },
      ),
    );
    expect(result.action).toBe('hybrid_event_switch');
    expect(result.reason).toContain('switch_to_Subscribe');
  });

  it('does NOT switch Lead → Subscribe when sub/wk below threshold', async () => {
    const result = await evaluatePhaseC(
      mkInput(
        mkState({ optimizationEvent: 'Lead' }),
        healthyMetrics(),
        { lead: 120, subscribe: 5 },
      ),
    );
    expect(result.action).toBe('maintain');
  });
});

describe('evaluatePhaseC — Q8 scale path', () => {
  const scaleMetrics = healthyMetrics({
    roas_7d: 4.5, // ≥ 2× target_roas_subscription (2.0) ⇒ 4.0 trigger
    cpa_7d: 5.5, // < 0.6× target_cpa_subscription_usd (10) ⇒ 6.0 trigger
    frequency_current: 1.8, // < 2.5
    sustained_days_above_scale_criteria: 8,
  });

  it('duplicates when ROAS gate passes (with sustained + freq + budget)', async () => {
    const result = await evaluatePhaseC(
      mkInput(mkState(), { ...scaleMetrics, cpa_7d: 9.5 /* CPA gate fails */ }),
    );
    expect(result.action).toBe('duplicate');
    expect(result.reason).toContain('scale_criteria_met');
  });

  it('duplicates when CPA gate passes (with ROAS failing)', async () => {
    const result = await evaluatePhaseC(
      mkInput(mkState(), { ...scaleMetrics, roas_7d: 1.0 /* ROAS gate fails */ }),
    );
    expect(result.action).toBe('duplicate');
  });

  it('does NOT duplicate when parent ad set has reached max duplicates', async () => {
    const result = await evaluatePhaseC(
      mkInput(
        mkState({ duplicatesCount: 2 /* equals scale_max_duplicates_per_parent */ }),
        scaleMetrics,
      ),
    );
    expect(result.action).toBe('maintain');
    expect(result.reason).toBe('phase_c_steady_state');
  });

  it('does NOT duplicate when frequency is at or above the scale cap', async () => {
    const result = await evaluatePhaseC(
      mkInput(mkState(), { ...scaleMetrics, frequency_current: 2.6 }),
    );
    expect(result.action).toBe('maintain');
  });

  it('does NOT duplicate when scale criteria have not held long enough', async () => {
    const result = await evaluatePhaseC(
      mkInput(mkState(), { ...scaleMetrics, sustained_days_above_scale_criteria: 3 }),
    );
    expect(result.action).toBe('maintain');
  });
});

describe('evaluatePhaseC — default', () => {
  it('returns maintain on ambiguous middling metrics', async () => {
    const result = await evaluatePhaseC(mkInput(mkState(), healthyMetrics()));
    expect(result.action).toBe('maintain');
    expect(result.reason).toBe('phase_c_steady_state');
  });

  it('pause priority: pause-rule fires even when scale gates would otherwise hit', async () => {
    // Both pause-cpa and scale-cpa criteria simultaneously satisfied; pause wins.
    const result = await evaluatePhaseC(
      mkInput(
        mkState({ duplicatesCount: 0 }),
        healthyMetrics({
          cpa_7d: 25.0,
          sustained_days_above_cpa: 10,
          roas_7d: 5.0,
          sustained_days_above_scale_criteria: 14,
        }),
      ),
    );
    expect(result.action).toBe('pause');
  });
});
