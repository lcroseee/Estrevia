'use client';

/**
 * DecisionRow — expandable table row showing decision summary + reasoning.
 *
 * Click to expand/collapse the full reasoning text and metrics snapshot JSON.
 */

import { useState } from 'react';
import type { AdvertisingDecision } from '@/shared/lib/schema';

const ACTION_COLORS: Record<string, string> = {
  pause: 'text-red-400',
  scale_up: 'text-emerald-400',
  scale_down: 'text-amber-400',
  maintain: 'text-white/50',
  duplicate: 'text-sky-400',
  hold: 'text-white/40',
};

const TIER_LABELS: Record<string, string> = {
  tier_1_rules: 'Rules',
  tier_2_bayesian: 'Bayesian',
  tier_3_anomaly: 'Anomaly',
};

// Helper sub-components to work around strict JSX unknown-type constraints
// on jsonb/nullable drizzle columns.

function ApplyErrorSection({ applyError }: { applyError: AdvertisingDecision['applyError'] }) {
  if (typeof applyError !== 'string' || applyError.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-medium text-red-400 uppercase tracking-wider mb-1">
        Apply Error
      </p>
      <p className="text-sm text-red-300">{applyError}</p>
    </div>
  );
}

function MetaResponseSection({ metaResponse }: { metaResponse: AdvertisingDecision['metaResponse'] }) {
  if (metaResponse === null || metaResponse === undefined) return null;
  return (
    <div>
      <p className="text-xs font-medium text-white/40 uppercase tracking-wider mb-1">
        Meta Response
      </p>
      <pre className="text-xs text-white/50 bg-black/30 rounded p-3 overflow-x-auto">
        {JSON.stringify(metaResponse, null, 2)}
      </pre>
    </div>
  );
}

interface DecisionRowProps {
  decision: AdvertisingDecision;
}

export function DecisionRow({ decision }: DecisionRowProps) {
  const [expanded, setExpanded] = useState(false);

  const actionColor = ACTION_COLORS[decision.action] ?? 'text-white/60';
  const tierLabel = TIER_LABELS[decision.reasoningTier] ?? decision.reasoningTier;
  const confidence = Math.round(decision.confidence * 100);
  const ts = new Date(decision.timestamp);

  return (
    <>
      <tr
        className="cursor-pointer hover:bg-white/3 transition-colors"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        aria-label={`Decision ${decision.id} — ${decision.action} on ${decision.adId}`}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setExpanded((x) => !x)}
      >
        {/* Timestamp */}
        <td className="px-4 py-3 text-white/50 whitespace-nowrap font-mono text-xs">
          {ts.toLocaleString('en-US', {
            month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit',
            hour12: false,
          })}
        </td>

        {/* Ad ID */}
        <td className="px-4 py-3 font-mono text-xs text-white/60 max-w-[120px] truncate">
          {decision.adId}
        </td>

        {/* Action */}
        <td className={`px-4 py-3 font-medium capitalize ${actionColor}`}>
          {decision.action.replace(/_/g, ' ')}
          {decision.deltaBudgetUsd !== null && decision.deltaBudgetUsd !== undefined && (
            <span className="ml-1 text-xs text-white/30">
              {decision.deltaBudgetUsd > 0 ? '+' : ''}
              ${decision.deltaBudgetUsd.toFixed(2)}
            </span>
          )}
        </td>

        {/* Tier */}
        <td className="px-4 py-3 text-white/40 text-xs">{tierLabel}</td>

        {/* Confidence */}
        <td className="px-4 py-3 text-right">
          <span
            className={
              confidence >= 80
                ? 'text-emerald-400'
                : confidence >= 60
                  ? 'text-amber-400'
                  : 'text-red-400'
            }
          >
            {confidence}%
          </span>
        </td>

        {/* Applied */}
        <td className="px-4 py-3">
          {decision.applied ? (
            <span className="text-emerald-400 text-xs">Applied</span>
          ) : (
            <span className="text-white/30 text-xs">
              {decision.applyError ? 'Error' : 'Pending'}
            </span>
          )}
        </td>
      </tr>

      {/* Expanded detail row */}
      {expanded && (
        <tr aria-label="Decision detail">
          <td colSpan={6} className="px-4 pb-4 pt-0">
            <div className="rounded-lg bg-white/3 border border-white/8 p-4 space-y-3">
              {/* Reasoning */}
              <div>
                <p className="text-xs font-medium text-white/40 uppercase tracking-wider mb-1">
                  Reasoning
                </p>
                <p className="text-sm text-white/70">{decision.reason}</p>
              </div>

              {/* Apply error */}
              <ApplyErrorSection applyError={decision.applyError} />

              {/* Metrics snapshot */}
              <div>
                <p className="text-xs font-medium text-white/40 uppercase tracking-wider mb-1">
                  Metrics Snapshot
                </p>
                <pre className="text-xs text-white/50 bg-black/30 rounded p-3 overflow-x-auto">
                  {JSON.stringify(decision.metricsSnapshot, null, 2)}
                </pre>
              </div>

              {/* Meta response if present */}
              <MetaResponseSection metaResponse={decision.metaResponse} />

              {/* Applied timestamp */}
              {decision.appliedAt && (
                <p className="text-xs text-white/30">
                  Applied at: {new Date(decision.appliedAt).toLocaleString()}
                </p>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
