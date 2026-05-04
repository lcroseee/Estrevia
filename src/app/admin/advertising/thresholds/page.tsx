/**
 * /admin/advertising/thresholds
 *
 * Lists every threshold defined in `COLD_START_DEFAULTS`. For each metric we
 * show: the effective value (most-recent global DB row, or the code default
 * if none), the `source` of that value, and the code default for reference.
 * Inline-edit creates a new `advertising_thresholds` row with
 * `source='founder_override'` (see `actions.ts`).
 *
 * Mirrors the SC + CC + Server Action pattern used by /admin/advertising/gates.
 */

import { desc } from 'drizzle-orm';

import { getDb } from '@/shared/lib/db';
import {
  advertisingThresholds,
  type AdvertisingThreshold,
} from '@/shared/lib/schema';
import {
  COLD_START_DEFAULTS,
  type ThresholdName,
} from '@/modules/advertising/senior-buyer/targets';

import { ThresholdRow } from './ThresholdRow';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Thresholds | Estrevia Admin',
};

export default async function ThresholdsPage() {
  const db = getDb();

  const allRows = await db
    .select()
    .from(advertisingThresholds)
    .orderBy(desc(advertisingThresholds.effectiveFrom));

  // Pick most-recent row per (scope, scopeId, metricName)
  const effectiveByKey = new Map<string, AdvertisingThreshold>();
  for (const r of allRows) {
    const key = `${r.scope}:${r.scopeId ?? 'null'}:${r.metricName}`;
    if (!effectiveByKey.has(key)) effectiveByKey.set(key, r);
  }

  const metricNames = Object.keys(COLD_START_DEFAULTS) as ThresholdName[];

  return (
    <div>
      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-white">Thresholds</h1>
        <p className="text-sm text-white/40 mt-0.5">
          Effective thresholds per metric. Edits insert a new
          <code className="mx-1 px-1 rounded bg-white/8 text-white/60">advertising_thresholds</code>
          row with <code className="mx-1 px-1 rounded bg-white/8 text-white/60">source=&apos;founder_override&apos;</code>.
          Code defaults from
          <code className="mx-1 px-1 rounded bg-white/8 text-white/60">COLD_START_DEFAULTS</code>
          are used when no DB row exists.
        </p>
      </div>

      {/* ── Source legend ─────────────────────────────────────────── */}
      <div className="mb-6 p-4 bg-white/3 border border-white/8 rounded-xl">
        <p className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">
          Source Reference
        </p>
        <dl className="grid gap-1 text-xs">
          <div className="flex gap-3">
            <dt className="text-amber-400 w-40">founder_override</dt>
            <dd className="text-white/40">Manual edit by the founder via this UI.</dd>
          </div>
          <div className="flex gap-3">
            <dt className="text-blue-400 w-40">auto_calibrated</dt>
            <dd className="text-white/40">
              Weekly auto-calibrator job (see senior-buyer/auto-calibrator).
            </dd>
          </div>
          <div className="flex gap-3">
            <dt className="text-neutral-500 w-40">default (code)</dt>
            <dd className="text-white/40">No DB row — falls through to COLD_START_DEFAULTS.</dd>
          </div>
        </dl>
      </div>

      {/* ── Thresholds table ──────────────────────────────────────── */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm" aria-label="Effective thresholds">
          <thead>
            <tr className="text-left text-xs text-white/40 uppercase tracking-wider">
              <th className="py-2 pr-3 font-medium">Metric</th>
              <th className="py-2 pr-3 font-medium">Effective value</th>
              <th className="py-2 pr-3 font-medium">Source</th>
              <th className="py-2 pr-3 font-medium">Code default</th>
              <th className="py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {metricNames.map((m) => {
              const row = effectiveByKey.get(`global:null:${m}`);
              return (
                <ThresholdRow
                  key={m}
                  metric={m}
                  effectiveRow={
                    row
                      ? {
                          value: row.value,
                          source: row.source,
                          effectiveFrom: row.effectiveFrom,
                        }
                      : null
                  }
                  codeDefault={COLD_START_DEFAULTS[m]}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
