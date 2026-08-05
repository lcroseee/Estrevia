// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { PositionTable } from '../PositionTable';
import { Planet, Sign } from '@/shared/types';
import type { ChartResult, PlanetPosition } from '@/shared/types';

function pos(planet: Planet, overrides: Partial<PlanetPosition> = {}): PlanetPosition {
  return {
    planet,
    absoluteDegree: 123.5,
    tropicalDegree: 147.7,
    sign: Sign.Leo,
    signDegree: 3.5,
    minutes: 30,
    seconds: 0,
    isRetrograde: false,
    speed: 1,
    house: null,
    ...overrides,
  };
}

function chartFixture(overrides: Partial<ChartResult> = {}): ChartResult {
  return {
    planets: [pos(Planet.Sun), pos(Planet.Moon, { sign: Sign.Pisces })],
    houses: null,
    aspects: [],
    ascendant: null,
    midheaven: null,
    ayanamsa: 24.21,
    system: 'sidereal',
    houseSystem: 'Placidus',
    nodeType: 'mean',
    calculatedAt: '2026-07-11T00:00:00Z',
    ...overrides,
  } as unknown as ChartResult;
}

describe('PositionTable — no-houses chart honesty', () => {
  it('renders no Ascendant/Midheaven rows and no house-system footer when houses are null', () => {
    render(<PositionTable chart={chartFixture()} />);
    expect(screen.queryByText('Ascendant')).toBeNull();
    expect(screen.queryByText('Midheaven')).toBeNull();
    expect(screen.queryByText(/Placidus houses/)).toBeNull();
  });

  it('keeps the Ascendant row + house-system footer for a full chart', () => {
    render(
      <PositionTable
        chart={chartFixture({
          houses: [
            {
              house: 1,
              siderealDegree: 100,
              tropicalDegree: 100,
              sign: Sign.Leo,
              signDegree: 10,
            },
          ],
          ascendant: pos(Planet.Ascendant, { house: 1 }),
        })}
      />,
    );
    expect(screen.getByText('Ascendant')).toBeTruthy();
    expect(screen.getByText(/Placidus houses/)).toBeTruthy();
  });
});
