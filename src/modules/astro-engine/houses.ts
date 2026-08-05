import { HouseSystem } from '@/shared/types/astrology';
import { calcHouses } from './ephemeris';
import { HOUSE_SYSTEMS } from './constants';

/**
 * A house cusp exactly as Swiss Ephemeris reports it.
 *
 * `sweph.houses()` is called without SEFLG_SIDEREAL, so cusps are always
 * tropical. This type says so in its field name. Converting to sidereal and
 * deriving signs is chart.ts's job — it owns the ayanamsa and already does
 * the same for planets and angles. Houses were the sole exception to that
 * pattern, which is why they ended up in a different frame from everything
 * they were compared against.
 */
export interface TropicalCusp {
  house: number;
  tropicalDegree: number;
}

export interface HouseCalculationResult {
  cusps: TropicalCusp[];
  /** Tropical Ascendant longitude. */
  ascendant: number;
  /** Tropical Midheaven longitude. */
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
  const cusps: TropicalCusp[] = houseData.cusps.map((degree, index) => ({
    house: index + 1,
    tropicalDegree: degree,
  }));

  return {
    cusps,
    ascendant: houseData.ascmc[0] ?? 0,
    midheaven: houseData.ascmc[1] ?? 0,
  };
}
