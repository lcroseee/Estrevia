import { describe, expect, test } from 'vitest';
import { getSunInSignRange, getSunSignForDate } from '../sun-in-sign-range';
import fixturesData from '../../../../tmp/baselines/sun-sign-fixtures.json';

interface Fixture {
  year: number;
  sign: string;
  sunEntersUtc: string;
}

const fixtures = fixturesData.fixtures as Fixture[];

describe('getSunInSignRange — Lahiri ayanamsa', () => {
  for (const fx of fixtures) {
    test(`Sun enters sidereal ${fx.sign} in ${fx.year} at ${fx.sunEntersUtc} (±30 min)`, () => {
      const range = getSunInSignRange(fx.sign as Parameters<typeof getSunInSignRange>[0], fx.year);
      expect(range.sign).toBe(fx.sign);
      expect(range.year).toBe(fx.year);
      expect(range.ayanamsa).toBe('lahiri');
      expect(range.start).toBeInstanceOf(Date);
      expect(range.end).toBeInstanceOf(Date);

      const expected = new Date(fx.sunEntersUtc).getTime();
      const actual = range.start.getTime();
      const diffMin = Math.abs(actual - expected) / 60_000;
      expect(diffMin, `${fx.sign} ${fx.year}: diff was ${diffMin.toFixed(1)} min`).toBeLessThanOrEqual(30);

      // end must be after start
      expect(range.end.getTime()).toBeGreaterThan(range.start.getTime());
      // sign window is ~29-31 days
      const durationDays = (range.end.getTime() - range.start.getTime()) / 86_400_000;
      expect(durationDays, `${fx.sign} ${fx.year}: duration ${durationDays.toFixed(1)}d`).toBeGreaterThan(27);
      expect(durationDays, `${fx.sign} ${fx.year}: duration ${durationDays.toFixed(1)}d`).toBeLessThan(33);
    });
  }
});

describe('getSunSignForDate', () => {
  test('returns aries for a date in mid-aries window 2026', () => {
    const date = new Date('2026-04-25T12:00:00Z');
    const result = getSunSignForDate(date);
    expect(result.sign).toBe('aries');
    expect(result.range.start.getTime()).toBeLessThanOrEqual(date.getTime());
    expect(result.range.end.getTime()).toBeGreaterThan(date.getTime());
  });

  test('returns capricorn for Jan 20 2025 (cross-year window check)', () => {
    const date = new Date('2025-01-20T12:00:00Z');
    const result = getSunSignForDate(date);
    expect(result.sign).toBe('capricorn');
    // Capricorn 2025 starts Jan 14 2025 — within the window
    expect(result.range.start.getTime()).toBeLessThanOrEqual(date.getTime());
    expect(result.range.end.getTime()).toBeGreaterThan(date.getTime());
  });

  test('returns pisces for Mar 17 2026 (Pisces 2026 starts Mar 14)', () => {
    // Pisces 2026 ingress: 2026-03-14T19:31:00Z — Mar 17 is clearly within window
    const date = new Date('2026-03-17T12:00:00Z');
    const result = getSunSignForDate(date);
    expect(result.sign).toBe('pisces');
  });

  test('returns sagittarius for Dec 20 2025', () => {
    const date = new Date('2025-12-20T12:00:00Z');
    const result = getSunSignForDate(date);
    expect(result.sign).toBe('sagittarius');
  });
});
