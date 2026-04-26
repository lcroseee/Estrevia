import { nanoid } from 'nanoid';
import type { AdDecision, DecisionRecord } from '@/shared/types/advertising';
import type { advertisingDecisions } from '@/shared/lib/schema';

// Minimal DB interface for DI in tests — mirrors Drizzle's insert shape
export interface DecisionLogDb {
  insert(
    table: typeof advertisingDecisions,
  ): {
    values(row: {
      id: string;
      adId: string;
      action: string;
      deltaBudgetUsd: number | undefined;
      reason: string;
      reasoningTier: string;
      confidence: number;
      metricsSnapshot: unknown;
      applied: boolean;
      appliedAt: Date | undefined;
      applyError: string | undefined;
      metaResponse: unknown;
    }): Promise<void>;
  };
  select(): {
    from(
      table: typeof advertisingDecisions,
    ): {
      where(condition: unknown): Promise<DecisionDbRow[]>;
    };
  };
}

export interface DecisionDbRow {
  id: string;
  timestamp: Date;
  adId: string;
  action: string;
  deltaBudgetUsd: number | null;
  reason: string;
  reasoningTier: string;
  confidence: number;
  metricsSnapshot: unknown;
  applied: boolean;
  appliedAt: Date | null;
  applyError: string | null;
  metaResponse: unknown;
}

/**
 * Appends a decision record to advertising_decisions (append-only).
 * No UPDATE/DELETE methods are exposed by this module.
 */
export async function logDecision(
  decision: AdDecision,
  applied: boolean,
  opts: {
    error?: string;
    metaResponse?: unknown;
    db: DecisionLogDb;
  },
): Promise<DecisionRecord> {
  const id = nanoid();
  const now = new Date();

  const row = {
    id,
    adId: decision.ad_id,
    action: decision.action,
    deltaBudgetUsd: decision.delta_budget_usd,
    reason: decision.reason,
    reasoningTier: decision.reasoning_tier,
    confidence: decision.confidence,
    metricsSnapshot: decision.metrics_snapshot,
    applied,
    appliedAt: applied ? now : undefined,
    applyError: opts.error,
    metaResponse: opts.metaResponse,
  };

  // Drizzle insert — append only. No update/delete path exists in this module.
  const { advertisingDecisions: table } = await import('@/shared/lib/schema');
  await opts.db.insert(table).values(row);

  const record: DecisionRecord = {
    id,
    timestamp: now,
    decision,
    applied,
    apply_error: opts.error,
    applied_at: applied ? now : undefined,
    meta_response: opts.metaResponse,
  };

  return record;
}

/**
 * Queries audit records for a given ad, optionally since a cutoff date.
 * Returned rows are read-only snapshots — mutations are impossible via this API.
 */
export async function getDecisionsForAd(
  adId: string,
  since: Date,
  db: DecisionLogDb,
): Promise<DecisionDbRow[]> {
  const { advertisingDecisions: table } = await import('@/shared/lib/schema');
  const { gte, eq, and } = await import('drizzle-orm');

  const rows = await db
    .select()
    .from(table)
    .where(and(eq(table.adId, adId), gte(table.timestamp, since)));

  return rows;
}
