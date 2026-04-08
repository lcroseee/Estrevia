/**
 * EphemerisTable — shows ingress dates when a planet enters a given sign.
 *
 * Server Component. Reads from ephemeris-tables.json (generated at build time).
 * Displays a 5-year range of transit entries.
 */

import ephemerisData from '@/modules/esoteric/data/ephemeris-tables.json';

// ---------------------------------------------------------------------------
// Types matching ephemeris-tables.json structure
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Static data
// ---------------------------------------------------------------------------

const data = ephemerisData as EphemerisJson;

// Capitalise first letter for matching planet key (json uses "Sun", "Moon", etc.)
function normalizePlanet(planet: string): string {
  return planet.charAt(0).toUpperCase() + planet.slice(1).toLowerCase();
}

// Format "2024-04-14" → "14 Apr 2024"
function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return `${day} ${months[(month ?? 1) - 1]} ${year}`;
}

// Find the next ingress date for calculating "exits" — the entry of the next sign.
function buildTransitRows(ingresses: Ingress[], sign: string): Array<{ enters: string; exits: string | null }> {
  const rows: Array<{ enters: string; exits: string | null }> = [];

  for (let i = 0; i < ingresses.length; i++) {
    const current = ingresses[i];
    if (!current || current.sign !== sign) continue;

    // Find the next ingress regardless of sign — that's when it exits
    const nextAny = ingresses[i + 1];
    rows.push({
      enters: current.date,
      exits: nextAny ? nextAny.date : null,
    });
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface EphemerisTableProps {
  planet: string;
  sign: string;
}

export function EphemerisTable({ planet, sign }: EphemerisTableProps) {
  const planetKey = normalizePlanet(planet);
  const planetData = data.planets[planetKey];

  if (!planetData) {
    return (
      <div className="text-white/40 text-sm italic py-4">
        No ephemeris data available for {planet}.
      </div>
    );
  }

  const rows = buildTransitRows(planetData.ingresses, sign);

  if (rows.length === 0) {
    return (
      <div className="text-white/40 text-sm italic py-4">
        No transits of {planet} through {sign} in this range (
        {data.range.start} – {data.range.end}).
      </div>
    );
  }

  return (
    <section aria-labelledby="ephemeris-heading">
      <h2
        id="ephemeris-heading"
        className="text-xs font-semibold text-white/90 mb-4 font-[var(--font-geist-sans)] tracking-wide uppercase"
      >
        Ephemeris — {planet} in {sign}
      </h2>

      <div
        className="rounded-xl border border-white/8 overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.025)' }}
      >
        {/* Table header */}
        <div className="grid grid-cols-2 px-5 py-2 border-b border-white/8 bg-white/3">
          <span className="text-[10px] text-white/35 uppercase tracking-widest font-[var(--font-geist-sans)]">
            Enters {sign}
          </span>
          <span className="text-[10px] text-white/35 uppercase tracking-widest font-[var(--font-geist-sans)]">
            Leaves {sign}
          </span>
        </div>

        {/* Transit rows */}
        <div role="table" aria-label={`${planet} in ${sign} transit dates`}>
          <div role="rowgroup">
            {rows.map(({ enters, exits }, idx) => (
              <div
                key={enters}
                role="row"
                className={`grid grid-cols-2 px-5 py-3 hover:bg-white/3 transition-colors ${
                  idx < rows.length - 1 ? 'border-b border-white/6' : ''
                }`}
              >
                <span
                  role="cell"
                  className="text-sm font-[var(--font-geist-mono)] text-white/85"
                >
                  {formatDate(enters)}
                </span>
                <span
                  role="cell"
                  className="text-sm font-[var(--font-geist-mono)] text-white/55"
                >
                  {exits ? formatDate(exits) : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="mt-2 text-[11px] text-white/25 font-[var(--font-geist-sans)]">
        Sidereal (Lahiri ayanamsa). Range: {data.range.start} – {data.range.end}. Dates vary ±1 day by year.
      </p>
    </section>
  );
}
