/**
 * RelatedPlacements — server-rendered internal-link block (Phase 2 T9).
 *
 * Renders a set of planet-in-sign essay slugs as localized <Link> anchors.
 * Reused on three surfaces: the essay page (the 6-8 sibling mesh, rendered
 * OUTSIDE the paywall so anchors are always in SSR HTML + visible), the /es/
 * landing page, and planetary-hours city pages (Sun-cluster entry links). All
 * seed crawl equity into the essay cluster (audit finding #4).
 *
 * Anchor text follows the project i18n rule: planet names translated, sign
 * names untranslated.
 */

import { Link } from '@/i18n/navigation';
import { getTranslations } from 'next-intl/server';
import { parseEssaySlug } from '@/shared/seo';

// Sign display names stay untranslated (project rule).
const SIGN_DISPLAY: Record<string, string> = {
  aries: 'Aries', taurus: 'Taurus', gemini: 'Gemini', cancer: 'Cancer',
  leo: 'Leo', virgo: 'Virgo', libra: 'Libra', scorpio: 'Scorpio',
  sagittarius: 'Sagittarius', capricorn: 'Capricorn', aquarius: 'Aquarius', pisces: 'Pisces',
};

// Slug -> essayDetail.planets message key (planet names ARE translated).
const PLANET_KEY: Record<string, string> = {
  sun: 'Sun', moon: 'Moon', mercury: 'Mercury', venus: 'Venus', mars: 'Mars',
  jupiter: 'Jupiter', saturn: 'Saturn', uranus: 'Uranus', neptune: 'Neptune', pluto: 'Pluto',
};

interface RelatedPlacementsProps {
  /** planet-in-sign essay slugs to link to. */
  slugs: string[];
  /** Pre-localized heading string (caller resolves it). */
  heading: string;
}

export async function RelatedPlacements({ slugs, heading }: RelatedPlacementsProps) {
  if (slugs.length === 0) return null;

  const tRelated = await getTranslations('essayDetail.related');
  const tPlanet = await getTranslations('essayDetail.planets');

  return (
    <nav aria-labelledby="related-placements-heading" className="max-w-2xl mx-auto px-4 pb-16">
      <h2
        id="related-placements-heading"
        className="text-xs font-semibold text-white/90 mb-4 font-[var(--font-geist-sans)] tracking-wide uppercase"
      >
        {heading}
      </h2>
      <ul className="flex flex-wrap gap-2" role="list">
        {slugs.map((slug) => {
          const parsed = parseEssaySlug(slug);
          if (!parsed) return null;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const planet = tPlanet(PLANET_KEY[parsed.planet] as any);
          const sign = SIGN_DISPLAY[parsed.sign];
          const anchorText = tRelated('anchorPlanetInSign', { planet, sign });
          return (
            <li key={slug}>
              <Link
                href={`/essays/${slug}`}
                className="inline-block px-3 py-1.5 rounded-md text-xs bg-white/5 text-white/60 hover:text-white/90 hover:bg-white/10 transition-colors font-[var(--font-geist-sans)]"
              >
                {anchorText}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
