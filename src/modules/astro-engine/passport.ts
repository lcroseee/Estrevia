import { ChartResult, Sign, Planet, Element } from '@/shared/types/astrology';
import { SIGN_ELEMENT, SIGN_RULER } from './constants';
import { getRarity } from './rarity';

export interface PassportData {
  sunSign: Sign;
  moonSign: Sign;
  ascendantSign: Sign | null;
  element: Element;
  rulingPlanet: Planet;
  rarityPercent: number;
}

/**
 * Derives Cosmic Passport data from a calculated natal chart.
 *
 * - Sun sign: position of the Sun in the chart
 * - Moon sign: position of the Moon in the chart
 * - Ascendant sign: sign of the Ascendant angle (null if birth time unknown)
 * - Element: based on Sun sign (primary identity element)
 * - Ruling planet: traditional ruler of the Sun sign
 * - Rarity: statistical frequency of this Sun-Moon combination
 *
 * No PII is included — only sign results, element, and rarity.
 */
export function generatePassport(chart: ChartResult): PassportData {
  const sunPosition = chart.planets.find((p) => p.planet === 'Sun');
  const moonPosition = chart.planets.find((p) => p.planet === 'Moon');

  if (!sunPosition) {
    throw new Error('Chart is missing Sun position');
  }
  if (!moonPosition) {
    throw new Error('Chart is missing Moon position');
  }

  const sunSign = sunPosition.sign;
  const moonSign = moonPosition.sign;
  const ascendantSign = chart.ascendant?.sign ?? null;

  const element = SIGN_ELEMENT[sunSign];
  const rulingPlanet = SIGN_RULER[sunSign];
  const rarityPercent = getRarity(sunSign, moonSign);

  return {
    sunSign,
    moonSign,
    ascendantSign,
    element,
    rulingPlanet,
    rarityPercent,
  };
}
