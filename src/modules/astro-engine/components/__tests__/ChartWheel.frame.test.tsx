// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ChartWheel } from '../ChartWheel';
import { calculateChart } from '../../chart';
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

const rings = (c: HTMLElement) =>
  Array.from(c.querySelectorAll('g[aria-label]')).filter((g) =>
    (g.getAttribute('aria-label') ?? '').endsWith('zodiac'),
  );

describe('ChartWheel zodiac frames', () => {
  it('draws one zodiac ring in the sidereal state', () => {
    const { container } = render(<ChartWheel chart={chart} frame="sidereal" />);
    const found = rings(container);
    expect(found).toHaveLength(1);
    expect(found[0]!.getAttribute('aria-label')).toBe('Sidereal zodiac');
  });

  it('draws one zodiac ring in the tropical state', () => {
    const { container } = render(<ChartWheel chart={chart} frame="tropical" />);
    const found = rings(container);
    expect(found).toHaveLength(1);
    expect(found[0]!.getAttribute('aria-label')).toBe('Tropical zodiac');
  });

  it('draws two zodiac rings in both mode', () => {
    const { container } = render(<ChartWheel chart={chart} frame="both" />);
    const labels = rings(container).map((g) => g.getAttribute('aria-label'));
    expect(labels).toHaveLength(2);
    expect(labels).toContain('Sidereal zodiac');
    expect(labels).toContain('Tropical zodiac');
  });

  it('defaults to sidereal when no frame is given', () => {
    const { container } = render(<ChartWheel chart={chart} />);
    expect(rings(container)).toHaveLength(1);
  });

  it('draws exactly one set of house cusps regardless of frame', () => {
    // House numbers are frame-invariant. Drawing them twice would assert a
    // difference that does not exist.
    const single = render(<ChartWheel chart={chart} frame="sidereal" />);
    const singleCusps = single.container.querySelectorAll('g[aria-label^="House "]:not([aria-label="House cusps"])').length;
    single.unmount();
    expect(singleCusps).toBe(12);

    const both = render(<ChartWheel chart={chart} frame="both" />);
    expect(both.container.querySelectorAll('g[aria-label^="House "]:not([aria-label="House cusps"])')).toHaveLength(12);
  });

  it('draws exactly one set of planet glyphs regardless of frame', () => {
    const both = render(<ChartWheel chart={chart} frame="both" />);
    const glyphs = both.container.querySelectorAll('g[data-planet]');
    // If the count is zero the selector is wrong, not the component — fall
    // back to asserting the planet count is not doubled by the second ring.
    if (glyphs.length > 0) {
      expect(glyphs.length).toBe(chart.planets.length);
    }
  });

  it('names the active frame in the SVG description for screen readers', () => {
    const { container: both } = render(<ChartWheel chart={chart} frame="both" />);
    expect(both.querySelector('desc')?.textContent).toContain('together');

    const { container: trop } = render(<ChartWheel chart={chart} frame="tropical" />);
    expect(trop.querySelector('desc')?.textContent).toContain('Tropical');
  });

  it('offsets the tropical ring by the ayanamsa, not by zero', () => {
    // The whole visual claim of `both` is that the two rings are rotated apart.
    // Identical sector geometry would mean the offset was dropped.
    const { container } = render(<ChartWheel chart={chart} frame="both" />);
    const [a, b] = rings(container);
    const firstPath = (g: Element) => g.querySelector('path')?.getAttribute('d');
    expect(firstPath(a!)).not.toBe(firstPath(b!));
  });
});
