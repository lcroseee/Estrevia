import type { AdMetric, AdDecision } from '@/shared/types/advertising';

// Hard thresholds — deterministic, no ML
const FREQUENCY_CAP = 4.0;
const CPC_HARD_CAP = 5.0; // USD
const SPEND_DAILY_OVERAGE = 25.0; // USD
// Senior buyer baseline. v3b Senior Buyer Mode supersedes this with Phase B
// max_days=14 and conversion-based transition. Kept here as defensive minimum
// for the legacy code path (active when seniorBuyerMode feature gate = off).
const LEARNING_PHASE_DAYS = 7;
// Meta documents learning phase as exiting at ≥50 conversions in 7 days. Below
// that, per-ad-set metrics are too noisy for confident pause/scale decisions.
// See [[feedback-meta-learning-phase]] (memory) and Wave 3 spec §5.
const MIN_CONVERSIONS_BEFORE_ACTION = 50;

/**
 * Tier 1 hard rules engine.
 *
 * Pure function — no side effects, no async, no DI needed.
 * Confidence is always 1.0 (deterministic).
 * Learning phase is checked first; rules are evaluated in priority order.
 */
export function applyTier1Rules(m: AdMetric): AdDecision {
  const base = {
    ad_id: m.ad_id,
    metrics_snapshot: m,
    reasoning_tier: 'tier_1_rules' as const,
    confidence: 1.0,
  };

  // Learning phase — too early to act on metrics
  if (m.days_running < LEARNING_PHASE_DAYS) {
    return {
      ...base,
      action: 'hold',
      reason: `learning_phase_protection: only ${m.days_running}d running, need ≥${LEARNING_PHASE_DAYS}d`,
    };
  }

  // Conversion sample size — fail-open when field missing (Meta API hiccup)
  if (m.conversions_7d != null && m.conversions_7d < MIN_CONVERSIONS_BEFORE_ACTION) {
    return {
      ...base,
      action: 'hold',
      reason: `insufficient_conversions: ${m.conversions_7d}/7d, need ≥${MIN_CONVERSIONS_BEFORE_ACTION}`,
    };
  }

  // Audience fatigue — highest priority pause signal
  if (m.frequency >= FREQUENCY_CAP) {
    return {
      ...base,
      action: 'pause',
      reason: `frequency_cap_exceeded: ${m.frequency.toFixed(1)} ≥ ${FREQUENCY_CAP}`,
    };
  }

  // Cost-per-click hard ceiling
  if (m.cpc >= CPC_HARD_CAP) {
    return {
      ...base,
      action: 'pause',
      reason: `cpc_hard_cap_exceeded: $${m.cpc.toFixed(2)} ≥ $${CPC_HARD_CAP}`,
    };
  }

  // Daily budget safety rail
  if (m.spend_usd >= SPEND_DAILY_OVERAGE) {
    return {
      ...base,
      action: 'pause',
      reason: `spend_daily_overage: $${m.spend_usd.toFixed(2)} ≥ $${SPEND_DAILY_OVERAGE}`,
    };
  }

  return {
    ...base,
    action: 'maintain',
    reason: 'within_tier_1_thresholds',
  };
}

export {
  FREQUENCY_CAP,
  CPC_HARD_CAP,
  SPEND_DAILY_OVERAGE,
  LEARNING_PHASE_DAYS,
  MIN_CONVERSIONS_BEFORE_ACTION,
};
