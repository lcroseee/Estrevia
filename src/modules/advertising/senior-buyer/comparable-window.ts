import { and, desc, eq } from 'drizzle-orm';

import { getDb } from '@/shared/lib/db';
import { advertisingAdSetMetricHistory } from '@/shared/lib/schema';

import { calculateBaseline, type Baseline } from './baseline-calculator';

/**
 * Metric names that the comparable-window reader understands. The string
 * identifies a column on `advertising_ad_set_metric_history`. Snake_case names
 * mirror the SQL column identifiers the senior-buyer rule layer thinks in.
 */
export type ComparableMetric =
  | 'ctr'
  | 'cpc'
  | 'cpm'
  | 'frequency'
  | 'spend_usd'
  | 'impressions'
  | 'clicks'
  | 'conversions_meta'
  | 'conversions_posthog'
  | 'revenue_usd'
  | 'roas';

export interface ComparableResult {
  current_value: number;
  baseline_mean: number;
  baseline_stddev: number;
  delta_pct: number;
  z_score: number;
  is_significant: boolean;
  sample_size: number;
}

// Below this stddev the baseline is treated as degenerate. Guards against
// floating-point residues from sums of identical samples (e.g. mean of
// [0.05, 0.05, 0.05] yields stddev ≈ 2.5e-18 instead of an exact 0).
const STDDEV_EPSILON = 1e-12;

/**
 * Z-score of `current` against the supplied baseline. When stddev is 0 (or
 * below STDDEV_EPSILON, signalling a degenerate baseline of effectively
 * identical samples) the function returns 0 rather than dividing by zero —
 * the caller should treat 0 as "no signal".
 */
export function computeZScore(
  current: number,
  baseline: Pick<Baseline, 'mean' | 'stddev'>,
): number {
  if (baseline.stddev < STDDEV_EPSILON) return 0;
  return (current - baseline.mean) / baseline.stddev;
}

/**
 * Returns the z-score of today's `metric` value vs the same day-of-week
 * across the last `weeksLookback` weeks. Returns null when fewer than 2
 * prior same-DOW samples exist (insufficient baseline).
 */
export async function comparable(
  ad_set_id: string,
  metric: ComparableMetric,
  weeksLookback = 4,
): Promise<ComparableResult | null> {
  const db = getDb();

  // Pull today + prior same-DOW snapshots (latest weeksLookback + 1 entries
  // for the same dayOfWeek). Ordered desc by date so [0] is the most recent.
  const today = new Date();
  const dow = today.getUTCDay();

  const rows = await db
    .select()
    .from(advertisingAdSetMetricHistory)
    .where(and(
      eq(advertisingAdSetMetricHistory.adSetId, ad_set_id),
      eq(advertisingAdSetMetricHistory.dayOfWeek, dow),
    ))
    .orderBy(desc(advertisingAdSetMetricHistory.date))
    .limit(weeksLookback + 1);

  if (rows.length < 3) return null; // need today + at least 2 prior

  const [current, ...prior] = rows;
  const currentValue = (current as Record<string, unknown>)[metric] as number;
  if (currentValue == null || !Number.isFinite(currentValue)) return null;

  const priorValues = prior
    .map((r) => (r as Record<string, unknown>)[metric] as number)
    .filter((v) => v != null && Number.isFinite(v));

  if (priorValues.length < 2) return null;

  const baseline = calculateBaseline(priorValues);
  const z = computeZScore(currentValue, baseline);
  const delta = baseline.mean !== 0
    ? (currentValue - baseline.mean) / baseline.mean
    : 0;

  return {
    current_value: currentValue,
    baseline_mean: baseline.mean,
    baseline_stddev: baseline.stddev,
    delta_pct: delta,
    z_score: z,
    is_significant: Math.abs(z) > 2.0,
    sample_size: priorValues.length,
  };
}
