import { HouseCusp } from '@/shared/types/astrology';

/**
 * Determine which house a planet falls in, given sorted house cusps.
 *
 * Uses the standard "within cusp boundary" rule:
 * planet is in house N if its longitude is >= cusp[N] and < cusp[N+1].
 * Handles the 0°/360° wrap-around between house 12 and house 1.
 *
 * Returns house number 1-12.
 */
export function getPlanetHouse(planetDegree: number, cusps: HouseCusp[]): number {
  // Normalize planet degree to [0, 360)
  const degree = ((planetDegree % 360) + 360) % 360;

  for (let i = 0; i < 12; i++) {
    const cusp = cusps[i]!;
    const nextCusp = cusps[(i + 1) % 12]!;

    const start = cusp.degree;
    const end = nextCusp.degree;

    if (start <= end) {
      // Normal case: no wrap-around
      if (degree >= start && degree < end) {
        return cusp.house;
      }
    } else {
      // Wrap-around case: house straddles 0°/360° boundary
      // e.g. cusp at 350° and next cusp at 10°
      if (degree >= start || degree < end) {
        return cusp.house;
      }
    }
  }

  // Fallback: should not normally be reached; return house 1
  return 1;
}
