/**
 * /admin/advertising/spend
 *
 * Read-only spend overview:
 * - Today's spend vs. cap (progress bar)
 * - 7-day spend history (SVG bar chart)
 * - Per-day breakdown table
 */

import { desc } from 'drizzle-orm';
import { getDb } from '@/shared/lib/db';
import { advertisingSpendDaily } from '@/shared/lib/schema';
import { SpendChart } from './SpendChart';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Spend Overview | Estrevia Admin',
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function SpendPage() {
  const db = getDb();

  // Fetch last 7 days of spend data
  const rows = await db
    .select()
    .from(advertisingSpendDaily)
    .orderBy(desc(advertisingSpendDaily.date))
    .limit(7);

  const today = rows[0] ?? null;

  // Reverse to chronological order for chart
  const chronological = [...rows].reverse();

  // Compute 7-day total
  const totalSpent = rows.reduce((sum, r) => sum + r.spentUsd, 0);

  return (
    <div>
      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-white">Spend Overview</h1>
        <p className="text-sm text-white/40 mt-0.5">
          Read-only. Hard daily cap enforced by the agent — contact the agent to adjust budgets.
        </p>
      </div>

      {/* ── Today's spend / cap ───────────────────────────────────── */}
      {today ? (
        <section
          className="mb-6 p-5 bg-white/4 border border-white/10 rounded-xl"
          aria-label="Today's spend"
        >
          <div className="flex items-start justify-between mb-3">
            <div>
              <h2 className="text-sm font-medium text-white/60">Today ({today.date})</h2>
              <p className="text-2xl font-semibold text-white mt-1">
                ${today.spentUsd.toFixed(2)}
                <span className="text-sm font-normal text-white/30 ml-2">
                  / ${today.capUsd.toFixed(2)} cap
                </span>
              </p>
            </div>
            {today.triggeredHalt && (
              <span className="px-3 py-1 bg-red-500/20 border border-red-500/30 text-red-400 text-xs rounded-full font-medium">
                Halt Triggered
              </span>
            )}
          </div>

          {/* Progress bar */}
          <div className="space-y-1">
            <div
              className="h-2.5 bg-white/8 rounded-full overflow-hidden"
              role="progressbar"
              aria-valuenow={Math.min(100, Math.round((today.spentUsd / today.capUsd) * 100))}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Daily spend: ${Math.round((today.spentUsd / today.capUsd) * 100)}% of cap`}
            >
              <div
                className={`h-full rounded-full transition-all ${
                  today.triggeredHalt
                    ? 'bg-red-500'
                    : today.spentUsd / today.capUsd > 0.8
                      ? 'bg-amber-500'
                      : 'bg-gradient-to-r from-indigo-500 to-purple-500'
                }`}
                style={{
                  width: `${Math.min(100, (today.spentUsd / today.capUsd) * 100)}%`,
                }}
              />
            </div>
            <div className="flex justify-between text-xs text-white/30">
              <span>${today.spentUsd.toFixed(2)} spent</span>
              <span>${(today.capUsd - today.spentUsd).toFixed(2)} remaining</span>
            </div>
          </div>
        </section>
      ) : (
        <section className="mb-6 p-5 bg-white/4 border border-white/10 rounded-xl">
          <p className="text-sm text-white/30">No spend data for today yet.</p>
        </section>
      )}

      {/* ── 7-day summary ─────────────────────────────────────────── */}
      <section className="mb-6 p-5 bg-white/4 border border-white/10 rounded-xl" aria-label="7-day summary">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-white/60">7-Day Total</h2>
          <p className="text-lg font-semibold text-white">${totalSpent.toFixed(2)}</p>
        </div>

        {/* SVG bar chart rendered by client component */}
        <SpendChart data={chronological} />
      </section>

      {/* ── Per-day breakdown ─────────────────────────────────────── */}
      {rows.length > 0 && (
        <section aria-label="Daily spend breakdown">
          <h2 className="text-sm font-medium text-white/60 mb-3">Daily Breakdown</h2>
          <div className="overflow-x-auto rounded-xl border border-white/8">
            <table className="w-full text-sm" aria-label="Daily spend table">
              <thead>
                <tr className="border-b border-white/8 bg-white/3">
                  <th className="text-left px-4 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">
                    Spent
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">
                    Cap
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">
                    Usage
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {rows.map((row) => {
                  const usage = row.capUsd > 0 ? (row.spentUsd / row.capUsd) * 100 : 0;
                  return (
                    <tr key={row.date} className="hover:bg-white/2 transition-colors">
                      <td className="px-4 py-3 text-white/70 font-mono text-xs">{row.date}</td>
                      <td className="px-4 py-3 text-right text-white font-medium">
                        ${row.spentUsd.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right text-white/40 text-xs">
                        ${row.capUsd.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={
                            usage > 90
                              ? 'text-red-400'
                              : usage > 70
                                ? 'text-amber-400'
                                : 'text-white/50'
                          }
                        >
                          {usage.toFixed(0)}%
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {row.triggeredHalt ? (
                          <span className="text-red-400 text-xs">Halted</span>
                        ) : (
                          <span className="text-white/30 text-xs">Normal</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
