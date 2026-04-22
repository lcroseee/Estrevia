# Birth Time Input — Landing Hero + AM/PM Support

**Status:** Approved design
**Date:** 2026-04-22
**Author:** Kirill (founder) + Claude (brainstorming partner)

## Problem

The landing-page hero calculator (`HeroCalculator`) does not let users enter their birth time. It hardcodes `time: '12:00'` and `knowsBirthTime: false`. Users born near a sign cusp (~3–5% of the population) receive an incorrect Sun sign. Users who want to see their Ascendant immediately on landing cannot.

Separately, the existing 24-hour-only `TimeInput` (used in `BirthDataForm`) offers no 12-hour AM/PM affordance, which confuses US users who do not think in military time. International users, in turn, expect 24-hour format.

## Goals

1. Let users optionally enter birth time on the landing-page hero.
2. Support both 12-hour (AM/PM) and 24-hour time formats in a single component.
3. Default to the format native to the user's browser locale.
4. Keep the API contract unchanged — the canonical value remains `"HH:mm"` 24-hour.
5. Do not hurt conversion: time entry stays behind an opt-in toggle so the hero still looks like a 2-field form by default.

## Non-Goals

- Changing the backend time format. `timeSchema` stays strict 24-hour.
- Showing ASC / Moon in the landing result card (separate product decision).
- Free-form natural-language parsing ("quarter past three"). Out of scope.
- Changing `DateInput`, `CityAutocomplete`, or chart-calculation code.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Where time input lives on landing | Expandable toggle (mirrors `BirthDataForm`) | Keeps 2-field look by default; preserves conversion funnel |
| 12h/24h format strategy | Locale auto-detect + visible `[12h \| 24h]` switch | Respects global audience; US users can still toggle to AM/PM |
| Component architecture | New `TimePickerField` wraps existing `TimeInput` | Preserves tested primitive; centralizes locale + format logic |
| Toggle ON + empty time | Inline error, block submit | Explicit over silent fallback to 12:00 |
| Pre-fill `/chart` after landing | Use existing `chartId` flow (chart already saved to DB) | No PII in URLs; matches current pattern |
| Landing result card | Unchanged (Sun sign only) | Product scope; deeper preview is a separate decision |

## Architecture

### Directory layout

```
src/modules/astro-engine/components/
├── TimeInput.tsx                    (minor: add maxHour prop, default 23)
├── TimePickerField.tsx              (NEW — wrapper)
├── HeroCalculator.tsx               (modify — add knowsBirthTime toggle)
├── BirthDataForm.tsx                (modify — swap TimeInput for TimePickerField)
└── __tests__/
    └── TimePickerField.test.tsx     (NEW)
```

### Component boundaries

- `TimeInput` stays the segmented HH:MM primitive. Accepts `maxHour` (default 23) so 12h-mode parents can constrain to 1–12.
- `TimePickerField` owns: locale detection, format state (12h/24h), AM/PM meridiem state, format-switch UI, 12↔24 conversion, emission of canonical `"HH:mm"`.
- `HeroCalculator` and `BirthDataForm` own: `knowsBirthTime` toggle, `time` form field, validation. They consume `TimePickerField` identically.

### Data flow

```
navigator.language
      │
      ▼
Intl.DateTimeFormat(...).resolvedOptions().hourCycle
      │
      ▼
  detectFormatFromLocale()  →  'h11'|'h12' → '12h'   |   'h23'|'h24' → '24h'
      │
      ▼
TimePickerField.format state  (user can override via [12h|24h] switch)
      │
      ▼
Renders TimeInput (with maxHour = 12 or 23) + optional AM/PM pill
      │
      ▼
User input  →  normalize to 24h  →  onChange("HH:mm")
      │
      ▼
Parent form  →  POST /api/v1/chart/calculate  (existing contract)
```

## Component API — `TimePickerField`

```ts
interface TimePickerFieldProps {
  value: string;                    // canonical "HH:mm" or ""
  onChange: (value: string) => void; // emits canonical "HH:mm"
  defaultFormat?: '12h' | '24h';    // omit for locale detection
  disabled?: boolean;
  id?: string;
  hasError?: boolean;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
  'aria-required'?: boolean;
}
```

### Locale detection

```ts
function detectFormatFromLocale(): '12h' | '24h' {
  if (typeof navigator === 'undefined') return '24h';
  try {
    const cycle = new Intl.DateTimeFormat(navigator.language, { hour: 'numeric' })
      .resolvedOptions().hourCycle;
    return cycle === 'h11' || cycle === 'h12' ? '12h' : '24h';
  } catch {
    return '24h';
  }
}
```

Because `TimePickerField` is `'use client'`, the initializer runs on the client only. No SSR hydration mismatch.

### 12h ↔ 24h conversion rules

| User enters (12h) | Meridiem | Emitted 24h |
|---|---|---|
| `12:00` | AM | `00:00` (midnight) |
| `12:00` | PM | `12:00` (noon) |
| `01:30` | AM | `01:30` |
| `01:30` | PM | `13:30` |
| `11:59` | PM | `23:59` |

Format toggle never loses data — it re-projects the canonical value.

### Edge cases

- **Paste `"2:30 PM"` in 12h mode:** parse meridiem from the pasted string; fill segments.
- **Paste `"14:30"` in 12h mode:** detect value > 12, auto-switch format to 24h.
- **Empty value + toggle ON:** parent validates, blocks submit with inline error.
- **SSR:** `detectFormatFromLocale` returns `'24h'` fallback. The `'use client'` directive ensures first paint is client-side.
- **Locale change mid-session:** format state persists until user toggles explicitly.

## `HeroCalculator` changes

### State

```ts
interface FormState {
  date: string;
  time: string;
  knowsBirthTime: boolean;   // NEW
  cityLabel: string;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
}
```

### UI additions

Between `DateInput` and `CityAutocomplete`:

1. Toggle pill: `role="switch"`, label "I know my birth time" (styled identical to `BirthDataForm`).
2. When toggle is on: render `TimePickerField` + helper text `timeHelper`.

### Validation

Add to `validate()`:

```ts
if (form.knowsBirthTime && !form.time) {
  errs.time = t('errTimeRequired');
}
```

### Submit body

```ts
{
  date: form.date,
  time: form.knowsBirthTime ? form.time : '12:00',
  knowsBirthTime: form.knowsBirthTime,
  latitude: form.latitude,
  longitude: form.longitude,
  timezone: form.timezone,
  houseSystem: form.knowsBirthTime ? 'Placidus' : null,
  ayanamsa: 'lahiri',
}
```

### Result-card CTA

Unchanged: `href={\`/chart?chartId=${result.chartId}\`}`. The server-side chart record carries the real time; `/chart` loads by id. No PII in URLs.

## `BirthDataForm` changes

Single replacement:

```diff
- import { TimeInput } from './TimeInput';
+ import { TimePickerField } from './TimePickerField';

- <TimeInput id={timeId} value={values.time} onChange={(v) => ...} />
+ <TimePickerField id={timeId} value={values.time} onChange={(v) => ...} />
```

All surrounding state, labels, and validation remain unchanged.

## i18n

### `en.json`

```json
"heroCalc": {
  "...": "...",
  "knowsBirthTimeLabel": "I know my birth time",
  "timeHelper": "Time lets us compute your Ascendant and houses.",
  "errTimeRequired": "Please enter your birth time or turn off the toggle"
},
"timePicker": {
  "hourLabel": "Hour",
  "minuteLabel": "Minute",
  "meridiemLabel": "AM or PM",
  "amLabel": "AM",
  "pmLabel": "PM",
  "format12h": "12h",
  "format24h": "24h",
  "switchFormatAria": "Switch between 12-hour and 24-hour time format"
}
```

### `es.json` (neutral LATAM, tú form)

```json
"heroCalc": {
  "...": "...",
  "knowsBirthTimeLabel": "Conozco mi hora de nacimiento",
  "timeHelper": "La hora nos permite calcular tu Ascendente y casas.",
  "errTimeRequired": "Ingresa tu hora de nacimiento o desactiva la opción"
},
"timePicker": {
  "hourLabel": "Hora",
  "minuteLabel": "Minutos",
  "meridiemLabel": "AM o PM",
  "amLabel": "AM",
  "pmLabel": "PM",
  "format12h": "12h",
  "format24h": "24h",
  "switchFormatAria": "Cambiar entre formato de 12 y 24 horas"
}
```

## Validation & error handling

| Condition | UX |
|---|---|
| Toggle OFF, submit | Send `knowsBirthTime: false`, `time: '12:00'`, `houseSystem: null` |
| Toggle ON, empty time, submit | Inline error, blocks submit, focus returns to time field |
| Toggle ON, incomplete time (e.g., only hour) | Existing `TimeInput` waits for complete value; `onChange` never fires until valid |
| Network error | Existing error surface (`errGeneric` / `errOffline`) |

## Accessibility

- Toggle: `role="switch"`, `aria-checked`, labelled by visible text.
- `TimePickerField` wraps existing `TimeInput` a11y (hour/minute inputs have `aria-label`).
- AM/PM pill: `role="radiogroup"`, `aria-label={t('meridiemLabel')}`, each option is `role="radio"`.
- `[12h|24h]` switch: `role="group"`, `aria-label={t('switchFormatAria')}`.
- Error text: `role="alert"`, linked via `aria-describedby`.

## Testing

### New — `TimePickerField.test.tsx`

- Locale defaults: mock `navigator.language`; assert `'en-US'` → 12h, `'ru-RU'` → 24h, malformed → 24h fallback.
- SSR fallback: render with `navigator` undefined, assert `'24h'`.
- 12↔24 toggle preserves value: enter 14:30 in 24h, switch to 12h, value displays as 02:30 PM; emits unchanged.
- Midnight / noon: 12:00 AM emits `"00:00"`; 12:00 PM emits `"12:00"`.
- Paste `"2:30 PM"` in 12h mode sets segments + meridiem correctly.
- Paste `"14:30"` in 12h mode auto-switches to 24h.
- Empty + invalid inputs do not emit onChange.
- A11y: all labels present; Tab order hour → minute → meridiem → format switch.

### Extend — `HeroCalculator.test.tsx`

- Toggle OFF (default) → submit with `knowsBirthTime: false` and `time: '12:00'`.
- Toggle ON + valid time → submit with real `time` and `knowsBirthTime: true`.
- Toggle ON + empty time → shows `errTimeRequired`, does not submit.
- Toggle ON → OFF preserves typed time silently.

### No change

- API route tests (`/api/v1/chart/calculate`) — contract unchanged.
- `TimeInput` existing tests — still pass (new `maxHour` prop is optional, default preserves behavior).

## Rollout

Single PR, merged behind no feature flag. Changes are additive — existing users see the new toggle and (if they want) the new format switch. Default behavior for unchanged-behavior paths (toggle off on landing, existing `BirthDataForm` flow) is preserved.

## Out of scope

- Natural-language time parsing.
- Timezone picker (city autocomplete provides `timezone` server-side).
- Rich landing result card (ASC + Moon preview).
- Mobile-native time picker (`<input type="time">`) — current segmented approach works cross-device and matches design system.
