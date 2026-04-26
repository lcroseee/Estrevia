import type { AdDecision, DecisionRecord } from '@/shared/types/advertising';
import type { MetaAdClient } from './meta-marketing';
import type { SpendCapDeps, AlertSender } from '../safety/spend-cap';
import type { DecisionLogDb } from '../audit/decision-log';

export interface DuplicateDeps {
  metaApi: MetaAdClient;
  telegramBot: AlertSender;
  spendCapDb: SpendCapDeps['db'];
  decisionDb: DecisionLogDb;
}

/**
 * Duplicates the ad specified in the decision.
 *
 * Cloning an ad causes immediate additional spend potential.
 * The planned delta (decision.delta_budget_usd ?? 0) is checked against the
 * daily cap before the Meta API is called.
 *
 * Pre-flight order (BEFORE calling Meta API):
 *   1. Assert kill switch is off — throws KillSwitchError if engaged
 *   2. Check spend cap — throws if cap would be exceeded
 *
 * Returns a DecisionRecord augmented with the new ad's ID in meta_response.
 */
export async function duplicate(decision: AdDecision, deps: DuplicateDeps): Promise<DecisionRecord> {
  const { assertKillSwitchOff } = await import('../safety/kill-switch');
  const { checkSpendCap } = await import('../safety/spend-cap');
  const { logDecision } = await import('../audit/decision-log');

  // Pre-flight 1: kill switch
  assertKillSwitchOff();

  // Pre-flight 2: spend cap
  const plannedDelta = Math.max(0, decision.delta_budget_usd ?? 0);
  const capResult = await checkSpendCap(plannedDelta, {
    metaApi: deps.metaApi,
    telegramBot: deps.telegramBot,
    db: deps.spendCapDb,
  });

  if (!capResult.allowed) {
    throw new Error(
      `duplicate pre-flight failed — spend cap: ${capResult.reason ?? 'unknown reason'}`,
    );
  }

  // Execute via Meta API
  let metaResponse: { ad_id: string };
  try {
    metaResponse = await deps.metaApi.duplicateAd(decision.ad_id);
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const record = await logDecision(decision, false, {
      error: errorMessage,
      metaResponse: undefined,
      db: deps.decisionDb,
    });
    throw Object.assign(
      new Error(`duplicate failed for ad ${decision.ad_id}: ${errorMessage}`),
      { record },
    );
  }

  // Write success audit record — meta_response carries the new ad_id
  return logDecision(decision, true, {
    metaResponse,
    db: deps.decisionDb,
  });
}
