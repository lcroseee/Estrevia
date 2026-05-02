import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getTranslations, getLocale } from 'next-intl/server';
import { createMetadata } from '@/shared/seo/metadata';
import { JsonLdScript, breadcrumbSchema, faqSchema } from '@/shared/seo/json-ld';
import { SITE_URL } from '@/shared/seo/constants';
import { PlanetaryHoursGrid } from '@/modules/astro-engine/components/PlanetaryHoursGrid';
import { Disclaimer } from '@/shared/components/Disclaimer';

export async function generateMetadata(): Promise<Metadata> {
  const tMeta = await getTranslations('pageMeta.hours');
  const locale = await getLocale();
  return createMetadata({
    title: tMeta('title'),
    description: tMeta('description'),
    path: '/hours',
    keywords: [
      'planetary hours',
      'chaldean hours',
      'astrology hours today',
      'planet of the hour',
      'sidereal planetary hours',
    ],
  locale: locale as 'en' | 'es',
  });
}

async function GridSkeleton() {
  const t = await getTranslations('hoursPage');
  return (
    <div aria-busy="true" aria-label={t('loadingAria')} className="flex flex-col gap-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="h-14 rounded-lg bg-white/5 animate-pulse"
          style={{ opacity: 1 - i * 0.05 }}
        />
      ))}
    </div>
  );
}

export default async function HoursPage() {
  const t = await getTranslations('hoursPage');
  const tEdu = await getTranslations('educational.hours');

  const breadcrumb = breadcrumbSchema([
    { name: 'Estrevia', url: SITE_URL },
    { name: t('breadcrumb'), url: `${SITE_URL}/hours` },
  ]);

  const faqs = [
    { qKey: 'faq1Q', aKey: 'faq1A' },
    { qKey: 'faq2Q', aKey: 'faq2A' },
    { qKey: 'faq3Q', aKey: 'faq3A' },
    { qKey: 'faq4Q', aKey: 'faq4A' },
    { qKey: 'faq5Q', aKey: 'faq5A' },
  ] as const;

  const hoursForq = faqSchema(
    faqs.map(({ qKey, aKey }) => ({
      question: t(qKey),
      answer: t(aKey),
    })),
  );

  return (
    <>
      <JsonLdScript schema={breadcrumb} />
      <JsonLdScript schema={hoursForq} />

      <main className="min-h-screen px-4 py-10 max-w-2xl mx-auto">
        {/* Subtle warm glow from above */}
        <div
          className="fixed top-0 left-1/2 -translate-x-1/2 w-[500px] h-[250px] pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(147,112,219,0.05) 0%, transparent 70%)',
          }}
          aria-hidden="true"
        />

        {/* Page header */}
        <header className="mb-10 relative">
          <p
            className="text-[10px] tracking-[0.22em] uppercase mb-3"
            style={{ color: 'rgba(147,112,219,0.5)', fontFamily: 'var(--font-geist-mono, monospace)' }}
          >
            ♄ &nbsp;{t('eyebrow')}
          </p>
          <h1
            className="text-3xl sm:text-4xl font-light leading-tight mb-3"
            style={{ color: '#E8E0D0', fontFamily: 'var(--font-crimson-pro, Georgia, serif)' }}
          >
            {t('h1')}
          </h1>
          <p className="text-sm text-white/42 leading-relaxed max-w-md">
            {t('description')}
          </p>
        </header>

        {/* Grid */}
        <Suspense fallback={await GridSkeleton()}>
          <PlanetaryHoursGrid />
        </Suspense>

        {/* FAQ — visible content, also feeds JSON-LD */}
        <section aria-label={t('aboutAria')} className="mt-14 space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-[0.18em] mb-5 text-white/30 font-[var(--font-geist-sans)]">
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

        {/* Educational sections — below widget for SEO depth */}
        <section aria-label={tEdu('sectionAria')} className="mt-16 space-y-10">
          {(
            [
              'whatAreThey',
              'howToUse',
              'dayRuler',
              'whySidereal',
            ] as const
          ).map((key) => (
            <div key={key}>
              <h2
                className="text-xl font-light mb-3 leading-snug"
                style={{ color: '#E8E0D0', fontFamily: 'var(--font-crimson-pro, Georgia, serif)' }}
              >
                {tEdu(`${key}.heading`)}
              </h2>
              <p
                className="leading-relaxed text-white/55"
                style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)', fontSize: '0.9375rem' }}
              >
                {tEdu(`${key}.body`)}
              </p>
            </div>
          ))}
        </section>

        <Disclaimer />
      </main>
    </>
  );
}
