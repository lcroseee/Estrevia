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

// ---------------------------------------------------------------------------
// Phase 2 (T7) — enrichment allowlist + content validators.
//
// The 12 highest-intent pairs are enriched to 300+ unique words and RE-INDEXED;
// the other 144 stay noindex (Phase 1 T2). A pair only actually flips to
// index:true + re-enters the sitemap once BOTH locales of
// content/compatibility/enriched/<pair>.json pass validation — see
// compatibility-content.ts (isPairReady). Until then the pair renders the thin
// template + noindex, so this whole mechanism ships dormant (green CI) and each
// pair auto-flips when the founder authors its file.
// ---------------------------------------------------------------------------

/** Canonical (alphabetized), DISTINCT-sign slugs — all present in ALL_PAIR_SLUGS. */
export const ENRICHED_PAIRS: readonly string[] = [
  'aries-leo',
  'aries-libra',
  'aquarius-libra',
  'cancer-pisces',
  'cancer-scorpio',
  'capricorn-taurus',
  'gemini-libra',
  'gemini-sagittarius',
  'leo-sagittarius',
  'leo-scorpio',
  'pisces-scorpio',
  'scorpio-taurus',
];

const ENRICHED_PAIR_SET = new Set<string>(ENRICHED_PAIRS);

export function isEnrichedPair(slug: string): boolean {
  return ENRICHED_PAIR_SET.has(slug);
}

/** Sentinel that marks a not-yet-authored field in a scaffolded content file. */
export const ENRICHMENT_PLACEHOLDER = '__PLACEHOLDER__';
/** A locale is index-worthy only above this word count. */
export const MIN_ENRICHED_WORDS = 300;

export interface EnrichedSection {
  heading: string;
  body: string;
}

export interface EnrichedFaqItem {
  question: string;
  answer: string;
}

export interface EnrichedPairLocaleContent {
  h1: string;
  metaTitle: string;
  metaDescription: string;
  intro: string;
  sections: EnrichedSection[];
  faq: EnrichedFaqItem[];
}

export interface EnrichedPairContent {
  updatedAt: string;
  en: EnrichedPairLocaleContent;
  es: EnrichedPairLocaleContent;
}

/** Count whitespace-separated tokens (empty string → 0). */
export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Every user-visible string in a locale block, flattened. */
function collectLocaleStrings(lc: EnrichedPairLocaleContent): string[] {
  return [
    lc.h1,
    lc.metaTitle,
    lc.metaDescription,
    lc.intro,
    ...lc.sections.flatMap((s) => [s.heading, s.body]),
    ...lc.faq.flatMap((f) => [f.question, f.answer]),
  ];
}

/** True when EVERY string is exactly the sentinel — a clean, un-authored stub. */
export function isPurePlaceholderStub(lc: EnrichedPairLocaleContent): boolean {
  const strings = collectLocaleStrings(lc);
  return strings.length > 0 && strings.every((s) => s === ENRICHMENT_PLACEHOLDER);
}

/** The indexing gate: authored, placeholder-free, structurally complete, 300+ words. */
export function isEnrichedLocaleValid(
  lc: EnrichedPairLocaleContent | null | undefined,
): boolean {
  if (!lc || !Array.isArray(lc.sections) || !Array.isArray(lc.faq)) return false;
  if (collectLocaleStrings(lc).some((s) => s.includes(ENRICHMENT_PLACEHOLDER))) return false;
  if (lc.sections.length < 3 || lc.faq.length < 3) return false;
  const prose = [lc.intro, ...lc.sections.map((s) => s.body), ...lc.faq.map((f) => f.answer)].join(' ');
  return countWords(prose) >= MIN_ENRICHED_WORDS;
}
