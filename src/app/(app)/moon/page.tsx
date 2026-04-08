import type { Metadata } from 'next';
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
// JSON-LD schemas
// ---------------------------------------------------------------------------

const breadcrumb = breadcrumbSchema([
  { name: 'Estrevia', url: SITE_URL },
  { name: 'Moon Phase', url: `${SITE_URL}/moon` },
]);

const faq = faqSchema([
  {
    question: 'What is the moon phase today?',
    answer:
      'The current moon phase is calculated in real time using Swiss Ephemeris from the angular distance between the Moon and the Sun. The phase changes continuously as the Moon orbits Earth over ~29.5 days.',
  },
  {
    question: 'How is moon phase illumination calculated?',
    answer:
      'Illumination is derived from the Sun–Moon elongation angle using the formula: (1 - cos(angle)) / 2 × 100%. At 0° (New Moon) illumination is 0%; at 180° (Full Moon) it reaches 100%.',
  },
  {
    question: 'What is the difference between sidereal and tropical moon phases?',
    answer:
      'Moon phase is a measure of the Sun–Moon angle, which is the same in both sidereal and tropical systems. The ~24° Lahiri ayanamsa offset affects which zodiac sign the Moon occupies, but does not change the phase angle or illumination percentage.',
  },
  {
    question: 'When is the next new moon?',
    answer:
      'New moons occur approximately every 29.5 days when the Moon passes between Earth and the Sun. The exact date is shown on this page and calculated to within ±1 minute using Swiss Ephemeris.',
  },
  {
    question: 'When is the next full moon?',
    answer:
      'Full moons occur when the Moon is directly opposite the Sun (180° elongation). The exact date and time are shown on this page and recalculate daily.',
  },
]);

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function MoonPage() {
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
            ☽ &nbsp;Lunar Calendar
          </p>
          <h1
            className="text-3xl sm:text-4xl font-light leading-tight mb-3"
            style={{ color: '#E8E0D0', fontFamily: 'var(--font-crimson-pro, Georgia, serif)' }}
          >
            Moon Phase Today
          </h1>
          <p
            className="text-sm leading-relaxed max-w-md"
            style={{ color: 'rgba(255,255,255,0.42)' }}
          >
            Live lunar phase with illumination and monthly calendar. New and full
            moon dates calculated with Swiss Ephemeris to ±1 minute accuracy.
          </p>
        </header>

        {/* Calendar — client component, fetches its own data */}
        <MoonCalendar />

        {/* FAQ — visible content, feeds JSON-LD */}
        <section aria-label="About moon phases" className="mt-16 space-y-3">
          <h2
            className="text-xs font-medium uppercase tracking-[0.18em] mb-5"
            style={{ color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-geist-sans)' }}
          >
            About Moon Phases
          </h2>

          {[
            {
              q: 'How is moon phase illumination calculated?',
              a: 'Illumination comes from the Sun–Moon elongation angle: (1 − cos θ) / 2 × 100%. At New Moon (0°) illumination is 0%; at Full Moon (180°) it is 100%.',
            },
            {
              q: 'Sidereal vs tropical — does the moon phase change?',
              a: 'No. Moon phase is the angular gap between the Sun and Moon — identical in both systems. The ~24° Lahiri ayanamsa offset shifts the Moon\'s zodiac sign but not its phase angle.',
            },
            {
              q: 'How accurate are the new and full moon dates?',
              a: 'Dates are calculated with Swiss Ephemeris using the Moshier analytical ephemeris, accurate to ±0.01°. The event time is narrowed by binary search to within ±1 minute.',
            },
          ].map(({ q, a }) => (
            <details
              key={q}
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
                {q}
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
                {a}
              </p>
            </details>
          ))}
        </section>
      </main>
    </>
  );
}
