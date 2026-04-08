'use client';

import { useState, useEffect, useCallback } from 'react';
import type { MoonPhaseResponse, ApiResponse } from '@/shared/types';

// ---------------------------------------------------------------------------
// Moon phase computation client-side
// ---------------------------------------------------------------------------
// Moon moves ~12.19°/day relative to the Sun.
// Given a known angle at a reference date, we approximate each day's angle
// by adding 360/29.53059 per day. This avoids 30 API calls per month view.
//
// For the current day we use the authoritative API value; surrounding days
// use the linear approximation (accurate to ~1° over 15 days).

const DEGREES_PER_DAY = 360 / 29.53059;

function approximateAngle(referenceAngle: number, dayOffset: number): number {
  return ((referenceAngle + dayOffset * DEGREES_PER_DAY) % 360 + 360) % 360;
}

function illuminationFromAngle(angle: number): number {
  return ((1 - Math.cos((angle * Math.PI) / 180)) / 2) * 100;
}

function emojiFromAngle(angle: number): string {
  if (angle < 22.5 || angle >= 337.5) return '🌑';
  if (angle < 67.5) return '🌒';
  if (angle < 112.5) return '🌓';
  if (angle < 157.5) return '🌔';
  if (angle < 202.5) return '🌕';
  if (angle < 247.5) return '🌖';
  if (angle < 292.5) return '🌗';
  return '🌘';
}

function phaseNameFromAngle(angle: number): string {
  if (angle < 22.5 || angle >= 337.5) return 'New Moon';
  if (angle < 67.5) return 'Waxing Crescent';
  if (angle < 112.5) return 'First Quarter';
  if (angle < 157.5) return 'Waxing Gibbous';
  if (angle < 202.5) return 'Full Moon';
  if (angle < 247.5) return 'Waning Gibbous';
  if (angle < 292.5) return 'Last Quarter';
  return 'Waning Crescent';
}

// ---------------------------------------------------------------------------
// Calendar helpers
// ---------------------------------------------------------------------------

/** Returns the number of days in a given month (1-indexed) */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** Weekday (0=Sun) of the 1st of a given month */
function firstWeekdayOfMonth(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay();
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DayData {
  day: number;
  angle: number;
  illumination: number;
  emoji: string;
  phaseName: string;
}

// ---------------------------------------------------------------------------
// Current Phase Display
// ---------------------------------------------------------------------------

function CurrentPhaseCard({ data }: { data: MoonPhaseResponse }) {
  const nextNew = new Date(data.nextNewMoon);
  const nextFull = new Date(data.nextFullMoon);

  const formatDate = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div
      className="rounded-2xl p-6 mb-8 flex flex-col sm:flex-row items-center gap-6"
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {/* Large moon emoji */}
      <div
        className="text-7xl leading-none select-none flex-shrink-0"
        aria-hidden="true"
      >
        {data.emoji}
      </div>

      <div className="flex-1 text-center sm:text-left">
        {/* Phase name */}
        <h2
          className="text-2xl font-medium mb-1"
          style={{ fontFamily: 'var(--font-crimson-pro, serif)', color: '#E8E0D0' }}
        >
          {data.phase}
        </h2>

        {/* Illumination bar */}
        <div className="flex items-center gap-3 mb-4">
          <div
            className="flex-1 h-1.5 rounded-full overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.1)' }}
            role="progressbar"
            aria-valuenow={Math.round(data.illumination)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Illumination ${Math.round(data.illumination)}%`}
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${data.illumination}%`,
                background: 'linear-gradient(90deg, #C0A060, #F0D080)',
              }}
            />
          </div>
          <span
            className="text-sm tabular-nums flex-shrink-0"
            style={{ fontFamily: 'var(--font-geist-mono, monospace)', color: '#F0D080' }}
          >
            {Math.round(data.illumination)}%
          </span>
        </div>

        {/* Next events */}
        <div className="flex flex-col sm:flex-row gap-3 text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
          <span>
            <span style={{ color: 'rgba(255,255,255,0.3)' }}>Next New Moon: </span>
            <span
              style={{ fontFamily: 'var(--font-geist-mono, monospace)', color: 'rgba(255,255,255,0.65)' }}
            >
              {formatDate(nextNew)}
            </span>
          </span>
          <span className="hidden sm:inline" style={{ color: 'rgba(255,255,255,0.2)' }}>·</span>
          <span>
            <span style={{ color: 'rgba(255,255,255,0.3)' }}>Next Full Moon: </span>
            <span
              style={{ fontFamily: 'var(--font-geist-mono, monospace)', color: '#F0D080' }}
            >
              {formatDate(nextFull)}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Calendar grid
// ---------------------------------------------------------------------------

interface CalendarGridProps {
  year: number;
  month: number; // 1-indexed
  days: DayData[];
  today: { year: number; month: number; day: number };
}

function CalendarGrid({ year, month, days, today }: CalendarGridProps) {
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
            <div
              key={cell.day}
              role="gridcell"
              aria-label={`${MONTH_NAMES[month - 1]} ${cell.day}: ${cell.phaseName}, ${Math.round(cell.illumination)}% illuminated`}
              className="flex flex-col items-center justify-center rounded-xl py-2 px-1 transition-colors duration-200 hover:bg-white/5"
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

              {/* Moon emoji */}
              <span
                className="text-xl leading-none select-none"
                aria-hidden="true"
              >
                {cell.emoji}
              </span>

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
            </div>
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

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function MoonCalendar() {
  const today = new Date();
  const todayRef = {
    year: today.getFullYear(),
    month: today.getMonth() + 1,
    day: today.getDate(),
  };

  const [viewYear, setViewYear] = useState(todayRef.year);
  const [viewMonth, setViewMonth] = useState(todayRef.month);
  const [currentPhase, setCurrentPhase] = useState<MoonPhaseResponse | null>(null);
  const [referenceAngle, setReferenceAngle] = useState<number | null>(null);
  // Day offset between the API reference date (today) and the 1st of the viewed month
  const [referenceOffset, setReferenceOffset] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Fetch today's moon phase once
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);

    fetch('/api/v1/moon/current')
      .then((res) => {
        if (!res.ok) throw new Error('fetch failed');
        return res.json() as Promise<ApiResponse<MoonPhaseResponse>>;
      })
      .then((json) => {
        if (cancelled) return;
        if (json.success && json.data) {
          setCurrentPhase(json.data);
          setReferenceAngle(json.data.angle);
        } else {
          setError(true);
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Recompute day offset whenever viewed month changes
  useEffect(() => {
    if (referenceAngle === null) return;
    // Days from today to the 1st of the viewed month
    const todayMs = Date.UTC(todayRef.year, todayRef.month - 1, todayRef.day);
    const firstOfViewedMs = Date.UTC(viewYear, viewMonth - 1, 1);
    const offsetDays = (firstOfViewedMs - todayMs) / (1000 * 60 * 60 * 24);
    setReferenceOffset(offsetDays);
  }, [viewYear, viewMonth, referenceAngle, todayRef.year, todayRef.month, todayRef.day]);

  const goToPrevMonth = useCallback(() => {
    setViewMonth((m) => {
      if (m === 1) {
        setViewYear((y) => y - 1);
        return 12;
      }
      return m - 1;
    });
  }, []);

  const goToNextMonth = useCallback(() => {
    setViewMonth((m) => {
      if (m === 12) {
        setViewYear((y) => y + 1);
        return 1;
      }
      return m + 1;
    });
  }, []);

  const goToToday = useCallback(() => {
    setViewYear(todayRef.year);
    setViewMonth(todayRef.month);
  }, [todayRef.year, todayRef.month]);

  // Build day data for the viewed month
  const days: DayData[] = [];
  if (referenceAngle !== null) {
    const count = daysInMonth(viewYear, viewMonth);
    for (let d = 1; d <= count; d++) {
      // Offset from today to this calendar day
      const dayOffset = referenceOffset + (d - 1);
      const angle = approximateAngle(referenceAngle, dayOffset);
      days.push({
        day: d,
        angle,
        illumination: illuminationFromAngle(angle),
        emoji: emojiFromAngle(angle),
        phaseName: phaseNameFromAngle(angle),
      });
    }
  }

  const isCurrentMonth =
    viewYear === todayRef.year && viewMonth === todayRef.month;

  return (
    <section aria-label="Moon Calendar" className="w-full max-w-2xl mx-auto">
      {/* Current phase card — only shown when viewing current month */}
      {currentPhase && isCurrentMonth && (
        <CurrentPhaseCard data={currentPhase} />
      )}

      {/* Month navigation */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={goToPrevMonth}
          className="flex items-center justify-center w-9 h-9 rounded-lg transition-colors hover:bg-white/8 active:bg-white/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
          style={{ color: 'rgba(255,255,255,0.5)' }}
          aria-label="Previous month"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <div className="flex items-center gap-3">
          <h2
            className="text-lg font-medium"
            style={{ fontFamily: 'var(--font-crimson-pro, serif)', color: '#E8E0D0' }}
          >
            {MONTH_NAMES[viewMonth - 1]} {viewYear}
          </h2>
          {!isCurrentMonth && (
            <button
              onClick={goToToday}
              className="text-xs px-2.5 py-1 rounded-md transition-colors hover:bg-white/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
              style={{
                fontFamily: 'var(--font-geist-sans, sans-serif)',
                color: 'rgba(255,255,255,0.35)',
                border: '1px solid rgba(255,255,255,0.12)',
              }}
            >
              Today
            </button>
          )}
        </div>

        <button
          onClick={goToNextMonth}
          className="flex items-center justify-center w-9 h-9 rounded-lg transition-colors hover:bg-white/8 active:bg-white/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
          style={{ color: 'rgba(255,255,255,0.5)' }}
          aria-label="Next month"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* Calendar body */}
      {loading && (
        <div className="flex items-center justify-center py-16" aria-busy="true" aria-label="Loading moon phases">
          <span
            className="inline-block w-5 h-5 rounded-full border border-white/20 border-t-white/60 animate-spin"
            aria-hidden="true"
          />
        </div>
      )}

      {error && !loading && (
        <div
          className="text-center py-12 text-sm"
          role="alert"
          style={{ color: 'rgba(255,255,255,0.35)' }}
        >
          Could not load moon data. Please try again later.
        </div>
      )}

      {!loading && !error && referenceAngle !== null && (
        <CalendarGrid
          year={viewYear}
          month={viewMonth}
          days={days}
          today={todayRef}
        />
      )}

      {/* Phase legend */}
      {!loading && !error && (
        <div
          className="mt-6 flex flex-wrap gap-x-4 gap-y-2 justify-center text-xs"
          style={{ color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-geist-sans, sans-serif)' }}
          aria-label="Moon phase legend"
        >
          {[
            { emoji: '🌑', label: 'New' },
            { emoji: '🌓', label: 'First Quarter' },
            { emoji: '🌕', label: 'Full' },
            { emoji: '🌗', label: 'Last Quarter' },
          ].map(({ emoji, label }) => (
            <span key={label} className="flex items-center gap-1">
              <span aria-hidden="true">{emoji}</span>
              <span>{label}</span>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
