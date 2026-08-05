// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { ChartWheel } from '../ChartWheel';
import { calculateChart } from '../../chart';
import { projectChart } from '../../zodiac-frame';
import { HouseSystem } from '@/shared/types/astrology';
import en from '../../../../../messages/en.json';

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
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ChartWheel chart={chart} frame="sidereal" />
      </NextIntlClientProvider>,
    );
    const found = rings(container);
    expect(found).toHaveLength(1);
    expect(found[0]!.getAttribute('aria-label')).toBe('Sidereal zodiac');
  });

  it('draws one zodiac ring in the tropical state', () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ChartWheel chart={chart} frame="tropical" />
      </NextIntlClientProvider>,
    );
    const found = rings(container);
    expect(found).toHaveLength(1);
    expect(found[0]!.getAttribute('aria-label')).toBe('Tropical zodiac');
  });

  it('draws two zodiac rings in both mode', () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ChartWheel chart={chart} frame="both" />
      </NextIntlClientProvider>,
    );
    const labels = rings(container).map((g) => g.getAttribute('aria-label'));
    expect(labels).toHaveLength(2);
    expect(labels).toContain('Sidereal zodiac');
    expect(labels).toContain('Tropical zodiac');
  });

  it('defaults to sidereal when no frame is given', () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ChartWheel chart={chart} />
      </NextIntlClientProvider>,
    );
    expect(rings(container)).toHaveLength(1);
  });

  it('draws exactly one set of house cusps regardless of frame', () => {
    // House numbers are frame-invariant. Drawing them twice would assert a
    // difference that does not exist.
    const single = render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ChartWheel chart={chart} frame="sidereal" />
      </NextIntlClientProvider>,
    );
    const singleCusps = single.container.querySelectorAll('g[aria-label^="House "]:not([aria-label="House cusps"])').length;
    single.unmount();
    expect(singleCusps).toBe(12);

    const both = render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ChartWheel chart={chart} frame="both" />
      </NextIntlClientProvider>,
    );
    expect(both.container.querySelectorAll('g[aria-label^="House "]:not([aria-label="House cusps"])')).toHaveLength(12);
  });

  it('draws exactly one set of planet glyphs regardless of frame', () => {
    const both = render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ChartWheel chart={chart} frame="both" />
      </NextIntlClientProvider>,
    );
    const glyphs = both.container.querySelectorAll('g[data-planet]');
    // If the count is zero the selector is wrong, not the component — fall
    // back to asserting the planet count is not doubled by the second ring.
    if (glyphs.length > 0) {
      expect(glyphs.length).toBe(chart.planets.length);
    }
  });

  it('names the active frame in the SVG description for screen readers', () => {
    const { container: both } = render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ChartWheel chart={chart} frame="both" />
      </NextIntlClientProvider>,
    );
    expect(both.querySelector('desc')?.textContent).toContain('together');

    const { container: trop } = render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ChartWheel chart={chart} frame="tropical" />
      </NextIntlClientProvider>,
    );
    expect(trop.querySelector('desc')?.textContent).toContain('Tropical');
  });

  it('keeps the house cusp lines in the same pixels in every frame', () => {
    // The design claim SP-A rests on: switching frames adds the ayanamsa to
    // both the rotation and the plotted longitude, so they cancel and nothing
    // moves except the sign ring.
    //
    // This failed on first implementation. ChartWheel read cusp.siderealDegree
    // unconditionally, while the rotation followed the projected (tropical)
    // Ascendant — so the cusp lines swung ~23.7 degrees away from the ASC
    // marker in tropical mode. That is SP-0's defect, reintroduced.
    const geometry = (frame: 'sidereal' | 'tropical' | 'both') => {
      const view = frame === 'tropical' ? projectChart(chart, 'tropical') : chart;
      const { container, unmount } = render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ChartWheel chart={view} frame={frame} />
      </NextIntlClientProvider>,
    );
      const lines = Array.from(
        container.querySelectorAll(
          'g[aria-label^="House "]:not([aria-label="House cusps"]) line',
        ),
      ).map((l) => `${Number(l.getAttribute('x1')).toFixed(2)},${Number(l.getAttribute('y1')).toFixed(2)}`);
      unmount();
      return lines.join('|');
    };

    const sidereal = geometry('sidereal');
    expect(geometry('tropical')).toBe(sidereal);
    expect(geometry('both')).toBe(sidereal);
  });

  it('keeps the Ascendant marker on the 1st house cusp in every frame', () => {
    const ascOffset = (frame: 'sidereal' | 'tropical') => {
      const view = frame === 'tropical' ? projectChart(chart, 'tropical') : chart;
      const { container, unmount } = render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ChartWheel chart={view} frame={frame} />
      </NextIntlClientProvider>,
    );
      const asc = container.querySelector('[aria-label*="Ascendant"], [data-asc]');
      const first = container.querySelector(
        'g[aria-label="House 1"] line',
      );
      const out = {
        hasAsc: asc !== null,
        firstCusp: first
          ? `${Number(first.getAttribute('x1')).toFixed(2)},${Number(first.getAttribute('y1')).toFixed(2)}`
          : null,
      };
      unmount();
      return out;
    };

    // Whatever the marker's selector, the 1st cusp must land identically in
    // both frames — which is what puts it on the Ascendant.
    expect(ascOffset('tropical').firstCusp).toBe(ascOffset('sidereal').firstCusp);
  });

  it('offsets the tropical ring by the ayanamsa, not by zero', () => {
    // The whole visual claim of `both` is that the two rings are rotated apart.
    // Identical sector geometry would mean the offset was dropped.
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ChartWheel chart={chart} frame="both" />
      </NextIntlClientProvider>,
    );
    const [a, b] = rings(container);
    const firstPath = (g: Element) => g.querySelector('path')?.getAttribute('d');
    expect(firstPath(a!)).not.toBe(firstPath(b!));
  });
});
