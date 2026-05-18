import type { Metadata } from 'next';
import { getLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import {
  createMetadata,
  JsonLdScript,
  breadcrumbSchema,
} from '@/shared/seo';
import { SITE_URL } from '@/shared/seo/constants';
import { ZODIAC_SIGNS, buildPairSlug } from '@/shared/seo/compatibility-pairs';

// ISR: revalidate daily — content is static but locale-keyed.
export const revalidate = 86400;

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export async function generateMetadata(): Promise<Metadata> {
  const locale = (await getLocale()) as 'en' | 'es';
  const title =
    locale === 'es'
      ? 'Compatibilidad zodiacal sideral — todas las combinaciones'
      : 'Sidereal zodiac compatibility — every pair';
  const description =
    locale === 'es'
      ? 'Compatibilidad por elemento, modalidad y regente entre los 12 signos siderales. 78 combinaciones únicas.'
      : 'Element, modality, and ruler compatibility across all 12 sidereal signs. 78 unique pair pages.';
  return createMetadata({
    title,
    description,
    path: '/compatibility',
    locale,
    keywords: [
      'sidereal compatibility',
      'zodiac compatibility',
      'sidereal astrology',
      'sign compatibility',
      'lahiri ayanamsa',
    ],
  });
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default async function CompatibilityIndexPage() {
  const locale = (await getLocale()) as 'en' | 'es';

  const heading =
    locale === 'es' ? 'Compatibilidad sideral' : 'Sidereal compatibility';
  const intro =
    locale === 'es'
      ? 'Cada combinación de signos siderales con análisis de elemento, modalidad y regente planetario.'
      : 'Every sidereal sign pair with element, modality, and ruling-planet analysis.';

  const localePath = locale === 'es' ? '/es' : '';

  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <JsonLdScript
        schema={breadcrumbSchema([
          {
            name: locale === 'es' ? 'Inicio' : 'Home',
            url: `${SITE_URL}${localePath}`,
          },
          {
            name: heading,
            url: `${SITE_URL}${localePath}/compatibility`,
          },
        ])}
      />

      <header className="mb-8 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-white/90">
          {heading}
        </h1>
        <p className="mt-3 text-sm text-white/60">{intro}</p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {ZODIAC_SIGNS.flatMap((s1, i) =>
          ZODIAC_SIGNS.slice(i).map((s2) => {
            const slug = buildPairSlug(s1, s2);
            return (
              <Link
                key={slug}
                href={`/compatibility/${slug}`}
                className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-white/80 transition hover:border-white/20 hover:bg-white/[0.05]"
              >
                {capitalize(s1)} &times; {capitalize(s2)}
              </Link>
            );
          }),
        )}
      </div>
    </main>
  );
}
