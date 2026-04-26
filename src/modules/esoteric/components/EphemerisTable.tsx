/**
 * EphemerisTable — shows ingress dates when a planet enters a given sign.
 *
 * Server Component. Reads from ephemeris-tables.json (generated at build time).
 * Displays a 5-year range of transit entries.
 */

import { getLocale, getTranslations } from 'next-intl/server';
import ephemerisData from '@/modules/esoteric/data/ephemeris-tables.json';

interface Ingress {
  sign: string;
  date: string;
  degree: number;
}

interface EphemerisJson {
  generated: string;
  range: { start: string; end: string };
  planets: Record<string, { ingresses: Ingress[] }>;
}

const data = ephemerisData as EphemerisJson;

function normalizePlanet(planet: string): string {
  return planet.charAt(0).toUpperCase() + planet.slice(1).toLowerCase();
}

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function formatDate(iso: string, locale: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  const months = locale === 'es' ? MONTHS_ES : MONTHS_EN;
  return `${day} ${months[(month ?? 1) - 1]} ${year}`;
}

function buildTransitRows(ingresses: Ingress[], sign: string): Array<{ enters: string; exits: string | null }> {
  const rows: Array<{ enters: string; exits: string | null }> = [];
  for (let i = 0; i < ingresses.length; i++) {
    const current = ingresses[i];
    if (!current || current.sign !== sign) continue;
    const nextAny = ingresses[i + 1];
    rows.push({ enters: current.date, exits: nextAny ? nextAny.date : null });
  }
  return rows;
}

interface EphemerisTableProps {
  planet: string;
  sign: string;
}

export async function EphemerisTable({ planet, sign }: EphemerisTableProps) {
  const planetKey = normalizePlanet(planet);
  const planetData = data.planets[planetKey];

  const t = await getTranslations('essayDetail.ephemeris');
  const tPlanet = await getTranslations('essayDetail.planets');
  const locale = await getLocale();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const planetLocalized = tPlanet(planetKey as any);

  if (!planetData) {
    return (
      <div className="text-white/40 text-sm italic py-4">
        {t('noPlanetData', { planet: planetLocalized })}
      </div>
    );
  }

  const rows = buildTransitRows(planetData.ingresses, sign);

  if (rows.length === 0) {
    return (
      <div className="text-white/40 text-sm italic py-4">
        {t('noTransits', { planet: planetLocalized, sign, start: data.range.start, end: data.range.end })}
      </div>
    );
  }

  return (
    <section aria-labelledby="ephemeris-heading">
      <h2
        id="ephemeris-heading"
        className="text-xs font-semibold text-white/90 mb-4 font-[var(--font-geist-sans)] tracking-wide uppercase"
      >
        {t('heading', { planet: planetLocalized, sign })}
      </h2>

      <div
        className="rounded-xl border border-white/8 overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.025)' }}
      >
        <div className="grid grid-cols-2 px-5 py-2 border-b border-white/8 bg-white/3">
          <span className="text-[10px] text-white/35 uppercase tracking-widest font-[var(--font-geist-sans)]">
            {t('colEnters', { sign })}
          </span>
          <span className="text-[10px] text-white/35 uppercase tracking-widest font-[var(--font-geist-sans)]">
            {t('colExits', { sign })}
          </span>
        </div>

        <div role="table" aria-label={t('tableAria', { planet: planetLocalized, sign })}>
          <div role="rowgroup">
            {rows.map(({ enters, exits }, idx) => (
              <div
                key={enters}
                role="row"
                className={`grid grid-cols-2 px-5 py-3 hover:bg-white/3 transition-colors ${
                  idx < rows.length - 1 ? 'border-b border-white/6' : ''
                }`}
              >
                <span role="cell" className="text-sm font-[var(--font-geist-mono)] text-white/85">
                  {formatDate(enters, locale)}
                </span>
                <span role="cell" className="text-sm font-[var(--font-geist-mono)] text-white/55">
                  {exits ? formatDate(exits, locale) : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="mt-2 text-[11px] text-white/25 font-[var(--font-geist-sans)]">
        {t('footer', { start: data.range.start, end: data.range.end })}
      </p>
    </section>
  );
}
