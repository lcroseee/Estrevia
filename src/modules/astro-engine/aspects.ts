import { Aspect, AspectType, PlanetPosition } from '@/shared/types/astrology';
import { ASPECT_DEFINITIONS } from './constants';

/**
 * Angular separation between two ecliptic longitudes.
 * Returns value in [0, 180] — the shortest arc between the two points.
 */
function angularSeparation(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/**
 * Determine if the faster-moving planet is applying toward the exact aspect
 * (i.e. moving toward exactitude, orb is decreasing).
 *
 * Logic:
 * - Identify faster planet by absolute speed
 * - "Applying" means the separation is currently decreasing
 * - A planet moving forward (positive speed) applies if it's behind the exact degree
 * - A retrograde planet applies if it's ahead of the exact degree
 */
function isApplyingAspect(
  p1: PlanetPosition,
  p2: PlanetPosition,
  aspectAngle: number,
): boolean {
  // Use sidereal absolute degrees
  const faster = Math.abs(p1.speed) >= Math.abs(p2.speed) ? p1 : p2;
  const slower = faster === p1 ? p2 : p1;

  // Calculate what the exact aspect longitude would be from slower planet's perspective
  // We measure whether the angular gap is shrinking
  const currentSep = angularSeparation(faster.absoluteDegree, slower.absoluteDegree);

  // Simulate position slightly in the future (fraction of a day = small step)
  const step = 0.001; // degrees approximation per small time unit
  const futurePos = (faster.absoluteDegree + faster.speed * step + 360) % 360;
  const futureSep = angularSeparation(futurePos, slower.absoluteDegree);

  const targetSep = aspectAngle;

  // Applying: future separation is closer to target than current
  return Math.abs(futureSep - targetSep) < Math.abs(currentSep - targetSep);
}

/**
 * Calculate all aspects between planets.
 * Checks all 66 unique pairs of 12 bodies against all 7 aspect types.
 * Uses sidereal absoluteDegree for angular measurements.
 */
export function calculateAspects(planets: PlanetPosition[]): Aspect[] {
  const aspects: Aspect[] = [];
  const aspectTypes = Object.keys(ASPECT_DEFINITIONS) as AspectType[];

  for (let i = 0; i < planets.length; i++) {
    for (let j = i + 1; j < planets.length; j++) {
      const p1 = planets[i]!;
      const p2 = planets[j]!;

      const separation = angularSeparation(p1.absoluteDegree, p2.absoluteDegree);

      for (const aspectType of aspectTypes) {
        const def = ASPECT_DEFINITIONS[aspectType];
        const orb = Math.abs(separation - def.angle);

        if (orb <= def.orb) {
          aspects.push({
            planet1: p1.planet,
            planet2: p2.planet,
            type: aspectType,
            orb: Math.round(orb * 1000) / 1000, // round to 3 decimal places
            isApplying: isApplyingAspect(p1, p2, def.angle),
            exactDegree: def.angle,
          });
        }
      }
    }
  }

  return aspects;
}
