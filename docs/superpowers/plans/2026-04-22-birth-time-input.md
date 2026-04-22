# Birth Time Input — Landing Hero + AM/PM Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in birth-time toggle to the landing-page `HeroCalculator`, and introduce a locale-aware `TimePickerField` that supports both 12-hour (AM/PM) and 24-hour input with a visible `[12h | 24h]` switch. Wrap (do not replace) the existing segmented `TimeInput` primitive. API contract is unchanged — canonical value stays `"HH:mm"` 24-hour.

**Architecture:** `TimePickerField` is a new client component under `src/modules/astro-engine/components/`. It owns locale detection (`Intl.DateTimeFormat(...).resolvedOptions().hourCycle`), format state (`'12h' | '24h'`), AM/PM meridiem state, the format switch UI, and 12↔24 conversion. It wraps `TimeInput` (which gains a new optional `maxHour` prop). `HeroCalculator` adds a `knowsBirthTime` toggle identical in behavior to the one in `BirthDataForm`. `BirthDataForm` swaps `TimeInput` for `TimePickerField` in one line.

**Tech Stack:** TypeScript strict, React 19 client components, Next.js 16 App Router, Tailwind 4, `next-intl` for i18n, Vitest (node env) for pure-logic tests, Playwright for UI/e2e tests.

**Spec:** `docs/superpowers/specs/2026-04-22-birth-time-input-design.md`

---

## File Structure

**Created:**
- `src/modules/astro-engine/components/TimePickerField.tsx` — locale-aware wrapper
- `src/modules/astro-engine/components/time-format.ts` — pure logic (locale detection, conversion, parsing)
- `src/modules/astro-engine/components/__tests__/time-format.test.ts` — unit tests for pure logic
- `tests/e2e/birth-time.spec.ts` — Playwright tests covering the toggle + format switch

**Modified:**
- `src/modules/astro-engine/components/TimeInput.tsx` — add optional `maxHour` prop (default 23)
- `src/modules/astro-engine/components/HeroCalculator.tsx` — add `knowsBirthTime` toggle + mount `TimePickerField`; fix `houseSystem` to be `null` when toggle off
- `src/modules/astro-engine/components/BirthDataForm.tsx` — replace `TimeInput` import and usage with `TimePickerField`
- `messages/en.json` — add `heroCalc.knowsBirthTimeLabel`, `heroCalc.timeHelper`, `heroCalc.errTimeRequired`, and full `timePicker.*` block
- `messages/es.json` — same keys in neutral LATAM Spanish (tú form)

**Not touched:**
- `src/shared/validation/common.ts` (timeSchema stays `^\d{2}:\d{2}$`)
- `src/app/api/v1/chart/calculate/*` (contract unchanged)
- `DateInput.tsx`, `CityAutocomplete.tsx`

---

## Task 1: Add `maxHour` prop to `TimeInput`

**Why first:** `TimePickerField` will pass `maxHour=12` in 12-hour mode. Doing this task standalone means the rest of the work can lean on a stable primitive.

**Files:**
- Modify: `src/modules/astro-engine/components/TimeInput.tsx`

- [ ] **Step 1: Extend the props interface**

In `src/modules/astro-engine/components/TimeInput.tsx`, locate the `TimeInputProps` interface (lines 5–18) and add the `maxHour` prop:

```ts
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
  /** Maximum valid hour value (inclusive). Default 23 for 24-hour mode; pass 12 for 12-hour mode. */
  maxHour?: number;
}
```

- [ ] **Step 2: Use `maxHour` in the component**

In the same file, update the function signature (around line 37) to destructure `maxHour`:

```ts
export function TimeInput({
  value,
  onChange,
  disabled = false,
  id,
  className,
  hasError = false,
  maxHour = 23,
  ...ariaProps
}: TimeInputProps) {
```

Then replace `handleHourChange` (lines 71–96) with:

```ts
const handleHourChange = useCallback(
  (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 2);
    const num = parseInt(raw, 10);

    // Reject invalid hour mid-entry only when 2 digits typed
    if (raw.length === 2 && num > maxHour) return;

    setHour(raw);

    // Threshold: the largest single digit that could still be a valid tens digit.
    // 24h (maxHour=23) → floor(23/10)=2 — so "3" auto-advances.
    // 12h (maxHour=12) → floor(12/10)=1 — so "2" and above auto-advance.
    const advanceThreshold = Math.floor(maxHour / 10);

    if (raw.length === 2) {
      // Valid 2-digit hour — advance to minute
      minuteRef.current?.focus();
      minuteRef.current?.select();
      emitChange(raw, minute);
    } else if (raw.length === 1 && num > advanceThreshold) {
      // Single digit too big to be a tens digit — pad and auto-advance
      minuteRef.current?.focus();
      minuteRef.current?.select();
      emitChange(raw.padStart(2, '0'), minute);
      setHour(raw.padStart(2, '0'));
    }
  },
  [minute, emitChange, maxHour],
);
```

This preserves existing 24-hour behavior (`maxHour=23` → threshold `2`, same as before) and correctly handles `maxHour=12` (threshold `1` → "2" through "9" auto-advance with pad).

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no new errors.

- [ ] **Step 4: Run the existing test suite**

Run: `npm test -- --run`
Expected: all existing tests pass (no regressions).

- [ ] **Step 5: Commit**

```bash
git add src/modules/astro-engine/components/TimeInput.tsx
git commit -m "$(cat <<'EOF'
feat(time-input): add optional maxHour prop for 12h-mode reuse

Defaults to 23 (no behavior change for existing callers). TimePickerField
will pass maxHour=12 to reuse this primitive in 12-hour mode.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Write pure-logic module `time-format.ts` and its tests

**Why:** Extract locale detection, 12h↔24h conversion, and paste-parsing into pure functions so they can be tested in vitest's node environment (project has no jsdom setup). Keep the component thin.

**Files:**
- Create: `src/modules/astro-engine/components/time-format.ts`
- Create: `src/modules/astro-engine/components/__tests__/time-format.test.ts`

- [ ] **Step 1: Write the failing test file first**

Create `src/modules/astro-engine/components/__tests__/time-format.test.ts` with:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  detectFormatFromLocale,
  to24h,
  to12h,
  parsePastedTime,
  type HourFormat,
} from '../time-format';

describe('detectFormatFromLocale', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns '12h' for en-US", () => {
    vi.stubGlobal('navigator', { language: 'en-US' });
    expect(detectFormatFromLocale()).toBe('12h');
  });

  it("returns '24h' for ru-RU", () => {
    vi.stubGlobal('navigator', { language: 'ru-RU' });
    expect(detectFormatFromLocale()).toBe('24h');
  });

  it("returns '24h' for es-ES", () => {
    vi.stubGlobal('navigator', { language: 'es-ES' });
    expect(detectFormatFromLocale()).toBe('24h');
  });

  it("returns '12h' for en-AU (hourCycle h12)", () => {
    vi.stubGlobal('navigator', { language: 'en-AU' });
    expect(detectFormatFromLocale()).toBe('12h');
  });

  it("returns '24h' fallback when navigator is undefined (SSR)", () => {
    vi.stubGlobal('navigator', undefined);
    expect(detectFormatFromLocale()).toBe('24h');
  });

  it("returns '24h' fallback when locale is malformed", () => {
    vi.stubGlobal('navigator', { language: 'not-a-locale' });
    expect(detectFormatFromLocale()).toBe('24h');
  });
});

describe('to24h', () => {
  it('converts 12:00 AM → 00:00 (midnight)', () => {
    expect(to24h(12, 0, 'AM')).toBe('00:00');
  });

  it('converts 12:00 PM → 12:00 (noon)', () => {
    expect(to24h(12, 0, 'PM')).toBe('12:00');
  });

  it('converts 01:30 AM → 01:30', () => {
    expect(to24h(1, 30, 'AM')).toBe('01:30');
  });

  it('converts 01:30 PM → 13:30', () => {
    expect(to24h(1, 30, 'PM')).toBe('13:30');
  });

  it('converts 11:59 PM → 23:59', () => {
    expect(to24h(11, 59, 'PM')).toBe('23:59');
  });

  it('pads single-digit hours and minutes', () => {
    expect(to24h(3, 5, 'AM')).toBe('03:05');
  });
});

describe('to12h', () => {
  it('converts 00:00 → { hour: 12, minute: 0, meridiem: AM }', () => {
    expect(to12h('00:00')).toEqual({ hour: 12, minute: 0, meridiem: 'AM' });
  });

  it('converts 12:00 → { hour: 12, minute: 0, meridiem: PM }', () => {
    expect(to12h('12:00')).toEqual({ hour: 12, minute: 0, meridiem: 'PM' });
  });

  it('converts 14:30 → { hour: 2, minute: 30, meridiem: PM }', () => {
    expect(to12h('14:30')).toEqual({ hour: 2, minute: 30, meridiem: 'PM' });
  });

  it('converts 01:30 → { hour: 1, minute: 30, meridiem: AM }', () => {
    expect(to12h('01:30')).toEqual({ hour: 1, minute: 30, meridiem: 'AM' });
  });

  it('returns null for empty string', () => {
    expect(to12h('')).toBeNull();
  });

  it('returns null for invalid format', () => {
    expect(to12h('not-a-time')).toBeNull();
  });
});

describe('parsePastedTime', () => {
  it('parses "14:30" as 24h', () => {
    expect(parsePastedTime('14:30')).toEqual({
      hh: '14',
      mm: '30',
      meridiem: null,
      detectedFormat: '24h',
    });
  });

  it('parses "2:30 PM" as 12h PM', () => {
    expect(parsePastedTime('2:30 PM')).toEqual({
      hh: '02',
      mm: '30',
      meridiem: 'PM',
      detectedFormat: '12h',
    });
  });

  it('parses "2:30pm" case-insensitive', () => {
    expect(parsePastedTime('2:30pm')).toEqual({
      hh: '02',
      mm: '30',
      meridiem: 'PM',
      detectedFormat: '12h',
    });
  });

  it('parses "12:00 AM" correctly', () => {
    expect(parsePastedTime('12:00 AM')).toEqual({
      hh: '12',
      mm: '00',
      meridiem: 'AM',
      detectedFormat: '12h',
    });
  });

  it('parses "09:15" as 24h', () => {
    expect(parsePastedTime('09:15')).toEqual({
      hh: '09',
      mm: '15',
      meridiem: null,
      detectedFormat: '24h',
    });
  });

  it('returns null for garbage', () => {
    expect(parsePastedTime('abc')).toBeNull();
    expect(parsePastedTime('')).toBeNull();
    expect(parsePastedTime('25:99')).toBeNull();
  });

  it('parses "2:30" without meridiem as ambiguous (caller decides format)', () => {
    expect(parsePastedTime('2:30')).toEqual({
      hh: '02',
      mm: '30',
      meridiem: null,
      detectedFormat: null,
    });
  });
});

// Type re-export check (fails to compile if export is missing)
const _checkType: HourFormat = '12h';
void _checkType;
```

- [ ] **Step 2: Run the tests, confirm they fail**

Run: `npm test -- --run src/modules/astro-engine/components/__tests__/time-format.test.ts`

Expected: ALL tests fail — module `../time-format` does not exist yet.

- [ ] **Step 3: Create the module**

Create `src/modules/astro-engine/components/time-format.ts` with:

```ts
/**
 * Pure helpers for TimePickerField — locale detection, 12h↔24h conversion,
 * and paste-time parsing. No DOM, no React; safe to unit-test in node.
 */

export type HourFormat = '12h' | '24h';
export type Meridiem = 'AM' | 'PM';

export interface PastedTime {
  hh: string;
  mm: string;
  meridiem: Meridiem | null;
  detectedFormat: HourFormat | null; // null when ambiguous (no meridiem, hour ≤ 12)
}

/** Detect default format from browser locale. Falls back to '24h' off-browser or on any failure. */
export function detectFormatFromLocale(): HourFormat {
  if (typeof navigator === 'undefined' || !navigator.language) return '24h';
  try {
    const cycle = new Intl.DateTimeFormat(navigator.language, { hour: 'numeric' })
      .resolvedOptions().hourCycle;
    return cycle === 'h11' || cycle === 'h12' ? '12h' : '24h';
  } catch {
    return '24h';
  }
}

/**
 * Convert 12-hour clock values to the canonical "HH:mm" 24-hour string.
 *   12:xx AM → 00:xx (midnight)
 *   12:xx PM → 12:xx (noon)
 *   1:xx–11:xx PM → 13:xx–23:xx
 */
export function to24h(hour12: number, minute: number, meridiem: Meridiem): string {
  let h24 = hour12 % 12; // 12 → 0, 1–11 → 1–11
  if (meridiem === 'PM') h24 += 12;
  return `${String(h24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * Convert a canonical "HH:mm" 24-hour string to 12-hour parts.
 * Returns null when the input is empty or not in the expected shape.
 */
export function to12h(value: string): { hour: number; minute: number; meridiem: Meridiem } | null {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const h24 = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  if (h24 < 0 || h24 > 23 || m < 0 || m > 59) return null;
  const meridiem: Meridiem = h24 >= 12 ? 'PM' : 'AM';
  const hour12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return { hour: hour12, minute: m, meridiem };
}

/**
 * Parse a pasted time string. Supports:
 *   "14:30"        → 24h
 *   "2:30 PM"      → 12h PM
 *   "2:30pm"       → 12h PM (case-insensitive, whitespace optional)
 *   "2:30"         → ambiguous (detectedFormat = null)
 *
 * Returns null when the string is empty, malformed, or out of range.
 */
export function parsePastedTime(input: string): PastedTime | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
  if (!match) return null;

  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const meridiemRaw = match[3]?.toUpperCase() as Meridiem | undefined;

  if (m < 0 || m > 59) return null;

  if (meridiemRaw) {
    if (h < 1 || h > 12) return null;
    return {
      hh: String(h).padStart(2, '0'),
      mm: String(m).padStart(2, '0'),
      meridiem: meridiemRaw,
      detectedFormat: '12h',
    };
  }

  if (h < 0 || h > 23) return null;
  return {
    hh: String(h).padStart(2, '0'),
    mm: String(m).padStart(2, '0'),
    meridiem: null,
    detectedFormat: h > 12 ? '24h' : null,
  };
}
```

- [ ] **Step 4: Run the tests — they must all pass**

Run: `npm test -- --run src/modules/astro-engine/components/__tests__/time-format.test.ts`

Expected: All tests pass (24+ assertions).

- [ ] **Step 5: Run full test suite for regression**

Run: `npm test -- --run`

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/modules/astro-engine/components/time-format.ts src/modules/astro-engine/components/__tests__/time-format.test.ts
git commit -m "$(cat <<'EOF'
feat(time-format): pure helpers for locale, 12h↔24h, paste parsing

Node-testable helpers for TimePickerField: detectFormatFromLocale,
to24h, to12h, parsePastedTime. All conversion logic is pure and
separated from React so vitest (node env) can exercise it.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Create `TimePickerField` component

**Files:**
- Create: `src/modules/astro-engine/components/TimePickerField.tsx`

This is a React component; it is exercised via Playwright in Task 7. No component-level unit tests — all non-trivial logic lives in the already-tested `time-format.ts`.

- [ ] **Step 1: Create the component file**

Create `src/modules/astro-engine/components/TimePickerField.tsx` with:

```tsx
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
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`

Expected: no errors. If `useTranslations('timePicker')` complains that the namespace doesn't exist, that's addressed in Task 4 — keep going.

- [ ] **Step 3: Lint**

Run: `npm run lint -- src/modules/astro-engine/components/TimePickerField.tsx`

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/modules/astro-engine/components/TimePickerField.tsx
git commit -m "$(cat <<'EOF'
feat(time-picker): add locale-aware TimePickerField component

Wraps TimeInput; renders AM/PM when locale is 12h-preferring; shows a
visible [12h|24h] switch. Emits canonical HH:mm 24-hour strings. Paste
of 14:30 into 12h mode auto-switches to 24h.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Add i18n keys

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/es.json`

- [ ] **Step 1: Add to `messages/en.json`**

In `messages/en.json`, inside the `"heroCalc"` object (locate the closing `}` before `"chartDisplay"`), add three new keys. The block ends with `"tryAnother": "Try another date"` — replace that final line with:

```json
    "tryAnother": "Try another date",
    "knowsBirthTimeLabel": "I know my birth time",
    "timeHelper": "Time lets us compute your Ascendant and houses.",
    "errTimeRequired": "Please enter your birth time or turn off the toggle"
```

Then add a new sibling block after `"heroCalc": { ... }`:

```json
  "timePicker": {
    "hourLabel": "Hour",
    "minuteLabel": "Minute",
    "meridiemLabel": "AM or PM",
    "amLabel": "AM",
    "pmLabel": "PM",
    "format12h": "12h",
    "format24h": "24h",
    "switchFormatAria": "Switch between 12-hour and 24-hour time format"
  },
```

- [ ] **Step 2: Add to `messages/es.json` (neutral LATAM, tú form)**

Mirror the same keys in `messages/es.json`. Inside `"heroCalc"`, find the equivalent last entry (if `tryAnother` is already translated there, leave that line — just append the three new keys after it):

```json
    "knowsBirthTimeLabel": "Conozco mi hora de nacimiento",
    "timeHelper": "La hora nos permite calcular tu Ascendente y casas.",
    "errTimeRequired": "Ingresa tu hora de nacimiento o desactiva la opción"
```

Then add the `timePicker` sibling block:

```json
  "timePicker": {
    "hourLabel": "Hora",
    "minuteLabel": "Minutos",
    "meridiemLabel": "AM o PM",
    "amLabel": "AM",
    "pmLabel": "PM",
    "format12h": "12h",
    "format24h": "24h",
    "switchFormatAria": "Cambiar entre formato de 12 y 24 horas"
  },
```

- [ ] **Step 3: Validate JSON parses**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/en.json', 'utf8')); JSON.parse(require('fs').readFileSync('messages/es.json', 'utf8')); console.log('ok')"`

Expected: `ok`. If there's a trailing-comma or syntax error, fix it.

- [ ] **Step 4: Typecheck (confirms TimePickerField's useTranslations resolves now)**

Run: `npm run typecheck`

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add messages/en.json messages/es.json
git commit -m "$(cat <<'EOF'
feat(i18n): add birth-time and time-picker strings (en, es)

- heroCalc.knowsBirthTimeLabel / timeHelper / errTimeRequired
- timePicker.* (hour/minute/meridiem/format-switch labels)

Spanish uses neutral LATAM, tú form.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Replace `TimeInput` with `TimePickerField` in `BirthDataForm`

**Files:**
- Modify: `src/modules/astro-engine/components/BirthDataForm.tsx:10,217-221`

- [ ] **Step 1: Update the import**

In `src/modules/astro-engine/components/BirthDataForm.tsx` line 10, change:

```ts
import { TimeInput } from './TimeInput';
```

to:

```ts
import { TimePickerField } from './TimePickerField';
```

- [ ] **Step 2: Replace the usage**

Around line 217, change:

```tsx
<TimeInput
  id={timeId}
  value={values.time}
  onChange={(v) => setValues((prev) => ({ ...prev, time: v }))}
/>
```

to:

```tsx
<TimePickerField
  id={timeId}
  value={values.time}
  onChange={(v) => setValues((prev) => ({ ...prev, time: v }))}
/>
```

- [ ] **Step 3: Typecheck + lint**

Run: `npm run typecheck && npm run lint -- src/modules/astro-engine/components/BirthDataForm.tsx`

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/modules/astro-engine/components/BirthDataForm.tsx
git commit -m "$(cat <<'EOF'
refactor(birth-data-form): swap TimeInput for TimePickerField

Surrounding state, labels, and validation unchanged. All logged-in
users now get locale-aware 12h/24h input on the full chart form.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Add `knowsBirthTime` toggle + `TimePickerField` to `HeroCalculator`

**Files:**
- Modify: `src/modules/astro-engine/components/HeroCalculator.tsx`

- [ ] **Step 1: Update the import block**

At the top of `HeroCalculator.tsx` (around line 27), add `TimePickerField`:

```ts
import { CityAutocomplete } from './CityAutocomplete';
import { DateInput } from './DateInput';
import { TimePickerField } from './TimePickerField';
```

- [ ] **Step 2: Extend `FormState` and `FormErrors`**

In `HeroCalculator.tsx` (around line 61), replace the `FormState` and `FormErrors` interfaces with:

```ts
interface FormState {
  date: string;
  time: string;
  knowsBirthTime: boolean;
  cityLabel: string;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
}

interface FormErrors {
  date?: string;
  time?: string;
  city?: string;
  general?: string;
}
```

- [ ] **Step 3: Extend the initial state**

In the `useState<FormState>` initializer (around line 147), add `time: ''` and `knowsBirthTime: false`:

```tsx
const [form, setForm] = useState<FormState>({
  date: '',
  time: '',
  knowsBirthTime: false,
  cityLabel: '',
  latitude: null,
  longitude: null,
  timezone: null,
});
```

- [ ] **Step 4: Extend `validate()`**

In `validate()` (around line 173), add the time check after the date block and before the city check:

```ts
const validate = useCallback((): FormErrors => {
  const errs: FormErrors = {};
  if (!form.date) {
    errs.date = t('errDateRequired');
  } else {
    const d = new Date(form.date);
    if (isNaN(d.getTime())) errs.date = t('errDateInvalid');
    else if (d > new Date()) errs.date = t('errDateFuture');
  }
  if (form.knowsBirthTime && !form.time) {
    errs.time = t('errTimeRequired');
  }
  if (form.latitude === null || form.longitude === null) {
    errs.city = t('errCityRequired');
  }
  return errs;
}, [form, t]);
```

- [ ] **Step 5: Update the submit body**

In `handleSubmit()` (around line 200), replace the existing `fetch` body:

```ts
const res = await fetch('/api/v1/chart/calculate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    date: form.date,
    time: form.knowsBirthTime ? form.time : '12:00',
    knowsBirthTime: form.knowsBirthTime,
    latitude: form.latitude,
    longitude: form.longitude,
    timezone: form.timezone,
    houseSystem: form.knowsBirthTime ? 'Placidus' : null,
    ayanamsa: 'lahiri',
  }),
});
```

(Two changes vs current: `time` is dynamic, `houseSystem` is `null` when toggle off.)

- [ ] **Step 6: Insert the toggle + `TimePickerField` between the date field and the city field**

In the form JSX, find the `{/* Date input */}` block and the `{/* City input */}` block. Between them, add:

```tsx
{/* Birth-time opt-in */}
<div className="space-y-2">
  <div className="flex items-center gap-3">
    <button
      type="button"
      role="switch"
      aria-checked={form.knowsBirthTime}
      onClick={() =>
        setForm((f) => ({ ...f, knowsBirthTime: !f.knowsBirthTime }))
      }
      className={[
        'relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent',
        'transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-white/20',
        form.knowsBirthTime ? 'bg-[#FFD700]/70' : 'bg-white/15',
      ].join(' ')}
      aria-label={t('knowsBirthTimeLabel')}
    >
      <span
        className={[
          'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow',
          'transition-transform duration-200 ease-in-out',
          form.knowsBirthTime ? 'translate-x-4' : 'translate-x-0',
        ].join(' ')}
      />
    </button>
    <span className="text-sm text-white/60">
      {t('knowsBirthTimeLabel')}
    </span>
  </div>

  {form.knowsBirthTime && (
    <div>
      <TimePickerField
        id="hero-time"
        value={form.time}
        onChange={(v) => {
          setForm((f) => ({ ...f, time: v }));
          setErrors((prev) => ({ ...prev, time: undefined }));
        }}
        hasError={!!errors.time}
        aria-invalid={!!errors.time}
        aria-describedby={errors.time ? 'hero-time-error' : undefined}
      />
      {errors.time && (
        <p id="hero-time-error" className="mt-1.5 text-xs text-red-400" role="alert">
          {errors.time}
        </p>
      )}
      <p className="mt-1 text-[11px] text-white/40">{t('timeHelper')}</p>
    </div>
  )}
</div>
```

- [ ] **Step 7: Typecheck + lint**

Run: `npm run typecheck && npm run lint -- src/modules/astro-engine/components/HeroCalculator.tsx`

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/modules/astro-engine/components/HeroCalculator.tsx
git commit -m "$(cat <<'EOF'
feat(hero-calc): opt-in birth-time entry with locale-aware format

New "I know my birth time" toggle mirrors BirthDataForm's pattern.
When on, renders TimePickerField — locale-aware (12h for en-US etc.,
24h for rest of world) with a visible [12h|24h] switch.

Also fixes a pre-existing inconsistency: when time is unknown, the
submit body now sends houseSystem: null (matching BirthDataForm)
instead of the previous hardcoded 'Placidus'.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Playwright E2E coverage

**Files:**
- Create: `tests/e2e/birth-time.spec.ts`

This covers the UX surface that unit tests can't reach: toggle flip, time entry, AM/PM selection, 12h↔24h switch.

- [ ] **Step 1: Create the spec file**

Create `tests/e2e/birth-time.spec.ts` with:

```ts
import { test, expect } from '@playwright/test';

/**
 * Birth-time input E2E — covers:
 *  - landing HeroCalculator toggle
 *  - TimePickerField 12h/24h switch
 *  - AM/PM selection
 *  - canonical HH:mm posted to /api/v1/chart/calculate
 */

test.describe('Birth time input — landing hero', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
  });

  test('toggle reveals TimePickerField; format switch works', async ({ page }) => {
    const toggle = page.getByRole('switch', { name: /i know my birth time/i });
    if ((await toggle.count()) === 0) {
      test.skip();
      return;
    }
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');

    const hour = page.getByLabel(/^hour$/i).first();
    await expect(hour).toBeVisible();

    const format12 = page.getByRole('button', { name: /^12h$/i });
    const format24 = page.getByRole('button', { name: /^24h$/i });
    await expect(format12).toBeVisible();
    await expect(format24).toBeVisible();

    await format24.click();
    await expect(format24).toHaveAttribute('aria-pressed', 'true');
    await expect(
      page.getByRole('radiogroup', { name: /am or pm/i }),
    ).toHaveCount(0);

    await format12.click();
    await expect(
      page.getByRole('radiogroup', { name: /am or pm/i }),
    ).toBeVisible();
  });

  test('submit blocked when toggle on but time empty', async ({ page }) => {
    const toggle = page.getByRole('switch', { name: /i know my birth time/i });
    if ((await toggle.count()) === 0) {
      test.skip();
      return;
    }
    await toggle.click();

    await page.getByLabel(/birth date/i).fill('1990-04-22');

    const submit = page.getByRole('button', { name: /discover my sun sign/i });
    await submit.click();

    await expect(
      page.getByText(/please enter your birth time/i),
    ).toBeVisible();
  });

  test('12h entry with PM posts canonical 24h time', async ({ page }) => {
    const toggle = page.getByRole('switch', { name: /i know my birth time/i });
    if ((await toggle.count()) === 0) {
      test.skip();
      return;
    }
    await toggle.click();

    const format12 = page.getByRole('button', { name: /^12h$/i });
    await format12.click();

    await page.getByLabel(/^hour$/i).fill('02');
    await page.getByLabel(/^minute$/i).fill('30');
    await page.getByRole('radio', { name: /^pm$/i }).click();

    const requestPromise = page.waitForRequest(
      (req) =>
        req.url().includes('/api/v1/chart/calculate') && req.method() === 'POST',
    );

    await page.getByLabel(/birth date/i).fill('1990-04-22');
    await page.getByPlaceholder(/birth city/i).fill('London');
    const firstOption = page.getByRole('option').first();
    await firstOption.waitFor({ state: 'visible', timeout: 5_000 });
    await firstOption.click();

    await page.getByRole('button', { name: /discover my sun sign/i }).click();

    const request = await requestPromise;
    const body = JSON.parse(request.postData() ?? '{}');

    expect(body.time).toBe('14:30');
    expect(body.knowsBirthTime).toBe(true);
    expect(body.houseSystem).toBe('Placidus');
  });
});
```

- [ ] **Step 2: Run the e2e suite locally**

Run: `npx playwright test tests/e2e/birth-time.spec.ts --reporter=line`

Expected: all 3 tests pass. (If Clerk rate-limits the dev environment and the landing page doesn't render the marketing variant, the first-level `test.skip()` fires cleanly.)

Troubleshooting:
- If `getByPlaceholder(/birth city/i)` doesn't find the input, check the actual placeholder in `heroCalc.cityPlaceholder` (en.json) — the test matches it case-insensitively.
- If `firstOption.waitFor` times out, the autocomplete debounce may be slower than 5s on your machine — bump it.

- [ ] **Step 3: Run the full e2e suite (regressions)**

Run: `npx playwright test --reporter=line`

Expected: no regressions in existing specs (`landing.spec.ts`, `chart-calculation.spec.ts`, etc.).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/birth-time.spec.ts
git commit -m "$(cat <<'EOF'
test(e2e): cover birth-time toggle, format switch, canonical payload

Playwright scenarios:
- toggle reveals/hides TimePickerField; [12h|24h] switch toggles AM/PM
- submit blocked with inline error when toggle on and time empty
- 12h entry with PM posts normalized "14:30" to /api/v1/chart/calculate

Tests skip gracefully when Clerk rate-limits the dev-mode landing page.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Full-suite verification

**Files:** none modified

- [ ] **Step 1: Typecheck**

Run: `npm run typecheck`

Expected: 0 errors.

- [ ] **Step 2: Lint**

Run: `npm run lint`

Expected: 0 errors, 0 warnings (or same count as baseline — document any pre-existing warnings).

- [ ] **Step 3: Unit tests**

Run: `npm test -- --run`

Expected: all tests pass. `time-format.test.ts` shows 24+ new assertions.

- [ ] **Step 4: Build (ensures Next.js accepts everything)**

Run: `npm run build`

Expected: successful build with no client/server boundary errors.

- [ ] **Step 5: Manual smoke in dev server**

Run: `npm run dev` (in a separate shell if needed).

Verify in a browser at http://localhost:3000:
1. Landing page shows the calculator without a time field (toggle off state).
2. Click the "I know my birth time" toggle → time field appears with locale-appropriate default (12h for en-US browsers, 24h elsewhere).
3. Click `[12h | 24h]` switch → AM/PM appears/disappears; typed values preserved across switch.
4. Fill date + time + city; submit. Observe the network tab — POST body includes correct canonical `"HH:mm"`.
5. Flip browser language to `es-ES` (or open in incognito with that locale) → default is 24h, labels in Spanish.
6. Open `/chart` as a signed-in user (or follow sign-up flow) → `BirthDataForm` shows the same `TimePickerField` with the same behavior.

**Do NOT claim complete until step 5 is visually confirmed in a browser** — per CLAUDE.md's rule that type checks alone verify code, not feature correctness.

- [ ] **Step 6: Playwright e2e (final gate)**

Run: `npx playwright test --reporter=line`

Expected: all tests green.

- [ ] **Step 7: Review staged state**

Run: `git status && git log --oneline -10`

Expected: 6 commits since spec commit, clean working tree.

---

## Self-review checklist

- [ ] Every spec section has a corresponding task:
  - Problem → Task 6 (hero toggle) + Task 5 (BirthDataForm swap) + Task 3 (component) + Task 2 (logic)
  - Locale auto-detect → Task 2 (`detectFormatFromLocale`), Task 3 (uses it)
  - 12h↔24h conversion → Task 2 (`to24h`/`to12h`), Task 3 (renders it)
  - Paste auto-switch → Task 2 (`parsePastedTime`), Task 3 (`handlePaste`)
  - Empty time + toggle on → Task 6 (`validate()`)
  - i18n → Task 4
  - API contract unchanged → verified by absence of edits to `src/shared/validation/` and `src/app/api/v1/chart/calculate/*`
  - A11y (role="switch", radiogroup, group labels) → Task 3 + Task 6

- [ ] No placeholders, TBDs, or "implement error handling" lines.

- [ ] All type/identifier names consistent across tasks:
  - `HourFormat = '12h' | '24h'` — used in Tasks 2, 3
  - `Meridiem = 'AM' | 'PM'` — used in Tasks 2, 3
  - `TimePickerField` — Tasks 3, 5, 6
  - `detectFormatFromLocale`, `to24h`, `to12h`, `parsePastedTime` — Tasks 2, 3

- [ ] Commit messages describe intent, not mechanism.

---

## Parallelization note for the executing agent

Tasks depend on each other as follows:

```
Task 1 (TimeInput.maxHour)
        ↓
Task 2 (time-format.ts + tests) ──┬─→ Task 3 (TimePickerField)
                                   │              ↓
Task 4 (i18n) ──────────────────── ┘      ┌──────┴──────┐
                                          Task 5        Task 6
                                     (BirthDataForm)  (HeroCalc)
                                                         ↓
                                                     Task 7 (e2e)
                                                         ↓
                                                     Task 8 (verify)
```

Task 1 must complete first. Tasks 2 and 4 can run in parallel after Task 1. Task 3 needs both 2 and 4. Tasks 5 and 6 can run in parallel after Task 3. Task 7 needs Task 6. Task 8 is the final sequential gate.

Sequential execution is also fine — the total wall-clock saving with parallelism is ~15–20% given the small file count.
