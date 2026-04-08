import * as sweph from 'sweph';
import { SE_SIDM_LAHIRI, SEFLG_SPEED, SEFLG_MOSEPH } from './constants';

// Set Lahiri ayanamsa once at module load — applies to all subsequent sidereal calculations
sweph.set_sid_mode(SE_SIDM_LAHIRI, 0, 0);

export interface PlanetData {
  longitude: number;
  latitude: number;
  distance: number;
  speed: number;
}

export interface HouseData {
  cusps: number[];
  ascmc: number[];
}

/**
 * Calculate ecliptic position of a celestial body.
 * Uses Moshier analytical ephemeris (no .se1 files required).
 * Returns tropical longitude — apply ayanamsa offset for sidereal.
 */
export function calcPlanet(julianDay: number, bodyId: number): PlanetData {
  const flags = SEFLG_SPEED | SEFLG_MOSEPH;
  const result = sweph.calc_ut(julianDay, bodyId, flags);

  if (result.flag < 0) {
    throw new Error(`sweph.calc_ut failed for body ${bodyId}: ${result.error ?? 'unknown error'}`);
  }

  const [longitude, latitude, distance, speed] = result.data;

  return {
    longitude: longitude ?? 0,
    latitude: latitude ?? 0,
    distance: distance ?? 0,
    speed: speed ?? 0,
  };
}

/**
 * Calculate house cusps using the specified house system.
 * ascmc[0] = Ascendant, ascmc[1] = Midheaven (MC).
 * Cusps are 1-indexed in the returned array (index 0 is unused, cusps[1]–cusps[12]).
 */
export function calcHouses(
  julianDay: number,
  latitude: number,
  longitude: number,
  system: string,
): HouseData {
  const result = sweph.houses(julianDay, latitude, longitude, system);

  if (result.flag < 0) {
    throw new Error(`sweph.houses failed: flag ${result.flag}`);
  }

  // sweph returns { data: { houses: number[], points: number[] } }
  // houses: 12 cusps (0-indexed, matching cusp 1–12)
  // points: ASC, MC, ARMC, Vertex, Equatorial ASC, co-ASC (Koch), co-ASC (Munkasey), Polar ASC
  return {
    cusps: result.data.houses,
    ascmc: result.data.points,
  };
}

/**
 * Returns Lahiri ayanamsa value in degrees for the given Julian Day.
 * Must call sweph.set_sid_mode(SE_SIDM_LAHIRI, 0, 0) before using — done at module load.
 */
export function getAyanamsa(julianDay: number): number {
  return sweph.get_ayanamsa_ut(julianDay);
}

/**
 * Release sweph resources. Call on server shutdown when needed.
 */
export function closeEphemeris(): void {
  sweph.close();
}
