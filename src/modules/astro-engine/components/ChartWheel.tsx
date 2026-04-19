'use client';

import { memo, useMemo, useState, useCallback, useId } from 'react';
import type { ChartResult, PlanetPosition } from '@/shared/types';
import { Planet, Sign } from '@/shared/types';
import { PlanetGlyph, PLANET_COLORS } from './PlanetGlyph';
import { AspectLines } from './AspectLines';

// ─── Constants ────────────────────────────────────────────────────────────────

const ZODIAC_SIGNS: Sign[] = [
  Sign.Aries, Sign.Taurus, Sign.Gemini, Sign.Cancer,
  Sign.Leo, Sign.Virgo, Sign.Libra, Sign.Scorpio,
  Sign.Sagittarius, Sign.Capricorn, Sign.Aquarius, Sign.Pisces,
];

const SIGN_GLYPHS: Record<Sign, string> = {
  [Sign.Aries]: '♈', [Sign.Taurus]: '♉', [Sign.Gemini]: '♊',
  [Sign.Cancer]: '♋', [Sign.Leo]: '♌', [Sign.Virgo]: '♍',
  [Sign.Libra]: '♎', [Sign.Scorpio]: '♏', [Sign.Sagittarius]: '♐',
  [Sign.Capricorn]: '♑', [Sign.Aquarius]: '♒', [Sign.Pisces]: '♓',
};

// Element colors for zodiac ring sectors
const SIGN_COLORS: Record<Sign, string> = {
  [Sign.Aries]: '#8B2500',      // Fire
  [Sign.Taurus]: '#1A4A1A',     // Earth
  [Sign.Gemini]: '#1A2A5E',     // Air
  [Sign.Cancer]: '#0D3B3B',     // Water
  [Sign.Leo]: '#7A2000',        // Fire
  [Sign.Virgo]: '#163416',      // Earth
  [Sign.Libra]: '#162050',      // Air
  [Sign.Scorpio]: '#0A3030',    // Water
  [Sign.Sagittarius]: '#6B1E00', // Fire
  [Sign.Capricorn]: '#122A12',  // Earth
  [Sign.Aquarius]: '#101840',   // Air
  [Sign.Pisces]: '#082828',     // Water
};

const SIGN_TEXT_COLORS: Record<Sign, string> = {
  [Sign.Aries]: '#FF6B3D', [Sign.Taurus]: '#5DBB5D', [Sign.Gemini]: '#6B9AFF',
  [Sign.Cancer]: '#5ECECE', [Sign.Leo]: '#FF8C42', [Sign.Virgo]: '#4CAF50',
  [Sign.Libra]: '#7BA7FF', [Sign.Scorpio]: '#4ECECE', [Sign.Sagittarius]: '#FF7A30',
  [Sign.Capricorn]: '#66BB6A', [Sign.Aquarius]: '#82AAFF', [Sign.Pisces]: '#80DEEA',
};

// ─── Geometry helpers ─────────────────────────────────────────────────────────

function polarToCart(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start = polarToCart(cx, cy, r, startAngle);
  const end = polarToCart(cx, cy, r, endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

// Resolve the chart's zero-point angle.
// If ASC is available, Aries 0° maps to ASC position on the wheel (left horizon).
// Otherwise, Aries 0° is at the left (180° offset so Aries starts at left).
function getChartRotation(chart: ChartResult): number {
  if (chart.ascendant) {
    // ASC degree determines the rotation: ASC goes to the 180° position (left horizon)
    return 180 - chart.ascendant.absoluteDegree;
  }
  // No ASC: place Aries cusp at left (western astrology convention flipped)
  return 180;
}

// Convert an absolute ecliptic degree to SVG wheel angle
function eclipticToWheelAngle(eclipticDeg: number, chartRotation: number): number {
  return eclipticDeg + chartRotation;
}

// ─── Conjunction resolution ───────────────────────────────────────────────────

interface PlacedPlanet {
  planet: Planet;
  position: PlanetPosition;
  angle: number; // adjusted wheel angle
}

function resolvePlanetPositions(
  planets: PlanetPosition[],
  chartRotation: number,
  radius: number
): PlacedPlanet[] {
  // Sort by degree
  const placed: PlacedPlanet[] = planets.map((p) => ({
    planet: p.planet,
    position: p,
    angle: eclipticToWheelAngle(p.absoluteDegree, chartRotation) % 360,
  }));

  // Cluster conjunct planets (within 5°) and spread them
  const minSep = 8; // degrees minimum between glyphs on the ring
  placed.sort((a, b) => a.angle - b.angle);

  // Iterative relaxation to avoid overlap
  for (let iter = 0; iter < 20; iter++) {
    let moved = false;
    for (let i = 0; i < placed.length; i++) {
      const prev = placed[(i - 1 + placed.length) % placed.length];
      const curr = placed[i];
      const next = placed[(i + 1) % placed.length];

      // Angular distance considering wrap
      const distPrev = ((curr.angle - prev.angle) + 360) % 360;
      const distNext = ((next.angle - curr.angle) + 360) % 360;

      if (distPrev < minSep && placed.length > 1) {
        curr.angle = (curr.angle + 0.5 + 360) % 360;
        moved = true;
      }
      if (distNext < minSep && placed.length > 1) {
        curr.angle = (curr.angle - 0.5 + 360) % 360;
        moved = true;
      }
    }
    if (!moved) break;
  }

  return placed;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface ChartWheelProps {
  chart: ChartResult;
  showAspects?: boolean;
  showHouses?: boolean;
  size?: number;
}

// ─── Main component ───────────────────────────────────────────────────────────

export const ChartWheel = memo(function ChartWheel({
  chart,
  showAspects = true,
  showHouses = true,
  size: sizeProp,
}: ChartWheelProps) {
  const [selectedPlanet, setSelectedPlanet] = useState<Planet | null>(null);
  const titleId = useId();
  const descId = useId();

  // Responsive: clamp between 320 and 600
  const size = sizeProp ?? 520;
  const cx = size / 2;
  const cy = size / 2;

  // Radii
  const outerR = size * 0.46;        // outer edge of zodiac ring
  const zodiacOuterR = outerR;
  const zodiacInnerR = outerR * 0.82; // inner edge of zodiac ring
  const houseRingR = zodiacInnerR;
  const houseInnerR = zodiacInnerR * 0.85;
  const planetRingR = zodiacInnerR * 0.73; // where planet glyphs sit
  const aspectCircleR = zodiacInnerR * 0.50; // inner boundary for aspect lines
  const glyphSize = Math.max(10, size * 0.026);

  const chartRotation = useMemo(() => getChartRotation(chart), [chart]);

  // Placed planets (conjunction-resolved)
  const placedPlanets = useMemo(
    () => resolvePlanetPositions(chart.planets, chartRotation, planetRingR),
    [chart.planets, chartRotation, planetRingR]
  );

  // Planet SVG positions map (used by AspectLines)
  const planetPositions = useMemo(() => {
    const map = new Map<Planet, { x: number; y: number }>();
    for (const pp of placedPlanets) {
      const pt = polarToCart(cx, cy, aspectCircleR * 0.85, pp.angle);
      map.set(pp.planet, pt);
    }
    return map;
  }, [placedPlanets, cx, cy, aspectCircleR]);

  // ASC/MC tick angles
  const ascAngle = chart.ascendant
    ? eclipticToWheelAngle(chart.ascendant.absoluteDegree, chartRotation)
    : null;
  const mcAngle = chart.midheaven
    ? eclipticToWheelAngle(chart.midheaven.absoluteDegree, chartRotation)
    : null;

  const handlePlanetClick = useCallback((planet: Planet) => {
    setSelectedPlanet((prev) => (prev === planet ? null : planet));
  }, []);

  // Selected planet info
  const selectedInfo = selectedPlanet
    ? chart.planets.find((p) => p.planet === selectedPlanet) ??
      (chart.ascendant?.planet === selectedPlanet ? chart.ascendant : null) ??
      (chart.midheaven?.planet === selectedPlanet ? chart.midheaven : null)
    : null;

  return (
    <div className="flex flex-col items-center gap-3 w-full">
      {/* SVG Wheel */}
      <svg
        viewBox={`0 0 ${size} ${size}`}
        width="100%"
        style={{ maxWidth: size, aspectRatio: '1 / 1' }}
        role="img"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="select-none"
      >
        <title id={titleId}>Natal Chart Wheel</title>
        <desc id={descId}>
          Sidereal natal chart showing {chart.planets.length} planets across 12 zodiac signs.
          {chart.houses ? ' House cusps included.' : ' No houses (birth time unknown).'}
        </desc>

        {/* Defs: radial gradients */}
        <defs>
          <radialGradient id="chartBg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#12121A" />
            <stop offset="100%" stopColor="#0A0A0F" />
          </radialGradient>
          <radialGradient id="centerGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#1A1A2E" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#0A0A0F" stopOpacity="0" />
          </radialGradient>
          <filter id="glyphShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation="2" floodOpacity="0.5" />
          </filter>
        </defs>

        {/* Background */}
        <circle cx={cx} cy={cy} r={outerR + 2} fill="url(#chartBg)" />

        {/* ── Zodiac ring ── */}
        <g aria-label="Zodiac signs">
          {ZODIAC_SIGNS.map((sign, i) => {
            const startAngle = i * 30 + chartRotation;
            const endAngle = startAngle + 30;
            const midAngle = startAngle + 15;

            const outerPath = describeArc(cx, cy, zodiacOuterR, startAngle, endAngle);
            const innerPath = describeArc(cx, cy, zodiacInnerR, endAngle, startAngle);

            const outerStart = polarToCart(cx, cy, zodiacOuterR, startAngle);
            const innerStart = polarToCart(cx, cy, zodiacInnerR, startAngle);
            const outerEnd = polarToCart(cx, cy, zodiacOuterR, endAngle);
            const innerEnd = polarToCart(cx, cy, zodiacInnerR, endAngle);

            const sectorPath = [
              `M ${outerStart.x} ${outerStart.y}`,
              `A ${zodiacOuterR} ${zodiacOuterR} 0 0 1 ${outerEnd.x} ${outerEnd.y}`,
              `L ${innerEnd.x} ${innerEnd.y}`,
              `A ${zodiacInnerR} ${zodiacInnerR} 0 0 0 ${innerStart.x} ${innerStart.y}`,
              'Z',
            ].join(' ');

            const glyphPt = polarToCart(cx, cy, (zodiacOuterR + zodiacInnerR) / 2, midAngle);

            return (
              <g key={sign} role="img" aria-label={sign}>
                <path
                  d={sectorPath}
                  fill={SIGN_COLORS[sign]}
                  fillOpacity={0.6}
                  stroke="#ffffff"
                  strokeWidth={0.3}
                  strokeOpacity={0.15}
                />
                <text
                  x={glyphPt.x}
                  y={glyphPt.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={glyphSize * 1.2}
                  fill={SIGN_TEXT_COLORS[sign]}
                  fillOpacity={0.85}
                  style={{ pointerEvents: 'none' }}
                >
                  {SIGN_GLYPHS[sign]}
                </text>
              </g>
            );
          })}
        </g>

        {/* Outer ring border */}
        <circle cx={cx} cy={cy} r={zodiacOuterR} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={0.8} />
        <circle cx={cx} cy={cy} r={zodiacInnerR} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={0.8} />

        {/* ── House cusps ── */}
        {showHouses && chart.houses && (
          <g aria-label="House cusps">
            {chart.houses.map((cusp) => {
              const angle = eclipticToWheelAngle(cusp.degree, chartRotation);
              const outer = polarToCart(cx, cy, zodiacInnerR, angle);
              const inner = polarToCart(cx, cy, houseInnerR * 0.6, angle);
              const labelPt = polarToCart(cx, cy, houseInnerR * 0.73, angle);
              const isAngular = [1, 4, 7, 10].includes(cusp.house);

              return (
                <g key={cusp.house} role="img" aria-label={`House ${cusp.house}`}>
                  <line
                    x1={outer.x}
                    y1={outer.y}
                    x2={inner.x}
                    y2={inner.y}
                    stroke={isAngular ? 'rgba(255,215,0,0.5)' : 'rgba(255,255,255,0.15)'}
                    strokeWidth={isAngular ? 1.2 : 0.6}
                    strokeDasharray={isAngular ? undefined : '2 3'}
                  />
                  <text
                    x={labelPt.x}
                    y={labelPt.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={glyphSize * 0.75}
                    fill="rgba(255,255,255,0.3)"
                    style={{ pointerEvents: 'none', fontFamily: 'var(--font-geist-mono, monospace)' }}
                  >
                    {cusp.house}
                  </text>
                </g>
              );
            })}
          </g>
        )}

        {/* ── Aspect lines (drawn first so they're behind glyphs) ── */}
        {showAspects && (
          <AspectLines
            aspects={chart.aspects}
            planetPositions={planetPositions}
          />
        )}

        {/* Center glow */}
        <circle cx={cx} cy={cy} r={aspectCircleR * 0.85} fill="url(#centerGlow)" />

        {/* ── Planet glyphs ── */}
        <g aria-label="Planets">
          {placedPlanets.map((pp) => {
            const pt = polarToCart(cx, cy, planetRingR, pp.angle);
            // Draw a tiny tick from zodiac inner ring to planet position
            const tickOuter = polarToCart(cx, cy, zodiacInnerR - 2, eclipticToWheelAngle(pp.position.absoluteDegree, chartRotation));
            const tickInner = polarToCart(cx, cy, zodiacInnerR - 8, eclipticToWheelAngle(pp.position.absoluteDegree, chartRotation));
            const color = PLANET_COLORS[pp.planet];

            return (
              <g key={pp.planet}>
                {/* Exact degree tick on inner zodiac edge */}
                <line
                  x1={tickOuter.x}
                  y1={tickOuter.y}
                  x2={tickInner.x}
                  y2={tickInner.y}
                  stroke={color}
                  strokeWidth={0.8}
                  strokeOpacity={0.5}
                />
                {/* Line from tick to glyph */}
                <line
                  x1={tickInner.x}
                  y1={tickInner.y}
                  x2={pt.x}
                  y2={pt.y}
                  stroke={color}
                  strokeWidth={0.5}
                  strokeOpacity={0.25}
                  strokeDasharray="1 2"
                />
                <PlanetGlyph
                  planet={pp.planet}
                  x={pt.x}
                  y={pt.y}
                  size={glyphSize}
                  isRetrograde={pp.position.isRetrograde}
                  isHighlighted={selectedPlanet === pp.planet}
                  onClick={() => handlePlanetClick(pp.planet)}
                />
              </g>
            );
          })}
        </g>

        {/* ── ASC / MC axis labels ── */}
        {ascAngle !== null && (
          <>
            {/* ASC */}
            <g>
              {(() => {
                const pt = polarToCart(cx, cy, zodiacOuterR + 12, ascAngle);
                const ptOpp = polarToCart(cx, cy, zodiacOuterR + 12, (ascAngle + 180) % 360);
                return (
                  <>
                    <text x={pt.x} y={pt.y} textAnchor="middle" dominantBaseline="central"
                      fontSize={glyphSize * 0.8} fill="rgba(255,215,0,0.9)" fontWeight="600"
                      style={{ pointerEvents: 'none' }}>AC</text>
                    <text x={ptOpp.x} y={ptOpp.y} textAnchor="middle" dominantBaseline="central"
                      fontSize={glyphSize * 0.8} fill="rgba(255,215,0,0.5)"
                      style={{ pointerEvents: 'none' }}>DC</text>
                  </>
                );
              })()}
            </g>
          </>
        )}
        {mcAngle !== null && (
          <>
            {(() => {
              const pt = polarToCart(cx, cy, zodiacOuterR + 12, mcAngle);
              const ptOpp = polarToCart(cx, cy, zodiacOuterR + 12, (mcAngle + 180) % 360);
              return (
                <>
                  <text x={pt.x} y={pt.y} textAnchor="middle" dominantBaseline="central"
                    fontSize={glyphSize * 0.8} fill="rgba(255,255,255,0.6)" fontWeight="600"
                    style={{ pointerEvents: 'none' }}>MC</text>
                  <text x={ptOpp.x} y={ptOpp.y} textAnchor="middle" dominantBaseline="central"
                    fontSize={glyphSize * 0.8} fill="rgba(255,255,255,0.35)"
                    style={{ pointerEvents: 'none' }}>IC</text>
                </>
              );
            })()}
          </>
        )}

        {/* Inner border */}
        <circle cx={cx} cy={cy} r={houseInnerR * 0.6} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={0.5} />
      </svg>

      {/* ── Selected planet tooltip ── */}
      {selectedInfo && (
        <div
          className="w-full max-w-xs rounded-xl border border-white/10 bg-white/4 backdrop-blur-sm px-4 py-3 text-sm"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <div className="flex items-center gap-2 mb-1">
            <span
              className="inline-block w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: PLANET_COLORS[selectedInfo.planet] }}
            />
            <span className="font-semibold text-white">
              {selectedInfo.planet}
              {selectedInfo.isRetrograde && (
                <span className="ml-1.5 text-amber-400 font-mono text-xs">℞</span>
              )}
            </span>
          </div>
          <p className="text-white/60 text-xs leading-relaxed font-mono" style={{ fontFamily: 'var(--font-geist-mono, monospace)' }}>
            {selectedInfo.sign} · {selectedInfo.signDegree}°{selectedInfo.minutes.toString().padStart(2, '0')}&prime;
            {selectedInfo.house !== null ? ` · House ${selectedInfo.house}` : ''}
          </p>
        </div>
      )}

      {/* Screen-reader accessible planet list */}
      <ul className="sr-only" aria-label="Planet positions list">
        {chart.planets.map((p) => (
          <li key={p.planet}>
            {p.planet} in {p.sign} at {p.signDegree}°{p.minutes}′
            {p.isRetrograde ? ' retrograde' : ''}
            {p.house !== null ? `, house ${p.house}` : ''}
          </li>
        ))}
      </ul>
    </div>
  );
});
