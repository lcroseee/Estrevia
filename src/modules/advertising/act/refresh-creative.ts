import type { AdDecision, DecisionRecord } from '@/shared/types/advertising';
import type { MetaAdActOps } from '@/modules/advertising/meta-graph-api';
import type { DecisionLogDb } from '../audit/decision-log';

export interface RefreshCreativeDeps {
  /** Narrow act-layer client — only replaceAdCreative is called from this module. */
  metaApi: Pick<MetaAdActOps, 'replaceAdCreative'>;
  decisionDb: DecisionLogDb;
}

/**
 * Replaces the creative on an existing ad WITHOUT touching budget, audience,
 * or optimization. This resets Meta's learning phase for that ad set; the
 * approval-router treats it as LEARNING_RESET (Q12, Phase D).
 *
 * No spend cap check: zero new spend potential — the ad set's existing daily
 * budget is unchanged. Kill switch still gates: an engaged kill switch means
 * the agent is OFF, no Meta API calls at all.
 *
 * On success: Meta API called, audit record written (applied=true).
 * On Meta failure: audit record written (applied=false, error set), then re-throws.
 */
export async function refreshCreative(
  decision: AdDecision & { new_creative_id: string },
  deps: RefreshCreativeDeps,
): Promise<DecisionRecord> {
  if (!decision.new_creative_id) {
    throw new Error(
      `refresh_creative requires decision.new_creative_id to be set for ad ${decision.ad_id}`,
    );
  }

  const { assertKillSwitchOff } = await import('../safety/kill-switch');
  const { logDecision } = await import('../audit/decision-log');

  // Pre-flight: kill switch
  assertKillSwitchOff();

  // Execute via Meta API
  let metaResponse: { ad_id: string; new_creative_id: string };
  try {
    metaResponse = await deps.metaApi.replaceAdCreative(
      decision.ad_id,
      decision.new_creative_id,
    );
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const record = await logDecision(decision, false, {
      error: errorMessage,
      metaResponse: undefined,
      db: deps.decisionDb,
    });
    throw Object.assign(
      new Error(`refresh_creative failed for ad ${decision.ad_id}: ${errorMessage}`),
      { record },
    );
  }

  return logDecision(decision, true, {
    metaResponse,
    db: deps.decisionDb,
  });
}
