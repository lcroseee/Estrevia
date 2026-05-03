/**
 * /admin/advertising/recon-state
 *
 * Reconciler global-suspend state viewer + founder unblock control.
 *
 * Background: when the reconciler detects critical_drift between Meta clicks
 * and PostHog landing_view counts (>= 25%), the agent suspends all
 * non-emergency decisions for 24h auto-resume. This page lets the founder
 * inspect the current state and force-resume earlier if drift was caused by
 * a known event (deploy, tracking-pixel outage, etc.).
 */

import { getReconState } from '@/modules/advertising/perceive/recon-state-store';
import { resumeNowAction } from './actions';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Reconciler State | Estrevia Admin',
};

function formatPct(value: number | null): string {
  if (value === null) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

function formatDate(value: Date | null): string {
  if (!value) return '—';
  return value.toISOString();
}

export default async function ReconStatePage() {
  const state = await getReconState();

  return (
    <div>
      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-white">Reconciler State</h1>
        <p className="text-sm text-white/40 mt-0.5">
          Global agent-suspend status driven by Meta-vs-PostHog click reconciliation.
          When suspended, only DISAPPROVED-ad emergency pauses flow through; all other
          decisioning is paused for 24h auto-resume.
        </p>
      </div>

      {/* ── Status banner ─────────────────────────────────────────── */}
      <div
        className={[
          'mb-6 rounded-xl border p-4',
          state.suspended
            ? 'border-amber-500/50 bg-amber-500/10'
            : 'border-emerald-500/40 bg-emerald-500/10',
        ].join(' ')}
        role="status"
        aria-live="polite"
      >
        <p
          className={[
            'text-sm font-semibold',
            state.suspended ? 'text-amber-200' : 'text-emerald-200',
          ].join(' ')}
        >
          {state.suspended
            ? 'SUSPENDED — agent decisioning is paused (emergency pauses only)'
            : 'Active — agent is decisioning normally'}
        </p>
      </div>

      {/* ── State details ─────────────────────────────────────────── */}
      <dl className="grid grid-cols-[160px_1fr] gap-y-2 text-sm">
        <dt className="text-white/40">Suspended</dt>
        <dd className="text-white">{state.suspended ? 'Yes' : 'No'}</dd>

        <dt className="text-white/40">Suspended at</dt>
        <dd className="text-white">{formatDate(state.suspendedAt)}</dd>

        <dt className="text-white/40">Reason</dt>
        <dd className="font-mono text-xs text-white/80 break-words">
          {state.suspendReason ?? '—'}
        </dd>

        <dt className="text-white/40">Auto-resume at</dt>
        <dd className="text-white">{formatDate(state.autoResumeAt)}</dd>

        <dt className="text-white/40">Last drift %</dt>
        <dd className="text-white">{formatPct(state.lastDriftPct)}</dd>
      </dl>

      {/* ── Founder override ──────────────────────────────────────── */}
      {state.suspended ? (
        <form action={resumeNowAction} className="mt-8">
          <button
            type="submit"
            className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-amber-400"
          >
            Resume Now (founder override)
          </button>
          <p className="mt-2 text-xs text-white/40">
            Clears the suspended flag immediately. The next reconcile() can re-suspend
            if drift is still present.
          </p>
        </form>
      ) : (
        <p className="mt-8 text-xs text-white/40">
          Agent is active. The reconciler will auto-suspend if Meta-vs-PostHog drift
          exceeds 25%.
        </p>
      )}
    </div>
  );
}
