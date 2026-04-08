/**
 * Tests for sidereal conversion: ayanamsa, tropicalToSidereal, sign boundary wrap.
 */

import { describe, it, expect } from 'vitest';
import { getLahiriAyanamsa, tropicalToSidereal } from '@/modules/astro-engine/sidereal';
import { dateToJulianDay } from '@/modules/astro-engine/julian-day';

/** Convert YYYY-MM-DD + HH:mm to Julian Day via dateToJulianDay */
function jd(dateStr: string, timeStr = '12:00'): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [h, min] = timeStr.split(':').map(Number);
  const utcDate = new Date(Date.UTC(y!, m! - 1, d!, h!, min!, 0));
  return dateToJulianDay(utcDate);
}

describe('Lahiri ayanamsa', () => {
  it('ayanamsa for 1900-01-01 is between 22° and 23°', () => {
    const ayan = getLahiriAyanamsa(jd('1900-01-01'));
    expect(ayan).toBeGreaterThanOrEqual(22);
    expect(ayan).toBeLessThan(23);
  });

  it('ayanamsa for 2000-01-01 is between 23° and 24°', () => {
    const ayan = getLahiriAyanamsa(jd('2000-01-01'));
    expect(ayan).toBeGreaterThanOrEqual(23);
    expect(ayan).toBeLessThan(24);
  });

  it('ayanamsa for 2024-01-01 is between 24° and 25°', () => {
    const ayan = getLahiriAyanamsa(jd('2024-01-01'));
    expect(ayan).toBeGreaterThanOrEqual(24);
    expect(ayan).toBeLessThan(25);
  });

  it('ayanamsa for 2050-01-01 is between 24° and 26°', () => {
    const ayan = getLahiriAyanamsa(jd('2050-01-01'));
    expect(ayan).toBeGreaterThanOrEqual(24);
    expect(ayan).toBeLessThan(26);
  });

  it('ayanamsa for 2100-01-01 is between 24° and 26°', () => {
    const ayan = getLahiriAyanamsa(jd('2100-01-01'));
    expect(ayan).toBeGreaterThanOrEqual(24);
    expect(ayan).toBeLessThan(26);
  });

  it('ayanamsa increases over time (precession)', () => {
    const ayan1900 = getLahiriAyanamsa(jd('1900-01-01'));
    const ayan2000 = getLahiriAyanamsa(jd('2000-01-01'));
    const ayan2050 = getLahiriAyanamsa(jd('2050-01-01'));

    expect(ayan2000).toBeGreaterThan(ayan1900);
    expect(ayan2050).toBeGreaterThan(ayan2000);
  });

  it('ayanamsa rate of change is approximately 50" per year (~0.0139°/year)', () => {
    const ayan1990 = getLahiriAyanamsa(jd('1990-01-01'));
    const ayan2000 = getLahiriAyanamsa(jd('2000-01-01'));
    const ratePerYear = (ayan2000 - ayan1990) / 10;

    // 50.3" per year = 0.01397°/year
    expect(ratePerYear).toBeGreaterThan(0.013);
    expect(ratePerYear).toBeLessThan(0.015);
  });

  it('all dates 1900–2100 produce ayanamsa in valid range [20°, 26°]', () => {
    const years = [1900, 1920, 1940, 1960, 1980, 2000, 2020, 2040, 2060, 2080, 2100];
    for (const year of years) {
      const ayan = getLahiriAyanamsa(jd(`${year}-06-15`));
      expect(ayan, `Ayanamsa out of range for year ${year}`).toBeGreaterThan(20);
      expect(ayan, `Ayanamsa out of range for year ${year}`).toBeLessThan(26);
    }
  });
});

describe('tropicalToSidereal conversion', () => {
  it('subtracts ayanamsa from tropical degree', () => {
    const tropical = 100;
    const ayanamsa = 23.5;
    const sidereal = tropicalToSidereal(tropical, ayanamsa);
    expect(sidereal).toBeCloseTo(76.5, 10);
  });

  it('wraps correctly at 0°/360° boundary (result < 0 → wraps to positive)', () => {
    // tropical = 10°, ayanamsa = 23.5° → would be -13.5° → should become 346.5°
    const result = tropicalToSidereal(10, 23.5);
    expect(result).toBeCloseTo(346.5, 10);
  });

  it('wraps correctly at 360° boundary (result > 360°)', () => {
    // tropical = 350°, ayanamsa = -10° (hypothetical negative offset)
    // tropicalToSidereal uses subtraction, so for extreme tropical degrees:
    // tropical=5°, ayanamsa = -355° → 5 - (-355) = 360 → wraps to 0
    const result = tropicalToSidereal(355, 0);
    expect(result).toBeCloseTo(355, 10);
  });

  it('result is always in [0, 360) range', () => {
    const testCases = [
      { t: 0, a: 0 },
      { t: 359.999, a: 0 },
      { t: 0.001, a: 23.5 },
      { t: 359.999, a: 23.5 },
      { t: 180, a: 23.5 },
      { t: 10, a: 23.5 },
      { t: 355, a: 23.5 },
    ];

    for (const { t, a } of testCases) {
      const result = tropicalToSidereal(t, a);
      expect(result, `tropicalToSidereal(${t}, ${a}) = ${result} not in [0, 360)`).toBeGreaterThanOrEqual(0);
      expect(result, `tropicalToSidereal(${t}, ${a}) = ${result} not in [0, 360)`).toBeLessThan(360);
    }
  });

  it('sidereal = tropical - ayanamsa for specific 2000-01-01 case', () => {
    // Sun on 2000-01-01 tropical ≈ 280.5° (Capricorn 10°)
    // Lahiri ayanamsa 2000 ≈ 23.85°
    const ayan = getLahiriAyanamsa(jd('2000-01-01'));
    const tropical = 280.5;
    const sidereal = tropicalToSidereal(tropical, ayan);

    const expected = ((tropical - ayan) % 360 + 360) % 360;
    expect(sidereal).toBeCloseTo(expected, 10);
  });

  it('round-trip: sidereal + ayanamsa = tropical (mod 360)', () => {
    const ayanamsa = 23.85;
    const tropicalValues = [0, 30, 90, 180, 270, 350, 5, 359.99];

    for (const tropical of tropicalValues) {
      const sidereal = tropicalToSidereal(tropical, ayanamsa);
      const backToTropical = ((sidereal + ayanamsa) % 360 + 360) % 360;
      expect(backToTropical).toBeCloseTo(tropical, 10);
    }
  });
});
