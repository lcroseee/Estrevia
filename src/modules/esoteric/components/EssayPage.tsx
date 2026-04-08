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
// Prose styles for react-markdown output
// ---------------------------------------------------------------------------

const PROSE_COMPONENTS = {
  h2: ({ children, ...props }: React.ComponentProps<'h2'>) => (
    <h2
      {...props}
      className="mt-10 mb-4 text-xl font-semibold text-white/90 font-[var(--font-geist-sans)] tracking-tight border-b border-white/6 pb-2"
    >
      {children}
    </h2>
  ),
  h3: ({ children, ...props }: React.ComponentProps<'h3'>) => (
    <h3
      {...props}
      className="mt-7 mb-3 text-base font-medium text-white/80 font-[var(--font-geist-sans)]"
    >
      {children}
    </h3>
  ),
  p: ({ children, ...props }: React.ComponentProps<'p'>) => (
    <p
      {...props}
      className="mb-5 text-base text-white/70 leading-[1.8] font-[var(--font-crimson-pro),_'Crimson_Pro',_Georgia,_serif]"
    >
      {children}
    </p>
  ),
  ul: ({ children, ...props }: React.ComponentProps<'ul'>) => (
    <ul
      {...props}
      className="mb-5 space-y-2 pl-5"
    >
      {children}
    </ul>
  ),
  li: ({ children, ...props }: React.ComponentProps<'li'>) => (
    <li
      {...props}
      className="text-base text-white/65 leading-[1.75] font-[var(--font-crimson-pro),_'Crimson_Pro',_Georgia,_serif] list-disc marker:text-white/25"
    >
      {children}
    </li>
  ),
  strong: ({ children, ...props }: React.ComponentProps<'strong'>) => (
    <strong {...props} className="font-semibold text-white/85">
      {children}
    </strong>
  ),
  em: ({ children, ...props }: React.ComponentProps<'em'>) => (
    <em {...props} className="italic text-white/75">
      {children}
    </em>
  ),
  blockquote: ({ children, ...props }: React.ComponentProps<'blockquote'>) => (
    <blockquote
      {...props}
      className="my-6 border-l-2 border-white/15 pl-5 text-sm text-white/40 italic font-[var(--font-geist-sans)]"
    >
      {children}
    </blockquote>
  ),
  table: ({ children, ...props }: React.ComponentProps<'table'>) => (
    <div className="overflow-x-auto my-6 rounded-xl border border-white/8">
      <table {...props} className="w-full text-sm">
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...props }: React.ComponentProps<'thead'>) => (
    <thead {...props} className="bg-white/5 border-b border-white/8">
      {children}
    </thead>
  ),
  th: ({ children, ...props }: React.ComponentProps<'th'>) => (
    <th
      {...props}
      className="px-4 py-2.5 text-left text-[10px] text-white/35 uppercase tracking-widest font-[var(--font-geist-sans)]"
    >
      {children}
    </th>
  ),
  td: ({ children, ...props }: React.ComponentProps<'td'>) => (
    <td
      {...props}
      className="px-4 py-2.5 text-white/65 border-t border-white/5 font-[var(--font-geist-sans)]"
    >
      {children}
    </td>
  ),
  code: ({ children, ...props }: React.ComponentProps<'code'>) => (
    <code
      {...props}
      className="font-[var(--font-geist-mono)] text-xs bg-white/6 border border-white/8 rounded px-1.5 py-0.5 text-white/75"
    >
      {children}
    </code>
  ),
  hr: (props: React.ComponentProps<'hr'>) => (
    <hr {...props} className="my-8 border-white/8" />
  ),
} as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface EssayPageProps {
  meta: EssayMeta;
  content: string;
}

export function EssayPage({ meta, content }: EssayPageProps) {
  const glyph = PLANET_GLYPHS[meta.planet];
  const elementColor = ELEMENT_COLORS[meta.element] ?? 'text-white/50 border-white/10 bg-white/5';

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
          Essays / {meta.planet} / {meta.sign}
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
        <div className="flex flex-wrap gap-2" role="list" aria-label="Essay attributes">
          <span
            role="listitem"
            className={`text-xs font-medium px-2.5 py-1 rounded-full border font-[var(--font-geist-sans)] ${elementColor}`}
          >
            {meta.element}
          </span>
          <span
            role="listitem"
            className="text-xs font-medium px-2.5 py-1 rounded-full border border-white/10 bg-white/5 text-white/50 font-[var(--font-geist-sans)]"
          >
            {meta.modality}
          </span>
          <span
            role="listitem"
            className="text-xs font-medium px-2.5 py-1 rounded-full border border-white/10 bg-white/5 text-white/50 font-[var(--font-geist-sans)]"
          >
            Sidereal · Lahiri
          </span>
          <time
            dateTime={meta.publishedAt}
            className="text-xs text-white/25 font-[var(--font-geist-sans)] self-center ml-auto"
          >
            {formatPublishDate(meta.publishedAt)}
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

function formatPublishDate(iso: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  } catch {
    return iso;
  }
}
