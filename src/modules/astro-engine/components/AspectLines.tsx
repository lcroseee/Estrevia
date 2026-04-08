'use client';

import { memo, useMemo } from 'react';
import type { Aspect, Planet } from '@/shared/types';
import { AspectType } from '@/shared/types';

interface Point {
  x: number;
  y: number;
}

interface AspectLinesProps {
  aspects: Aspect[];
  planetPositions: Map<Planet, Point>;
  /** Only render aspects with orb tighter than this (degrees). Default: 8 */
  maxOrb?: number;
}

const ASPECT_COLORS: Record<AspectType, string> = {
  [AspectType.Conjunction]: '#FFD700',    // gold
  [AspectType.SemiSextile]: '#888888',    // gray
  [AspectType.Sextile]: '#3498DB',        // blue
  [AspectType.Square]: '#E74C3C',         // red
  [AspectType.Trine]: '#2ECC71',          // green-blue
  [AspectType.Quincunx]: '#FF8C00',       // orange
  [AspectType.Opposition]: '#C0392B',     // deep red
};

// Max orb per aspect type for visual weight determination
const ASPECT_MAX_ORBS: Record<AspectType, number> = {
  [AspectType.Conjunction]: 8,
  [AspectType.SemiSextile]: 2,
  [AspectType.Sextile]: 6,
  [AspectType.Square]: 8,
  [AspectType.Trine]: 8,
  [AspectType.Quincunx]: 3,
  [AspectType.Opposition]: 8,
};

function getAspectOpacity(aspect: Aspect): number {
  const maxOrb = ASPECT_MAX_ORBS[aspect.type];
  // tight orb = more opaque (range: 0.15 – 0.75)
  const ratio = Math.max(0, 1 - aspect.orb / maxOrb);
  return 0.15 + ratio * 0.6;
}

function getAspectStrokeWidth(aspect: Aspect): number {
  const maxOrb = ASPECT_MAX_ORBS[aspect.type];
  const ratio = Math.max(0, 1 - aspect.orb / maxOrb);
  // major aspects slightly thicker
  const isMajor = [
    AspectType.Conjunction,
    AspectType.Opposition,
    AspectType.Square,
    AspectType.Trine,
    AspectType.Sextile,
  ].includes(aspect.type);
  return isMajor ? 0.6 + ratio * 0.7 : 0.4 + ratio * 0.4;
}

export const AspectLines = memo(function AspectLines({
  aspects,
  planetPositions,
  maxOrb = 8,
}: AspectLinesProps) {
  const visibleAspects = useMemo(
    () =>
      aspects.filter((a) => {
        if (a.orb > maxOrb) return false;
        const p1 = planetPositions.get(a.planet1);
        const p2 = planetPositions.get(a.planet2);
        return p1 !== undefined && p2 !== undefined;
      }),
    [aspects, planetPositions, maxOrb]
  );

  if (visibleAspects.length === 0) return null;

  return (
    <g aria-hidden="true" role="presentation">
      {visibleAspects.map((aspect) => {
        const p1 = planetPositions.get(aspect.planet1)!;
        const p2 = planetPositions.get(aspect.planet2)!;
        const color = ASPECT_COLORS[aspect.type];
        const opacity = getAspectOpacity(aspect);
        const strokeWidth = getAspectStrokeWidth(aspect);
        const isDashed = [AspectType.SemiSextile, AspectType.Quincunx].includes(aspect.type);
        const key = `${aspect.planet1}-${aspect.planet2}-${aspect.type}`;

        return (
          <line
            key={key}
            x1={p1.x}
            y1={p1.y}
            x2={p2.x}
            y2={p2.y}
            stroke={color}
            strokeWidth={strokeWidth}
            strokeOpacity={opacity}
            strokeDasharray={isDashed ? '3 3' : undefined}
            strokeLinecap="round"
          />
        );
      })}
    </g>
  );
});
