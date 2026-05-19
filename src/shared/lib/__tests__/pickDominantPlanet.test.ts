import { describe, it, expect } from 'vitest';
import { pickDominantPlanet } from '../email';
import { Planet, Sign } from '@/shared/types';
import type { ChartResult } from '@/shared/types';

function makeChart(planets: Array<{ planet: Planet; sign: Sign }>): ChartResult {
  return {
    planets: planets.map((p) => ({
      planet: p.planet,
      absoluteDegree: 0,
      tropicalDegree: 0,
      sign: p.sign,
      signDegree: 0,
      minutes: 0,
      seconds: 0,
      isRetrograde: false,
      speed: 0,
      house: null,
    })),
    houses: null,
    aspects: [],
    ascendant: null,
    midheaven: null,
    ayanamsa: 0,
    system: 'sidereal',
    houseSystem: 'Placidus' as never,
    nodeType: 'mean',
    calculatedAt: '2026-05-19T00:00:00Z',
  };
}

describe('pickDominantPlanet', () => {
  it('returns Mercury/Gemini fallback for null chart', () => {
    expect(pickDominantPlanet(null)).toEqual({ planet: 'Mercury', signName: 'Gemini' });
  });

  it('picks Saturn when Saturn is in Capricorn (essential dignity)', () => {
    const chart = makeChart([{ planet: Planet.Saturn, sign: Sign.Capricorn }]);
    expect(pickDominantPlanet(chart)).toEqual({ planet: 'Saturn', signName: 'Capricorn' });
  });

  it('picks Saturn when Saturn is in Aquarius', () => {
    const chart = makeChart([{ planet: Planet.Saturn, sign: Sign.Aquarius }]);
    expect(pickDominantPlanet(chart)).toEqual({ planet: 'Saturn', signName: 'Aquarius' });
  });

  it('picks Mars when Mars is in Aries and Saturn rule does not apply', () => {
    const chart = makeChart([
      { planet: Planet.Saturn, sign: Sign.Cancer },
      { planet: Planet.Mars, sign: Sign.Aries },
    ]);
    expect(pickDominantPlanet(chart)).toEqual({ planet: 'Mars', signName: 'Aries' });
  });

  it('picks Mars when Mars is in Scorpio', () => {
    const chart = makeChart([{ planet: Planet.Mars, sign: Sign.Scorpio }]);
    expect(pickDominantPlanet(chart)).toEqual({ planet: 'Mars', signName: 'Scorpio' });
  });

  it('picks Venus when Venus is in Taurus and Saturn/Mars rules do not apply', () => {
    const chart = makeChart([
      { planet: Planet.Saturn, sign: Sign.Cancer },
      { planet: Planet.Mars, sign: Sign.Cancer },
      { planet: Planet.Venus, sign: Sign.Taurus },
    ]);
    expect(pickDominantPlanet(chart)).toEqual({ planet: 'Venus', signName: 'Taurus' });
  });

  it('picks Venus when Venus is in Libra', () => {
    const chart = makeChart([{ planet: Planet.Venus, sign: Sign.Libra }]);
    expect(pickDominantPlanet(chart)).toEqual({ planet: 'Venus', signName: 'Libra' });
  });

  it('falls back to Mercury with actual Mercury sign when no dignity rule matches', () => {
    const chart = makeChart([
      { planet: Planet.Saturn, sign: Sign.Cancer },
      { planet: Planet.Mars, sign: Sign.Cancer },
      { planet: Planet.Venus, sign: Sign.Cancer },
      { planet: Planet.Mercury, sign: Sign.Sagittarius },
    ]);
    expect(pickDominantPlanet(chart)).toEqual({ planet: 'Mercury', signName: 'Sagittarius' });
  });

  it('falls back to Mercury/Gemini when chart has no Mercury position', () => {
    const chart = makeChart([{ planet: Planet.Sun, sign: Sign.Leo }]);
    expect(pickDominantPlanet(chart)).toEqual({ planet: 'Mercury', signName: 'Gemini' });
  });

  it('handles empty planets array', () => {
    const chart = makeChart([]);
    expect(pickDominantPlanet(chart)).toEqual({ planet: 'Mercury', signName: 'Gemini' });
  });
});
