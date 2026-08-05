'use client';

import {
  ZODIAC_SIGNS,
  SIGN_COLORS,
  SIGN_TEXT_COLORS,
  SIGN_GLYPHS,
  polarToCart,
} from './chart-wheel-zodiac';

interface ZodiacRingProps {
  cx: number;
  cy: number;
  innerR: number;
  outerR: number;
  /**
   * Wheel-space angle at which this ring's 0° falls.
   *
   * Sidereal: the chart rotation. Tropical: the chart rotation minus the
   * ayanamsa — the wheel plots planets by sidereal longitude, and tropical
   * sign i begins at sidereal longitude (i*30 − ayanamsa).
   */
  rotation: number;
  glyphSize: number;
  /** Names the frame, so `both` produces two distinguishable ring labels. */
  label: string;
  opacity?: number;
}

/**
 * One band of twelve zodiac sectors.
 *
 * Extracted verbatim from ChartWheel so `both` can render two concentric
 * bands over a single set of planets, houses and aspects — the three things
 * that are identical in either frame and must not be drawn twice.
 */
export function ZodiacRing({
  cx,
  cy,
  innerR,
  outerR,
  rotation,
  glyphSize,
  label,
  opacity = 0.6,
}: ZodiacRingProps) {
  return (
    <g aria-label={label}>
      {ZODIAC_SIGNS.map((sign, i) => {
        const startAngle = i * 30 + rotation;
        const endAngle = startAngle + 30;
        const midAngle = startAngle + 15;

        const outerStart = polarToCart(cx, cy, outerR, startAngle);
        const innerStart = polarToCart(cx, cy, innerR, startAngle);
        const outerEnd = polarToCart(cx, cy, outerR, endAngle);
        const innerEnd = polarToCart(cx, cy, innerR, endAngle);

        const sectorPath = [
          `M ${outerStart.x} ${outerStart.y}`,
          `A ${outerR} ${outerR} 0 0 1 ${outerEnd.x} ${outerEnd.y}`,
          `L ${innerEnd.x} ${innerEnd.y}`,
          `A ${innerR} ${innerR} 0 0 0 ${innerStart.x} ${innerStart.y}`,
          'Z',
        ].join(' ');

        const glyphPt = polarToCart(cx, cy, (outerR + innerR) / 2, midAngle);

        return (
          <g key={`${label}-${sign}`} role="img" aria-label={`${label}: ${sign}`}>
            <path
              d={sectorPath}
              fill={SIGN_COLORS[sign]}
              fillOpacity={opacity}
              stroke="#ffffff"
              strokeWidth={0.3}
              strokeOpacity={0.15}
            />
            <text
              x={glyphPt.x}
              y={glyphPt.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={glyphSize}
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
  );
}
