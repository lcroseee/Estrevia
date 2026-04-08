import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { createMetadata, JsonLdScript, softwareAppSchema, howToSchema, faqSchema } from '@/shared/seo';
import { HeroCalculator } from '@/modules/astro-engine/components/HeroCalculator';
import { LandingAnimations } from './LandingAnimations';
import { WaitlistForm } from './WaitlistForm';

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

// ── JSON-LD schemas ───────────────────────────────────────────────────────────
const howToJsonLd = howToSchema({
  name: 'How to Calculate Your Sidereal Natal Chart',
  description:
    'A step-by-step guide to finding your true zodiac sign using sidereal astrology and Swiss Ephemeris calculations.',
  totalTime: 'PT2M',
  steps: [
    { name: 'Enter your birth date', text: 'Type your date of birth in the calculator.' },
    { name: 'Select your birth city', text: 'Choose your birth city from the autocomplete list.' },
    { name: 'See your sidereal chart', text: 'View your natal chart calculated with Lahiri ayanamsa and Swiss Ephemeris precision.' },
    { name: 'Share your Cosmic Passport', text: 'Generate a shareable card with your Sun, Moon, and Ascendant signs.' },
  ],
});

const faqJsonLd = faqSchema([
  {
    question: 'What is the difference between sidereal and tropical astrology?',
    answer:
      'Tropical astrology fixes the zodiac to the equinoxes (the Sun enters Aries on the spring equinox). Sidereal astrology aligns the zodiac to the actual star constellations. Due to the precession of the equinoxes — a wobble in Earth\'s axis — the two systems are currently ~24° apart. Most people in sidereal astrology discover their Sun is in the previous tropical sign.',
  },
  {
    question: 'What is the Lahiri ayanamsa?',
    answer:
      'The ayanamsa is the angular offset between the tropical and sidereal zodiacs. Lahiri (also called Chitrapaksha) is the official ayanamsa adopted by the Indian government and most used in Vedic/Jyotish astrology. As of 2024 it is approximately 23°49′.',
  },
  {
    question: 'How accurate is the chart calculation?',
    answer:
      'Estrevia uses Swiss Ephemeris — the same engine used by professional astrology software like Solar Fire and Astro.com. Accuracy is ±0.01° for all 12 celestial bodies (Sun through Pluto, North Node, Chiron). Over 100 reference charts are verified in CI against Astro.com.',
  },
  {
    question: 'What is a Cosmic Passport?',
    answer:
      'The Cosmic Passport is a shareable card showing your sidereal Sun, Moon, and Ascendant signs along with your dominant element and the rarity of your combination (e.g., "1 of 8%"). You can share it on social media or download it as a PNG for Instagram Stories.',
  },
]);

// ── Feature cards data ────────────────────────────────────────────────────────
const FEATURES = [
  {
    glyph: '☉',
    color: '#FFD700',
    title: 'Natal Chart',
    description:
      'Full sidereal natal chart with 12 celestial bodies, Placidus houses, aspects, and degree positions. Swiss Ephemeris precision.',
  },
  {
    glyph: '☽',
    color: '#C0C0C0',
    title: 'Moon Phases',
    description:
      'Live moon phase with illumination percentage, ingress times, and a 30-day calendar. See exact New and Full Moon moments.',
  },
  {
    glyph: '♄',
    color: '#B8860B',
    title: 'Planetary Hours',
    description:
      'Classical Chaldean planetary hours for your location. Know which planet governs the current hour and plan accordingly.',
  },
  {
    glyph: '∴',
    color: '#9B8EC4',
    title: '777 Correspondences',
    description:
      'Crowley\'s 777 — colors, gems, incense, deities, Kabbalistic paths — mapped to every planet and sign. Pre-1929 texts, public domain.',
  },
] as const;

// ── How it works steps ────────────────────────────────────────────────────────
const HOW_IT_WORKS = [
  {
    step: '01',
    title: 'Enter birth data',
    description: 'Date and birth city. Time is optional — without it you still get planetary signs.',
  },
  {
    step: '02',
    title: 'See your chart',
    description: 'Sidereal positions calculated via Swiss Ephemeris, corrected for Lahiri ayanamsa.',
  },
  {
    step: '03',
    title: 'Share your Passport',
    description: 'Generate a Cosmic Passport card with your Sun, Moon, ASC — shareable in one tap.',
  },
] as const;

// ── Page ──────────────────────────────────────────────────────────────────────
export default function LandingPage() {
  return (
    <>
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
              Sidereal · Lahiri · Swiss Ephemeris
            </div>

            {/* Headline */}
            <h1
              id="hero-heading"
              className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-light leading-[1.08] tracking-tight text-white mb-6"
              style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)' }}
              data-animate="fade-up-1"
            >
              Your True
              <br />
              <em className="not-italic text-[#FFD700]">Zodiac Sign</em>
            </h1>

            {/* Subtext */}
            <p
              className="text-base sm:text-lg text-white/50 leading-relaxed max-w-xl mx-auto mb-10"
              data-animate="fade-up-2"
            >
              Western astrology froze the zodiac to the seasons in 100 AD. The sky has
              shifted 24° since then. Sidereal astrology tracks the actual constellations —
              most people discover their Sun is in a different sign entirely.
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
              className="mt-5 text-xs text-white/25 tracking-wide"
              data-animate="fade-up-4"
            >
              No account needed · Calculation takes under 2 seconds
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
                How it works
              </h2>
              <p className="text-sm text-white/40 max-w-md mx-auto">
                From birth data to shareable card in under a minute.
              </p>
            </div>

            <ol className="grid grid-cols-1 sm:grid-cols-3 gap-6 list-none" role="list">
              {HOW_IT_WORKS.map(({ step, title, description }, i) => (
                <li
                  key={step}
                  data-animate={`fade-up-${i}`}
                  className="relative flex flex-col gap-4 rounded-2xl border border-white/6 p-6"
                  style={{ background: 'rgba(255,255,255,0.02)' }}
                >
                  <span
                    className="text-xs tracking-[0.2em] uppercase"
                    style={{ color: 'rgba(255,215,0,0.5)', fontFamily: 'var(--font-geist-mono, monospace)' }}
                    aria-label={`Step ${step}`}
                  >
                    {step}
                  </span>
                  <h3 className="text-lg font-medium text-white/90">{title}</h3>
                  <p className="text-sm text-white/45 leading-relaxed flex-1">{description}</p>
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
                Everything in one place
              </h2>
            </div>

            <ul
              className="grid grid-cols-1 sm:grid-cols-2 gap-5 list-none"
              aria-label="Estrevia features"
            >
              {FEATURES.map(({ glyph, color, title, description }, i) => (
                <li
                  key={title}
                  data-animate={`fade-up-${i}`}
                  className="flex flex-col gap-4 rounded-2xl border border-white/6 p-6 group transition-all duration-300 hover:border-white/15 hover:shadow-lg"
                  style={{
                    background: 'rgba(255,255,255,0.02)',
                    // CSS custom property for planetary color glow on hover
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
                  <h3 className="text-base font-semibold text-white/90 tracking-wide">{title}</h3>
                  <p className="text-sm text-white/45 leading-relaxed">{description}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

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
              Join astrologers discovering their sidereal signs
            </h2>
            <p className="text-sm text-white/35 mb-12 max-w-md mx-auto">
              Most discover they carry the energy of the sign before their tropical Sun —
              not the one on their horoscope app.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
              {[
                { value: '±0.01°', label: 'Calculation accuracy', note: 'Swiss Ephemeris' },
                { value: '12', label: 'Celestial bodies', note: 'Sun → Chiron' },
                { value: '120', label: 'Esoteric essays', note: '10 planets × 12 signs' },
              ].map(({ value, label, note }) => (
                <div key={label} className="flex flex-col items-center gap-1">
                  <span
                    className="text-4xl sm:text-5xl font-light text-[#FFD700]"
                    style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)' }}
                  >
                    {value}
                  </span>
                  <span className="text-sm font-medium text-white/70">{label}</span>
                  <span className="text-xs text-white/30">{note}</span>
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
              Common questions
            </h2>

            <dl className="space-y-6">
              {[
                {
                  question: 'What is the difference between sidereal and tropical astrology?',
                  answer:
                    'Tropical astrology fixes the zodiac to the equinoxes — the Sun enters Aries on the spring equinox. Sidereal astrology aligns the zodiac to the actual star constellations. Due to the precession of the equinoxes (~50″ per year), the two systems are currently ~24° apart. Most people in sidereal astrology find their Sun is in the sign before their tropical one.',
                },
                {
                  question: 'What is the Lahiri ayanamsa?',
                  answer:
                    'The ayanamsa is the angular offset between tropical and sidereal zodiacs. Lahiri (also called Chitrapaksha) is the official ayanamsa adopted by the Indian government and the most widely used in Vedic/Jyotish astrology. As of 2026 it is approximately 24°7′.',
                },
                {
                  question: 'How accurate are the calculations?',
                  answer:
                    'Estrevia uses Swiss Ephemeris — the same engine used by Solar Fire and Astro.com — with ±0.01° accuracy for all 12 celestial bodies. Over 100 reference charts are verified in CI against Astro.com before every release.',
                },
                {
                  question: 'What is a Cosmic Passport?',
                  answer:
                    'A shareable card with your sidereal Sun, Moon, and Ascendant signs, dominant element, and combination rarity percentage. Share it as an image or link — works without creating an account.',
                },
              ].map(({ question, answer }, i) => (
                <div
                  key={question}
                  data-animate={`fade-up-${i}`}
                  className="rounded-xl border border-white/6 p-5"
                  style={{ background: 'rgba(255,255,255,0.02)' }}
                >
                  <dt
                    className="text-base font-medium text-white/85 mb-3"
                    style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)' }}
                  >
                    {question}
                  </dt>
                  <dd className="text-sm text-white/50 leading-relaxed">{answer}</dd>
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
              Early access
            </p>
            <h2
              id="waitlist-heading"
              className="text-3xl sm:text-4xl font-light text-white mb-4"
              style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)' }}
            >
              Get notified when we launch
            </h2>
            <p className="text-sm text-white/45 mb-8 leading-relaxed">
              Full natal chart calculation, 120 sidereal essays, Cosmic Passport, and
              planetary hours — all free at launch.
            </p>

            <WaitlistForm />

            <p className="mt-4 text-xs text-white/25">
              No spam. Unsubscribe at any time.
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
            Calculate My Sidereal Chart
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
