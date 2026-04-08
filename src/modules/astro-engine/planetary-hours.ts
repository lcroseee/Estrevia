/**
 * Planetary hours calculation using Swiss Ephemeris rise/set times.
 *
 * Traditional Chaldean system: day and night are each divided into 12 unequal
 * hours, with the first hour of each day ruled by the planet of the weekday.
 * Planets cycle in Chaldean order: Saturn→Jupiter→Mars→Sun→Venus→Mercury→Moon.
 */

import * as sweph from 'sweph';
import { Planet } from '@/shared/types/astrology';
import type { PlanetaryHour } from '@/shared/types/astrology';
import { CHALDEAN_ORDER } from './constants';
import { dateToJulianDay, julianDayToDate } from './julian-day';

// SE_RISE flag: 1 = rise, 2 = set
const SE_RISE = 1;
const SE_SET = 2;

// SE_SUN body ID
const SE_SUN = 0;

// SE_BIT_DISC_CENTER: use center of disk (not upper limb)
// SE_BIT_NO_REFRACTION: disable atmospheric refraction for precision
// Using 0 for standard astronomical sunrise/sunset (matches traditional practice)
const RISE_TRANS_FLAGS = 0;

/**
 * Day-of-week rulers (0 = Sunday through 6 = Saturday).
 * These determine the first planetary hour ruler for each weekday.
 */
const WEEKDAY_RULERS: Planet[] = [
  Planet.Sun,     // Sunday
  Planet.Moon,    // Monday
  Planet.Mars,    // Tuesday
  Planet.Mercury, // Wednesday
  Planet.Jupiter, // Thursday
  Planet.Venus,   // Friday
  Planet.Saturn,  // Saturday
];

export interface PlanetaryHoursResult {
  hours: PlanetaryHour[];
  currentHour: PlanetaryHour | null;
  sunrise: string; // ISO 8601
  sunset: string;  // ISO 8601
}

/**
 * Calculate the Julian Day at UTC midnight on a given date.
 * Using midnight as anchor for rise_trans() ensures the search starts
 * at the beginning of the day, so rise_trans() finds the next event
 * (today's sunrise, today's sunset) rather than wrapping to yesterday.
 */
function julianDayAtMidnight(date: Date): number {
  const midnightDate = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    0, 0, 0, 0,
  ));
  return dateToJulianDay(midnightDate);
}

/**
 * Call sweph.rise_trans() and return the result JD, or null if no rise/set.
 *
 * geopos order: [longitude, latitude, altitude] — NOT [lat, lon].
 */
function getRiseTrans(
  jd: number,
  rsmi: number, // 1 = rise, 2 = set
  longitude: number,
  latitude: number,
): number | null {
  try {
    const result = sweph.rise_trans(
      jd,
      SE_SUN,
      '',                        // star name: empty for planets
      RISE_TRANS_FLAGS,
      rsmi,
      [longitude, latitude, 0], // geopos: [lon, lat, altitude]
      0,                         // atmospheric pressure (0 = default 1013.25 mbar)
      0,                         // temperature (0 = default 15°C)
    );
    // result.data is the JD of the event (scalar number, not array)
    if (result && typeof result.data === 'number' && result.data > 0) {
      return result.data;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Build 24 planetary hours given sunrise, sunset, and next sunrise JDs.
 *
 * @param sunriseJd  - JD of sunrise for the date
 * @param sunsetJd   - JD of sunset for the date
 * @param nextSunriseJd - JD of sunrise for the next day
 * @param dayRulerIndex - index into CHALDEAN_ORDER for the first day hour
 */
function buildHours(
  sunriseJd: number,
  sunsetJd: number,
  nextSunriseJd: number,
  dayRulerIndex: number,
): PlanetaryHour[] {
  const dayDurationJd = (sunsetJd - sunriseJd) / 12;
  const nightDurationJd = (nextSunriseJd - sunsetJd) / 12;

  const hours: PlanetaryHour[] = [];

  // 12 day hours (sunrise → sunset)
  for (let i = 0; i < 12; i++) {
    const startJd = sunriseJd + i * dayDurationJd;
    const endJd = startJd + dayDurationJd;
    const planetIndex = (dayRulerIndex + i) % 7;

    hours.push({
      planet: CHALDEAN_ORDER[planetIndex],
      startTime: julianDayToDate(startJd).toISOString(),
      endTime: julianDayToDate(endJd).toISOString(),
      isDay: true,
    });
  }

  // 12 night hours (sunset → next sunrise)
  // Night hours continue the planet sequence from where day hours left off
  const nightStartIndex = (dayRulerIndex + 12) % 7;
  for (let i = 0; i < 12; i++) {
    const startJd = sunsetJd + i * nightDurationJd;
    const endJd = startJd + nightDurationJd;
    const planetIndex = (nightStartIndex + i) % 7;

    hours.push({
      planet: CHALDEAN_ORDER[planetIndex],
      startTime: julianDayToDate(startJd).toISOString(),
      endTime: julianDayToDate(endJd).toISOString(),
      isDay: false,
    });
  }

  return hours;
}

/**
 * Build 24 equal 1-hour planetary hours for polar regions where
 * sunrise/sunset cannot be determined. Starts at midnight UTC.
 * All hours are marked isDay=true as a fallback convention.
 */
function buildPolarFallbackHours(date: Date, dayRulerIndex: number): PlanetaryHour[] {
  const midnight = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    0, 0, 0, 0,
  ));

  const hours: PlanetaryHour[] = [];

  for (let i = 0; i < 24; i++) {
    const startMs = midnight.getTime() + i * 60 * 60 * 1000;
    const endMs = startMs + 60 * 60 * 1000;
    const planetIndex = (dayRulerIndex + i) % 7;

    hours.push({
      planet: CHALDEAN_ORDER[planetIndex],
      startTime: new Date(startMs).toISOString(),
      endTime: new Date(endMs).toISOString(),
      isDay: true,
    });
  }

  return hours;
}

/**
 * Find which hour (if any) contains the current moment.
 */
function findCurrentHour(hours: PlanetaryHour[], now: Date): PlanetaryHour | null {
  const nowMs = now.getTime();
  return (
    hours.find(h => {
      const start = new Date(h.startTime).getTime();
      const end = new Date(h.endTime).getTime();
      return nowMs >= start && nowMs < end;
    }) ?? null
  );
}

/**
 * Calculate planetary hours for a given location and date.
 *
 * @param latitude  - geographic latitude (-90 to +90)
 * @param longitude - geographic longitude (-180 to +180)
 * @param date      - UTC date for which to calculate hours (time of day is ignored)
 * @param now       - current moment for `currentHour` determination (defaults to new Date())
 */
export function calculatePlanetaryHours(
  latitude: number,
  longitude: number,
  date: Date,
  now: Date = new Date(),
): PlanetaryHoursResult {
  // Determine day-of-week ruler.
  // Use UTC weekday since we're working in UTC throughout.
  const weekday = date.getUTCDay(); // 0 = Sunday, 6 = Saturday
  const dayRuler = WEEKDAY_RULERS[weekday];
  const dayRulerIndex = CHALDEAN_ORDER.indexOf(dayRuler);

  // JD at UTC midnight on the target date — anchor for rise_trans() searches.
  // Starting from midnight guarantees rise_trans finds today's sunrise (next event)
  // and today's sunset (next set event), not yesterday's.
  const jdMidnight = julianDayAtMidnight(date);

  // JD at UTC midnight on the next day (for next sunrise)
  const nextDay = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + 1,
    0, 0, 0, 0,
  ));
  const jdMidnightNextDay = julianDayAtMidnight(nextDay);

  // Calculate sunrise and sunset for the date
  const sunriseJd = getRiseTrans(jdMidnight, SE_RISE, longitude, latitude);
  const sunsetJd = getRiseTrans(jdMidnight, SE_SET, longitude, latitude);
  const nextSunriseJd = getRiseTrans(jdMidnightNextDay, SE_RISE, longitude, latitude);

  // Polar region fallback: if any of the three events is missing
  if (sunriseJd === null || sunsetJd === null || nextSunriseJd === null) {
    const hours = buildPolarFallbackHours(date, dayRulerIndex);

    // For polar fallback, provide approximate midnight-based sunrise/sunset
    const midnight = new Date(Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      0, 0, 0, 0,
    ));
    const noonISO = new Date(midnight.getTime() + 12 * 60 * 60 * 1000).toISOString();

    return {
      hours,
      currentHour: findCurrentHour(hours, now),
      sunrise: noonISO,
      sunset: noonISO,
    };
  }

  // Sanity check: sunset must be after sunrise, next sunrise after sunset
  if (sunsetJd <= sunriseJd || nextSunriseJd <= sunsetJd) {
    // Fallback: treat as polar
    const hours = buildPolarFallbackHours(date, dayRulerIndex);
    const noonDate = new Date(Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      12, 0, 0, 0,
    ));
    const noonISO = noonDate.toISOString();
    return {
      hours,
      currentHour: findCurrentHour(hours, now),
      sunrise: noonISO,
      sunset: noonISO,
    };
  }

  const hours = buildHours(sunriseJd, sunsetJd, nextSunriseJd, dayRulerIndex);
  const sunriseISO = julianDayToDate(sunriseJd).toISOString();
  const sunsetISO = julianDayToDate(sunsetJd).toISOString();

  return {
    hours,
    currentHour: findCurrentHour(hours, now),
    sunrise: sunriseISO,
    sunset: sunsetISO,
  };
}
