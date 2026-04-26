/**
 * /pricing — Pricing page
 *
 * Server Component. Two tiers: Free and Premium.
 * CTA button for Premium triggers POST /api/v1/stripe/checkout from a client
 * component to avoid a full page reload.
 */

import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { createMetadata, JsonLdScript, faqSchema, breadcrumbSchema, productSchema } from '@/shared/seo';
import { SITE_URL } from '@/shared/seo/constants';
import { PricingToggle } from './PricingToggle';

// Dynamic rendering required so the NEXT_LOCALE cookie is honored.
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const tMeta = await getTranslations('pageMeta.pricing');
  return createMetadata({
    title: tMeta('title'),
    description: tMeta('description'),
    path: '/pricing',
    keywords: ['estrevia pricing', 'sidereal astrology premium', 'natal chart unlimited'],
  });
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default async function PricingPage() {
  const t = await getTranslations('pricing');

  const breadcrumbLd = breadcrumbSchema([
    { name: 'Estrevia', url: SITE_URL },
    { name: t('title'), url: `${SITE_URL}/pricing` },
  ]);

  const faqs = [
    { qKey: 'faq1Q', aKey: 'faq1A' },
    { qKey: 'faq2Q', aKey: 'faq2A' },
    { qKey: 'faq3Q', aKey: 'faq3A' },
  ] as const;

  const faqJsonLd = faqSchema(
    faqs.map(({ qKey, aKey }) => ({
      question: t(qKey),
      answer: t(aKey),
    })),
  );

  // Product schema — enables Rich Results eligibility for pricing queries.
  // Two offers: Free (price 0) and Premium (billed monthly; annual is a variant).
  // Prices are kept as static strings here — match Stripe price configuration.
  const productJsonLd = productSchema({
    name: 'Estrevia Sidereal Astrology',
    description:
      'Sidereal natal chart calculator. Free plan includes one chart. Premium unlocks unlimited saved charts, detailed aspects, future transits, and synastry.',
    offers: [
      {
        price: '0',
        priceCurrency: 'USD',
        availability: 'https://schema.org/InStock',
        url: `${SITE_URL}/pricing`,
      },
      {
        price: '4.99',
        priceCurrency: 'USD',
        availability: 'https://schema.org/InStock',
        url: `${SITE_URL}/pricing`,
      },
      {
        price: '34.99',
        priceCurrency: 'USD',
        availability: 'https://schema.org/InStock',
        url: `${SITE_URL}/pricing`,
      },
    ],
  });

  const trustItems = [
    t('trustNoContracts'),
    t('trustCancel'),
    t('trustSecure'),
  ];

  return (
    <>
      <JsonLdScript schema={breadcrumbLd} />
      <JsonLdScript schema={faqJsonLd} />
      <JsonLdScript schema={productJsonLd} />

      <div className="min-h-screen bg-[#0A0A0F]">
        {/* Noise texture */}
        <div
          className="fixed inset-0 pointer-events-none z-0 opacity-[0.025]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'repeat',
            backgroundSize: '128px 128px',
          }}
          aria-hidden="true"
        />

        <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 py-20">
          {/* Header */}
          <div className="text-center mb-16">
            <div
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#FFD700]/20 text-[11px] tracking-[0.2em] uppercase text-[#FFD700]/60 mb-8"
            >
              <span aria-hidden="true">♄</span>
              {t('eyebrow')}
            </div>
            <h1
              className="text-4xl sm:text-5xl font-light text-white mb-4 leading-tight"
              style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)' }}
            >
              {t('heading')}
            </h1>
            <p className="text-base text-white/75 max-w-md mx-auto leading-relaxed">
              {t('subheading')}
            </p>
          </div>

          {/* Pricing cards with monthly/annual toggle */}
          <PricingToggle />

          {/* Trust signals */}
          <div className="mt-12 text-center">
            <p className="text-xs text-white/60 mb-3">
              {t('trustNote')}
            </p>
            <div className="flex items-center justify-center gap-6">
              {trustItems.map((item) => (
                <span key={item} className="text-xs text-white/65">
                  {item}
                </span>
              ))}
            </div>
          </div>

          {/* FAQ */}
          <div className="mt-20 max-w-2xl mx-auto">
            <h2
              className="text-2xl font-light text-white mb-8 text-center"
              style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)' }}
            >
              {t('questionsHeading')}
            </h2>
            <dl className="space-y-4">
              {faqs.map(({ qKey, aKey }) => (
                <div
                  key={qKey}
                  className="rounded-xl border border-white/6 p-5"
                  style={{ background: 'rgba(255,255,255,0.02)' }}
                >
                  <dt
                    className="text-sm font-medium text-white/80 mb-2"
                    style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)' }}
                  >
                    {t(qKey)}
                  </dt>
                  <dd className="text-sm text-white/75 leading-relaxed">{t(aKey)}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </>
  );
}
