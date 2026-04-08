'use client';

import type { Planet } from '@/shared/types';

// Standard astrological Unicode glyphs
const PLANET_GLYPHS: Record<Planet, string> = {
  Sun: '☉',
  Moon: '☽',
  Mercury: '☿',
  Venus: '♀',
  Mars: '♂',
  Jupiter: '♃',
  Saturn: '♄',
  Uranus: '♅',
  Neptune: '♆',
  Pluto: '♇',
  NorthNode: '☊',
  Chiron: '⚷',
};

export const PLANET_COLORS: Record<Planet, string> = {
  Sun: '#FFD700',
  Moon: '#C0C0C0',
  Mercury: '#9B59B6',
  Venus: '#2ECC71',
  Mars: '#E74C3C',
  Jupiter: '#3498DB',
  Saturn: '#8B7355',
  Uranus: '#00CED1',
  Neptune: '#1E90FF',
  Pluto: '#9B8B7B',
  NorthNode: '#808080',
  Chiron: '#FF69B4',
};

interface PlanetGlyphProps {
  planet: Planet;
  x: number;
  y: number;
  size?: number;
  color?: string;
  isRetrograde?: boolean;
  onClick?: () => void;
  isHighlighted?: boolean;
}

export function PlanetGlyph({
  planet,
  x,
  y,
  size = 14,
  color,
  isRetrograde = false,
  onClick,
  isHighlighted = false,
}: PlanetGlyphProps) {
  const resolvedColor = color ?? PLANET_COLORS[planet];
  const bgRadius = size * 0.9;

  return (
    <g
      transform={`translate(${x}, ${y})`}
      role="img"
      aria-label={`${planet}${isRetrograde ? ' (retrograde)' : ''}`}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
      onClick={onClick}
      tabIndex={onClick ? 0 : -1}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {/* Highlight ring */}
      {isHighlighted && (
        <circle
          r={bgRadius + 3}
          fill="none"
          stroke={resolvedColor}
          strokeWidth={1.5}
          opacity={0.6}
        />
      )}
      {/* Background circle for legibility */}
      <circle
        r={bgRadius}
        fill="#0A0A0F"
        fillOpacity={0.85}
        stroke={resolvedColor}
        strokeWidth={isHighlighted ? 1.5 : 0.8}
        strokeOpacity={0.7}
      />
      {/* Planet glyph */}
      <text
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={size}
        fill={resolvedColor}
        fontFamily="serif"
        style={{ userSelect: 'none', pointerEvents: 'none' }}
      >
        {PLANET_GLYPHS[planet]}
      </text>
      {/* Retrograde marker */}
      {isRetrograde && (
        <text
          x={bgRadius - 1}
          y={-bgRadius + 1}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={size * 0.5}
          fill={resolvedColor}
          fontFamily="sans-serif"
          style={{ userSelect: 'none', pointerEvents: 'none' }}
        >
          ℞
        </text>
      )}
    </g>
  );
}
