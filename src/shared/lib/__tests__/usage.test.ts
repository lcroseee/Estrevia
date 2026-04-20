import { describe, it, expect } from 'vitest';
import { computePeriodKey } from '../usage';

describe('computePeriodKey', () => {
  it('returns YYYY-MM-DD for daily period', () => {
    const date = new Date('2026-04-19T15:30:00Z');
    expect(computePeriodKey('day', date)).toBe('2026-04-19');
  });

  it('returns YYYY-MM for monthly period', () => {
    const date = new Date('2026-04-19T15:30:00Z');
    expect(computePeriodKey('month', date)).toBe('2026-04');
  });

  it('uses UTC date boundaries (not local)', () => {
    // 2026-04-19T23:30:00Z is still April 19 in UTC
    const date = new Date('2026-04-19T23:30:00Z');
    expect(computePeriodKey('day', date)).toBe('2026-04-19');
  });

  it('pads month and day with leading zeros', () => {
    const date = new Date('2026-01-05T12:00:00Z');
    expect(computePeriodKey('day', date)).toBe('2026-01-05');
    expect(computePeriodKey('month', date)).toBe('2026-01');
  });

  it('defaults `now` to current Date when omitted', () => {
    const result = computePeriodKey('day');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
