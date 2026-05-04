import { describe, it, expect } from 'vitest';
import { classifyMaturity } from '../data-maturity-classifier';

const baseInput = {
  conversions_total_meta: 0,
  days_with_pixel_data: 0,
  baseline_cv: 0,
};

describe('classifyMaturity', () => {
  it('returns COLD_START when below conversion threshold', () => {
    expect(
      classifyMaturity({
        ...baseInput,
        conversions_total_meta: 49,
        days_with_pixel_data: 100,
      }),
    ).toBe('COLD_START');
  });

  it('returns COLD_START when below days threshold (even with enough conversions)', () => {
    expect(
      classifyMaturity({
        ...baseInput,
        conversions_total_meta: 1000,
        days_with_pixel_data: 13,
      }),
    ).toBe('COLD_START');
  });

  it('graduates to CALIBRATING at 50 conversions AND 14 days', () => {
    expect(
      classifyMaturity({
        ...baseInput,
        conversions_total_meta: 50,
        days_with_pixel_data: 14,
        baseline_cv: 1.0,
      }),
    ).toBe('CALIBRATING');
  });

  it('stays in CALIBRATING when below 500 conversions', () => {
    expect(
      classifyMaturity({
        conversions_total_meta: 499,
        days_with_pixel_data: 200,
        baseline_cv: 0.1,
      }),
    ).toBe('CALIBRATING');
  });

  it('stays in CALIBRATING when CV is too high (volatile)', () => {
    expect(
      classifyMaturity({
        conversions_total_meta: 1000,
        days_with_pixel_data: 100,
        baseline_cv: 0.6,
      }),
    ).toBe('CALIBRATING');
  });

  it('graduates to AUTONOMOUS when conversions ≥500 AND days ≥60 AND CV ≤0.5', () => {
    expect(
      classifyMaturity({
        conversions_total_meta: 500,
        days_with_pixel_data: 60,
        baseline_cv: 0.5,
      }),
    ).toBe('AUTONOMOUS');
    expect(
      classifyMaturity({
        conversions_total_meta: 800,
        days_with_pixel_data: 90,
        baseline_cv: 0.3,
      }),
    ).toBe('AUTONOMOUS');
  });

  it('handles boundary: exactly at COLD_START threshold (50/14) → CALIBRATING', () => {
    expect(
      classifyMaturity({
        conversions_total_meta: 50,
        days_with_pixel_data: 14,
        baseline_cv: 1.0,
      }),
    ).toBe('CALIBRATING');
  });
});
