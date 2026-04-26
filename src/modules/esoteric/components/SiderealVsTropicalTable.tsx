/**
 * SiderealVsTropicalTable — compact comparison of sidereal vs tropical date ranges.
 *
 * Server Component. Values are static — dates don't vary enough year-to-year
 * to require dynamic data in this display context.
 */

import { getTranslations } from 'next-intl/server';

interface SignDates {
  sidereal: string;
  tropical: string;
}

const SIGN_DATES: Record<string, SignDates> = {
  Aries:       { sidereal: '~14 Apr – 14 May', tropical: '21 Mar – 19 Apr' },
  Taurus:      { sidereal: '~15 May – 15 Jun', tropical: '20 Apr – 20 May' },
  Gemini:      { sidereal: '~15 Jun – 17 Jul', tropical: '21 May – 20 Jun' },
  Cancer:      { sidereal: '~17 Jul – 17 Aug', tropical: '21 Jun – 22 Jul' },
  Leo:         { sidereal: '~17 Aug – 17 Sep', tropical: '23 Jul – 22 Aug' },
  Virgo:       { sidereal: '~17 Sep – 17 Oct', tropical: '23 Aug – 22 Sep' },
  Libra:       { sidereal: '~18 Oct – 17 Nov', tropical: '23 Sep – 22 Oct' },
  Scorpio:     { sidereal: '~17 Nov – 16 Dec', tropical: '23 Oct – 21 Nov' },
  Sagittarius: { sidereal: '~16 Dec – 14 Jan', tropical: '22 Nov – 21 Dec' },
  Capricorn:   { sidereal: '~15 Jan – 13 Feb', tropical: '22 Dec – 19 Jan' },
  Aquarius:    { sidereal: '~13 Feb – 14 Mar', tropical: '20 Jan – 18 Feb' },
  Pisces:      { sidereal: '~14 Mar – 14 Apr', tropical: '19 Feb – 20 Mar' },
};

interface SiderealVsTropicalTableProps {
  planet: string;
  sign: string;
}

export async function SiderealVsTropicalTable({ planet, sign }: SiderealVsTropicalTableProps) {
  const dates = SIGN_DATES[sign];
  if (!dates) return null;

  const t = await getTranslations('essayDetail.comparison');
  const tPlanet = await getTranslations('essayDetail.planets');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const planetLocalized = tPlanet(planet as any);
  const isNotSun = planet !== 'Sun';

  return (
    <section aria-labelledby="svt-heading">
      <h2
        id="svt-heading"
        className="text-xs font-semibold text-white/90 mb-4 font-[var(--font-geist-sans)] tracking-wide uppercase"
      >
        {t('heading', { sign })}
      </h2>

      <div
        className="rounded-xl border border-white/8 overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.025)' }}
      >
        <div className="grid grid-cols-3 px-5 py-2 border-b border-white/8 bg-white/3">
          <span className="text-[10px] text-white/35 uppercase tracking-widest font-[var(--font-geist-sans)]">
            {t('colSystem')}
          </span>
          <span className="text-[10px] text-white/35 uppercase tracking-widest font-[var(--font-geist-sans)]">
            {t('colSunInSign', { sign })}
          </span>
          <span className="text-[10px] text-white/35 uppercase tracking-widest font-[var(--font-geist-sans)]">
            {t('colBasis')}
          </span>
        </div>

        <div className="grid grid-cols-3 px-5 py-3 border-b border-white/6 hover:bg-white/3 transition-colors">
          <span className="text-sm text-white/90 font-[var(--font-geist-sans)] font-medium">
            {t('rowSidereal')}
          </span>
          <span className="text-sm font-[var(--font-geist-mono)] text-amber-400/80">
            {dates.sidereal}
          </span>
          <span className="text-xs text-white/45 font-[var(--font-geist-sans)] self-center">
            {t('basisSidereal')}
          </span>
        </div>

        <div className="grid grid-cols-3 px-5 py-3 hover:bg-white/3 transition-colors">
          <span className="text-sm text-white/55 font-[var(--font-geist-sans)]">
            {t('rowTropical')}
          </span>
          <span className="text-sm font-[var(--font-geist-mono)] text-white/40">
            {dates.tropical}
          </span>
          <span className="text-xs text-white/35 font-[var(--font-geist-sans)] self-center">
            {t('basisTropical')}
          </span>
        </div>

        <div className="border-t border-white/8 px-5 py-3">
          <p className="text-xs text-white/40 font-[var(--font-geist-sans)]">
            {t.rich('callout', {
              sign,
              prevSign: getPreviousSign(sign),
              offset: t('offset'),
              strong: (chunks) => <strong className="text-white/65">{chunks}</strong>,
            })}
          </p>
        </div>
      </div>

      {isNotSun && (
        <p className="mt-2 text-[11px] text-white/25 font-[var(--font-geist-sans)]">
          {t('noteNotSun', { sign, planet: planetLocalized })}
        </p>
      )}
    </section>
  );
}

const SIGN_ORDER = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
] as const;

function getPreviousSign(sign: string): string {
  const idx = SIGN_ORDER.indexOf(sign as (typeof SIGN_ORDER)[number]);
  if (idx === -1) return sign;
  return SIGN_ORDER[(idx + 11) % 12] ?? sign;
}
