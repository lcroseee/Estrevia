/**
 * Synastry (inter-chart) aspect calculation.
 *
 * Compares every planet in chart1 against every planet in chart2
 * and identifies all major aspects between them, using sidereal longitudes.
 */

import type { ChartResult } from '@/shared/types/astrology';
import { AspectType } from '@/shared/types/astrology';
import { ASPECT_DEFINITIONS } from './constants';

export interface SynastryAspect {
  /** Planet name from chart 1 (e.g., "Sun") */
  planet1: string;
  /** Planet name from chart 2 (e.g., "Moon") */
  planet2: string;
  /** Aspect type name (e.g., "Trine") */
  aspect: string;
  /** Exact angular separation between the two planets */
  angle: number;
  /** How far from exact aspect (in degrees) */
  orb: number;
  /** Whether the aspect is applying (orb is decreasing) or separating */
  isApplying: boolean;
}

/**
 * Synastry-specific orbs — slightly tighter than natal orbs
 * because inter-chart aspects are less powerful than natal ones.
 */
const SYNASTRY_ORBS: Record<string, number> = {
  [AspectType.Conjunction]: 8,
  [AspectType.Opposition]: 8,
  [AspectType.Trine]: 6,
  [AspectType.Square]: 6,
  [AspectType.Sextile]: 4,
  [AspectType.Quincunx]: 3,
  [AspectType.SemiSextile]: 2,
};

/**
 * Angular separation between two ecliptic longitudes.
 * Returns value in [0, 180] — the shortest arc between two points.
 */
function angularSeparation(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/**
 * Determine if the aspect between two planets is applying.
 * Uses the same speed-based approach as aspects.ts:
 * the faster-moving planet is checked to see if the angular gap
 * is shrinking toward the exact aspect angle.
 */
function isApplyingAspect(
  degree1: number,
  speed1: number,
  degree2: number,
  speed2: number,
  aspectAngle: number,
): boolean {
  // Identify faster planet by absolute speed
  const [fasterDeg, fasterSpeed, slowerDeg] =
    Math.abs(speed1) >= Math.abs(speed2)
      ? [degree1, speed1, degree2]
      : [degree2, speed2, degree1];

  const currentSep = angularSeparation(fasterDeg, slowerDeg);

  // Simulate a small step forward in time
  const step = 0.001;
  const futurePos = (fasterDeg + fasterSpeed * step + 360) % 360;
  const futureSep = angularSeparation(futurePos, slowerDeg);

  // Applying: future separation is closer to the target aspect angle
  return Math.abs(futureSep - aspectAngle) < Math.abs(currentSep - aspectAngle);
}

/**
 * Calculate inter-chart aspects between two natal charts.
 *
 * Checks every planet in chart1 against every planet in chart2.
 * Uses sidereal longitudes (absoluteDegree) for angular measurements.
 * Results are sorted by orb (tightest aspects first).
 */
export function calculateSynastryAspects(
  chart1: ChartResult,
  chart2: ChartResult,
): SynastryAspect[] {
  const aspects: SynastryAspect[] = [];
  const aspectTypes = Object.keys(ASPECT_DEFINITIONS) as AspectType[];

  for (const p1 of chart1.planets) {
    for (const p2 of chart2.planets) {
      const separation = angularSeparation(p1.absoluteDegree, p2.absoluteDegree);

      for (const aspectType of aspectTypes) {
        const def = ASPECT_DEFINITIONS[aspectType];
        const maxOrb = SYNASTRY_ORBS[aspectType] ?? def.orb;
        const orb = Math.abs(separation - def.angle);

        if (orb <= maxOrb) {
          aspects.push({
            planet1: p1.planet,
            planet2: p2.planet,
            aspect: aspectType,
            angle: Math.round(separation * 1000) / 1000,
            orb: Math.round(orb * 1000) / 1000,
            isApplying: isApplyingAspect(
              p1.absoluteDegree,
              p1.speed,
              p2.absoluteDegree,
              p2.speed,
              def.angle,
            ),
          });
        }
      }
    }
  }

  // Sort by orb — tightest aspects first
  aspects.sort((a, b) => a.orb - b.orb);

  return aspects;
}
