import { describe, it, expect } from 'vitest';
import { calculateChart } from '../chart';
import { projectChart } from '../zodiac-frame';
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

const chart = calculateChart({ ...PROBE });

describe('projectChart', () => {
  it('is an identity when projecting a sidereal chart to sidereal', () => {
    // The cheap guard against a sign-of-the-offset error.
    expect(projectChart(chart, 'sidereal')).toEqual(chart);
  });

  it('round-trips back to the original', () => {
    const back = projectChart(projectChart(chart, 'tropical'), 'sidereal');
    for (let i = 0; i < chart.planets.length; i++) {
      expect(back.planets[i]!.sign).toBe(chart.planets[i]!.sign);
      expect(back.planets[i]!.absoluteDegree).toBeCloseTo(
        chart.planets[i]!.absoluteDegree,
        6,
      );
      expect(back.planets[i]!.minutes).toBe(chart.planets[i]!.minutes);
    }
  });

  it('shifts each planet forward by exactly the ayanamsa', () => {
    const trop = projectChart(chart, 'tropical');
    for (let i = 0; i < chart.planets.length; i++) {
      const delta =
        (((trop.planets[i]!.absoluteDegree - chart.planets[i]!.absoluteDegree) % 360) +
          360) %
        360;
      expect(delta).toBeCloseTo(chart.ayanamsa, 6);
    }
  });

  it('recomputes minutes rather than carrying them over', () => {
    // The exact defect SP-0 deleted from PositionTable: a tropical degree
    // shown beside sidereal minutes and a sidereal sign.
    //
    // signDegree is the INTEGER degree within the sign (0-29); the fraction
    // lives in minutes/seconds. See absoluteToSignPosition.
    const trop = projectChart(chart, 'tropical');
    for (const p of trop.planets) {
      const within = p.absoluteDegree % 30;
      expect(p.signDegree).toBe(Math.floor(within));
      expect(p.minutes).toBe(Math.floor((within - Math.floor(within)) * 60));
    }
  });

  it('actually moves at least one planet into a different sign', () => {
    // Without this, every assertion above would still pass on a no-op.
    const trop = projectChart(chart, 'tropical');
    const moved = trop.planets.filter(
      (p, i) => p.sign !== chart.planets[i]!.sign,
    );
    expect(moved.length).toBeGreaterThan(0);
  });

  it('keeps house numbers byte-identical across frames', () => {
    // Cusps and planets shift together, so house membership cannot move.
    const trop = projectChart(chart, 'tropical');
    expect(trop.planets.map((p) => p.house)).toEqual(
      chart.planets.map((p) => p.house),
    );
  });

  it('keeps aspects byte-identical across frames', () => {
    // Angular separation is invariant under a constant offset.
    const trop = projectChart(chart, 'tropical');
    expect(trop.aspects).toEqual(chart.aspects);
  });

  it('reports the frame it produced', () => {
    expect(projectChart(chart, 'tropical').system).toBe('tropical');
    expect(projectChart(chart, 'sidereal').system).toBe('sidereal');
  });

  it('keeps every longitude inside [0, 360)', () => {
    const trop = projectChart(chart, 'tropical');
    for (const p of trop.planets) {
      expect(p.absoluteDegree).toBeGreaterThanOrEqual(0);
      expect(p.absoluteDegree).toBeLessThan(360);
    }
  });

  it('wraps a body sitting just below 360 into the next sign', () => {
    // Constructed rather than sampled: the wrap is the one arithmetic edge
    // that a mid-zodiac chart would never exercise.
    const near360 = {
      ...chart,
      planets: [
        {
          ...chart.planets[0]!,
          tropicalDegree: 5,          // tropical 5° Aries
          absoluteDegree: 341.5,      // sidereal ~11.5° Pisces
        },
      ],
    };
    const trop = projectChart(near360, 'tropical');
    expect(trop.planets[0]!.absoluteDegree).toBeCloseTo(5, 6);
    expect(trop.planets[0]!.sign).toBe('Aries');

    const back = projectChart(trop, 'sidereal');
    expect(back.planets[0]!.absoluteDegree).toBeCloseTo(
      (5 - chart.ayanamsa + 360) % 360,
      6,
    );
    expect(back.planets[0]!.sign).toBe('Pisces');
  });

  it('projects the angles too', () => {
    const trop = projectChart(chart, 'tropical');
    expect(trop.ascendant!.absoluteDegree).toBeCloseTo(
      chart.ascendant!.tropicalDegree,
      6,
    );
    expect(trop.midheaven!.absoluteDegree).toBeCloseTo(
      chart.midheaven!.tropicalDegree,
      6,
    );
  });

  it('projects the cusp labels and leaves the raw longitudes alone', () => {
    const trop = projectChart(chart, 'tropical');
    for (let i = 0; i < chart.houses!.length; i++) {
      expect(trop.houses![i]!.signDegree).toBe(
        Math.floor(chart.houses![i]!.tropicalDegree % 30),
      );
      // Raw longitudes are frame-independent reference data — unchanged.
      expect(trop.houses![i]!.tropicalDegree).toBe(chart.houses![i]!.tropicalDegree);
      expect(trop.houses![i]!.siderealDegree).toBe(chart.houses![i]!.siderealDegree);
    }
  });

  it('handles a chart with no houses', () => {
    const noTime = calculateChart({ ...PROBE, time: null });
    expect(noTime.houses).toBeNull();
    const trop = projectChart(noTime, 'tropical');
    expect(trop.houses).toBeNull();
    expect(trop.ascendant).toBeNull();
    expect(trop.midheaven).toBeNull();
    expect(trop.planets).toHaveLength(noTime.planets.length);
  });

  it('does not mutate the chart it was given', () => {
    const before = JSON.stringify(chart);
    projectChart(chart, 'tropical');
    expect(JSON.stringify(chart)).toBe(before);
  });
});
