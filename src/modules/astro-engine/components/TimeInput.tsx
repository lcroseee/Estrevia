'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

interface TimeInputProps {
  /** HH:MM string */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
  'aria-required'?: boolean;
  className?: string;
  hasError?: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseTime(value: string): { hour: string; minute: string } {
  if (!value) return { hour: '', minute: '' };
  const [h, m] = value.split(':');
  return { hour: h ?? '', minute: m ?? '' };
}

function toTimeString(hour: string, minute: string): string {
  if (!hour || !minute) return '';
  const h = hour.padStart(2, '0');
  const m = minute.padStart(2, '0');
  return `${h}:${m}`;
}

// ── Component ────────────────────────────────────────────────────────────────

export function TimeInput({
  value,
  onChange,
  disabled = false,
  id,
  className,
  hasError = false,
  ...ariaProps
}: TimeInputProps) {
  const parsed = parseTime(value);
  const [hour, setHour] = useState(parsed.hour);
  const [minute, setMinute] = useState(parsed.minute);

  const hourRef = useRef<HTMLInputElement>(null);
  const minuteRef = useRef<HTMLInputElement>(null);

  // Sync from external value changes
  useEffect(() => {
    const p = parseTime(value);
    setHour(p.hour);
    setMinute(p.minute);
  }, [value]);

  const emitChange = useCallback(
    (h: string, m: string) => {
      const str = toTimeString(h, m);
      if (!str) return;
      onChange(str);
    },
    [onChange],
  );

  // ── Segment handlers ───────────────────────────────────────────────────

  const handleHourChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value.replace(/\D/g, '').slice(0, 2);
      const num = parseInt(raw, 10);

      // Reject invalid hour mid-entry only when 2 digits typed
      if (raw.length === 2 && num > 23) return;

      setHour(raw);

      if (raw.length === 2) {
        // Valid 2-digit hour — advance to minute
        minuteRef.current?.focus();
        minuteRef.current?.select();
        emitChange(raw, minute);
      } else if (raw.length === 1 && num > 2) {
        // Single digit > 2 can never be a valid first digit for 24h time,
        // so auto-advance immediately (e.g. "9" → "09", jump to minute)
        minuteRef.current?.focus();
        minuteRef.current?.select();
        emitChange(raw.padStart(2, '0'), minute);
        setHour(raw.padStart(2, '0'));
      }
    },
    [minute, emitChange],
  );

  const handleMinuteChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value.replace(/\D/g, '').slice(0, 2);
      const num = parseInt(raw, 10);

      // Reject values above 59 when 2 digits typed
      if (raw.length === 2 && num > 59) return;

      setMinute(raw);

      if (raw.length === 2) {
        emitChange(hour, raw);
      } else if (raw.length === 1 && num > 5) {
        // Digit > 5 can't be a valid tens digit for minutes (0-59)
        emitChange(hour, raw.padStart(2, '0'));
        setMinute(raw.padStart(2, '0'));
      }
    },
    [hour, emitChange],
  );

  // Backspace on empty MM → focus HH
  const handleMinuteKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Backspace' && e.currentTarget.value === '') {
        hourRef.current?.focus();
        hourRef.current?.select();
      }
    },
    [],
  );

  // ── Shared input classes (mirrors DateInput exactly) ──────────────────

  const segmentClass = [
    'bg-transparent text-center text-sm text-white outline-none',
    'placeholder:text-white/25',
    disabled ? 'cursor-not-allowed opacity-50' : '',
  ].join(' ');

  const borderClass = hasError
    ? 'border-red-500/60 focus-within:border-red-400 focus-within:ring-red-400/30'
    : 'border-white/12 focus-within:border-white/30 focus-within:ring-white/10';

  return (
    <div className={`relative ${className ?? ''}`}>
      <div
        className={[
          'flex items-center gap-0 rounded-lg border bg-white/5 px-3 py-2.5',
          'focus-within:outline-none focus-within:ring-1 transition-colors',
          '[color-scheme:dark]',
          borderClass,
        ].join(' ')}
        role="group"
        aria-label="Time"
      >
        {/* Hour */}
        <input
          ref={hourRef}
          id={id}
          type="text"
          inputMode="numeric"
          placeholder="HH"
          value={hour}
          onChange={handleHourChange}
          onFocus={(e) => e.target.select()}
          disabled={disabled}
          className={`${segmentClass} w-8`}
          maxLength={2}
          aria-label="Hour"
          {...ariaProps}
        />
        <span className="text-white/25 text-sm select-none">:</span>
        {/* Minute */}
        <input
          ref={minuteRef}
          type="text"
          inputMode="numeric"
          placeholder="MM"
          value={minute}
          onChange={handleMinuteChange}
          onKeyDown={handleMinuteKeyDown}
          onFocus={(e) => e.target.select()}
          disabled={disabled}
          className={`${segmentClass} w-8`}
          maxLength={2}
          aria-label="Minute"
        />
      </div>
    </div>
  );
}
