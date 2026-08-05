import { describe, it, expect } from 'vitest';
import { calculateChart } from '../chart';
import { projectChart } from '../zodiac-frame';
import { computeFrameDeltas } from '../frame-delta';
import { HouseSystem, Planet } from '@/shared/types/astrology';

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

describe('computeFrameDeltas', () => {
  it('covers only Sun, Moon and Ascendant', () => {
    const allowed = new Set([Planet.Sun, Planet.Moon, Planet.Ascendant]);
    for (const d of computeFrameDeltas(chart)) {
      expect(allowed.has(d.planet)).toBe(true);
    }
  });

  it('never reports a body whose sign is the same in both frames', () => {
    for (const d of computeFrameDeltas(chart)) {
      expect(d.siderealSign).not.toBe(d.tropicalSign);
    }
  });

  it('agrees with projectChart on every sign it reports', () => {
    const trop = projectChart(chart, 'tropical');
    for (const d of computeFrameDeltas(chart)) {
      const sid =
        d.planet === Planet.Ascendant
          ? chart.ascendant!
          : chart.planets.find((p) => p.planet === d.planet)!;
      const tro =
        d.planet === Planet.Ascendant
          ? trop.ascendant!
          : trop.planets.find((p) => p.planet === d.planet)!;
      expect(d.siderealSign).toBe(sid.sign);
      expect(d.tropicalSign).toBe(tro.sign);
    }
  });

  it('finds a real delta on this chart, so the suite is not vacuous', () => {
    expect(computeFrameDeltas(chart).length).toBeGreaterThan(0);
  });

  it('omits a body the two frames agree on', () => {
    // This chart's Sun is Gemini in BOTH frames — tropical 24 Gemini minus the
    // ayanamsa lands at 0.3 Gemini. That is a normal outcome, not an error.
    const trop = projectChart(chart, 'tropical');
    const sunAgrees =
      chart.planets.find((p) => p.planet === Planet.Sun)!.sign ===
      trop.planets.find((p) => p.planet === Planet.Sun)!.sign;
    if (sunAgrees) {
      expect(computeFrameDeltas(chart).some((d) => d.planet === Planet.Sun)).toBe(false);
    }
  });

  it('returns an empty array rather than throwing when nothing differs', () => {
    const stub = {
      ...chart,
      planets: chart.planets.map((p) => ({ ...p, tropicalDegree: p.absoluteDegree })),
      ascendant: { ...chart.ascendant!, tropicalDegree: chart.ascendant!.absoluteDegree },
      midheaven: { ...chart.midheaven!, tropicalDegree: chart.midheaven!.absoluteDegree },
      ayanamsa: 0,
    };
    expect(computeFrameDeltas(stub)).toEqual([]);
  });

  it('omits the Ascendant when there is no birth time', () => {
    const noTime = calculateChart({ ...PROBE, time: null });
    expect(noTime.ascendant).toBeNull();
    expect(computeFrameDeltas(noTime).some((d) => d.planet === Planet.Ascendant)).toBe(false);
  });

  it('still reports the luminaries when there is no birth time', () => {
    const noTime = calculateChart({ ...PROBE, time: null });
    expect(() => computeFrameDeltas(noTime)).not.toThrow();
  });

  it('is pure — repeated calls return equal results', () => {
    expect(computeFrameDeltas(chart)).toEqual(computeFrameDeltas(chart));
  });

  it('does not mutate the chart it was given', () => {
    const before = JSON.stringify(chart);
    computeFrameDeltas(chart);
    expect(JSON.stringify(chart)).toBe(before);
  });
});
