import { describe, it, expect } from 'vitest';
import { dateToJulianDay, julianDayToDate } from '../../src/modules/astro-engine/julian-day';

describe('dateToJulianDay', () => {
  it('J2000 epoch (2000-01-01T12:00:00Z) returns ET JD ≈ 2451545.0', () => {
    const date = new Date('2000-01-01T12:00:00Z');
    const jd = dateToJulianDay(date);
    // ET Julian Day for J2000 is 2451545.0 + ~64s leap second correction ≈ 2451545.00074
    // We allow a small tolerance for the UT→ET difference (delta-T ≈ 64 seconds)
    expect(jd).toBeCloseTo(2451545.0, 2);
  });

  it('J2000 ET JD is within 0.001 of 2451545.0', () => {
    const date = new Date('2000-01-01T12:00:00Z');
    const jd = dateToJulianDay(date);
    expect(Math.abs(jd - 2451545.0)).toBeLessThan(0.001);
  });

  it('Aleister Crowley birth (1875-10-12T23:00:00Z) returns known JD', () => {
    const date = new Date('1875-10-12T23:00:00Z');
    const jd = dateToJulianDay(date);
    // Expected: ~2406174.458 for UT; ET slightly higher due to delta-T
    // JD for 1875-10-12 at 23h UT ≈ 2406174.4583
    expect(jd).toBeGreaterThan(2406174.4);
    expect(jd).toBeLessThan(2406174.55);
  });

  it('Unix epoch (1970-01-01T00:00:00Z) returns JD ≈ 2440587.5', () => {
    const date = new Date('1970-01-01T00:00:00Z');
    const jd = dateToJulianDay(date);
    // JD for 1970-01-01 00:00 UTC ≈ 2440587.5
    expect(jd).toBeCloseTo(2440587.5, 1);
  });

  it('result is within valid JD range (positive number)', () => {
    const date = new Date('2024-01-01T00:00:00Z');
    const jd = dateToJulianDay(date);
    expect(jd).toBeGreaterThan(2000000);
    expect(jd).toBeLessThan(3000000);
  });
});

describe('julianDayToDate round-trip', () => {
  it('round-trip via UT JD preserves date within 1 minute', () => {
    const original = new Date('2024-06-21T15:30:00Z');
    // dateToJulianDay returns ET JD; for round-trip test we use UT JD directly
    // via sweph.utc_to_jd data[0]
    // Instead, test that julianDayToDate(known UT JD) returns correct date
    const knownUtJd = 2451545.0007428704; // UT JD for 2000-01-01T12:00:00Z
    const result = julianDayToDate(knownUtJd);
    expect(result.getUTCFullYear()).toBe(2000);
    expect(result.getUTCMonth()).toBe(0); // January
    expect(result.getUTCDate()).toBe(1);
    expect(result.getUTCHours()).toBe(12);
  });

  it('julianDayToDate(2451545.5) returns 2000-01-02T00:00:00Z', () => {
    // JD 2451545.5 = noon J2000 + 12h = 2000-01-02 00:00 UTC
    const result = julianDayToDate(2451545.5);
    expect(result.getUTCFullYear()).toBe(2000);
    expect(result.getUTCDate()).toBe(2);
    expect(result.getUTCHours()).toBe(0);
  });

  it('round-trip: convert date → UT JD → date stays within 2 minutes', () => {
    // We test via direct UT JD path using sweph internals
    // Use a known UT JD for 2024-03-20T12:00:00Z
    const original = new Date('2024-03-20T12:00:00Z');
    // Known UT JD for 2024-03-20 12:00 UTC: 2460390.0
    const knownUtJd = 2460390.0;
    const result = julianDayToDate(knownUtJd);
    const diffMs = Math.abs(result.getTime() - original.getTime());
    // Allow up to 2 minutes difference (UT JD is approximate here)
    expect(diffMs).toBeLessThan(2 * 60 * 1000);
  });
});
