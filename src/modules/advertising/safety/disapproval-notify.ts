/**
 * Disapproval handler for Meta ad policy violations.
 *
 * When Meta disapproves an ad, this handler:
 *   1. Logs the event to the audit trail (decision log + creative log)
 *   2. Sends a Telegram alert (severity = 'critical')
 *   3. Pauses the related ad via the act layer
 *   4. Tracks disapproval rate per hook archetype (DB write)
 *
 * NO auto-fix — per explicit scope decision. Human review required.
 */

import type { HookArchetype } from '@/shared/types/advertising';
import type { DecisionLogDb } from '../audit/decision-log';
import type { CreativeLogDb } from '../audit/creative-log';
import type { advertisingDecisions } from '@/shared/lib/schema';

/** Minimal Meta API interface needed by the disapproval handler. */
export interface DisapprovalMetaApi {
  pauseAd(adId: string): Promise<{ success: boolean }>;
}

/** Minimal Telegram interface needed by the disapproval handler. */
export interface DisapprovalAlertSender {
  sendMessage(msg: { severity: string; text: string }): Promise<unknown>;
}

export interface MetaDisapprovalEvent {
  ad_id: string;
  adset_id: string;
  campaign_id: string;
  reason: string; // Meta policy reason code/description
  policy_summary?: string;
  hook_archetype?: HookArchetype;
  occurred_at: Date;
}

// In-memory disapproval counter for hot-path rate tracking.
// A persistent DB write also happens (see writeDisapprovalRate).
const disapprovalCounts: Map<string, number[]> = new Map();

export interface DisapprovalDeps {
  metaApi: DisapprovalMetaApi;
  telegramBot: DisapprovalAlertSender;
  decisionDb: DecisionLogDb;
  creativeDb: CreativeLogDb;
  disapprovalRateDb: DisapprovalRateDb;
}

/**
 * Minimal DB interface for disapproval rate tracking.
 */
export interface DisapprovalRateDb {
  insert(
    table: typeof advertisingDecisions,
  ): {
    values(row: unknown): Promise<void>;
  };
  select(): {
    from(table: typeof advertisingDecisions): {
      where(condition: unknown): Promise<DisapprovalRateRow[]>;
    };
  };
}

export interface DisapprovalRateRow {
  id: string;
  timestamp: Date;
  adId: string;
  action: string;
  reason: string;
  reasoningTier: string;
  confidence: number;
  metricsSnapshot: unknown;
  applied: boolean;
}

/**
 * Handles a Meta disapproval webhook event end-to-end.
 * Throws on unexpected errors — callers should log and alert independently.
 */
export async function handleDisapproval(
  event: MetaDisapprovalEvent,
  deps: DisapprovalDeps,
): Promise<void> {
  const { logDecision } = await import('../audit/decision-log');
  const { logCreativeEvent } = await import('../audit/creative-log');

  // 1. Write to creative audit log
  await logCreativeEvent(
    event.ad_id, // use ad_id as bundle proxy (we don't have bundle_id from Meta webhook)
    'paused',
    'meta',
    {
      ad_id: event.ad_id,
      adset_id: event.adset_id,
      campaign_id: event.campaign_id,
      reason: event.reason,
      policy_summary: event.policy_summary ?? null,
      hook_archetype: event.hook_archetype ?? null,
      occurred_at: event.occurred_at.toISOString(),
    },
    deps.creativeDb,
  );

  // 2. Write to decision audit log (synthetic decision — meta forced the pause)
  const syntheticDecision = {
    ad_id: event.ad_id,
    action: 'pause' as const,
    reason: `meta_disapproval: ${event.reason}`,
    reasoning_tier: 'tier_1_rules' as const,
    confidence: 1.0,
    metrics_snapshot: {
      ad_id: event.ad_id,
      adset_id: event.adset_id,
      campaign_id: event.campaign_id,
      date: event.occurred_at.toISOString().slice(0, 10),
      impressions: 0,
      clicks: 0,
      spend_usd: 0,
      ctr: 0,
      cpc: 0,
      cpm: 0,
      frequency: 0,
      reach: 0,
      days_running: 0,
      status: 'DISAPPROVED' as const,
    },
  };

  await logDecision(syntheticDecision, true, {
    error: undefined,
    metaResponse: { disapproval_reason: event.reason },
    db: deps.decisionDb,
  });

  // 3. Send Telegram alert
  const archetypeInfo = event.hook_archetype
    ? `\nHook archetype: ${event.hook_archetype}`
    : '';

  await deps.telegramBot.sendMessage({
    severity: 'critical',
    text:
      `[Advertising Agent] AD DISAPPROVED\n` +
      `Ad ID: ${event.ad_id}\n` +
      `Reason: ${event.reason}` +
      (event.policy_summary ? `\nPolicy: ${event.policy_summary}` : '') +
      archetypeInfo +
      `\nOccurred at: ${event.occurred_at.toISOString()}\n` +
      `Action: ad paused. Human review required — no auto-fix.`,
  });

  // 4. Pause the ad via Meta API
  await deps.metaApi.pauseAd(event.ad_id);

  // 5. Track disapproval rate per archetype
  if (event.hook_archetype) {
    await writeDisapprovalRate(event.hook_archetype, event.occurred_at, deps.disapprovalRateDb);
  }
}

/**
 * Writes a disapproval event timestamp for the given archetype to the DB
 * so that getDisapprovalRate can query it later.
 */
async function writeDisapprovalRate(
  hookArchetype: HookArchetype,
  occurredAt: Date,
  db: DisapprovalRateDb,
): Promise<void> {
  // Record in-memory for fast retrieval within the same process
  const key = hookArchetype;
  const existing = disapprovalCounts.get(key) ?? [];
  existing.push(occurredAt.getTime());
  disapprovalCounts.set(key, existing);

  // Persist to DB via decision log table (reusing it for disapproval rate rows
  // avoids a schema change; the action='pause' + reason prefix makes them
  // identifiable).
  const { advertisingDecisions: table } = await import('@/shared/lib/schema');
  const { nanoid } = await import('nanoid');

  await db.insert(table).values({
    id: nanoid(),
    timestamp: occurredAt,
    adId: `disapproval_rate_${hookArchetype}`,
    action: 'pause',
    reason: `disapproval_rate_tracking:${hookArchetype}`,
    reasoningTier: 'tier_1_rules',
    confidence: 1.0,
    metricsSnapshot: { hook_archetype: hookArchetype, occurred_at: occurredAt.toISOString() },
    applied: true,
    appliedAt: occurredAt,
    applyError: null,
    metaResponse: null,
  });
}

/**
 * Returns the disapproval rate (events / day) for a given hook archetype
 * over the last windowDays days.
 *
 * Prefers in-memory counts (same process); falls back to 0 if the process
 * was restarted. A future version could query the DB for accuracy across
 * restarts.
 */
export function getDisapprovalRate(hookArchetype: HookArchetype, windowDays: number): number {
  const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  const timestamps = disapprovalCounts.get(hookArchetype) ?? [];
  const inWindow = timestamps.filter((ts) => ts >= cutoff);
  return inWindow.length / windowDays;
}

/** Reset in-memory counters — for use in tests only. */
export function _resetDisapprovalCounters(): void {
  disapprovalCounts.clear();
}
