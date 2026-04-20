import { describe, it, expect } from 'vitest';
import { chartCalculateSchema } from '../../src/shared/validation/chart';
import { HouseSystem } from '../../src/shared/types/astrology';

const baseInput = {
  date: '2000-06-23',
  time: '12:00',
  latitude: 55.02259,
  longitude: 82.93175,
  timezone: 'Asia/Novosibirsk',
} as const;

describe('chartCalculateSchema', () => {
  it('accepts null houseSystem (no birth time case) and defaults to Placidus', () => {
    const result = chartCalculateSchema.safeParse({ ...baseInput, houseSystem: null });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.houseSystem).toBe(HouseSystem.Placidus);
    }
  });

  it('defaults missing houseSystem to Placidus', () => {
    const result = chartCalculateSchema.safeParse(baseInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.houseSystem).toBe(HouseSystem.Placidus);
    }
  });

  it('preserves an explicit valid houseSystem', () => {
    const result = chartCalculateSchema.safeParse({
      ...baseInput,
      houseSystem: HouseSystem.WholeSigns,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.houseSystem).toBe(HouseSystem.WholeSigns);
    }
  });

  it('rejects an unknown houseSystem string', () => {
    const result = chartCalculateSchema.safeParse({
      ...baseInput,
      houseSystem: 'Bogus',
    });
    expect(result.success).toBe(false);
  });
});
