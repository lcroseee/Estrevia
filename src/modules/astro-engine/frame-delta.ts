import type { ChartResult, Sign } from '@/shared/types/astrology';
import { Planet } from '@/shared/types/astrology';
import { projectChart } from './zodiac-frame';

export interface FrameDelta {
  planet: Planet;
  siderealSign: Sign;
  tropicalSign: Sign;
}

/**
 * The three bodies users recognise.
 *
 * Reporting all twelve would bury the insight in a list; these are the ones a
 * reader can hold in mind at once, and the ones the founder's framing is
 * written around.
 */
const REPORTED: readonly Planet[] = [Planet.Sun, Planet.Moon, Planet.Ascendant];

/**
 * Bodies whose sign differs between the two zodiac frames.
 *
 * Pure: no LLM, no I/O, no clock. This is the free layer — every visitor who
 * presses the toggle gets an explanation, with no tokens, no latency and no
 * hallucination surface.
 *
 * Returns an empty array when the frames agree on all three. That happens
 * often enough to be a normal outcome rather than an error — roughly one body
 * in twelve sits far enough from a cusp that both zodiacs name the same sign —
 * so callers MUST render the empty case as a real message, not a blank panel.
 */
export function computeFrameDeltas(chart: ChartResult): FrameDelta[] {
  const tropical = projectChart(chart, 'tropical');
  const deltas: FrameDelta[] = [];

  for (const planet of REPORTED) {
    const sid =
      planet === Planet.Ascendant
        ? chart.ascendant
        : chart.planets.find((p) => p.planet === planet);
    const tro =
      planet === Planet.Ascendant
        ? tropical.ascendant
        : tropical.planets.find((p) => p.planet === planet);

    if (!sid || !tro) continue;          // no birth time → no Ascendant
    if (sid.sign === tro.sign) continue; // frames agree on this body

    deltas.push({ planet, siderealSign: sid.sign, tropicalSign: tro.sign });
  }

  return deltas;
}
