/**
 * /pricing — Pricing page
 *
 * Server Component. Two tiers: Free and Premium.
 * CTA button for Premium triggers POST /api/v1/stripe/checkout from a client
 * component to avoid a full page reload.
 */

import type { Metadata } from 'next';
import { createMetadata, JsonLdScript, faqSchema, breadcrumbSchema } from '@/shared/seo';
import { SITE_URL } from '@/shared/seo/constants';
import { PricingToggle } from './PricingToggle';

export function generateMetadata(): Metadata {
  return createMetadata({
    title: 'Pricing — Free & Premium Plans',
    description:
      'Estrevia is free to use. Upgrade to Premium for unlimited saved charts, detailed aspects, future transits, and priority support.',
    path: '/pricing',
    keywords: ['estrevia pricing', 'sidereal astrology premium', 'natal chart unlimited'],
  });
}

const breadcrumbLd = breadcrumbSchema([
  { name: 'Estrevia', url: SITE_URL },
  { name: 'Pricing', url: `${SITE_URL}/pricing` },
]);

const faqJsonLd = faqSchema([
  {
    question: 'Is Estrevia free?',
    answer:
      'Yes — chart calculation, moon phases, planetary hours, and basic saved charts are free forever. Premium adds unlimited saves, detailed aspect analysis, and future transits.',
  },
  {
    question: 'Can I cancel anytime?',
    answer:
      'Yes. Cancel from the billing portal in Settings. Your premium access continues until the end of the current billing period.',
  },
  {
    question: 'What payment methods are accepted?',
    answer:
      'All major credit and debit cards via Stripe. Apple Pay and Google Pay are available on supported devices.',
  },
]);

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function PricingPage() {
  return (
    <>
      <JsonLdScript schema={breadcrumbLd} />
      <JsonLdScript schema={faqJsonLd} />

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
              Plans & Pricing
            </div>
            <h1
              className="text-4xl sm:text-5xl font-light text-white mb-4 leading-tight"
              style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)' }}
            >
              Simple, transparent pricing
            </h1>
            <p className="text-base text-white/75 max-w-md mx-auto leading-relaxed">
              Start free. Upgrade when you need more. No hidden fees.
            </p>
          </div>

          {/* Pricing cards with monthly/annual toggle */}
          <PricingToggle />

          {/* Trust signals */}
          <div className="mt-12 text-center">
            <p className="text-xs text-white/60 mb-3">
              Payments processed by Stripe. Cancel anytime from Settings.
            </p>
            <div className="flex items-center justify-center gap-6">
              {['No contracts', 'Cancel anytime', 'Secure payments'].map((item) => (
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
              Questions
            </h2>
            <dl className="space-y-4">
              {[
                {
                  question: 'Is Estrevia free?',
                  answer:
                    'Yes — chart calculation, moon phases, planetary hours, and basic saved charts are free forever. Premium adds unlimited saves and detailed analysis.',
                },
                {
                  question: 'Can I cancel anytime?',
                  answer:
                    'Yes. Cancel from the billing portal in Settings. Premium access continues until the end of the billing period — no partial refunds needed.',
                },
                {
                  question: 'What payment methods are accepted?',
                  answer:
                    'All major credit/debit cards via Stripe. Apple Pay and Google Pay available on supported devices.',
                },
              ].map(({ question, answer }) => (
                <div
                  key={question}
                  className="rounded-xl border border-white/6 p-5"
                  style={{ background: 'rgba(255,255,255,0.02)' }}
                >
                  <dt
                    className="text-sm font-medium text-white/80 mb-2"
                    style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)' }}
                  >
                    {question}
                  </dt>
                  <dd className="text-sm text-white/75 leading-relaxed">{answer}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </>
  );
}
