import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { createMetadata, articleSchema, breadcrumbSchema, JsonLdScript, SITE_URL } from '@/shared/seo';
import { ALL_CITY_SLUGS, findCityBySlug } from '@/shared/seo/cities';
import { calculatePlanetaryHours } from '@/modules/astro-engine';

interface PageProps {
  params: Promise<{ locale: 'en' | 'es'; city: string }>;
}

export const dynamicParams = false;
// 24h ISR — sunrise/sunset times shift slightly day-to-day; daily refresh suffices
// for this directory-style page (authoritative snapshot, not the real-time /hours tool).
export const revalidate = 86400;

export async function generateStaticParams() {
  return ALL_CITY_SLUGS.map((city) => ({ city }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, city } = await params;
  const entry = findCityBySlug(city);
  if (!entry) return {};
  const title =
    locale === 'es'
      ? `Horas planetarias en ${entry.name} — hoy`
      : `Planetary hours in ${entry.name} — today`;
  const description =
    locale === 'es'
      ? `Tabla de horas planetarias para ${entry.name} basada en el cálculo sideral con efemérides Suizas.`
      : `Planetary hours table for ${entry.name} computed with the Swiss Ephemeris sidereal engine.`;
  return createMetadata({
    title,
    description,
    path: `/planetary-hours-cities/${city}`,
    locale,
  });
}

export default async function PlanetaryHoursCityPage({ params }: PageProps) {
  const { locale, city } = await params;
  setRequestLocale(locale);
  const entry = findCityBySlug(city);
  if (!entry) notFound();

  const today = new Date();
  // Signature: calculatePlanetaryHours(latitude, longitude, date, now?)
  // All positional args — no object wrapper.
  const result = calculatePlanetaryHours(entry.lat, entry.lng, today);

  const heading =
    locale === 'es'
      ? `Horas planetarias — ${entry.name}`
      : `Planetary hours — ${entry.name}`;
  const localePath = locale === 'es' ? '/es' : '';
  const url = `${SITE_URL}${localePath}/planetary-hours-cities/${city}`;

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <JsonLdScript
        schema={articleSchema({
          title: heading,
          description:
            locale === 'es'
              ? `Tabla de horas planetarias para ${entry.name}.`
              : `Planetary hours table for ${entry.name}.`,
          datePublished: today.toISOString().slice(0, 10),
          dateModified: today.toISOString().slice(0, 10),
          authorName: 'Estrevia',
          url,
        })}
      />
      <JsonLdScript
        schema={breadcrumbSchema([
          {
            name: locale === 'es' ? 'Inicio' : 'Home',
            url: `${SITE_URL}${localePath}`,
          },
          {
            name:
              locale === 'es'
                ? 'Horas planetarias por ciudad'
                : 'Planetary hours by city',
            url: `${SITE_URL}${localePath}/planetary-hours-cities`,
          },
          { name: entry.name, url },
        ])}
      />
      <header className="mb-6 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-white/90">{heading}</h1>
        <p className="mt-2 text-xs uppercase tracking-wider text-white/40">
          {entry.country} · {entry.tz}
        </p>
      </header>

      <section aria-label={locale === 'es' ? 'Tabla de horas planetarias' : 'Planetary hours table'}>
        <table className="w-full border-collapse text-sm text-white/80">
          <caption className="mb-2 text-left text-xs text-white/40">
            {locale === 'es'
              ? `Horas planetarias para ${entry.name} — ${today.toISOString().slice(0, 10)}`
              : `Planetary hours for ${entry.name} — ${today.toISOString().slice(0, 10)}`}
          </caption>
          <thead>
            <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-white/40">
              <th className="py-2 pr-4 text-left">#</th>
              <th className="py-2 pr-4 text-left">
                {locale === 'es' ? 'Inicio' : 'Start'}
              </th>
              <th className="py-2 pr-4 text-left">
                {locale === 'es' ? 'Fin' : 'End'}
              </th>
              <th className="py-2 pr-4 text-left">
                {locale === 'es' ? 'Planeta' : 'Planet'}
              </th>
              <th className="py-2 text-left">
                {locale === 'es' ? 'Período' : 'Period'}
              </th>
            </tr>
          </thead>
          <tbody>
            {result.hours.map((hour, idx) => (
              <tr
                key={idx}
                className={`border-b border-white/5 ${
                  result.currentHour?.planet === hour.planet &&
                  result.currentHour?.startTime === hour.startTime
                    ? 'bg-white/5'
                    : ''
                }`}
              >
                <td className="py-2 pr-4 font-mono text-xs text-white/40">{idx + 1}</td>
                <td className="py-2 pr-4 font-mono text-xs">
                  {new Date(hour.startTime).toLocaleTimeString('en-GB', {
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: entry.tz,
                  })}
                </td>
                <td className="py-2 pr-4 font-mono text-xs">
                  {new Date(hour.endTime).toLocaleTimeString('en-GB', {
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: entry.tz,
                  })}
                </td>
                <td className="py-2 pr-4 capitalize">{String(hour.planet)}</td>
                <td className="py-2 text-xs text-white/40">
                  {hour.isDay
                    ? locale === 'es'
                      ? 'Diurna'
                      : 'Day'
                    : locale === 'es'
                      ? 'Nocturna'
                      : 'Night'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <dl className="mt-6 grid grid-cols-2 gap-4 text-sm text-white/60 sm:grid-cols-4">
        <div>
          <dt className="text-xs uppercase tracking-wider text-white/30">
            {locale === 'es' ? 'Amanecer' : 'Sunrise'}
          </dt>
          <dd className="mt-1 font-mono">
            {new Date(result.sunrise).toLocaleTimeString('en-GB', {
              hour: '2-digit',
              minute: '2-digit',
              timeZone: entry.tz,
            })}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-white/30">
            {locale === 'es' ? 'Atardecer' : 'Sunset'}
          </dt>
          <dd className="mt-1 font-mono">
            {new Date(result.sunset).toLocaleTimeString('en-GB', {
              hour: '2-digit',
              minute: '2-digit',
              timeZone: entry.tz,
            })}
          </dd>
        </div>
      </dl>

      <p className="mt-6 text-xs text-white/30">
        {locale === 'es'
          ? 'Calculado con Swiss Ephemeris (algoritmo Moshier) — precisión ±0.01°. Actualizado cada 24 horas.'
          : 'Computed with Swiss Ephemeris (Moshier algorithm) at ±0.01° accuracy. Refreshes every 24 hours.'}
      </p>
    </main>
  );
}
