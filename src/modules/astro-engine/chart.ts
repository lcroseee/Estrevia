// Must be imported first — sets ephemeris file path for asteroid bodies (Chiron)
import './ephe-path';

import {
  ChartResult,
  HouseCusp,
  HouseSystem,
  Planet,
  PlanetPosition,
} from '@/shared/types/astrology';
import { dateToJulianDay } from './julian-day';
import { getUtcOffset } from './timezone';
import { calcPlanet } from './ephemeris';
import { getLahiriAyanamsa, tropicalToSidereal } from './sidereal';
import { absoluteToSignPosition } from './signs';
import { calculateHouses, type TropicalCusp } from './houses';
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
 * Project a tropical cusp into the sidereal frame and derive its sign.
 *
 * Mirrors what buildPlanetPosition/buildAnglePosition already do for bodies
 * and angles. Houses were the sole exception to that pattern, which is why
 * they ended up in a different frame from everything they were compared to.
 */
function buildHouseCusp(cusp: TropicalCusp, ayanamsa: number): HouseCusp {
  const siderealDegree = tropicalToSidereal(cusp.tropicalDegree, ayanamsa);
  const pos = absoluteToSignPosition(siderealDegree);
  return {
    house: cusp.house,
    siderealDegree,
    tropicalDegree: cusp.tropicalDegree,
    sign: pos.sign,
    signDegree: pos.signDegree,
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
  //
  // DST fall-back disambiguation policy: when a local time is ambiguous (e.g.,
  // UK 2023-10-29 01:30 exists as both BST and GMT), we prefer the PRE-REWIND
  // interpretation (summer time / BST). This matches Astro.com's behavior and
  // is the conventional default in astrology software.
  //
  // Algorithm: treat the local wall-clock time as if it were UTC (localDateApprox),
  // then call getTimezoneOffset twice — once with the raw local-as-UTC timestamp,
  // and once with the timestamp shifted back by the first offset estimate. If both
  // offsets differ (ambiguous gap), choose the larger offset (summer time = more
  // minutes ahead of UTC = earlier UTC moment = pre-rewind interpretation).
  const localDateApprox = new Date(
    Date.UTC(year, month - 1, day, localHour, localMinute, 0),
  );

  const offsetFirst = getUtcOffset(timezone, localDateApprox);
  const utcMsFirst = localDateApprox.getTime() - offsetFirst * 60_000;
  // Check offset at the resulting UTC moment to detect DST ambiguity
  const offsetSecond = getUtcOffset(timezone, new Date(utcMsFirst));

  // If the two offset estimates differ, the local time falls in a DST gap/overlap.
  // Prefer the larger offset (summer time / pre-rewind) to match Astro.com convention.
  const offsetMinutes = offsetFirst !== offsetSecond
    ? Math.max(offsetFirst, offsetSecond)
    : offsetFirst;

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
  let siderealCusps: HouseCusp[] | null = null;
  let ascendant: PlanetPosition | null = null;
  let midheaven: PlanetPosition | null = null;
  let effectiveHouseSystem = houseSystem;

  if (hasBirthTime) {
    housesResult = calculateHouses(julianDay, latitude, longitude, houseSystem);

    // Derive the system actually used from the same condition that houses.ts
    // applies internally. This is the single source of truth for the polar
    // fallback decision — no duplicate threshold here.
    if (houseSystem === HouseSystem.Placidus && Math.abs(latitude) > 66.5) {
      effectiveHouseSystem = HouseSystem.WholeSigns;
    }

    if (housesResult !== null) {
      // Project cusps into the sidereal frame FIRST. Planet longitudes are
      // sidereal, so pairing them with raw tropical cusps offsets every house
      // assignment by the ayanamsa (~23.7° in 1990 — most planets land one
      // house off).
      siderealCusps = housesResult.cusps.map((c) => buildHouseCusp(c, ayanamsa));

      // Assign planets to houses — both sides now in the same frame
      for (const position of planetPositions) {
        position.house = getPlanetHouse(position.absoluteDegree, siderealCusps);
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
    houses: siderealCusps,
    aspects,
    ascendant,
    midheaven,
    ayanamsa,
    system: 'sidereal',
    houseSystem: effectiveHouseSystem,
    // North Node is calculated as Mean Node (SE_MEAN_NODE = body ID 10).
    // True Node (body ID 11) oscillates ±1.5° from Mean Node. This field is
    // exposed so API consumers can account for the difference when comparing
    // against Astro.com, which defaults to True Node.
    nodeType: 'mean' as const,
    calculatedAt: new Date().toISOString(),
  };
}
