/**
 * Decide-stream orchestrator.
 *
 * Two execution paths, selected by the `seniorBuyerMode` feature gate (or by
 * an explicit `senior_buyer_mode` override on `deps`):
 *
 *  1. **Legacy path (`off`, default).** Per-ad metric → Tier 1 hard rules,
 *     then Tier 3 anomaly when a baseline exists, then Tier 2 Bayesian
 *     when the gate is active. Conflict resolution: Tier 1 > Tier 3 > Tier 2.
 *     Untouched by v3b — same behavior, same shadow logging.
 *
 *  2. **Senior buyer path (`on`).** Per-ad-set state read from
 *     `advertising_ad_set_state` → maturity refresh → `evaluatePhase()` (Track
 *     21) → `approvalRoute()` (Track 10) for routing classification.
 *     Replaces the Tier-1 hard rules entirely with the 4-phase state machine
 *     + Q12 reversibility gate.
 *
 * The reconciler-suspend gate (v3a Track 8) applies to BOTH paths: when the
 * reconciler is suspended, only DISAPPROVED ads are processed; everything
 * else returns empty. Senior-buyer mode honors the same emergency carve-out
 * by emitting tier-1-style pause decisions for the disapproved set.
 *
 * Spec: docs/superpowers/plans/2026-05-03-senior-media-buyer-mode.md
 *       lines 4154-4317 (Track 22).
 */

import type { AdMetric, AdDecision, FeatureGate } from '@/shared/types/advertising';
import { applyTier1Rules } from './tier-1-rules';
import { detectAnomaly } from './tier-3-anomaly';
import type { Baseline, AnomalyExplainClient } from './tier-3-anomaly';
import { getReconState } from '@/modules/advertising/perceive/recon-state-store';
import {
  listAdSetsByPhase,
  type AdSetState as PersistedAdSetState,
} from '@/modules/advertising/senior-buyer/state-store';
import { classifyMaturity } from '@/modules/advertising/senior-buyer/data-maturity-classifier';
import {
  evaluatePhase,
  type PhaseEvaluatorInput,
} from '@/modules/advertising/senior-buyer/phase-evaluator';
import {
  route as approvalRoute,
  type AdSetState as RouterAdSetState,
  type RouterDecision,
} from '@/modules/advertising/senior-buyer/approval-router';

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
 * Senior-buyer routed decision — the final decision plus the routing
 * classification (`execute_immediately` / `low_risk_approval` /
 * `high_risk_approval` / `rejected`) returned by the approval-router.
 */
export interface RoutedDecision {
  ad_id: string;
  action: string;
  reason: string;
  routing: RouterDecision['type'];
}

/**
 * Dependencies injected into the orchestrator.
 * All external collaborators are optional — missing ones are simply skipped.
 */
export interface DecideDeps {
  /** Claude client for Tier 3 anomaly explanations. Required for legacy path. */
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
  /**
   * Explicit override for the senior-buyer-mode branch. When omitted, the
   * mode is read from the `seniorBuyerMode` feature gate (any "active"
   * `mode` flips it on). Mainly used by tests.
   */
  senior_buyer_mode?: 'on' | 'off';
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
 * Resolve the senior-buyer mode (on/off). Explicit dep override wins; falls
 * back to the gate's mode (any "active" mode → on); defaults to off.
 */
function resolveSeniorMode(
  gates: FeatureGate[],
  override?: 'on' | 'off',
): 'on' | 'off' {
  if (override !== undefined) return override;
  return isGateActive(gates, 'seniorBuyerMode') ? 'on' : 'off';
}

/**
 * Build the `PhaseEvaluatorInput` from a metric snapshot + persisted state.
 *
 * Several fields are placeholders — the metric-history aggregator (Track 24)
 * computes them and persists to state, where the evaluator picks them up.
 * For initial MVP these default to zero, which routes the evaluator to
 * `maintain` — safe.
 */
function buildPhaseInput(
  metric: AdMetric,
  state: PersistedAdSetState,
): PhaseEvaluatorInput {
  return {
    ad_id: metric.ad_id,
    state,
    current: {
      // Meta's effective_status returns DELETED for hard-removed ads; that's
      // out-of-band for Phase B, so narrow to its tri-state union.
      status: metric.status === 'DELETED' ? 'PAUSED' : metric.status,
      frequency: metric.frequency,
      spend_usd: metric.spend_usd,
      impressions: metric.impressions,
      ctr: metric.ctr,
      cpc: metric.cpc,
    },
    account: {
      // Wired separately by account-health snapshot; default to no-emergency
      // so the cross-phase emergency check is a no-op until populated.
      // (`spend_cap_hit` is added inside `evaluatePhase` when forwarding to
      // phase B — it's not part of `AccountEmergencyInput['account']`.)
      disapproval_rate: 0,
    },
    metric: {
      cpa_7d: state.cpa7d ?? 0,
      roas_7d: state.roas7d ?? 0,
      // 14d window aggregation lands with metric-history; stub from 7d for now.
      roas_14d: state.roas7d ?? 0,
      frequency_current: state.frequencyCurrent ?? metric.frequency,
      // Sustained-day counters are wired by metric-history (Track 24).
      sustained_days_above_cpa: 0,
      sustained_days_below_roas14d: 0,
      sustained_days_above_scale_criteria: 0,
      sustained_days_above_decline_freq: 0,
      days_in_phase_c: 0,
    },
    // PostHog HogQL aggregation (Q11) — Track 24 wires real values.
    signups_per_week: { lead: 0, subscribe: 0 },
  };
}

/**
 * Adapt persisted (camelCase) state into the snake_case shape expected by
 * `approval-router`. Approval-router's `AdSetState` carries an index
 * signature so the adapter can pass-through extra fields safely.
 *
 * Drizzle infers `text` columns as `string` (the narrow phase + maturity
 * unions live in `state-store`), so we coerce here — the constraint is
 * enforced at write-time by `upsertAdSetState`.
 */
function toRouterState(state: PersistedAdSetState): RouterAdSetState {
  return {
    ad_set_id: state.adSetId,
    data_maturity_mode: state.dataMaturityMode as RouterAdSetState['data_maturity_mode'],
    current_phase: state.currentPhase as RouterAdSetState['current_phase'],
  };
}

/**
 * Synthetic emergency pause for DISAPPROVED ads while the reconciler is
 * suspended. Used by the legacy path; senior-buyer path emits the equivalent
 * routed decision.
 */
function emergencyPauseDecision(m: AdMetric): AdDecision {
  return {
    ad_id: m.ad_id,
    action: 'pause',
    reason: 'reconciler_suspended_disapproved_ad_emergency_pause',
    reasoning_tier: 'tier_1_rules',
    confidence: 1.0,
    metrics_snapshot: m,
  };
}

// ─── Path: senior-buyer ─────────────────────────────────────────────────────

async function decideSeniorBuyer(
  metrics: AdMetric[],
): Promise<{ decisions: RoutedDecision[]; shadowLog: ShadowLog[] }> {
  // Single DB read covers every active phase; per-ad-set lookup is in-memory.
  const persistedStates = await listAdSetsByPhase(['A', 'B', 'C', 'D', 'PAUSED']);
  const stateByAdSet = new Map(persistedStates.map((s) => [s.adSetId, s]));

  const decisions: RoutedDecision[] = [];

  for (const metric of metrics) {
    const persisted = stateByAdSet.get(metric.adset_id) ?? null;

    if (!persisted) {
      // No state row yet (new ad set). Hold pending Phase-A bootstrap by
      // the triage-hourly route (Track 23). Always execute-immediately so
      // the action is auditable but no Meta write fires.
      decisions.push({
        ad_id: metric.ad_id,
        action: 'hold',
        reason: 'state_not_initialised',
        routing: 'execute_immediately',
      });
      continue;
    }

    // Refresh maturity from current totals (auto-calibrator may have moved
    // the boundaries since the last triage tick). baseline_cv defaults to 0
    // here — the auto-calibrator path computes the real value and persists
    // a maturity transition; we just respect the latest stored mode plus
    // any totals-driven downgrade since.
    const newMaturity = classifyMaturity({
      conversions_total_meta: persisted.conversionsTotalMeta,
      days_with_pixel_data: persisted.daysWithPixelData,
      baseline_cv: 0,
    });
    const stateWithMaturity: PersistedAdSetState = {
      ...persisted,
      dataMaturityMode: newMaturity,
    };

    const decision = await evaluatePhase(buildPhaseInput(metric, stateWithMaturity));
    const routing = await approvalRoute(decision, toRouterState(stateWithMaturity));

    decisions.push({
      ad_id: decision.ad_id,
      action: decision.action,
      reason: decision.reason ?? '',
      routing: routing.type,
    });
  }

  return { decisions, shadowLog: [] };
}

// ─── Path: legacy (Tier 1/2/3) ──────────────────────────────────────────────

async function decideLegacy(
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

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Function-overload signatures so callers see narrowed return types based on
 * which branch they have selected.
 *
 * Order matters: the senior-buyer overload is first so that an explicit
 * `senior_buyer_mode: 'on'` deps narrows the return type to `RoutedDecision[]`.
 * Everything else (including the existing `DecideDeps` shape with no
 * `senior_buyer_mode` set) hits the legacy `AdDecision[]` overload.
 */
export function decide(
  metrics: AdMetric[],
  gates: FeatureGate[],
  deps: DecideDeps & { senior_buyer_mode: 'on' },
): Promise<{ decisions: RoutedDecision[]; shadowLog: ShadowLog[] }>;
export function decide(
  metrics: AdMetric[],
  gates: FeatureGate[],
  deps: DecideDeps,
): Promise<{ decisions: AdDecision[]; shadowLog: ShadowLog[] }>;
/**
 * Main orchestrator entry point.
 *
 * Branches on `seniorBuyerMode`:
 *   - off (default) → legacy Tier 1/2/3 path with Tier 1>3>2 conflict resolution
 *   - on            → per-ad-set phase evaluator + approval router
 *
 * The reconciler-suspend gate runs first regardless of branch; only
 * DISAPPROVED ads survive a suspended state, and they always return as
 * tier-1 emergency pauses (even in senior-buyer mode, so the upstream
 * publisher sees the same shape).
 */
export async function decide(
  metrics: AdMetric[],
  gates: FeatureGate[],
  deps: DecideDeps,
): Promise<{ decisions: AdDecision[] | RoutedDecision[]; shadowLog: ShadowLog[] }> {
  // Reconciler-suspend gate — applies to BOTH paths.
  const reconState = await getReconState();
  if (reconState.suspended) {
    const disapproved = metrics.filter((m) => m.status === 'DISAPPROVED');
    if (disapproved.length === 0) {
      console.info(
        '[decide] reconciler suspended — no DISAPPROVED ads, returning empty',
      );
      return { decisions: [], shadowLog: [] };
    }
    // Synthetic Tier 1 pauses for the emergency cases. Same shape both paths
    // so the publisher (`act/`) doesn't need to branch on senior-buyer mode.
    return {
      decisions: disapproved.map<AdDecision>(emergencyPauseDecision),
      shadowLog: [],
    };
  }

  const seniorMode = resolveSeniorMode(gates, deps.senior_buyer_mode);

  if (seniorMode === 'on') {
    return await decideSeniorBuyer(metrics);
  }

  return await decideLegacy(metrics, gates, deps);
}
