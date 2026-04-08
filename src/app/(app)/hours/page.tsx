import type { Metadata } from 'next';
import { Suspense } from 'react';
import { createMetadata } from '@/shared/seo/metadata';
import { JsonLdScript, breadcrumbSchema, faqSchema } from '@/shared/seo/json-ld';
import { SITE_URL } from '@/shared/seo/constants';
import { PlanetaryHoursGrid } from '@/modules/astro-engine/components/PlanetaryHoursGrid';

export function generateMetadata(): Metadata {
  return createMetadata({
    title: 'Planetary Hours Today',
    description:
      'Current planetary hour and full daily schedule. Traditional Chaldean planetary hours calculated for your location.',
    path: '/hours',
    keywords: [
      'planetary hours',
      'chaldean hours',
      'astrology hours today',
      'planet of the hour',
      'sidereal planetary hours',
    ],
  });
}

// JSON-LD: BreadcrumbList + FAQ
const breadcrumb = breadcrumbSchema([
  { name: 'Estrevia', url: SITE_URL },
  { name: 'Planetary Hours', url: `${SITE_URL}/hours` },
]);

const hoursForq = faqSchema([
  {
    question: 'What are planetary hours?',
    answer:
      'Planetary hours are an ancient Chaldean timekeeping system dividing each day and night into 12 unequal segments, each governed by one of the seven classical planets (Sun, Moon, Mars, Mercury, Jupiter, Venus, Saturn). The ruling planet changes every hour and influences the energy of that time period.',
  },
  {
    question: 'How are planetary hours calculated?',
    answer:
      'The day is split into 12 equal parts between sunrise and sunset (day hours) and 12 equal parts between sunset and sunrise (night hours). The length of each hour varies by season and latitude. The first hour of each day is ruled by the planet of the weekday — Sun on Sunday, Moon on Monday, Mars on Tuesday, and so on.',
  },
  {
    question: 'How does sidereal astrology affect planetary hours?',
    answer:
      'Planetary hours are based on sunrise/sunset times, not zodiac positions, so they are the same in both sidereal and tropical astrology. The Chaldean order of planets (Saturn, Jupiter, Mars, Sun, Venus, Mercury, Moon) governs the sequence regardless of ayanamsa.',
  },
]);

function GridSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading planetary hours" className="flex flex-col gap-2">
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

export default function HoursPage() {
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
            ♄ &nbsp;Chaldean Order
          </p>
          <h1
            className="text-3xl sm:text-4xl font-light leading-tight mb-3"
            style={{ color: '#E8E0D0', fontFamily: 'var(--font-crimson-pro, Georgia, serif)' }}
          >
            Planetary Hours
          </h1>
          <p className="text-sm text-white/42 leading-relaxed max-w-md">
            Traditional Chaldean hours for your location. Each hour carries the
            energy of its ruling planet — use them to time actions with intention.
          </p>
        </header>

        {/* Grid */}
        <Suspense fallback={<GridSkeleton />}>
          <PlanetaryHoursGrid />
        </Suspense>

        {/* FAQ — visible content, also feeds JSON-LD */}
        <section aria-label="About planetary hours" className="mt-14 space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-[0.18em] mb-5 text-white/30 font-[var(--font-geist-sans)]">
            About Planetary Hours
          </h2>

          {[
            {
              q: 'What are planetary hours?',
              a: 'Planetary hours are an ancient Chaldean timekeeping system dividing each day and night into 12 unequal segments, each governed by one of the seven classical planets — Sun, Moon, Mars, Mercury, Jupiter, Venus, Saturn. The ruling planet changes every hour and influences the energy of that time period.',
            },
            {
              q: 'How are planetary hours calculated?',
              a: 'The day is split into 12 equal parts between sunrise and sunset (day hours) and 12 equal parts between sunset and the next sunrise (night hours). Hour length varies by season and latitude. The first hour of each day is ruled by the weekday planet — Sun on Sunday, Moon on Monday, Mars on Tuesday, Mercury on Wednesday, Jupiter on Thursday, Venus on Friday, Saturn on Saturday.',
            },
            {
              q: 'Sidereal vs tropical — does it matter?',
              a: 'Planetary hours are based on sunrise/sunset times, not zodiac positions, so they are identical in both sidereal and tropical astrology. The Chaldean sequence (Saturn, Jupiter, Mars, Sun, Venus, Mercury, Moon) is independent of ayanamsa.',
            },
          ].map(({ q, a }) => (
            <details
              key={q}
              className="group rounded-xl overflow-hidden transition-all"
              style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.015)' }}
            >
              <summary className="px-5 py-3.5 text-sm text-white/58 cursor-pointer select-none hover:bg-white/[0.025] transition-colors list-none flex items-center justify-between">
                {q}
                <span className="text-white/22 text-[10px] ml-3 flex-shrink-0 group-open:rotate-180 transition-transform duration-200" aria-hidden="true">▾</span>
              </summary>
              <p
                className="px-5 pb-5 pt-1 leading-relaxed"
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
