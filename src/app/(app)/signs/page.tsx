import type { Metadata } from 'next';
import Link from 'next/link';
import { createMetadata, JsonLdScript, breadcrumbSchema } from '@/shared/seo';
import { SITE_URL } from '@/shared/seo/constants';
import { Disclaimer } from '@/shared/components/Disclaimer';
import descriptionsData from '../../../../content/signs/descriptions.json';

// ISR: rebuild the signs index daily. R10 CWV win.
export const revalidate = 86400;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SignDescription {
  sign: string;
  slug: string;
  siderealDates: string;
  element: string;
  modality: string;
  ruler: string;
  symbol: string;
  traits: string[];
  overview: string;
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export function generateMetadata(): Metadata {
  return createMetadata({
    title: 'Sidereal Zodiac Signs — True Dates & Meanings',
    description:
      'Explore all 12 sidereal zodiac signs with true astronomical dates, elements, ruling planets, and key traits. Find your real sign using the Lahiri ayanamsa.',
    path: '/signs',
    keywords: [
      'sidereal zodiac signs',
      'sidereal astrology signs',
      'sidereal zodiac dates',
      'true zodiac signs',
      'lahiri ayanamsa signs',
      'sidereal vs tropical signs',
    ],
  });
}

// ---------------------------------------------------------------------------
// JSON-LD
// ---------------------------------------------------------------------------

const breadcrumbLd = breadcrumbSchema([
  { name: 'Home', url: SITE_URL },
  { name: 'Signs', url: `${SITE_URL}/signs` },
]);

// ItemList schema — schema.org type for a curated collection of linked pages.
// @shared/seo does not export a collectionPageSchema, so we build it inline.
// All values are static strings from our own data — no user input involved.
function itemListSchema(signs: SignDescription[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Sidereal Zodiac Signs',
    description:
      'All 12 sidereal zodiac signs with true astronomical dates aligned to actual constellations via the Lahiri ayanamsa.',
    url: `${SITE_URL}/signs`,
    numberOfItems: signs.length,
    itemListElement: signs.map((sign, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: `Sidereal ${sign.sign}`,
      url: `${SITE_URL}/signs/${sign.slug}`,
      description: `${sign.siderealDates} — ${sign.element} ${sign.modality} ruled by ${sign.ruler}`,
    })),
  };
}

// ---------------------------------------------------------------------------
// Element colours — mirrored from [sign]/page.tsx for visual consistency
// ---------------------------------------------------------------------------

const ELEMENT_COLOUR: Record<string, string> = {
  Fire:  'bg-orange-500/20 text-orange-300 border border-orange-500/30',
  Earth: 'bg-green-500/20 text-green-300 border border-green-500/30',
  Air:   'bg-sky-500/20 text-sky-300 border border-sky-500/30',
  Water: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
};

// Subtle left-edge accent glow per element — visual texture, no gradient blobs
const ELEMENT_GLOW: Record<string, string> = {
  Fire:  'shadow-[inset_2px_0_0_rgba(249,115,22,0.35)]',
  Earth: 'shadow-[inset_2px_0_0_rgba(34,197,94,0.35)]',
  Air:   'shadow-[inset_2px_0_0_rgba(56,189,248,0.35)]',
  Water: 'shadow-[inset_2px_0_0_rgba(59,130,246,0.35)]',
};

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function SignsIndexPage() {
  const signs = descriptionsData as SignDescription[];
  const itemList = itemListSchema(signs);

  return (
    <>
      <JsonLdScript schema={breadcrumbLd} />
      <JsonLdScript schema={itemList} />

      <div className="max-w-3xl mx-auto px-4 py-8 md:py-12">

        {/* ── Breadcrumb ─────────────────────────────────────────────── */}
        <nav aria-label="Breadcrumb" className="mb-6 text-sm text-white/40">
          <ol className="flex items-center gap-2">
            <li>
              <Link href="/" className="hover:text-white/70 transition-colors">
                Home
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li className="text-white/60" aria-current="page">Signs</li>
          </ol>
        </nav>

        {/* ── Page header ────────────────────────────────────────────── */}
        <header className="mb-10">
          <h1
            className="text-3xl md:text-4xl font-light leading-tight mb-4"
            style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)', color: '#F0EAD6' }}
          >
            Sidereal Zodiac Signs
          </h1>
          <p
            className="text-white/65 leading-relaxed max-w-xl"
            style={{ fontFamily: 'var(--font-geist-sans, sans-serif)' }}
          >
            Sidereal astrology aligns the zodiac with the actual constellations, shifted{' '}
            <span className="text-white/85">~24°</span> from tropical. Find your true sidereal sign
            below — dates reflect real sky positions using the{' '}
            <span className="text-white/85">Lahiri ayanamsa</span>.
          </p>
        </header>

        {/* ── Signs grid ─────────────────────────────────────────────── */}
        <section aria-labelledby="signs-grid-heading">
          <h2
            id="signs-grid-heading"
            className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-5"
          >
            All 12 Signs
          </h2>

          <ul
            className="grid grid-cols-1 sm:grid-cols-2 gap-3"
            role="list"
            aria-label="Sidereal zodiac signs"
          >
            {signs.map((sign) => {
              const elementColour =
                ELEMENT_COLOUR[sign.element] ?? 'bg-white/10 text-white/70';
              const elementGlow = ELEMENT_GLOW[sign.element] ?? '';

              return (
                <li key={sign.slug}>
                  <Link
                    href={`/signs/${sign.slug}`}
                    className={[
                      'flex items-start gap-4 px-4 py-4 rounded-xl',
                      'bg-white/[0.035] hover:bg-white/[0.065]',
                      'border border-white/[0.08] hover:border-white/[0.18]',
                      'transition-all duration-200 group',
                      elementGlow,
                    ].join(' ')}
                    aria-label={`${sign.sign} — ${sign.siderealDates}`}
                  >
                    {/* Glyph */}
                    <span
                      className="text-3xl leading-none mt-0.5 shrink-0"
                      role="img"
                      aria-hidden="true"
                      style={{ filter: 'drop-shadow(0 0 8px rgba(255,215,0,0.12))' }}
                    >
                      {sign.symbol}
                    </span>

                    {/* Text block */}
                    <div className="min-w-0 flex-1">
                      {/* Name + date row */}
                      <div className="flex items-baseline justify-between gap-2 mb-1.5">
                        <span
                          className="text-base font-light group-hover:text-white transition-colors"
                          style={{
                            fontFamily: 'var(--font-crimson-pro, Georgia, serif)',
                            color: '#E8E0D0',
                          }}
                        >
                          {sign.sign}
                        </span>
                        <span
                          className="text-white/35 text-[11px] shrink-0 tabular-nums"
                          style={{ fontFamily: 'var(--font-geist-mono, monospace)' }}
                          aria-label={`Date range: ${sign.siderealDates}`}
                        >
                          {sign.siderealDates}
                        </span>
                      </div>

                      {/* Badges row */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${elementColour}`}
                        >
                          {sign.element}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-white/8 text-white/55 border border-white/10">
                          {sign.modality}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[11px] bg-amber-500/10 text-amber-300/80 border border-amber-500/20">
                          {sign.ruler}
                        </span>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        {/* ── Chart CTA ──────────────────────────────────────────────── */}
        <section
          aria-labelledby="signs-cta-heading"
          className="mt-12 rounded-2xl p-7 text-center relative overflow-hidden"
          style={{
            border: '1px solid rgba(255,215,0,0.18)',
            background:
              'linear-gradient(135deg, rgba(255,215,0,0.04) 0%, rgba(255,140,0,0.02) 100%)',
            boxShadow: 'inset 0 1px 0 rgba(255,215,0,0.08)',
          }}
        >
          {/* Top shimmer line */}
          <div
            className="absolute top-0 inset-x-0 h-px pointer-events-none"
            style={{
              background:
                'linear-gradient(90deg, transparent, rgba(255,215,0,0.3), transparent)',
            }}
            aria-hidden="true"
          />

          <h2
            id="signs-cta-heading"
            className="text-xl font-light mb-2"
            style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)', color: '#F0EAD6' }}
          >
            Discover your sidereal placements
          </h2>
          <p className="text-white/55 text-sm mb-5 leading-relaxed max-w-md mx-auto">
            Calculate your full sidereal natal chart — Sun, Moon, Ascendant, and all 10
            planetary positions using the Lahiri ayanamsa.
          </p>
          <Link
            href="/chart"
            className="inline-flex items-center gap-2 px-7 py-3 rounded-xl text-sm font-semibold transition-all duration-200 hover:shadow-lg active:scale-[0.98]"
            style={{
              background: 'linear-gradient(135deg, #FFD700 0%, #FF8C00 100%)',
              color: '#0A0A0F',
              boxShadow: '0 4px 16px rgba(255,215,0,0.2)',
            }}
          >
            <span aria-hidden="true">☉</span>
            Calculate your sidereal natal chart
          </Link>
        </section>

        {/* ── Related nav ────────────────────────────────────────────── */}
        <nav aria-label="Related pages" className="mt-10 pt-8 border-t border-white/10">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-4">
            Related
          </h2>
          <ul className="flex flex-wrap gap-3 text-sm" role="list">
            <li>
              <Link
                href="/why-sidereal"
                className="text-white/50 hover:text-white/80 transition-colors underline underline-offset-4"
              >
                Why sidereal astrology differs from tropical
              </Link>
            </li>
            <li>
              <Link
                href="/chart"
                className="text-white/50 hover:text-white/80 transition-colors underline underline-offset-4"
              >
                Sidereal natal chart calculator
              </Link>
            </li>
            <li>
              <Link
                href="/moon"
                className="text-white/50 hover:text-white/80 transition-colors underline underline-offset-4"
              >
                Current moon phase
              </Link>
            </li>
          </ul>
        </nav>

        <Disclaimer />

      </div>
    </>
  );
}
