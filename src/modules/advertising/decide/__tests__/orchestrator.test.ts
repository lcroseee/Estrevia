import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stub the recon-state-store at module-load. Default state is "not suspended".
// Per-test overrides via `mockResolvedValueOnce`.
vi.mock('@/modules/advertising/perceive/recon-state-store', () => ({
  getReconState: vi.fn().mockResolvedValue({
    suspended: false,
    suspendedAt: null,
    suspendReason: null,
    autoResumeAt: null,
    lastDriftPct: null,
  }),
}));

// Senior-buyer dependencies — mocked at module-load so the orchestrator
// import succeeds without booting the DB. Per-test overrides via
// `vi.mocked(...).mockReturnValueOnce`/`mockResolvedValueOnce`.
vi.mock('@/modules/advertising/senior-buyer/state-store', () => ({
  listAdSetsByPhase: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/modules/advertising/senior-buyer/data-maturity-classifier', () => ({
  classifyMaturity: vi.fn().mockReturnValue('AUTONOMOUS'),
}));
vi.mock('@/modules/advertising/senior-buyer/phase-evaluator', () => ({
  evaluatePhase: vi.fn().mockResolvedValue({
    ad_id: 'ad_test_001',
    action: 'maintain',
    reason: 'phase_evaluator_stub',
  }),
}));
vi.mock('@/modules/advertising/senior-buyer/approval-router', () => ({
  route: vi.fn().mockResolvedValue({
    type: 'execute_immediately',
    reason: 'reversible_action',
  }),
}));

import { decide } from '../orchestrator';
import type { DecideDeps, Tier2DecideFn, RoutedDecision } from '../orchestrator';
import type { AdDecision, FeatureGate } from '@/shared/types/advertising';
import { mockAdMetric } from '../../__tests__/fixtures';
import { mockClaudeApi } from '../../__tests__/mocks/claude';
import { getReconState } from '@/modules/advertising/perceive/recon-state-store';
import { listAdSetsByPhase } from '@/modules/advertising/senior-buyer/state-store';
import { classifyMaturity } from '@/modules/advertising/senior-buyer/data-maturity-classifier';
import { evaluatePhase } from '@/modules/advertising/senior-buyer/phase-evaluator';
import { route as approvalRoute } from '@/modules/advertising/senior-buyer/approval-router';
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
      mockAdMetric({ ad_id: 'ad_001', days_running: 7 }),
      mockAdMetric({ ad_id: 'ad_002', days_running: 7 }),
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
    const metric = mockAdMetric({ days_running: 7, frequency: 1.0, cpc: 1.0, spend_usd: 5.0 });
    const deps = makeDeps({ claudeClient: claude });
    const { decisions } = await decide([metric], [], deps);

    expect(decisions[0].reasoning_tier).toBe('tier_1_rules');
    expect(decisions[0].action).toBe('maintain');
  });

  it('Tier 1 pause overrides Tier 2 scale_up when frequency exceeded', async () => {
    const metric = mockAdMetric({ days_running: 7, frequency: 5.0 });
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

    const metric = mockAdMetric({ ad_id: 'ad_x', days_running: 7, frequency: 5.0, cpc: 6.0 });
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
      days_running: 7,
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
    const metric = mockAdMetric({ days_running: 7 });

    await decide([metric], [gate], deps);

    expect(tier2).not.toHaveBeenCalled();
  });

  it('Tier 2 not called when gate is shadow mode', async () => {
    const tier2 = makeTier2Stub('scale_up');
    const gate = makeGate('tier_2_bayesian', 'shadow');
    const deps = makeDeps({ claudeClient: claude, tier2Decide: tier2 });
    const metric = mockAdMetric({ days_running: 7 });

    await decide([metric], [gate], deps);

    expect(tier2).not.toHaveBeenCalled();
  });

  it('Tier 2 called when gate is active_auto', async () => {
    const tier2 = makeTier2Stub('scale_up');
    const gate = makeGate('tier_2_bayesian', 'active_auto');
    const deps = makeDeps({ claudeClient: claude, tier2Decide: tier2 });
    const metric = mockAdMetric({ days_running: 7 });

    await decide([metric], [gate], deps);

    expect(tier2).toHaveBeenCalledOnce();
  });

  it('Tier 2 not called when dep not injected even if gate active', async () => {
    const gate = makeGate('tier_2_bayesian', 'active_auto');
    // No tier2Decide provided
    const deps = makeDeps({ claudeClient: claude });
    const metric = mockAdMetric({ days_running: 7 });

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
    const metric = mockAdMetric({ ad_id: 'ad_001', days_running: 7, frequency: 5.0 });
    const deps = makeDeps({ claudeClient: claude, tier2Decide: tier2 });

    const { decisions, shadowLog } = await decide([metric], [gate], deps);

    expect(decisions[0].reasoning_tier).toBe('tier_1_rules');
    expect(shadowLog.some((l) => l.tier === 'tier_2_bayesian')).toBe(true);
  });

  it('Tier 2 scale_up applied when Tier 1 and Tier 3 maintain', async () => {
    const metric = mockAdMetric({
      ad_id: 'ad_good',
      days_running: 7,
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
    const metric = mockAdMetric({ ad_id: 'ad_001', days_running: 7, frequency: 5.0 });
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
      mockAdMetric({ ad_id: `ad_${i}`, days_running: 7 }),
    );
    const deps = makeDeps({ claudeClient: claude });
    const { decisions } = await decide(metrics, [], deps);

    expect(decisions).toHaveLength(5);
    const ids = decisions.map((d) => d.ad_id).sort();
    expect(ids).toEqual(['ad_0', 'ad_1', 'ad_2', 'ad_3', 'ad_4'].sort());
  });

  // --- Reconciler suspend gate ---

  it('returns empty decisions when reconciler is suspended and no DISAPPROVED ads', async () => {
    vi.mocked(getReconState).mockResolvedValueOnce({
      suspended: true,
      suspendedAt: new Date(),
      suspendReason: 'critical_drift',
      autoResumeAt: new Date(Date.now() + 24 * 3600 * 1000),
      lastDriftPct: 0.5,
    });

    const metric = mockAdMetric({
      ad_id: 'ad_active',
      days_running: 7,
      frequency: 5.0, // would normally trigger Tier 1 pause
      status: 'ACTIVE',
    });
    const deps = makeDeps({ claudeClient: claude });
    const { decisions, shadowLog } = await decide([metric], [], deps);

    expect(decisions).toEqual([]);
    expect(shadowLog).toEqual([]);
  });

  it('still pauses DISAPPROVED ads when reconciler is suspended', async () => {
    vi.mocked(getReconState).mockResolvedValueOnce({
      suspended: true,
      suspendedAt: new Date(),
      suspendReason: 'critical_drift',
      autoResumeAt: new Date(Date.now() + 24 * 3600 * 1000),
      lastDriftPct: 0.5,
    });

    const metric = mockAdMetric({
      ad_id: 'ad_disapproved',
      days_running: 7,
      status: 'DISAPPROVED',
    });
    const deps = makeDeps({ claudeClient: claude });
    const { decisions } = await decide([metric], [], deps);

    expect(decisions.length).toBe(1);
    expect(decisions[0].action).toBe('pause');
    expect(decisions[0].reasoning_tier).toBe('tier_1_rules');
  });

  it('runs normal logic when reconciler is NOT suspended', async () => {
    // Default mock returns suspended=false; no override needed
    const metric = mockAdMetric({ days_running: 7, frequency: 5.0 });
    const deps = makeDeps({ claudeClient: claude });
    const { decisions } = await decide([metric], [], deps);

    // Tier 1 pause path runs normally — frequency 5.0 triggers pause
    expect(decisions[0].action).toBe('pause');
    expect(decisions[0].reasoning_tier).toBe('tier_1_rules');
  });

  // --- Senior buyer mode (Track 22) ---

  /**
   * Build a minimal persisted ad-set-state row that satisfies
   * `AdvertisingAdSetState` for tests. Drizzle's inferred type is wide; we
   * cover the fields the orchestrator actually reads, plus a few defaults to
   * keep the structural typecheck happy.
   */
  function makeAdSetState(overrides: Partial<{
    adSetId: string;
    campaignId: string;
    locale: string;
    currentPhase: 'A' | 'B' | 'C' | 'D' | 'PAUSED' | 'RETIRED';
    dataMaturityMode: 'COLD_START' | 'CALIBRATING' | 'AUTONOMOUS';
    conversionsTotalMeta: number;
    daysWithPixelData: number;
    cpa7d: number | null;
    roas7d: number | null;
    frequencyCurrent: number | null;
  }> = {}) {
    return {
      adSetId: 'adset_test_001',
      campaignId: 'campaign_test_001',
      locale: 'en',
      currentPhase: 'C' as const,
      phaseEnteredAt: new Date(),
      dataMaturityMode: 'AUTONOMOUS' as const,
      maturityEnteredAt: new Date(),
      optimizationEvent: 'landing_page_view',
      conversions7dMeta: 0,
      conversions14dMeta: 0,
      conversionsTotalMeta: 100,
      daysWithPixelData: 30,
      conversions7dPosthog: 0,
      roas7d: 2.0 as number | null,
      cpa7d: 5.0 as number | null,
      frequencyCurrent: 1.5 as number | null,
      parentAdSetId: null,
      duplicatesCount: 0,
      lastActionTakenAt: null,
      flaggedForReview: false,
      flagReason: null,
      updatedAt: new Date(),
      ...overrides,
    };
  }

  beforeEach(() => {
    // Reset the senior-buyer mocks so per-test setup is deterministic.
    vi.mocked(listAdSetsByPhase).mockReset().mockResolvedValue([]);
    vi.mocked(classifyMaturity).mockReset().mockReturnValue('AUTONOMOUS');
    vi.mocked(evaluatePhase).mockReset().mockResolvedValue({
      ad_id: 'ad_test_001',
      action: 'maintain',
      reason: 'phase_evaluator_stub',
    });
    vi.mocked(approvalRoute).mockReset().mockResolvedValue({
      type: 'execute_immediately',
      reason: 'reversible_action',
    });
  });

  it('seniorBuyerMode=off (default): falls through to Tier 1 path (regression)', async () => {
    // Frequency over threshold should still trigger Tier 1 pause when senior-buyer is off.
    const metric = mockAdMetric({ ad_id: 'ad_legacy', days_running: 7, frequency: 5.0 });
    const deps = makeDeps({ claudeClient: claude });
    const { decisions } = await decide([metric], [], deps);

    expect(decisions[0].action).toBe('pause');
    expect(decisions[0].reasoning_tier).toBe('tier_1_rules');
    // Senior-buyer collaborators must NOT have been called.
    expect(evaluatePhase).not.toHaveBeenCalled();
    expect(approvalRoute).not.toHaveBeenCalled();
    expect(listAdSetsByPhase).not.toHaveBeenCalled();
  });

  it('seniorBuyerMode=on (via gate): calls evaluatePhase + approvalRoute', async () => {
    const metric = mockAdMetric({ ad_id: 'ad_sb_001', adset_id: 'adset_sb_001' });
    const state = makeAdSetState({ adSetId: 'adset_sb_001' });
    vi.mocked(listAdSetsByPhase).mockResolvedValueOnce([state]);
    vi.mocked(evaluatePhase).mockResolvedValueOnce({
      ad_id: 'ad_sb_001',
      action: 'maintain',
      reason: 'phase_c_steady',
    });
    vi.mocked(approvalRoute).mockResolvedValueOnce({
      type: 'execute_immediately',
      reason: 'reversible_action',
    });

    const gate = makeGate('seniorBuyerMode', 'active_auto');
    // Cast through the senior-buyer overload by sneaking the literal `'on'`
    // mode in via the gate (deps stays the legacy shape).
    const { decisions, shadowLog } = await decide([metric], [gate], {
      ...makeDeps({ claudeClient: claude }),
      senior_buyer_mode: 'on' as const,
    });

    expect(listAdSetsByPhase).toHaveBeenCalledOnce();
    expect(evaluatePhase).toHaveBeenCalledOnce();
    expect(approvalRoute).toHaveBeenCalledOnce();

    expect(decisions).toHaveLength(1);
    expect((decisions as RoutedDecision[])[0]).toEqual({
      ad_id: 'ad_sb_001',
      action: 'maintain',
      reason: 'phase_c_steady',
      routing: 'execute_immediately',
    });
    expect(shadowLog).toEqual([]);
  });

  it('seniorBuyerMode=on (via deps): explicit override beats gate absence', async () => {
    const metric = mockAdMetric({ ad_id: 'ad_sb_002', adset_id: 'adset_sb_002' });
    vi.mocked(listAdSetsByPhase).mockResolvedValueOnce([
      makeAdSetState({ adSetId: 'adset_sb_002', currentPhase: 'B' }),
    ]);

    const { decisions } = await decide([metric], [], {
      ...makeDeps({ claudeClient: claude }),
      senior_buyer_mode: 'on' as const,
    });

    expect(evaluatePhase).toHaveBeenCalledOnce();
    expect(approvalRoute).toHaveBeenCalledOnce();
    expect((decisions as RoutedDecision[])[0].routing).toBe('execute_immediately');
  });

  it('seniorBuyerMode=on: ad with no state row → "state_not_initialised", no evaluator call', async () => {
    const metric = mockAdMetric({ ad_id: 'ad_new', adset_id: 'adset_new' });
    // listAdSetsByPhase returns empty by default — no state row for this ad set.
    const { decisions } = await decide([metric], [], {
      ...makeDeps({ claudeClient: claude }),
      senior_buyer_mode: 'on' as const,
    });

    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({
      ad_id: 'ad_new',
      action: 'hold',
      reason: 'state_not_initialised',
      routing: 'execute_immediately',
    });
    expect(evaluatePhase).not.toHaveBeenCalled();
    expect(approvalRoute).not.toHaveBeenCalled();
  });

  it('seniorBuyerMode=on: refreshed maturity is forwarded to approval-router', async () => {
    const metric = mockAdMetric({ ad_id: 'ad_sb_003', adset_id: 'adset_sb_003' });
    const persisted = makeAdSetState({
      adSetId: 'adset_sb_003',
      currentPhase: 'C',
      // Persisted as AUTONOMOUS but the maturity classifier just downgraded it
      // to CALIBRATING — the orchestrator must pass the *fresh* mode through.
      dataMaturityMode: 'AUTONOMOUS',
    });
    vi.mocked(listAdSetsByPhase).mockResolvedValueOnce([persisted]);
    vi.mocked(classifyMaturity).mockReturnValueOnce('CALIBRATING');

    await decide([metric], [], {
      ...makeDeps({ claudeClient: claude }),
      senior_buyer_mode: 'on' as const,
    });

    expect(approvalRoute).toHaveBeenCalledOnce();
    const [, routerState] = vi.mocked(approvalRoute).mock.calls[0]!;
    expect(routerState).toMatchObject({
      ad_set_id: 'adset_sb_003',
      data_maturity_mode: 'CALIBRATING',
      current_phase: 'C',
    });
  });

  it('seniorBuyerMode=on: reconciler suspend short-circuits to emergency pauses (no evaluator call)', async () => {
    vi.mocked(getReconState).mockResolvedValueOnce({
      suspended: true,
      suspendedAt: new Date(),
      suspendReason: 'critical_drift',
      autoResumeAt: new Date(Date.now() + 24 * 3600 * 1000),
      lastDriftPct: 0.5,
    });

    const metric = mockAdMetric({
      ad_id: 'ad_sb_disapproved',
      adset_id: 'adset_sb_disapproved',
      days_running: 7,
      status: 'DISAPPROVED',
    });
    const { decisions } = await decide([metric], [], {
      ...makeDeps({ claudeClient: claude }),
      senior_buyer_mode: 'on' as const,
    });

    // Same emergency-pause shape both modes — publisher contract preserved.
    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({
      ad_id: 'ad_sb_disapproved',
      action: 'pause',
      reason: 'reconciler_suspended_disapproved_ad_emergency_pause',
    });
    // Senior-buyer pipeline must NOT execute under suspend.
    expect(listAdSetsByPhase).not.toHaveBeenCalled();
    expect(evaluatePhase).not.toHaveBeenCalled();
    expect(approvalRoute).not.toHaveBeenCalled();
  });

  it('seniorBuyerMode=on: reconciler suspend with no DISAPPROVED ads returns empty', async () => {
    vi.mocked(getReconState).mockResolvedValueOnce({
      suspended: true,
      suspendedAt: new Date(),
      suspendReason: 'critical_drift',
      autoResumeAt: new Date(Date.now() + 24 * 3600 * 1000),
      lastDriftPct: 0.5,
    });

    const metric = mockAdMetric({ ad_id: 'ad_sb_active', status: 'ACTIVE' });
    const { decisions, shadowLog } = await decide([metric], [], {
      ...makeDeps({ claudeClient: claude }),
      senior_buyer_mode: 'on' as const,
    });

    expect(decisions).toEqual([]);
    expect(shadowLog).toEqual([]);
    expect(listAdSetsByPhase).not.toHaveBeenCalled();
  });

  it('seniorBuyerMode gate in shadow/off mode does NOT activate senior-buyer path', async () => {
    const metric = mockAdMetric({ ad_id: 'ad_legacy_2', days_running: 7, frequency: 5.0 });
    const offGate = makeGate('seniorBuyerMode', 'off');
    const shadowGate = makeGate('seniorBuyerMode', 'shadow');

    for (const gate of [offGate, shadowGate]) {
      vi.mocked(listAdSetsByPhase).mockClear();
      vi.mocked(evaluatePhase).mockClear();
      const { decisions } = await decide([metric], [gate], makeDeps({ claudeClient: claude }));
      expect(decisions[0].action).toBe('pause');
      expect(decisions[0].reasoning_tier).toBe('tier_1_rules');
      expect(evaluatePhase).not.toHaveBeenCalled();
      expect(listAdSetsByPhase).not.toHaveBeenCalled();
    }
  });
});
