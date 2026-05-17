// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  AspectType,
  HouseSystem,
  Planet,
  Sign,
  type ChartResult,
  type HouseCusp,
  type PlanetPosition,
} from '@/shared/types';
import { buildChartInterpretationPrompt } from '../chart-interpretation-prompt';

/**
 * Synthetic test fixture — no real PII. Values chosen so the Ascendant
 * (house[0] cusp at 0°) lands in Aries, matching the Sun sign for easy
 * substring assertions.
 */
const planet = (
  p: Planet,
  sign: Sign,
  absoluteDegree: number,
  signDegree: number,
  house: number,
  isRetrograde = false,
): PlanetPosition => ({
  planet: p,
  absoluteDegree,
  tropicalDegree: absoluteDegree + 24,
  sign,
  signDegree,
  minutes: 0,
  seconds: 0,
  isRetrograde,
  speed: 1.0,
  house,
});

const cusp = (house: number, degree: number, sign: Sign, signDegree: number): HouseCusp => ({
  house,
  degree,
  sign,
  signDegree,
});

const SAMPLE_CHART: ChartResult = {
  system: 'sidereal',
  houseSystem: HouseSystem.Placidus,
  ayanamsa: 24.0,
  nodeType: 'mean',
  calculatedAt: '2026-05-17T00:00:00.000Z',
  ascendant: null,
  midheaven: null,
  planets: [
    planet(Planet.Sun, Sign.Aries, 12.5, 12.5, 1),
    planet(Planet.Moon, Sign.Cancer, 95.0, 5.0, 4),
    planet(Planet.Mercury, Sign.Pisces, 340.0, 10.0, 12, true),
    planet(Planet.Venus, Sign.Taurus, 45.0, 15.0, 2),
    planet(Planet.Mars, Sign.Leo, 130.0, 10.0, 5),
    planet(Planet.Jupiter, Sign.Sagittarius, 250.0, 10.0, 9),
    planet(Planet.Saturn, Sign.Capricorn, 290.0, 20.0, 10),
    planet(Planet.Uranus, Sign.Aquarius, 310.0, 10.0, 11),
    planet(Planet.Neptune, Sign.Pisces, 345.0, 15.0, 12),
    planet(Planet.Pluto, Sign.Scorpio, 220.0, 10.0, 8),
    planet(Planet.NorthNode, Sign.Cancer, 100.0, 10.0, 4, true),
    planet(Planet.Chiron, Sign.Virgo, 160.0, 10.0, 6),
  ],
  houses: [
    cusp(1, 0, Sign.Aries, 0),
    cusp(2, 30, Sign.Taurus, 0),
    cusp(3, 60, Sign.Gemini, 0),
    cusp(4, 90, Sign.Cancer, 0),
    cusp(5, 120, Sign.Leo, 0),
    cusp(6, 150, Sign.Virgo, 0),
    cusp(7, 180, Sign.Libra, 0),
    cusp(8, 210, Sign.Scorpio, 0),
    cusp(9, 240, Sign.Sagittarius, 0),
    cusp(10, 270, Sign.Capricorn, 0),
    cusp(11, 300, Sign.Aquarius, 0),
    cusp(12, 330, Sign.Pisces, 0),
  ],
  aspects: [
    { planet1: Planet.Sun, planet2: Planet.Moon, type: AspectType.Square, orb: 0.5, isApplying: true, exactDegree: 90 },
    { planet1: Planet.Venus, planet2: Planet.Mars, type: AspectType.Trine, orb: 2.0, isApplying: false, exactDegree: 120 },
    { planet1: Planet.Saturn, planet2: Planet.Pluto, type: AspectType.Sextile, orb: 1.0, isApplying: true, exactDegree: 60 },
    { planet1: Planet.Sun, planet2: Planet.Jupiter, type: AspectType.Opposition, orb: 4.0, isApplying: true, exactDegree: 180 },
    { planet1: Planet.Mercury, planet2: Planet.Venus, type: AspectType.Conjunction, orb: 5.5, isApplying: false, exactDegree: 0 },
  ],
};

describe('buildChartInterpretationPrompt', () => {
  it('produces an English prompt mentioning Sun, Moon, and Ascendant signs', () => {
    const prompt = buildChartInterpretationPrompt(SAMPLE_CHART, 'en');
    expect(prompt).toContain('Aries');
    expect(prompt).toContain('Cancer'); // Moon
    expect(prompt).toContain('Aries'); // Ascendant = house[0] = 0° → Aries
    expect(prompt.toLowerCase()).toContain('english');
    expect(prompt.toLowerCase()).not.toContain('journey'); // hard-banned word
  });

  it('produces a Spanish prompt with LATAM neutro instruction', () => {
    const prompt = buildChartInterpretationPrompt(SAMPLE_CHART, 'es');
    expect(prompt).toContain('español neutro LATAM');
    expect(prompt).toContain('tú');
  });

  it('selects top 3 aspects by orb tightness', () => {
    const prompt = buildChartInterpretationPrompt(SAMPLE_CHART, 'en');
    // Tightest 3 orbs: Sun-Moon square (0.5), Saturn-Pluto sextile (1.0), Venus-Mars trine (2.0)
    expect(prompt).toContain('Sun');
    expect(prompt).toContain('Moon');
    expect(prompt).toContain('Saturn');
    expect(prompt).toContain('Pluto');
    expect(prompt).toContain('Venus');
    expect(prompt).toContain('Mars');
    // 4th-tightest (Sun-Jupiter opposition, orb 4.0) and 5th (Mercury-Venus, 5.5) are dropped.
    // We can't assert their absence positively because Sun/Venus appear elsewhere, but we
    // can assert the prompt lists exactly 3 aspect entries via a stable marker.
    expect(prompt.match(/orb\s*\d/gi)?.length ?? 0).toBe(3);
  });

  it('omits house references when chart.houses is null', () => {
    const noHouses: ChartResult = { ...SAMPLE_CHART, houses: null };
    const prompt = buildChartInterpretationPrompt(noHouses, 'en');
    expect(prompt.toLowerCase()).toContain('birth time not provided');
    expect(prompt.toLowerCase()).not.toContain('1st house');
    expect(prompt.toLowerCase()).not.toContain('domain');
  });

  it('is deterministic for identical input', () => {
    const a = buildChartInterpretationPrompt(SAMPLE_CHART, 'en');
    const b = buildChartInterpretationPrompt(SAMPLE_CHART, 'en');
    expect(a).toBe(b);
  });
});
