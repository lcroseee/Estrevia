import { describe, it, expect } from 'vitest';
import { calculateChart } from '@/modules/astro-engine/chart';
import { getPlanetHouse } from '@/modules/astro-engine/planet-in-house';
import { HouseSystem } from '@/shared/types/astrology';

// Synthetic birth data — no real person, no PII.
const PROBE = {
  date: '1990-06-15',
  time: '14:30',
  latitude: 40.7128,
  longitude: -74.006,
  timezone: 'America/New_York',
  houseSystem: HouseSystem.Placidus,
} as const;

describe('zodiac frame consistency', () => {
  it('places the Ascendant exactly on the 1st house cusp', () => {
    const chart = calculateChart({ ...PROBE });
    expect(chart.houses).not.toBeNull();
    expect(chart.ascendant).not.toBeNull();
    expect(chart.houses![0]!.siderealDegree).toBeCloseTo(
      chart.ascendant!.absoluteDegree,
      6,
    );
  });

  it('gives the Ascendant and the 1st house cusp the same sign', () => {
    const chart = calculateChart({ ...PROBE });
    expect(chart.houses![0]!.sign).toBe(chart.ascendant!.sign);
  });

  it('places the Midheaven exactly on the 10th house cusp', () => {
    const chart = calculateChart({ ...PROBE });
    const c10 = chart.houses!.find((c) => c.house === 10)!;
    expect(c10.siderealDegree).toBeCloseTo(chart.midheaven!.absoluteDegree, 6);
  });

  it('assigns the same house number in either frame', () => {
    // Both frames differ by a single constant (the ayanamsa), so a planet's
    // house number must be invariant: shifting planet AND cusps by the same
    // amount cannot move a planet across a boundary. This is the assertion
    // whose absence let tropical cusps sit beside sidereal planets.
    const chart = calculateChart({ ...PROBE });
    const tropicalCusps = chart.houses!.map((c) => ({
      ...c,
      siderealDegree: c.tropicalDegree,
    }));

    for (const p of chart.planets) {
      const inSidereal = getPlanetHouse(p.absoluteDegree, chart.houses!);
      const inTropical = getPlanetHouse(p.tropicalDegree, tropicalCusps);
      expect(inTropical, `${p.planet} disagrees across frames`).toBe(inSidereal);
    }
  });

  it('stores each cusp in both frames, separated by the ayanamsa', () => {
    const chart = calculateChart({ ...PROBE });
    for (const cusp of chart.houses!) {
      const delta =
        (((cusp.tropicalDegree - cusp.siderealDegree) % 360) + 360) % 360;
      expect(delta).toBeCloseTo(chart.ayanamsa, 6);
    }
  });

  it('derives each cusp sign from its sidereal degree', () => {
    const chart = calculateChart({ ...PROBE });
    for (const cusp of chart.houses!) {
      expect(cusp.signDegree).toBeCloseTo(cusp.siderealDegree % 30, 6);
    }
  });

  it('gives every cusp a valid sidereal sign', () => {
    // Relocated from houses.test.ts, where it asserted a tropical artefact.
    const SIGNS = [
      'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
      'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
    ];
    const chart = calculateChart({ ...PROBE });
    expect(chart.houses).toHaveLength(12);
    for (const cusp of chart.houses!) {
      expect(SIGNS).toContain(cusp.sign);
      expect(cusp.signDegree).toBeGreaterThanOrEqual(0);
      expect(cusp.signDegree).toBeLessThan(30);
    }
  });
});
