/**
 * /admin/advertising/ad-set-state
 *
 * Lists every ad set tracked by the senior-buyer mode with its current
 * lifecycle phase (A/B/C/D/PAUSED/RETIRED), data-maturity mode
 * (COLD_START / CALIBRATING / AUTONOMOUS), and key 7d performance counters.
 *
 * Sorted by `updatedAt` desc so the most recently triaged ad sets surface
 * first. Empty-state copy explains that the first triage-daily run will
 * populate state rows.
 */

import { desc } from 'drizzle-orm';

import { getDb } from '@/shared/lib/db';
import { advertisingAdSetState } from '@/shared/lib/schema';

import { AdSetStateCard } from './AdSetStateCard';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Ad Set State | Estrevia Admin',
};

export default async function AdSetStatePage() {
  const adSets = await getDb()
    .select()
    .from(advertisingAdSetState)
    .orderBy(desc(advertisingAdSetState.updatedAt));

  return (
    <main className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-white">Ad Set State</h1>
        <p className="mt-0.5 text-sm text-white/40">
          Per-ad-set lifecycle phase, data-maturity mode, and key 7d performance
          counters maintained by the senior-buyer evaluator.
        </p>
      </div>

      {adSets.length === 0 ? (
        <p className="text-sm text-white/40">
          No ad sets yet — first triage-daily run will populate state rows.
        </p>
      ) : (
        <div className="grid gap-4">
          {adSets.map((s) => (
            <AdSetStateCard key={s.adSetId} state={s} />
          ))}
        </div>
      )}
    </main>
  );
}
