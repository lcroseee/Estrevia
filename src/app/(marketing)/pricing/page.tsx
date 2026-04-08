/**
 * /pricing — Pricing page
 *
 * Server Component. Two tiers: Free and Premium.
 * CTA button for Premium triggers POST /api/v1/stripe/checkout from a client
 * component to avoid a full page reload.
 */

import type { Metadata } from 'next';
import { createMetadata, JsonLdScript, faqSchema } from '@/shared/seo';
import { PricingUpgradeButton } from './PricingUpgradeButton';

export function generateMetadata(): Metadata {
  return createMetadata({
    title: 'Pricing — Free & Premium Plans',
    description:
      'Estrevia is free to use. Upgrade to Premium for unlimited saved charts, detailed aspects, future transits, and priority support.',
    path: '/pricing',
    keywords: ['estrevia pricing', 'sidereal astrology premium', 'natal chart unlimited'],
  });
}

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
// Tier data
// ---------------------------------------------------------------------------
const FREE_FEATURES = [
  'Natal chart calculation (Swiss Ephemeris)',
  'Moon phases and lunar calendar',
  'Planetary hours for your location',
  '777 esoteric correspondences',
  'Up to 3 saved charts',
  'Cosmic Passport sharing',
];

const PREMIUM_FEATURES = [
  'Everything in Free',
  'Unlimited saved charts',
  'Detailed aspect analysis (orbs, applying/separating)',
  'Future transits (Phase 2)',
  'Priority support',
  'Early access to new features',
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function PricingPage() {
  return (
    <>
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
            <p className="text-base text-white/45 max-w-md mx-auto leading-relaxed">
              Start free. Upgrade when you need more. No hidden fees.
            </p>
          </div>

          {/* Pricing cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {/* Free tier */}
            <div
              className="flex flex-col rounded-2xl border border-white/8 p-8"
              style={{ background: 'rgba(255,255,255,0.02)' }}
            >
              <div className="mb-6">
                <div className="text-xs tracking-[0.2em] uppercase text-white/40 mb-3">
                  Free
                </div>
                <div className="flex items-end gap-1 mb-4">
                  <span
                    className="text-5xl font-light text-white"
                    style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)' }}
                  >
                    $0
                  </span>
                  <span className="text-sm text-white/35 mb-2">/ forever</span>
                </div>
                <p className="text-sm text-white/45 leading-relaxed">
                  Full chart calculation and core tools. No account required for
                  calculation.
                </p>
              </div>

              <ul className="space-y-3 flex-1 mb-8" role="list" aria-label="Free plan features">
                {FREE_FEATURES.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <span className="text-white/30 mt-0.5 flex-shrink-0" aria-hidden="true">
                      ✓
                    </span>
                    <span className="text-sm text-white/60">{feature}</span>
                  </li>
                ))}
              </ul>

              <div
                className="w-full py-3 px-6 rounded-xl border border-white/10 text-sm text-white/40 text-center"
                aria-label="Current plan — Free"
              >
                Current plan
              </div>
            </div>

            {/* Premium tier */}
            <div
              className="flex flex-col rounded-2xl border border-[#FFD700]/25 p-8 relative overflow-hidden"
              style={{ background: 'rgba(255,215,0,0.03)' }}
            >
              {/* Glow */}
              <div
                className="absolute top-0 inset-x-0 h-px"
                style={{
                  background:
                    'linear-gradient(to right, transparent, rgba(255,215,0,0.4), transparent)',
                }}
                aria-hidden="true"
              />

              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <div className="text-xs tracking-[0.2em] uppercase text-[#FFD700]/70">
                    Premium
                  </div>
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-full bg-[#FFD700]/10 text-[#FFD700]/70 border border-[#FFD700]/20 tracking-wide uppercase"
                  >
                    Popular
                  </span>
                </div>
                <div className="flex items-end gap-1 mb-4">
                  <span
                    className="text-5xl font-light text-[#FFD700]"
                    style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)' }}
                  >
                    $9
                  </span>
                  <span className="text-sm text-white/35 mb-2">/ month</span>
                </div>
                <p className="text-sm text-white/45 leading-relaxed">
                  For serious practitioners. Unlimited saves, deep analysis,
                  and early access to every new feature.
                </p>
              </div>

              <ul
                className="space-y-3 flex-1 mb-8"
                role="list"
                aria-label="Premium plan features"
              >
                {PREMIUM_FEATURES.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <span
                      className="flex-shrink-0 mt-0.5"
                      style={{ color: 'rgba(255,215,0,0.6)' }}
                      aria-hidden="true"
                    >
                      ✓
                    </span>
                    <span className="text-sm text-white/70">{feature}</span>
                  </li>
                ))}
              </ul>

              <PricingUpgradeButton />
            </div>
          </div>

          {/* Trust signals */}
          <div className="mt-12 text-center">
            <p className="text-xs text-white/25 mb-3">
              Payments processed by Stripe. Cancel anytime from Settings.
            </p>
            <div className="flex items-center justify-center gap-6">
              {['No contracts', 'Cancel anytime', 'Secure payments'].map((item) => (
                <span key={item} className="text-xs text-white/30">
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
                  <dd className="text-sm text-white/45 leading-relaxed">{answer}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </>
  );
}
