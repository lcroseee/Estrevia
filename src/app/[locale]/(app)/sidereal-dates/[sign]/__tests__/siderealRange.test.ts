import { describe, it, expect } from 'vitest';
import { formatSiderealDateRange } from '../siderealRange';

const start = new Date(Date.UTC(2026, 7, 10)); // Aug 10
const end = new Date(Date.UTC(2026, 8, 15));   // Sep 15

describe('formatSiderealDateRange', () => {
  it('ES: sign untranslated, months localized, en dash', () => {
    const s = formatSiderealDateRange(start, end, 'Leo', 'es');
    expect(s).toContain('Leo');
    expect(s).toMatch(/ago/i);
    expect(s).toContain('–');
  });
  it('EN: reads naturally', () => {
    const s = formatSiderealDateRange(start, end, 'Leo', 'en');
    expect(s).toContain('Leo');
    expect(s).toMatch(/Aug/);
  });
});
