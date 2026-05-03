/**
 * /sidereal-[sign]-dates — live sidereal Sun date page.
 *
 * Routing: next.config.ts rewrites `/sidereal-{sign}-dates` → `/sidereal-dates/{sign}`
 * so that this full-segment `[sign]` folder correctly extracts the sign param.
 * (Next.js App Router does not support partial dynamic segments in folder names,
 * i.e. `sidereal-[sign]-dates/` cannot extract `sign`. A full-segment folder
 * `[sign]/` under a static parent `sidereal-dates/` is required.)
 *
 * Server Component. Computes the current year's Sun-in-sign window via
 * getSunInSignRange() (Swiss Ephemeris, Lahiri ayanamsa) at request time.
 *
 * force-dynamic: the page shows currentYear dates — must recompute each request
 * so the year is always accurate regardless of CDN cache state.
 *
 * JSON-LD: Article + BreadcrumbList. FAQPage skipped — fewer than 3 FAQ items;
 * the widget/accordion provide richer interactive signals instead.
 */

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import {
  createMetadata,
  JsonLdScript,
  articleSchema,
  breadcrumbSchema,
  SIGNS,
} from '@/shared/seo';
import { SITE_URL } from '@/shared/seo/constants';
import { getSunInSignRange, type SiderealSign } from '@/modules/astro-engine';
import { Disclaimer } from '@/shared/components/Disclaimer';
import { SunSignWidget } from './SunSignWidget';
import { YearTableAccordion } from './YearTableAccordion';

// Force SSR: currentYear must reflect the actual calendar year, not build time.
export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert locale slug to Intl-compatible locale string for date formatting. */
function toLocaleStr(locale: string): string {
  return locale === 'es' ? 'es-419' : 'en-US';
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export async function generateMetadata({
  params,
}: {
  params: Promise<{ sign: string; locale: string }>;
}): Promise<Metadata> {
  const { sign: signParam, locale: localeParam } = await params;
  if (!SIGNS.includes(signParam as (typeof SIGNS)[number])) return {};

  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: `siderealDates.${signParam}` });
  const currentYear = new Date().getUTCFullYear();

  return createMetadata({
    title: t('title', { year: currentYear }),
    description: t('description'),
    path: `/sidereal-${signParam}-dates`,
    locale: (localeParam ?? locale) as 'en' | 'es',
    type: 'article',
    keywords: [
      `sidereal ${signParam}`,
      `sidereal ${signParam} dates`,
      `${signParam} sidereal astrology`,
      `lahiri ${signParam}`,
      `when is sun in ${signParam} sidereal`,
    ],
  });
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function SiderealSignDatesPage({
  params,
}: {
  params: Promise<{ sign: string; locale: string }>;
}) {
  const { sign: signParam, locale: localeParam } = await params;

  // Validate sign slug
  if (!SIGNS.includes(signParam as (typeof SIGNS)[number])) {
    notFound();
  }
  const sign = signParam as SiderealSign;

  const locale = await getLocale();
  const t = await getTranslations(`siderealDates.${sign}`);
  const tCommon = await getTranslations('siderealDates.common');

  const currentYear = new Date().getUTCFullYear();
  const range = getSunInSignRange(sign, currentYear);

  const localeStr = toLocaleStr(localeParam ?? locale);
  const dateFmt = new Intl.DateTimeFormat(localeStr, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // ± 3 year accordion rows
  const accordionYears = [-3, -2, -1, 0, 1, 2, 3].map((delta) => {
    const y = currentYear + delta;
    const r = getSunInSignRange(sign, y);
    return { year: y, start: r.start.toISOString(), end: r.end.toISOString() };
  });

  // JSON-LD
  const pageUrl = `${SITE_URL}/sidereal-${sign}-dates`;
  const articleLd = articleSchema({
    title: t('title', { year: currentYear }),
    description: t('description'),
    url: localeParam === 'es' ? `${SITE_URL}/es/sidereal-${sign}-dates` : pageUrl,
    datePublished: '2026-05-02T00:00:00Z',
    dateModified: new Date().toISOString().split('T')[0] + 'T00:00:00Z',
  });

  const breadcrumbLd = breadcrumbSchema([
    { name: tCommon('breadcrumbHome'), url: SITE_URL },
    { name: tCommon('breadcrumbSection'), url: `${SITE_URL}/` },
    { name: t('breadcrumbCurrent'), url: localeParam === 'es' ? `${SITE_URL}/es/sidereal-${sign}-dates` : pageUrl },
  ]);

  return (
    <>
      <JsonLdScript schema={articleLd} />
      <JsonLdScript schema={breadcrumbLd} />

      <div className="max-w-2xl mx-auto px-4 py-10 md:py-14">

        {/* ── Breadcrumb ───────────────────────────────────────────────── */}
        <nav aria-label={tCommon('breadcrumbAria')} className="mb-8 text-sm text-white/40">
          <ol className="flex items-center gap-2 flex-wrap">
            <li>
              <Link href="/" className="hover:text-white/70 transition-colors">
                {tCommon('breadcrumbHome')}
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li className="text-white/60" aria-current="page">
              {t('breadcrumbCurrent')}
            </li>
          </ol>
        </nav>

        {/* ── H1 ───────────────────────────────────────────────────────── */}
        <h1
          className="text-3xl md:text-4xl font-light leading-[1.15] mb-4 text-[#F0EAD6]"
          style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)' }}
        >
          {t('h1', {
            startDate: dateFmt.format(range.start),
            endDate: dateFmt.format(range.end),
            year: currentYear,
          })}
        </h1>

        {/* ── Direct answer (AEO extraction target) ────────────────────── */}
        <p className="text-lg text-white/75 leading-relaxed mb-8">
          {t('directAnswer', {
            startDate: dateFmt.format(range.start),
            endDate: dateFmt.format(range.end),
            year: currentYear,
          })}
        </p>

        {/* ── Why these dates differ ────────────────────────────────────── */}
        <h2 className="text-xl font-semibold text-white/90 mb-3 mt-8">
          {tCommon('whyDifferentH2')}
        </h2>
        <p className="text-white/65 leading-relaxed mb-3">{t('whyDifferent')}</p>
        <p className="mb-8">
          <Link
            href="/why-sidereal"
            className="text-amber-400 underline underline-offset-2 hover:text-amber-300 text-sm"
          >
            {tCommon('readWhySidereal')} →
          </Link>
        </p>

        {/* ── Annual variation ─────────────────────────────────────────── */}
        <h2 className="text-xl font-semibold text-white/90 mb-3 mt-8">
          {tCommon('annualVariationH2')}
        </h2>
        <p className="text-white/65 leading-relaxed mb-4">{t('annualVariation')}</p>

        {/* ── Year table accordion ──────────────────────────────────────── */}
        <YearTableAccordion
          years={accordionYears}
          localeStr={localeStr}
          title={tCommon('yearTableTitle')}
        />

        {/* ── Interactive sun-sign widget ───────────────────────────────── */}
        <SunSignWidget currentSign={sign} localeStr={localeStr} />

        {/* ── See also ─────────────────────────────────────────────────── */}
        <h2 className="text-lg font-semibold text-white/80 mb-3 mt-8">
          {tCommon('seeAlsoH2')}
        </h2>
        <ul className="space-y-2 text-sm">
          <li>
            <Link
              href={`/essays/sun-in-${sign}`}
              className="text-amber-400 hover:text-amber-300 underline underline-offset-2"
            >
              {t('readEssayLink')}
            </Link>
          </li>
          <li>
            <Link
              href="/why-sidereal"
              className="text-amber-400 hover:text-amber-300 underline underline-offset-2"
            >
              {tCommon('readWhySidereal')}
            </Link>
          </li>
          <li>
            <Link
              href="/chart"
              className="text-amber-400 hover:text-amber-300 underline underline-offset-2"
            >
              {tCommon('calculateChart')}
            </Link>
          </li>
        </ul>

        {/* ── Legal disclaimer (CLAUDE.md content-legal-rules: required on all astrology pages) */}
        <Disclaimer />

      </div>
    </>
  );
}
