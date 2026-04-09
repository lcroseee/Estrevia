/**
 * Moon phase calculation using Swiss Ephemeris.
 *
 * Moon phase angle = (Moon longitude - Sun longitude) mod 360
 * Illumination    = (1 - cos(angle * PI / 180)) / 2 * 100
 * Next events     : iterate forward day by day, then binary-search to ±1 minute
 */

import * as sweph from 'sweph';
import { Sign } from '@/shared/types/astrology';
import { SEFLG_MOSEPH, SEFLG_SPEED } from './constants';
import { SIGN_NAMES } from './constants';
import { dateToJulianDay, julianDayToDate } from './julian-day';
import { getLahiriAyanamsa, tropicalToSidereal } from './sidereal';

// Swiss Ephemeris body IDs
const SE_SUN = 0;
const SE_MOON = 1;

const CALC_FLAGS = SEFLG_SPEED | SEFLG_MOSEPH;

export interface MoonPhaseData {
  /** Human-readable phase name */
  phase: string;
  /** Illumination percentage 0–100 */
  illumination: number;
  /** Sun–Moon angle in degrees (0–360) */
  angle: number;
  /** Unicode moon emoji matching the phase */
  emoji: string;
  /** UTC Date of the next new moon */
  nextNewMoon: Date;
  /** UTC Date of the next full moon */
  nextFullMoon: Date;
}

// ---------------------------------------------------------------------------
// Phase name / emoji lookup
// ---------------------------------------------------------------------------

interface PhaseInfo {
  name: string;
  emoji: string;
}

function phaseInfoFromAngle(angle: number): PhaseInfo {
  if (angle < 22.5 || angle >= 337.5) {
    return { name: 'New Moon', emoji: '🌑' };
  }
  if (angle < 67.5) {
    return { name: 'Waxing Crescent', emoji: '🌒' };
  }
  if (angle < 112.5) {
    return { name: 'First Quarter', emoji: '🌓' };
  }
  if (angle < 157.5) {
    return { name: 'Waxing Gibbous', emoji: '🌔' };
  }
  if (angle < 202.5) {
    return { name: 'Full Moon', emoji: '🌕' };
  }
  if (angle < 247.5) {
    return { name: 'Waning Gibbous', emoji: '🌖' };
  }
  if (angle < 292.5) {
    return { name: 'Last Quarter', emoji: '🌗' };
  }
  return { name: 'Waning Crescent', emoji: '🌘' };
}

// ---------------------------------------------------------------------------
// Low-level helpers
// ---------------------------------------------------------------------------

/**
 * Get tropical longitude of the Sun and Moon for a given Julian Day.
 * Uses Moshier analytical ephemeris (SEFLG_MOSEPH) — no .se1 files needed.
 */
function getSunMoonLongitudes(jd: number): { sunLon: number; moonLon: number } {
  const sunResult = sweph.calc_ut(jd, SE_SUN, CALC_FLAGS);
  if (sunResult.flag < 0) {
    throw new Error(`sweph.calc_ut Sun failed: ${sunResult.error ?? 'unknown'}`);
  }

  const moonResult = sweph.calc_ut(jd, SE_MOON, CALC_FLAGS);
  if (moonResult.flag < 0) {
    throw new Error(`sweph.calc_ut Moon failed: ${moonResult.error ?? 'unknown'}`);
  }

  return {
    sunLon: sunResult.data[0] ?? 0,
    moonLon: moonResult.data[0] ?? 0,
  };
}

/**
 * Calculate Sun–Moon elongation angle for a Julian Day.
 * Returns value in [0, 360).
 */
function getMoonAngle(jd: number): number {
  const { sunLon, moonLon } = getSunMoonLongitudes(jd);
  return ((moonLon - sunLon) % 360 + 360) % 360;
}

// ---------------------------------------------------------------------------
// Next event search
// ---------------------------------------------------------------------------

/**
 * Find the next time the Moon angle crosses a target angle (0 = new, 180 = full).
 *
 * The Moon–Sun angle increases monotonically from 0° to 360° over ~29.5 days.
 * We detect a crossing when the angle passes the target from below, meaning:
 *   - prev angle < target && next angle >= target  (straightforward crossing)
 *   - or the angle wraps through 360°/0° while target is near 0°
 *
 * Strategy:
 *   1. Scan forward in 12-hour steps.
 *   2. Detect crossing: either (prev < target <= next) or wrap-around for target=0.
 *   3. Binary-search within that 12-hour window to ±1 minute.
 *
 * Returns the exact Julian Day of the event.
 */
function findNextMoonEvent(startJd: number, targetAngle: number): number {
  const STEP_JD = 0.5; // 12 hours — Moon moves ~6° in 12h, guarantees we catch every event
  const MAX_DAYS = 32;  // full lunar cycle is ~29.5 days

  let jd = startJd;
  let prevAngle = getMoonAngle(jd);

  for (let i = 0; i < MAX_DAYS * 2; i++) {
    const nextJd = jd + STEP_JD;
    const nextAngle = getMoonAngle(nextJd);

    let crossed = false;

    if (targetAngle === 0) {
      // Special case: detect wrap-around through 0°/360°
      // The angle decreases from ~350° back to ~0°, but since Moon moves forward,
      // this happens when prevAngle > 300 and nextAngle < 60
      crossed = prevAngle > 300 && nextAngle < 60;
    } else {
      // Normal crossing: angle passes target from below
      // Handle wrap-around for other targets (e.g., target=180 is straightforward)
      crossed = prevAngle < targetAngle && nextAngle >= targetAngle;
    }

    if (crossed) {
      // Binary search within [jd, nextJd] to ±1 minute (1/1440 day)
      let lo = jd;
      let hi = nextJd;

      while (hi - lo > 1.0 / 1440.0) {
        const mid = (lo + hi) / 2;
        const midAngle = getMoonAngle(mid);

        if (targetAngle === 0) {
          // For new moon: we want the wrap-around point
          // midAngle > 180 means we haven't crossed yet (still approaching 360°)
          if (midAngle > 180) {
            lo = mid;
          } else {
            hi = mid;
          }
        } else {
          if (midAngle < targetAngle) {
            lo = mid;
          } else {
            hi = mid;
          }
        }
      }

      return (lo + hi) / 2;
    }

    jd = nextJd;
    prevAngle = nextAngle;
  }

  // Fallback: return rough estimate 30 days later (should not happen in practice)
  return startJd + 30;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Calculate the Moon phase and the next new/full moon for a given UTC date.
 *
 * Note: sweph.set_sid_mode() is called in ephemeris.ts at module load.
 * Moon phase uses tropical longitudes (no ayanamsa needed — it's a relative angle).
 */
// ---------------------------------------------------------------------------
// Moon sign calculation (C1)
// ---------------------------------------------------------------------------

export interface MoonSignData {
  /** Sidereal zodiac sign name */
  siderealSign: Sign;
  /** Tropical zodiac sign name */
  tropicalSign: Sign;
  /** Sidereal absolute longitude (0-360) */
  siderealDegree: number;
  /** Tropical absolute longitude (0-360) */
  tropicalDegree: number;
}

/**
 * Calculate Moon's zodiac position at a given Julian Day.
 * Returns both sidereal (Lahiri) and tropical positions.
 */
export function getMoonSign(jd: number): MoonSignData {
  const moonResult = sweph.calc_ut(jd, SE_MOON, CALC_FLAGS);
  if (moonResult.flag < 0) {
    throw new Error(`sweph.calc_ut Moon failed: ${moonResult.error ?? 'unknown'}`);
  }

  const tropicalDegree = moonResult.data[0] ?? 0;
  const ayanamsa = getLahiriAyanamsa(jd);
  const siderealDegree = tropicalToSidereal(tropicalDegree, ayanamsa);

  const tropicalSignIndex = Math.floor(((tropicalDegree % 360) + 360) % 360 / 30);
  const siderealSignIndex = Math.floor(((siderealDegree % 360) + 360) % 360 / 30);

  return {
    siderealSign: SIGN_NAMES[siderealSignIndex]!,
    tropicalSign: SIGN_NAMES[tropicalSignIndex]!,
    siderealDegree,
    tropicalDegree,
  };
}

/**
 * Get the sidereal sign index (0-11) of the Moon at a given JD.
 * Helper for binary search of sign boundaries.
 */
function getMoonSiderealSignIndex(jd: number): number {
  const moonResult = sweph.calc_ut(jd, SE_MOON, CALC_FLAGS);
  if (moonResult.flag < 0) {
    throw new Error(`sweph.calc_ut Moon failed: ${moonResult.error ?? 'unknown'}`);
  }
  const tropicalDegree = moonResult.data[0] ?? 0;
  const ayanamsa = getLahiriAyanamsa(jd);
  const siderealDegree = tropicalToSidereal(tropicalDegree, ayanamsa);
  return Math.floor(((siderealDegree % 360) + 360) % 360 / 30);
}

export interface MoonTransitData {
  /** UTC time when Moon entered the current sign */
  signEntryTime: Date;
  /** UTC time when Moon exits the current sign */
  signExitTime: Date;
  /** Current sidereal sign */
  currentSign: Sign;
}

/**
 * Find when the Moon enters and exits its current sidereal sign.
 *
 * Uses binary search similar to findNextMoonEvent:
 * 1. Scan backward in 2-hour steps to find sign entry.
 * 2. Scan forward in 2-hour steps to find sign exit.
 * 3. Binary-search each boundary to ~1 minute precision.
 *
 * The Moon transits a sign in ~2.3 days, so 2-hour steps are safe.
 */
export function getMoonTransitTimes(jd: number): MoonTransitData {
  const currentSignIndex = getMoonSiderealSignIndex(jd);
  const currentSign = SIGN_NAMES[currentSignIndex]!;

  // --- Find sign entry (scan backward) ---
  const STEP = 2 / 24; // 2 hours in JD
  const MAX_STEPS = 72; // ~6 days back, more than enough for one sign transit

  let entryJd = jd;
  // Scan backward until sign changes
  for (let i = 0; i < MAX_STEPS; i++) {
    const prevJd = entryJd - STEP;
    const prevSignIndex = getMoonSiderealSignIndex(prevJd);
    if (prevSignIndex !== currentSignIndex) {
      // Sign changed between prevJd and entryJd — binary search
      let lo = prevJd;
      let hi = entryJd;
      while (hi - lo > 1.0 / 1440.0) { // ~1 minute precision
        const mid = (lo + hi) / 2;
        if (getMoonSiderealSignIndex(mid) !== currentSignIndex) {
          lo = mid;
        } else {
          hi = mid;
        }
      }
      entryJd = hi; // first moment in current sign
      break;
    }
    entryJd = prevJd;
  }

  // --- Find sign exit (scan forward) ---
  let exitJd = jd;
  for (let i = 0; i < MAX_STEPS; i++) {
    const nextJd = exitJd + STEP;
    const nextSignIndex = getMoonSiderealSignIndex(nextJd);
    if (nextSignIndex !== currentSignIndex) {
      // Sign changed between exitJd and nextJd — binary search
      let lo = exitJd;
      let hi = nextJd;
      while (hi - lo > 1.0 / 1440.0) {
        const mid = (lo + hi) / 2;
        if (getMoonSiderealSignIndex(mid) === currentSignIndex) {
          lo = mid;
        } else {
          hi = mid;
        }
      }
      exitJd = hi; // first moment in next sign
      break;
    }
    exitJd = nextJd;
  }

  return {
    signEntryTime: julianDayToDate(entryJd),
    signExitTime: julianDayToDate(exitJd),
    currentSign,
  };
}

// ---------------------------------------------------------------------------
// Moon rise/set calculation (C3)
// ---------------------------------------------------------------------------

export interface MoonRiseSetData {
  /** UTC time of moonrise, or null if Moon doesn't rise (polar regions) */
  moonrise: Date | null;
  /** UTC time of moonset, or null if Moon doesn't set (polar regions) */
  moonset: Date | null;
}

// SE_RISE / SE_SET flags for rise_trans
const RS_RISE = 1;
const RS_SET = 2;

/**
 * Calculate Moon rise and set times for a given Julian Day and location.
 * Uses sweph.rise_trans() — same approach as sunrise/sunset in planetary-hours.ts.
 *
 * @param jd - Julian Day at UTC midnight of the target date
 * @param latitude - geographic latitude (-90 to +90)
 * @param longitude - geographic longitude (-180 to +180)
 */
export function getMoonRiseSet(
  jd: number,
  latitude: number,
  longitude: number,
): MoonRiseSetData {
  const moonrise = getMoonRiseTransResult(jd, RS_RISE, longitude, latitude);
  const moonset = getMoonRiseTransResult(jd, RS_SET, longitude, latitude);

  return {
    moonrise: moonrise !== null ? julianDayToDate(moonrise) : null,
    moonset: moonset !== null ? julianDayToDate(moonset) : null,
  };
}

/**
 * Call sweph.rise_trans() for the Moon and return the result JD, or null.
 * geopos order: [longitude, latitude, altitude] — same convention as planetary-hours.ts.
 */
function getMoonRiseTransResult(
  jd: number,
  rsmi: number,
  longitude: number,
  latitude: number,
): number | null {
  try {
    const result = sweph.rise_trans(
      jd,
      SE_MOON,
      '',           // star name: empty for planets
      0,            // rise_trans flags (standard astronomical)
      rsmi,
      [longitude, latitude, 0], // geopos: [lon, lat, altitude]
      0,            // atmospheric pressure (default)
      0,            // temperature (default)
    );
    if (result && typeof result.data === 'number' && result.data > 0) {
      return result.data;
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API — Moon phase
// ---------------------------------------------------------------------------

export function getCurrentMoonPhase(date: Date): MoonPhaseData {
  const jd = dateToJulianDay(date);
  const angle = getMoonAngle(jd);

  const illumination = ((1 - Math.cos((angle * Math.PI) / 180)) / 2) * 100;
  const { name: phase, emoji } = phaseInfoFromAngle(angle);

  // Search for next events starting 1 minute after the input date
  // to avoid returning the current moment as "next" if we're exactly on a phase
  const searchStartJd = jd + 1.0 / 1440.0;

  const nextNewMoonJd = findNextMoonEvent(searchStartJd, 0);
  const nextFullMoonJd = findNextMoonEvent(searchStartJd, 180);

  return {
    phase,
    illumination: Math.round(illumination * 10) / 10,
    angle: Math.round(angle * 100) / 100,
    emoji,
    nextNewMoon: julianDayToDate(nextNewMoonJd),
    nextFullMoon: julianDayToDate(nextFullMoonJd),
  };
}
