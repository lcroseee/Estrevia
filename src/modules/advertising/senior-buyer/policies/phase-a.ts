/**
 * Phase A — Pre-launch policy.
 *
 * The ad set has been created in Meta but the ad inside it isn't yet live
 * (still in REVIEW or scheduled for the future). Nothing observable means
 * nothing actionable: the only allowed decision is `hold`. The caller
 * transitions the ad set to Phase B once `effective_status === ACTIVE`
 * for the first time.
 *
 * Per spec lines 593-602 (Q4) and 657-672 (Q6).
 */

import type { AdDecision } from '../approval-router';

export interface PhaseAInput {
  ad_id: string;
  ad_set_id: string;
}

export function evaluatePhaseA(input: PhaseAInput): AdDecision {
  return {
    ad_id: input.ad_id,
    action: 'hold',
    reason: 'phase_a_pre_launch',
  };
}
