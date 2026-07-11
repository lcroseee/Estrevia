import type { Metadata } from 'next';
import { Link } from '@/i18n/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  createMetadata,
  JsonLdScript,
  personSchema,
  breadcrumbSchema,
  SITE_NAME,
  SITE_URL,
  FOUNDER_NAME,
  isFounderIdentityPublished,
} from '@/shared/seo';
import { Disclaimer } from '@/shared/components/Disclaimer';

// ISR hourly, mirroring /why-sidereal. Locale resolved from the [locale] segment.
export const revalidate = 3600;

// English concept labels for the Person entity graph (schema values, not UI copy).
const KNOWS_ABOUT = [
  'Sidereal astrology',
  'Lahiri ayanamsa',
  'Vedic astrology',
  'Swiss Ephemeris',
  'Planetary hours',
];

const SUPPORT_EMAIL = 'support@estrevia.app';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const tMeta = await getTranslations('pageMeta.about');
  return createMetadata({
    title: tMeta('title'),
    description: tMeta('description'),
    path: '/about',
    locale: locale as 'en' | 'es',
    // Dormant (T13 gate): stays noindex until the founder publishes their
    // identity (FOUNDER_NAME set). Auto-flips to indexable once published.
    noIndex: !isFounderIdentityPublished(),
    keywords: [
      'estrevia founder',
      'sidereal astrology methodology',
      'lahiri ayanamsa accuracy',
      'swiss ephemeris',
    ],
  });
}

export default async function AboutPage() {
  const t = await getTranslations('about');
  const locale = await getLocale();
  const base = SITE_URL.replace(/\/$/, '');
  const prefix = locale === 'es' ? '/es' : '';
  const pageUrl = `${base}${prefix}/about`;

  // Person entity node — gated: emitted only once the founder identity is
  // published, so no placeholder name ever ships in the JSON-LD graph.
  const personLd = isFounderIdentityPublished()
    ? personSchema({
        name: FOUNDER_NAME,
        url: `${base}/about`, // single canonical entity URL for the founder
        jobTitle: t('roleTitle'),
        description: t('bioSchema'),
        sameAs: ['https://x.com/estrevia_app'],
        knowsAbout: KNOWS_ABOUT,
        worksForName: SITE_NAME,
        worksForUrl: SITE_URL,
      })
    : null;

  const breadcrumbLd = breadcrumbSchema([
    { name: t('breadcrumbHome'), url: `${base}${prefix}` },
    { name: t('breadcrumbCurrent'), url: pageUrl },
  ]);

  return (
    <>
      {personLd && <JsonLdScript schema={personLd} />}
      <JsonLdScript schema={breadcrumbLd} />

      <div className="max-w-3xl mx-auto px-4 py-10 md:py-16">
        {/* Breadcrumb */}
        <nav aria-label={t('breadcrumbAria')} className="mb-8 text-sm text-white/40">
          <ol className="flex items-center gap-2">
            <li><Link href="/" className="hover:text-white/70 transition-colors">{t('breadcrumbHome')}</Link></li>
            <li aria-hidden="true">/</li>
            <li className="text-white/60" aria-current="page">{t('breadcrumbCurrent')}</li>
          </ol>
        </nav>

        {/* Hero */}
        <header className="mb-12">
          <p className="text-[10px] tracking-[0.22em] uppercase text-white/40 mb-4">{t('eyebrow')}</p>
          <h1
            className="text-3xl md:text-5xl font-light leading-[1.1] mb-5"
            style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)', color: '#F0EAD6' }}
          >
            {t('h1')}
          </h1>
          <p className="text-lg text-white/72 leading-relaxed" style={{ fontFamily: 'var(--font-geist-sans)' }}>
            {t('lead', { name: FOUNDER_NAME })}
          </p>
        </header>

        {/* Founder */}
        <section aria-labelledby="founder-heading" className="mb-12">
          <h2 id="founder-heading" className="text-2xl font-light mb-4"
              style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)', color: '#E8E0D0' }}>
            {t('founderHeading')}
          </h2>
          <p className="text-white/70 leading-relaxed" style={{ fontFamily: 'var(--font-geist-sans)' }}>
            {t('founderBio', { name: FOUNDER_NAME })}
          </p>
        </section>

        {/* Methodology */}
        <section aria-labelledby="method-heading" className="mb-12">
          <h2 id="method-heading" className="text-2xl font-light mb-4"
              style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)', color: '#E8E0D0' }}>
            {t('methodologyHeading')}
          </h2>
          <div className="text-white/70 leading-relaxed space-y-4" style={{ fontFamily: 'var(--font-geist-sans)' }}>
            <p>{t('methodologyP1')}</p>
            <p>{t('methodologyP2')}</p>
          </div>
          <dl className="mt-6 rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
            <dt className="text-[11px] uppercase tracking-widest text-amber-300/70 mb-1">{t('accuracyLabel')}</dt>
            <dd className="text-sm text-white/80" style={{ fontFamily: 'var(--font-geist-mono)' }}>{t('accuracyValue')}</dd>
          </dl>
        </section>

        {/* Contact */}
        <section aria-labelledby="contact-heading" className="mb-12">
          <h2 id="contact-heading" className="text-2xl font-light mb-4"
              style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)', color: '#E8E0D0' }}>
            {t('contactHeading')}
          </h2>
          <p className="text-white/70 leading-relaxed mb-3" style={{ fontFamily: 'var(--font-geist-sans)' }}>
            {t('contactBody')}
          </p>
          <p className="text-sm text-white/60">
            <span className="text-white/40">{t('contactEmailLabel')}: </span>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-amber-400 hover:text-amber-300 underline underline-offset-4">
              {SUPPORT_EMAIL}
            </a>
          </p>
        </section>

        {/* CTA */}
        <section aria-labelledby="cta-heading" className="mb-12 rounded-xl border border-amber-500/30 bg-amber-500/5 p-6">
          <h2 id="cta-heading" className="text-xl font-light mb-3"
              style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)', color: '#F0EAD6' }}>
            {t('ctaHeading')}
          </h2>
          <p className="text-white/58 text-sm mb-5 leading-relaxed">{t('ctaBody')}</p>
          <Link
            href="/chart"
            className="inline-flex items-center gap-2 px-7 py-3 rounded-lg text-sm font-semibold transition-all duration-200 hover:shadow-lg active:scale-[0.98]"
            style={{ background: 'linear-gradient(135deg, #FFD700 0%, #FF8C00 100%)', color: '#0A0A0F', boxShadow: '0 4px 16px rgba(255,215,0,0.2)' }}
          >
            <span aria-hidden="true">☉</span>
            {t('ctaButton')}
          </Link>
        </section>

        <Disclaimer />
      </div>
    </>
  );
}
