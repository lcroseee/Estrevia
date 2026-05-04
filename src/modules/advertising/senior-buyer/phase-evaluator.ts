/**
 * Phase evaluator — per-ad-set orchestrator.
 *
 * Picks the right policy based on `state.currentPhase` and returns ONE
 * `AdDecision`. The cross-phase account-emergency check runs first so a
 * pause-all signal can interrupt any phase, including A (pre-launch) and
 * RETIRED. PAUSED / RETIRED are explicit no-ops; an unknown phase falls
 * through to a defensive `hold`.
 *
 * Maturity-mode gating happens later in approval-router (T10) — this
 * module is purely about routing to the correct policy.
 *
 * Per spec lines 4055-4151 (Track 21).
 */
import type { AdDecision } from './approval-router';
import type { AdSetState } from './state-store';
import { evaluatePhaseA } from './policies/phase-a';
import { evaluatePhaseB, type PhaseBInput } from './policies/phase-b';
import { evaluatePhaseC, type PhaseCInput } from './policies/phase-c';
import { evaluatePhaseD, type PhaseDInput } from './policies/phase-d';
import {
  evaluateAccountEmergency,
  type AccountEmergencyInput,
} from './policies/account-emergency';

export interface PhaseEvaluatorInput {
  ad_id: string;
  state: AdSetState;
  current: PhaseBInput['current'];
  account: AccountEmergencyInput['account'];
  metric: PhaseCInput['metric'] & PhaseDInput['metric'];
  signups_per_week: PhaseCInput['signups_per_week'];
}

/**
 * Per-ad-set phase evaluator. Account-emergency check first (cross-phase),
 * then route by current phase. Returns ONE decision. Caller passes it through
 * approval-router for final routing (REVERSIBLE / LOW_RISK / HIGH_RISK / rejected).
 */
export async function evaluatePhase(input: PhaseEvaluatorInput): Promise<AdDecision> {
  // Cross-phase account emergency — overrides all phase-specific routing.
  const emergency = await evaluateAccountEmergency({
    ad_set_id: input.state.adSetId,
    campaign_id: input.state.campaignId,
    account: input.account,
  });
  if (emergency) {
    return { ...emergency, ad_id: input.ad_id };
  }

  switch (input.state.currentPhase) {
    case 'A':
      return evaluatePhaseA({ ad_id: input.ad_id, ad_set_id: input.state.adSetId });

    case 'B':
      return await evaluatePhaseB({
        ad_id: input.ad_id,
        state: input.state,
        current: input.current,
        // spend_cap_hit is wired separately by the spend-cap layer; default to
        // false here so Phase B's billing-belt branch is a no-op in this path.
        account: { ...input.account, spend_cap_hit: false },
      });

    case 'C':
      return await evaluatePhaseC({
        ad_id: input.ad_id,
        state: input.state,
        metric: input.metric,
        signups_per_week: input.signups_per_week,
      });

    case 'D':
      return await evaluatePhaseD({
        ad_id: input.ad_id,
        state: input.state,
        metric: input.metric,
      });

    case 'PAUSED':
    case 'RETIRED':
      return {
        ad_id: input.ad_id,
        action: 'hold',
        reason: `phase_${input.state.currentPhase.toLowerCase()}`,
      };

    default:
      return {
        ad_id: input.ad_id,
        action: 'hold',
        reason: `unknown_phase_${input.state.currentPhase}`,
      };
  }
}
