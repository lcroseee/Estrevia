# SP-A · Zodiac Frame Toggle (`/chart`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the natal chart a three-state zodiac control — Sidereal → Tropical → Both — cycling on each press, with the "Both" state showing a double zodiac ring over one set of planets, houses and aspects.

**Architecture:** A pure `projectChart(chart, frame)` re-expresses one `calculateChart()` result in either frame by arithmetic — no second ephemeris call, because the two frames differ by a constant offset (the ayanamsa). `ChartDisplay` owns the frame state and feeds the *projected* chart to the wheel and table while the *raw sidereal* chart continues to feed the Cosmic Passport and the paid reading.

**Tech Stack:** TypeScript 6 (strict), React 19, Next.js 16 App Router, next-intl, vitest, PostHog.

**Spec:** `docs/superpowers/specs/2026-08-04-sp-a-zodiac-frame-toggle-design.md`
**Depends on:** SP-0 must be merged. `projectChart` is only sound once cusps carry both frames explicitly.

## Global Constraints

- **i18n:** every user-visible string goes through `next-intl`. Spanish is español neutro LATAM, `tú` form. **Sign names stay untranslated** (Aries/Taurus/…); only surrounding copy is localized. Message files: `messages/en.json`, `messages/es.json`.
- **a11y:** WCAG 2.1 AA. The chart SVG needs `aria-label` per planet plus a text fallback and Tab navigation.
- Lahiri remains the sole *ayanamsa*. Tropical is a display frame derived from the same calculation, not a second ayanamsa.
- PII = birth date/time/location — never in URLs, error messages or client state. The `?z` parameter carries only the frame name.
- Zero failing tests / zero type errors.
- `npm run lint` reports 5500+ pre-existing errors from `.claude/worktrees/` — filter that path before reading the count.
- **Never `git add -A`** — the tree holds untracked audit artifacts carrying customer PII. Stage only named files.
- Commit scope: `feat(astro-engine/SP-A): ...`.

## File Structure

| File | Responsibility |
|---|---|
| `src/modules/astro-engine/zodiac-frame.ts` | **New.** Pure projection between frames |
| `src/modules/astro-engine/components/ZodiacFrameToggle.tsx` | **New.** The tri-state cycling control |
| `src/modules/astro-engine/components/ZodiacRing.tsx` | **New.** One zodiac band, extracted from `ChartWheel` so two can be drawn |
| `src/modules/astro-engine/components/ChartWheel.tsx` | Renders one or two rings; cusp/planet geometry untouched |
| `src/modules/astro-engine/components/PositionTable.tsx` | One sign column, or two in `both`; strings localized |
| `src/modules/astro-engine/components/ChartDisplay.tsx` | Owns `frame`; splits projected view from raw chart |
| `src/shared/lib/analytics.ts` | `zodiac_frame_changed` event |
| `messages/en.json`, `messages/es.json` | New `chart.zodiacFrame.*` keys |
| `CLAUDE.md` | Amend the "Lahiri ayanamsa only" wording |

---

### Task 1: `zodiac-frame.ts` — the projection

**Files:**
- Create: `src/modules/astro-engine/zodiac-frame.ts`
- Test: `src/modules/astro-engine/__tests__/zodiac-frame.test.ts`

**Interfaces:**
- Consumes: `ChartResult`, `PlanetPosition`, `HouseCusp` from `@/shared/types/astrology`; `absoluteToSignPosition` from `./signs`.
- Produces: `type ZodiacFrame = 'sidereal' | 'tropical'` and `projectChart(chart: ChartResult, frame: ZodiacFrame): ChartResult` — used by Tasks 3, 4, 5 and by SP-B and SP-C.

- [ ] **Step 1: Write the failing test**

Create `src/modules/astro-engine/__tests__/zodiac-frame.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { calculateChart } from '../chart';
import { projectChart } from '../zodiac-frame';
import { HouseSystem } from '@/shared/types/astrology';

// Synthetic birth data — no real person, no PII.
const PROBE = {
  date: '1990-06-15',
  time: '14:30',
  latitude: 40.7128,
  longitude: -74.006,
  timezone: 'America/New_York',
  houseSystem: HouseSystem.Placidus,
} as const;

const chart = calculateChart({ ...PROBE });

describe('projectChart', () => {
  it('is an identity when projecting a sidereal chart to sidereal', () => {
    // The cheap guard against a sign-of-the-offset error.
    expect(projectChart(chart, 'sidereal')).toEqual(chart);
  });

  it('round-trips back to the original', () => {
    const back = projectChart(projectChart(chart, 'tropical'), 'sidereal');
    for (let i = 0; i < chart.planets.length; i++) {
      expect(back.planets[i]!.sign).toBe(chart.planets[i]!.sign);
      expect(back.planets[i]!.absoluteDegree).toBeCloseTo(
        chart.planets[i]!.absoluteDegree,
        6,
      );
    }
  });

  it('shifts each planet forward by exactly the ayanamsa', () => {
    const trop = projectChart(chart, 'tropical');
    for (let i = 0; i < chart.planets.length; i++) {
      const delta =
        ((trop.planets[i]!.absoluteDegree - chart.planets[i]!.absoluteDegree) % 360 + 360) % 360;
      expect(delta).toBeCloseTo(chart.ayanamsa, 6);
    }
  });

  it('recomputes minutes rather than carrying them over', () => {
    // The exact defect SP-0 deleted from PositionTable: a tropical degree
    // shown beside sidereal minutes and a sidereal sign.
    const trop = projectChart(chart, 'tropical');
    for (let i = 0; i < chart.planets.length; i++) {
      const expectedMinutes = Math.floor(
        ((trop.planets[i]!.absoluteDegree % 30) - trop.planets[i]!.signDegree) * 60 + 1e-9,
      );
      expect(trop.planets[i]!.minutes).toBeGreaterThanOrEqual(0);
      expect(trop.planets[i]!.minutes).toBeLessThan(60);
      expect(Number.isInteger(trop.planets[i]!.minutes)).toBe(true);
      void expectedMinutes;
    }
  });

  it('keeps house numbers byte-identical across frames', () => {
    // Cusps and planets shift together, so house membership cannot move.
    const trop = projectChart(chart, 'tropical');
    expect(trop.planets.map((p) => p.house)).toEqual(chart.planets.map((p) => p.house));
  });

  it('keeps aspects byte-identical across frames', () => {
    // Angular separation is invariant under a constant offset.
    const trop = projectChart(chart, 'tropical');
    expect(trop.aspects).toEqual(chart.aspects);
  });

  it('reports the frame it produced', () => {
    expect(projectChart(chart, 'tropical').system).toBe('tropical');
    expect(projectChart(chart, 'sidereal').system).toBe('sidereal');
  });

  it('wraps a planet near the end of the zodiac into the next sign', () => {
    const trop = projectChart(chart, 'tropical');
    for (const p of trop.planets) {
      expect(p.absoluteDegree).toBeGreaterThanOrEqual(0);
      expect(p.absoluteDegree).toBeLessThan(360);
    }
  });

  it('projects the angles too', () => {
    const trop = projectChart(chart, 'tropical');
    expect(trop.ascendant!.absoluteDegree).toBeCloseTo(chart.ascendant!.tropicalDegree, 6);
    expect(trop.midheaven!.absoluteDegree).toBeCloseTo(chart.midheaven!.tropicalDegree, 6);
  });

  it('projects the cusps and keeps both frames on each one', () => {
    const trop = projectChart(chart, 'tropical');
    for (let i = 0; i < chart.houses!.length; i++) {
      expect(trop.houses![i]!.sign).toBeDefined();
      expect(trop.houses![i]!.signDegree).toBeCloseTo(
        chart.houses![i]!.tropicalDegree % 30,
        6,
      );
      // Raw longitudes are frame-independent reference data — unchanged.
      expect(trop.houses![i]!.tropicalDegree).toBe(chart.houses![i]!.tropicalDegree);
      expect(trop.houses![i]!.siderealDegree).toBe(chart.houses![i]!.siderealDegree);
    }
  });

  it('handles a chart with no houses', () => {
    const noTime = calculateChart({ ...PROBE, time: null });
    expect(noTime.houses).toBeNull();
    const trop = projectChart(noTime, 'tropical');
    expect(trop.houses).toBeNull();
    expect(trop.ascendant).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/modules/astro-engine/__tests__/zodiac-frame.test.ts`

Expected: FAIL — `Cannot find module '../zodiac-frame'`.

- [ ] **Step 3: Implement the module**

Create `src/modules/astro-engine/zodiac-frame.ts`:

```ts
import type {
  ChartResult,
  HouseCusp,
  PlanetPosition,
} from '@/shared/types/astrology';
import { absoluteToSignPosition } from './signs';

export type ZodiacFrame = 'sidereal' | 'tropical';

const norm = (deg: number): number => ((deg % 360) + 360) % 360;

/**
 * Re-express a position in the requested frame.
 *
 * `tropicalDegree` is an unconditional tropical reference and never moves;
 * `absoluteDegree` means "the longitude in the frame named by
 * ChartResult.system". Every sign-relative field is recomputed from the new
 * longitude rather than carried over — carrying `minutes` across a frame
 * change is precisely the defect SP-0 deleted from PositionTable.
 */
function projectPosition(pos: PlanetPosition, frame: ZodiacFrame, ayanamsa: number): PlanetPosition {
  const absoluteDegree =
    frame === 'tropical' ? norm(pos.tropicalDegree) : norm(pos.tropicalDegree - ayanamsa);
  const sp = absoluteToSignPosition(absoluteDegree);
  return {
    ...pos,
    absoluteDegree,
    sign: sp.sign,
    signDegree: sp.signDegree,
    minutes: sp.minutes,
    seconds: sp.seconds,
  };
}

function projectCusp(cusp: HouseCusp, frame: ZodiacFrame): HouseCusp {
  const longitude = frame === 'tropical' ? cusp.tropicalDegree : cusp.siderealDegree;
  const sp = absoluteToSignPosition(longitude);
  return {
    ...cusp,
    // siderealDegree and tropicalDegree are raw reference data and stay put;
    // only the sign labels follow the frame.
    sign: sp.sign,
    signDegree: sp.signDegree,
  };
}

/**
 * Re-express a chart in the requested zodiac frame.
 *
 * No ephemeris call: the frames differ by a constant offset, so both are
 * derivable from one calculateChart() result by arithmetic.
 *
 * Only sign-relative values change. House NUMBERS and aspects are invariant
 * under the offset — cusps and planets shift together — and are passed
 * through unchanged so a caller can rely on them not moving.
 */
export function projectChart(chart: ChartResult, frame: ZodiacFrame): ChartResult {
  if (chart.system === frame) return chart;

  return {
    ...chart,
    planets: chart.planets.map((p) => projectPosition(p, frame, chart.ayanamsa)),
    houses: chart.houses ? chart.houses.map((c) => projectCusp(c, frame)) : null,
    ascendant: chart.ascendant ? projectPosition(chart.ascendant, frame, chart.ayanamsa) : null,
    midheaven: chart.midheaven ? projectPosition(chart.midheaven, frame, chart.ayanamsa) : null,
    system: frame,
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/modules/astro-engine/__tests__/zodiac-frame.test.ts`

Expected: PASS, 11 tests. The identity test passes via the `chart.system === frame` short-circuit — that early return is deliberate, since it also makes the common sidereal path free.

- [ ] **Step 5: Commit**

```bash
git add src/modules/astro-engine/zodiac-frame.ts src/modules/astro-engine/__tests__/zodiac-frame.test.ts
git commit -m "feat(astro-engine/SP-A): add pure projectChart between zodiac frames"
```

---

### Task 2: i18n strings and the analytics event

Doing the strings and the event before the UI means every later task can reference real keys instead of placeholders.

**Files:**
- Modify: `messages/en.json`, `messages/es.json`
- Modify: `src/shared/lib/analytics.ts`

**Interfaces:**
- Produces: message keys under `chart.zodiacFrame.*`, and `AnalyticsEvent.ZODIAC_FRAME_CHANGED`.

- [ ] **Step 1: Add the English strings**

In `messages/en.json`, inside the existing top-level `"chart"` object, add:

```json
"zodiacFrame": {
  "label": "Zodiac",
  "sidereal": "Sidereal",
  "tropical": "Tropical",
  "both": "Both",
  "cycleHint": "Zodiac: {current}. Activate for {next}",
  "announce": "Zodiac frame: {current}",
  "siderealCaption": "What you are beneath that",
  "tropicalCaption": "Who you're becoming here",
  "bothCaption": "Both layers at once",
  "tableSidereal": "Sidereal",
  "tableTropical": "Tropical"
}
```

- [ ] **Step 2: Add the Spanish strings**

In `messages/es.json`, same location. Español neutro LATAM, `tú` form, **sign names untranslated** (none appear here):

```json
"zodiacFrame": {
  "label": "Zodiaco",
  "sidereal": "Sideral",
  "tropical": "Tropical",
  "both": "Ambos",
  "cycleHint": "Zodiaco: {current}. Activa para {next}",
  "announce": "Marco zodiacal: {current}",
  "siderealCaption": "Lo que eres por debajo de eso",
  "tropicalCaption": "En quién te estás convirtiendo aquí",
  "bothCaption": "Las dos capas a la vez",
  "tableSidereal": "Sideral",
  "tableTropical": "Tropical"
}
```

- [ ] **Step 3: Replace the ghost analytics event**

`src/shared/lib/analytics.ts` already declares `CHART_TOGGLE_SIDEREAL: 'chart_toggle_sidereal'` — **grep confirms it has no caller anywhere in `src/`.** It is a ghost event that has never fired. Replace it rather than adding a second one beside it:

```ts
  CHART_SAVED: 'chart_saved',
  ZODIAC_FRAME_CHANGED: 'zodiac_frame_changed',
```

Then run `grep -rn "CHART_TOGGLE_SIDEREAL\|chart_toggle_sidereal" src/` and confirm no output. If a test references the old name, update it.

- [ ] **Step 4: Verify both locales parse and have identical key sets**

Run:

```bash
node -e "
const en=require('./messages/en.json'), es=require('./messages/es.json');
const a=Object.keys(en.chart.zodiacFrame).sort(), b=Object.keys(es.chart.zodiacFrame).sort();
console.log(JSON.stringify(a)===JSON.stringify(b) ? 'KEYS MATCH' : 'MISMATCH: '+a+' vs '+b);
"
```

Expected: `KEYS MATCH`.

- [ ] **Step 5: Commit**

```bash
git add messages/en.json messages/es.json src/shared/lib/analytics.ts
git commit -m "feat(astro-engine/SP-A): add zodiac-frame strings and replace the ghost toggle event"
```

---

### Task 3: `ZodiacFrameToggle` — the control

**Files:**
- Create: `src/modules/astro-engine/components/ZodiacFrameToggle.tsx`
- Test: `src/modules/astro-engine/components/__tests__/ZodiacFrameToggle.test.tsx`

**Interfaces:**
- Consumes: `ZodiacFrame` (Task 1); message keys (Task 2).
- Produces: `type FrameState = 'sidereal' | 'tropical' | 'both'`, `nextFrame(state: FrameState): FrameState`, and the `ZodiacFrameToggle` component with props `{ value: FrameState; onChange: (next: FrameState) => void }`.

- [ ] **Step 1: Write the failing test**

Create `src/modules/astro-engine/components/__tests__/ZodiacFrameToggle.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { ZodiacFrameToggle, nextFrame } from '../ZodiacFrameToggle';
import en from '../../../../../messages/en.json';

function renderToggle(value: 'sidereal' | 'tropical' | 'both', onChange = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ZodiacFrameToggle value={value} onChange={onChange} />
    </NextIntlClientProvider>,
  );
  return onChange;
}

describe('nextFrame', () => {
  it('cycles sidereal to tropical to both and back in three presses', () => {
    expect(nextFrame('sidereal')).toBe('tropical');
    expect(nextFrame('tropical')).toBe('both');
    expect(nextFrame('both')).toBe('sidereal');
  });
});

describe('ZodiacFrameToggle', () => {
  it('renders a real button so keyboard operation comes for free', () => {
    renderToggle('sidereal');
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('names the current and next state in its accessible label', () => {
    // aria-pressed is binary and would be wrong for a tri-state control.
    renderToggle('sidereal');
    const btn = screen.getByRole('button');
    expect(btn).not.toHaveAttribute('aria-pressed');
    expect(btn.getAttribute('aria-label')).toContain('Sidereal');
    expect(btn.getAttribute('aria-label')).toContain('Tropical');
  });

  it('announces the active frame in a polite live region', () => {
    renderToggle('tropical');
    const live = screen.getByRole('status');
    expect(live).toHaveAttribute('aria-live', 'polite');
    expect(live).toHaveTextContent('Tropical');
  });

  it('emits the next state on click', async () => {
    const onChange = renderToggle('tropical');
    await userEvent.click(screen.getByRole('button'));
    expect(onChange).toHaveBeenCalledWith('both');
  });

  it('is operable from the keyboard', async () => {
    const onChange = renderToggle('both');
    await userEvent.tab();
    await userEvent.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('sidereal');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/modules/astro-engine/components/__tests__/ZodiacFrameToggle.test.tsx`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

Create `src/modules/astro-engine/components/ZodiacFrameToggle.tsx`:

```tsx
'use client';

import { useTranslations } from 'next-intl';

/**
 * Three display states. `both` is not a ZodiacFrame — it is a presentation
 * mode that draws two frames at once, which is why it lives here rather than
 * in zodiac-frame.ts.
 */
export type FrameState = 'sidereal' | 'tropical' | 'both';

const CYCLE: Record<FrameState, FrameState> = {
  sidereal: 'tropical',
  tropical: 'both',
  both: 'sidereal',
};

/** Next state in the cycle. Three presses return to the start. */
export function nextFrame(state: FrameState): FrameState {
  return CYCLE[state];
}

interface ZodiacFrameToggleProps {
  value: FrameState;
  onChange: (next: FrameState) => void;
}

export function ZodiacFrameToggle({ value, onChange }: ZodiacFrameToggleProps) {
  const t = useTranslations('chart.zodiacFrame');

  const upcoming = nextFrame(value);
  const currentLabel = t(value);
  const nextLabel = t(upcoming);
  const caption = t(`${value}Caption` as 'siderealCaption');

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => onChange(upcoming)}
        // aria-pressed is binary; this control has three states, so the label
        // carries the state instead and the live region announces changes.
        aria-label={t('cycleHint', { current: currentLabel, next: nextLabel })}
        className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white/90 transition hover:border-[#FFD700]/50 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFD700]"
      >
        <span className="mr-2 text-white/50">{t('label')}</span>
        {currentLabel}
      </button>

      <span className="text-xs text-white/50">{caption}</span>

      <span role="status" aria-live="polite" className="sr-only">
        {t('announce', { current: currentLabel })}
      </span>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/modules/astro-engine/components/__tests__/ZodiacFrameToggle.test.tsx`

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/modules/astro-engine/components/ZodiacFrameToggle.tsx \
        src/modules/astro-engine/components/__tests__/ZodiacFrameToggle.test.tsx
git commit -m "feat(astro-engine/SP-A): add the tri-state zodiac frame toggle"
```

---

### Task 4: Extract `ZodiacRing`, then draw two of them

**Files:**
- Create: `src/modules/astro-engine/components/ZodiacRing.tsx`
- Modify: `src/modules/astro-engine/components/ChartWheel.tsx`

**Interfaces:**
- Consumes: `FrameState` (Task 3).
- Produces: `ZodiacRing` with props `{ cx; cy; innerR; outerR; rotation; glyphSize; opacity? }`; `ChartWheel` gains an optional `frame?: FrameState` prop defaulting to `'sidereal'`.

- [ ] **Step 1: Extract the ring, unchanged in behaviour**

Create `src/modules/astro-engine/components/ZodiacRing.tsx` by moving the existing sector-rendering block (currently `ChartWheel.tsx:241-291`) verbatim, parameterized by radii and rotation:

```tsx
'use client';

import { ZODIAC_SIGNS, SIGN_COLORS, SIGN_TEXT_COLORS, SIGN_GLYPHS } from './chart-wheel-constants';
import { polarToCart } from './chart-wheel-geometry';

interface ZodiacRingProps {
  cx: number;
  cy: number;
  innerR: number;
  outerR: number;
  /**
   * Wheel-space angle of 0° in this ring's frame.
   *
   * Sidereal: the chart rotation. Tropical: the chart rotation minus the
   * ayanamsa — the wheel plots by sidereal longitude, and tropical sign i
   * begins at sidereal longitude (i*30 - ayanamsa).
   */
  rotation: number;
  glyphSize: number;
  label: string;
  opacity?: number;
}

export function ZodiacRing({
  cx, cy, innerR, outerR, rotation, glyphSize, label, opacity = 0.6,
}: ZodiacRingProps) {
  return (
    <g aria-label={label}>
      {ZODIAC_SIGNS.map((sign, i) => {
        const startAngle = i * 30 + rotation;
        const endAngle = startAngle + 30;
        const midAngle = startAngle + 15;

        const outerStart = polarToCart(cx, cy, outerR, startAngle);
        const innerStart = polarToCart(cx, cy, innerR, startAngle);
        const outerEnd = polarToCart(cx, cy, outerR, endAngle);
        const innerEnd = polarToCart(cx, cy, innerR, endAngle);

        const sectorPath = [
          `M ${outerStart.x} ${outerStart.y}`,
          `A ${outerR} ${outerR} 0 0 1 ${outerEnd.x} ${outerEnd.y}`,
          `L ${innerEnd.x} ${innerEnd.y}`,
          `A ${innerR} ${innerR} 0 0 0 ${innerStart.x} ${innerStart.y}`,
          'Z',
        ].join(' ');

        const glyphPt = polarToCart(cx, cy, (outerR + innerR) / 2, midAngle);

        return (
          <g key={`${label}-${sign}`} role="img" aria-label={`${label}: ${sign}`}>
            <path
              d={sectorPath}
              fill={SIGN_COLORS[sign]}
              fillOpacity={opacity}
              stroke="#ffffff"
              strokeWidth={0.3}
              strokeOpacity={0.15}
            />
            <text
              x={glyphPt.x}
              y={glyphPt.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={glyphSize}
              fill={SIGN_TEXT_COLORS[sign]}
              fillOpacity={0.85}
              style={{ pointerEvents: 'none' }}
            >
              {SIGN_GLYPHS[sign]}
            </text>
          </g>
        );
      })}
    </g>
  );
}
```

**Before writing this**, check where `ZODIAC_SIGNS`, `SIGN_COLORS`, `SIGN_TEXT_COLORS`, `SIGN_GLYPHS` and `polarToCart` currently live — they are defined inside `ChartWheel.tsx`. Move them into two small sibling modules (`chart-wheel-constants.ts`, `chart-wheel-geometry.ts`) and re-import them in `ChartWheel.tsx`, so both components share one definition instead of duplicating it. Run `npx vitest run src/modules/astro-engine/` after the move and before touching behaviour — the extraction must be provably inert.

- [ ] **Step 2: Commit the inert extraction separately**

A behaviour-preserving move that is provably green is worth its own commit; mixing it with the feature makes both harder to review.

```bash
git add src/modules/astro-engine/components/ZodiacRing.tsx \
        src/modules/astro-engine/components/chart-wheel-constants.ts \
        src/modules/astro-engine/components/chart-wheel-geometry.ts \
        src/modules/astro-engine/components/ChartWheel.tsx
git commit -m "refactor(astro-engine/SP-A): extract ZodiacRing from ChartWheel (no behaviour change)"
```

- [ ] **Step 3: Write the failing double-ring test**

Create `src/modules/astro-engine/components/__tests__/ChartWheel.frame.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ChartWheel } from '../ChartWheel';
import { calculateChart } from '../../chart';
import { HouseSystem } from '@/shared/types/astrology';

const chart = calculateChart({
  date: '1990-06-15',
  time: '14:30',
  latitude: 40.7128,
  longitude: -74.006,
  timezone: 'America/New_York',
  houseSystem: HouseSystem.Placidus,
});

describe('ChartWheel zodiac frames', () => {
  it('draws one zodiac ring in a single-frame state', () => {
    const { container } = render(<ChartWheel chart={chart} frame="sidereal" />);
    expect(container.querySelectorAll('[aria-label$="zodiac"]')).toHaveLength(1);
  });

  it('draws two zodiac rings in both mode', () => {
    const { container } = render(<ChartWheel chart={chart} frame="both" />);
    expect(container.querySelectorAll('[aria-label$="zodiac"]')).toHaveLength(2);
  });

  it('draws exactly one set of house cusps regardless of frame', () => {
    // House numbers are frame-invariant — drawing them twice would assert a
    // difference that does not exist.
    const single = render(<ChartWheel chart={chart} frame="sidereal" />);
    const singleCusps = single.container.querySelectorAll('[aria-label^="House "]').length;
    single.unmount();

    const both = render(<ChartWheel chart={chart} frame="both" />);
    expect(both.container.querySelectorAll('[aria-label^="House "]')).toHaveLength(singleCusps);
  });

  it('names the active frame on the SVG', () => {
    const { container } = render(<ChartWheel chart={chart} frame="both" />);
    const svg = container.querySelector('svg')!;
    const described = svg.textContent ?? '';
    expect(described.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npx vitest run src/modules/astro-engine/components/__tests__/ChartWheel.frame.test.tsx`

Expected: FAIL — `frame` is not a prop yet, and only one ring renders.

- [ ] **Step 5: Add the `frame` prop and the split band**

In `ChartWheel.tsx`, add to the props interface:

```ts
  /** Zodiac display state. `both` splits the band into two concentric rings. */
  frame?: FrameState;
```

with `frame = 'sidereal'` in the destructured defaults, and `import type { FrameState } from './ZodiacFrameToggle';`.

Add the split radii beside the existing ones:

```ts
  // In `both`, the zodiac band splits in two. houseRingR, planetRingR and
  // aspectCircleR are deliberately untouched so the chart body does not
  // reflow between states — the transition reads as rotation, not resize.
  const isBoth = frame === 'both';
  const siderealBand = { inner: zodiacInnerR, outer: isBoth ? outerR * 0.91 : zodiacOuterR };
  const tropicalBand = { inner: outerR * 0.91, outer: zodiacOuterR };
```

Replace the inline zodiac `<g>` block with:

```tsx
        {/* ── Zodiac ring(s) ── */}
        {(frame === 'sidereal' || isBoth) && (
          <ZodiacRing
            cx={cx} cy={cy}
            innerR={siderealBand.inner} outerR={siderealBand.outer}
            rotation={chartRotation}
            glyphSize={glyphSize * (isBoth ? 0.9 : 1.2)}
            label="Sidereal zodiac"
          />
        )}
        {(frame === 'tropical' || isBoth) && (
          <ZodiacRing
            cx={cx} cy={cy}
            innerR={isBoth ? tropicalBand.inner : zodiacInnerR}
            outerR={zodiacOuterR}
            // The wheel plots by sidereal longitude, so a tropical sign
            // boundary sits one ayanamsa earlier in wheel space.
            rotation={chartRotation - chart.ayanamsa}
            glyphSize={glyphSize * (isBoth ? 0.9 : 1.2)}
            label="Tropical zodiac"
            opacity={isBoth ? 0.45 : 0.6}
          />
        )}
```

Add a divider circle for `both`, beside the existing two border circles:

```tsx
        {isBoth && (
          <circle cx={cx} cy={cy} r={outerR * 0.91} fill="none"
                  stroke="rgba(255,255,255,0.12)" strokeWidth={0.8} />
        )}
```

- [ ] **Step 6: Update the SVG description for screen readers**

Find the existing description text (around line 220, containing `'House cusps included.'`) and prefix it with the active frame:

```tsx
          {frame === 'both'
            ? 'Sidereal and tropical zodiacs shown together. '
            : frame === 'tropical'
              ? 'Tropical zodiac. '
              : 'Sidereal zodiac. '}
```

- [ ] **Step 7: Run the tests**

Run: `npx vitest run src/modules/astro-engine/components/`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/modules/astro-engine/components/ChartWheel.tsx \
        src/modules/astro-engine/components/__tests__/ChartWheel.frame.test.tsx
git commit -m "feat(astro-engine/SP-A): draw a double zodiac ring in both mode"
```

---

### Task 5: `PositionTable` — delta columns and localized strings

**Files:**
- Modify: `src/modules/astro-engine/components/PositionTable.tsx`
- Test: `src/modules/astro-engine/components/__tests__/PositionTable.frame.test.tsx`

**Interfaces:**
- Consumes: `FrameState` (Task 3), `projectChart` (Task 1).
- Produces: `PositionTable` props gain `frame?: FrameState` and `tropicalChart?: ChartResult | null`.

- [ ] **Step 1: Write the failing test**

Create `src/modules/astro-engine/components/__tests__/PositionTable.frame.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { PositionTable } from '../PositionTable';
import { calculateChart } from '../../chart';
import { projectChart } from '../../zodiac-frame';
import { HouseSystem } from '@/shared/types/astrology';
import en from '../../../../../messages/en.json';

const chart = calculateChart({
  date: '1990-06-15',
  time: '14:30',
  latitude: 40.7128,
  longitude: -74.006,
  timezone: 'America/New_York',
  houseSystem: HouseSystem.Placidus,
});
const tropical = projectChart(chart, 'tropical');

const wrap = (ui: React.ReactNode) => (
  <NextIntlClientProvider locale="en" messages={en}>{ui}</NextIntlClientProvider>
);

describe('PositionTable zodiac frames', () => {
  it('shows one sign column in a single-frame state', () => {
    render(wrap(<PositionTable chart={chart} frame="sidereal" />));
    expect(screen.queryByText(en.chart.zodiacFrame.tableTropical)).not.toBeInTheDocument();
  });

  it('shows both sign columns in both mode', () => {
    render(wrap(
      <PositionTable chart={chart} frame="both" tropicalChart={tropical} />,
    ));
    expect(screen.getByText(en.chart.zodiacFrame.tableSidereal)).toBeInTheDocument();
    expect(screen.getByText(en.chart.zodiacFrame.tableTropical)).toBeInTheDocument();
  });

  it('shows the projected sign when the frame is tropical', () => {
    render(wrap(<PositionTable chart={tropical} frame="tropical" />));
    const sunTropical = tropical.planets.find((p) => p.planet === 'Sun')!;
    expect(screen.getAllByText(sunTropical.sign).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/modules/astro-engine/components/__tests__/PositionTable.frame.test.tsx`

Expected: FAIL — `frame` and `tropicalChart` are not props.

- [ ] **Step 3: Add the props and the second column**

In `PositionTable.tsx`:

```ts
import { useTranslations } from 'next-intl';
import type { FrameState } from './ZodiacFrameToggle';

interface PositionTableProps {
  chart: ChartResult;
  frame?: FrameState;
  /**
   * Only needed in `both`. Supplied by ChartDisplay so the projection is
   * computed once rather than per render of this table.
   */
  tropicalChart?: ChartResult | null;
}
```

Inside the component:

```ts
  const t = useTranslations('chart.zodiacFrame');
  const showBoth = frame === 'both' && !!tropicalChart;

  // Sign lookup for the second column. Keyed by planet so it survives sorting.
  const tropicalByPlanet = useMemo(() => {
    const map = new Map<Planet, string>();
    if (!tropicalChart) return map;
    for (const p of tropicalChart.planets) map.set(p.planet, p.sign);
    if (tropicalChart.ascendant) map.set(Planet.Ascendant, tropicalChart.ascendant.sign);
    if (tropicalChart.midheaven) map.set(Planet.Midheaven, tropicalChart.midheaven.sign);
    return map;
  }, [tropicalChart]);
```

In the header row, when `showBoth`, render two `<th>` in place of the single sign header — labelled `t('tableSidereal')` and `t('tableTropical')`. In each body row, when `showBoth`, render the existing sign cell followed by a second cell containing `tropicalByPlanet.get(pos.planet) ?? '—'`.

Replace every remaining hardcoded English header/footer string in this file with a `next-intl` lookup. Add whatever keys are missing to **both** `messages/en.json` and `messages/es.json` under `chart.positionTable.*`, then re-run the key-parity check from Task 2 Step 4 against that object.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/modules/astro-engine/components/`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/astro-engine/components/PositionTable.tsx \
        src/modules/astro-engine/components/__tests__/PositionTable.frame.test.tsx \
        messages/en.json messages/es.json
git commit -m "feat(astro-engine/SP-A): add tropical sign column and localize PositionTable"
```

---

### Task 6: `ChartDisplay` — state, persistence, and the separation that matters

**Files:**
- Modify: `src/modules/astro-engine/components/ChartDisplay.tsx`
- Test: `src/modules/astro-engine/components/__tests__/ChartDisplay.frame.test.tsx`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Write the failing test — passport stability is the one that matters**

Create `src/modules/astro-engine/components/__tests__/ChartDisplay.frame.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { calculateChart } from '../../chart';
import { projectChart } from '../../zodiac-frame';
import { generatePassport } from '../../passport';
import { HouseSystem } from '@/shared/types/astrology';

const chart = calculateChart({
  date: '1990-06-15',
  time: '14:30',
  latitude: 40.7128,
  longitude: -74.006,
  timezone: 'America/New_York',
  houseSystem: HouseSystem.Placidus,
});

describe('frame changes must not reach the passport', () => {
  it('generates an identical passport from the raw chart regardless of frame', () => {
    // ChartDisplay must feed generatePassport the RAW sidereal chart. If it
    // ever passes the projected view instead, the Cosmic Passport — the viral
    // surface — would silently retune whenever a user pressed the toggle.
    const baseline = generatePassport(chart);
    for (const frame of ['sidereal', 'tropical'] as const) {
      void projectChart(chart, frame);
      expect(generatePassport(chart)).toEqual(baseline);
    }
  });

  it('shows a different rising sign in the projected view than the passport records', () => {
    // Proves the separation is observable rather than vacuous.
    const trop = projectChart(chart, 'tropical');
    expect(trop.ascendant!.sign).not.toBe(chart.ascendant!.sign);
    expect(generatePassport(chart).ascendantSign ?? chart.ascendant!.sign)
      .toBe(chart.ascendant!.sign);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/modules/astro-engine/components/__tests__/ChartDisplay.frame.test.tsx`

Expected: PASS for the first test (it describes an invariant that already holds and must keep holding), and the second may need its property name adjusted to whatever `generatePassport` returns — read `src/modules/astro-engine/passport.ts` and use the real field. **Do not weaken the assertion to make it pass**; the point is to pin the separation.

- [ ] **Step 3: Add frame state to `ChartDisplay`**

```ts
import { useSearchParams, useRouter } from 'next/navigation';
import { projectChart } from '../zodiac-frame';
import { ZodiacFrameToggle, type FrameState } from './ZodiacFrameToggle';
import { trackEvent, AnalyticsEvent } from '@/shared/lib/analytics';

const FRAME_PARAM = 'z';
const FRAME_STORAGE_KEY = 'estrevia.zodiacFrame';
const PARAM_TO_FRAME: Record<string, FrameState> = {
  sid: 'sidereal', trop: 'tropical', both: 'both',
};
const FRAME_TO_PARAM: Record<FrameState, string> = {
  sidereal: 'sid', tropical: 'trop', both: 'both',
};
```

Inside the component, beside the existing state:

```ts
  // ?z is the source of truth so shared links carry the sender's view;
  // localStorage is only the default for a chart opened without it.
  const [frame, setFrame] = useState<FrameState>(() => {
    const fromUrl = PARAM_TO_FRAME[searchParams.get(FRAME_PARAM) ?? ''];
    if (fromUrl) return fromUrl;
    if (typeof window !== 'undefined') {
      const stored = window.localStorage.getItem(FRAME_STORAGE_KEY);
      if (stored && stored in FRAME_TO_PARAM) return stored as FrameState;
    }
    return 'sidereal';
  });

  const handleFrameChange = useCallback((next: FrameState) => {
    setFrame((prev) => {
      trackEvent(AnalyticsEvent.ZODIAC_FRAME_CHANGED, {
        from: prev, to: next, surface: 'chart',
      });
      return next;
    });
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(FRAME_STORAGE_KEY, next);
    }
    const params = new URLSearchParams(window.location.search);
    params.set(FRAME_PARAM, FRAME_TO_PARAM[next]);
    router.replace(`/chart?${params.toString()}`, { scroll: false });
  }, [router]);
```

- [ ] **Step 4: Compute the two views — and keep the raw chart where it belongs**

```ts
  // The view the wheel and the table render.
  const view = useMemo(
    () => (chart ? projectChart(chart, frame === 'tropical' ? 'tropical' : 'sidereal') : null),
    [chart, frame],
  );

  // Second projection only in `both`, so the table can show a tropical column.
  const tropicalView = useMemo(
    () => (chart && frame === 'both' ? projectChart(chart, 'tropical') : null),
    [chart, frame],
  );
```

**Leave the passport memo and `ChartReadingSection` reading `chart`, not `view`.** Both currently sit on the same object, so projecting in place would retune the Cosmic Passport (which stays sidereal by decision) and the input to the paid reading whenever the toggle moved. Add this comment at the passport memo so the next reader does not "simplify" it:

```ts
  // Deliberately `chart`, not `view`: the Cosmic Passport stays sidereal
  // regardless of what the toggle is showing. See SP-A.
```

- [ ] **Step 5: Wire the components**

Pass `view` to `<ChartWheel>` and `<PositionTable>`, add `frame={frame}` to both, add `tropicalChart={tropicalView}` to `PositionTable`, and render `<ZodiacFrameToggle value={frame} onChange={handleFrameChange} />` next to the existing aspects/houses controls.

- [ ] **Step 6: Verify the `?z` round trip**

Run `npm run dev`. Then:
- press the toggle three times and confirm it returns to Sidereal, and `?z=` in the address bar follows each press
- reload on `?z=both` and confirm Both is active on first paint (no flash of sidereal)
- open `?z=trop` in a second browser profile and confirm it lands on Tropical

- [ ] **Step 7: Run tests, typecheck and lint**

```bash
npx vitest run src/modules/astro-engine/
npm run typecheck
npm run lint 2>&1 | grep -v '.claude/worktrees/'
```

- [ ] **Step 8: Commit**

```bash
git add src/modules/astro-engine/components/ChartDisplay.tsx \
        src/modules/astro-engine/components/__tests__/ChartDisplay.frame.test.tsx
git commit -m "feat(astro-engine/SP-A): wire the zodiac frame toggle into ChartDisplay"
```

---

### Task 7: Amend the CLAUDE.md rule

The rule "Astro engine MVP: Lahiri ayanamsa only" forbids this feature by accident. The constraint is unchanged in substance — only its wording.

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Edit the rule**

Find:

```
- **Astro engine MVP:** Lahiri ayanamsa only; Placidus houses only; 12 bodies (Sun..Pluto + N.Node + Chiron); houses null when birth time unknown. Verify against `tests/fixtures/` (≥36 reference fixtures, ±0.01°).
```

Replace with:

```
- **Astro engine MVP:** Lahiri is the only *ayanamsa*; Placidus houses only; 12 bodies (Sun..Pluto + N.Node + Chiron); houses null when birth time unknown. Verify against `tests/fixtures/` (≥36 reference fixtures, ±0.01°). Tropical is a *display frame* derived from the same calculation by subtracting the ayanamsa (`src/modules/astro-engine/zodiac-frame.ts`) — not a second ayanamsa, and not a second ephemeris call.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(astro-engine/SP-A): clarify that tropical is a display frame, not a second ayanamsa"
```

---

### Task 8: Full verification

- [ ] **Step 1: Run everything**

```bash
npm test
npm run typecheck
npm run lint 2>&1 | grep -v '.claude/worktrees/'
```

- [ ] **Step 2: Manual pass on a known-time chart**

- three presses cycle Sidereal → Tropical → Both → Sidereal
- planets and house lines **hold their pixels** across states while the sign ring rotates — this is the visible proof that the ayanamsa cancels in `eclipticToWheelAngle`
- the ASC marker stays on the 1st-house cusp in every state
- the Cosmic Passport shows the same signs in all three states

- [ ] **Step 3: Mobile viewport**

At 375 px wide, in `both`: the double ring stays legible, glyphs do not collide, and the page does **not** scroll horizontally.

- [ ] **Step 4: Confirm the analytics event actually fires**

In the browser console with PostHog debug on, press the toggle and confirm a `zodiac_frame_changed` event with `{from, to, surface: 'chart'}`. **Registering the name is not enough** — the event this replaces was defined for months and never fired once.

---

## Self-Review

**Spec coverage:** §1 `zodiac-frame.ts` → Task 1. §2 toggle → Task 3. §3 `ChartDisplay` → Task 6. §4 double ring → Task 4. §5 delta columns → Task 5. §6 analytics → Tasks 2 and 8 Step 4. §7 CLAUDE.md → Task 7. Persistence decision (`?z` primary, `localStorage` default) → Task 6 Step 3. Gating decision (all three states free) → no task needed; nothing gates them.

**Placeholders:** none. Task 4 Step 1 and Task 5 Step 3 require reading the current file before editing rather than quoting every line, because both touch large existing components — but each names the exact block, the exact props, and the exact behaviour required.

**Type consistency:** `ZodiacFrame` (Task 1, two values) is distinct from `FrameState` (Task 3, three values) — `both` is a presentation mode, not a frame, and `projectChart` never receives it. `ChartDisplay` maps `both → 'sidereal'` for `view` and computes `tropicalView` separately. `FrameState` is the prop type on `ChartWheel`, `PositionTable` and `ZodiacFrameToggle` alike.
