import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getLocale, getTranslations } from 'next-intl/server';
import { createMetadata, JsonLdScript, breadcrumbSchema, faqSchema } from '@/shared/seo';
import { SITE_URL } from '@/shared/seo/constants';
import { SynastryClient } from '@/modules/astro-engine/components/SynastryClient';
import { Disclaimer } from '@/shared/components/Disclaimer';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const tMeta = await getTranslations('pageMeta.synastry');
  return createMetadata({
    title: tMeta('title'),
    description: tMeta('description'),
    path: '/synastry',
    locale: locale as 'en' | 'es',
    keywords: [
      'synastry calculator',
      'astrological compatibility',
      'sidereal synastry',
      'relationship astrology',
      'chart comparison',
    ],
  });
}

function SynastrySkeleton() {
  return (
    <div
      className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] px-4 py-10"
      aria-busy="true"
      aria-label="Loading synastry calculator..."
    >
      <div className="space-y-4 w-full max-w-2xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2].map((i) => (
            <div key={i} className="space-y-3">
              <div className="h-6 w-24 rounded bg-white/4 animate-pulse" />
              {[1, 2, 3].map((j) => (
                <div key={j} className="h-10 rounded-lg bg-white/4 animate-pulse" />
              ))}
            </div>
          ))}
        </div>
        <div className="h-12 rounded-xl bg-white/6 animate-pulse" />
      </div>
    </div>
  );
}

export default async function SynastryPage() {
  const t = await getTranslations('synastry');
  const tEdu = await getTranslations('educational.synastry');

  const synastryBreadcrumb = breadcrumbSchema([
    { name: 'Estrevia', url: SITE_URL },
    { name: 'Synastry Calculator', url: `${SITE_URL}/synastry` },
  ]);

  const faqs = [
    { qKey: 'faq1Q', aKey: 'faq1A' },
    { qKey: 'faq2Q', aKey: 'faq2A' },
    { qKey: 'faq3Q', aKey: 'faq3A' },
    { qKey: 'faq4Q', aKey: 'faq4A' },
    { qKey: 'faq5Q', aKey: 'faq5A' },
  ] as const;

  const synastryFaq = faqSchema(
    faqs.map(({ qKey, aKey }) => ({
      question: t(qKey),
      answer: t(aKey),
    })),
  );

  return (
    <>
      <JsonLdScript schema={synastryBreadcrumb} />
      <JsonLdScript schema={synastryFaq} />

      <Suspense fallback={<SynastrySkeleton />}>
        <SynastryClient />
      </Suspense>

      {/* Educational sections — below widget for SEO depth */}
      <section aria-label={tEdu('sectionAria')} className="px-4 pb-2 max-w-2xl mx-auto mt-16 space-y-10">
        {/* What is synastry */}
        <div>
          <h2
            className="text-xl font-light mb-3 leading-snug"
            style={{ color: '#E8E0D0', fontFamily: 'var(--font-crimson-pro, Georgia, serif)' }}
          >
            {tEdu('whatIs.heading')}
          </h2>
          <p
            className="leading-relaxed text-white/55"
            style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)', fontSize: '0.9375rem' }}
          >
            {tEdu('whatIs.body')}
          </p>
        </div>

        {/* Key aspects */}
        <div>
          <h2
            className="text-xl font-light mb-6 leading-snug"
            style={{ color: '#E8E0D0', fontFamily: 'var(--font-crimson-pro, Georgia, serif)' }}
          >
            {tEdu('keyAspectsHeading')}
          </h2>
          <div className="space-y-7">
            {(
              [
                'sunMoon',
                'venusMars',
                'saturnContacts',
                'moonMoon',
              ] as const
            ).map((key) => (
              <div key={key}>
                <h3
                  className="text-base font-medium mb-2 leading-snug"
                  style={{ color: 'rgba(255,255,255,0.72)', fontFamily: 'var(--font-crimson-pro, Georgia, serif)' }}
                >
                  {tEdu(`${key}.heading`)}
                </h3>
                <p
                  className="leading-relaxed text-white/50"
                  style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)', fontSize: '0.9375rem' }}
                >
                  {tEdu(`${key}.body`)}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Score interpretation */}
        <div>
          <h2
            className="text-xl font-light mb-3 leading-snug"
            style={{ color: '#E8E0D0', fontFamily: 'var(--font-crimson-pro, Georgia, serif)' }}
          >
            {tEdu('scoreInterpretation.heading')}
          </h2>
          <p
            className="leading-relaxed text-white/55"
            style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)', fontSize: '0.9375rem' }}
          >
            {tEdu('scoreInterpretation.body')}
          </p>
        </div>

        {/* Sidereal vs Tropical */}
        <div>
          <h2
            className="text-xl font-light mb-3 leading-snug"
            style={{ color: '#E8E0D0', fontFamily: 'var(--font-crimson-pro, Georgia, serif)' }}
          >
            {tEdu('siderealVsTropical.heading')}
          </h2>
          <p
            className="leading-relaxed text-white/55"
            style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)', fontSize: '0.9375rem' }}
          >
            {tEdu('siderealVsTropical.body')}
          </p>
        </div>

        {/* FAQ */}
        <section aria-label={t('aboutAria')} className="space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-[0.18em] mb-5 text-white/30" style={{ fontFamily: 'var(--font-geist-sans)' }}>
            {t('aboutHeading')}
          </h2>
          {faqs.map(({ qKey, aKey }) => (
            <details
              key={qKey}
              className="group rounded-xl overflow-hidden transition-all"
              style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.015)' }}
            >
              <summary className="px-5 py-3.5 text-sm text-white/58 cursor-pointer select-none hover:bg-white/[0.025] transition-colors list-none flex items-center justify-between">
                {t(qKey)}
                <span className="text-white/22 text-[10px] ml-3 flex-shrink-0 group-open:rotate-180 transition-transform duration-200" aria-hidden="true">▾</span>
              </summary>
              <p
                className="px-5 pb-5 pt-1 leading-relaxed"
                style={{ color: 'rgba(255,255,255,0.42)', fontFamily: 'var(--font-crimson-pro, Georgia, serif)', fontSize: '0.9375rem' }}
              >
                {t(aKey)}
              </p>
            </details>
          ))}
        </section>
      </section>

      <div className="px-4 pb-10 max-w-2xl mx-auto">
        <Disclaimer />
      </div>
    </>
  );
}
