/**
 * /admin/advertising/creatives/review
 *
 * Server component — fetches pending_review creatives from DB, renders grid
 * of CreativeCard components. Includes bulk "Approve top 6 by score" action.
 */

import { eq, desc } from 'drizzle-orm';
import { getDb } from '@/shared/lib/db';
import { advertisingCreatives } from '@/shared/lib/schema';
import type { AdvertisingCreative } from '@/shared/lib/schema';
import type { SafetyCheckResult } from '@/shared/types/advertising';
import { CreativeCard } from './CreativeCard';
import { BulkApproveButton } from './BulkApproveButton';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Creative Review | Estrevia Admin',
};

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

export default async function CreativeReviewPage() {
  const db = getDb();

  const pending = await db
    .select()
    .from(advertisingCreatives)
    .where(eq(advertisingCreatives.status, 'pending_review'))
    .orderBy(desc(advertisingCreatives.createdAt));

  // Sort by score desc for the bulk-approve list
  const sortedByScore = [...pending].sort((a, b) => computeScore(b) - computeScore(a));
  const top6Ids = sortedByScore.slice(0, 6).map((c) => c.id);

  return (
    <div>
      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white">Creative Review</h1>
          <p className="text-sm text-white/40 mt-0.5">
            {pending.length} creative{pending.length !== 1 ? 's' : ''} pending review
          </p>
        </div>

        {/* Bulk approve top 6 */}
        {top6Ids.length > 0 && (
          <BulkApproveButton
            ids={top6Ids}
            label={`Approve top ${top6Ids.length} by score`}
          />
        )}
      </div>

      {/* ── Grid ──────────────────────────────────────────────────── */}
      {pending.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-white/30">
          <p className="text-4xl mb-3">✓</p>
          <p className="text-sm">No creatives pending review</p>
        </div>
      ) : (
        <ul
          className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
          aria-label="Pending creative review queue"
        >
          {pending.map((creative) => (
            <li key={creative.id}>
              <CreativeCard creative={creative} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
