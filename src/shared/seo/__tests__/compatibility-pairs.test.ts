import { describe, it, expect } from 'vitest';
import {
  ALL_PAIR_SLUGS,
  parsePairSlug,
  buildPairSlug,
  isValidPairSlug,
  ENRICHED_PAIRS,
  isEnrichedPair,
  isEnrichedLocaleValid,
  isPurePlaceholderStub,
  countWords,
  ENRICHMENT_PLACEHOLDER,
  type EnrichedPairLocaleContent,
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

describe('ENRICHED_PAIRS allowlist (Phase 2 T7)', () => {
  it('is exactly 12 unique canonical DISTINCT-sign slugs, all in ALL_PAIR_SLUGS', () => {
    expect(ENRICHED_PAIRS).toHaveLength(12);
    expect(new Set(ENRICHED_PAIRS).size).toBe(12);
    for (const s of ENRICHED_PAIRS) {
      expect(ALL_PAIR_SLUGS).toContain(s);
      const [a, b] = s.split('-');
      expect(a! < b!).toBe(true); // canonical AND distinct signs (excludes self-pairs)
    }
  });

  it('isEnrichedPair matches the allowlist only', () => {
    expect(isEnrichedPair('aries-leo')).toBe(true);
    expect(isEnrichedPair('aries-aries')).toBe(false);
    expect(isEnrichedPair('leo-aries')).toBe(false); // non-canonical
  });
});

function validLc(): EnrichedPairLocaleContent {
  return {
    h1: 'Aries and Leo Compatibility: Sidereal Fire Trine',
    metaTitle: 'Aries and Leo Compatibility (Sidereal)',
    metaDescription: 'How Aries and Leo match in sidereal astrology — element, aspect, love.',
    intro: Array(60).fill('word').join(' '),
    sections: [
      { heading: 'Relationship dynamics', body: Array(120).fill('word').join(' ') },
      { heading: 'Love, friendship and work', body: Array(120).fill('word').join(' ') },
      { heading: 'The sidereal angle', body: Array(60).fill('word').join(' ') },
    ],
    faq: [
      { question: 'Are Aries and Leo compatible?', answer: 'Yes, they share fire.' },
      { question: 'Do they clash?', answer: 'Rarely, both lead.' },
      { question: 'Best for love or work?', answer: 'Both, with respect.' },
    ],
  };
}

describe('isEnrichedLocaleValid (the index gate)', () => {
  it('accepts >=300 words, placeholder-free, >=3 sections + >=3 faq', () => {
    expect(isEnrichedLocaleValid(validLc())).toBe(true);
  });
  it('rejects a surviving placeholder sentinel', () => {
    const lc = validLc();
    lc.sections[0]!.body = ENRICHMENT_PLACEHOLDER;
    expect(isEnrichedLocaleValid(lc)).toBe(false);
  });
  it('rejects under 300 words', () => {
    const lc = validLc();
    lc.intro = 'short';
    lc.sections = lc.sections.map((s) => ({ ...s, body: 'short' }));
    lc.faq = lc.faq.map((f) => ({ ...f, answer: 'x' }));
    expect(isEnrichedLocaleValid(lc)).toBe(false);
  });
  it('rejects fewer than 3 sections or 3 faq', () => {
    const a = validLc(); a.sections = a.sections.slice(0, 2);
    expect(isEnrichedLocaleValid(a)).toBe(false);
    const b = validLc(); b.faq = b.faq.slice(0, 2);
    expect(isEnrichedLocaleValid(b)).toBe(false);
  });
  it('rejects null / undefined', () => {
    expect(isEnrichedLocaleValid(null)).toBe(false);
    expect(isEnrichedLocaleValid(undefined)).toBe(false);
  });
});

describe('isPurePlaceholderStub', () => {
  it('is true when every string equals the sentinel', () => {
    const lc = validLc();
    lc.h1 = lc.metaTitle = lc.metaDescription = lc.intro = ENRICHMENT_PLACEHOLDER;
    lc.sections = lc.sections.map(() => ({ heading: ENRICHMENT_PLACEHOLDER, body: ENRICHMENT_PLACEHOLDER }));
    lc.faq = lc.faq.map(() => ({ question: ENRICHMENT_PLACEHOLDER, answer: ENRICHMENT_PLACEHOLDER }));
    expect(isPurePlaceholderStub(lc)).toBe(true);
  });
  it('is false for authored content', () => {
    expect(isPurePlaceholderStub(validLc())).toBe(false);
  });
});

describe('countWords', () => {
  it('counts whitespace-separated tokens, tolerant of padding', () => {
    expect(countWords('  hola  mundo sideral ')).toBe(3);
    expect(countWords('')).toBe(0);
  });
});
