import type { AdDecision, DecisionRecord } from '@/shared/types/advertising';
import type { MetaAdClient } from './meta-marketing';
import type { SpendCapDeps, AlertSender } from '../safety/spend-cap';
import type { DecisionLogDb } from '../audit/decision-log';

export interface PauseDeps {
  metaApi: MetaAdClient;
  telegramBot: AlertSender;
  spendCapDb: SpendCapDeps['db'];
  decisionDb: DecisionLogDb;
}

/**
 * Pauses the ad specified in the decision.
 *
 * Pre-flight order (BEFORE calling Meta API):
 *   1. Assert kill switch is off — throws KillSwitchError if engaged
 *   2. Check spend cap — throws Error if spend cap is exceeded
 *
 * On success: Meta API called, audit record written (applied=true).
 * On Meta failure: audit record written (applied=false, error set), then re-throws.
 */
export async function pause(decision: AdDecision, deps: PauseDeps): Promise<DecisionRecord> {
  const { assertKillSwitchOff } = await import('../safety/kill-switch');
  const { checkSpendCap } = await import('../safety/spend-cap');
  const { logDecision } = await import('../audit/decision-log');

  // Pre-flight 1: kill switch
  assertKillSwitchOff();

  // Pre-flight 2: spend cap (pausing doesn't spend money, but we run the check
  // for consistency — planned delta is 0 for pause actions)
  const plannedDelta = decision.delta_budget_usd ?? 0;
  const capResult = await checkSpendCap(Math.max(0, plannedDelta), {
    metaApi: deps.metaApi,
    telegramBot: deps.telegramBot,
    db: deps.spendCapDb,
  });

  if (!capResult.allowed) {
    throw new Error(
      `pause pre-flight failed — spend cap: ${capResult.reason ?? 'unknown reason'}`,
    );
  }

  // Execute via Meta API
  let metaResponse: unknown;
  try {
    metaResponse = await deps.metaApi.pauseAd(decision.ad_id);
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    // Write failed audit record before re-throwing
    const record = await logDecision(decision, false, {
      error: errorMessage,
      metaResponse: undefined,
      db: deps.decisionDb,
    });
    throw Object.assign(
      new Error(`pause failed for ad ${decision.ad_id}: ${errorMessage}`),
      { record },
    );
  }

  // Write success audit record
  return logDecision(decision, true, {
    metaResponse,
    db: deps.decisionDb,
  });
}
