import * as sweph from 'sweph';

/**
 * Convert a UTC Date to Julian Day number (Ephemeris Time / Terrestrial Time).
 * Uses sweph.utc_to_jd() for astronomical precision.
 * Returns data[1] — ET Julian Day, suitable for sweph.calc_ut() and sweph.houses().
 */
export function dateToJulianDay(date: Date): number {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const hour = date.getUTCHours();
  const minute = date.getUTCMinutes();
  const second = date.getUTCSeconds();

  const result = sweph.utc_to_jd(year, month, day, hour, minute, second, 1); // 1 = Gregorian calendar
  return result.data[1]; // ET Julian Day
}

/**
 * Convert a Julian Day number (UT) back to a UTC Date.
 * Uses sweph.jdut1_to_utc() for the reverse transformation.
 * Note: pass the UT Julian Day (data[0] from utc_to_jd), not the ET value.
 */
export function julianDayToDate(jd: number): Date {
  const r = sweph.jdut1_to_utc(jd, 1); // 1 = Gregorian calendar
  // sweph returns { year, month, day, hour, minute, second } as separate integer fields
  return new Date(Date.UTC(r.year, r.month - 1, r.day, r.hour, r.minute, Math.round(r.second)));
}
