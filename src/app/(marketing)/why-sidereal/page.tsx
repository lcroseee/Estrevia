import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import {
  createMetadata,
  JsonLdScript,
  articleSchema,
  faqSchema,
  breadcrumbSchema,
  organizationSchema,
} from '@/shared/seo';
import { SITE_URL } from '@/shared/seo/constants';
import { Disclaimer } from '@/shared/components/Disclaimer';
import PrecessionDiagramLoader from '@/modules/esoteric/components/PrecessionDiagramLoader';

// R10: force-static + hourly revalidate. Explainer copy rarely changes.
export const dynamic = 'force-static';
export const revalidate = 3600;

// ---------------------------------------------------------------------------
// Metadata (kept English-only — SEO concern, not user-facing UI)
// ---------------------------------------------------------------------------

export const metadata: Metadata = createMetadata({
  title: 'Why Sidereal Astrology Differs from Tropical',
  description:
    'Sidereal astrology tracks real constellations using the Lahiri ayanamsa. Most sun signs shift one sign earlier vs tropical. Calculate your true chart.',
  path: '/why-sidereal',
  type: 'article',
  keywords: [
    'sidereal astrology',
    'sidereal vs tropical',
    'what is sidereal astrology',
    'lahiri ayanamsa',
    'precession of equinoxes',
    'sidereal zodiac',
    'tropical astrology difference',
  ],
});

// ---------------------------------------------------------------------------
// Sign rows — sidereal/tropical date strings come from translations.
// Sign labels stay in English/Latin form per i18n style guide.
// ---------------------------------------------------------------------------

const SIGN_ROWS = [
  { sign: 'Aries',       sKey: 'datesAriesS',       tKey: 'datesAriesT' },
  { sign: 'Taurus',      sKey: 'datesTaurusS',      tKey: 'datesTaurusT' },
  { sign: 'Gemini',      sKey: 'datesGeminiS',      tKey: 'datesGeminiT' },
  { sign: 'Cancer',      sKey: 'datesCancerS',      tKey: 'datesCancerT' },
  { sign: 'Leo',         sKey: 'datesLeoS',         tKey: 'datesLeoT' },
  { sign: 'Virgo',       sKey: 'datesVirgoS',       tKey: 'datesVirgoT' },
  { sign: 'Libra',       sKey: 'datesLibraS',       tKey: 'datesLibraT' },
  { sign: 'Scorpio',     sKey: 'datesScorpioS',     tKey: 'datesScorpioT' },
  { sign: 'Sagittarius', sKey: 'datesSagittariusS', tKey: 'datesSagittariusT' },
  { sign: 'Capricorn',   sKey: 'datesCapricornS',   tKey: 'datesCapricornT' },
  { sign: 'Aquarius',    sKey: 'datesAquariusS',    tKey: 'datesAquariusT' },
  { sign: 'Pisces',      sKey: 'datesPiscesS',      tKey: 'datesPiscesT' },
] as const;

const COMPARISON_ROWS = [
  { aspectKey: 'compRow1Aspect', sKey: 'compRow1Sidereal', tKey: 'compRow1Tropical' },
  { aspectKey: 'compRow2Aspect', sKey: 'compRow2Sidereal', tKey: 'compRow2Tropical' },
  { aspectKey: 'compRow3Aspect', sKey: 'compRow3Sidereal', tKey: 'compRow3Tropical' },
  { aspectKey: 'compRow4Aspect', sKey: 'compRow4Sidereal', tKey: 'compRow4Tropical' },
  { aspectKey: 'compRow5Aspect', sKey: 'compRow5Sidereal', tKey: 'compRow5Tropical' },
  { aspectKey: 'compRow6Aspect', sKey: 'compRow6Sidereal', tKey: 'compRow6Tropical' },
  { aspectKey: 'compRow7Aspect', sKey: 'compRow7Sidereal', tKey: 'compRow7Tropical' },
] as const;

const FAQS = [
  { qKey: 'faq1Q', aKey: 'faq1A' },
  { qKey: 'faq2Q', aKey: 'faq2A' },
  { qKey: 'faq3Q', aKey: 'faq3A' },
  { qKey: 'faq4Q', aKey: 'faq4A' },
  { qKey: 'faq5Q', aKey: 'faq5A' },
  { qKey: 'faq6Q', aKey: 'faq6A' },
  { qKey: 'faq7Q', aKey: 'faq7A' },
] as const;

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default async function WhySiderealPage() {
  const t = await getTranslations('whySidereal');
  const pageUrl = `${SITE_URL}/why-sidereal`;
  const today = new Date().toISOString().split('T')[0];

  const faqLd = faqSchema(
    FAQS.map(({ qKey, aKey }) => ({
      question: t(qKey),
      answer: t(aKey),
    })),
  );

  const breadcrumbLd = breadcrumbSchema([
    { name: t('breadcrumbHome'), url: SITE_URL },
    { name: t('breadcrumbCurrent'), url: pageUrl },
  ]);

  const orgLd = organizationSchema();

  const articleLd = articleSchema({
    title: t('h1'),
    description: t('leadParagraph'),
    url: pageUrl,
    datePublished: '2024-01-15T00:00:00Z',
    dateModified: today,
  });

  const internalLinks = [
    { href: '/signs/aries',   label: t('linkAries') },
    { href: '/signs/taurus',  label: t('linkTaurus') },
    { href: '/signs/scorpio', label: t('linkScorpio') },
    { href: '/signs/pisces',  label: t('linkPisces') },
    { href: '/chart',         label: t('linkChart') },
    { href: '/moon',          label: t('linkMoon') },
  ];

  return (
    <>
      <JsonLdScript schema={articleLd} />
      <JsonLdScript schema={faqLd} />
      <JsonLdScript schema={breadcrumbLd} />
      <JsonLdScript schema={orgLd} />

      <div className="max-w-3xl mx-auto px-4 py-10 md:py-16">

        {/* ── Breadcrumb ─────────────────────────────────────────────── */}
        <nav aria-label={t('breadcrumbAria')} className="mb-8 text-sm text-white/40">
          <ol className="flex items-center gap-2">
            <li><Link href="/" className="hover:text-white/70 transition-colors">{t('breadcrumbHome')}</Link></li>
            <li aria-hidden="true">/</li>
            <li className="text-white/60" aria-current="page">{t('breadcrumbCurrent')}</li>
          </ol>
        </nav>

        {/* ── Hero / H1 ──────────────────────────────────────────────── */}
        <header className="mb-12">
          {/* Decorative eyebrow */}
          <div
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full border mb-6 text-[11px] tracking-[0.2em] uppercase"
            style={{ borderColor: 'rgba(255,215,0,0.2)', color: 'rgba(255,215,0,0.55)' }}
          >
            <span aria-hidden="true" style={{ fontFamily: 'serif' }}>★</span>
            {t('eyebrow')}
          </div>

          <h1
            className="text-3xl md:text-5xl font-light leading-[1.1] mb-5"
            style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)', color: '#F0EAD6' }}
          >
            {t('h1')}
          </h1>

          {/* AEO: direct-answer first paragraph — this is the AI extraction target */}
          <p className="text-lg text-white/72 leading-relaxed" style={{ fontFamily: 'var(--font-geist-sans)' }}>
            {t('leadParagraph')}
          </p>
        </header>

        {/* ── Section 1: Precession ──────────────────────────────────── */}
        <section aria-labelledby="precession-heading" className="mb-12">
          <h2
            id="precession-heading"
            className="text-2xl font-light mb-4"
            style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)', color: '#E8E0D0' }}
          >
            {t('section1Heading')}
          </h2>
          <div className="text-white/70 leading-relaxed space-y-4 font-[var(--font-geist-sans)]">
            <p>{t('section1P1')}</p>
            <p>{t('section1P2')}</p>
            <p>{t('section1P3')}</p>
          </div>

          <PrecessionDiagramLoader />
        </section>

        {/* ── Section 2: How they differ ─────────────────────────────── */}
        <section aria-labelledby="how-differ-heading" className="mb-12">
          <h2
            id="how-differ-heading"
            className="text-2xl font-light mb-4"
            style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)', color: '#E8E0D0' }}
          >
            {t('section2Heading')}
          </h2>

          {/* Comparison table — AEO: AI parses tables better than prose */}
          <div className="overflow-x-auto mb-6 rounded-xl border border-white/10">
            <table className="w-full text-sm" aria-label={t('compTableAria')}>
              <thead>
                <tr className="border-b border-white/10 bg-white/5">
                  <th
                    scope="col"
                    className="text-left px-4 py-3 text-white/50 font-medium text-xs uppercase tracking-widest"
                  >
                    {t('compTableH1')}
                  </th>
                  <th
                    scope="col"
                    className="text-left px-4 py-3 text-white/50 font-medium text-xs uppercase tracking-widest"
                  >
                    {t('compTableH2')}
                  </th>
                  <th
                    scope="col"
                    className="text-left px-4 py-3 text-white/50 font-medium text-xs uppercase tracking-widest"
                  >
                    {t('compTableH3')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map(({ aspectKey, sKey, tKey }) => (
                  <tr key={aspectKey} className="border-b border-white/5 last:border-0">
                    <td className="px-4 py-3 text-white/50 font-medium">{t(aspectKey)}</td>
                    <td className="px-4 py-3 text-white/85">{t(sKey)}</td>
                    <td className="px-4 py-3 text-white/60">{t(tKey)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="text-white/70 leading-relaxed space-y-4 font-[var(--font-geist-sans)]">
            <p>{t('section2P1')}</p>
            <p>{t('section2P2')}</p>
          </div>
        </section>

        {/* ── Section 3: Date comparison table ──────────────────────── */}
        <section aria-labelledby="dates-heading" className="mb-12">
          <h2
            id="dates-heading"
            className="text-2xl font-light mb-4"
            style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)', color: '#E8E0D0' }}
          >
            {t('section3Heading')}
          </h2>
          <p className="text-white/60 text-sm mb-5">
            {t('section3IntroBefore')}
            <Link href="/chart" className="text-amber-400 hover:text-amber-300 underline underline-offset-4">
              {t('section3IntroLink')}
            </Link>
            {t('section3IntroAfter')}
          </p>
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table
              className="w-full text-sm"
              aria-label={t('datesTableAria')}
            >
              <thead>
                <tr className="border-b border-white/10 bg-white/5">
                  <th
                    scope="col"
                    className="text-left px-4 py-3 text-white/50 font-medium text-xs uppercase tracking-widest"
                  >
                    {t('datesTableH1')}
                  </th>
                  <th
                    scope="col"
                    className="text-left px-4 py-3 text-white/50 font-medium text-xs uppercase tracking-widest"
                  >
                    {t('datesTableH2')}
                  </th>
                  <th
                    scope="col"
                    className="text-left px-4 py-3 text-white/50 font-medium text-xs uppercase tracking-widest"
                  >
                    {t('datesTableH3')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {SIGN_ROWS.map(({ sign, sKey, tKey }) => (
                  <tr key={sign} className="border-b border-white/5 last:border-0 hover:bg-white/3 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`/signs/${sign.toLowerCase()}`}
                        className="text-white/85 hover:text-white transition-colors font-medium"
                        aria-label={t('signOverviewAria', { sign })}
                      >
                        {sign}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-amber-300/90 font-[var(--font-geist-mono)] text-xs">
                      {t(sKey)}
                    </td>
                    <td className="px-4 py-3 text-white/50 font-[var(--font-geist-mono)] text-xs">
                      {t(tKey)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Section 4: Lahiri ayanamsa ─────────────────────────────── */}
        <section aria-labelledby="lahiri-heading" className="mb-12">
          <h2
            id="lahiri-heading"
            className="text-2xl font-light mb-4"
            style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)', color: '#E8E0D0' }}
          >
            {t('section4Heading')}
          </h2>
          <div className="text-white/70 leading-relaxed space-y-4 font-[var(--font-geist-sans)]">
            <p>
              {t('section4P1Before')}
              <em>{t('section4P1Ayana')}</em>
              {t('section4P1Mid')}
              <em>{t('section4P1Amsha')}</em>
              {t('section4P1End')}
            </p>
            <p>
              {t('section4P2Before')}
              <a
                href="https://www.astro.com/swisseph/swephinfo_e.htm"
                rel="noopener"
                className="text-amber-400 hover:text-amber-300 underline underline-offset-4"
                target="_blank"
              >
                {t('section4P2Link')}
              </a>
              {t('section4P2After')}
            </p>
            <p>{t('section4P3')}</p>
          </div>
        </section>

        {/* ── Chart CTA ──────────────────────────────────────────────── */}
        <section
          aria-labelledby="calc-cta-heading"
          className="mb-12 rounded-xl border border-amber-500/30 bg-amber-500/5 p-6"
        >
          <h2
            id="calc-cta-heading"
            className="text-xl font-light mb-3"
            style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)', color: '#F0EAD6' }}
          >
            {t('ctaHeading')}
          </h2>
          <p className="text-white/58 text-sm mb-5 leading-relaxed">
            {t('ctaP')}
          </p>
          <Link
            href="/chart"
            className="inline-flex items-center gap-2 px-7 py-3 rounded-lg text-sm font-semibold transition-all duration-200 hover:shadow-lg active:scale-[0.98]"
            style={{
              background: 'linear-gradient(135deg, #FFD700 0%, #FF8C00 100%)',
              color: '#0A0A0F',
              boxShadow: '0 4px 16px rgba(255,215,0,0.2)',
            }}
          >
            <span aria-hidden="true">☉</span>
            {t('ctaButton')}
          </Link>
        </section>

        {/* ── FAQ Section (AEO) ──────────────────────────────────────── */}
        <section aria-labelledby="faq-heading" className="mb-12">
          <h2
            id="faq-heading"
            className="text-2xl font-light mb-6"
            style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)', color: '#E8E0D0' }}
          >
            {t('faqHeading')}
          </h2>
          <dl className="space-y-6">
            {FAQS.map(({ qKey, aKey }) => (
              <div key={qKey} className="border-b border-white/8 pb-6 last:border-0">
                <dt className="text-white font-medium mb-2 font-[var(--font-geist-sans)]">
                  {t(qKey)}
                </dt>
                <dd className="text-white/65 leading-relaxed text-sm font-[var(--font-geist-sans)]">
                  {t(aKey)}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/* ── Internal links ─────────────────────────────────────────── */}
        <nav aria-label={t('internalAria')} className="pt-8 border-t border-white/10">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-5">
            {t('internalHeading')}
          </h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm" role="list">
            {internalLinks.map(({ href, label }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="flex items-center gap-2 px-4 py-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/8 hover:border-white/20 transition-all text-white/70 hover:text-white/90"
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>

          {/* External authoritative links */}
          <div className="mt-6 text-sm text-white/40 space-y-2">
            <p className="text-xs uppercase tracking-widest text-white/25 mb-3">{t('sourcesLabel')}</p>
            <a
              href="https://en.wikipedia.org/wiki/Astronomical_year_numbering#Precession"
              rel="noopener"
              target="_blank"
              className="block hover:text-white/60 transition-colors"
            >
              {t('sourceWiki')}
            </a>
            <a
              href="https://www.iau.org/public/themes/constellations/"
              rel="noopener"
              target="_blank"
              className="block hover:text-white/60 transition-colors"
            >
              {t('sourceIau')}
            </a>
          </div>
        </nav>

        <Disclaimer />

      </div>
    </>
  );
}
