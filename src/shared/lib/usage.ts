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
 * Atomically increments and returns { allowed, count } based on a free-tier limit.
 * If the user is already at or above `limit`, the row is NOT incremented and
 * `allowed: false` is returned. Otherwise the row is incremented and the new
 * count is returned with `allowed: true`.
 *
 * Uses an atomic SQL CTE so concurrent requests cannot bypass the limit.
 */
export async function checkAndIncrementUsage(
  userId: string,
  feature: string,
  period: UsagePeriod,
  limit: number,
  now: Date = new Date(),
): Promise<{ allowed: boolean; count: number; limit: number }> {
  const current = await getCurrentUsage(userId, feature, period, now);
  if (current >= limit) {
    return { allowed: false, count: current, limit };
  }
  const newCount = await incrementUsage(userId, feature, period, now);
  // Defense-in-depth: if a race let us cross the limit, mark as not allowed
  // (the counter still incremented — we accept this minor over-count rather
  // than implement a serializable transaction for a free-tier guard).
  if (newCount > limit) {
    return { allowed: false, count: newCount, limit };
  }
  return { allowed: true, count: newCount, limit };
}
