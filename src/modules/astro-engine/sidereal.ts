import { getAyanamsa } from './ephemeris';

/**
 * Convert tropical ecliptic longitude to sidereal by subtracting ayanamsa.
 * Result is normalized to [0, 360).
 */
export function tropicalToSidereal(tropicalDegree: number, ayanamsa: number): number {
  let sidereal = tropicalDegree - ayanamsa;
  // Normalize to [0, 360)
  sidereal = ((sidereal % 360) + 360) % 360;
  return sidereal;
}

/**
 * Get Lahiri ayanamsa for a given Julian Day.
 * Thin wrapper around getAyanamsa() from ephemeris.ts.
 * Relies on SE_SIDM_LAHIRI being set at module load in ephemeris.ts.
 */
export function getLahiriAyanamsa(julianDay: number): number {
  return getAyanamsa(julianDay);
}
