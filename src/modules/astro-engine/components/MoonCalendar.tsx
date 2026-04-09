'use client';

import { useState, useEffect, useCallback } from 'react';
import type { MoonPhaseResponse, ApiResponse } from '@/shared/types';
import { MoonPhaseSVG } from './MoonPhaseSVG';

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
      {/* Large SVG moon visualization */}
      <div className="flex-shrink-0">
        <MoonPhaseSVG
          illumination={data.illumination / 100}
          phaseAngle={data.angle}
          size={72}
        />
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
  onDaySelect: (day: DayData) => void;
}

function CalendarGrid({ year, month, days, today, onDaySelect }: CalendarGridProps) {
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
              aria-label={`${MONTH_NAMES[month - 1]} ${cell.day}: ${cell.phaseName}, ${Math.round(cell.illumination)}% illuminated`}
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

// ---------------------------------------------------------------------------
// Day detail panel (slide-up sheet)
// ---------------------------------------------------------------------------

interface DayDetailPanelProps {
  day: DayData | null;
  year: number;
  month: number;
  onClose: () => void;
}

function DayDetailPanel({ day, year, month, onClose }: DayDetailPanelProps) {
  if (!day) return null;

  const dateStr = new Date(year, month - 1, day.day).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-up panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Moon details for ${dateStr}`}
        className="fixed bottom-0 inset-x-0 z-50 bg-[#0F0F17] border-t border-white/8 rounded-t-2xl shadow-2xl shadow-black/60 max-h-[60vh] overflow-y-auto"
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-white/15" aria-hidden="true" />
        </div>

        <div className="px-6 pt-2 pb-8">
          {/* Close button */}
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3
                className="text-lg font-medium text-white/90"
                style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)' }}
              >
                {day.phaseName}
              </h3>
              <p
                className="text-xs text-white/40 mt-0.5"
                style={{ fontFamily: 'var(--font-geist-sans, sans-serif)' }}
              >
                {dateStr}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
              aria-label="Close"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <path d="M5 5l8 8M13 5l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* Moon visualization */}
          <div className="flex items-center gap-6 mb-6">
            <MoonPhaseSVG
              illumination={day.illumination / 100}
              phaseAngle={day.angle}
              size={80}
            />
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="flex-1 h-1.5 rounded-full overflow-hidden"
                  style={{ background: 'rgba(255,255,255,0.1)' }}
                  role="progressbar"
                  aria-valuenow={Math.round(day.illumination)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Illumination ${Math.round(day.illumination)}%`}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${day.illumination}%`,
                      background: 'linear-gradient(90deg, #C0A060, #F0D080)',
                    }}
                  />
                </div>
                <span
                  className="text-sm tabular-nums flex-shrink-0"
                  style={{ fontFamily: 'var(--font-geist-mono, monospace)', color: '#F0D080' }}
                >
                  {Math.round(day.illumination)}%
                </span>
              </div>
              <p className="text-xs text-white/35" style={{ fontFamily: 'var(--font-geist-sans, sans-serif)' }}>
                Illumination
              </p>
            </div>
          </div>

          {/* Details grid */}
          <div
            className="grid grid-cols-2 gap-3"
          >
            <DetailItem label="Phase" value={day.phaseName} />
            <DetailItem
              label="Phase angle"
              value={`${Math.round(day.angle)}\u00B0`}
              mono
            />
            <DetailItem
              label="Illumination"
              value={`${Math.round(day.illumination)}%`}
              mono
            />
            <DetailItem
              label="Moon sign"
              value="Available soon"
              muted
            />
          </div>

          {/* VOC placeholder */}
          <div
            className="mt-4 px-4 py-3 rounded-xl border border-white/6 text-xs text-white/25"
            style={{
              background: 'rgba(255,255,255,0.02)',
              fontFamily: 'var(--font-geist-sans, sans-serif)',
            }}
          >
            Void of Course data will be available when the API is ready.
          </div>
        </div>
      </div>
    </>
  );
}

function DetailItem({
  label,
  value,
  mono = false,
  muted = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className="px-3 py-2.5 rounded-lg"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
    >
      <p
        className="text-[10px] uppercase tracking-widest mb-1"
        style={{ color: 'rgba(255,255,255,0.25)', fontFamily: 'var(--font-geist-sans, sans-serif)' }}
      >
        {label}
      </p>
      <p
        className="text-sm"
        style={{
          fontFamily: mono ? 'var(--font-geist-mono, monospace)' : 'var(--font-geist-sans, sans-serif)',
          color: muted ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.7)',
        }}
      >
        {value}
      </p>
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
  const [selectedDay, setSelectedDay] = useState<DayData | null>(null);
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
          onDaySelect={setSelectedDay}
        />
      )}

      {/* Day detail panel */}
      <DayDetailPanel
        day={selectedDay}
        year={viewYear}
        month={viewMonth}
        onClose={() => setSelectedDay(null)}
      />

      {/* Phase legend */}
      {!loading && !error && (
        <div
          className="mt-6 flex flex-wrap gap-x-5 gap-y-2 justify-center text-xs"
          style={{ color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-geist-sans, sans-serif)' }}
          aria-label="Moon phase legend"
        >
          {[
            { angle: 0, illum: 0, label: 'New' },
            { angle: 90, illum: 0.5, label: 'First Quarter' },
            { angle: 180, illum: 1, label: 'Full' },
            { angle: 270, illum: 0.5, label: 'Last Quarter' },
          ].map(({ angle, illum, label }) => (
            <span key={label} className="flex items-center gap-1.5">
              <MoonPhaseSVG illumination={illum} phaseAngle={angle} size={16} />
              <span>{label}</span>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
