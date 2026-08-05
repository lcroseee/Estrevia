import { projectChart } from '@/modules/astro-engine/zodiac-frame';
import { Planet, type ChartResult } from '@/shared/types/astrology';
import type { SynastryPersonSummary } from '@/shared/types/synastry';

const signOf = (chart: ChartResult, planet: Planet): string | null =>
  chart.planets.find((p) => p.planet === planet)?.sign ?? null;

/**
 * Build the per-person summary strip shown above the compatibility score.
 *
 * Both frames come from ONE calculateChart() result: projectChart is pure
 * arithmetic over a constant offset, so there is no second ephemeris call and
 * no measurable cost to always including the tropical labels.
 *
 * Extracted from the route so the projection is testable without standing up
 * the whole endpoint — and so the two near-identical object literals the route
 * used to inline stop being a copy-paste pair.
 */
export function buildSynastryPersonSummary(
  chart: ChartResult,
  name: string | null,
): SynastryPersonSummary {
  const tropical = projectChart(chart, 'tropical');
  return {
    name,
    sunSign: signOf(chart, Planet.Sun),
    moonSign: signOf(chart, Planet.Moon),
    ascendant: chart.ascendant?.sign ?? null,
    tropicalSunSign: signOf(tropical, Planet.Sun),
    tropicalMoonSign: signOf(tropical, Planet.Moon),
    tropicalAscendant: tropical.ascendant?.sign ?? null,
  };
}
