/**
 * T8a — astro-verifier boundary tests for getSunInSignRange + getSunSignForDate.
 *
 * These tests are INDEPENDENT of the 36 fixture suite and focus on:
 * 1. Cross-year sign windows (Sagittarius Dec→Jan)
 * 2. Near-midnight UTC sign boundary crossings
 * 3. Correct sidereal sign for dates the team-lead spec referenced as
 *    "Capricorn Dec→Jan" — clarifying that Dec 30 is sidereal SAGITTARIUS,
 *    not Capricorn (tropical confusion; sidereal Capricorn starts ~Jan 14).
 *
 * QA rationale: wrong sun-sign dates would silently propagate to 24 user-facing
 * pages in ROLE 3. These tests catch cross-year off-by-one bugs that the
 * 36-fixture suite wouldn't surface (it only tests exact ingress moments,
 * not arbitrary dates within/across windows).
 */

import { describe, expect, test } from 'vitest';
import { getSunInSignRange, getSunSignForDate } from '../sun-in-sign-range';

// ---------------------------------------------------------------------------
// Cross-year Sagittarius window (Dec → Jan)
// ---------------------------------------------------------------------------
// Sidereal Lahiri Sagittarius: ~Dec 15 → ~Jan 13 each year.
// The Sun enters Sagittarius in December of year N and exits in January of year N+1.
// `getSunSignForDate()` must use the prior-year range when date is in early January.

describe('Cross-year Sagittarius window (Dec→Jan)', () => {

  test('Dec 30, 2025: sidereal sign is SAGITTARIUS (not Capricorn)', () => {
    // IMPORTANT NOTE: Team-lead instruction referenced "Capricorn Dec→Jan" for this date.
    // Independent sweph verification (astro-verifier T8a) confirms:
    //   sidereal longitude on 2025-12-30 ≈ 254.31° → Sagittarius (240–270°)
    // Sidereal Capricorn starts around 2026-01-14 under Lahiri.
    const date = new Date('2025-12-30T12:00:00Z');
    const result = getSunSignForDate(date);
    expect(result.sign).toBe('sagittarius');
    // Range should start in December 2025 (same year, primary lookup — no fallback needed)
    expect(result.range.start.getUTCFullYear()).toBe(2025);
    expect(result.range.start.getUTCMonth()).toBe(11); // December
    // Range end should be in January 2026
    expect(result.range.end.getUTCFullYear()).toBe(2026);
    expect(result.range.end.getUTCMonth()).toBe(0); // January
    // Date is within the range
    expect(result.range.start.getTime()).toBeLessThanOrEqual(date.getTime());
    expect(result.range.end.getTime()).toBeGreaterThan(date.getTime());
  });

  test('Jan 5, 2026: sidereal sign is SAGITTARIUS with Dec 2025 range (cross-year fallback)', () => {
    // This is the REAL cross-year case: a January date still in the prior Sagittarius window.
    // Primary lookup: getSunInSignRange('sagittarius', 2026) → starts Dec 2026 (FUTURE)
    // Fallback: getSunInSignRange('sagittarius', 2025) → starts Dec 2025, ends Jan 2026 ✓
    const date = new Date('2026-01-05T12:00:00Z');
    const result = getSunSignForDate(date);
    expect(result.sign).toBe('sagittarius');
    // Range must start in December 2025 (prior year)
    expect(result.range.start.getUTCFullYear()).toBe(2025);
    expect(result.range.start.getUTCMonth()).toBe(11); // December
    // Range must end in January 2026
    expect(result.range.end.getUTCFullYear()).toBe(2026);
    // Date must be within the range
    expect(result.range.start.getTime()).toBeLessThanOrEqual(date.getTime());
    expect(result.range.end.getTime()).toBeGreaterThan(date.getTime());
  });

  test('Jan 13, 2026: sidereal sign is still SAGITTARIUS (last day before Capricorn)', () => {
    // Capricorn 2026 ingress: ~2026-01-14T09:35Z. Jan 13 noon is still Sagittarius.
    const date = new Date('2026-01-13T12:00:00Z');
    const result = getSunSignForDate(date);
    expect(result.sign).toBe('sagittarius');
    // Still prior-year range
    expect(result.range.start.getUTCFullYear()).toBe(2025);
  });

  test('Jan 15, 2026: sidereal sign is CAPRICORN (after ingress ~Jan 14)', () => {
    // After the Capricorn ingress (~2026-01-14T09:35Z), Jan 15 noon is Capricorn.
    const date = new Date('2026-01-15T12:00:00Z');
    const result = getSunSignForDate(date);
    expect(result.sign).toBe('capricorn');
    // Capricorn 2026 starts in January 2026
    expect(result.range.start.getUTCFullYear()).toBe(2026);
    expect(result.range.start.getUTCMonth()).toBe(0); // January
  });

  // Verify getSunInSignRange year field is consistent with the start date
  test('getSunInSignRange sagittarius 2025 returns start in December 2025', () => {
    const range = getSunInSignRange('sagittarius', 2025);
    expect(range.sign).toBe('sagittarius');
    expect(range.year).toBe(2025);
    expect(range.start.getUTCFullYear()).toBe(2025);
    expect(range.start.getUTCMonth()).toBe(11); // December
    expect(range.end.getUTCFullYear()).toBe(2026);
    expect(range.end.getUTCMonth()).toBe(0); // January
  });

  test('getSunInSignRange sagittarius 2026 returns start in December 2026', () => {
    const range = getSunInSignRange('sagittarius', 2026);
    expect(range.year).toBe(2026);
    expect(range.start.getUTCFullYear()).toBe(2026);
    expect(range.start.getUTCMonth()).toBe(11); // December
  });
});

// ---------------------------------------------------------------------------
// Near-midnight UTC sign boundary crossings (off-by-one-day risk)
// ---------------------------------------------------------------------------
// The ingress for Aries 2026 is ~2026-04-14T04:00Z (before UTC midnight).
// Dates on either side of midnight near a known ingress test day-boundary handling.

describe('Near-midnight UTC sign boundary crossings', () => {

  // Aries 2026 ingress: ~2026-04-14T04:00Z
  // Apr 13 23:59 UTC → still Pisces
  test('2026-04-13T23:59Z: still Pisces (before Aries 2026 ingress at ~04:00 Apr 14)', () => {
    const date = new Date('2026-04-13T23:59:00Z');
    const result = getSunSignForDate(date);
    expect(result.sign).toBe('pisces');
  });

  // Apr 14 04:30 UTC → should be Aries (30 min after ingress at ~04:00)
  test('2026-04-14T04:30Z: Aries (30 min after Aries 2026 ingress)', () => {
    const date = new Date('2026-04-14T04:30:00Z');
    const result = getSunSignForDate(date);
    expect(result.sign).toBe('aries');
    // Range start is before 04:30
    expect(result.range.start.getTime()).toBeLessThanOrEqual(date.getTime());
  });

  // Capricorn 2026 ingress: ~2026-01-14T09:35Z
  // Jan 14 09:34 UTC → still Sagittarius
  test('2026-01-14T09:34Z: still Sagittarius (1 min before Capricorn 2026 ingress)', () => {
    const date = new Date('2026-01-14T09:34:00Z');
    const result = getSunSignForDate(date);
    expect(result.sign).toBe('sagittarius');
  });

  // Jan 14 09:36 UTC → Capricorn
  test('2026-01-14T09:36Z: Capricorn (1 min after Capricorn 2026 ingress)', () => {
    const date = new Date('2026-01-14T09:36:00Z');
    const result = getSunSignForDate(date);
    expect(result.sign).toBe('capricorn');
  });
});

// ---------------------------------------------------------------------------
// Capricorn sign range correctness (all years, no cross-year issue)
// ---------------------------------------------------------------------------
// Capricorn ingress is always in January, so no cross-year fallback needed.

describe('Capricorn sign range (all in January, no cross-year issue)', () => {

  for (const year of [2024, 2025, 2026]) {
    test(`getSunInSignRange capricorn ${year}: start in January ${year}`, () => {
      const range = getSunInSignRange('capricorn', year);
      expect(range.sign).toBe('capricorn');
      expect(range.year).toBe(year);
      // Start must be in January of the stated year
      expect(range.start.getUTCFullYear()).toBe(year);
      expect(range.start.getUTCMonth()).toBe(0); // January
      // End must be in February of the same year
      expect(range.end.getUTCFullYear()).toBe(year);
      expect(range.end.getUTCMonth()).toBe(1); // February
    });
  }
});
