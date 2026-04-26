/**
 * InternalLinks — "Related readings" section for essay pages.
 *
 * Server Component. Calls getRelatedPages() which is pure/synchronous.
 * Renders 3-5 contextual links with descriptive anchor text.
 */

import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { getRelatedPages } from '@/shared/seo';

const ArrowRight = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 14 14"
    fill="none"
    aria-hidden="true"
    className="text-white/30 group-hover:text-white/60 transition-colors shrink-0 mt-0.5"
  >
    <path d="M2.5 7h9M8 4l3.5 3-3.5 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

interface InternalLinksProps {
  slug: string;
}

const PLANET_FROM_SLUG: Record<string, string> = {
  sun: 'Sun', moon: 'Moon', mercury: 'Mercury', venus: 'Venus', mars: 'Mars',
  jupiter: 'Jupiter', saturn: 'Saturn', uranus: 'Uranus', neptune: 'Neptune', pluto: 'Pluto',
};

const SIGN_FROM_SLUG: Record<string, string> = {
  aries: 'Aries', taurus: 'Taurus', gemini: 'Gemini', cancer: 'Cancer',
  leo: 'Leo', virgo: 'Virgo', libra: 'Libra', scorpio: 'Scorpio',
  sagittarius: 'Sagittarius', capricorn: 'Capricorn', aquarius: 'Aquarius', pisces: 'Pisces',
};

function localizedAnchor(
  href: string,
  fallback: string,
  t: Awaited<ReturnType<typeof getTranslations<'essayDetail.related'>>>,
  tPlanet: Awaited<ReturnType<typeof getTranslations<'essayDetail.planets'>>>,
): string {
  const essayMatch = href.match(/^\/essays\/([a-z]+)-in-([a-z]+)$/);
  if (essayMatch) {
    const planetSlug = essayMatch[1] ?? '';
    const signSlug = essayMatch[2] ?? '';
    const planetKey = PLANET_FROM_SLUG[planetSlug];
    const sign = SIGN_FROM_SLUG[signSlug];
    if (planetKey && sign) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return t('anchorPlanetInSign', { planet: tPlanet(planetKey as any), sign });
    }
  }
  const signMatch = href.match(/^\/signs\/([a-z]+)$/);
  if (signMatch) {
    const sign = SIGN_FROM_SLUG[signMatch[1] ?? ''];
    if (sign) return t('anchorSignOverview', { sign });
  }
  if (href === '/why-sidereal') return t('anchorWhySidereal');
  if (href === '/chart') return t('anchorChartCta');
  return fallback;
}

export async function InternalLinks({ slug }: InternalLinksProps) {
  const pages = getRelatedPages(slug);
  if (pages.length === 0) return null;

  const t = await getTranslations('essayDetail.related');
  const tPlanet = await getTranslations('essayDetail.planets');

  return (
    <section aria-labelledby="related-heading">
      <h2
        id="related-heading"
        className="text-xs font-semibold text-white/90 mb-4 font-[var(--font-geist-sans)] tracking-wide uppercase"
      >
        {t('heading')}
      </h2>

      <ul className="space-y-1" role="list">
        {pages.map(({ href, title, anchorText }) => {
          const localized = localizedAnchor(href, anchorText, t, tPlanet);
          return (
            <li key={href}>
              <Link
                href={href}
                className="group flex items-start gap-3 rounded-lg border border-transparent hover:border-white/8 px-4 py-3 hover:bg-white/3 transition-all duration-150"
                aria-label={title}
              >
                {ArrowRight}
                <span className="text-sm text-white/55 group-hover:text-white/80 transition-colors font-[var(--font-geist-sans)] leading-snug">
                  {localized}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
