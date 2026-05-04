/**
 * ThresholdHistory — Server Component drill-down listing the most recent
 * 20 `advertising_thresholds` rows for a given metric. Used to audit how
 * a threshold has drifted via auto-calibration vs founder overrides.
 */

import { desc, eq } from 'drizzle-orm';

import { getDb } from '@/shared/lib/db';
import { advertisingThresholds } from '@/shared/lib/schema';

interface ThresholdHistoryProps {
  metric: string;
}

export async function ThresholdHistory({ metric }: ThresholdHistoryProps) {
  const rows = await getDb()
    .select()
    .from(advertisingThresholds)
    .where(eq(advertisingThresholds.metricName, metric))
    .orderBy(desc(advertisingThresholds.effectiveFrom))
    .limit(20);

  if (rows.length === 0) {
    return (
      <p className="text-xs text-white/40">No history — this metric uses the code default.</p>
    );
  }

  return (
    <ul className="space-y-1 text-xs font-mono" aria-label={`History for ${metric}`}>
      {rows.map((r) => (
        <li key={r.id} className="text-white/70">
          {new Date(r.effectiveFrom).toISOString().slice(0, 16)} — {r.value.toFixed(2)} (
          {r.source} by {r.changedBy})
          {r.notes ? <span className="ml-2 text-white/40">— {r.notes}</span> : null}
        </li>
      ))}
    </ul>
  );
}
