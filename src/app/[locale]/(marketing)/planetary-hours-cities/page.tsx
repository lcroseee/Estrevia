import type { Metadata } from 'next';
import Link from 'next/link';
import { setRequestLocale } from 'next-intl/server';
import { createMetadata, breadcrumbSchema, JsonLdScript, SITE_URL } from '@/shared/seo';
import { TOP_CITIES } from '@/shared/seo/cities';

interface PageProps {
  params: Promise<{ locale: 'en' | 'es' }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const title = locale === 'es'
    ? 'Horas planetarias por ciudad — directorio'
    : 'Planetary hours by city — directory';
  const description = locale === 'es'
    ? 'Tabla de horas planetarias para 20 ciudades principales (NY, LA, Londres, CDMX, Buenos Aires y más).'
    : 'Planetary hours tables for 20 major cities (NYC, LA, London, Mexico City, Buenos Aires, more).';
  return createMetadata({
    title,
    description,
    path: '/planetary-hours-cities',
    locale,
  });
}

export default async function PlanetaryHoursCitiesIndexPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const heading = locale === 'es' ? 'Horas planetarias por ciudad' : 'Planetary hours by city';
  const intro = locale === 'es'
    ? 'Tablas actualizadas a diario para las 20 ciudades de mayor demanda en mercados EN y ES.'
    : 'Daily-refreshed tables for the 20 most-requested cities across EN and ES markets.';

  const localePath = locale === 'es' ? '/es' : '';

  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <JsonLdScript
        schema={breadcrumbSchema([
          { name: locale === 'es' ? 'Inicio' : 'Home', url: `${SITE_URL}${localePath}` },
          { name: heading, url: `${SITE_URL}${localePath}/planetary-hours-cities` },
        ])}
      />
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-white/90">{heading}</h1>
        <p className="mt-3 text-sm text-white/60">{intro}</p>
      </header>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {TOP_CITIES.map((c) => (
          <Link
            key={c.slug}
            href={`/planetary-hours-cities/${c.slug}`}
            locale={locale}
            className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-white/80 transition hover:border-white/20 hover:bg-white/[0.05]"
          >
            {c.name}
          </Link>
        ))}
      </div>
    </main>
  );
}
