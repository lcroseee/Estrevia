// ---------------------------------------------------------------------------
// Compatibility pair-slug helpers.
//
// 12 zodiac signs → C(12,2) = 66 distinct-sign pairs + 12 self-pairs = 78
// unique pairs total. Slugs are alphabetically canonicalized to avoid
// /compatibility/aries-leo and /compatibility/leo-aries serving as duplicate
// URLs (SEO-hostile).
//
// Used by /compatibility/[pair] route for generateStaticParams and by
// /compatibility/page.tsx for the index grid.
// ---------------------------------------------------------------------------

export const ZODIAC_SIGNS = [
  'aries',
  'taurus',
  'gemini',
  'cancer',
  'leo',
  'virgo',
  'libra',
  'scorpio',
  'sagittarius',
  'capricorn',
  'aquarius',
  'pisces',
] as const;

export type ZodiacSign = (typeof ZODIAC_SIGNS)[number];

/** All 78 canonical pair slugs (alphabetically sorted within each pair). */
export const ALL_PAIR_SLUGS: readonly string[] = (() => {
  const slugs: string[] = [];
  for (let i = 0; i < ZODIAC_SIGNS.length; i++) {
    for (let j = i; j < ZODIAC_SIGNS.length; j++) {
      const s1 = ZODIAC_SIGNS[i]!;
      const s2 = ZODIAC_SIGNS[j]!;
      // Canonicalize alphabetically so each unordered pair maps to one slug.
      slugs.push(s1 <= s2 ? `${s1}-${s2}` : `${s2}-${s1}`);
    }
  }
  return slugs;
})();

const PAIR_SLUG_SET = new Set<string>(ALL_PAIR_SLUGS);

/** Returns canonical pair slug, alphabetically sorted. */
export function buildPairSlug(s1: ZodiacSign, s2: ZodiacSign): string {
  return s1 <= s2 ? `${s1}-${s2}` : `${s2}-${s1}`;
}

/** Returns [sign1, sign2] tuple if slug is canonical+valid, else null. */
export function parsePairSlug(slug: string): readonly [ZodiacSign, ZodiacSign] | null {
  if (!PAIR_SLUG_SET.has(slug)) return null;
  const [a, b] = slug.split('-');
  return [a as ZodiacSign, b as ZodiacSign];
}

export function isValidPairSlug(slug: string): boolean {
  return PAIR_SLUG_SET.has(slug);
}
