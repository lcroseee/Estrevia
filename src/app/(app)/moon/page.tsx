import type { Metadata } from 'next';
import { createMetadata } from '@/shared/seo/metadata';
import { JsonLdScript, breadcrumbSchema, faqSchema } from '@/shared/seo/json-ld';
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
  { name: 'Estrevia', url: 'https://estrevia.app' },
  { name: 'Moon Phase', url: 'https://estrevia.app/moon' },
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

      <main className="min-h-screen bg-[#0A0A0F] px-4 py-8 max-w-2xl mx-auto">
        {/* Page header */}
        <header className="mb-8">
          <h1
            className="text-2xl font-semibold tracking-tight"
            style={{ color: '#E8E0D0', fontFamily: 'var(--font-geist-sans)' }}
          >
            Moon Phase Today
          </h1>
          <p
            className="mt-2 text-sm leading-relaxed max-w-md"
            style={{ color: 'rgba(255,255,255,0.45)' }}
          >
            Live lunar phase with illumination and monthly calendar. New and full
            moon dates calculated with Swiss Ephemeris to ±1 minute accuracy.
          </p>
        </header>

        {/* Calendar — client component, fetches its own data */}
        <MoonCalendar />

        {/* FAQ — visible content, feeds JSON-LD */}
        <section aria-label="About moon phases" className="mt-14 space-y-4">
          <h2
            className="text-base font-medium"
            style={{ color: 'rgba(255,255,255,0.6)', fontFamily: 'var(--font-geist-sans)' }}
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
              className="group border rounded-lg overflow-hidden"
              style={{ borderColor: 'rgba(255,255,255,0.08)' }}
            >
              <summary
                className="px-4 py-3 text-sm cursor-pointer select-none flex items-center justify-between list-none transition-colors"
                style={{
                  color: 'rgba(255,255,255,0.55)',
                  fontFamily: 'var(--font-geist-sans)',
                }}
              >
                {q}
                <span
                  className="text-xs ml-3 flex-shrink-0 group-open:rotate-180 transition-transform"
                  style={{ color: 'rgba(255,255,255,0.25)' }}
                  aria-hidden="true"
                >
                  ▾
                </span>
              </summary>
              <p
                className="px-4 pb-4 text-sm leading-relaxed"
                style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-crimson-pro, serif)' }}
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
