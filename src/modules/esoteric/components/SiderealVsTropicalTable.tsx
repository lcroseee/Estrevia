/**
 * SiderealVsTropicalTable — compact comparison of sidereal vs tropical date ranges.
 *
 * Server Component. Values are static — dates don't vary enough year-to-year
 * to require dynamic data in this display context.
 */

// ---------------------------------------------------------------------------
// Static data — approximate Sun ingress dates (sidereal Lahiri vs tropical)
// ---------------------------------------------------------------------------

interface SignDates {
  sidereal: string;
  tropical: string;
  offset: string;
}

const SIGN_DATES: Record<string, SignDates> = {
  Aries:       { sidereal: '~14 Apr – 14 May', tropical: '21 Mar – 19 Apr', offset: '~24 days later' },
  Taurus:      { sidereal: '~15 May – 15 Jun', tropical: '20 Apr – 20 May', offset: '~24 days later' },
  Gemini:      { sidereal: '~15 Jun – 17 Jul', tropical: '21 May – 20 Jun', offset: '~24 days later' },
  Cancer:      { sidereal: '~17 Jul – 17 Aug', tropical: '21 Jun – 22 Jul', offset: '~24 days later' },
  Leo:         { sidereal: '~17 Aug – 17 Sep', tropical: '23 Jul – 22 Aug', offset: '~24 days later' },
  Virgo:       { sidereal: '~17 Sep – 17 Oct', tropical: '23 Aug – 22 Sep', offset: '~24 days later' },
  Libra:       { sidereal: '~18 Oct – 17 Nov', tropical: '23 Sep – 22 Oct', offset: '~24 days later' },
  Scorpio:     { sidereal: '~17 Nov – 16 Dec', tropical: '23 Oct – 21 Nov', offset: '~24 days later' },
  Sagittarius: { sidereal: '~16 Dec – 14 Jan', tropical: '22 Nov – 21 Dec', offset: '~24 days later' },
  Capricorn:   { sidereal: '~15 Jan – 13 Feb', tropical: '22 Dec – 19 Jan', offset: '~24 days later' },
  Aquarius:    { sidereal: '~13 Feb – 14 Mar', tropical: '20 Jan – 18 Feb', offset: '~24 days later' },
  Pisces:      { sidereal: '~14 Mar – 14 Apr', tropical: '19 Feb – 20 Mar', offset: '~24 days later' },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface SiderealVsTropicalTableProps {
  planet: string;
  sign: string;
}

export function SiderealVsTropicalTable({ planet, sign }: SiderealVsTropicalTableProps) {
  const dates = SIGN_DATES[sign];

  if (!dates) {
    return null;
  }

  // For non-Sun planets, note that this table shows Sun as reference for the sign period.
  const isNotSun = planet !== 'Sun';

  return (
    <section aria-labelledby="svt-heading">
      <h2
        id="svt-heading"
        className="text-xs font-semibold text-white/90 mb-4 font-[var(--font-geist-sans)] tracking-wide uppercase"
      >
        Sidereal vs Tropical — {sign}
      </h2>

      <div
        className="rounded-xl border border-white/8 overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.025)' }}
      >
        {/* Column headers */}
        <div className="grid grid-cols-3 px-5 py-2 border-b border-white/8 bg-white/3">
          <span className="text-[10px] text-white/35 uppercase tracking-widest font-[var(--font-geist-sans)]">
            System
          </span>
          <span className="text-[10px] text-white/35 uppercase tracking-widest font-[var(--font-geist-sans)]">
            Sun in {sign}
          </span>
          <span className="text-[10px] text-white/35 uppercase tracking-widest font-[var(--font-geist-sans)]">
            Basis
          </span>
        </div>

        {/* Sidereal row */}
        <div className="grid grid-cols-3 px-5 py-3 border-b border-white/6 hover:bg-white/3 transition-colors">
          <span className="text-sm text-white/90 font-[var(--font-geist-sans)] font-medium">
            Sidereal
          </span>
          <span className="text-sm font-[var(--font-geist-mono)] text-amber-400/80">
            {dates.sidereal}
          </span>
          <span className="text-xs text-white/45 font-[var(--font-geist-sans)] self-center">
            Actual constellation (Lahiri)
          </span>
        </div>

        {/* Tropical row */}
        <div className="grid grid-cols-3 px-5 py-3 hover:bg-white/3 transition-colors">
          <span className="text-sm text-white/55 font-[var(--font-geist-sans)]">
            Tropical
          </span>
          <span className="text-sm font-[var(--font-geist-mono)] text-white/40">
            {dates.tropical}
          </span>
          <span className="text-xs text-white/35 font-[var(--font-geist-sans)] self-center">
            Vernal equinox point
          </span>
        </div>

        {/* Offset callout */}
        <div className="border-t border-white/8 px-5 py-3">
          <p className="text-xs text-white/40 font-[var(--font-geist-sans)]">
            The Lahiri ayanamsa is currently ~24°07′. Someone born in the tropical {sign} date
            range may be sidereal{' '}
            <strong className="text-white/65">
              {getPreviousSign(sign)}
            </strong>{' '}
            — {dates.offset} separates the two systems.
          </p>
        </div>
      </div>

      {isNotSun && (
        <p className="mt-2 text-[11px] text-white/25 font-[var(--font-geist-sans)]">
          Date ranges above show when the Sun is in {sign} as a reference period.{' '}
          {planet} moves at a different rate and its position must be calculated individually.
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Helper — previous sign in zodiac order
// ---------------------------------------------------------------------------

const SIGN_ORDER = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
] as const;

function getPreviousSign(sign: string): string {
  const idx = SIGN_ORDER.indexOf(sign as (typeof SIGN_ORDER)[number]);
  if (idx === -1) return 'the previous sign';
  return SIGN_ORDER[(idx + 11) % 12] ?? sign;
}
