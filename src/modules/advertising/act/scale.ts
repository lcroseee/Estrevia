import type { AdDecision, DecisionRecord } from '@/shared/types/advertising';
import type { MetaAdClient } from './meta-marketing';
import type { SpendCapDeps, AlertSender } from '../safety/spend-cap';
import type { DecisionLogDb } from '../audit/decision-log';

export interface ScaleDeps {
  metaApi: MetaAdClient;
  telegramBot: AlertSender;
  spendCapDb: SpendCapDeps['db'];
  decisionDb: DecisionLogDb;
}

/**
 * Scales (increases or decreases) the budget for the ad specified in the decision.
 *
 * Pre-flight order (BEFORE calling Meta API):
 *   1. Assert kill switch is off — throws KillSwitchError if engaged
 *   2. Check spend cap with the planned delta — throws if cap would be exceeded
 *
 * decision.delta_budget_usd must be set (positive = increase, negative = decrease).
 * Throws immediately if delta_budget_usd is absent — callers must specify it.
 *
 * On success: Meta API called, audit record written (applied=true).
 * On Meta failure: audit record written (applied=false, error set), then re-throws.
 */
export async function scale(decision: AdDecision, deps: ScaleDeps): Promise<DecisionRecord> {
  if (decision.delta_budget_usd === undefined) {
    throw new Error(
      `scale requires decision.delta_budget_usd to be set for ad ${decision.ad_id}`,
    );
  }

  const { assertKillSwitchOff } = await import('../safety/kill-switch');
  const { checkSpendCap } = await import('../safety/spend-cap');
  const { logDecision } = await import('../audit/decision-log');

  // Pre-flight 1: kill switch
  assertKillSwitchOff();

  // Pre-flight 2: spend cap — only positive deltas consume budget
  const plannedDelta = Math.max(0, decision.delta_budget_usd);
  const capResult = await checkSpendCap(plannedDelta, {
    metaApi: deps.metaApi,
    telegramBot: deps.telegramBot,
    db: deps.spendCapDb,
  });

  if (!capResult.allowed) {
    throw new Error(
      `scale pre-flight failed — spend cap: ${capResult.reason ?? 'unknown reason'}`,
    );
  }

  // Execute via Meta API
  let metaResponse: unknown;
  try {
    metaResponse = await deps.metaApi.scaleBudget(decision.ad_id, decision.delta_budget_usd);
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const record = await logDecision(decision, false, {
      error: errorMessage,
      metaResponse: undefined,
      db: deps.decisionDb,
    });
    throw Object.assign(
      new Error(`scale failed for ad ${decision.ad_id}: ${errorMessage}`),
      { record },
    );
  }

  return logDecision(decision, true, {
    metaResponse,
    db: deps.decisionDb,
  });
}
