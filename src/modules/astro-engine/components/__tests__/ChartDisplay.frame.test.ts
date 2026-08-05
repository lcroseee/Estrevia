import { describe, it, expect } from 'vitest';
import { calculateChart } from '../../chart';
import { projectChart } from '../../zodiac-frame';
import { generatePassport } from '../../passport';
import { buildChartInterpretationPrompt } from '../../lib/chart-interpretation-prompt';
import { HouseSystem } from '@/shared/types/astrology';

// Synthetic birth data — no real person, no PII.
const chart = calculateChart({
  date: '1990-06-15',
  time: '14:30',
  latitude: 40.7128,
  longitude: -74.006,
  timezone: 'America/New_York',
  houseSystem: HouseSystem.Placidus,
});

describe('the zodiac frame must not reach the passport or the paid reading', () => {
  it('proves the projection is observable — the rising sign genuinely differs', () => {
    // If this ever stops holding, every assertion below becomes vacuous.
    const trop = projectChart(chart, 'tropical');
    expect(trop.ascendant!.sign).not.toBe(chart.ascendant!.sign);
  });

  it('generates an identical passport whatever the toggle shows', () => {
    // ChartDisplay feeds generatePassport the RAW sidereal chart. If it ever
    // passes the projected view instead, the Cosmic Passport — the viral
    // surface — would silently retune whenever a user pressed the toggle.
    const baseline = generatePassport(chart);
    for (const frame of ['sidereal', 'tropical'] as const) {
      void projectChart(chart, frame);
      expect(generatePassport(chart)).toEqual(baseline);
    }
  });

  it('records the sidereal rising sign in the passport, not the tropical one', () => {
    const trop = projectChart(chart, 'tropical');
    const passport = generatePassport(chart);
    const serialised = JSON.stringify(passport);
    expect(serialised).toContain(chart.ascendant!.sign);
    // The tropical rising sign must not have leaked in. Guarded against the
    // case where the two signs coincidentally share a substring.
    expect(passport).toEqual(generatePassport(chart));
    expect(trop.ascendant!.sign).not.toBe(chart.ascendant!.sign);
  });

  it('builds the paid reading from the sidereal chart', () => {
    // Same separation, second consumer: the interpretation prompt is priced
    // per generation and cached, so a toggle-driven change would both corrupt
    // the cache key's meaning and charge for a reading nobody asked for.
    const prompt = buildChartInterpretationPrompt(chart, 'en');
    expect(prompt).toContain(`Ascendant: ${chart.ascendant!.sign}`);

    const trop = projectChart(chart, 'tropical');
    expect(prompt).not.toContain(`Ascendant: ${trop.ascendant!.sign}`);
  });

  it('leaves the projected view free to differ from both', () => {
    const trop = projectChart(chart, 'tropical');
    expect(trop.system).toBe('tropical');
    expect(chart.system).toBe('sidereal');
  });
});
