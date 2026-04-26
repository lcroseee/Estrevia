/**
 * /admin/advertising/decisions
 *
 * Server-side paginated log of all advertising_decisions rows.
 * Supports filtering by tier, action, and ad_id via URL search params.
 * Rows are expandable to show full reasoning + metrics snapshot.
 */

import { desc, eq, and, type SQL } from 'drizzle-orm';
import { getDb } from '@/shared/lib/db';
import { advertisingDecisions } from '@/shared/lib/schema';
import type { AdvertisingDecision } from '@/shared/lib/schema';
import { DecisionRow } from './DecisionRow';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Decisions Log | Estrevia Admin',
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50;

const TIER_LABELS: Record<string, string> = {
  tier_1_rules: 'Rules',
  tier_2_bayesian: 'Bayesian',
  tier_3_anomaly: 'Anomaly',
};

const ACTION_LABELS: Record<string, string> = {
  pause: 'Pause',
  scale_up: 'Scale Up',
  scale_down: 'Scale Down',
  maintain: 'Maintain',
  duplicate: 'Duplicate',
  hold: 'Hold',
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface PageProps {
  searchParams: Promise<{ tier?: string; action?: string; ad_id?: string; page?: string }>;
}

export default async function DecisionsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const tierFilter = params.tier ?? '';
  const actionFilter = params.action ?? '';
  const adIdFilter = params.ad_id?.trim() ?? '';
  const page = Math.max(1, parseInt(params.page ?? '1', 10));
  const offset = (page - 1) * PAGE_SIZE;

  const db = getDb();

  // Build filter conditions
  const conditions: SQL[] = [];
  if (tierFilter && tierFilter !== 'all') {
    conditions.push(
      eq(
        advertisingDecisions.reasoningTier,
        tierFilter as AdvertisingDecision['reasoningTier'],
      ),
    );
  }
  if (actionFilter && actionFilter !== 'all') {
    conditions.push(
      eq(
        advertisingDecisions.action,
        actionFilter as AdvertisingDecision['action'],
      ),
    );
  }
  if (adIdFilter) {
    conditions.push(eq(advertisingDecisions.adId, adIdFilter));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select()
    .from(advertisingDecisions)
    .where(whereClause)
    .orderBy(desc(advertisingDecisions.timestamp))
    .limit(PAGE_SIZE)
    .offset(offset);

  const hasNextPage = rows.length === PAGE_SIZE;
  const hasPrevPage = page > 1;

  // Build filter URL helper
  function buildUrl(overrides: Record<string, string>) {
    const p = new URLSearchParams();
    if (tierFilter) p.set('tier', tierFilter);
    if (actionFilter) p.set('action', actionFilter);
    if (adIdFilter) p.set('ad_id', adIdFilter);
    p.set('page', String(page));
    Object.entries(overrides).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k)));
    return `/admin/advertising/decisions?${p.toString()}`;
  }

  return (
    <div>
      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-white">Decisions Log</h1>
        <p className="text-sm text-white/40 mt-0.5">
          Append-only audit log of every advertising agent decision
        </p>
      </div>

      {/* ── Filters ───────────────────────────────────────────────── */}
      <form method="GET" className="flex flex-wrap gap-2 mb-6">
        {/* Tier filter */}
        <select
          name="tier"
          defaultValue={tierFilter || 'all'}
          className="px-3 py-1.5 bg-white/6 border border-white/10 rounded-lg text-sm text-white/70 focus:outline-none focus:border-white/20"
          aria-label="Filter by reasoning tier"
        >
          <option value="all">All tiers</option>
          {Object.entries(TIER_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>

        {/* Action filter */}
        <select
          name="action"
          defaultValue={actionFilter || 'all'}
          className="px-3 py-1.5 bg-white/6 border border-white/10 rounded-lg text-sm text-white/70 focus:outline-none focus:border-white/20"
          aria-label="Filter by action"
        >
          <option value="all">All actions</option>
          {Object.entries(ACTION_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>

        {/* Ad ID filter */}
        <input
          type="text"
          name="ad_id"
          defaultValue={adIdFilter}
          placeholder="Ad ID..."
          className="px-3 py-1.5 bg-white/6 border border-white/10 rounded-lg text-sm text-white/70 placeholder-white/30 focus:outline-none focus:border-white/20 min-w-0"
          aria-label="Filter by ad ID"
        />

        <button
          type="submit"
          className="px-4 py-1.5 bg-white/8 hover:bg-white/12 border border-white/10 rounded-lg text-sm text-white/70 transition-colors"
        >
          Filter
        </button>

        {(tierFilter || actionFilter || adIdFilter) && (
          <a
            href="/admin/advertising/decisions"
            className="px-4 py-1.5 bg-white/4 hover:bg-white/8 border border-white/8 rounded-lg text-sm text-white/40 transition-colors"
          >
            Clear
          </a>
        )}
      </form>

      {/* ── Table ─────────────────────────────────────────────────── */}
      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-white/30">
          <p className="text-sm">No decisions found</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-white/8">
            <table className="w-full text-sm" role="grid" aria-label="Decisions log">
              <thead>
                <tr className="border-b border-white/8 bg-white/3">
                  <th className="text-left px-4 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">
                    Time
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">
                    Ad ID
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">
                    Action
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">
                    Tier
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">
                    Confidence
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">
                    Applied
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {rows.map((row) => (
                  <DecisionRow key={row.id} decision={row} />
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Pagination ──────────────────────────────────────── */}
          <div className="flex items-center justify-between mt-4">
            <p className="text-xs text-white/30">
              Page {page} &middot; {rows.length} rows
            </p>
            <div className="flex gap-2">
              {hasPrevPage && (
                <a
                  href={buildUrl({ page: String(page - 1) })}
                  className="px-3 py-1.5 bg-white/6 hover:bg-white/10 border border-white/10 rounded-lg text-sm text-white/60 transition-colors"
                >
                  Previous
                </a>
              )}
              {hasNextPage && (
                <a
                  href={buildUrl({ page: String(page + 1) })}
                  className="px-3 py-1.5 bg-white/6 hover:bg-white/10 border border-white/10 rounded-lg text-sm text-white/60 transition-colors"
                >
                  Next
                </a>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
