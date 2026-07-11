/**
 * EssayPage — full essay layout Server Component.
 *
 * Renders:
 *   1. Essay header (title, meta badges)
 *   2. MDX content body via react-markdown
 *   3. MiniCalculator widget (Client Component)
 *   4. EphemerisTable
 *   5. SiderealVsTropicalTable
 *   6. CorrespondencesTable (777 data)
 *   7. InternalLinks (related readings)
 *   8. Disclaimer
 *
 * No data fetching here — caller passes pre-loaded essay data.
 */

import ReactMarkdown from 'react-markdown';
import { PROSE_COMPONENTS } from './proseComponents';
import { getLocale, getTranslations } from 'next-intl/server';
import type { EssayMeta } from '@/modules/esoteric/lib/essays';
import type { Sign } from '@/shared/types/astrology';
import { CorrespondencesTable } from './CorrespondencesTable';
import { EphemerisTable } from './EphemerisTable';
import { SiderealVsTropicalTable } from './SiderealVsTropicalTable';
import { InternalLinks } from './InternalLinks';
import { Disclaimer } from './Disclaimer';
import { MiniCalculator } from './MiniCalculator';

// ---------------------------------------------------------------------------
// Static element mappings — hoisted outside component (rendering-hoist-jsx)
// ---------------------------------------------------------------------------

const ELEMENT_COLORS: Record<string, string> = {
  Fire:  'text-orange-400/80 border-orange-400/20 bg-orange-400/5',
  Earth: 'text-emerald-400/80 border-emerald-400/20 bg-emerald-400/5',
  Air:   'text-sky-400/80 border-sky-400/20 bg-sky-400/5',
  Water: 'text-blue-400/80 border-blue-400/20 bg-blue-400/5',
};

const PLANET_GLYPHS: Record<string, string> = {
  Sun:     '☉',
  Moon:    '☽',
  Mercury: '☿',
  Venus:   '♀',
  Mars:    '♂',
  Jupiter: '♃',
  Saturn:  '♄',
  Uranus:  '♅',
  Neptune: '♆',
  Pluto:   '♇',
};


// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface EssayPageProps {
  meta: EssayMeta;
  content: string;
}

export async function EssayPage({ meta, content }: EssayPageProps) {
  const glyph = PLANET_GLYPHS[meta.planet];
  const elementColor = ELEMENT_COLORS[meta.element] ?? 'text-white/50 border-white/10 bg-white/5';
  const t = await getTranslations('essayDetail');
  const tPlanet = await getTranslations('essayDetail.planets');
  const tElement = await getTranslations('essayDetail.elements');
  const tModality = await getTranslations('essayDetail.modalities');
  const locale = await getLocale();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const planetLocalized = tPlanet(meta.planet as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const elementLocalized = tElement(meta.element as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const modalityLocalized = tModality(meta.modality as any);

  return (
    <article
      className="max-w-2xl mx-auto px-4 pt-8 pb-16"
      aria-label={meta.title}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="mb-8">
        {/* Breadcrumb-style prefix */}
        <p
          className="text-xs text-white/30 font-[var(--font-geist-sans)] uppercase tracking-widest mb-3"
          aria-hidden="true"
        >
          {t('breadcrumb', { planet: planetLocalized, sign: meta.sign })}
        </p>

        {/* Title */}
        <h1
          className="text-3xl sm:text-4xl font-light leading-[1.12] mb-4"
          style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)', color: '#F0EAD6' }}
        >
          {glyph && (
            <span
              className="mr-3 font-normal"
              style={{ color: 'rgba(255,255,255,0.25)', fontFamily: 'serif' }}
              aria-hidden="true"
            >
              {glyph}
            </span>
          )}
          {meta.title}
        </h1>

        {/* Description */}
        <p className="text-base text-white/55 leading-relaxed mb-5" style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)', fontSize: '1.0625rem' }}>
          {meta.description}
        </p>

        {/* Meta badges */}
        <div className="flex flex-wrap gap-2" role="list" aria-label={t('essayAttributesAria')}>
          <span
            role="listitem"
            className={`text-xs font-medium px-2.5 py-1 rounded-full border font-[var(--font-geist-sans)] ${elementColor}`}
          >
            {elementLocalized}
          </span>
          <span
            role="listitem"
            className="text-xs font-medium px-2.5 py-1 rounded-full border border-white/10 bg-white/5 text-white/50 font-[var(--font-geist-sans)]"
          >
            {modalityLocalized}
          </span>
          <span
            role="listitem"
            className="text-xs font-medium px-2.5 py-1 rounded-full border border-white/10 bg-white/5 text-white/50 font-[var(--font-geist-sans)]"
          >
            {t('tagSiderealLahiri')}
          </span>
          <time
            dateTime={meta.publishedAt}
            className="text-xs text-white/25 font-[var(--font-geist-sans)] self-center ml-auto"
          >
            {formatPublishDate(meta.publishedAt, locale)}
          </time>
        </div>
      </header>

      {/* ── Main content body ──────────────────────────────────────────────── */}
      <div className="essay-content">
        <ReactMarkdown components={PROSE_COMPONENTS}>
          {content}
        </ReactMarkdown>
      </div>

      {/* ── Mini calculator widget ─────────────────────────────────────────── */}
      <div className="mt-10">
        <MiniCalculator sign={meta.sign} />
      </div>

      {/* ── Data tables ───────────────────────────────────────────────────── */}
      <div className="mt-12 space-y-10">
        <EphemerisTable planet={meta.planet} sign={meta.sign} />
        <SiderealVsTropicalTable planet={meta.planet} sign={meta.sign} />
        <CorrespondencesTable sign={meta.sign as Sign} />
      </div>

      {/* ── Related readings ──────────────────────────────────────────────── */}
      <div className="mt-12">
        <InternalLinks slug={meta.slug} />
      </div>

      {/* ── Disclaimer ────────────────────────────────────────────────────── */}
      <Disclaimer />
    </article>
  );
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function formatPublishDate(iso: string, locale: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(locale === 'es' ? 'es' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  } catch {
    return iso;
  }
}
