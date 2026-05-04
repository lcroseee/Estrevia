/**
 * AdSetStateCard — per-row drill card for /admin/advertising/ad-set-state.
 *
 * Renders the current phase + maturity badges along with the senior-buyer's
 * key decision inputs (conversions, ROAS, CPA, frequency, duplicates) so the
 * founder can quickly inspect why an ad set is in its current state.
 */

import type { AdvertisingAdSetState } from '@/shared/lib/schema';

const PHASE_COLOR: Record<string, string> = {
  A: 'bg-neutral-700',
  B: 'bg-amber-700',
  C: 'bg-emerald-700',
  D: 'bg-orange-700',
  PAUSED: 'bg-red-700',
  RETIRED: 'bg-neutral-800',
};

const MATURITY_COLOR: Record<string, string> = {
  COLD_START: 'text-neutral-500',
  CALIBRATING: 'text-amber-400',
  AUTONOMOUS: 'text-emerald-400',
};

export function AdSetStateCard({ state }: { state: AdvertisingAdSetState }) {
  return (
    <article className="rounded border border-neutral-800 p-4 text-sm">
      <header className="mb-3 flex items-baseline justify-between">
        <h2 className="font-mono text-xs">
          {state.adSetId}
          <span className="ml-2 text-neutral-500">({state.locale})</span>
        </h2>
        <span
          className={`rounded px-2 py-0.5 text-xs ${
            PHASE_COLOR[state.currentPhase] ?? 'bg-neutral-700'
          }`}
        >
          Phase {state.currentPhase}
        </span>
      </header>
      <dl className="grid grid-cols-[160px_1fr] gap-y-1">
        <dt className="text-neutral-500">Data maturity</dt>
        <dd className={MATURITY_COLOR[state.dataMaturityMode]}>
          {state.dataMaturityMode}
        </dd>

        <dt className="text-neutral-500">Optimization event</dt>
        <dd className="font-mono text-xs">{state.optimizationEvent}</dd>

        <dt className="text-neutral-500">Conversions (Meta 7d / 14d / total)</dt>
        <dd>
          {state.conversions7dMeta} / {state.conversions14dMeta} /{' '}
          {state.conversionsTotalMeta}
        </dd>

        <dt className="text-neutral-500">Days with Pixel data</dt>
        <dd>{state.daysWithPixelData}</dd>

        <dt className="text-neutral-500">ROAS 7d / CPA 7d</dt>
        <dd>
          {state.roas7d?.toFixed(2) ?? '—'} / ${state.cpa7d?.toFixed(2) ?? '—'}
        </dd>

        <dt className="text-neutral-500">Frequency</dt>
        <dd>{state.frequencyCurrent?.toFixed(2) ?? '—'}</dd>

        <dt className="text-neutral-500">Duplicates</dt>
        <dd>{state.duplicatesCount} / 2 (max)</dd>

        <dt className="text-neutral-500">Phase entered</dt>
        <dd>{new Date(state.phaseEnteredAt).toISOString().slice(0, 10)}</dd>

        {state.flaggedForReview && (
          <>
            <dt className="text-amber-400">⚠ Flagged</dt>
            <dd className="text-amber-400">{state.flagReason}</dd>
          </>
        )}
      </dl>
    </article>
  );
}
