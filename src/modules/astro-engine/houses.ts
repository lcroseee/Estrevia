import { HouseCusp, HouseSystem } from '@/shared/types/astrology';
import { calcHouses } from './ephemeris';
import { HOUSE_SYSTEMS } from './constants';
import { absoluteToSignPosition } from './signs';

export interface HouseCalculationResult {
  cusps: HouseCusp[];
  ascendant: number;
  midheaven: number;
}

/**
 * Calculate house cusps for a given Julian Day, geographic coordinates, and house system.
 *
 * Polar fallback: if |latitude| > 66.5° and Placidus is requested,
 * automatically switches to Whole Sign (Placidus is undefined at extreme latitudes).
 *
 * Returns null only when birth time is unknown — that check is handled by chart.ts,
 * not here. This function always attempts calculation.
 */
export function calculateHouses(
  julianDay: number,
  latitude: number,
  longitude: number,
  houseSystem: HouseSystem,
): HouseCalculationResult | null {
  let effectiveSystem = houseSystem;

  // Polar fallback: Placidus is undefined above Arctic/Antarctic circles
  if (houseSystem === HouseSystem.Placidus && Math.abs(latitude) > 66.5) {
    effectiveSystem = HouseSystem.WholeSigns;
  }

  const systemChar = HOUSE_SYSTEMS[effectiveSystem];

  let houseData;
  try {
    houseData = calcHouses(julianDay, latitude, longitude, systemChar);
  } catch {
    // Unexpected failure (extreme coordinates, etc.) — return null
    return null;
  }

  // houseData.cusps is 0-indexed array of 12 house cusp longitudes
  // houseData.ascmc[0] = Ascendant, houseData.ascmc[1] = Midheaven
  const cusps: HouseCusp[] = houseData.cusps.map((degree, index) => {
    const pos = absoluteToSignPosition(degree);
    return {
      house: index + 1,
      degree,
      sign: pos.sign,
      signDegree: pos.signDegree,
    };
  });

  return {
    cusps,
    ascendant: houseData.ascmc[0] ?? 0,
    midheaven: houseData.ascmc[1] ?? 0,
  };
}
