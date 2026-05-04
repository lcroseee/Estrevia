import { describe, it, expect } from 'vitest';
import { calculateBaseline, trimOutliers } from '../baseline-calculator';

describe('trimOutliers', () => {
  it('removes top and bottom N% of sorted values', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const trimmed = trimOutliers(values, 0.10);
    // 10% means drop 1 from each end → [2..9]
    expect(trimmed).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('returns the input unchanged when pct=0', () => {
    expect(trimOutliers([3, 1, 2], 0)).toEqual([1, 2, 3]); // sorted
  });

  it('drops the right number for 20% trim of 10 values', () => {
    const values = Array.from({ length: 10 }, (_, i) => i);
    const trimmed = trimOutliers(values, 0.20);
    expect(trimmed).toEqual([2, 3, 4, 5, 6, 7]);
  });

  it('returns [] when all values are trimmed (small input)', () => {
    expect(trimOutliers([1, 2], 0.50)).toEqual([]);
  });
});

describe('calculateBaseline', () => {
  it('computes mean / stddev / percentiles for a uniform sequence', () => {
    const b = calculateBaseline([1, 2, 3, 4, 5]);
    expect(b.mean).toBeCloseTo(3);
    // population stddev of 1..5 = sqrt((4+1+0+1+4)/5)=sqrt(2)
    expect(b.stddev).toBeCloseTo(Math.sqrt(2));
    expect(b.p25).toBeCloseTo(2);
    expect(b.p50).toBe(3);
    expect(b.p75).toBeCloseTo(4);
    expect(b.sample_count).toBe(5);
  });

  it('handles single-value input', () => {
    const b = calculateBaseline([7]);
    expect(b.mean).toBe(7);
    expect(b.stddev).toBe(0);
    expect(b.p25).toBe(7);
    expect(b.p75).toBe(7);
  });

  it('returns a sentinel-style baseline for empty input', () => {
    const b = calculateBaseline([]);
    expect(b.sample_count).toBe(0);
    expect(b.mean).toBe(0);
    expect(b.stddev).toBe(0);
  });

  it('coefficient-of-variation property (stddev / mean) is computable', () => {
    const b = calculateBaseline([10, 12, 14, 16, 18]);
    expect(b.mean).toBeCloseTo(14);
    expect(b.stddev).toBeGreaterThan(0);
    expect(b.stddev / b.mean).toBeGreaterThan(0);
    expect(b.stddev / b.mean).toBeLessThan(1);
  });
});
