/**
 * Void-of-Course month cache backed by Upstash Redis.
 *
 * Key schema: voc:YYYY-MM
 * TTL: 25 hours (slightly longer than 24h to tolerate skewed cron timing)
 *
 * Pre-warm strategy:
 *   A Vercel Cron job (`/api/cron/prewarm-voc`) runs daily and computes the
 *   current month + tomorrow's data, storing results in Redis. The API route
 *   reads from cache first; on a miss it computes synchronously only for
 *   "current-ish" dates (within 7 days of today). Requests for future months
 *   return 503 "computing" if the cache is cold — this prevents cold-start
 *   timeout on Vercel Functions (~132 000 sweph calls per month).
 */

import { redis } from '@/shared/lib/redis';
import { calculateVoidOfCourse } from './void-of-course';
import { getMoonSign } from './moon-phase';
import { dateToJulianDay } from './julian-day';
import type { VocPeriod } from '@/shared/types';

/** Redis TTL for a cached VOC month (25 hours in seconds) */
const VOC_CACHE_TTL_SECONDS = 25 * 60 * 60;

/** Threshold in days: if requested month is within this many days of today,
 *  compute synchronously on cache miss rather than returning 503. */
const SYNC_COMPUTE_THRESHOLD_DAYS = 7;

function cacheKey(year: number, month: number): string {
  const mm = String(month).padStart(2, '0');
  return `voc:${year}-${mm}`;
}

/**
 * Read cached VOC periods for a year/month from Redis.
 * Returns null on cache miss.
 */
export async function readVocCache(
  year: number,
  month: number,
): Promise<VocPeriod[] | null> {
  const key = cacheKey(year, month);
  const cached = await redis.get<VocPeriod[]>(key);
  return cached ?? null;
}

/**
 * Write VOC periods for a year/month to Redis with 25h TTL.
 */
export async function writeVocCache(
  year: number,
  month: number,
  periods: VocPeriod[],
): Promise<void> {
  const key = cacheKey(year, month);
  await redis.set(key, periods, { ex: VOC_CACHE_TTL_SECONDS });
}

/**
 * Compute VOC periods for an entire month by stepping through in 12-hour
 * increments and collecting unique VOC windows.
 *
 * This is the expensive operation (~132 000 sweph calls for a 30-day month).
 * It runs in cron pre-warm jobs and occasionally synchronously on cache miss
 * for near-present dates.
 */
export function computeVocMonth(year: number, month: number): VocPeriod[] {
  const monthStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59));

  const monthStartJd = dateToJulianDay(monthStart);
  const monthEndJd = dateToJulianDay(monthEnd);

  const periods: VocPeriod[] = [];
  const seen = new Set<string>();

  const STEP = 0.5; // 12 hours in JD
  let jd = monthStartJd;

  while (jd <= monthEndJd) {
    const vocData = calculateVoidOfCourse(jd);

    if (vocData.vocStart && vocData.vocEnd) {
      const key = vocData.vocStart.toISOString();

      const vocStartJd = dateToJulianDay(vocData.vocStart);
      const vocEndJd = dateToJulianDay(vocData.vocEnd);
      const overlapsMonth = vocEndJd >= monthStartJd && vocStartJd <= monthEndJd;

      if (overlapsMonth && !seen.has(key)) {
        seen.add(key);

        const fromSignData = getMoonSign(dateToJulianDay(vocData.vocStart));
        const toSignData = getMoonSign(dateToJulianDay(vocData.vocEnd));

        periods.push({
          start: vocData.vocStart.toISOString(),
          end: vocData.vocEnd.toISOString(),
          lastAspect: vocData.lastAspect,
          fromSign: fromSignData.siderealSign,
          toSign: toSignData.siderealSign,
        });
      }
    }

    jd += STEP;
  }

  periods.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  return periods;
}

/**
 * Returns true if the requested year/month is within SYNC_COMPUTE_THRESHOLD_DAYS
 * of the current date. Used to decide whether to compute synchronously on miss.
 */
export function isNearPresentMonth(year: number, month: number): boolean {
  const now = new Date();
  const requestedMonthStart = new Date(Date.UTC(year, month - 1, 1));
  const requestedMonthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59));

  const thresholdMs = SYNC_COMPUTE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;

  // Allow sync compute if the month overlaps with or is close to today's window
  const lower = new Date(now.getTime() - thresholdMs);
  const upper = new Date(now.getTime() + thresholdMs);

  return requestedMonthEnd >= lower && requestedMonthStart <= upper;
}
