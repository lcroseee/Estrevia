/**
 * Void-of-Course Moon calculation.
 *
 * VOC = Moon makes no exact major aspects to any planet before leaving
 * its current sidereal sign. The VOC period runs from the last exact
 * aspect the Moon made (while in the current sign) until the Moon
 * enters the next sign.
 */

import * as sweph from 'sweph';
import { Planet } from '@/shared/types/astrology';
import { SEFLG_MOSEPH, SEFLG_SPEED, PLANET_TO_SWEPH_ID } from './constants';
import { getLahiriAyanamsa, tropicalToSidereal } from './sidereal';
import { getMoonTransitTimes } from './moon-phase';
import { dateToJulianDay, julianDayToDate } from './julian-day';

const SE_MOON = 1;
const CALC_FLAGS = SEFLG_SPEED | SEFLG_MOSEPH;

/**
 * Planets that the Moon can aspect (Sun through Pluto).
 * Excludes North Node and Chiron for traditional VOC calculation.
 */
const ASPECT_PLANETS: { planet: Planet; bodyId: number }[] = [
  { planet: Planet.Sun, bodyId: PLANET_TO_SWEPH_ID[Planet.Sun] },
  { planet: Planet.Mercury, bodyId: PLANET_TO_SWEPH_ID[Planet.Mercury] },
  { planet: Planet.Venus, bodyId: PLANET_TO_SWEPH_ID[Planet.Venus] },
  { planet: Planet.Mars, bodyId: PLANET_TO_SWEPH_ID[Planet.Mars] },
  { planet: Planet.Jupiter, bodyId: PLANET_TO_SWEPH_ID[Planet.Jupiter] },
  { planet: Planet.Saturn, bodyId: PLANET_TO_SWEPH_ID[Planet.Saturn] },
  { planet: Planet.Uranus, bodyId: PLANET_TO_SWEPH_ID[Planet.Uranus] },
  { planet: Planet.Neptune, bodyId: PLANET_TO_SWEPH_ID[Planet.Neptune] },
  { planet: Planet.Pluto, bodyId: PLANET_TO_SWEPH_ID[Planet.Pluto] },
];

/** Major aspects used for VOC determination */
const VOC_ASPECTS = [
  { name: 'conjunction', angle: 0, orb: 8 },
  { name: 'sextile', angle: 60, orb: 4 },
  { name: 'square', angle: 90, orb: 6 },
  { name: 'trine', angle: 120, orb: 6 },
  { name: 'opposition', angle: 180, orb: 8 },
] as const;

export interface VoidOfCourseData {
  isVoidOfCourse: boolean;
  /** UTC time when VOC period starts (time of last exact aspect) */
  vocStart: Date | null;
  /** UTC time when VOC period ends (Moon enters next sign) */
  vocEnd: Date | null;
  /** The last aspect the Moon made before going VOC */
  lastAspect: { planet: string; aspect: string } | null;
}

/**
 * Angular separation between two ecliptic longitudes.
 * Returns value in [0, 180] — shortest arc.
 */
function angularSeparation(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/**
 * Get sidereal Moon longitude at a given JD.
 */
function getMoonSiderealLon(jd: number): number {
  const result = sweph.calc_ut(jd, SE_MOON, CALC_FLAGS);
  if (result.flag < 0) {
    throw new Error(`sweph.calc_ut Moon failed: ${result.error ?? 'unknown'}`);
  }
  const tropicalLon = result.data[0] ?? 0;
  const ayanamsa = getLahiriAyanamsa(jd);
  return tropicalToSidereal(tropicalLon, ayanamsa);
}

/**
 * Get sidereal longitude of a planet at a given JD.
 */
function getPlanetSiderealLon(jd: number, bodyId: number): number {
  const result = sweph.calc_ut(jd, bodyId, CALC_FLAGS);
  if (result.flag < 0) {
    throw new Error(`sweph.calc_ut failed for body ${bodyId}: ${result.error ?? 'unknown'}`);
  }
  const tropicalLon = result.data[0] ?? 0;
  const ayanamsa = getLahiriAyanamsa(jd);
  return tropicalToSidereal(tropicalLon, ayanamsa);
}

/**
 * Check if the Moon forms an exact major aspect to any planet at a given JD.
 * "Exact" here means within 1° applying orb (aspect is perfecting, not separating).
 *
 * Returns the tightest aspect found, or null.
 */
function findExactAspectAtJd(jd: number): { planet: string; aspect: string; orb: number } | null {
  const moonLon = getMoonSiderealLon(jd);
  let tightest: { planet: string; aspect: string; orb: number } | null = null;

  for (const { planet, bodyId } of ASPECT_PLANETS) {
    const planetLon = getPlanetSiderealLon(jd, bodyId);
    const sep = angularSeparation(moonLon, planetLon);

    for (const aspect of VOC_ASPECTS) {
      const orb = Math.abs(sep - aspect.angle);
      if (orb <= 1.0) {
        // Within 1° of exact — qualifies as an exact aspect
        if (tightest === null || orb < tightest.orb) {
          tightest = { planet: planet as string, aspect: aspect.name, orb };
        }
      }
    }
  }

  return tightest;
}

/**
 * Calculate the Void-of-Course status of the Moon at a given Julian Day.
 *
 * Algorithm:
 * 1. Find when Moon exits current sign (via getMoonTransitTimes).
 * 2. Step forward from current JD to sign exit in 15-minute increments.
 * 3. At each step, check if Moon forms any exact aspect (within 1°) to any planet.
 * 4. Track the LAST such aspect found.
 * 5. VOC period = from last exact aspect to sign exit.
 * 6. If the current JD is after the last exact aspect, we are in VOC.
 *
 * Also scans backward from the current JD to find the last aspect if none
 * is found going forward (i.e., Moon is already VOC).
 */
export function calculateVoidOfCourse(jd: number): VoidOfCourseData {
  const transit = getMoonTransitTimes(jd);
  const signExitJd = dateToJulianDay(transit.signExitTime);
  const signEntryJd = dateToJulianDay(transit.signEntryTime);

  const STEP = 15 / (24 * 60); // 15 minutes in JD

  // Scan from sign entry to sign exit, collecting all exact aspects
  let lastAspectJd: number | null = null;
  let lastAspectInfo: { planet: string; aspect: string } | null = null;

  let scanJd = signEntryJd;
  while (scanJd < signExitJd) {
    const found = findExactAspectAtJd(scanJd);
    if (found) {
      lastAspectJd = scanJd;
      lastAspectInfo = { planet: found.planet, aspect: found.aspect };
    }
    scanJd += STEP;
  }

  // If no aspects found in entire sign transit, Moon is VOC for the whole sign
  if (lastAspectJd === null) {
    return {
      isVoidOfCourse: true,
      vocStart: transit.signEntryTime,
      vocEnd: transit.signExitTime,
      lastAspect: null,
    };
  }

  // VOC period starts after the last exact aspect
  const isVoc = jd > lastAspectJd;

  return {
    isVoidOfCourse: isVoc,
    vocStart: julianDayToDate(lastAspectJd),
    vocEnd: transit.signExitTime,
    lastAspect: lastAspectInfo,
  };
}

