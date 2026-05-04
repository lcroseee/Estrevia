/**
 * Approval router for senior-media-buyer mode.
 *
 * Routes ad-decisions to one of:
 *   - execute_immediately   (REVERSIBLE actions, or explicit Phase B exceptions)
 *   - low_risk_approval     (LEARNING_RESET — 4h Telegram timeout)
 *   - high_risk_approval    (NEW_SPEND — blocking, requires explicit human approval)
 *   - rejected              (suppressed by maturity gate, or unknown action)
 *
 * Two-layer logic per spec lines 836-877:
 *   1. Data-maturity gate: COLD_START suppresses everything except Phase B
 *      account-emergency / disapproved-status pauses; CALIBRATING forces
 *      non-REVERSIBLE actions through low-risk approval.
 *   2. Q12 reversibility classification: REVERSIBLE → execute, LEARNING_RESET
 *      → low-risk, NEW_SPEND → high-risk.
 */

import { COLD_START_DEFAULTS } from './targets';
import type { DataMaturityMode } from './data-maturity-classifier';

export type AdAction =
  | 'pause'
  | 'unpause'
  | 'hold'
  | 'maintain'
  | 'pause_for_rest'
  | 'duplicate'
  | 'scale'
  | 'refresh_creative'
  | 'hybrid_event_switch'
  | 'propose_new_ad_set';

export interface AdDecision {
  ad_id: string;
  action: AdAction;
  reason?: string;
  [k: string]: unknown;
}

export interface AdSetState {
  ad_set_id: string;
  data_maturity_mode: DataMaturityMode;
  current_phase: 'A' | 'B' | 'C' | 'D' | 'PAUSED' | 'RETIRED';
  [k: string]: unknown;
}

export type RouterDecision =
  | { type: 'execute_immediately'; reason: string }
  | { type: 'low_risk_approval'; timeout_hours: number; reason: string }
  | { type: 'high_risk_approval'; reason: string }
  | { type: 'rejected'; reason: string };

const REVERSIBLE: ReadonlySet<AdAction> = new Set<AdAction>([
  'pause',
  'unpause',
  'hold',
  'maintain',
  'pause_for_rest',
]);

const LEARNING_RESET: ReadonlySet<AdAction> = new Set<AdAction>([
  'duplicate',
  'refresh_creative',
  'hybrid_event_switch',
]);

const NEW_SPEND: ReadonlySet<AdAction> = new Set<AdAction>(['propose_new_ad_set']);

function isExtremeFailure(d: AdDecision): boolean {
  return /extreme_failure|disapproved/.test(d.reason ?? '');
}

function isAccountEmergency(d: AdDecision): boolean {
  return /account_emergency/.test(d.reason ?? '');
}

/**
 * Route an ad-decision through the maturity-mode gate and Q12 reversibility
 * classifier. Returns one of four `RouterDecision` variants.
 */
export async function route(
  decision: AdDecision,
  state: AdSetState,
): Promise<RouterDecision> {
  // ── Maturity gate first ─────────────────────────────────────────────
  if (state.data_maturity_mode === 'COLD_START') {
    if (!isExtremeFailure(decision) && !isAccountEmergency(decision)) {
      return { type: 'rejected', reason: 'cold_start_mode_suppression' };
    }
    // Falls through to Q12 routing for the allowed Phase B exceptions.
  }

  if (state.data_maturity_mode === 'CALIBRATING') {
    if (!REVERSIBLE.has(decision.action)) {
      return {
        type: 'low_risk_approval',
        timeout_hours: COLD_START_DEFAULTS.approval_low_risk_timeout_hours,
        reason: `calibrating_mode_${decision.action}`,
      };
    }
    // Falls through to Q12 routing for REVERSIBLE actions.
  }

  // ── Q12 reversibility-based routing ─────────────────────────────────
  if (REVERSIBLE.has(decision.action)) {
    return { type: 'execute_immediately', reason: 'reversible_action' };
  }

  if (LEARNING_RESET.has(decision.action)) {
    return {
      type: 'low_risk_approval',
      timeout_hours: COLD_START_DEFAULTS.approval_low_risk_timeout_hours,
      reason: `learning_reset_${decision.action}`,
    };
  }

  if (NEW_SPEND.has(decision.action)) {
    return { type: 'high_risk_approval', reason: `new_spend_${decision.action}` };
  }

  return { type: 'rejected', reason: `unknown_action: ${decision.action}` };
}
