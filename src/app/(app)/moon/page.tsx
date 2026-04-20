import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { createMetadata } from '@/shared/seo/metadata';
import { JsonLdScript, breadcrumbSchema, faqSchema } from '@/shared/seo/json-ld';
import { SITE_URL } from '@/shared/seo/constants';
import { MoonCalendar } from '@/modules/astro-engine/components/MoonCalendar';

export function generateMetadata(): Metadata {
  return createMetadata({
    title: 'Moon Phase Today',
    description:
      'Current moon phase, illumination percentage, and monthly lunar calendar. Track new and full moons with Swiss Ephemeris precision.',
    path: '/moon',
    keywords: [
      'moon phase today',
      'current moon phase',
      'lunar calendar',
      'new moon',
      'full moon',
      'moon illumination',
      'sidereal moon phase',
    ],
  });
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function MoonPage() {
  const t = await getTranslations('moonPage');

  const breadcrumb = breadcrumbSchema([
    { name: 'Estrevia', url: SITE_URL },
    { name: t('breadcrumb'), url: `${SITE_URL}/moon` },
  ]);

  const visibleFaqs = [
    { qKey: 'faq1Q', aKey: 'faq1A' },
    { qKey: 'faq2Q', aKey: 'faq2A' },
    { qKey: 'faq3Q', aKey: 'faq3A' },
  ] as const;

  const faq = faqSchema(
    visibleFaqs.map(({ qKey, aKey }) => ({
      question: t(qKey),
      answer: t(aKey),
    })),
  );

  const relatedLinks = [
    { href: '/chart', label: t('relatedChart') },
    { href: '/hours', label: t('relatedHours') },
    { href: '/why-sidereal', label: t('relatedWhy') },
    { href: '/essays/moon-in-aries', label: t('relatedMoonAries') },
  ];

  return (
    <>
      <JsonLdScript schema={breadcrumb} />
      <JsonLdScript schema={faq} />

      <main className="min-h-screen px-4 py-10 max-w-2xl mx-auto">
        {/* Subtle moon glow — top radial */}
        <div
          className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(192,192,192,0.06) 0%, transparent 70%)',
          }}
          aria-hidden="true"
        />

        {/* Page header */}
        <header className="mb-10 relative">
          {/* Eyebrow */}
          <p
            className="text-[10px] tracking-[0.22em] uppercase mb-3"
            style={{ color: 'rgba(192,192,192,0.45)', fontFamily: 'var(--font-geist-mono, monospace)' }}
          >
            ☽ &nbsp;{t('eyebrow')}
          </p>
          <h1
            className="text-3xl sm:text-4xl font-light leading-tight mb-3"
            style={{ color: '#E8E0D0', fontFamily: 'var(--font-crimson-pro, Georgia, serif)' }}
          >
            {t('h1')}
          </h1>
          <p
            className="text-sm leading-relaxed max-w-md"
            style={{ color: 'rgba(255,255,255,0.42)' }}
          >
            {t('description')}
          </p>
        </header>

        {/* Calendar — client component, fetches its own data */}
        <MoonCalendar />

        {/* Related pages — internal linking for SEO */}
        <nav aria-label={t('relatedAria')} className="mt-16">
          <h2
            className="text-xs font-semibold uppercase tracking-widest mb-4"
            style={{ color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-geist-sans)' }}
          >
            {t('relatedHeading')}
          </h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm list-none" role="list">
            {relatedLinks.map(({ href, label }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="flex items-center gap-2 px-4 py-3 rounded-lg transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.025)',
                    border: '1px solid rgba(255,255,255,0.07)',
                    color: 'rgba(255,255,255,0.55)',
                  }}
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* FAQ — visible content, feeds JSON-LD */}
        <section aria-label={t('aboutAria')} className="mt-12 space-y-3">
          <h2
            className="text-xs font-medium uppercase tracking-[0.18em] mb-5"
            style={{ color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-geist-sans)' }}
          >
            {t('aboutHeading')}
          </h2>

          {visibleFaqs.map(({ qKey, aKey }) => (
            <details
              key={qKey}
              className="group rounded-xl overflow-hidden transition-all"
              style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.015)' }}
            >
              <summary
                className="px-5 py-3.5 text-sm cursor-pointer select-none flex items-center justify-between list-none transition-colors hover:bg-white/[0.025]"
                style={{
                  color: 'rgba(255,255,255,0.55)',
                  fontFamily: 'var(--font-geist-sans)',
                }}
              >
                {t(qKey)}
                <span
                  className="text-[10px] ml-3 flex-shrink-0 group-open:rotate-180 transition-transform duration-200"
                  style={{ color: 'rgba(255,255,255,0.22)' }}
                  aria-hidden="true"
                >
                  ▾
                </span>
              </summary>
              <p
                className="px-5 pb-5 pt-1 text-sm leading-relaxed"
                style={{ color: 'rgba(255,255,255,0.42)', fontFamily: 'var(--font-crimson-pro, Georgia, serif)', fontSize: '0.9375rem' }}
              >
                {t(aKey)}
              </p>
            </details>
          ))}
        </section>
      </main>
    </>
  );
}
