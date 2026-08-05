import type {
  ChartResult,
  HouseCusp,
  PlanetPosition,
} from '@/shared/types/astrology';
import { absoluteToSignPosition } from './signs';

export type ZodiacFrame = 'sidereal' | 'tropical';

const norm = (deg: number): number => ((deg % 360) + 360) % 360;

/**
 * Re-express a position in the requested frame.
 *
 * `tropicalDegree` is an unconditional tropical reference and never moves;
 * `absoluteDegree` means "the longitude in the frame named by
 * ChartResult.system". Every sign-relative field is recomputed from the new
 * longitude rather than carried over — carrying `minutes` across a frame
 * change is precisely the defect SP-0 deleted from PositionTable, where a
 * tropical degree was rendered beside sidereal minutes and a sidereal sign.
 */
function projectPosition(
  pos: PlanetPosition,
  frame: ZodiacFrame,
  ayanamsa: number,
): PlanetPosition {
  const absoluteDegree =
    frame === 'tropical'
      ? norm(pos.tropicalDegree)
      : norm(pos.tropicalDegree - ayanamsa);
  const sp = absoluteToSignPosition(absoluteDegree);
  return {
    ...pos,
    absoluteDegree,
    sign: sp.sign,
    signDegree: sp.signDegree,
    minutes: sp.minutes,
    seconds: sp.seconds,
  };
}

/**
 * Re-label a cusp for the requested frame.
 *
 * Both raw longitudes stay put — they are frame-independent reference data,
 * and a consumer that needs one can always ask for it by name. Only the sign
 * labels follow the frame.
 */
function projectCusp(cusp: HouseCusp, frame: ZodiacFrame): HouseCusp {
  const longitude =
    frame === 'tropical' ? cusp.tropicalDegree : cusp.siderealDegree;
  const sp = absoluteToSignPosition(longitude);
  return {
    ...cusp,
    sign: sp.sign,
    signDegree: sp.signDegree,
  };
}

/**
 * Re-express a chart in the requested zodiac frame.
 *
 * No ephemeris call: the two frames differ by a constant offset (the
 * ayanamsa), so both are derivable from one calculateChart() result by
 * arithmetic.
 *
 * Only sign-relative values change. House NUMBERS and aspects are invariant
 * under a constant offset — cusps and planets shift together, and angular
 * separation is unchanged — so both are passed through untouched and a caller
 * may rely on them not moving.
 */
export function projectChart(chart: ChartResult, frame: ZodiacFrame): ChartResult {
  if (chart.system === frame) return chart;

  return {
    ...chart,
    planets: chart.planets.map((p) => projectPosition(p, frame, chart.ayanamsa)),
    houses: chart.houses ? chart.houses.map((c) => projectCusp(c, frame)) : null,
    ascendant: chart.ascendant
      ? projectPosition(chart.ascendant, frame, chart.ayanamsa)
      : null,
    midheaven: chart.midheaven
      ? projectPosition(chart.midheaven, frame, chart.ayanamsa)
      : null,
    system: frame,
  };
}
