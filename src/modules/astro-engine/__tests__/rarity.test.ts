import { describe, expect, it, expectTypeOf } from 'vitest';
import { getRarityTier, type RarityTier } from '../rarity';

describe('getRarityTier — returns typed keys (not display literals)', () => {
  describe('weight buckets', () => {
    it('returns "exceptional" for weight < 5', () => {
      expect(getRarityTier(4.0)).toBe('exceptional');
      expect(getRarityTier(4.99)).toBe('exceptional');
    });

    it('returns "veryRare" for 5 <= weight < 6', () => {
      expect(getRarityTier(5.0)).toBe('veryRare');
      expect(getRarityTier(5.999)).toBe('veryRare');
    });

    it('returns "rare" for 6 <= weight < 7.5', () => {
      expect(getRarityTier(6.0)).toBe('rare');
      expect(getRarityTier(7.49)).toBe('rare');
    });

    it('returns "uncommon" for weight >= 7.5', () => {
      expect(getRarityTier(7.5)).toBe('uncommon');
      expect(getRarityTier(9.3)).toBe('uncommon');
    });
  });

  describe('boundary values', () => {
    it('classifies the rarity-table extremes correctly', () => {
      expect(getRarityTier(4.0)).toBe('exceptional');
      expect(getRarityTier(9.3)).toBe('uncommon');
    });
  });
});

describe('RarityTier type contract', () => {
  it('is exactly the four key union (not display literals)', () => {
    expectTypeOf<RarityTier>().toEqualTypeOf<
      'exceptional' | 'veryRare' | 'rare' | 'uncommon'
    >();
  });
});
