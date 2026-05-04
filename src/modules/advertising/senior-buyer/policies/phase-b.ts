/**
 * Phase B — Learning policy.
 *
 * The ad set is live and Meta is actively in its initial learning phase
 * (≤ 50 conv / 7d on Meta-side). The default decision is `hold` with reason
 * `learning_in_progress` — we explicitly do nothing to avoid resetting the
 * learning phase. Eight extreme-failure exceptions allow autonomous pauses.
 *
 * Per spec lines 657-672 (Q6) and routed through approval-router which
 * recognises `extreme_failure_*` and `account_emergency_*` reason prefixes
 * as the only valid Phase B execute-immediately exceptions.
 */

import type { AdDecision } from '../approval-router';
import type { AdSetState } from '../state-store';
import { resolveThreshold } from '../threshold-resolver';

export interface PhaseBInput {
  ad_id: string;
  state: AdSetState;
  /** Latest snapshot from Meta Insights for this ad / ad set. */
  current: {
    status: 'ACTIVE' | 'DISAPPROVED' | 'PAUSED';
    frequency: number;
    spend_usd: number;
    impressions: number;
    /** Decimal CTR (e.g. 0.003 = 0.3%). */
    ctr: number;
    cpc: number;
  };
  account: {
    /** Decimal share of disapproved ads in the account (e.g. 0.06 = 6%). */
    disapproval_rate: number;
    quality_rating?: 'BELOW_AVERAGE' | 'AVERAGE' | 'ABOVE_AVERAGE';
    spend_cap_hit: boolean;
  };
}

export async function evaluatePhaseB(input: PhaseBInput): Promise<AdDecision> {
  const { ad_id, state, current, account } = input;
  const ctx = {
    ad_set_id: state.adSetId,
    campaign_id: state.campaignId,
  };

  // 1. DISAPPROVED status — Meta has rejected the ad. No reason to keep it live.
  if (current.status === 'DISAPPROVED') {
    return {
      ad_id,
      action: 'pause',
      reason: 'extreme_failure_disapproved',
    };
  }

  // 2. Frequency cap — audience exhaustion / creative fatigue.
  const freqCap = await resolveThreshold('phase_b_extreme_frequency_cap', ctx);
  if (current.frequency >= freqCap) {
    return {
      ad_id,
      action: 'pause',
      reason: `extreme_failure_frequency=${current.frequency.toFixed(2)} >= ${freqCap}`,
    };
  }

  // 3. Zero-conversion spend floor — burnt $X with literally no signal.
  const spendFloor = await resolveThreshold('phase_b_extreme_zero_conv_spend_floor_usd', ctx);
  if (current.spend_usd >= spendFloor && state.conversions7dMeta === 0) {
    return {
      ad_id,
      action: 'pause',
      reason: `extreme_failure_zero_conv_spend=${current.spend_usd.toFixed(2)}`,
    };
  }

  // 4. CTR DOA — sub-floor click-through with enough sample to be sure.
  const ctrDoa = await resolveThreshold('phase_b_extreme_ctr_doa', ctx);
  const minImpressions = await resolveThreshold('phase_b_extreme_ctr_doa_min_impressions', ctx);
  if (current.ctr < ctrDoa && current.impressions >= minImpressions) {
    return {
      ad_id,
      action: 'pause',
      reason: `extreme_failure_ctr_doa=${(current.ctr * 100).toFixed(2)}%`,
    };
  }

  // 5. CPC cap — paying obscene amounts per click.
  const cpcCap = await resolveThreshold('phase_b_extreme_cpc_cap_usd', ctx);
  if (current.cpc >= cpcCap) {
    return {
      ad_id,
      action: 'pause',
      reason: `extreme_failure_cpc=${current.cpc.toFixed(2)}`,
    };
  }

  // 6. Account-level disapproval rate — protect account standing.
  const disapprovalLimit = await resolveThreshold('account_disapproval_rate_emergency', ctx);
  if (account.disapproval_rate > disapprovalLimit) {
    return {
      ad_id,
      action: 'pause',
      reason: `account_emergency_disapproval_rate=${(account.disapproval_rate * 100).toFixed(2)}%`,
    };
  }

  // 7. Account quality rating — Meta has flagged the account as low-quality.
  if (account.quality_rating === 'BELOW_AVERAGE') {
    return {
      ad_id,
      action: 'pause',
      reason: 'account_emergency_quality_below_avg',
    };
  }

  // 8. Spend-cap hit — billing safety belt.
  if (account.spend_cap_hit) {
    return {
      ad_id,
      action: 'pause',
      reason: 'spend_cap_hit',
    };
  }

  // Default: hold and let Meta learn.
  return {
    ad_id,
    action: 'hold',
    reason: 'learning_in_progress',
  };
}
