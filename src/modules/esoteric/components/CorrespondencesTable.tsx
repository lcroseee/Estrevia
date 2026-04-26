/**
 * CorrespondencesTable — 777 Kabbalistic correspondences for a zodiac sign.
 *
 * Server Component. Data is fetched at build time via getBySign().
 * Styled as a premium reference card, not a plain <table>.
 */

import { getTranslations } from 'next-intl/server';
import { getBySign } from '@/modules/esoteric/lib/correspondences';
import type { Correspondence, CorrespondenceColor } from '@/modules/esoteric/lib/correspondences';
import type { Sign } from '@/shared/types/astrology';

type CorrespondenceStringKey = keyof Pick<
  Correspondence,
  'tarotTrump' | 'hebrewLetter' | 'hebrewSymbol' | 'meaning' | 'stone' | 'perfume' | 'plant' | 'animal'
>;

interface RowDef {
  labelKey: string;
  key: CorrespondenceStringKey;
}

const SIMPLE_ROWS: RowDef[] = [
  { labelKey: 'rowTarot', key: 'tarotTrump' },
  { labelKey: 'rowHebrewLetter', key: 'hebrewLetter' },
  { labelKey: 'rowSymbol', key: 'hebrewSymbol' },
  { labelKey: 'rowMeaning', key: 'meaning' },
  { labelKey: 'rowStone', key: 'stone' },
  { labelKey: 'rowPerfume', key: 'perfume' },
  { labelKey: 'rowPlant', key: 'plant' },
  { labelKey: 'rowAnimal', key: 'animal' },
];

const COLOR_LABELS: Array<{ key: keyof CorrespondenceColor; labelKey: string }> = [
  { key: 'king', labelKey: 'scaleKing' },
  { key: 'queen', labelKey: 'scaleQueen' },
  { key: 'prince', labelKey: 'scalePrince' },
  { key: 'princess', labelKey: 'scalePrincess' },
];

interface CorrespondencesTableProps {
  sign: Sign;
}

export async function CorrespondencesTable({ sign }: CorrespondencesTableProps) {
  const data = getBySign(sign);
  const t = await getTranslations('essayDetail.correspondences');

  if (!data) {
    return (
      <div className="text-white/40 text-sm italic py-4">
        {t('noData', { sign })}
      </div>
    );
  }

  return (
    <section aria-labelledby="correspondences-heading">
      <h2
        id="correspondences-heading"
        className="text-lg font-semibold text-white/90 mb-4 font-[var(--font-geist-sans)] tracking-wide uppercase text-xs"
      >
        {t('heading', { path: data.path })}
      </h2>

      <div
        className="rounded-xl border border-white/8 overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.025)' }}
      >
        <dl className="divide-y divide-white/6">
          {SIMPLE_ROWS.map(({ labelKey, key }) => {
            const value = data[key];
            if (value === null || value === undefined) return null;
            return (
              <div
                key={key}
                className="grid grid-cols-[140px_1fr] px-5 py-3 hover:bg-white/3 transition-colors"
              >
                <dt className="text-xs text-white/40 font-[var(--font-geist-sans)] uppercase tracking-wider self-center">
                  {t(labelKey)}
                </dt>
                <dd className="text-sm text-white/85 font-[var(--font-crimson-pro),_'Crimson_Pro',_serif]">
                  {String(value)}
                  {key === 'tarotTrump' && data.tarotNumber !== undefined && (
                    <span className="ml-2 font-[var(--font-geist-mono)] text-white/35 text-xs">
                      {t('tarotKey', { n: data.tarotNumber })}
                    </span>
                  )}
                </dd>
              </div>
            );
          })}
        </dl>

        <div className="border-t border-white/8 px-5 py-4">
          <p className="text-xs text-white/40 font-[var(--font-geist-sans)] uppercase tracking-wider mb-3">
            {t('colorScalesLabel')}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {COLOR_LABELS.map(({ key, labelKey }) => (
              <div
                key={key}
                className="flex flex-col gap-1 rounded-lg border border-white/6 px-3 py-2"
                style={{ background: 'rgba(255,255,255,0.02)' }}
              >
                <span className="text-[10px] text-white/35 uppercase tracking-widest font-[var(--font-geist-sans)]">
                  {t(labelKey)}
                </span>
                <span className="text-sm text-white/80 font-[var(--font-crimson-pro),_'Crimson_Pro',_serif]">
                  {(data.color as CorrespondenceColor)[key]}
                </span>
              </div>
            ))}
          </div>
        </div>

        {data.astrologicalAttribution && (
          <div className="border-t border-white/8 px-5 py-3">
            <p className="text-xs text-white/35 font-[var(--font-geist-sans)]">
              <span className="uppercase tracking-wider text-white/25 mr-2">{t('attribution')}</span>
              {data.astrologicalAttribution}
            </p>
          </div>
        )}
      </div>

      <p className="mt-2 text-[11px] text-white/25 font-[var(--font-geist-sans)]">
        {t.rich('source', { em: (chunks) => <em>{chunks}</em> })}
      </p>
    </section>
  );
}
