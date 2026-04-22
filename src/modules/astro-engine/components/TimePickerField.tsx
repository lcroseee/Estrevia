'use client';

/**
 * TimePickerField — locale-aware time entry.
 *
 * Wraps the segmented {@link TimeInput} primitive. Detects the user's
 * preferred clock format (12h AM/PM vs 24h) from `navigator.language`,
 * and shows a `[12h | 24h]` switch so the user can override.
 *
 * All canonical values flowing in and out are 24-hour `"HH:mm"` strings.
 * The 12/24 toggle never loses data — it's a pure display re-projection.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { TimeInput } from './TimeInput';
import {
  detectFormatFromLocale,
  parsePastedTime,
  to12h,
  to24h,
  type HourFormat,
  type Meridiem,
} from './time-format';

interface TimePickerFieldProps {
  value: string;
  onChange: (value: string) => void;
  defaultFormat?: HourFormat;
  disabled?: boolean;
  id?: string;
  hasError?: boolean;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
  'aria-required'?: boolean;
}

export function TimePickerField({
  value,
  onChange,
  defaultFormat,
  disabled = false,
  id,
  hasError = false,
  ...ariaProps
}: TimePickerFieldProps) {
  const t = useTranslations('timePicker');

  const [format, setFormat] = useState<HourFormat>(
    () => defaultFormat ?? detectFormatFromLocale(),
  );

  const [meridiem, setMeridiem] = useState<Meridiem>(() => {
    const parsed = to12h(value);
    return parsed?.meridiem ?? 'AM';
  });

  useEffect(() => {
    const parsed = to12h(value);
    if (parsed) setMeridiem(parsed.meridiem);
  }, [value]);

  const innerValue = format === '12h' && value
    ? (() => {
        const parsed = to12h(value);
        return parsed
          ? `${String(parsed.hour).padStart(2, '0')}:${String(parsed.minute).padStart(2, '0')}`
          : '';
      })()
    : value;

  const emit = useCallback(
    (next12hValue: string, mer: Meridiem) => {
      if (!next12hValue) {
        onChange('');
        return;
      }
      const [hhStr, mmStr] = next12hValue.split(':');
      const h = parseInt(hhStr, 10);
      const m = parseInt(mmStr, 10);
      if (Number.isNaN(h) || Number.isNaN(m)) return;
      onChange(to24h(h, m, mer));
    },
    [onChange],
  );

  const handleInnerChange = useCallback(
    (next: string) => {
      if (format === '12h') {
        emit(next, meridiem);
      } else {
        onChange(next);
      }
    },
    [format, meridiem, emit, onChange],
  );

  const handleMeridiemChange = useCallback(
    (next: Meridiem) => {
      setMeridiem(next);
      if (format === '12h' && innerValue) {
        emit(innerValue, next);
      }
    },
    [format, innerValue, emit],
  );

  const handleFormatChange = useCallback((next: HourFormat) => {
    setFormat(next);
  }, []);

  const containerRef = useRef<HTMLDivElement>(null);
  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      const text = e.clipboardData.getData('text');
      const parsed = parsePastedTime(text);
      if (!parsed) return;

      e.preventDefault();

      if (parsed.meridiem) {
        setFormat('12h');
        setMeridiem(parsed.meridiem);
        const h = parseInt(parsed.hh, 10);
        const m = parseInt(parsed.mm, 10);
        onChange(to24h(h, m, parsed.meridiem));
        return;
      }

      if (parsed.detectedFormat === '24h') {
        setFormat('24h');
        onChange(`${parsed.hh}:${parsed.mm}`);
        return;
      }

      if (format === '12h') {
        emit(`${parsed.hh}:${parsed.mm}`, meridiem);
      } else {
        onChange(`${parsed.hh}:${parsed.mm}`);
      }
    },
    [format, meridiem, emit, onChange],
  );

  const maxHour = format === '12h' ? 12 : 23;

  return (
    <div ref={containerRef} onPaste={handlePaste} className="space-y-1.5">
      <div className="flex items-center gap-2">
        <TimeInput
          id={id}
          value={innerValue}
          onChange={handleInnerChange}
          disabled={disabled}
          hasError={hasError}
          maxHour={maxHour}
          {...ariaProps}
        />

        {format === '12h' && (
          <div
            role="radiogroup"
            aria-label={t('meridiemLabel')}
            className="inline-flex items-center rounded-lg border border-white/12 bg-white/5 p-0.5 text-xs"
          >
            {(['AM', 'PM'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={meridiem === m}
                onClick={() => handleMeridiemChange(m)}
                disabled={disabled}
                className={[
                  'rounded-md px-2.5 py-1.5 font-medium transition-colors',
                  meridiem === m
                    ? 'bg-white/15 text-white'
                    : 'text-white/50 hover:text-white/80',
                ].join(' ')}
              >
                {t(m === 'AM' ? 'amLabel' : 'pmLabel')}
              </button>
            ))}
          </div>
        )}
      </div>

      <div
        role="group"
        aria-label={t('switchFormatAria')}
        className="inline-flex items-center rounded-md bg-white/5 p-0.5 text-[11px]"
      >
        {(['12h', '24h'] as const).map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={format === f}
            onClick={() => handleFormatChange(f)}
            disabled={disabled}
            className={[
              'rounded px-2 py-0.5 transition-colors',
              format === f
                ? 'bg-[#FFD700]/15 text-[#FFD700]'
                : 'text-white/45 hover:text-white/70',
            ].join(' ')}
          >
            {t(f === '12h' ? 'format12h' : 'format24h')}
          </button>
        ))}
      </div>
    </div>
  );
}
