import type { AdMetric, AdDecision, FeatureGate } from '@/shared/types/advertising';
import { applyTier1Rules } from './tier-1-rules';
import { detectAnomaly } from './tier-3-anomaly';
import type { Baseline, AnomalyExplainClient } from './tier-3-anomaly';

/**
 * A shadow log entry records a decision produced by a tier that is not yet
 * active (e.g. Tier 2 in shadow mode). These are stored for analysis but do
 * not override the final applied decision.
 */
export interface ShadowLog {
  ad_id: string;
  tier: 'tier_2_bayesian' | 'tier_3_anomaly';
  decision: AdDecision;
  final_decision: AdDecision;
  reason: string;
}

/**
 * Tier 2 (Bayesian) function signature — provided by S7 via DI.
 * The orchestrator never imports from S7 files directly.
 */
export type Tier2DecideFn = (metric: AdMetric) => Promise<AdDecision | null>;

/**
 * Dependencies injected into the orchestrator.
 * All external collaborators are optional — missing ones are simply skipped.
 */
export interface DecideDeps {
  /** Claude client for Tier 3 anomaly explanations */
  claudeClient: AnomalyExplainClient;
  /**
   * Per-ad 30-day rolling baselines, keyed by ad_id.
   * Tier 3 is skipped for an ad if no baseline exists.
   */
  baselines: Map<string, Baseline>;
  /**
   * S7's Bayesian decision function — injected so we never import from S7.
   * When undefined, Tier 2 is not called even if the gate is active.
   */
  tier2Decide?: Tier2DecideFn;
  /**
   * Override astro events for testing — forwarded to Tier 3.
   */
  astroEvents?: string[];
}

/**
 * Authority order for conflict resolution: Tier 1 > Tier 3 > Tier 2.
 * Higher number = higher authority.
 */
const TIER_AUTHORITY: Record<AdDecision['reasoning_tier'], number> = {
  tier_1_rules: 3,
  tier_3_anomaly: 2,
  tier_2_bayesian: 1,
};

function isGateActive(gates: FeatureGate[], featureId: string): boolean {
  const gate = gates.find((g) => g.feature_id === featureId);
  return gate?.mode === 'active_auto' || gate?.mode === 'active_proposal';
}

/**
 * Resolve conflict between two decisions from different tiers.
 *
 * "Highest authority wins" applies only when the higher-tier decision is
 * actionable (anything other than 'maintain'). A 'maintain' from a higher tier
 * means "no objection" — the lower tier's recommendation should be applied.
 *
 * If both are 'maintain', the higher-authority tier's decision is kept (for
 * correct reasoning_tier attribution).
 *
 * Returns { winner, loser } so the caller can shadow-log the loser.
 */
function resolveConflict(
  higher: AdDecision,
  lower: AdDecision,
): { winner: AdDecision; loser: AdDecision | null } {
  // Higher tier is actively opinionated — it overrides the lower tier
  if (higher.action !== 'maintain') {
    return { winner: higher, loser: lower };
  }
  // Higher tier says maintain — defer to lower tier's recommendation
  return { winner: lower, loser: null };
}

/**
 * Main orchestrator entry point.
 *
 * For each metric:
 * 1. Always runs Tier 1 (deterministic hard rules)
 * 2. Runs Tier 3 (anomaly) if baseline is available — always in shadow mode,
 *    applied only if Tier 1 is 'maintain'
 * 3. Runs Tier 2 (Bayesian, S7) if the gate is active — applied only if
 *    both Tier 1 and Tier 3 are 'maintain' or absent
 *
 * Conflict resolution: Tier 1 > Tier 3 > Tier 2
 *
 * @returns Final decisions per ad plus shadow logs for non-applied tier decisions
 */
export async function decide(
  metrics: AdMetric[],
  gates: FeatureGate[],
  deps: DecideDeps,
): Promise<{ decisions: AdDecision[]; shadowLog: ShadowLog[] }> {
  const tier2Active = isGateActive(gates, 'tier_2_bayesian') && deps.tier2Decide != null;
  const decisions: AdDecision[] = [];
  const shadowLog: ShadowLog[] = [];

  await Promise.all(
    metrics.map(async (metric) => {
      // --- Tier 1: always runs ---
      const tier1 = applyTier1Rules(metric);
      let current = tier1;

      // --- Tier 3: runs if baseline available ---
      const baseline = deps.baselines.get(metric.ad_id);
      if (baseline) {
        const anomalyResult = await detectAnomaly(metric, baseline, {
          claudeClient: deps.claudeClient,
          astroEvents: deps.astroEvents,
        });

        if (anomalyResult.decision) {
          const tier3 = anomalyResult.decision;
          // Tier 1 (current) is higher authority than Tier 3
          const { winner, loser } = resolveConflict(current, tier3);

          if (loser !== null && loser === tier3) {
            // Tier 1 actively overrode Tier 3 — log Tier 3 as shadow
            shadowLog.push({
              ad_id: metric.ad_id,
              tier: 'tier_3_anomaly',
              decision: tier3,
              final_decision: current,
              reason: `tier_1 (auth=${TIER_AUTHORITY.tier_1_rules}) active_override > tier_3 (auth=${TIER_AUTHORITY.tier_3_anomaly})`,
            });
          }
          current = winner;
        }
      }

      // --- Tier 2: runs if gate active and dep injected ---
      if (tier2Active && deps.tier2Decide) {
        const tier2 = await deps.tier2Decide(metric);

        if (tier2) {
          // current (Tier 1 or Tier 3) is higher authority than Tier 2
          const { winner, loser } = resolveConflict(current, tier2);

          if (loser !== null && loser === tier2) {
            // Current tier actively overrode Tier 2 — shadow log
            shadowLog.push({
              ad_id: metric.ad_id,
              tier: 'tier_2_bayesian',
              decision: tier2,
              final_decision: current,
              reason: `${current.reasoning_tier} (auth=${TIER_AUTHORITY[current.reasoning_tier]}) active_override > tier_2 (auth=${TIER_AUTHORITY.tier_2_bayesian})`,
            });
          }
          current = winner;
        }
      }

      decisions.push(current);
    }),
  );

  return { decisions, shadowLog };
}
