/**
 * /admin/advertising/gates
 *
 * Feature gates overview — shows each gate's mode, activation criteria,
 * current progress, and a manual override control (with confirmation).
 */

import { getDb } from '@/shared/lib/db';
import { advertisingFeatureGates } from '@/shared/lib/schema';
import type { AdvertisingFeatureGate } from '@/shared/lib/schema';
import { GateCard } from './GateCard';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Feature Gates | Estrevia Admin',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type GateMode = AdvertisingFeatureGate['mode'];

const MODE_DESCRIPTIONS: Record<GateMode, string> = {
  off: 'Disabled — component is inactive',
  stub: 'Stub — returns mock data, no real side effects',
  shadow: 'Shadow — runs alongside active path, logs comparison only',
  active_proposal: 'Active Proposal — produces decisions but requires human approval',
  active_auto: 'Active Auto — fully autonomous, executes without approval',
};

const MODE_ORDER: GateMode[] = ['active_auto', 'active_proposal', 'shadow', 'stub', 'off'];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function GatesPage() {
  const db = getDb();

  const gates = await db.select().from(advertisingFeatureGates);

  // Sort: active gates first, then by mode order
  const sorted = [...gates].sort((a, b) => {
    return MODE_ORDER.indexOf(a.mode) - MODE_ORDER.indexOf(b.mode);
  });

  return (
    <div>
      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-white">Feature Gates</h1>
        <p className="text-sm text-white/40 mt-0.5">
          Runtime mode control for advertising agent components. Manual overrides
          require confirmation.
        </p>
      </div>

      {/* ── Mode legend ───────────────────────────────────────────── */}
      <div className="mb-6 p-4 bg-white/3 border border-white/8 rounded-xl">
        <p className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">
          Mode Reference
        </p>
        <dl className="grid gap-1">
          {MODE_ORDER.map((mode) => (
            <div key={mode} className="flex gap-3 text-xs">
              <dt>
                <ModeBadge mode={mode} />
              </dt>
              <dd className="text-white/40">{MODE_DESCRIPTIONS[mode]}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* ── Gates grid ────────────────────────────────────────────── */}
      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-white/30">
          <p className="text-sm">No feature gates found</p>
          <p className="text-xs mt-1">Gates are seeded by the advertising module on first run.</p>
        </div>
      ) : (
        <ul className="grid gap-4 grid-cols-1 md:grid-cols-2" aria-label="Feature gates">
          {sorted.map((gate) => (
            <li key={gate.featureId}>
              <GateCard gate={gate} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline helper component (server-safe, no state)
// ---------------------------------------------------------------------------

function ModeBadge({ mode }: { mode: GateMode }) {
  const colors: Record<GateMode, string> = {
    active_auto: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    active_proposal: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
    shadow: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    stub: 'bg-white/10 text-white/40 border-white/15',
    off: 'bg-white/5 text-white/25 border-white/10',
  };

  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${colors[mode]}`}>
      {mode.replace(/_/g, ' ')}
    </span>
  );
}
