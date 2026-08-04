// src/shared/lib/portrait-guards.ts

/**
 * Cost and availability guards for Portrait generation.
 *
 * Portrait spends money per call and Pro is otherwise unlimited, so three
 * independent brakes exist: a monthly per-user quota (applied in the route via
 * checkAndIncrementUsage), this env kill switch, and this global daily cap.
 *
 * Client feature flags are unusable here: useFeatureFlag runs only in the
 * browser, behind cookie consent, and has no production call sites.
 */

export const DAILY_CAP_DEFAULT = 200;
const TTL_SECONDS = 60 * 60 * 48;

export interface BudgetRedis {
  get(key: string): Promise<unknown>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
}

/** Off unless explicitly enabled. A missing variable must never mean "on". */
export function isPortraitEnabled(): boolean {
  return process.env.AVATAR_PORTRAIT_ENABLED === 'true';
}

function dailyCap(): number {
  const raw = Number(process.env.AVATAR_PORTRAIT_DAILY_CAP);
  return Number.isFinite(raw) && raw > 0 ? raw : DAILY_CAP_DEFAULT;
}

export function dailyBudgetKey(now: Date = new Date()): string {
  return `portrait:budget:${now.toISOString().slice(0, 10)}`;
}

/**
 * Fails OPEN. If Redis is unreachable the per-user monthly quota and the rate
 * limiter still apply, so degrading to "allow" costs bounded money, whereas
 * degrading to "deny" breaks a paid feature for everyone during an outage.
 */
export async function checkDailyBudget(redis: BudgetRedis, now: Date = new Date()): Promise<boolean> {
  try {
    const raw = await redis.get(dailyBudgetKey(now));
    if (raw === null || raw === undefined) return true;
    const used = Number(raw);
    if (!Number.isFinite(used)) return true;
    return used < dailyCap();
  } catch {
    return true;
  }
}

/** Called only after a generation succeeds — rejected uploads cost nothing. */
export async function consumeDailyBudget(redis: BudgetRedis, now: Date = new Date()): Promise<void> {
  try {
    const key = dailyBudgetKey(now);
    await redis.incr(key);
    await redis.expire(key, TTL_SECONDS);
  } catch {
    // Never block a successful generation on budget bookkeeping.
  }
}
