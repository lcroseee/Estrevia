// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { calculateChart } from '@/modules/astro-engine/chart';
import { projectChart } from '@/modules/astro-engine/zodiac-frame';
import { HouseSystem, Planet } from '@/shared/types/astrology';
import { buildSynastryPersonSummary } from '../summary';

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

describe('buildSynastryPersonSummary', () => {
  it('keeps the existing sidereal fields unchanged', () => {
    const s = buildSynastryPersonSummary(chart, 'Alex');
    expect(s.sunSign).toBe(chart.planets.find((p) => p.planet === Planet.Sun)!.sign);
    expect(s.moonSign).toBe(chart.planets.find((p) => p.planet === Planet.Moon)!.sign);
    expect(s.ascendant).toBe(chart.ascendant!.sign);
    expect(s.name).toBe('Alex');
  });

  it('adds the tropical sign names', () => {
    const trop = projectChart(chart, 'tropical');
    const s = buildSynastryPersonSummary(chart, null);
    expect(s.tropicalSunSign).toBe(trop.planets.find((p) => p.planet === Planet.Sun)!.sign);
    expect(s.tropicalMoonSign).toBe(trop.planets.find((p) => p.planet === Planet.Moon)!.sign);
    expect(s.tropicalAscendant).toBe(trop.ascendant!.sign);
  });

  it('produces a genuinely different label for at least one body', () => {
    // Proves the projection ran. Not asserted on the Sun specifically: on this
    // probe chart the Sun is Gemini in BOTH frames (tropical 24 Gemini minus
    // the ayanamsa lands at 0.3 Gemini). Roughly one body in twelve does that.
    const s = buildSynastryPersonSummary(chart, null);
    const differs =
      s.tropicalSunSign !== s.sunSign ||
      s.tropicalMoonSign !== s.moonSign ||
      s.tropicalAscendant !== s.ascendant;
    expect(differs).toBe(true);
  });

  it('returns nulls rather than throwing when there is no birth time', () => {
    const noTime = calculateChart({ ...PROBE, time: null });
    const s = buildSynastryPersonSummary(noTime, null);
    expect(s.ascendant).toBeNull();
    expect(s.tropicalAscendant).toBeNull();
    expect(s.sunSign).not.toBeNull();
    expect(s.tropicalSunSign).not.toBeNull();
  });

  it('accepts a null name', () => {
    expect(buildSynastryPersonSummary(chart, null).name).toBeNull();
  });

  it('does not mutate the chart it was given', () => {
    const before = JSON.stringify(chart);
    buildSynastryPersonSummary(chart, 'Alex');
    expect(JSON.stringify(chart)).toBe(before);
  });
});
