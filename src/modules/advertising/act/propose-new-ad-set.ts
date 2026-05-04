import type { AdDecision, DecisionRecord } from '@/shared/types/advertising';
import type { MetaAdActOps } from '@/modules/advertising/meta-graph-api';
import type { SpendCapDeps, AlertSender, InsightsProvider } from '../safety/spend-cap';
import type { DecisionLogDb } from '../audit/decision-log';

/**
 * Narrow Telegram approval interface — matches `TelegramBot.requestApproval`.
 * Defined locally so callers may inject any HIGH_RISK approval source (mock,
 * stub, real Telegram bot) without depending on the full TelegramBot class.
 */
export interface ApprovalSender {
  requestApproval(
    question: string,
    options: Array<{ label: string; value: string }>,
    risk: 'LOW_RISK' | 'HIGH_RISK',
  ): Promise<{ approved: boolean; chosen_value?: string; timed_out?: boolean }>;
}

export interface ProposeNewAdSetDeps {
  /** Narrow act-layer client — only duplicateAdSetWithChanges is called from this module. */
  metaApi: Pick<MetaAdActOps, 'duplicateAdSetWithChanges'>;
  /** Separate insights client used by the spend-cap pre-flight check. */
  insightsApi: InsightsProvider;
  /** Telegram approval source — emits HIGH_RISK request, blocks until founder responds. */
  telegramApproval: ApprovalSender;
  /** Telegram alert sender — used by the spend-cap pre-flight check. */
  telegramBot: AlertSender;
  spendCapDb: SpendCapDeps['db'];
  decisionDb: DecisionLogDb;
}

/**
 * Decision payload extension required for `propose_new_ad_set`.
 *
 * source_ad_set_id     — the ad set to clone
 * proposed_budget_cents — daily budget for the new ad set (cents)
 * rationale            — short string shown to founder for approval context
 * proposed_audience_id — optional custom audience override
 */
export interface ProposeNewAdSetDecision extends AdDecision {
  source_ad_set_id: string;
  proposed_budget_cents: number;
  rationale: string;
  proposed_audience_id?: string;
}

/**
 * Proposes duplicating an existing ad set with new params. HIGH_RISK because
 * it commits new spend potential (a fresh ad set with its own daily budget).
 *
 * Pre-flight order (BEFORE calling Meta API):
 *   1. Assert kill switch is off — throws KillSwitchError if engaged.
 *   2. Request founder approval via Telegram (HIGH_RISK, blocks until response).
 *      Rejection: log applied=false with reason `founder_rejected_proposal`,
 *      return record without touching Meta.
 *   3. Check spend cap with the proposed daily budget — throws if it would breach.
 *
 * On success: Meta API called, audit record written (applied=true).
 * On Meta failure: audit record written (applied=false, error set), then re-throws.
 */
export async function proposeNewAdSet(
  decision: ProposeNewAdSetDecision,
  deps: ProposeNewAdSetDeps,
): Promise<DecisionRecord> {
  if (!decision.source_ad_set_id) {
    throw new Error(
      `propose_new_ad_set requires decision.source_ad_set_id to be set (ad ${decision.ad_id})`,
    );
  }
  if (!Number.isFinite(decision.proposed_budget_cents) || decision.proposed_budget_cents <= 0) {
    throw new Error(
      `propose_new_ad_set requires positive decision.proposed_budget_cents (got ${decision.proposed_budget_cents})`,
    );
  }

  const { assertKillSwitchOff } = await import('../safety/kill-switch');
  const { checkSpendCap } = await import('../safety/spend-cap');
  const { logDecision } = await import('../audit/decision-log');

  // Pre-flight 1: kill switch
  assertKillSwitchOff();

  // Pre-flight 2: founder approval — HIGH_RISK blocks indefinitely
  const proposedBudgetUsd = decision.proposed_budget_cents / 100;
  const message =
    `🚀 *Propose new ad set* (HIGH_RISK)\n` +
    `Source ad set: \`${decision.source_ad_set_id}\`\n` +
    `Proposed budget: $${proposedBudgetUsd.toFixed(2)}/day\n` +
    `Rationale: ${decision.rationale}\n\n` +
    `Reply ✅ to approve, ❌ to reject.`;

  const approval = await deps.telegramApproval.requestApproval(
    message,
    [
      { label: '✅ Approve', value: 'approve' },
      { label: '❌ Reject', value: 'reject' },
    ],
    'HIGH_RISK',
  );

  const approved = approval.approved && approval.chosen_value !== 'reject';
  if (!approved) {
    return logDecision(
      { ...decision, reason: 'founder_rejected_proposal' },
      false,
      {
        error: 'founder_rejected_proposal',
        metaResponse: undefined,
        db: deps.decisionDb,
      },
    );
  }

  // Pre-flight 3: spend cap on the new ad set's daily budget
  const capResult = await checkSpendCap(proposedBudgetUsd, {
    metaApi: deps.insightsApi,
    telegramBot: deps.telegramBot,
    db: deps.spendCapDb,
  });

  if (!capResult.allowed) {
    throw new Error(
      `propose_new_ad_set pre-flight failed — spend cap: ${capResult.reason ?? 'unknown reason'}`,
    );
  }

  // Execute via Meta API
  let metaResponse: { ad_set_id: string };
  try {
    metaResponse = await deps.metaApi.duplicateAdSetWithChanges({
      sourceAdSetId: decision.source_ad_set_id,
      newAudience: decision.proposed_audience_id,
      newBudgetCents: decision.proposed_budget_cents,
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const record = await logDecision(decision, false, {
      error: errorMessage,
      metaResponse: undefined,
      db: deps.decisionDb,
    });
    throw Object.assign(
      new Error(
        `propose_new_ad_set failed for source ${decision.source_ad_set_id}: ${errorMessage}`,
      ),
      { record },
    );
  }

  return logDecision(decision, true, {
    metaResponse,
    db: deps.decisionDb,
  });
}
