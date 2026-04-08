import { getTimezoneOffset } from 'date-fns-tz';

/**
 * Given an IANA timezone and a Date, returns the UTC offset in minutes.
 * Positive = ahead of UTC (e.g. Europe/Moscow returns +180).
 * Handles historical timezone changes (e.g., Russia 2011/2014 permanent DST shifts).
 *
 * Uses date-fns-tz which reads the system's tz database — accurate for any date.
 */
export function getUtcOffset(timezone: string, date: Date): number {
  // date-fns-tz getTimezoneOffset returns milliseconds with UTC+ sign convention:
  // UTC+3 → +10800000 ms → +180 minutes
  // UTC-5 → -18000000 ms → -300 minutes
  const offsetMs = getTimezoneOffset(timezone, date);
  return offsetMs / 60_000;
}
