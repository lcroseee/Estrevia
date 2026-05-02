/**
 * /admin/advertising/creatives/review
 *
 * Server component — fetches creatives from DB filtered by ?status=…,
 * renders grid of CreativeCard components. Defaults to pending_review.
 * Shows StatusFilter dropdown, PublishAllButton when status=approved,
 * and BulkApproveButton when status=pending_review.
 */

import { eq, desc } from 'drizzle-orm';
import { getDb } from '@/shared/lib/db';
import { advertisingCreatives } from '@/shared/lib/schema';
import type { AdvertisingCreative } from '@/shared/lib/schema';
import type { SafetyCheckResult } from '@/shared/types/advertising';
import { CreativeCard } from './CreativeCard';
import { BulkApproveButton } from './BulkApproveButton';
import { StatusFilter } from './StatusFilter';
import { PublishAllButton } from './PublishAllButton';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Creative Review | Estrevia Admin',
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALL_STATUSES = [
  'pending_review', 'approved', 'uploaded', 'live', 'paused', 'rejected',
] as const;
type StatusKey = typeof ALL_STATUSES[number];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeScore(creative: AdvertisingCreative): number {
  const checks = (creative.safetyChecks ?? []) as SafetyCheckResult[];
  if (!checks.length) return 0;
  return checks.filter((c) => c.passed).length / checks.length;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function CreativeReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const requested = sp.status ?? 'pending_review';
  const showAll = requested === 'all';
  const filter = (ALL_STATUSES as readonly string[]).includes(requested)
    ? (requested as StatusKey)
    : 'pending_review';

  const db = getDb();

  const rows = showAll
    ? await db
        .select()
        .from(advertisingCreatives)
        .orderBy(desc(advertisingCreatives.createdAt))
        .limit(200)
    : await db
        .select()
        .from(advertisingCreatives)
        .where(eq(advertisingCreatives.status, filter))
        .orderBy(desc(advertisingCreatives.createdAt))
        .limit(200);

  // Sort by score for bulk-approve top-6 (only relevant on pending_review)
  const sortedByScore = [...rows].sort((a, b) => computeScore(b) - computeScore(a));
  const top6Ids = filter === 'pending_review'
    ? sortedByScore.slice(0, 6).map((c) => c.id)
    : [];

  const statusLabel = showAll ? 'all statuses' : filter;

  return (
    <div>
      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white">Creative Review</h1>
          <p className="text-sm text-white/40 mt-0.5">
            {rows.length} creative{rows.length !== 1 ? 's' : ''} ({statusLabel})
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <StatusFilter current={showAll ? 'all' : filter} />

          {/* Publish all approved → calls /api/admin/creatives/publish-batch */}
          {filter === 'approved' && !showAll && <PublishAllButton />}

          {/* Bulk approve top 6 by safety score */}
          {filter === 'pending_review' && !showAll && top6Ids.length > 0 && (
            <BulkApproveButton
              ids={top6Ids}
              label={`Approve top ${top6Ids.length} by score`}
            />
          )}
        </div>
      </div>

      {/* ── Grid ──────────────────────────────────────────────────── */}
      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-white/30">
          <p className="text-4xl mb-3">∅</p>
          <p className="text-sm">No creatives match this filter</p>
        </div>
      ) : (
        <ul
          className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
          aria-label="Creatives"
        >
          {rows.map((creative) => (
            <li key={creative.id}>
              <CreativeCard creative={creative} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
