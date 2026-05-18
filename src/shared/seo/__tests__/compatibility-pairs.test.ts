import { describe, it, expect } from 'vitest';
import {
  ALL_PAIR_SLUGS,
  parsePairSlug,
  buildPairSlug,
  isValidPairSlug,
} from '../compatibility-pairs';

describe('compatibility-pairs', () => {
  it('generates exactly 78 unique pair slugs', () => {
    expect(ALL_PAIR_SLUGS.length).toBe(78);
    expect(new Set(ALL_PAIR_SLUGS).size).toBe(78);
  });

  it('all slugs are alphabetically canonicalized (sign1 ≤ sign2)', () => {
    for (const slug of ALL_PAIR_SLUGS) {
      const [a, b] = slug.split('-');
      expect(a! <= b!).toBe(true);
    }
  });

  it('includes all 12 self-pairs', () => {
    const selfPairs = ALL_PAIR_SLUGS.filter((s) => s.split('-')[0] === s.split('-')[1]);
    expect(selfPairs.length).toBe(12);
    expect(selfPairs).toContain('aries-aries');
    expect(selfPairs).toContain('pisces-pisces');
  });

  it('does NOT include reversed duplicates', () => {
    expect(ALL_PAIR_SLUGS).toContain('aries-leo');
    expect(ALL_PAIR_SLUGS).not.toContain('leo-aries');
  });

  it('parsePairSlug returns sorted [sign1, sign2]', () => {
    expect(parsePairSlug('aries-leo')).toEqual(['aries', 'leo']);
    expect(parsePairSlug('leo-aries')).toBeNull(); // canonical only
  });

  it('parsePairSlug returns null for invalid slug', () => {
    expect(parsePairSlug('aries-invalid')).toBeNull();
    expect(parsePairSlug('not-a-slug')).toBeNull();
    expect(parsePairSlug('aries')).toBeNull();
  });

  it('buildPairSlug returns canonical (alphabetically sorted)', () => {
    expect(buildPairSlug('leo', 'aries')).toBe('aries-leo');
    expect(buildPairSlug('aries', 'leo')).toBe('aries-leo');
    expect(buildPairSlug('aries', 'aries')).toBe('aries-aries');
  });

  it('isValidPairSlug accepts all 78 + rejects invalid', () => {
    for (const slug of ALL_PAIR_SLUGS) {
      expect(isValidPairSlug(slug)).toBe(true);
    }
    expect(isValidPairSlug('leo-aries')).toBe(false);
    expect(isValidPairSlug('aries-invalid')).toBe(false);
    expect(isValidPairSlug('')).toBe(false);
  });
});
