/**
 * /essays — index page listing all 120 sidereal planet-in-sign essays.
 *
 * Server Component. Statically rendered. Groups essays by planet (10 groups × 12 signs).
 * Fixes the 404 that breaks the mobile bottom nav "Essays" link.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { createMetadata, JsonLdScript, breadcrumbSchema } from '@/shared/seo';
import { SITE_URL } from '@/shared/seo/constants';
import { PLANETS, SIGNS } from '@/shared/seo/internal-links';
import { getAllEssays } from '@/modules/esoteric/lib/essays';
import type { EssayMeta } from '@/modules/esoteric/lib/essays';

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export function generateMetadata(): Metadata {
  return createMetadata({
    title: 'Sidereal Astrology Essays — Planet in Sign Interpretations',
    description:
      'Explore 120 sidereal astrology essays — every planet in every sign interpreted through the Lahiri ayanamsa. Sun through Pluto across all 12 signs.',
    path: '/essays',
    keywords: [
      'sidereal astrology essays',
      'planet in sign sidereal',
      'Lahiri ayanamsa interpretations',
      'sidereal zodiac planets',
      'sidereal Sun Moon Mercury',
    ],
  });
}

// ---------------------------------------------------------------------------
// Planet color palette — from docs/design.md
// ---------------------------------------------------------------------------

const PLANET_COLORS: Record<string, string> = {
  sun: '#FFD700',
  moon: '#C0C0C0',
  mercury: '#A8D8A8',
  venus: '#FFB6C1',
  mars: '#FF4500',
  jupiter: '#9B59B6',
  saturn: '#8B7355',
  uranus: '#40E0D0',
  neptune: '#4169E1',
  pluto: '#8B0000',
};

// Sign display names stay in their English/Latin form per i18n style guide
// (Aries = Aries, Taurus = Taurus across locales). Planet names ARE translated
// via the essaysPage.planets namespace because they have distinct Spanish forms
// (Sun → Sol, Moon → Luna, etc.).
const SIGN_DISPLAY: Record<string, string> = {
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
// Sub-components
// ---------------------------------------------------------------------------

interface SignCardProps {
  essay: EssayMeta | undefined;
  planet: string;
  sign: string;
  signLabel: string;
  cardAria: string;
  fallbackDesc: string;
}

function SignCard({ essay, planet, sign, signLabel, cardAria, fallbackDesc }: SignCardProps) {
  const slug = `${planet}-in-${sign}`;
  const planetColor = PLANET_COLORS[planet] ?? '#FFFFFF';
  const description = essay?.description ?? fallbackDesc;

  return (
    <li>
      <Link
        href={`/essays/${slug}`}
        className={[
          'group block rounded-xl border border-white/8 bg-white/3 px-4 py-4',
          'hover:border-white/16 hover:bg-white/5',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40',
          'transition-colors duration-150',
        ].join(' ')}
        aria-label={cardAria}
      >
        {/* Sign name with planet accent */}
        <h3
          className="text-base font-semibold leading-tight mb-1.5 transition-colors duration-150"
          style={{
            fontFamily: 'var(--font-crimson-pro, serif)',
            color: planetColor,
          }}
        >
          {signLabel}
        </h3>

        {/* Description — truncated to two lines */}
        <p
          className="text-xs text-white/50 leading-relaxed line-clamp-2"
          style={{ fontFamily: 'var(--font-geist-sans, sans-serif)' }}
        >
          {description}
        </p>
      </Link>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function EssaysIndexPage() {
  const t = await getTranslations('essaysPage');

  const essaysBreadcrumb = breadcrumbSchema([
    { name: 'Estrevia', url: SITE_URL },
    { name: t('breadcrumb'), url: `${SITE_URL}/essays` },
  ]);

  // getAllEssays() returns only essays that exist as MDX files.
  // Build a lookup map so sign cards can show real descriptions when available.
  const allEssays = getAllEssays();
  const essayMap = new Map<string, EssayMeta>();
  for (const essay of allEssays) {
    essayMap.set(essay.slug, essay);
  }

  return (
    <>
      <JsonLdScript schema={essaysBreadcrumb} />

      <div
        className="min-h-[calc(100vh-4rem)] px-4 py-8"
        style={{ fontFamily: 'var(--font-geist-sans, sans-serif)' }}
      >
        <div className="max-w-4xl mx-auto space-y-12">

          {/* ── Page header ──────────────────────────────────────────────── */}
          <header className="space-y-3">
            <h1
              className="text-2xl font-semibold tracking-tight text-white/90"
              style={{ fontFamily: 'var(--font-crimson-pro, serif)' }}
            >
              {t('h1')}
            </h1>
            <p className="text-sm text-white/50 max-w-prose leading-relaxed">
              {t('description')}
            </p>
          </header>

          {/* ── Planet groups ─────────────────────────────────────────────── */}
          <div className="space-y-12">
            {PLANETS.map((planet) => {
              const planetColor = PLANET_COLORS[planet] ?? '#FFFFFF';
              const planetLabel = t(`planets.${planet}`);

              return (
                <section
                  key={planet}
                  aria-labelledby={`planet-heading-${planet}`}
                >
                  {/* Planet group heading */}
                  <h2
                    id={`planet-heading-${planet}`}
                    className="text-lg font-semibold mb-4 pb-2 border-b border-white/8"
                    style={{
                      fontFamily: 'var(--font-crimson-pro, serif)',
                      color: planetColor,
                    }}
                  >
                    {t('groupHeading', { planet: planetLabel })}
                  </h2>

                  {/* 12-sign grid */}
                  <ul
                    className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3"
                    aria-label={t('groupAria', { planet: planetLabel })}
                  >
                    {SIGNS.map((sign) => {
                      const slug = `${planet}-in-${sign}`;
                      const signLabel = SIGN_DISPLAY[sign] ?? sign;
                      return (
                        <SignCard
                          key={sign}
                          essay={essayMap.get(slug)}
                          planet={planet}
                          sign={sign}
                          signLabel={signLabel}
                          cardAria={t('cardAria', { planet: planetLabel, sign: signLabel })}
                          fallbackDesc={t('fallbackDesc', { planet: planetLabel, sign: signLabel })}
                        />
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>

        </div>
      </div>
    </>
  );
}
