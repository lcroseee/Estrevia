'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLocale } from 'next-intl';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

type Segment = 'day' | 'month' | 'year';

const US_ORDER: readonly Segment[] = ['month', 'day', 'year'];
const INTL_ORDER: readonly Segment[] = ['day', 'month', 'year'];

function orderForLocale(locale: string): readonly Segment[] {
  return locale.startsWith('en') ? US_ORDER : INTL_ORDER;
}

// ── Types ────────────────────────────────────────────────────────────────────

interface DateInputProps {
  /** YYYY-MM-DD string */
  value: string;
  onChange: (value: string) => void;
  /** YYYY-MM-DD max date */
  max?: string;
  disabled?: boolean;
  id?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
  'aria-required'?: boolean;
  className?: string;
  /** Error styling */
  hasError?: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function parseDate(value: string): { month: string; day: string; year: string } {
  if (!value) return { month: '', day: '', year: '' };
  const [y, m, d] = value.split('-');
  return {
    month: m ?? '',
    day: d ?? '',
    year: y ?? '',
  };
}

function toDateString(month: string, day: string, year: string): string {
  if (!month || !day || !year || year.length < 4) return '';
  const m = month.padStart(2, '0');
  const d = day.padStart(2, '0');
  return `${year}-${m}-${d}`;
}

function clampDay(day: string, month: string, year: string): string {
  if (!day || !month) return day;
  const m = parseInt(month, 10);
  const y = year.length === 4 ? parseInt(year, 10) : 2000;
  const max = daysInMonth(y, m);
  const d = parseInt(day, 10);
  if (d > max) return String(max);
  return day;
}

// ── Component ────────────────────────────────────────────────────────────────

export function DateInput({
  value,
  onChange,
  max,
  disabled = false,
  id,
  className,
  hasError = false,
  ...ariaProps
}: DateInputProps) {
  const locale = useLocale();
  const order = orderForLocale(locale);
  const parsed = parseDate(value);
  const [month, setMonth] = useState(parsed.month);
  const [day, setDay] = useState(parsed.day);
  const [year, setYear] = useState(parsed.year);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const monthRef = useRef<HTMLInputElement>(null);
  const dayRef = useRef<HTMLInputElement>(null);
  const yearRef = useRef<HTMLInputElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);

  // Sync from external value changes
  useEffect(() => {
    const p = parseDate(value);
    setMonth(p.month);
    setDay(p.day);
    setYear(p.year);
  }, [value]);

  const emitChange = useCallback(
    (m: string, d: string, y: string) => {
      const adjusted = clampDay(d, m, y);
      const str = toDateString(m, adjusted, y);
      if (!str) return;
      if (max && str > max) return;
      onChange(str);
    },
    [onChange, max],
  );

  // ── Segment handlers ───────────────────────────────────────────────────

  const refFor = useCallback((seg: Segment): React.RefObject<HTMLInputElement | null> => {
    if (seg === 'month') return monthRef;
    if (seg === 'day') return dayRef;
    return yearRef;
  }, []);

  const focusNext = useCallback(
    (seg: Segment) => {
      const i = order.indexOf(seg);
      if (i === order.length - 1) return;
      const next = refFor(order[i + 1]);
      next.current?.focus();
      next.current?.select();
    },
    [order, refFor],
  );

  const focusPrev = useCallback(
    (seg: Segment) => {
      const i = order.indexOf(seg);
      if (i === 0) return;
      refFor(order[i - 1]).current?.focus();
    },
    [order, refFor],
  );

  const handleMonthChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value.replace(/\D/g, '').slice(0, 2);
      const num = parseInt(raw, 10);
      if (raw.length === 2 && (num < 1 || num > 12)) return;
      setMonth(raw);
      if (raw.length === 2 && num >= 1 && num <= 12) {
        focusNext('month');
      }
      if (raw.length === 2) emitChange(raw, day, year);
    },
    [day, year, emitChange, focusNext],
  );

  const handleDayChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value.replace(/\D/g, '').slice(0, 2);
      const num = parseInt(raw, 10);
      const maxDay = month ? daysInMonth(year.length === 4 ? parseInt(year, 10) : 2000, parseInt(month, 10)) : 31;
      if (raw.length === 2 && (num < 1 || num > maxDay)) return;
      setDay(raw);
      if (raw.length === 2 && num >= 1 && num <= maxDay) {
        focusNext('day');
      }
      if (raw.length === 2) emitChange(month, raw, year);
    },
    [month, year, emitChange, focusNext],
  );

  const handleYearChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value.replace(/\D/g, '').slice(0, 4);
      setYear(raw);
      if (raw.length === 4) emitChange(month, day, raw);
    },
    [month, day, emitChange],
  );

  // Backspace on empty field → go back
  const handleKeyDown = useCallback(
    (field: Segment) => (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Backspace' && e.currentTarget.value === '') {
        focusPrev(field);
      }
    },
    [focusPrev],
  );

  // ── Calendar popover ───────────────────────────────────────────────────

  // Close calendar on outside click
  useEffect(() => {
    if (!calendarOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        calendarRef.current &&
        !calendarRef.current.contains(e.target as Node) &&
        !toggleRef.current?.contains(e.target as Node)
      ) {
        setCalendarOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [calendarOpen]);

  const handleCalendarSelect = useCallback(
    (y: number, m: number, d: number) => {
      const ms = String(m).padStart(2, '0');
      const ds = String(d).padStart(2, '0');
      const ys = String(y);
      setMonth(ms);
      setDay(ds);
      setYear(ys);
      onChange(`${ys}-${ms}-${ds}`);
      setCalendarOpen(false);
    },
    [onChange],
  );

  // ── Shared input classes ───────────────────────────────────────────────

  const segmentClass = [
    'bg-transparent text-center text-sm text-white outline-none',
    'placeholder:text-white/50',
    disabled ? 'cursor-not-allowed opacity-50' : '',
  ].join(' ');

  const borderClass = hasError
    ? 'border-red-500/60 focus-within:border-red-400 focus-within:ring-red-400/30'
    : 'border-white/12 focus-within:border-white/30 focus-within:ring-white/10';

  return (
    <div ref={wrapperRef} className={`relative ${className ?? ''}`}>
      {/* Segmented input */}
      <div
        className={[
          'flex items-center gap-0 rounded-lg border bg-white/5 px-3 py-2.5',
          'focus-within:outline-none focus-within:ring-1 transition-colors',
          '[color-scheme:dark]',
          borderClass,
        ].join(' ')}
      >
        {order.map((seg, idx) => {
          const isFirst = idx === 0;
          const node =
            seg === 'month' ? (
              <input
                key="month"
                ref={monthRef}
                {...(isFirst ? { id, ...ariaProps } : {})}
                type="text"
                inputMode="numeric"
                placeholder="MM"
                value={month}
                onChange={handleMonthChange}
                onKeyDown={handleKeyDown('month')}
                onFocus={(e) => e.target.select()}
                disabled={disabled}
                className={`${segmentClass} w-7`}
                maxLength={2}
                aria-label="Month"
              />
            ) : seg === 'day' ? (
              <input
                key="day"
                ref={dayRef}
                {...(isFirst ? { id, ...ariaProps } : {})}
                type="text"
                inputMode="numeric"
                placeholder="DD"
                value={day}
                onChange={handleDayChange}
                onKeyDown={handleKeyDown('day')}
                onFocus={(e) => e.target.select()}
                disabled={disabled}
                className={`${segmentClass} w-7`}
                maxLength={2}
                aria-label="Day"
              />
            ) : (
              <input
                key="year"
                ref={yearRef}
                {...(isFirst ? { id, ...ariaProps } : {})}
                type="text"
                inputMode="numeric"
                placeholder="YYYY"
                value={year}
                onChange={handleYearChange}
                onKeyDown={handleKeyDown('year')}
                onFocus={(e) => e.target.select()}
                disabled={disabled}
                className={`${segmentClass} w-11 !text-left`}
                maxLength={4}
                aria-label="Year"
              />
            );
          return (
            <span key={seg} className="contents">
              {node}
              {idx < order.length - 1 && (
                <span className="text-white/40 text-sm select-none" aria-hidden="true">
                  /
                </span>
              )}
            </span>
          );
        })}

        <div className="flex-1" />

        {/* Calendar toggle */}
        <button
          ref={toggleRef}
          type="button"
          onClick={() => {
            if (!calendarOpen && wrapperRef.current) {
              const rect = wrapperRef.current.getBoundingClientRect();
              setPopoverPos({
                top: rect.bottom + window.scrollY + 8,
                left: rect.left + window.scrollX,
              });
            }
            setCalendarOpen((o) => !o);
          }}
          disabled={disabled}
          className="ml-1 p-1 rounded text-white/40 hover:text-white/70 transition-colors focus:outline-none focus:ring-1 focus:ring-white/20"
          aria-label="Open calendar"
          aria-expanded={calendarOpen}
        >
          <CalendarDays className="size-4" />
        </button>
      </div>

      {/* Calendar popover — rendered via portal to escape stacking context */}
      {calendarOpen && popoverPos && createPortal(
        <CalendarPopover
          ref={calendarRef}
          selectedYear={year.length === 4 ? parseInt(year, 10) : undefined}
          selectedMonth={month ? parseInt(month, 10) : undefined}
          selectedDay={day ? parseInt(day, 10) : undefined}
          max={max}
          onSelect={handleCalendarSelect}
          style={{ position: 'absolute', top: popoverPos.top, left: popoverPos.left }}
        />,
        document.body,
      )}
    </div>
  );
}

// ── Calendar Popover ─────────────────────────────────────────────────────────

import { forwardRef } from 'react';

interface CalendarPopoverProps {
  selectedYear?: number;
  selectedMonth?: number;
  selectedDay?: number;
  max?: string;
  onSelect: (year: number, month: number, day: number) => void;
  style?: React.CSSProperties;
}

const CalendarPopover = forwardRef<HTMLDivElement, CalendarPopoverProps>(
  function CalendarPopover({ selectedYear, selectedMonth, selectedDay, max, onSelect, style }, ref) {
    const today = new Date();
    const [viewYear, setViewYear] = useState(selectedYear ?? today.getFullYear());
    const [viewMonth, setViewMonth] = useState(selectedMonth ?? today.getMonth() + 1);

    const maxDate = max ? new Date(max + 'T23:59:59') : new Date();

    const handlePrev = () => {
      if (viewMonth === 1) {
        setViewMonth(12);
        setViewYear(viewYear - 1);
      } else {
        setViewMonth(viewMonth - 1);
      }
    };

    const handleNext = () => {
      const nextMonth = viewMonth === 12 ? 1 : viewMonth + 1;
      const nextYear = viewMonth === 12 ? viewYear + 1 : viewYear;
      // Don't go past max date's month
      if (new Date(nextYear, nextMonth - 1, 1) > maxDate) return;
      setViewMonth(nextMonth);
      setViewYear(nextYear);
    };

    // Build grid
    const totalDays = daysInMonth(viewYear, viewMonth);
    // Day of week for 1st of month (0=Sun)
    const firstDow = new Date(viewYear, viewMonth - 1, 1).getDay();

    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDow; i++) cells.push(null);
    for (let d = 1; d <= totalDays; d++) cells.push(d);

    const isSelected = (d: number) =>
      d === selectedDay && viewMonth === selectedMonth && viewYear === selectedYear;

    const isToday = (d: number) =>
      d === today.getDate() && viewMonth === today.getMonth() + 1 && viewYear === today.getFullYear();

    const isDisabled = (d: number) => {
      const date = new Date(viewYear, viewMonth - 1, d);
      return date > maxDate;
    };

    // Can go forward?
    const canGoNext = (() => {
      const nextMonth = viewMonth === 12 ? 1 : viewMonth + 1;
      const nextYear = viewMonth === 12 ? viewYear + 1 : viewYear;
      return new Date(nextYear, nextMonth - 1, 1) <= maxDate;
    })();

    return (
      <div
        ref={ref}
        style={{
          ...style,
          zIndex: 99999,
          backgroundColor: '#14141A',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.9)',
          isolation: 'isolate',
        }}
        className="w-[320px] rounded-xl border border-white/10 p-4"
        role="dialog"
        aria-label="Date picker calendar"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <button
            type="button"
            onClick={handlePrev}
            className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/8 transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft className="size-5" />
          </button>
          <span className="text-sm font-medium text-white">
            {MONTH_NAMES[viewMonth - 1]} {viewYear}
          </span>
          <button
            type="button"
            onClick={handleNext}
            disabled={!canGoNext}
            className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/8 transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
            aria-label="Next month"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 gap-0 mb-1">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
            <div key={d} className="text-center text-xs text-white/30 py-1 font-medium">
              {d}
            </div>
          ))}
        </div>

        {/* Day grid */}
        <div className="grid grid-cols-7 gap-0">
          {cells.map((d, i) => (
            <div key={i} className="flex items-center justify-center">
              {d === null ? (
                <div className="w-10 h-10" />
              ) : (
                <button
                  type="button"
                  onClick={() => !isDisabled(d) && onSelect(viewYear, viewMonth, d)}
                  disabled={isDisabled(d)}
                  className={[
                    'w-10 h-10 rounded-lg text-sm font-medium transition-colors',
                    'focus:outline-none focus:ring-1 focus:ring-[#FFD700]/40',
                    isSelected(d)
                      ? 'bg-[#FFD700] text-[#0A0A0F] font-semibold'
                      : isToday(d)
                        ? 'bg-white/8 text-white'
                        : 'text-white/70 hover:bg-white/8 hover:text-white',
                    isDisabled(d) ? 'opacity-25 cursor-not-allowed' : '',
                  ].join(' ')}
                  aria-label={`${MONTH_ABBR[viewMonth - 1]} ${d}, ${viewYear}`}
                  aria-pressed={isSelected(d)}
                >
                  {d}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  },
);
