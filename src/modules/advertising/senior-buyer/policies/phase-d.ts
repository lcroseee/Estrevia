/**
 * Phase D — Decline detection policy (Q10).
 *
 * Triggered for ad sets that have already been promoted to Phase C (Scale)
 * but are showing signs of fatigue. Returns one of three Q10 actions plus
 * a `maintain` fall-through:
 *
 *   1. `refresh_creative`     — frequency saturation (freq > 3 sustained 3d)
 *                               OR CTR fade (z-score < -2 vs same-DOW baseline)
 *   2. `propose_new_ad_set`   — conversion-velocity drop (z-score < -2)
 *   3. `pause_for_rest`       — plateau ≥30d AND no duplicates yet
 *   4. `maintain`             — none of the above triggers; continue Phase C
 *
 * Triggers are checked in priority order; the first match short-circuits.
 * Frequency saturation outranks CTR fade because freq-driven fade is the
 * most reliably reversible by creative refresh.
 *
 * All thresholds resolve through `threshold-resolver` so DB overrides win
 * over the COLD_START defaults declared in `targets.ts`.
 */

import type { AdDecision } from '../approval-router';
import { comparable } from '../comparable-window';
import type { AdSetState } from '../state-store';
import { resolveThreshold } from '../threshold-resolver';

export interface PhaseDInput {
  ad_id: string;
  state: AdSetState;
  metric: {
    /** Current 7-day rolling Meta-reported frequency (impressions / reach). */
    frequency_current: number;
    /** Consecutive days frequency has remained above `decline_frequency_trigger`. */
    sustained_days_above_decline_freq: number;
    /** Days since this ad set entered Phase C. Drives the plateau trigger. */
    days_in_phase_c: number;
  };
}

/**
 * Evaluate Phase D triggers and return the next decision for this ad set.
 *
 * @returns An `AdDecision` whose `action` is one of `refresh_creative`,
 *          `propose_new_ad_set`, `pause_for_rest`, or `maintain`.
 */
export async function evaluatePhaseD(input: PhaseDInput): Promise<AdDecision> {
  const { ad_id, state, metric } = input;
  const ctx = { ad_set_id: state.adSetId, campaign_id: state.campaignId };

  // 1. Frequency saturation → refresh creative (Q10 trigger A)
  const declineFreqTrigger = await resolveThreshold('decline_frequency_trigger', ctx);
  const declineFreqDays = await resolveThreshold('decline_frequency_sustained_days', ctx);
  if (
    metric.frequency_current > declineFreqTrigger &&
    metric.sustained_days_above_decline_freq >= declineFreqDays
  ) {
    return {
      ad_id,
      action: 'refresh_creative',
      reason: `frequency_saturation (${metric.frequency_current.toFixed(2)} > ${declineFreqTrigger})`,
    };
  }

  // 2. CTR fade (z < -2) → refresh creative (Q10 trigger B)
  const declineZ = await resolveThreshold('decline_z_score_trigger', ctx);
  const ctrComparable = await comparable(state.adSetId, 'ctr');
  if (ctrComparable && ctrComparable.z_score < declineZ) {
    return {
      ad_id,
      action: 'refresh_creative',
      reason: `ctr_fade_z=${ctrComparable.z_score.toFixed(2)}`,
    };
  }

  // 3. Conversion-velocity drop (z < -2) → propose new ad set (Q10 trigger C)
  const convComparable = await comparable(state.adSetId, 'conversions_meta');
  if (convComparable && convComparable.z_score < declineZ) {
    return {
      ad_id,
      action: 'propose_new_ad_set',
      reason: `conv_velocity_drop_z=${convComparable.z_score.toFixed(2)}`,
    };
  }

  // 4. Plateau ≥30d AND no duplicates yet → pause for rest (Q10 trigger D)
  const plateauDays = await resolveThreshold('decline_plateau_days', ctx);
  if (metric.days_in_phase_c >= plateauDays && state.duplicatesCount === 0) {
    return {
      ad_id,
      action: 'pause_for_rest',
      reason: `plateau_${plateauDays}d_no_duplicates`,
    };
  }

  return { ad_id, action: 'maintain', reason: 'phase_d_no_action_yet' };
}
