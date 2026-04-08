import { describe, it, expect } from 'vitest';
import { calcPlanet, getAyanamsa } from '../../src/modules/astro-engine/ephemeris';
import { SWEPH_BODY_IDS } from '../../src/modules/astro-engine/constants';

// J2000.0 epoch: Julian Day 2451545.0 = 2000-01-01 12:00:00 TT
const J2000 = 2451545.0;

describe('ephemeris smoke tests — J2000.0 epoch', () => {
  it('calculates Sun tropical longitude near 280.4°', () => {
    const sun = calcPlanet(J2000, SWEPH_BODY_IDS.SE_SUN);

    // Moshier result for J2000: ~280.369°
    expect(sun.longitude).toBeGreaterThan(279.0);
    expect(sun.longitude).toBeLessThan(282.0);
  });

  it('Sun is within valid ecliptic range [0, 360)', () => {
    const sun = calcPlanet(J2000, SWEPH_BODY_IDS.SE_SUN);
    expect(sun.longitude).toBeGreaterThanOrEqual(0);
    expect(sun.longitude).toBeLessThan(360);
  });

  it('Sun speed is positive (direct motion)', () => {
    const sun = calcPlanet(J2000, SWEPH_BODY_IDS.SE_SUN);
    // Sun never retrogrades; speed should be around 1.02°/day
    expect(sun.speed).toBeGreaterThan(0.9);
    expect(sun.speed).toBeLessThan(1.1);
  });

  it('Lahiri ayanamsa for J2000 is approximately 23.85°', () => {
    const ayanamsa = getAyanamsa(J2000);

    // Expected: ~23.857° (Lahiri)
    expect(ayanamsa).toBeGreaterThan(23.7);
    expect(ayanamsa).toBeLessThan(24.0);
  });

  it('sidereal Sun = tropical Sun minus ayanamsa', () => {
    const sun = calcPlanet(J2000, SWEPH_BODY_IDS.SE_SUN);
    const ayanamsa = getAyanamsa(J2000);
    const siderealLongitude = ((sun.longitude - ayanamsa) % 360 + 360) % 360;

    // Sidereal Sun at J2000 should be in Sagittarius (~256–257°)
    expect(siderealLongitude).toBeGreaterThan(255.0);
    expect(siderealLongitude).toBeLessThan(258.0);
  });

  it('calculates Moon position within valid range', () => {
    const moon = calcPlanet(J2000, SWEPH_BODY_IDS.SE_MOON);
    expect(moon.longitude).toBeGreaterThanOrEqual(0);
    expect(moon.longitude).toBeLessThan(360);
    // Moon speed: ~12–15°/day
    expect(Math.abs(moon.speed)).toBeGreaterThan(11);
    expect(Math.abs(moon.speed)).toBeLessThan(16);
  });
});
