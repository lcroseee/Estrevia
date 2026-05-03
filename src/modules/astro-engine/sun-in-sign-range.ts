import { dateToJulianDay } from './julian-day';
import { calcPlanet } from './ephemeris';
import { getLahiriAyanamsa, tropicalToSidereal } from './sidereal';
import { SWEPH_BODY_IDS } from './constants';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Lowercase sidereal sign strings — used for URL slugs and API responses.
 * Intentionally distinct from the Sign enum (which uses PascalCase) so callers
 * can use the string directly in `href="/sidereal-aries-dates"` without mapping.
 */
export type SiderealSign =
  | 'aries' | 'taurus' | 'gemini' | 'cancer'
  | 'leo'   | 'virgo'  | 'libra'  | 'scorpio'
  | 'sagittarius' | 'capricorn' | 'aquarius' | 'pisces';

/** MVP: only Lahiri ayanamsa is supported (per CLAUDE.md). */
export type Ayanamsa = 'lahiri';

/** UTC date range during which the Sun is in a given sidereal sign. */
export interface SunInSignRange {
  sign: SiderealSign;
  start: Date;  // UTC moment when Sun enters the sign
  end: Date;    // UTC moment when Sun leaves (= next sign's start)
  year: number; // Calendar year in which `start` falls
  ayanamsa: Ayanamsa;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const SIGN_ORDER: SiderealSign[] = [
  'aries', 'taurus', 'gemini', 'cancer',
  'leo', 'virgo', 'libra', 'scorpio',
  'sagittarius', 'capricorn', 'aquarius', 'pisces',
];

/**
 * Compute sidereal Sun longitude (degrees, Lahiri) at the given UTC Date.
 * Algorithm:
 *   1. JD via sweph.utc_to_jd (ET Julian Day, consistent with existing chart.ts)
 *   2. Tropical longitude via calcPlanet with SEFLG_SPEED|SEFLG_MOSEPH
 *   3. Subtract Lahiri ayanamsa, normalize to [0, 360)
 */
function siderealSunLonAt(date: Date): number {
  const jd = dateToJulianDay(date);
  const tropical = calcPlanet(jd, SWEPH_BODY_IDS.SE_SUN).longitude;
  const ay = getLahiriAyanamsa(jd);
  return tropicalToSidereal(tropical, ay);
}

function signFromLon(lon: number): SiderealSign {
  return SIGN_ORDER[Math.floor(lon / 30)]!;
}

/**
 * Binary-search the UTC moment when the Sun crosses into `targetSign`.
 * Assumes `loMs` is before the crossing and `hiMs` is at or after it.
 * Returns a Date rounded to the nearest minute.
 */
function findIngress(targetSign: SiderealSign, loMs: number, hiMs: number): Date {
  while (hiMs - loMs > 60_000) {
    const midMs = (loMs + hiMs) / 2;
    if (signFromLon(siderealSunLonAt(new Date(midMs))) === targetSign) {
      hiMs = midMs;
    } else {
      loMs = midMs;
    }
  }
  // Round to nearest minute
  return new Date(Math.round(hiMs / 60_000) * 60_000);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the UTC date range during which the Sun is in the given sidereal sign
 * in the given year (Lahiri ayanamsa, Moshier analytical ephemeris).
 *
 * Algorithm:
 *   1. Scan day-by-day from (yearStart − 35 days) to (yearEnd + 35 days).
 *   2. Detect sign changes between consecutive days.
 *   3. Binary-search to ±1-minute precision when a change is detected.
 *   4. Find the ingress into `sign` whose UTC timestamp falls in `year`.
 *   5. Return that ingress as `start` and the following ingress as `end`.
 *
 * Note: Capricorn ingress falls in January of the stated year (~Jan 14).
 *       Sagittarius end extends into the following January — `end` may be in year+1.
 *
 * @param sign - Lowercase sidereal sign name (e.g. 'aries')
 * @param year - Calendar year (UTC) in which the ingress should fall
 * @param ayanamsa - Only 'lahiri' is supported in MVP
 * @throws If no ingress found (e.g. year too far from ephemeris range)
 */
export function getSunInSignRange(
  sign: SiderealSign,
  year: number,
  ayanamsa: Ayanamsa = 'lahiri',
): SunInSignRange {
  // Scan window: year - 35 days to year + 1 year + 35 days.
  // The extra buffer on both ends ensures we find Capricorn (early Jan) and
  // Sagittarius exit (early Jan of year+1).
  const scanStartMs = new Date(Date.UTC(year, 0, 1)).getTime() - 35 * 86_400_000;
  const scanEndMs   = new Date(Date.UTC(year + 1, 0, 1)).getTime() + 35 * 86_400_000;

  const transitions: Array<{ sign: SiderealSign; at: Date }> = [];
  let prevMs = scanStartMs;
  let prevSign = signFromLon(siderealSunLonAt(new Date(prevMs)));

  for (let ms = scanStartMs + 86_400_000; ms <= scanEndMs; ms += 86_400_000) {
    const curSign = signFromLon(siderealSunLonAt(new Date(ms)));
    if (curSign !== prevSign) {
      transitions.push({ sign: curSign, at: findIngress(curSign, prevMs, ms) });
      prevSign = curSign;
    }
    prevMs = ms;
  }

  // Find the ingress into `sign` whose timestamp falls in the requested year
  const entryIdx = transitions.findIndex(
    (t) => t.sign === sign && t.at.getUTCFullYear() === year,
  );
  if (entryIdx === -1) {
    throw new Error(
      `[getSunInSignRange] No ingress of sidereal ${sign} found in year ${year}. ` +
      `Transitions found: ${transitions.map((t) => `${t.sign}@${t.at.toISOString()}`).join(', ')}`,
    );
  }

  const exitTransition = transitions[entryIdx + 1];
  if (!exitTransition) {
    throw new Error(
      `[getSunInSignRange] No exit transition found after sidereal ${sign} ${year}. ` +
      'Scan window may be too narrow.',
    );
  }

  return {
    sign,
    start: transitions[entryIdx]!.at,
    end: exitTransition.at,
    year,
    ayanamsa,
  };
}

/**
 * Returns the sidereal sign the Sun is in on the given UTC date, plus the
 * full date range for that sign window.
 *
 * Handles cross-year sign windows (e.g., Sagittarius starting Dec and ending Jan):
 * if the sign window for `date.getUTCFullYear()` does not bracket the date,
 * falls back to the prior year's window.
 *
 * @param date - UTC date to check
 * @param ayanamsa - Only 'lahiri' supported in MVP
 */
export function getSunSignForDate(
  date: Date,
  ayanamsa: Ayanamsa = 'lahiri',
): { sign: SiderealSign; range: SunInSignRange } {
  const lon = siderealSunLonAt(date);
  const sign = signFromLon(lon);
  const dateMs = date.getTime();
  const year = date.getUTCFullYear();

  // Primary attempt: window starting in the same calendar year
  const primary = getSunInSignRange(sign, year, ayanamsa);
  if (primary.start.getTime() <= dateMs && primary.end.getTime() > dateMs) {
    return { sign, range: primary };
  }

  // Fallback: window starting in the prior year (handles dates in early Jan
  // that fall within the prior year's Sagittarius/Capricorn window)
  const prior = getSunInSignRange(sign, year - 1, ayanamsa);
  if (prior.start.getTime() <= dateMs && prior.end.getTime() > dateMs) {
    return { sign, range: prior };
  }

  // Should never reach here under normal astronomical conditions
  throw new Error(
    `[getSunSignForDate] Could not find containing window for sidereal ${sign} at ${date.toISOString()}`,
  );
}
