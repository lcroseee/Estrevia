import 'server-only';
import { eq } from 'drizzle-orm';
import { getDb } from './db';
import { natalCharts } from './schema';
import type { ChartResult } from '@/shared/types';

/**
 * Fetches the computed `chart_data` JSONB for a temp natal chart by id.
 * Returns null when:
 *   - chartId is null/undefined (lead may have submitted without a chart)
 *   - chart row was deleted by cleanup-temp-charts cron (graceful fallback)
 *
 * No PII concerns: temp charts store only the calculated planet/house
 * positions, NOT the original birth date/time/location (which is replaced
 * by a placeholder ciphertext in the calculate endpoint).
 */
export async function fetchTempChart(chartId: string | null | undefined): Promise<ChartResult | null> {
  if (!chartId) return null;
  const db = getDb();
  const rows = await db
    .select({ chartData: natalCharts.chartData })
    .from(natalCharts)
    .where(eq(natalCharts.id, chartId));
  if (rows.length === 0) return null;
  return rows[0].chartData as ChartResult;
}
