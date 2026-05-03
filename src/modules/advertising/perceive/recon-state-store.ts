/**
 * Reconciler suspend-state store (singleton-row pattern).
 *
 * The reconciler emits a `critical_drift` status when Meta clicks vs PostHog
 * landing_view counts diverge by >= 25%. When that fires, the agent must
 * stop acting on drifted data — but stay alive enough to apply emergency
 * (DISAPPROVED) pauses. This store persists that suspended/active state
 * across cron invocations.
 *
 * - One row, id='singleton'. Seeded by the migration; bootstrapped on read
 *   if the row is absent (defensive).
 * - 24-hour auto-resume by default; founder can override via the admin UI
 *   at `/admin/advertising/recon-state` (calls `resume()`).
 * - The `triage-daily` cron handler should call `checkAutoResume()` at the
 *   top of its run so the auto-resume happens at most once per day.
 *
 * No PII flows through this store — only counts, percentages, and reason
 * strings produced by the reconciler.
 */

import { getDb } from '@/shared/lib/db';
import { advertisingReconState } from '@/shared/lib/schema';
import { eq } from 'drizzle-orm';

export interface ReconState {
  suspended: boolean;
  suspendedAt: Date | null;
  suspendReason: string | null;
  autoResumeAt: Date | null;
  lastDriftPct: number | null;
}

/**
 * Read the singleton reconciler-state row. Bootstraps the row if missing
 * (the seed migration normally inserts it; this is a defensive fallback for
 * fresh local databases).
 */
export async function getReconState(): Promise<ReconState> {
  const db = getDb();
  const rows = await db
    .select()
    .from(advertisingReconState)
    .where(eq(advertisingReconState.id, 'singleton'))
    .limit(1);

  if (rows.length === 0) {
    await db
      .insert(advertisingReconState)
      .values({ id: 'singleton', suspended: false });
    return {
      suspended: false,
      suspendedAt: null,
      suspendReason: null,
      autoResumeAt: null,
      lastDriftPct: null,
    };
  }

  const r = rows[0];
  return {
    suspended: r.suspended,
    suspendedAt: r.suspendedAt,
    suspendReason: r.suspendReason,
    autoResumeAt: r.autoResumeAt,
    lastDriftPct: r.lastDriftPct,
  };
}

/**
 * Mark the agent as suspended. Reason is a free-form string (e.g.
 * `"critical_drift: meta=200, posthog=100, delta=100.0%"`); driftPct is the
 * raw delta_pct (0..1) emitted by the reconciler. autoResumeHours defaults
 * to 24h, which is the standard auto-resume window.
 */
export async function suspend(
  reason: string,
  driftPct: number,
  autoResumeHours = 24,
): Promise<void> {
  const db = getDb();
  const now = new Date();
  await db
    .update(advertisingReconState)
    .set({
      suspended: true,
      suspendedAt: now,
      suspendReason: reason,
      autoResumeAt: new Date(now.getTime() + autoResumeHours * 3600 * 1000),
      lastDriftPct: driftPct,
      updatedAt: now,
    })
    .where(eq(advertisingReconState.id, 'singleton'));
}

/**
 * Clear the suspended state. The `_reason` argument is reserved for future
 * audit-log integration (e.g. `'founder_manual_override'`,
 * `'auto_resume_24h_elapsed'`); it is not currently persisted but is
 * documented for clarity at the callsite.
 */
export async function resume(_reason: string): Promise<void> {
  const db = getDb();
  await db
    .update(advertisingReconState)
    .set({
      suspended: false,
      suspendedAt: null,
      suspendReason: null,
      autoResumeAt: null,
      updatedAt: new Date(),
    })
    .where(eq(advertisingReconState.id, 'singleton'));
}

/**
 * Auto-resume guard. Called at the top of cron handlers. If the agent is
 * suspended AND the autoResumeAt timestamp is in the past, calls
 * `resume('auto_resume_24h_elapsed')` and returns `{ resumed: true }`.
 * Otherwise returns `{ resumed: false }`.
 */
export async function checkAutoResume(): Promise<{
  resumed: boolean;
  reason?: string;
}> {
  const state = await getReconState();
  if (!state.suspended || !state.autoResumeAt) return { resumed: false };
  if (Date.now() < state.autoResumeAt.getTime()) return { resumed: false };
  await resume('auto_resume_24h_elapsed');
  return { resumed: true, reason: 'auto_resume_24h_elapsed' };
}
