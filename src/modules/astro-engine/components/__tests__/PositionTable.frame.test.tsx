// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { PositionTable } from '../PositionTable';
import { calculateChart } from '../../chart';
import { projectChart } from '../../zodiac-frame';
import { HouseSystem, Planet } from '@/shared/types/astrology';
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
const tropical = projectChart(chart, 'tropical');

const wrap = (ui: React.ReactNode) =>
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      {ui}
    </NextIntlClientProvider>,
  );

// Pick a body whose sign actually differs between frames, rather than
// assuming one does. Roughly one body in twelve sits far enough from a cusp
// that both zodiacs agree — this chart's Sun is one of them (tropical 24°
// Gemini minus the ayanamsa lands at 0.3° Gemini, still Gemini).
const divergentIndex = chart.planets.findIndex(
  (p, i) => p.sign !== tropical.planets[i]!.sign,
);
const siderealSign = chart.planets[divergentIndex]!.sign;
const tropicalSign = tropical.planets[divergentIndex]!.sign;

describe('PositionTable zodiac frames', () => {
  it('shows one sign column in a single-frame state', () => {
    wrap(<PositionTable chart={chart} frame="sidereal" />);
    expect(screen.queryByText(en.chart.zodiacFrame.tableTropical)).toBeNull();
    expect(screen.getAllByRole('columnheader')).toHaveLength(5);
  });

  it('shows both sign columns in both mode', () => {
    wrap(<PositionTable chart={chart} frame="both" tropicalChart={tropical} />);
    expect(screen.getByText(en.chart.zodiacFrame.tableSidereal)).toBeTruthy();
    expect(screen.getByText(en.chart.zodiacFrame.tableTropical)).toBeTruthy();
    expect(screen.getAllByRole('columnheader')).toHaveLength(6);
  });

  it('renders genuinely different signs in the two columns', () => {
    // Guards against a second column that silently mirrors the first.
    expect(divergentIndex).toBeGreaterThanOrEqual(0);
    expect(tropicalSign).not.toBe(siderealSign);
    wrap(<PositionTable chart={chart} frame="both" tropicalChart={tropical} />);
    expect(screen.getAllByText(siderealSign).length).toBeGreaterThan(0);
    expect(screen.getAllByText(tropicalSign).length).toBeGreaterThan(0);
  });

  it('falls back to one column when both is requested without a tropical chart', () => {
    // Defensive: rendering an empty second column would look like a bug.
    wrap(<PositionTable chart={chart} frame="both" tropicalChart={null} />);
    expect(screen.getAllByRole('columnheader')).toHaveLength(5);
  });

  it('names the ayanamsa in the sidereal footer and drops it in tropical', () => {
    const { unmount } = wrap(<PositionTable chart={chart} frame="sidereal" />);
    expect(screen.getByText(/Lahiri ayanamsa/)).toBeTruthy();
    unmount();

    wrap(<PositionTable chart={tropical} frame="tropical" />);
    expect(screen.queryByText(/Lahiri ayanamsa/)).toBeNull();
  });

  it('localises its chrome rather than hardcoding English', () => {
    wrap(<PositionTable chart={chart} frame="sidereal" />);
    expect(screen.getByText(en.chart.zodiacFrame.positionsHeading)).toBeTruthy();
  });
});
