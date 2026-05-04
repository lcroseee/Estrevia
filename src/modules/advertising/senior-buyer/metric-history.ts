import { desc, eq, lt } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import { getDb } from '@/shared/lib/db';
import {
  advertisingAdSetMetricHistory,
  type AdvertisingAdSetMetricHistory,
} from '@/shared/lib/schema';

/**
 * Daily snapshot row as persisted in `advertising_ad_set_metric_history`.
 *
 * Snapshots are written once per (adSetId, date) pair — late-arriving Meta
 * Insights re-runs simply UPSERT the existing row, so the table mirrors the
 * latest authoritative reading rather than accumulating duplicates.
 */
export type MetricHistoryRow = AdvertisingAdSetMetricHistory;

export interface DailySnapshotInput {
  adSetId: string;
  /** YYYY-MM-DD in UTC. */
  date: string;
  impressions: number;
  clicks: number;
  spendUsd: number;
  ctr: number;
  cpc: number;
  cpm: number;
  frequency: number;
  conversionsMeta: number;
  conversionsPosthog: number;
  revenueUsd: number;
  roas: number | null;
}

/**
 * Idempotent UPSERT of one ad set's daily metric snapshot.
 *
 * Keyed by the unique index `uq_metric_history_adset_date` on
 * (ad_set_id, date), so re-runs of the same day collapse onto the existing
 * row. `dayOfWeek` is derived from the supplied date in UTC (0 = Sunday)
 * to support Tue-vs-Tue comparable-window queries downstream.
 */
export async function writeDailySnapshot(input: DailySnapshotInput): Promise<void> {
  const db = getDb();
  const dayOfWeek = new Date(`${input.date}T00:00:00Z`).getUTCDay();

  await db
    .insert(advertisingAdSetMetricHistory)
    .values({
      id: nanoid(),
      adSetId: input.adSetId,
      date: input.date,
      dayOfWeek,
      impressions: input.impressions,
      clicks: input.clicks,
      spendUsd: input.spendUsd,
      ctr: input.ctr,
      cpc: input.cpc,
      cpm: input.cpm,
      frequency: input.frequency,
      conversionsMeta: input.conversionsMeta,
      conversionsPosthog: input.conversionsPosthog,
      revenueUsd: input.revenueUsd,
      roas: input.roas,
      createdAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [advertisingAdSetMetricHistory.adSetId, advertisingAdSetMetricHistory.date],
      set: {
        impressions: input.impressions,
        clicks: input.clicks,
        spendUsd: input.spendUsd,
        ctr: input.ctr,
        cpc: input.cpc,
        cpm: input.cpm,
        frequency: input.frequency,
        conversionsMeta: input.conversionsMeta,
        conversionsPosthog: input.conversionsPosthog,
        revenueUsd: input.revenueUsd,
        roas: input.roas,
      },
    });
}

/**
 * Latest `days` snapshots for an ad set, newest first.
 *
 * Backs comparable-window and baseline-calculator queries — callers want the
 * most recent N rows ordered by date desc.
 */
export async function getRange(adSetId: string, days: number): Promise<MetricHistoryRow[]> {
  const db = getDb();
  return await db
    .select()
    .from(advertisingAdSetMetricHistory)
    .where(eq(advertisingAdSetMetricHistory.adSetId, adSetId))
    .orderBy(desc(advertisingAdSetMetricHistory.date))
    .limit(days);
}

/**
 * Hard-delete snapshots older than `retentionDays` (default ops cadence: 90).
 *
 * Run from a daily cron job. Cutoff is computed from the current wall clock
 * in UTC and compared lexicographically against the YYYY-MM-DD `date` column,
 * which is safe because ISO date strings sort the same as their epoch order.
 */
export async function pruneOldSnapshots(retentionDays: number): Promise<void> {
  const db = getDb();
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString().slice(0, 10);
  await db
    .delete(advertisingAdSetMetricHistory)
    .where(lt(advertisingAdSetMetricHistory.date, cutoff));
}
