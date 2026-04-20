import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { createMetadata, JsonLdScript, organizationSchema, softwareAppSchema, howToSchema, faqSchema } from '@/shared/seo';
import { HeroCalculator } from '@/modules/astro-engine/components/HeroCalculator';
import { LandingAnimations } from './LandingAnimations';
import { WaitlistForm } from './WaitlistForm';
import { NewFeatureCards } from './NewFeatureCards';

// ── Metadata ──────────────────────────────────────────────────────────────────
export async function generateMetadata(): Promise<Metadata> {
  return createMetadata({
    title: 'Sidereal Astrology — True Natal Chart Calculator',
    description:
      'Calculate your sidereal natal chart. Discover your true zodiac sign with Swiss Ephemeris precision, planetary hours, and esoteric correspondences.',
    path: '/',
    keywords: [
      'sidereal astrology',
      'natal chart calculator',
      'true zodiac sign',
      'Lahiri ayanamsa',
      'Swiss Ephemeris',
      'planetary hours',
      'sidereal vs tropical',
    ],
  });
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default async function LandingPage() {
  const t = await getTranslations('landing');

  // Structural data only — text comes from translations by key
  const features = [
    { glyph: '☉', color: '#FFD700', titleKey: 'feature1Title', descKey: 'feature1Desc' },
    { glyph: '☽', color: '#C0C0C0', titleKey: 'feature2Title', descKey: 'feature2Desc' },
    { glyph: '♄', color: '#B8860B', titleKey: 'feature3Title', descKey: 'feature3Desc' },
    { glyph: '∴', color: '#9B8EC4', titleKey: 'feature4Title', descKey: 'feature4Desc' },
  ] as const;

  const howSteps = [
    { step: '01', titleKey: 'stepEnterTitle', descKey: 'stepEnterDesc' },
    { step: '02', titleKey: 'stepSeeTitle', descKey: 'stepSeeDesc' },
    { step: '03', titleKey: 'stepShareTitle', descKey: 'stepShareDesc' },
  ] as const;

  const stats = [
    { valueKey: 'stat1Value', labelKey: 'stat1Label', noteKey: 'stat1Note' },
    { valueKey: 'stat2Value', labelKey: 'stat2Label', noteKey: 'stat2Note' },
    { valueKey: 'stat3Value', labelKey: 'stat3Label', noteKey: 'stat3Note' },
  ] as const;

  const faqs = [
    { qKey: 'faq1Q', aKey: 'faq1A' },
    { qKey: 'faq2Q', aKey: 'faq2A' },
    { qKey: 'faq3Q', aKey: 'faq3A' },
    { qKey: 'faq4Q', aKey: 'faq4A' },
  ] as const;

  // ── JSON-LD schemas (locale-aware) ──────────────────────────────────────────
  const howToJsonLd = howToSchema({
    name: t('howHeading'),
    description: t('howSubtitle'),
    totalTime: 'PT2M',
    steps: howSteps.map(({ titleKey, descKey }) => ({
      name: t(titleKey),
      text: t(descKey),
    })),
  });

  const faqJsonLd = faqSchema(
    faqs.map(({ qKey, aKey }) => ({
      question: t(qKey),
      answer: t(aKey),
    })),
  );

  return (
    <>
      <JsonLdScript schema={organizationSchema()} />
      <JsonLdScript schema={softwareAppSchema()} />
      <JsonLdScript schema={howToJsonLd} />
      <JsonLdScript schema={faqJsonLd} />

      {/* Noise texture overlay — anti-flat-background */}
      <div
        className="fixed inset-0 pointer-events-none z-0 opacity-[0.025]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'repeat',
          backgroundSize: '128px 128px',
        }}
        aria-hidden="true"
      />

      <LandingAnimations>
        {/* ── Hero ──────────────────────────────────────────────────────────── */}
        <section
          className="relative min-h-[90svh] flex flex-col items-center justify-center px-4 sm:px-6 pt-16 pb-20"
          aria-labelledby="hero-heading"
          data-section="hero"
        >
          {/* Star-field radial gradient */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'radial-gradient(ellipse 80% 60% at 50% 20%, rgba(255,215,0,0.05) 0%, transparent 60%)',
            }}
            aria-hidden="true"
          />

          <div className="relative z-10 w-full max-w-2xl mx-auto text-center">
            {/* Eyebrow */}
            <div
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#FFD700]/20 text-[11px] tracking-[0.2em] uppercase text-[#FFD700]/60 mb-8"
              data-animate="fade-down"
            >
              <span aria-hidden="true">☉</span>
              {t('heroEyebrow')}
            </div>

            {/* Headline */}
            <h1
              id="hero-heading"
              className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-light leading-[1.08] tracking-tight text-white mb-6"
              style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)' }}
              data-animate="fade-up-1"
            >
              {t('heroLine1')}
              <br />
              <em className="not-italic text-[#FFD700]">{t('heroLine2')}</em>
            </h1>

            {/* Subtext */}
            <p
              className="text-base sm:text-lg text-white/50 leading-relaxed max-w-xl mx-auto mb-10"
              data-animate="fade-up-2"
            >
              {t('heroSubtext')}
            </p>

            {/* Calculator card */}
            <div
              className="relative rounded-2xl border border-white/8 p-5 sm:p-7 text-left"
              style={{ background: 'rgba(255,255,255,0.02)' }}
              data-animate="fade-up-3"
            >
              <Suspense fallback={<CalculatorSkeleton />}>
                <HeroCalculator />
              </Suspense>
            </div>

            {/* Trust line */}
            <p
              className="mt-5 text-xs text-white/60 tracking-wide"
              data-animate="fade-up-4"
            >
              {t('heroTrust')}
            </p>
          </div>
        </section>

        {/* ── How it works ──────────────────────────────────────────────────── */}
        <section
          className="relative px-4 sm:px-6 py-24"
          aria-labelledby="how-heading"
          data-section="how"
        >
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-14" data-animate="fade-up-0">
              <h2
                id="how-heading"
                className="text-3xl sm:text-4xl font-light text-white mb-3"
                style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)' }}
              >
                {t('howHeading')}
              </h2>
              <p className="text-sm text-white/70 max-w-md mx-auto">
                {t('howSubtitle')}
              </p>
            </div>

            <ol className="grid grid-cols-1 sm:grid-cols-3 gap-6 list-none" role="list">
              {howSteps.map(({ step, titleKey, descKey }, i) => (
                <li
                  key={step}
                  data-animate={`fade-up-${i}`}
                  className="relative flex flex-col gap-4 rounded-2xl border border-white/6 p-6"
                  style={{ background: 'rgba(255,255,255,0.02)' }}
                >
                  <span
                    className="text-xs tracking-[0.2em] uppercase"
                    style={{ color: 'rgba(255,215,0,0.5)', fontFamily: 'var(--font-geist-mono, monospace)' }}
                    aria-label={t('stepAria', { step })}
                  >
                    {step}
                  </span>
                  <h3 className="text-lg font-medium text-white/90">{t(titleKey)}</h3>
                  <p className="text-sm text-white/45 leading-relaxed flex-1">{t(descKey)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── Feature cards ─────────────────────────────────────────────────── */}
        <section
          className="relative px-4 sm:px-6 py-20"
          aria-labelledby="features-heading"
          data-section="features"
        >
          {/* Subtle divider line */}
          <div
            className="absolute top-0 inset-x-0 h-px"
            style={{ background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.06), transparent)' }}
            aria-hidden="true"
          />

          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-14" data-animate="fade-up-0">
              <h2
                id="features-heading"
                className="text-3xl sm:text-4xl font-light text-white mb-3"
                style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)' }}
              >
                {t('featuresHeading')}
              </h2>
            </div>

            <ul
              className="grid grid-cols-1 sm:grid-cols-2 gap-5 list-none"
              aria-label={t('featuresAria')}
            >
              {features.map(({ glyph, color, titleKey, descKey }, i) => (
                <li
                  key={titleKey}
                  data-animate={`fade-up-${i}`}
                  className="flex flex-col gap-4 rounded-2xl border border-white/6 p-6 group transition-all duration-300 hover:border-white/15 hover:shadow-lg"
                  style={{
                    background: 'rgba(255,255,255,0.02)',
                    '--planet-color': color,
                  } as React.CSSProperties}
                >
                  <span
                    className="text-2xl transition-transform duration-200 group-hover:scale-110 origin-left"
                    style={{ color }}
                    aria-hidden="true"
                  >
                    {glyph}
                  </span>
                  <h3 className="text-base font-semibold text-white/90 tracking-wide">{t(titleKey)}</h3>
                  <p className="text-sm text-white/45 leading-relaxed">{t(descKey)}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── New module feature cards (Synastry, Tarot, Tree of Life) ──── */}
        <NewFeatureCards />

        {/* ── Social proof ──────────────────────────────────────────────────── */}
        <section
          className="relative px-4 sm:px-6 py-20"
          aria-labelledby="stats-heading"
          data-section="stats"
        >
          <div
            className="absolute top-0 inset-x-0 h-px"
            style={{ background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.06), transparent)' }}
            aria-hidden="true"
          />

          <div className="max-w-5xl mx-auto text-center" data-animate="fade-up-0">
            <h2
              id="stats-heading"
              className="text-2xl sm:text-3xl font-light text-white/80 mb-3"
              style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)' }}
            >
              {t('statsHeading')}
            </h2>
            <p className="text-sm text-white/70 mb-12 max-w-md mx-auto">
              {t('statsSubtitle')}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
              {stats.map(({ valueKey, labelKey, noteKey }) => (
                <div key={labelKey} className="flex flex-col items-center gap-1">
                  <span
                    className="text-4xl sm:text-5xl font-light text-[#FFD700]"
                    style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)' }}
                  >
                    {t(valueKey)}
                  </span>
                  <span className="text-sm font-medium text-white/70">{t(labelKey)}</span>
                  <span className="text-xs text-white/60">{t(noteKey)}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── FAQ ───────────────────────────────────────────────────────────── */}
        <section
          className="relative px-4 sm:px-6 py-20"
          aria-labelledby="faq-heading"
          data-section="faq"
        >
          <div
            className="absolute top-0 inset-x-0 h-px"
            style={{ background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.06), transparent)' }}
            aria-hidden="true"
          />

          <div className="max-w-2xl mx-auto">
            <h2
              id="faq-heading"
              className="text-3xl font-light text-white mb-10 text-center"
              style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)' }}
              data-animate="fade-up-0"
            >
              {t('faqHeading')}
            </h2>

            <dl className="space-y-6">
              {faqs.map(({ qKey, aKey }, i) => (
                <div
                  key={qKey}
                  data-animate={`fade-up-${i}`}
                  className="rounded-xl border border-white/6 p-5"
                  style={{ background: 'rgba(255,255,255,0.02)' }}
                >
                  <dt
                    className="text-base font-medium text-white/85 mb-3"
                    style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)' }}
                  >
                    {t(qKey)}
                  </dt>
                  <dd className="text-sm text-white/50 leading-relaxed">{t(aKey)}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* ── Waitlist CTA ──────────────────────────────────────────────────── */}
        <section
          className="relative px-4 sm:px-6 py-24"
          aria-labelledby="waitlist-heading"
          data-section="waitlist"
        >
          <div
            className="absolute top-0 inset-x-0 h-px"
            style={{ background: 'linear-gradient(to right, transparent, rgba(255,215,0,0.15), transparent)' }}
            aria-hidden="true"
          />
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'radial-gradient(ellipse 70% 50% at 50% 50%, rgba(255,215,0,0.04) 0%, transparent 70%)',
            }}
            aria-hidden="true"
          />

          <div className="relative max-w-xl mx-auto text-center" data-animate="fade-up-0">
            <p className="text-xs tracking-[0.2em] uppercase text-[#FFD700]/50 mb-4">
              {t('waitlistEyebrow')}
            </p>
            <h2
              id="waitlist-heading"
              className="text-3xl sm:text-4xl font-light text-white mb-4"
              style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)' }}
            >
              {t('waitlistHeading')}
            </h2>
            <p className="text-sm text-white/45 mb-8 leading-relaxed">
              {t('waitlistSubtitle')}
            </p>

            <WaitlistForm />

            <p className="mt-4 text-xs text-white/60">
              {t('waitlistDisclaimer')}
            </p>
          </div>
        </section>

        {/* ── Final CTA strip ───────────────────────────────────────────────── */}
        <div
          className="px-4 sm:px-6 py-12 border-t border-white/6 text-center"
          data-section="final-cta"
          data-animate="fade-up-0"
        >
          <Link
            href="/chart"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl text-[#0A0A0F] text-sm font-semibold tracking-wide transition-all duration-200 hover:shadow-xl active:scale-[0.98]"
            style={{
              background: 'linear-gradient(135deg, #FFD700 0%, #FF8C00 100%)',
              boxShadow: '0 4px 24px rgba(255,215,0,0.28)',
            }}
          >
            <span aria-hidden="true">☉</span>
            {t('finalCta')}
          </Link>
        </div>
      </LandingAnimations>
    </>
  );
}

// ── Skeleton fallback for HeroCalculator ─────────────────────────────────────
function CalculatorSkeleton() {
  return (
    <div className="space-y-3 animate-pulse" aria-hidden="true">
      <div className="h-11 rounded-xl bg-white/5" />
      <div className="h-11 rounded-xl bg-white/5" />
      <div className="h-12 rounded-xl bg-[#FFD700]/15" />
    </div>
  );
}
