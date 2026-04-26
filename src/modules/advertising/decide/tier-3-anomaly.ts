import type { AdMetric, AdDecision } from '@/shared/types/advertising';

// Minimum observations needed before z-score is reliable
const BASELINE_MIN_DAYS = 30;

// z-score threshold to flag a metric as anomalous
const Z_SCORE_THRESHOLD = 3.0;

// Keywords in LLM explanation that indicate the anomaly is expected / astrological
const EXPECTED_EVENT_KEYWORDS = [
  'retrograde',
  'eclipse',
  'mercury retrograde',
  'full moon',
  'new moon',
  'solstice',
  'equinox',
  'expected event',
  'planetary',
] as const;

// Static list of notable 2026 astro events for LLM context injection
const ASTRO_EVENTS_2026: string[] = [
  '2026-01-07: Mercury retrograde begins (Aquarius)',
  '2026-01-29: Total lunar eclipse',
  '2026-02-17: Mercury retrograde ends',
  '2026-03-29: Solar eclipse (partial)',
  '2026-05-08: Mercury retrograde begins (Gemini)',
  '2026-06-01: Mercury retrograde ends',
  '2026-07-17: Mercury retrograde begins (Leo)',
  '2026-08-12: Full moon — Super Moon',
  '2026-08-12: Perseid meteor peak',
  '2026-09-23: Total lunar eclipse',
  '2026-10-22: Mercury retrograde begins (Scorpio)',
  '2026-11-11: Mercury retrograde ends',
  '2026-12-17: Saturn ingress Aries',
];

export interface Baseline {
  /** Observed samples, oldest first */
  cpc: number[];
  cpm: number[];
  ctr: number[];
}

export interface AnomalyExplainClient {
  anomalyExplain(metric: AdMetric, context: string): Promise<string>;
}

export interface Tier3Deps {
  claudeClient: AnomalyExplainClient;
  /**
   * Provide custom astro events list for testing or DI override.
   * Defaults to static ASTRO_EVENTS_2026.
   */
  astroEvents?: string[];
}

export interface AnomalyResult {
  /**
   * Undefined when baseline is not yet accumulated — caller skips tier 3.
   */
  decision: AdDecision | undefined;
  /** Explanation returned by LLM, if called */
  explanation?: string;
  /** Whether an anomaly was detected */
  anomalyDetected: boolean;
  /** Computed z-scores for logging */
  zScores: { cpc: number | null; cpm: number | null; ctr: number | null };
}

function mean(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function stddev(values: number[], avg: number): number {
  const variance = values.reduce((s, v) => s + (v - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function computeZScore(value: number, samples: number[]): number | null {
  if (samples.length < BASELINE_MIN_DAYS) return null;
  const avg = mean(samples);
  const sd = stddev(samples, avg);
  if (sd === 0) {
    // Flat baseline: if observed value matches mean exactly, z=0.
    // If it differs, treat as extreme anomaly (z = threshold + 1) so anomaly fires.
    return value === avg ? 0 : Z_SCORE_THRESHOLD + 1;
  }
  return (value - avg) / sd;
}

function isExpectedEvent(explanation: string): boolean {
  const lower = explanation.toLowerCase();
  return EXPECTED_EVENT_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Tier 3 anomaly detection engine.
 *
 * Operates in shadow mode by default: computes anomaly decisions but does not
 * enforce them. The orchestrator decides whether to apply them.
 *
 * Returns `undefined` decision when baseline is not yet accumulated.
 */
export async function detectAnomaly(
  metric: AdMetric,
  baseline: Baseline,
  deps: Tier3Deps,
): Promise<AnomalyResult> {
  const events = deps.astroEvents ?? ASTRO_EVENTS_2026;

  // Compute z-scores for each tracked metric
  const zCpc = computeZScore(metric.cpc, baseline.cpc);
  const zCpm = computeZScore(metric.cpm, baseline.cpm);
  const zCtr = computeZScore(metric.ctr, baseline.ctr);
  const zScores = { cpc: zCpc, cpm: zCpm, ctr: zCtr };

  // Baseline not ready — skip
  if (zCpc === null || zCpm === null || zCtr === null) {
    return { decision: undefined, anomalyDetected: false, zScores };
  }

  // Check if any metric exceeds anomaly threshold
  const maxZ = Math.max(Math.abs(zCpc), Math.abs(zCpm), Math.abs(zCtr));
  const anomalyDetected = maxZ > Z_SCORE_THRESHOLD;

  if (!anomalyDetected) {
    return {
      decision: {
        ad_id: metric.ad_id,
        action: 'maintain',
        reason: `tier_3_no_anomaly: max_z=${maxZ.toFixed(2)}`,
        reasoning_tier: 'tier_3_anomaly',
        confidence: 0.7,
        metrics_snapshot: metric,
      },
      anomalyDetected: false,
      zScores,
    };
  }

  // Anomaly detected — ask Claude to explain
  const context = [
    `Today: ${metric.date}`,
    `Ad: ${metric.ad_id}`,
    `Metrics: CPC=$${metric.cpc.toFixed(2)} (z=${zCpc.toFixed(2)}), CPM=$${metric.cpm.toFixed(2)} (z=${zCpm.toFixed(2)}), CTR=${(metric.ctr * 100).toFixed(2)}% (z=${zCtr.toFixed(2)})`,
    '',
    'Recent/upcoming astrological events:',
    ...events,
  ].join('\n');

  const explanation = await deps.claudeClient.anomalyExplain(metric, context);

  // If LLM identifies an expected astrological event, recommend HOLD not pause
  const action: AdDecision['action'] = isExpectedEvent(explanation) ? 'hold' : 'pause';

  return {
    decision: {
      ad_id: metric.ad_id,
      action,
      reason: `tier_3_anomaly: max_z=${maxZ.toFixed(2)}, llm="${explanation.slice(0, 120)}"`,
      reasoning_tier: 'tier_3_anomaly',
      confidence: 0.6,
      metrics_snapshot: metric,
    },
    explanation,
    anomalyDetected: true,
    zScores,
  };
}

export { BASELINE_MIN_DAYS, Z_SCORE_THRESHOLD, ASTRO_EVENTS_2026, EXPECTED_EVENT_KEYWORDS };
