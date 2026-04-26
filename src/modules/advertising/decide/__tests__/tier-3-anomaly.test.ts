import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectAnomaly } from '../tier-3-anomaly';
import type { Baseline, Tier3Deps } from '../tier-3-anomaly';
import { mockAdMetric } from '../../__tests__/fixtures';
import { mockClaudeApi } from '../../__tests__/mocks/claude';

// Helper: generate 30 samples with given mean and stddev
function generateBaseline(count: number, avg: number, sd: number): number[] {
  // Deterministic sequence so tests are reproducible
  return Array.from({ length: count }, (_, i) => avg + sd * Math.sin(i));
}

function makeFullBaseline(
  cpcAvg = 1.0,
  cpmAvg = 3.5,
  ctrAvg = 0.016,
  count = 30,
): Baseline {
  return {
    cpc: generateBaseline(count, cpcAvg, 0.1),
    cpm: generateBaseline(count, cpmAvg, 0.3),
    ctr: generateBaseline(count, ctrAvg, 0.002),
  };
}

function makePartialBaseline(count: number): Baseline {
  return {
    cpc: generateBaseline(count, 1.0, 0.1),
    cpm: generateBaseline(count, 3.5, 0.3),
    ctr: generateBaseline(count, 0.016, 0.002),
  };
}

describe('detectAnomaly', () => {
  let deps: Tier3Deps;
  let claude: ReturnType<typeof mockClaudeApi>;

  beforeEach(() => {
    claude = mockClaudeApi();
    deps = {
      claudeClient: claude,
      astroEvents: ['2026-05-08: Mercury retrograde begins'],
    };
  });

  // --- Baseline not ready ---

  it('returns undefined decision when baseline has fewer than 30 days (cpc)', async () => {
    const baseline = makePartialBaseline(20);
    const metric = mockAdMetric({ days_running: 5 });
    const result = await detectAnomaly(metric, baseline, deps);

    expect(result.decision).toBeUndefined();
    expect(result.anomalyDetected).toBe(false);
    expect(result.zScores.cpc).toBeNull();
    expect(claude.anomalyExplain).not.toHaveBeenCalled();
  });

  it('returns undefined when baseline is completely empty', async () => {
    const baseline: Baseline = { cpc: [], cpm: [], ctr: [] };
    const metric = mockAdMetric();
    const result = await detectAnomaly(metric, baseline, deps);

    expect(result.decision).toBeUndefined();
    expect(result.anomalyDetected).toBe(false);
    expect(claude.anomalyExplain).not.toHaveBeenCalled();
  });

  // --- No anomaly path ---

  it('returns maintain decision when metrics are within normal range', async () => {
    const baseline = makeFullBaseline(1.0, 3.5, 0.016);
    // Metric matches baseline mean — z-score ~ 0
    const metric = mockAdMetric({ cpc: 1.0, cpm: 3.5, ctr: 0.016 });
    const result = await detectAnomaly(metric, baseline, deps);

    expect(result.decision).toBeDefined();
    expect(result.decision!.action).toBe('maintain');
    expect(result.decision!.reasoning_tier).toBe('tier_3_anomaly');
    expect(result.anomalyDetected).toBe(false);
    expect(claude.anomalyExplain).not.toHaveBeenCalled();
  });

  // --- Anomaly detected, not expected event ---

  it('returns pause when z-score > 3 and LLM does not identify expected event', async () => {
    claude.anomalyExplain.mockResolvedValue('Unknown technical issue with ad delivery network');

    const baseline = makeFullBaseline(1.0, 3.5, 0.016);
    // CPC 5x the mean with tiny stddev — massively anomalous
    const metric = mockAdMetric({ cpc: 5.0, cpm: 3.5, ctr: 0.016 });
    const result = await detectAnomaly(metric, baseline, deps);

    expect(result.decision).toBeDefined();
    expect(result.decision!.action).toBe('pause');
    expect(result.decision!.reasoning_tier).toBe('tier_3_anomaly');
    expect(result.anomalyDetected).toBe(true);
    expect(result.explanation).toBe('Unknown technical issue with ad delivery network');
    expect(claude.anomalyExplain).toHaveBeenCalledOnce();
  });

  // --- Anomaly detected, expected astrological event → HOLD ---

  it('returns hold when LLM says mercury retrograde', async () => {
    claude.anomalyExplain.mockResolvedValue('Mercury retrograde started today — expect CTR drops');

    const baseline = makeFullBaseline(1.0, 3.5, 0.016);
    const metric = mockAdMetric({ cpc: 5.0, cpm: 3.5, ctr: 0.016 });
    const result = await detectAnomaly(metric, baseline, deps);

    expect(result.decision!.action).toBe('hold');
    expect(result.anomalyDetected).toBe(true);
  });

  it('returns hold when LLM mentions eclipse', async () => {
    claude.anomalyExplain.mockResolvedValue('Solar eclipse is causing unusual engagement patterns');

    const baseline = makeFullBaseline(1.0, 3.5, 0.016);
    const metric = mockAdMetric({ cpc: 5.0, cpm: 3.5, ctr: 0.016 });
    const result = await detectAnomaly(metric, baseline, deps);

    expect(result.decision!.action).toBe('hold');
  });

  it('returns hold when LLM mentions expected event keyword', async () => {
    claude.anomalyExplain.mockResolvedValue('This is an expected event based on planetary movement');

    const baseline = makeFullBaseline(1.0, 3.5, 0.016);
    const metric = mockAdMetric({ cpc: 5.0, cpm: 3.5, ctr: 0.016 });
    const result = await detectAnomaly(metric, baseline, deps);

    expect(result.decision!.action).toBe('hold');
  });

  // --- LLM context includes astro events ---

  it('passes metric and context to anomalyExplain when anomaly detected', async () => {
    claude.anomalyExplain.mockResolvedValue('Anomaly cause unknown');

    const baseline = makeFullBaseline(1.0, 3.5, 0.016);
    const metric = mockAdMetric({ cpc: 5.0, cpm: 3.5, ctr: 0.016, date: '2026-04-26' });
    await detectAnomaly(metric, baseline, deps);

    const [calledMetric, calledContext] = claude.anomalyExplain.mock.calls[0];
    expect(calledMetric).toBe(metric);
    expect(calledContext).toContain('2026-04-26');
    expect(calledContext).toContain('Mercury retrograde begins');
    expect(calledContext).toContain('CPC=');
  });

  // --- Decision fields ---

  it('always sets reasoning_tier to tier_3_anomaly', async () => {
    const baseline = makeFullBaseline();
    const metric = mockAdMetric({ cpc: 1.0, cpm: 3.5, ctr: 0.016 });
    const result = await detectAnomaly(metric, baseline, deps);

    expect(result.decision!.reasoning_tier).toBe('tier_3_anomaly');
  });

  it('confidence < 1 (probabilistic, not deterministic)', async () => {
    const baseline = makeFullBaseline();
    const metric = mockAdMetric({ cpc: 1.0, cpm: 3.5, ctr: 0.016 });
    const result = await detectAnomaly(metric, baseline, deps);

    expect(result.decision!.confidence).toBeLessThan(1.0);
  });

  it('propagates ad_id from metric', async () => {
    const baseline = makeFullBaseline();
    const metric = mockAdMetric({ ad_id: 'ad_xyz789', cpc: 1.0, cpm: 3.5, ctr: 0.016 });
    const result = await detectAnomaly(metric, baseline, deps);

    expect(result.decision!.ad_id).toBe('ad_xyz789');
  });

  // --- z-score reported ---

  it('reports z-scores in result when baseline is ready', async () => {
    const baseline = makeFullBaseline();
    const metric = mockAdMetric({ cpc: 1.0, cpm: 3.5, ctr: 0.016 });
    const result = await detectAnomaly(metric, baseline, deps);

    expect(result.zScores.cpc).not.toBeNull();
    expect(result.zScores.cpm).not.toBeNull();
    expect(result.zScores.ctr).not.toBeNull();
  });

  // --- Default astro events used when not injected ---

  it('uses default ASTRO_EVENTS_2026 when astroEvents not provided', async () => {
    claude.anomalyExplain.mockResolvedValue('Something weird');
    const depsNoEvents: Tier3Deps = { claudeClient: claude };
    const baseline = makeFullBaseline(1.0, 3.5, 0.016);
    const metric = mockAdMetric({ cpc: 5.0, cpm: 3.5, ctr: 0.016 });
    const result = await detectAnomaly(metric, baseline, depsNoEvents);

    expect(result.anomalyDetected).toBe(true);
    const [, context] = claude.anomalyExplain.mock.calls[0];
    expect(context).toContain('Mercury retrograde');
  });
});
