// Must be imported first — sets ephemeris file path for asteroid bodies (Chiron)
import './ephe-path';

import {
  ChartResult,
  HouseSystem,
  Planet,
  PlanetPosition,
} from '@/shared/types/astrology';
import { dateToJulianDay } from './julian-day';
import { getUtcOffset } from './timezone';
import { calcPlanet } from './ephemeris';
import { getLahiriAyanamsa, tropicalToSidereal } from './sidereal';
import { absoluteToSignPosition } from './signs';
import { calculateHouses } from './houses';
import { calculateAspects } from './aspects';
import { getPlanetHouse } from './planet-in-house';
import { PLANET_TO_SWEPH_ID } from './constants';

export interface ChartInput {
  date: string;        // YYYY-MM-DD
  time: string | null; // HH:mm or null (unknown birth time)
  latitude: number;
  longitude: number;
  timezone: string;    // IANA timezone identifier
  houseSystem: HouseSystem;
}

/**
 * Ordered list of 12 celestial bodies for the natal chart.
 * Matches the Planet enum values used throughout the app.
 */
const CHART_PLANETS: Planet[] = [
  Planet.Sun,
  Planet.Moon,
  Planet.Mercury,
  Planet.Venus,
  Planet.Mars,
  Planet.Jupiter,
  Planet.Saturn,
  Planet.Uranus,
  Planet.Neptune,
  Planet.Pluto,
  Planet.NorthNode,
  Planet.Chiron,
];

/**
 * Build a PlanetPosition from an absolute sidereal degree.
 * house is set to null here — filled in separately after house calculation.
 */
function buildPlanetPosition(
  planet: Planet,
  tropicalDegree: number,
  absoluteDegree: number,
  speed: number,
): PlanetPosition {
  const pos = absoluteToSignPosition(absoluteDegree);
  return {
    planet,
    absoluteDegree,
    tropicalDegree,
    sign: pos.sign,
    signDegree: pos.signDegree,
    minutes: pos.minutes,
    seconds: pos.seconds,
    isRetrograde: speed < 0,
    speed,
    house: null,
  };
}

/**
 * Build a PlanetPosition representing the Ascendant or Midheaven.
 * These are angles, not true bodies — speed=0, retrograde=false.
 */
function buildAnglePosition(
  planet: Planet,
  tropicalDegree: number,
  ayanamsa: number,
): PlanetPosition {
  const absoluteDegree = tropicalToSidereal(tropicalDegree, ayanamsa);
  const pos = absoluteToSignPosition(absoluteDegree);
  return {
    planet,
    absoluteDegree,
    tropicalDegree,
    sign: pos.sign,
    signDegree: pos.signDegree,
    minutes: pos.minutes,
    seconds: pos.seconds,
    isRetrograde: false,
    speed: 0,
    house: null,
  };
}

/**
 * Main natal chart calculation function.
 *
 * Step 1: Parse date/time. If no time → noon local time.
 * Step 2: Convert local datetime to UTC via timezone offset.
 * Step 3: Convert UTC to Julian Day.
 * Step 4: Calculate 12 body positions (tropical) via calcPlanet().
 * Step 5: Get Lahiri ayanamsa → compute sidereal positions.
 * Step 6: Calculate houses if birth time known. Polar fallback. Assign planets.
 * Step 7: Calculate aspects using sidereal positions.
 *
 * absoluteDegree = sidereal (what the user sees).
 * tropicalDegree = tropical (kept for sidereal/tropical toggle feature).
 */
export function calculateChart(input: ChartInput): ChartResult {
  const { date, time, latitude, longitude, timezone, houseSystem } = input;

  // Step 1: Parse date components
  const [yearStr, monthStr, dayStr] = date.split('-');
  const year = parseInt(yearStr!, 10);
  const month = parseInt(monthStr!, 10);
  const day = parseInt(dayStr!, 10);

  // Determine local time: use provided time or default to 12:00 noon
  const hasBirthTime = time !== null && time.trim().length > 0;
  const localTimeStr = hasBirthTime ? time! : '12:00';
  const [hourStr, minuteStr] = localTimeStr.split(':');
  const localHour = parseInt(hourStr!, 10);
  const localMinute = parseInt(minuteStr!, 10);

  // Step 2: Convert local datetime to UTC
  // First create a Date in local calendar terms (we'll apply offset manually)
  const localDateApprox = new Date(
    Date.UTC(year, month - 1, day, localHour, localMinute, 0),
  );

  const offsetMinutes = getUtcOffset(timezone, localDateApprox);
  const utcMs = localDateApprox.getTime() - offsetMinutes * 60_000;
  const utcDate = new Date(utcMs);

  // Step 3: Convert UTC Date to Julian Day
  const julianDay = dateToJulianDay(utcDate);

  // Step 4 + 5: Calculate positions for all 12 bodies and apply ayanamsa
  const ayanamsa = getLahiriAyanamsa(julianDay);

  const planetPositions: PlanetPosition[] = CHART_PLANETS.map((planet) => {
    const bodyId = PLANET_TO_SWEPH_ID[planet];
    const data = calcPlanet(julianDay, bodyId);

    const tropicalDegree = data.longitude;
    const absoluteDegree = tropicalToSidereal(tropicalDegree, ayanamsa);

    return buildPlanetPosition(planet, tropicalDegree, absoluteDegree, data.speed);
  });

  // Step 6: Calculate houses (only when birth time is known)
  let housesResult: ReturnType<typeof calculateHouses> = null;
  let ascendant: PlanetPosition | null = null;
  let midheaven: PlanetPosition | null = null;
  let effectiveHouseSystem = houseSystem;

  if (hasBirthTime) {
    // Detect polar fallback: if Placidus requested at extreme latitude,
    // calculateHouses() will switch to Whole Sign
    const wouldFallback =
      houseSystem === HouseSystem.Placidus && Math.abs(latitude) > 66.5;
    if (wouldFallback) {
      effectiveHouseSystem = HouseSystem.WholeSigns;
    }

    housesResult = calculateHouses(julianDay, latitude, longitude, houseSystem);

    if (housesResult !== null) {
      // Assign planets to houses
      for (const position of planetPositions) {
        position.house = getPlanetHouse(position.absoluteDegree, housesResult.cusps);
      }

      // Build Ascendant and Midheaven as PlanetPosition-like objects.
      // Planet.Ascendant / Planet.Midheaven are dedicated enum values for chart
      // angles — they are not real bodies and have no sweph body ID. Using them
      // here ensures that consumers (e.g. PositionTable) can key rows by
      // pos.planet without colliding with the real Sun entry in chart.planets[].
      ascendant = buildAnglePosition(
        Planet.Ascendant,
        housesResult.ascendant,
        ayanamsa,
      );
      midheaven = buildAnglePosition(
        Planet.Midheaven,
        housesResult.midheaven,
        ayanamsa,
      );
    }
  }

  // Step 7: Calculate aspects using sidereal positions
  const aspects = calculateAspects(planetPositions);

  return {
    planets: planetPositions,
    houses: housesResult ? housesResult.cusps : null,
    aspects,
    ascendant,
    midheaven,
    ayanamsa,
    system: 'sidereal',
    houseSystem: effectiveHouseSystem,
    calculatedAt: new Date().toISOString(),
  };
}
