import { getDb } from '@/shared/lib/db';
import { advertisingThresholds } from '@/shared/lib/schema';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { COLD_START_DEFAULTS, type ThresholdName } from './targets';

export interface ResolveContext {
  ad_set_id: string;
  campaign_id: string;
}

/**
 * Resolves a threshold via 4-step lookup:
 *   1. ad_set scope
 *   2. campaign scope
 *   3. global scope
 *   4. code default in COLD_START_DEFAULTS
 *
 * Each DB lookup picks the most-recent `effective_from` row. On any DB error
 * or invalid value (NaN, Infinity, negative-when-positive-expected), falls
 * back to the code default with a Sentry warn.
 */
export async function resolveThreshold(
  metric: ThresholdName,
  ctx: ResolveContext,
): Promise<number> {
  try {
    const db = getDb();

    // 1. ad_set scope
    const adSet = await db
      .select()
      .from(advertisingThresholds)
      .where(and(
        eq(advertisingThresholds.scope, 'ad_set'),
        eq(advertisingThresholds.scopeId, ctx.ad_set_id),
        eq(advertisingThresholds.metricName, metric),
      ))
      .orderBy(desc(advertisingThresholds.effectiveFrom))
      .limit(1);
    if (adSet.length > 0 && isValid(adSet[0].value)) return adSet[0].value;

    // 2. campaign scope
    const campaign = await db
      .select()
      .from(advertisingThresholds)
      .where(and(
        eq(advertisingThresholds.scope, 'campaign'),
        eq(advertisingThresholds.scopeId, ctx.campaign_id),
        eq(advertisingThresholds.metricName, metric),
      ))
      .orderBy(desc(advertisingThresholds.effectiveFrom))
      .limit(1);
    if (campaign.length > 0 && isValid(campaign[0].value)) return campaign[0].value;

    // 3. global scope
    const global = await db
      .select()
      .from(advertisingThresholds)
      .where(and(
        eq(advertisingThresholds.scope, 'global'),
        isNull(advertisingThresholds.scopeId),
        eq(advertisingThresholds.metricName, metric),
      ))
      .orderBy(desc(advertisingThresholds.effectiveFrom))
      .limit(1);
    if (global.length > 0 && isValid(global[0].value)) return global[0].value;
  } catch (err) {
    console.warn(`[threshold-resolver] DB lookup failed for ${metric} — falling back to default:`, err instanceof Error ? err.message : err);
    try {
      const { captureException } = await import('@sentry/nextjs');
      captureException(err, { tags: { subsystem: 'threshold-resolver', metric } });
    } catch {
      // best-effort
    }
  }

  // 4. code default
  return COLD_START_DEFAULTS[metric];
}

function isValid(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}
