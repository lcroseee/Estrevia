/**
 * Tests for house calculation: Placidus, Whole Sign, polar fallback,
 * house ordering, and absent houses when birth time is unknown.
 */

import { describe, it, expect } from 'vitest';
import { calculateChart } from '@/modules/astro-engine/chart';
import { calculateHouses } from '@/modules/astro-engine/houses';
import { dateToJulianDay } from '@/modules/astro-engine/julian-day';
import { HouseSystem, Sign } from '@/shared/types/astrology';

/** Julian Day for a given UTC date string */
function jdFromUtc(dateStr: string, timeStr = '12:00'): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [h, min] = timeStr.split(':').map(Number);
  return dateToJulianDay(new Date(Date.UTC(y!, m! - 1, d!, h!, min!, 0)));
}

describe('House calculation — normal latitude', () => {
  it('returns 12 house cusps for normal latitude', () => {
    const jd = jdFromUtc('2000-01-01');
    const result = calculateHouses(jd, 51.5, -0.1, HouseSystem.Placidus);
    expect(result).not.toBeNull();
    expect(result!.cusps).toHaveLength(12);
  });

  it('returns valid ASC and MC', () => {
    const jd = jdFromUtc('2000-06-21', '15:00');
    const result = calculateHouses(jd, 51.5, -0.1, HouseSystem.Placidus);
    expect(result).not.toBeNull();
    expect(result!.ascendant).toBeGreaterThanOrEqual(0);
    expect(result!.ascendant).toBeLessThan(360);
    expect(result!.midheaven).toBeGreaterThanOrEqual(0);
    expect(result!.midheaven).toBeLessThan(360);
  });

  it('house cusps are in valid [0, 360) range', () => {
    const jd = jdFromUtc('2000-01-01', '08:00');
    const result = calculateHouses(jd, 48.85, 2.35, HouseSystem.Placidus);
    expect(result).not.toBeNull();
    for (const cusp of result!.cusps) {
      expect(cusp.degree).toBeGreaterThanOrEqual(0);
      expect(cusp.degree).toBeLessThan(360);
    }
  });

  it('each house cusp has a valid sign', () => {
    const jd = jdFromUtc('2000-01-01', '12:00');
    const result = calculateHouses(jd, 40.71, -74.01, HouseSystem.Placidus);
    expect(result).not.toBeNull();
    const validSigns = Object.values(Sign);
    for (const cusp of result!.cusps) {
      expect(validSigns).toContain(cusp.sign);
    }
  });

  it('house numbers are 1 through 12', () => {
    const jd = jdFromUtc('2000-01-01', '12:00');
    const result = calculateHouses(jd, 51.5, -0.1, HouseSystem.Placidus);
    expect(result).not.toBeNull();
    const numbers = result!.cusps.map(c => c.house);
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
});

describe('House calculation — polar latitude fallback', () => {
  it('Placidus at 69.6°N (Tromso) — triggers Whole Sign fallback', () => {
    // Placidus is undefined above Arctic Circle (~66.5°)
    const jd = jdFromUtc('2000-06-21', '12:00');
    const result = calculateHouses(jd, 69.65, 18.96, HouseSystem.Placidus);
    // Should succeed with WholeSigns fallback — 12 cusps returned
    expect(result).not.toBeNull();
    expect(result!.cusps).toHaveLength(12);
  });

  it('Placidus at 78°N (Svalbard) — triggers Whole Sign fallback', () => {
    const jd = jdFromUtc('2000-06-21', '12:00');
    const result = calculateHouses(jd, 78.22, 15.65, HouseSystem.Placidus);
    expect(result).not.toBeNull();
    expect(result!.cusps).toHaveLength(12);
  });

  it('Placidus at 64°N (Reykjavik) — below polar threshold, no fallback needed', () => {
    const jd = jdFromUtc('2000-06-21', '12:00');
    const result = calculateHouses(jd, 64.14, -21.90, HouseSystem.Placidus);
    expect(result).not.toBeNull();
    expect(result!.cusps).toHaveLength(12);
  });

  it('calculateChart uses WholeSigns when Placidus requested at 69.6°N', () => {
    const result = calculateChart({
      date: '2000-06-21',
      time: '12:00',
      latitude: 69.65,
      longitude: 18.96,
      timezone: 'Europe/Oslo',
      houseSystem: HouseSystem.Placidus,
    });
    // Engine detects polar and switches to WholeSigns
    expect(result.houseSystem).toBe(HouseSystem.WholeSigns);
    expect(result.houses).not.toBeNull();
    expect(result.houses).toHaveLength(12);
  });

  it('WholeSigns requested at 69.6°N — no fallback since WholeSigns always works', () => {
    const result = calculateChart({
      date: '2000-06-21',
      time: '12:00',
      latitude: 69.65,
      longitude: 18.96,
      timezone: 'Europe/Oslo',
      houseSystem: HouseSystem.WholeSigns,
    });
    expect(result.houseSystem).toBe(HouseSystem.WholeSigns);
    expect(result.houses).not.toBeNull();
    expect(result.houses).toHaveLength(12);
  });
});

describe('House calculation — no birth time', () => {
  it('returns null houses when time is null', () => {
    const result = calculateChart({
      date: '2000-01-01',
      time: null,
      latitude: 51.5,
      longitude: -0.1,
      timezone: 'Europe/London',
      houseSystem: HouseSystem.Placidus,
    });
    expect(result.houses).toBeNull();
    expect(result.ascendant).toBeNull();
    expect(result.midheaven).toBeNull();
  });

  it('still calculates 12 planet positions when no birth time', () => {
    const result = calculateChart({
      date: '2000-01-01',
      time: null,
      latitude: 51.5,
      longitude: -0.1,
      timezone: 'Europe/London',
      houseSystem: HouseSystem.Placidus,
    });
    expect(result.planets).toHaveLength(12);
    for (const planet of result.planets) {
      expect(planet.house).toBeNull();
    }
  });
});

describe('House cusp ordering', () => {
  it('cusp 1 < cusp 2 < ... with wrap at 360°', () => {
    // House cusps should be in ascending order (with possible wrap from ~350° to ~10°)
    const jd = jdFromUtc('2000-03-21', '08:00');
    const result = calculateHouses(jd, 51.5, -0.1, HouseSystem.Placidus);
    expect(result).not.toBeNull();

    const degrees = result!.cusps.map(c => c.degree);

    // Count how many cusps "wrap" (next cusp < current cusp)
    let wraps = 0;
    for (let i = 1; i < degrees.length; i++) {
      if (degrees[i]! < degrees[i - 1]!) wraps++;
    }

    // In normal (non-polar) charts there should be at most 1 wrap
    expect(wraps).toBeLessThanOrEqual(1);
  });

  it('opposite houses are ~180° apart', () => {
    // House 7 cusp should be ~180° from House 1 cusp (ASC)
    const jd = jdFromUtc('2000-06-21', '18:00');
    const result = calculateHouses(jd, 51.5, -0.1, HouseSystem.Placidus);
    expect(result).not.toBeNull();

    const h1 = result!.cusps.find(c => c.house === 1)!.degree;
    const h7 = result!.cusps.find(c => c.house === 7)!.degree;

    // Angular separation between H1 and H7 should be ~180°
    const diff = Math.abs(h7 - h1);
    const arc = diff > 180 ? 360 - diff : diff;
    expect(arc).toBeGreaterThan(170);
    expect(arc).toBeLessThan(190);
  });

  it('MC (House 10) and IC (House 4) are ~180° apart', () => {
    const jd = jdFromUtc('2000-06-21', '18:00');
    const result = calculateHouses(jd, 51.5, -0.1, HouseSystem.Placidus);
    expect(result).not.toBeNull();

    const h4 = result!.cusps.find(c => c.house === 4)!.degree;
    const h10 = result!.cusps.find(c => c.house === 10)!.degree;

    const diff = Math.abs(h10 - h4);
    const arc = diff > 180 ? 360 - diff : diff;
    expect(arc).toBeGreaterThan(170);
    expect(arc).toBeLessThan(190);
  });
});

describe('House calculation — southern hemisphere', () => {
  it('returns 12 valid house cusps for Sydney (-33.87°S)', () => {
    const jd = jdFromUtc('2000-06-21', '12:00');
    const result = calculateHouses(jd, -33.87, 151.21, HouseSystem.Placidus);
    expect(result).not.toBeNull();
    expect(result!.cusps).toHaveLength(12);
    for (const cusp of result!.cusps) {
      expect(cusp.degree).toBeGreaterThanOrEqual(0);
      expect(cusp.degree).toBeLessThan(360);
    }
  });

  it('returns 12 valid house cusps for Buenos Aires (-34.6°S)', () => {
    const jd = jdFromUtc('2000-06-21', '12:00');
    const result = calculateHouses(jd, -34.60, -58.38, HouseSystem.Placidus);
    expect(result).not.toBeNull();
    expect(result!.cusps).toHaveLength(12);
  });

  it('southern hemisphere polar latitude (-54.8°S) returns valid houses', () => {
    const jd = jdFromUtc('2000-06-21', '12:00');
    const result = calculateHouses(jd, -54.80, -68.30, HouseSystem.Placidus);
    // Above -66.5° threshold so Placidus should work here
    expect(result).not.toBeNull();
    expect(result!.cusps).toHaveLength(12);
  });
});

describe('House calculation — planets in houses', () => {
  it('planets have house assignments when birth time is provided', () => {
    const result = calculateChart({
      date: '2000-06-21',
      time: '12:00',
      latitude: 51.5,
      longitude: -0.1,
      timezone: 'Europe/London',
      houseSystem: HouseSystem.Placidus,
    });

    for (const planet of result.planets) {
      expect(planet.house, `${planet.planet} has no house assignment`).not.toBeNull();
      expect(planet.house!).toBeGreaterThanOrEqual(1);
      expect(planet.house!).toBeLessThanOrEqual(12);
    }
  });
});
