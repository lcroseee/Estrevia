/**
 * CorrespondencesTable — 777 Kabbalistic correspondences for a zodiac sign.
 *
 * Server Component. Data is fetched at build time via getBySign().
 * Styled as a premium reference card, not a plain <table>.
 */

import { getBySign } from '@/modules/esoteric/lib/correspondences';
import type { Correspondence, CorrespondenceColor } from '@/modules/esoteric/lib/correspondences';
import type { Sign } from '@/shared/types/astrology';

// ---------------------------------------------------------------------------
// Static helpers — hoisted outside component to avoid re-creation per render
// ---------------------------------------------------------------------------

type CorrespondenceStringKey = keyof Pick<
  Correspondence,
  'tarotTrump' | 'hebrewLetter' | 'hebrewSymbol' | 'meaning' | 'stone' | 'perfume' | 'plant' | 'animal'
>;

interface RowDef {
  label: string;
  key: CorrespondenceStringKey;
}

const SIMPLE_ROWS: RowDef[] = [
  { label: 'Tarot Trump', key: 'tarotTrump' },
  { label: 'Hebrew Letter', key: 'hebrewLetter' },
  { label: 'Symbol', key: 'hebrewSymbol' },
  { label: 'Meaning', key: 'meaning' },
  { label: 'Stone', key: 'stone' },
  { label: 'Perfume', key: 'perfume' },
  { label: 'Plant', key: 'plant' },
  { label: 'Animal', key: 'animal' },
];

const COLOR_LABELS: Array<{ key: keyof CorrespondenceColor; label: string }> = [
  { key: 'king', label: 'King Scale' },
  { key: 'queen', label: 'Queen Scale' },
  { key: 'prince', label: 'Prince Scale' },
  { key: 'princess', label: 'Princess Scale' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface CorrespondencesTableProps {
  sign: Sign;
}

export function CorrespondencesTable({ sign }: CorrespondencesTableProps) {
  const data = getBySign(sign);

  if (!data) {
    return (
      <div className="text-white/40 text-sm italic py-4">
        No 777 correspondences found for {sign}.
      </div>
    );
  }

  return (
    <section aria-labelledby="correspondences-heading">
      <h2
        id="correspondences-heading"
        className="text-lg font-semibold text-white/90 mb-4 font-[var(--font-geist-sans)] tracking-wide uppercase text-xs"
      >
        777 Correspondences — Path {data.path}
      </h2>

      <div
        className="rounded-xl border border-white/8 overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.025)' }}
      >
        {/* Simple attribute rows */}
        <dl className="divide-y divide-white/6">
          {SIMPLE_ROWS.map(({ label, key }) => {
            const value = data[key];
            if (value === null || value === undefined) return null;
            return (
              <div
                key={key}
                className="grid grid-cols-[140px_1fr] px-5 py-3 hover:bg-white/3 transition-colors"
              >
                <dt className="text-xs text-white/40 font-[var(--font-geist-sans)] uppercase tracking-wider self-center">
                  {label}
                </dt>
                <dd className="text-sm text-white/85 font-[var(--font-crimson-pro),_'Crimson_Pro',_serif]">
                  {String(value)}
                  {key === 'tarotTrump' && data.tarotNumber !== undefined && (
                    <span className="ml-2 font-[var(--font-geist-mono)] text-white/35 text-xs">
                      Key {data.tarotNumber}
                    </span>
                  )}
                </dd>
              </div>
            );
          })}
        </dl>

        {/* Color scales — separate section */}
        <div className="border-t border-white/8 px-5 py-4">
          <p className="text-xs text-white/40 font-[var(--font-geist-sans)] uppercase tracking-wider mb-3">
            Color Scales
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {COLOR_LABELS.map(({ key, label }) => (
              <div
                key={key}
                className="flex flex-col gap-1 rounded-lg border border-white/6 px-3 py-2"
                style={{ background: 'rgba(255,255,255,0.02)' }}
              >
                <span className="text-[10px] text-white/35 uppercase tracking-widest font-[var(--font-geist-sans)]">
                  {label}
                </span>
                <span className="text-sm text-white/80 font-[var(--font-crimson-pro),_'Crimson_Pro',_serif]">
                  {(data.color as CorrespondenceColor)[key]}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Astrological attribution footer */}
        {data.astrologicalAttribution && (
          <div className="border-t border-white/8 px-5 py-3">
            <p className="text-xs text-white/35 font-[var(--font-geist-sans)]">
              <span className="uppercase tracking-wider text-white/25 mr-2">Attribution</span>
              {data.astrologicalAttribution}
            </p>
          </div>
        )}
      </div>

      <p className="mt-2 text-[11px] text-white/25 font-[var(--font-geist-sans)]">
        Source: Crowley, <em>777 and Other Qabalistic Writings</em> (pre-1929, public domain).
      </p>
    </section>
  );
}
