import type { AdDecision, DecisionRecord } from '@/shared/types/advertising';
import type { MetaAdActOps } from '@/modules/advertising/meta-graph-api';
import type { SpendCapDeps, AlertSender, InsightsProvider } from '../safety/spend-cap';
import type { DecisionLogDb } from '../audit/decision-log';

export interface ScaleDeps {
  /** Narrow act-layer client — only updateAdSetBudget is called from this module. */
  metaApi: MetaAdActOps;
  /** Separate insights client used by the spend-cap pre-flight check. */
  insightsApi: InsightsProvider;
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
    metaApi: deps.insightsApi,
    telegramBot: deps.telegramBot,
    db: deps.spendCapDb,
  });

  if (!capResult.allowed) {
    throw new Error(
      `scale pre-flight failed — spend cap: ${capResult.reason ?? 'unknown reason'}`,
    );
  }

  // Execute via Meta API.
  // NOTE (Phase 2): decision.ad_id here acts as the ad-set ID for the budget call.
  // AdDecision will gain an explicit adset_id field in Phase 2 once the perceive
  // layer maps ad → ad-set. delta_budget_usd (signed USD) is converted to cents
  // and used as the new absolute daily budget — a simplification until we can
  // fetch the current budget and add the delta properly.
  const dailyBudgetCents = Math.round(Math.abs(decision.delta_budget_usd) * 100);
  let metaResponse: unknown;
  try {
    metaResponse = await deps.metaApi.updateAdSetBudget(decision.ad_id, dailyBudgetCents);
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
