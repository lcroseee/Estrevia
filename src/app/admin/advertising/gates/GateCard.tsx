'use client';

/**
 * GateCard — displays a feature gate with current mode, progress toward
 * activation criteria, and a manual override control (with confirm dialog).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AdvertisingFeatureGate } from '@/shared/lib/schema';

type GateMode = AdvertisingFeatureGate['mode'];

const ALL_MODES: GateMode[] = ['off', 'stub', 'shadow', 'active_proposal', 'active_auto'];

const MODE_COLORS: Record<GateMode, string> = {
  active_auto: 'text-emerald-400',
  active_proposal: 'text-sky-400',
  shadow: 'text-amber-400',
  stub: 'text-white/40',
  off: 'text-white/25',
};

interface ActivationCriteria {
  min_impressions_per_creative?: number;
  min_days_running?: number;
  min_paying_customers?: number;
  min_audience_size?: number;
  shadow_agreement_threshold?: number;
}

interface CurrentState {
  [key: string]: number;
}

interface GateCardProps {
  gate: AdvertisingFeatureGate;
}

export function GateCard({ gate }: GateCardProps) {
  const router = useRouter();
  const [showOverride, setShowOverride] = useState(false);
  const [selectedMode, setSelectedMode] = useState<GateMode>(gate.mode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const criteria = (gate.activationCriteria ?? {}) as ActivationCriteria;
  const state = (gate.currentState ?? {}) as CurrentState;

  // Build progress items from criteria vs current state
  const progressItems = Object.entries(criteria).map(([key, target]) => {
    const current = state[key] ?? 0;
    const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 100;
    return { key, label: key.replace(/_/g, ' '), current, target, pct };
  });

  async function handleOverride() {
    if (selectedMode === gate.mode) {
      setShowOverride(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/gates/${gate.featureId}/mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: selectedMode }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? 'Override failed');
      }
      setShowOverride(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  const modeColor = MODE_COLORS[gate.mode] ?? 'text-white/40';

  return (
    <article
      className="flex flex-col bg-white/4 border border-white/10 rounded-xl p-4 gap-4"
      aria-label={`Feature gate: ${gate.featureId}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-white font-mono">{gate.featureId}</h2>
          {gate.activatedAt && (
            <p className="text-xs text-white/30 mt-0.5">
              Activated: {new Date(gate.activatedAt).toLocaleDateString()}
            </p>
          )}
        </div>
        <span className={`text-xs font-medium capitalize ${modeColor}`}>
          {gate.mode.replace(/_/g, ' ')}
        </span>
      </div>

      {/* Progress toward activation criteria */}
      {progressItems.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-white/40 uppercase tracking-wider">
            Activation progress
          </p>
          {progressItems.map((item) => (
            <div key={item.key}>
              <div className="flex justify-between text-xs text-white/50 mb-1">
                <span>{item.label}</span>
                <span>
                  {item.current.toLocaleString()} / {item.target.toLocaleString()}
                </span>
              </div>
              <div
                className="h-1.5 bg-white/8 rounded-full overflow-hidden"
                role="progressbar"
                aria-valuenow={item.pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${item.label} progress: ${item.pct}%`}
              >
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all"
                  style={{ width: `${item.pct}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Manual override */}
      {!showOverride ? (
        <button
          onClick={() => setShowOverride(true)}
          className="text-xs text-white/30 hover:text-white/60 transition-colors text-left"
          aria-label="Open manual mode override"
        >
          Override mode (emergency) &rsaquo;
        </button>
      ) : (
        <div className="space-y-3 border-t border-white/8 pt-3">
          <p className="text-xs text-amber-400">
            Manual override — confirm the new mode carefully.
          </p>

          <select
            value={selectedMode}
            onChange={(e) => setSelectedMode(e.target.value as GateMode)}
            className="w-full px-2 py-1.5 bg-white/6 border border-white/15 rounded text-sm text-white focus:outline-none focus:border-white/30"
            aria-label="Select new gate mode"
          >
            {ALL_MODES.map((m) => (
              <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>
            ))}
          </select>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex gap-2">
            <button
              onClick={handleOverride}
              disabled={loading}
              className="flex-1 px-3 py-1.5 rounded-lg bg-amber-600/40 hover:bg-amber-600/60 text-amber-300 text-sm font-medium transition-colors disabled:opacity-50"
              aria-label="Confirm mode override"
            >
              {loading ? 'Updating…' : 'Confirm Override'}
            </button>
            <button
              onClick={() => { setShowOverride(false); setSelectedMode(gate.mode); setError(null); }}
              disabled={loading}
              className="px-3 py-1.5 rounded-lg bg-white/6 hover:bg-white/10 text-white/40 text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
