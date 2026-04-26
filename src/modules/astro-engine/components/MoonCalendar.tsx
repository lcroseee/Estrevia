'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import type { MoonPhaseResponse, ApiResponse, MoonCalendarDay, MoonCalendarResponse } from '@/shared/types';
import { CurrentPhaseCard } from './CurrentPhaseCard';
import { MoonCalendarGrid } from './MoonCalendarGrid';
import { DayDetailPanel } from './DayDetailPanel';
import { MoonPhaseSVG } from './MoonPhaseSVG';
import { useSubscription } from '@/shared/hooks/useSubscription';
import { daysInMonth, type DayData } from './moon-types';

// ---------------------------------------------------------------------------
// Client-side approximation (fallback while per-day calendar fetch is pending)
// ---------------------------------------------------------------------------
// Moon moves ~12.19°/day relative to the Sun. Given a known angle on one date
// we extrapolate ±15 days with ~1° error. Agent 5 replaces this with a fetch
// to /api/v1/moon/calendar/:year/:month.

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
// Orchestrator
// ---------------------------------------------------------------------------

export function MoonCalendar() {
  const t = useTranslations('moonPage');
  const today = new Date();
  const todayRef = {
    year: today.getFullYear(),
    month: today.getMonth() + 1,
    day: today.getDate(),
  };

  const { isPro, isLoading: subLoading } = useSubscription();

  const [viewYear, setViewYear] = useState(todayRef.year);
  const [viewMonth, setViewMonth] = useState(todayRef.month);
  const [currentPhase, setCurrentPhase] = useState<MoonPhaseResponse | null>(null);
  const [referenceAngle, setReferenceAngle] = useState<number | null>(null);
  const [selectedDay, setSelectedDay] = useState<DayData | null>(null);
  const [referenceOffset, setReferenceOffset] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------
  // - /api/v1/moon/current   → hero card phase (live for user's moment)
  // - /api/v1/moon/calendar  → per-day data for the grid (authoritative, cached 24h)
  // Free-tier users can only fetch the current month; we fall back to client
  // approximation when the calendar endpoint refuses (HTTP 403).

  const [calendarDays, setCalendarDays] = useState<MoonCalendarDay[] | null>(null);

  // Hero card — live for current moment
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);

    const clientT = encodeURIComponent(new Date().toISOString());
    fetch(`/api/v1/moon/current?t=${clientT}`)
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

    return () => { cancelled = true; };
  }, []);

  // Calendar grid — per-day server data for the viewed month
  useEffect(() => {
    let cancelled = false;
    setCalendarDays(null);

    fetch(`/api/v1/moon/calendar/${viewYear}/${viewMonth}`)
      .then(async (res) => {
        if (res.status === 403) {
          // Paywalled future/past month — keep client approximation
          return null;
        }
        if (!res.ok) return null;
        const json = (await res.json()) as ApiResponse<MoonCalendarResponse>;
        return json.success && json.data ? json.data.days : null;
      })
      .then((days) => {
        if (!cancelled) setCalendarDays(days);
      })
      .catch(() => {
        if (!cancelled) setCalendarDays(null);
      });

    return () => { cancelled = true; };
  }, [viewYear, viewMonth]);

  // Recompute day offset whenever viewed month changes (used by the fallback approximation)
  useEffect(() => {
    if (referenceAngle === null) return;
    const todayMs = Date.UTC(todayRef.year, todayRef.month - 1, todayRef.day);
    const firstOfViewedMs = Date.UTC(viewYear, viewMonth - 1, 1);
    const offsetDays = (firstOfViewedMs - todayMs) / (1000 * 60 * 60 * 24);
    setReferenceOffset(offsetDays);
  }, [viewYear, viewMonth, referenceAngle, todayRef.year, todayRef.month, todayRef.day]);

  const goToPrevMonth = useCallback(() => {
    if (!isPro && !subLoading) return;
    setViewMonth((m) => {
      if (m === 1) {
        setViewYear((y) => y - 1);
        return 12;
      }
      return m - 1;
    });
  }, [isPro, subLoading]);

  const goToNextMonth = useCallback(() => {
    if (!isPro && !subLoading) return;
    setViewMonth((m) => {
      if (m === 12) {
        setViewYear((y) => y + 1);
        return 1;
      }
      return m + 1;
    });
  }, [isPro, subLoading]);

  const goToToday = useCallback(() => {
    setViewYear(todayRef.year);
    setViewMonth(todayRef.month);
  }, [todayRef.year, todayRef.month]);

  // Build day data for the viewed month.
  // Prefer server calendar data (authoritative, includes moonSign). Fall back
  // to client linear approximation when the endpoint is paywalled.
  const days: DayData[] = [];
  if (calendarDays && calendarDays.length > 0) {
    for (const d of calendarDays) {
      const dayNum = parseInt(d.date.slice(-2), 10);
      // Recover the Sun-Moon angle from illumination for the SVG:
      // illum = (1-cos θ)/2 → θ = acos(1 - 2·illum)
      // That gives the magnitude [0°,180°]. We can't recover the 0-360 hemisphere
      // from illumination alone, so the approximation's sign info gives us the
      // waxing/waning direction when possible; otherwise we default to waxing.
      const illum01 = Math.max(0, Math.min(1, d.illumination / 100));
      const mag = (Math.acos(1 - 2 * illum01) * 180) / Math.PI;
      const waningByName = /Waning|Last Quarter/.test(d.phase);
      const angle = waningByName ? 360 - mag : mag;
      days.push({
        day: dayNum,
        angle,
        illumination: d.illumination,
        emoji: d.emoji,
        phaseName: d.phase,
        moonSign: d.moonSign,
        moonDegree: d.moonDegree,
        isVoidOfCourse: d.isVoidOfCourse,
      });
    }
  } else if (referenceAngle !== null) {
    const count = daysInMonth(viewYear, viewMonth);
    for (let d = 1; d <= count; d++) {
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
    <section aria-label={t('calendar.ariaLabel')} className="w-full max-w-2xl mx-auto">
      {/* Current phase card — only shown when viewing current month */}
      {currentPhase && isCurrentMonth && (
        <CurrentPhaseCard data={currentPhase} />
      )}

      {/* Month navigation */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={goToPrevMonth}
          disabled={!isPro && !subLoading}
          className="flex items-center justify-center w-9 h-9 rounded-lg transition-colors hover:bg-white/8 active:bg-white/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 disabled:opacity-30 disabled:cursor-not-allowed"
          style={{ color: 'rgba(255,255,255,0.5)' }}
          aria-label={!isPro && !subLoading ? t('calendar.prevMonthPro') : t('calendar.prevMonth')}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <div className="flex items-center gap-3">
          <h2
            className="text-lg font-medium first-letter:capitalize"
            style={{ fontFamily: 'var(--font-crimson-pro, serif)', color: '#E8E0D0' }}
          >
            {t('calendar.monthHeader', { month: t(`months.long.${viewMonth}`), year: viewYear })}
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
              {t('calendar.today')}
            </button>
          )}
        </div>

        <button
          onClick={goToNextMonth}
          disabled={!isPro && !subLoading}
          className="flex items-center justify-center w-9 h-9 rounded-lg transition-colors hover:bg-white/8 active:bg-white/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 disabled:opacity-30 disabled:cursor-not-allowed"
          style={{ color: 'rgba(255,255,255,0.5)' }}
          aria-label={!isPro && !subLoading ? t('calendar.nextMonthPro') : t('calendar.nextMonth')}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* Paywall hint for free users */}
      {!isPro && !subLoading && (
        <p className="text-[10px] text-center text-white/60 mb-4 -mt-2">
          {t('freeMonthOnly')}{' '}
          <a href="/pricing" className="text-[#FFD700]/60 hover:text-[#FFD700]/80 underline">
            {t('unlockFullCalendar')}
          </a>
        </p>
      )}

      {/* Calendar body */}
      {loading && (
        <div className="flex items-center justify-center py-16" aria-busy="true" aria-label={t('calendar.loadingAria')}>
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
          {t('calendar.loadError')}
        </div>
      )}

      {!loading && !error && (calendarDays !== null || referenceAngle !== null) && (
        <MoonCalendarGrid
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
          aria-label={t('calendar.legendAria')}
        >
          {[
            { angle: 0, illum: 0, key: 'legendNew' },
            { angle: 90, illum: 0.5, key: 'legendFirstQuarter' },
            { angle: 180, illum: 1, key: 'legendFull' },
            { angle: 270, illum: 0.5, key: 'legendLastQuarter' },
          ].map(({ angle, illum, key }) => (
            <span key={key} className="flex items-center gap-1.5">
              <MoonPhaseSVG illumination={illum} phaseAngle={angle} size={16} />
              <span>{t(`calendar.${key}`)}</span>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
