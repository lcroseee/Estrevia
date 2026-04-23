'use client';

import { MoonPhaseSVG } from './MoonPhaseSVG';
import { ZodiacGlyph } from '@/shared/components/ZodiacGlyph';
import {
  daysInMonth,
  firstWeekdayOfMonth,
  MONTH_NAMES,
  WEEKDAY_LABELS,
  type DayData,
  type TodayRef,
} from './moon-types';

interface MoonCalendarGridProps {
  year: number;
  month: number; // 1-indexed
  days: DayData[];
  today: TodayRef;
  onDaySelect: (day: DayData) => void;
}

export function MoonCalendarGrid({ year, month, days, today, onDaySelect }: MoonCalendarGridProps) {
  const firstWeekday = firstWeekdayOfMonth(year, month);
  const totalDays = daysInMonth(year, month);

  // Build cell array: leading empty cells + day cells
  const cells: (DayData | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...days,
  ];

  // Pad to full rows of 7
  while (cells.length % 7 !== 0) cells.push(null);

  const isToday = (d: DayData) =>
    today.year === year && today.month === month && today.day === d.day;

  return (
    <div role="grid" aria-label={`Moon phases for ${MONTH_NAMES[month - 1]} ${year}`}>
      {/* Weekday headers */}
      <div className="grid grid-cols-7 mb-2" role="row">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            role="columnheader"
            className="text-center text-xs py-1"
            style={{
              fontFamily: 'var(--font-geist-sans, sans-serif)',
              color: 'rgba(255,255,255,0.3)',
              letterSpacing: '0.05em',
            }}
          >
            {label}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-1" role="rowgroup">
        {cells.map((cell, idx) => {
          if (!cell) {
            return <div key={`empty-${idx}`} role="gridcell" aria-hidden="true" />;
          }

          const today_ = isToday(cell);
          const isMajorPhase =
            cell.phaseName === 'New Moon' || cell.phaseName === 'Full Moon';

          return (
            <button
              key={cell.day}
              type="button"
              role="gridcell"
              onClick={() => onDaySelect(cell)}
              aria-label={[
                `${MONTH_NAMES[month - 1]} ${cell.day}`,
                `${cell.phaseName}`,
                `${Math.round(cell.illumination)}% illuminated`,
                cell.moonSign ? `Moon in ${cell.moonSign}` : null,
              ].filter(Boolean).join(', ')}
              className="flex flex-col items-center justify-center rounded-xl py-2 px-1 transition-colors duration-200 hover:bg-white/8 active:bg-white/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 cursor-pointer"
              style={{
                background: today_
                  ? 'rgba(240, 208, 128, 0.12)'
                  : isMajorPhase
                    ? 'rgba(255,255,255,0.04)'
                    : 'transparent',
                border: today_
                  ? '1px solid rgba(240, 208, 128, 0.35)'
                  : '1px solid transparent',
                minHeight: '4rem',
              }}
            >
              {/* Day number */}
              <span
                className="text-xs mb-0.5 leading-none"
                style={{
                  fontFamily: 'var(--font-geist-mono, monospace)',
                  color: today_
                    ? '#F0D080'
                    : 'rgba(255,255,255,0.45)',
                }}
              >
                {cell.day}
              </span>

              {/* Moon SVG phase visualization */}
              <MoonPhaseSVG
                illumination={cell.illumination / 100}
                phaseAngle={cell.angle}
                size={24}
              />

              {/* Illumination percentage */}
              <span
                className="text-[10px] mt-0.5 leading-none tabular-nums"
                style={{
                  fontFamily: 'var(--font-geist-mono, monospace)',
                  color: isMajorPhase
                    ? 'rgba(240, 208, 128, 0.7)'
                    : 'rgba(255,255,255,0.25)',
                }}
              >
                {Math.round(cell.illumination)}%
              </span>

              {/* Sidereal sign glyph (absent on free-tier future months until agent 5 wires calendar API) */}
              {cell.moonSign && (
                <ZodiacGlyph
                  sign={cell.moonSign}
                  size={11}
                  className="mt-0.5"
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Accessible: total cells announced as range */}
      <div className="sr-only">
        Showing moon phases for {totalDays} days in {MONTH_NAMES[month - 1]} {year}.
      </div>
    </div>
  );
}
