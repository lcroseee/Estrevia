import type { Metadata } from 'next';
import { Suspense } from 'react';
import { createMetadata } from '@/shared/seo/metadata';
import { JsonLdScript, breadcrumbSchema } from '@/shared/seo/json-ld';
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
  { name: 'Estrevia', url: 'https://estrevia.app' },
  { name: 'Planetary Hours', url: 'https://estrevia.app/hours' },
]);

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What are planetary hours?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Planetary hours are an ancient Chaldean timekeeping system dividing each day and night into 12 unequal segments, each governed by one of the seven classical planets (Sun, Moon, Mars, Mercury, Jupiter, Venus, Saturn). The ruling planet changes every hour and influences the energy of that time period.',
      },
    },
    {
      '@type': 'Question',
      name: 'How are planetary hours calculated?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'The day is split into 12 equal parts between sunrise and sunset (day hours) and 12 equal parts between sunset and sunrise (night hours). The length of each hour varies by season and latitude. The first hour of each day is ruled by the planet of the weekday — Sun on Sunday, Moon on Monday, Mars on Tuesday, and so on.',
      },
    },
    {
      '@type': 'Question',
      name: 'How does sidereal astrology affect planetary hours?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Planetary hours are based on sunrise/sunset times, not zodiac positions, so they are the same in both sidereal and tropical astrology. The Chaldean order of planets (Saturn, Jupiter, Mars, Sun, Venus, Mercury, Moon) governs the sequence regardless of ayanamsa.',
      },
    },
  ],
};

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
      <JsonLdScript schema={faqSchema} />

      <main className="min-h-screen bg-[#0A0A0F] px-4 py-8 max-w-2xl mx-auto">
        {/* Page header */}
        <header className="mb-8">
          <h1 className="text-2xl font-semibold text-white font-[var(--font-geist-sans)] tracking-tight">
            Planetary Hours
          </h1>
          <p className="mt-2 text-sm text-white/50 leading-relaxed max-w-md">
            Traditional Chaldean hours for your location. Each hour carries the
            energy of its ruling planet — use them to time actions with intention.
          </p>
        </header>

        {/* Grid */}
        <Suspense fallback={<GridSkeleton />}>
          <PlanetaryHoursGrid />
        </Suspense>

        {/* FAQ — visible content, also feeds JSON-LD */}
        <section aria-label="About planetary hours" className="mt-12 space-y-6">
          <h2 className="text-base font-medium text-white/70 font-[var(--font-geist-sans)]">
            About Planetary Hours
          </h2>

          <details className="group border border-white/8 rounded-lg overflow-hidden">
            <summary className="px-4 py-3 text-sm text-white/60 cursor-pointer select-none hover:text-white/80 transition-colors list-none flex items-center justify-between">
              What are planetary hours?
              <span className="text-white/30 text-xs group-open:rotate-180 transition-transform">▾</span>
            </summary>
            <p className="px-4 pb-4 text-sm text-white/45 leading-relaxed">
              Planetary hours are an ancient Chaldean timekeeping system dividing each day and night into
              12 unequal segments, each governed by one of the seven classical planets — Sun, Moon, Mars,
              Mercury, Jupiter, Venus, Saturn. The ruling planet changes every hour and influences the
              energy of that time period.
            </p>
          </details>

          <details className="group border border-white/8 rounded-lg overflow-hidden">
            <summary className="px-4 py-3 text-sm text-white/60 cursor-pointer select-none hover:text-white/80 transition-colors list-none flex items-center justify-between">
              How are planetary hours calculated?
              <span className="text-white/30 text-xs group-open:rotate-180 transition-transform">▾</span>
            </summary>
            <p className="px-4 pb-4 text-sm text-white/45 leading-relaxed">
              The day is split into 12 equal parts between sunrise and sunset (day hours) and 12 equal
              parts between sunset and the next sunrise (night hours). Hour length varies by season and
              latitude. The first hour of each day is ruled by the weekday planet — Sun on Sunday,
              Moon on Monday, Mars on Tuesday, Mercury on Wednesday, Jupiter on Thursday, Venus on
              Friday, Saturn on Saturday.
            </p>
          </details>

          <details className="group border border-white/8 rounded-lg overflow-hidden">
            <summary className="px-4 py-3 text-sm text-white/60 cursor-pointer select-none hover:text-white/80 transition-colors list-none flex items-center justify-between">
              Sidereal vs tropical — does it matter?
              <span className="text-white/30 text-xs group-open:rotate-180 transition-transform">▾</span>
            </summary>
            <p className="px-4 pb-4 text-sm text-white/45 leading-relaxed">
              Planetary hours are based on sunrise/sunset times, not zodiac positions, so they are
              identical in both sidereal and tropical astrology. The Chaldean sequence (Saturn, Jupiter,
              Mars, Sun, Venus, Mercury, Moon) is independent of ayanamsa.
            </p>
          </details>
        </section>
      </main>
    </>
  );
}
