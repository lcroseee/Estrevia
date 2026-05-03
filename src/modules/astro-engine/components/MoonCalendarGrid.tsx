'use client';

import { useTranslations } from 'next-intl';
import { MoonPhaseSVG } from './MoonPhaseSVG';
import { ZodiacGlyph } from '@/shared/components/ZodiacGlyph';
import {
  daysInMonth,
  firstWeekdayOfMonth,
  phaseIdFromName,
  WEEKDAY_KEYS,
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
  const t = useTranslations('moonPage');
  const firstWeekday = firstWeekdayOfMonth(year, month);
  const totalDays = daysInMonth(year, month);
  const monthLong = t(`months.long.${month}`);

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
    <div role="grid" aria-label={t('calendar.monthAria', { month: monthLong, year })}>
      {/* Weekday headers */}
      <div className="grid grid-cols-7 mb-2" role="row">
        {WEEKDAY_KEYS.map((key) => (
          <div
            key={key}
            role="columnheader"
            className="text-center text-xs py-1"
            style={{
              fontFamily: 'var(--font-geist-sans, sans-serif)',
              color: 'rgba(255,255,255,0.55)',
              letterSpacing: '0.05em',
            }}
          >
            {t(`weekdays.${key}`)}
          </div>
        ))}
      </div>

      {/* Day cells — grouped into rows of 7 for ARIA grid compliance (role="gridcell" requires role="row" parent) */}
      <div className="flex flex-col gap-1">
        {Array.from({ length: cells.length / 7 }, (_, rowIdx) => (
          <div key={`row-${rowIdx}`} role="row" className="grid grid-cols-7 gap-1">
            {cells.slice(rowIdx * 7, rowIdx * 7 + 7).map((cell, colIdx) => {
              const idx = rowIdx * 7 + colIdx;
              if (!cell) {
                return <div key={`empty-${idx}`} role="gridcell" aria-hidden="true" />;
              }

              const today_ = isToday(cell);
              const isMajorPhase =
                cell.phaseName === 'New Moon' || cell.phaseName === 'Full Moon';
              const phaseLocalized = t(`phases.${phaseIdFromName(cell.phaseName)}`);
              const percent = Math.round(cell.illumination);
              const cellAria = cell.moonSign
                ? t('calendar.cellAriaWithSign', {
                    month: monthLong,
                    day: cell.day,
                    phase: phaseLocalized,
                    percent,
                    sign: cell.moonSign,
                  })
                : t('calendar.cellAria', {
                    month: monthLong,
                    day: cell.day,
                    phase: phaseLocalized,
                    percent,
                  });

              return (
                <button
                  key={cell.day}
                  type="button"
                  role="gridcell"
                  onClick={() => onDaySelect(cell)}
                  aria-label={cellAria}
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
                  {/* Wrap all visual children in aria-hidden — button's accessible name is solely aria-label (WCAG 2.5.3) */}
                  <span aria-hidden="true" className="flex flex-col items-center">
                    <span
                      className="text-xs mb-0.5 leading-none"
                      style={{
                        fontFamily: 'var(--font-geist-mono, monospace)',
                        color: today_
                          ? '#F0D080'
                          : 'rgba(255,255,255,0.52)',
                      }}
                    >
                      {cell.day}
                    </span>

                    <MoonPhaseSVG
                      illumination={cell.illumination / 100}
                      phaseAngle={cell.angle}
                      size={24}
                    />

                    <span
                      className="text-[10px] mt-0.5 leading-none tabular-nums"
                      style={{
                        fontFamily: 'var(--font-geist-mono, monospace)',
                        color: isMajorPhase
                          ? 'rgba(240, 208, 128, 0.7)'
                          : 'rgba(255,255,255,0.55)',
                      }}
                    >
                      {Math.round(cell.illumination)}%
                    </span>

                    {cell.moonSign && (
                      <ZodiacGlyph
                        sign={cell.moonSign}
                        size={11}
                        className="mt-0.5"
                      />
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Accessible: total cells announced as range */}
      <div className="sr-only">
        {t('calendar.summary', { totalDays, month: monthLong, year })}
      </div>
    </div>
  );
}
