/**
 * Account-emergency cross-phase check.
 *
 * Runs before any phase-specific evaluation. If any of the three
 * conditions trigger, the function returns a `pause` decision marked
 * `account_emergency_*` and `ad_id: '*'` (i.e., apply to every ad set).
 * The approval-router recognises the `account_emergency` reason prefix
 * and lets the pause through even in COLD_START mode (Phase B exception).
 *
 * Triggers (priority order — first match wins):
 *   1. `account.status === 'DISABLED'`              → hard stop
 *   2. `account.quality_rating === 'BELOW_AVERAGE'` → quality crash
 *   3. `account.disapproval_rate > limit`           → policy crisis
 *
 * The disapproval-rate limit is a resolved threshold (default 0.05 / 5%
 * per Q6 / cold-start defaults). DB overrides take precedence.
 */

import type { AdDecision } from '../approval-router';
import { resolveThreshold } from '../threshold-resolver';

export interface AccountEmergencyInput {
  ad_set_id: string;
  campaign_id: string;
  account: {
    /** Disapproval rate as a fraction in [0, 1] (e.g., 0.07 = 7%). */
    disapproval_rate: number;
    quality_rating?: 'BELOW_AVERAGE' | 'AVERAGE' | 'ABOVE_AVERAGE';
    status?: 'ACTIVE' | 'DISABLED' | 'PENDING_REVIEW';
  };
}

/**
 * Evaluate the account-wide emergency conditions.
 *
 * @returns A `pause` decision with `ad_id: '*'` and an `account_emergency_*`
 *          reason when any trigger fires; `null` otherwise (no emergency).
 */
export async function evaluateAccountEmergency(
  input: AccountEmergencyInput,
): Promise<AdDecision | null> {
  const { ad_set_id, campaign_id, account } = input;
  const ctx = { ad_set_id, campaign_id };

  if (account.status === 'DISABLED') {
    return {
      ad_id: '*',
      action: 'pause',
      reason: 'account_emergency_status_disabled',
    };
  }

  if (account.quality_rating === 'BELOW_AVERAGE') {
    return {
      ad_id: '*',
      action: 'pause',
      reason: 'account_emergency_quality_below_avg',
    };
  }

  const limit = await resolveThreshold('account_disapproval_rate_emergency', ctx);
  if (account.disapproval_rate > limit) {
    return {
      ad_id: '*',
      action: 'pause',
      reason: `account_emergency_disapproval_rate=${(account.disapproval_rate * 100).toFixed(1)}%`,
    };
  }

  return null;
}
