/**
 * Tests for timezoneSchema in src/shared/validation/common.ts
 *
 * Validates that the regex accepts the full range of valid IANA timezone identifiers,
 * including Etc/GMT+N forms that were previously rejected.
 */

import { describe, it, expect } from 'vitest';
import { timezoneSchema } from '../../src/shared/validation/common';

describe('timezoneSchema', () => {
  // Standard multi-component zones
  it('accepts America/New_York', () => {
    expect(timezoneSchema.safeParse('America/New_York').success).toBe(true);
  });

  it('accepts Europe/London', () => {
    expect(timezoneSchema.safeParse('Europe/London').success).toBe(true);
  });

  it('accepts Asia/Kolkata', () => {
    expect(timezoneSchema.safeParse('Asia/Kolkata').success).toBe(true);
  });

  it('accepts Africa/Johannesburg', () => {
    expect(timezoneSchema.safeParse('Africa/Johannesburg').success).toBe(true);
  });

  it('accepts Australia/Sydney', () => {
    expect(timezoneSchema.safeParse('Australia/Sydney').success).toBe(true);
  });

  // Numeric offset zones — previously rejected by the old regex
  it('accepts Etc/GMT+5', () => {
    expect(timezoneSchema.safeParse('Etc/GMT+5').success).toBe(true);
  });

  it('accepts Etc/GMT-12', () => {
    expect(timezoneSchema.safeParse('Etc/GMT-12').success).toBe(true);
  });

  it('accepts Etc/GMT+0', () => {
    expect(timezoneSchema.safeParse('Etc/GMT+0').success).toBe(true);
  });

  it('accepts Etc/GMT+12', () => {
    expect(timezoneSchema.safeParse('Etc/GMT+12').success).toBe(true);
  });

  it('accepts Etc/GMT-1', () => {
    expect(timezoneSchema.safeParse('Etc/GMT-1').success).toBe(true);
  });

  // UTC and GMT singletons
  it('accepts UTC', () => {
    expect(timezoneSchema.safeParse('UTC').success).toBe(true);
  });

  it('accepts Etc/UTC', () => {
    expect(timezoneSchema.safeParse('Etc/UTC').success).toBe(true);
  });

  // Legacy aliases
  it('accepts US/Eastern', () => {
    expect(timezoneSchema.safeParse('US/Eastern').success).toBe(true);
  });

  it('accepts US/Pacific', () => {
    expect(timezoneSchema.safeParse('US/Pacific').success).toBe(true);
  });

  // Multi-level zones
  it('accepts America/Indiana/Indianapolis', () => {
    expect(timezoneSchema.safeParse('America/Indiana/Indianapolis').success).toBe(true);
  });

  it('accepts America/Kentucky/Louisville', () => {
    expect(timezoneSchema.safeParse('America/Kentucky/Louisville').success).toBe(true);
  });

  // Invalid inputs that should be rejected
  it('rejects empty string', () => {
    expect(timezoneSchema.safeParse('').success).toBe(false);
  });

  it('rejects plain number "5"', () => {
    expect(timezoneSchema.safeParse('5').success).toBe(false);
  });

  it('rejects whitespace-only string', () => {
    expect(timezoneSchema.safeParse('   ').success).toBe(false);
  });

  it('rejects string with spaces "America New_York"', () => {
    expect(timezoneSchema.safeParse('America New_York').success).toBe(false);
  });

  it('rejects injection attempt "America/New_York; DROP TABLE"', () => {
    expect(timezoneSchema.safeParse('America/New_York; DROP TABLE').success).toBe(false);
  });
});
