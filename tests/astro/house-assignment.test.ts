import { describe, it, expect } from 'vitest';
import { calculateChart } from '@/modules/astro-engine/chart';
import { HouseSystem, Planet } from '@/shared/types/astrology';
import fixtures from './fixtures/reference-charts.json';

const KEY_TO_PLANET: Record<string, Planet> = {
  sun: Planet.Sun,
  moon: Planet.Moon,
  mercury: Planet.Mercury,
  venus: Planet.Venus,
  mars: Planet.Mars,
  jupiter: Planet.Jupiter,
  saturn: Planet.Saturn,
  uranus: Planet.Uranus,
  neptune: Planet.Neptune,
  pluto: Planet.Pluto,
  northNode: Planet.NorthNode,
  chiron: Planet.Chiron,
};

type Fixture = {
  name: string;
  input: {
    date: string;
    time: string | null;
    latitude: number;
    longitude: number;
    timezone: string;
    houseSystem: string;
  };
  expectedHouses?: Record<string, number>;
};

const withHouses = (fixtures as Fixture[]).filter((f) => f.expectedHouses);

describe('reference house assignments', () => {
  it('covers at least two reference charts', () => {
    // Without this guard, a JSON typo in `expectedHouses` would leave the
    // suite green with zero assertions running.
    expect(withHouses.length).toBeGreaterThanOrEqual(2);
  });

  for (const fx of withHouses) {
    it(`assigns the expected houses for ${fx.name}`, () => {
      const chart = calculateChart({
        date: fx.input.date,
        time: fx.input.time,
        latitude: fx.input.latitude,
        longitude: fx.input.longitude,
        timezone: fx.input.timezone,
        houseSystem: fx.input.houseSystem as HouseSystem,
      });

      // The frame invariant these numbers rest on: if the Ascendant and the
      // 1st cusp ever disagree, the house numbers below are meaningless.
      expect(chart.ascendant!.sign).toBe(chart.houses![0]!.sign);

      for (const [key, expected] of Object.entries(fx.expectedHouses!)) {
        const planet = KEY_TO_PLANET[key]!;
        const pos = chart.planets.find((p) => p.planet === planet)!;
        expect(pos.house, `${fx.name} / ${key}`).toBe(expected);
      }
    });
  }
});
