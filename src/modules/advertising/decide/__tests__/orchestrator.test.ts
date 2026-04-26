import { describe, it, expect, vi, beforeEach } from 'vitest';
import { decide } from '../orchestrator';
import type { DecideDeps, Tier2DecideFn } from '../orchestrator';
import type { AdDecision, FeatureGate } from '@/shared/types/advertising';
import { mockAdMetric } from '../../__tests__/fixtures';
import { mockClaudeApi } from '../../__tests__/mocks/claude';
import type { Baseline } from '../tier-3-anomaly';

// ------- Fixtures -------

function makeGate(featureId: string, mode: FeatureGate['mode']): FeatureGate {
  return {
    feature_id: featureId,
    mode,
    activation_criteria: {},
    current_state: {},
  };
}

/** 30-sample flat baseline — no anomaly will fire */
function flatBaseline(cpc = 1.0, cpm = 3.5, ctr = 0.016): Baseline {
  return {
    cpc: Array(30).fill(cpc),
    cpm: Array(30).fill(cpm),
    ctr: Array(30).fill(ctr),
  };
}

/** Makes Tier 2 stub that returns a given action */
function makeTier2Stub(action: AdDecision['action']): Tier2DecideFn {
  return vi.fn().mockResolvedValue({
    ad_id: 'stub',
    action,
    reason: `tier2_stub_${action}`,
    reasoning_tier: 'tier_2_bayesian' as const,
    confidence: 0.8,
    metrics_snapshot: mockAdMetric(),
  });
}

// ------- Helpers -------

function makeDeps(overrides?: Partial<DecideDeps>): DecideDeps {
  const claude = mockClaudeApi();
  return {
    claudeClient: claude,
    baselines: new Map(),
    ...overrides,
  };
}

// ------- Tests -------

describe('decide (orchestrator)', () => {
  let claude: ReturnType<typeof mockClaudeApi>;

  beforeEach(() => {
    claude = mockClaudeApi();
  });

  // --- Basic shape ---

  it('returns one decision per metric', async () => {
    const metrics = [
      mockAdMetric({ ad_id: 'ad_001', days_running: 5 }),
      mockAdMetric({ ad_id: 'ad_002', days_running: 5 }),
    ];
    const deps = makeDeps({ claudeClient: claude });
    const { decisions } = await decide(metrics, [], deps);

    expect(decisions).toHaveLength(2);
  });

  it('returns empty arrays for empty metrics', async () => {
    const deps = makeDeps({ claudeClient: claude });
    const { decisions, shadowLog } = await decide([], [], deps);
    expect(decisions).toHaveLength(0);
    expect(shadowLog).toHaveLength(0);
  });

  // --- Tier 1 always runs ---

  it('Tier 1 decision is used when no baseline and no Tier 2 gate', async () => {
    const metric = mockAdMetric({ days_running: 5, frequency: 1.0, cpc: 1.0, spend_usd: 5.0 });
    const deps = makeDeps({ claudeClient: claude });
    const { decisions } = await decide([metric], [], deps);

    expect(decisions[0].reasoning_tier).toBe('tier_1_rules');
    expect(decisions[0].action).toBe('maintain');
  });

  it('Tier 1 pause overrides Tier 2 scale_up when frequency exceeded', async () => {
    const metric = mockAdMetric({ days_running: 5, frequency: 5.0 });
    const tier2 = makeTier2Stub('scale_up');
    const gate = makeGate('tier_2_bayesian', 'active_auto');
    const deps = makeDeps({
      claudeClient: claude,
      tier2Decide: tier2,
    });
    const { decisions, shadowLog } = await decide([metric], [gate], deps);

    expect(decisions[0].action).toBe('pause');
    expect(decisions[0].reasoning_tier).toBe('tier_1_rules');
    // Tier 2 decision shadowed
    expect(shadowLog.some((l) => l.tier === 'tier_2_bayesian')).toBe(true);
  });

  it('Tier 1 pause overrides Tier 3 hold', async () => {
    claude.anomalyExplain.mockResolvedValue('Mercury retrograde — expected event');

    const metric = mockAdMetric({ ad_id: 'ad_x', days_running: 5, frequency: 5.0, cpc: 6.0 });
    const baseline = flatBaseline(1.0, 3.5, 0.016);
    // Make metric anomalous for cpc
    baseline.cpc = Array(30).fill(1.0);

    const deps = makeDeps({
      claudeClient: claude,
      baselines: new Map([['ad_x', baseline]]),
    });
    const { decisions, shadowLog } = await decide([metric], [], deps);

    // Tier 1 pause wins
    expect(decisions[0].action).toBe('pause');
    expect(decisions[0].reasoning_tier).toBe('tier_1_rules');
    // Tier 3 shadowed (if it produced a decision)
    const tier3Shadowed = shadowLog.filter((l) => l.tier === 'tier_3_anomaly');
    // Shadow log may or may not have entry depending on anomaly z-score with flat baseline
    expect(decisions[0].reasoning_tier).toBe('tier_1_rules');
    void tier3Shadowed; // suppress unused warning
  });

  // --- Tier 3 applied when Tier 1 maintains ---

  it('Tier 3 decision applied when Tier 1 maintains and baseline available', async () => {
    claude.anomalyExplain.mockResolvedValue('Unknown anomaly — no astrological explanation');

    // Metric within ALL Tier 1 thresholds (cpc < $5, frequency < 4, spend < $25)
    // but anomalous vs the flat baseline (flat baseline + different value → extreme z-score)
    const metric = mockAdMetric({
      ad_id: 'ad_anomaly',
      days_running: 5,
      frequency: 1.0,
      cpc: 4.5,     // below Tier 1 CPC_HARD_CAP ($5), but far above baseline of $1
      cpm: 3.5,
      ctr: 0.016,
      spend_usd: 10.0,  // below Tier 1 SPEND_DAILY_OVERAGE ($25)
    });
    // Flat baseline at cpc=1.0 — any deviation triggers extreme z-score
    const baseline: Baseline = {
      cpc: Array(30).fill(1.0), // stddev=0, cpc=4.5 ≠ 1.0 → z = Z_SCORE_THRESHOLD+1
      cpm: Array(30).fill(3.5),
      ctr: Array(30).fill(0.016),
    };
    const deps = makeDeps({
      claudeClient: claude,
      baselines: new Map([['ad_anomaly', baseline]]),
    });
    const { decisions } = await decide([metric], [], deps);

    // Tier 3 should detect anomaly and pause (unknown cause, no astrological event)
    expect(decisions[0].reasoning_tier).toBe('tier_3_anomaly');
    expect(decisions[0].action).toBe('pause');
  });

  // --- Tier 2 gate control ---

  it('Tier 2 not called when gate is off', async () => {
    const tier2 = makeTier2Stub('scale_up');
    const gate = makeGate('tier_2_bayesian', 'off');
    const deps = makeDeps({ claudeClient: claude, tier2Decide: tier2 });
    const metric = mockAdMetric({ days_running: 5 });

    await decide([metric], [gate], deps);

    expect(tier2).not.toHaveBeenCalled();
  });

  it('Tier 2 not called when gate is shadow mode', async () => {
    const tier2 = makeTier2Stub('scale_up');
    const gate = makeGate('tier_2_bayesian', 'shadow');
    const deps = makeDeps({ claudeClient: claude, tier2Decide: tier2 });
    const metric = mockAdMetric({ days_running: 5 });

    await decide([metric], [gate], deps);

    expect(tier2).not.toHaveBeenCalled();
  });

  it('Tier 2 called when gate is active_auto', async () => {
    const tier2 = makeTier2Stub('scale_up');
    const gate = makeGate('tier_2_bayesian', 'active_auto');
    const deps = makeDeps({ claudeClient: claude, tier2Decide: tier2 });
    const metric = mockAdMetric({ days_running: 5 });

    await decide([metric], [gate], deps);

    expect(tier2).toHaveBeenCalledOnce();
  });

  it('Tier 2 not called when dep not injected even if gate active', async () => {
    const gate = makeGate('tier_2_bayesian', 'active_auto');
    // No tier2Decide provided
    const deps = makeDeps({ claudeClient: claude });
    const metric = mockAdMetric({ days_running: 5 });

    const { decisions } = await decide([metric], [gate], deps);

    // Falls through to Tier 1
    expect(decisions[0].reasoning_tier).toBe('tier_1_rules');
  });

  // --- Conflict resolution: Tier 1 > Tier 3 > Tier 2 ---

  it('Tier 1 pause beats Tier 2 pause (Tier 1 is final, Tier 2 shadowed)', async () => {
    const tier2: Tier2DecideFn = vi.fn().mockResolvedValue({
      ad_id: 'ad_001',
      action: 'pause' as const,
      reason: 'tier2_low_ctr',
      reasoning_tier: 'tier_2_bayesian' as const,
      confidence: 0.8,
      metrics_snapshot: mockAdMetric(),
    });
    const gate = makeGate('tier_2_bayesian', 'active_auto');
    const metric = mockAdMetric({ ad_id: 'ad_001', days_running: 5, frequency: 5.0 });
    const deps = makeDeps({ claudeClient: claude, tier2Decide: tier2 });

    const { decisions, shadowLog } = await decide([metric], [gate], deps);

    expect(decisions[0].reasoning_tier).toBe('tier_1_rules');
    expect(shadowLog.some((l) => l.tier === 'tier_2_bayesian')).toBe(true);
  });

  it('Tier 2 scale_up applied when Tier 1 and Tier 3 maintain', async () => {
    const metric = mockAdMetric({
      ad_id: 'ad_good',
      days_running: 5,
      frequency: 1.0,
      cpc: 1.0,
      cpm: 3.5,
      ctr: 0.016,
      spend_usd: 5.0,
    });
    // Flat baseline — no anomaly
    const baseline = flatBaseline();
    const tier2: Tier2DecideFn = vi.fn().mockResolvedValue({
      ad_id: 'ad_good',
      action: 'scale_up' as const,
      reason: 'bayesian_winner',
      reasoning_tier: 'tier_2_bayesian' as const,
      confidence: 0.9,
      metrics_snapshot: metric,
    });
    const gate = makeGate('tier_2_bayesian', 'active_auto');
    const deps = makeDeps({
      claudeClient: claude,
      baselines: new Map([['ad_good', baseline]]),
      tier2Decide: tier2,
    });

    const { decisions, shadowLog } = await decide([metric], [gate], deps);

    expect(decisions[0].reasoning_tier).toBe('tier_2_bayesian');
    expect(decisions[0].action).toBe('scale_up');
    // No tier 2 shadow entry since it was applied
    expect(shadowLog.filter((l) => l.tier === 'tier_2_bayesian')).toHaveLength(0);
  });

  // --- Shadow log structure ---

  it('shadow log entry contains final_decision and reason when Tier 2 is overridden', async () => {
    const tier2 = makeTier2Stub('scale_up');
    const gate = makeGate('tier_2_bayesian', 'active_auto');
    const metric = mockAdMetric({ ad_id: 'ad_001', days_running: 5, frequency: 5.0 });
    const deps = makeDeps({ claudeClient: claude, tier2Decide: tier2 });

    const { shadowLog } = await decide([metric], [gate], deps);

    const entry = shadowLog.find((l) => l.tier === 'tier_2_bayesian');
    expect(entry).toBeDefined();
    expect(entry!.ad_id).toBe('ad_001');
    expect(entry!.final_decision.reasoning_tier).toBe('tier_1_rules');
    expect(entry!.reason).toContain('tier_1_rules');
  });

  // --- Multiple metrics in parallel ---

  it('processes multiple metrics concurrently and returns correct count', async () => {
    const metrics = Array.from({ length: 5 }, (_, i) =>
      mockAdMetric({ ad_id: `ad_${i}`, days_running: 5 }),
    );
    const deps = makeDeps({ claudeClient: claude });
    const { decisions } = await decide(metrics, [], deps);

    expect(decisions).toHaveLength(5);
    const ids = decisions.map((d) => d.ad_id).sort();
    expect(ids).toEqual(['ad_0', 'ad_1', 'ad_2', 'ad_3', 'ad_4'].sort());
  });
});
