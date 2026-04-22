import { sql, eq, and } from 'drizzle-orm';
import { getDb } from './db';
import { usageCounters } from './schema';

export type UsagePeriod = 'day' | 'month';

/**
 * Returns a calendar period key in UTC. Format:
 *   - 'day'   → 'YYYY-MM-DD'
 *   - 'month' → 'YYYY-MM'
 *
 * UTC is used to keep the boundary deterministic across server regions.
 */
export function computePeriodKey(period: UsagePeriod, now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  if (period === 'month') return `${y}-${m}`;
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Atomically increments a usage counter and returns the new count.
 * Creates the row on first use. Uses ON CONFLICT to avoid races.
 */
export async function incrementUsage(
  userId: string,
  feature: string,
  period: UsagePeriod,
  now: Date = new Date(),
): Promise<number> {
  const db = getDb();
  const periodKey = computePeriodKey(period, now);

  const rows = await db
    .insert(usageCounters)
    .values({ userId, feature, periodKey, count: 1 })
    .onConflictDoUpdate({
      target: [usageCounters.userId, usageCounters.feature, usageCounters.periodKey],
      set: {
        count: sql`${usageCounters.count} + 1`,
        updatedAt: sql`now()`,
      },
    })
    .returning({ count: usageCounters.count });

  return rows[0]?.count ?? 1;
}

/**
 * Returns the current usage count for the active period (0 if no row yet).
 */
export async function getCurrentUsage(
  userId: string,
  feature: string,
  period: UsagePeriod,
  now: Date = new Date(),
): Promise<number> {
  const db = getDb();
  const periodKey = computePeriodKey(period, now);
  const rows = await db
    .select({ count: usageCounters.count })
    .from(usageCounters)
    .where(
      and(
        eq(usageCounters.userId, userId),
        eq(usageCounters.feature, feature),
        eq(usageCounters.periodKey, periodKey),
      ),
    )
    .limit(1);
  return rows[0]?.count ?? 0;
}

/**
 * Atomically checks and increments a usage counter in a single SQL round-trip.
 *
 * Uses an INSERT … ON CONFLICT DO UPDATE … WHERE count < limit pattern so that
 * the UPDATE only fires when the current count is still below the limit.
 * If the WHERE clause prevents the update, Postgres returns 0 rows — we know
 * the limit is already reached without a prior SELECT. This eliminates the
 * TOCTOU race that existed in the previous two-step implementation.
 *
 * Concurrency guarantee: two simultaneous requests at count=0 with limit=1
 * will both attempt the INSERT. One will create the row (count=1), the other
 * will hit the ON CONFLICT path. Both will evaluate the WHERE clause against
 * the committed count at the time of UPDATE execution. Under Postgres row-level
 * locking the second UPDATE sees count=1, which is not < 1, so the WHERE
 * clause fails and no row is returned — only one request is allowed through.
 */
export async function checkAndIncrementUsage(
  userId: string,
  feature: string,
  period: UsagePeriod,
  limit: number,
  now: Date = new Date(),
): Promise<{ allowed: boolean; count: number; limit: number }> {
  const db = getDb();
  const periodKey = computePeriodKey(period, now);

  // Single atomic CTE: inserts on first use; on conflict increments only when
  // count < limit. If the WHERE clause blocks the update, RETURNING is empty.
  const rows = await db
    .insert(usageCounters)
    .values({ userId, feature, periodKey, count: 1 })
    .onConflictDoUpdate({
      target: [usageCounters.userId, usageCounters.feature, usageCounters.periodKey],
      set: {
        count: sql`${usageCounters.count} + 1`,
        updatedAt: sql`now()`,
      },
      // Only apply the update (and return a row) when under the limit.
      // Drizzle maps `setWhere` to the SQL `WHERE` clause on the DO UPDATE branch.
      setWhere: sql`${usageCounters.count} < ${limit}`,
    })
    .returning({ count: usageCounters.count });

  if (rows.length === 0) {
    // The update was blocked by setWhere — limit already reached. Fetch current
    // count for the response (read-only, no lock needed).
    const current = await getCurrentUsage(userId, feature, period, now);
    return { allowed: false, count: current, limit };
  }

  return { allowed: true, count: rows[0].count, limit };
}
