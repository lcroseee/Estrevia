'use client';

/**
 * CreativeCard — displays a single advertising creative pending review.
 *
 * Shows image/video preview, copy, CTA, brand match score, policy check
 * results, and Approve / Reject / Regenerate action buttons.
 *
 * All actions call the admin API routes; the parent page handles revalidation
 * via router.refresh() on success.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AdvertisingCreative } from '@/shared/lib/schema';
import type { SafetyCheckResult } from '@/shared/types/advertising';

// ── helpers ──────────────────────────────────────────────────────────────────

function overallScore(safetyChecks: SafetyCheckResult[]): number | null {
  if (!safetyChecks.length) return null;
  const passed = safetyChecks.filter((c) => c.passed).length;
  return Math.round((passed / safetyChecks.length) * 100);
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return null;
  const color =
    score >= 80
      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
      : score >= 60
        ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
        : 'bg-red-500/15 text-red-400 border-red-500/30';

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${color}`}
      aria-label={`Brand match score: ${score}%`}
    >
      {score}%
    </span>
  );
}

function PolicyBadge({ result }: { result: SafetyCheckResult }) {
  const color = result.passed
    ? 'text-emerald-400'
    : result.severity === 'block'
      ? 'text-red-400'
      : 'text-amber-400';
  return (
    <span
      className={`text-xs ${color}`}
      title={result.reason ?? result.check_name}
      aria-label={`${result.check_name}: ${result.passed ? 'passed' : 'failed'}`}
    >
      {result.passed ? '✓' : '✗'} {result.check_name}
    </span>
  );
}

// ── types ─────────────────────────────────────────────────────────────────────

interface CreativeCardProps {
  creative: AdvertisingCreative;
}

// ── component ─────────────────────────────────────────────────────────────────

export function CreativeCard({ creative }: CreativeCardProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<'approve' | 'reject' | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const safetyChecks = (creative.safetyChecks ?? []) as SafetyCheckResult[];
  const score = overallScore(safetyChecks);
  const hasBlocker = safetyChecks.some((c) => !c.passed && c.severity === 'block');

  async function handleApprove() {
    setLoading('approve');
    setError(null);
    try {
      const res = await fetch(`/api/admin/creatives/${creative.id}/approve`, {
        method: 'POST',
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? 'Approve failed');
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(null);
    }
  }

  async function handleReject() {
    if (!showRejectInput) {
      setShowRejectInput(true);
      return;
    }
    setLoading('reject');
    setError(null);
    try {
      const res = await fetch(`/api/admin/creatives/${creative.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason || 'No reason provided' }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? 'Reject failed');
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(null);
    }
  }

  return (
    <article
      className="flex flex-col bg-white/4 border border-white/10 rounded-xl overflow-hidden"
      aria-label={`Creative ${creative.id}`}
    >
      {/* ── Preview ──────────────────────────────────────────────────── */}
      <div className="relative w-full aspect-video bg-black/40 overflow-hidden">
        {creative.assetKind === 'image' ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={creative.assetUrl}
            alt={`Creative preview for ${creative.hookTemplateId}`}
            className="w-full h-full object-cover"
          />
        ) : (
          <video
            src={creative.assetUrl}
            controls
            muted
            className="w-full h-full object-cover"
            aria-label="Creative video preview"
          />
        )}
        {/* Kind badge */}
        <span className="absolute top-2 left-2 px-1.5 py-0.5 bg-black/60 text-white/70 text-xs rounded uppercase tracking-wider">
          {creative.assetKind}
        </span>
        {/* Locale badge */}
        <span className="absolute top-2 right-2 px-1.5 py-0.5 bg-black/60 text-white/70 text-xs rounded uppercase tracking-wider">
          {creative.locale}
        </span>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 p-4 flex-1">
        {/* Copy & CTA */}
        <div>
          <p className="text-sm text-white/80 leading-snug">{creative.copy}</p>
          <p className="mt-1 text-xs text-white/40">CTA: {creative.cta}</p>
        </div>

        {/* Scores row */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-white/40">Brand match:</span>
          <ScoreBadge score={score} />
          {hasBlocker && (
            <span className="px-2 py-0.5 bg-red-500/15 border border-red-500/30 text-red-400 text-xs rounded-full">
              Policy block
            </span>
          )}
        </div>

        {/* Policy checks */}
        {safetyChecks.length > 0 && (
          <details className="group">
            <summary className="text-xs text-white/40 cursor-pointer select-none hover:text-white/60">
              Policy checks ({safetyChecks.filter((c) => c.passed).length}/{safetyChecks.length} passed)
            </summary>
            <ul className="mt-2 flex flex-col gap-1">
              {safetyChecks.map((check) => (
                <li key={check.check_name}>
                  <PolicyBadge result={check} />
                </li>
              ))}
            </ul>
          </details>
        )}

        {/* Meta info */}
        <p className="text-xs text-white/30">
          Generator: {creative.generator} &middot; Cost: ${creative.costUsd.toFixed(3)} &middot;{' '}
          {new Date(creative.createdAt).toLocaleDateString()}
        </p>

        {/* Error */}
        {error && (
          <p className="text-xs text-red-400" role="alert">
            {error}
          </p>
        )}

        {/* Reject reason input */}
        {showRejectInput && (
          <textarea
            className="w-full px-2 py-1.5 bg-white/6 border border-white/15 rounded text-sm text-white placeholder-white/30 resize-none focus:outline-none focus:border-white/30"
            rows={2}
            placeholder="Reason for rejection (optional)"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            aria-label="Rejection reason"
          />
        )}

        {/* Actions */}
        <div className="flex gap-2 mt-auto pt-2">
          <button
            onClick={handleApprove}
            disabled={loading !== null || hasBlocker}
            className="flex-1 px-3 py-2 rounded-lg bg-emerald-600/80 hover:bg-emerald-600 text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Approve creative"
          >
            {loading === 'approve' ? 'Approving…' : 'Approve'}
          </button>
          <button
            onClick={handleReject}
            disabled={loading !== null}
            className="flex-1 px-3 py-2 rounded-lg bg-red-600/20 hover:bg-red-600/40 text-red-400 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed border border-red-600/30"
            aria-label={showRejectInput ? 'Confirm rejection' : 'Reject creative'}
          >
            {loading === 'reject' ? 'Rejecting…' : showRejectInput ? 'Confirm Reject' : 'Reject'}
          </button>
        </div>

        {/* Regenerate placeholder — S4 integration point */}
        <button
          disabled
          className="w-full px-3 py-1.5 rounded-lg bg-white/4 text-white/30 text-sm font-medium border border-white/8 cursor-not-allowed"
          title="Regenerate is queued for the creative-gen stream (S4)"
        >
          Regenerate (coming soon)
        </button>
      </div>
    </article>
  );
}
