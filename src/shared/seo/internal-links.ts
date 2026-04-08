/**
 * Internal linking configuration for Estrevia.
 *
 * Rules:
 * - Every essay page links to 3-5 contextually relevant pages
 * - Every sign page links to all 10 planet-in-sign essays for that sign
 * - Pillar pages link to all cluster pages
 * - Anchor text must be descriptive (not "click here")
 * - Vary anchor text to avoid over-optimization
 */

// ---------------------------------------------------------------------------
// Constants — all slugs in one place to catch typos at compile time
// ---------------------------------------------------------------------------

const PLANETS = [
  'sun',
  'moon',
  'mercury',
  'venus',
  'mars',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
  'pluto',
] as const;

const SIGNS = [
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

type PlanetSlug = (typeof PLANETS)[number];
type SignSlug = (typeof SIGNS)[number];

// Ruling planets by sign (traditional + modern where applicable)
const RULING_PLANET: Record<SignSlug, PlanetSlug> = {
  aries: 'mars',
  taurus: 'venus',
  gemini: 'mercury',
  cancer: 'moon',
  leo: 'sun',
  virgo: 'mercury',
  libra: 'venus',
  scorpio: 'pluto',
  sagittarius: 'jupiter',
  capricorn: 'saturn',
  aquarius: 'uranus',
  pisces: 'neptune',
};

// Next sign in zodiac wheel (for "same planet, next sign" links)
const NEXT_SIGN: Record<SignSlug, SignSlug> = {
  aries: 'taurus',
  taurus: 'gemini',
  gemini: 'cancer',
  cancer: 'leo',
  leo: 'virgo',
  virgo: 'libra',
  libra: 'scorpio',
  scorpio: 'sagittarius',
  sagittarius: 'capricorn',
  capricorn: 'aquarius',
  aquarius: 'pisces',
  pisces: 'aries',
};

// Display names
const PLANET_DISPLAY: Record<PlanetSlug, string> = {
  sun: 'Sun',
  moon: 'Moon',
  mercury: 'Mercury',
  venus: 'Venus',
  mars: 'Mars',
  jupiter: 'Jupiter',
  saturn: 'Saturn',
  uranus: 'Uranus',
  neptune: 'Neptune',
  pluto: 'Pluto',
};

const SIGN_DISPLAY: Record<SignSlug, string> = {
  aries: 'Aries',
  taurus: 'Taurus',
  gemini: 'Gemini',
  cancer: 'Cancer',
  leo: 'Leo',
  virgo: 'Virgo',
  libra: 'Libra',
  scorpio: 'Scorpio',
  sagittarius: 'Sagittarius',
  capricorn: 'Capricorn',
  aquarius: 'Aquarius',
  pisces: 'Pisces',
};

// ---------------------------------------------------------------------------
// Related page link type
// ---------------------------------------------------------------------------

export interface RelatedPage {
  title: string;
  href: string;
  /** Suggested anchor text for inline contextual linking */
  anchorText: string;
}

// ---------------------------------------------------------------------------
// Essay slug parsing
// ---------------------------------------------------------------------------

/**
 * Parses a planet-in-sign essay slug.
 * Returns planet and sign slugs, or null if slug doesn't match the pattern.
 *
 * @example parseEssaySlug('sun-in-aries') // { planet: 'sun', sign: 'aries' }
 */
export function parseEssaySlug(slug: string): { planet: PlanetSlug; sign: SignSlug } | null {
  const match = slug.match(/^([a-z]+)-in-([a-z]+)$/);
  if (!match) return null;

  const planet = match[1] as PlanetSlug;
  const sign = match[2] as SignSlug;

  if (!PLANETS.includes(planet as PlanetSlug)) return null;
  if (!SIGNS.includes(sign as SignSlug)) return null;

  return { planet, sign };
}

// ---------------------------------------------------------------------------
// Related pages for essay pages (/essays/[planet]-in-[sign])
// ---------------------------------------------------------------------------

/**
 * Returns 3-5 related internal pages for a planet-in-sign essay.
 * Links include:
 *  1. Same sign, different planet (Moon in [sign] — for same-sign clustering)
 *  2. Same planet, next sign (Sun in [next sign])
 *  3. Sign overview page
 *  4. Ruling planet page
 *  5. Sidereal vs tropical pillar page
 */
function getEssayRelatedPages(planet: PlanetSlug, sign: SignSlug): RelatedPage[] {
  const planetDisplay = PLANET_DISPLAY[planet];
  const signDisplay = SIGN_DISPLAY[sign];
  const nextSign = NEXT_SIGN[sign];
  const rulingPlanet = RULING_PLANET[sign];

  const related: RelatedPage[] = [];

  // 1. Same sign, different planet — prefer Moon for Sun, Sun for Moon
  const companionPlanet = planet === 'moon' ? 'sun' : 'moon';
  related.push({
    title: `${PLANET_DISPLAY[companionPlanet]} in sidereal ${signDisplay}`,
    href: `/essays/${companionPlanet}-in-${sign}`,
    anchorText: `${PLANET_DISPLAY[companionPlanet]} in sidereal ${signDisplay}`,
  });

  // 2. Same planet, next sign
  related.push({
    title: `${planetDisplay} in sidereal ${SIGN_DISPLAY[nextSign]}`,
    href: `/essays/${planet}-in-${nextSign}`,
    anchorText: `${planetDisplay} in sidereal ${SIGN_DISPLAY[nextSign]}`,
  });

  // 3. Sign overview page
  related.push({
    title: `Sidereal ${signDisplay} — sign overview`,
    href: `/signs/${sign}`,
    anchorText: `sidereal ${signDisplay}`,
  });

  // 4. Ruling planet page (skip if it's the same as the essay planet)
  if (rulingPlanet !== planet) {
    related.push({
      title: `${PLANET_DISPLAY[rulingPlanet]} in astrology`,
      href: `/planets/${rulingPlanet}`,
      anchorText: `${PLANET_DISPLAY[rulingPlanet]}, the ruler of ${signDisplay},`,
    });
  }

  // 5. Sidereal vs tropical pillar — always included
  related.push({
    title: 'Sidereal vs tropical astrology — key differences',
    href: '/sidereal-vs-tropical',
    anchorText: 'sidereal vs tropical astrology',
  });

  return related;
}

// ---------------------------------------------------------------------------
// Related pages for sign overview pages (/signs/[sign])
// ---------------------------------------------------------------------------

/**
 * Returns related pages for a sign overview page.
 * Links to all 10 planet essays for that sign + chart calculator CTA.
 */
function getSignRelatedPages(sign: SignSlug): RelatedPage[] {
  const signDisplay = SIGN_DISPLAY[sign];

  const related: RelatedPage[] = PLANETS.map((planet) => ({
    title: `${PLANET_DISPLAY[planet]} in sidereal ${signDisplay}`,
    href: `/essays/${planet}-in-${sign}`,
    anchorText: `${PLANET_DISPLAY[planet]} in sidereal ${signDisplay}`,
  }));

  related.push({
    title: 'Calculate your sidereal natal chart',
    href: '/chart',
    anchorText: 'calculate your sidereal natal chart',
  });

  return related;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns 3-5 related internal pages for a given slug.
 *
 * Supports:
 * - Essay slugs: 'sun-in-aries', 'moon-in-scorpio', etc.
 * - Sign slugs: 'aries', 'scorpio', etc.
 *
 * Returns empty array for unknown slugs — callers should handle gracefully.
 *
 * @example
 * const links = getRelatedPages('sun-in-aries');
 * // Use in essay page for contextual internal linking
 */
export function getRelatedPages(slug: string): RelatedPage[] {
  // Essay page: planet-in-sign
  const essayMatch = parseEssaySlug(slug);
  if (essayMatch) {
    return getEssayRelatedPages(essayMatch.planet, essayMatch.sign);
  }

  // Sign overview page
  if (SIGNS.includes(slug as SignSlug)) {
    return getSignRelatedPages(slug as SignSlug);
  }

  return [];
}

/**
 * Returns all essay slugs for a given sign.
 * Used for sign overview pages to build their internal link section.
 *
 * @example getAllEssaySlugsBySign('aries')
 * // ['sun-in-aries', 'moon-in-aries', ..., 'pluto-in-aries']
 */
export function getAllEssaySlugsBySign(sign: SignSlug): string[] {
  return PLANETS.map((planet) => `${planet}-in-${sign}`);
}

/**
 * Returns all essay slugs for a given planet.
 * Used for planet overview pages.
 *
 * @example getAllEssaySlugsByPlanet('sun')
 * // ['sun-in-aries', 'sun-in-taurus', ..., 'sun-in-pisces']
 */
export function getAllEssaySlugsByPlanet(planet: PlanetSlug): string[] {
  return SIGNS.map((sign) => `${planet}-in-${sign}`);
}

/**
 * Returns all 120 essay slugs (10 planets × 12 signs).
 * Used by sitemap.ts to generate the complete list of essay URLs.
 */
export function getAllEssaySlugs(): string[] {
  return PLANETS.flatMap((planet) => SIGNS.map((sign) => `${planet}-in-${sign}`));
}

/**
 * Returns all sign slugs.
 * Used by sitemap.ts to generate sign overview URLs.
 */
export function getAllSignSlugs(): string[] {
  return [...SIGNS];
}

// Export planet/sign slug arrays for use in generateStaticParams
export { PLANETS, SIGNS };
export type { PlanetSlug, SignSlug };
