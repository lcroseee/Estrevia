# Moon Accuracy & Zodiac Sign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `/moon` illumination accuracy (use local "now" instead of UTC midnight), show the zodiac sign the Moon is transiting in the current-phase card, each calendar cell, and the day-detail panel, and upgrade the moon visualization with surface detail — all by dispatching ten parallel agents with non-overlapping file boundaries.

**Architecture:** The `/moon` page already has a Swiss-Ephemeris backend that returns `moonSign`, `moonDegree`, and transit times, but the frontend ignores them and normalizes time to UTC midnight. We split the 753-line `MoonCalendar.tsx` into four files (done in the prep commit), stub `ZodiacGlyph`, then hand each remaining concern to a dedicated agent working in a git worktree. Agents 4/5/6 depend only on the frozen signature of the ZodiacGlyph stub, so all ten can run simultaneously.

**Tech Stack:** Next.js 16 App Router, React 19 client components, TypeScript strict mode, `sweph` (Swiss Ephemeris Moshier), Tailwind 4, Vitest, Playwright, `next-intl`.

---

## 0. Shared context (read before every task)

**Working directory root:** `/Users/kirillkovalenko/Documents/Projects/Estrevia`

**Commands each agent will use:**

| Purpose | Command |
|---------|---------|
| Type check | `npx tsc --noEmit` |
| Unit tests | `pnpm test -- <pattern>` (Vitest) |
| One-off unit test | `npx vitest run <path>` |
| E2E tests | `pnpm test:e2e` (Playwright) |
| Dev server | `pnpm dev` (Next.js + Turbopack, http://localhost:3000) |
| Lint | `pnpm lint` |

**Prep commit already on main (`d5c939f`):**

- `src/modules/astro-engine/components/MoonCalendar.tsx` — slim orchestrator (260 lines)
- `src/modules/astro-engine/components/CurrentPhaseCard.tsx` — hero card
- `src/modules/astro-engine/components/MoonCalendarGrid.tsx` — month grid
- `src/modules/astro-engine/components/DayDetailPanel.tsx` — slide-up sheet (includes `DetailItem`)
- `src/modules/astro-engine/components/moon-types.ts` — shared `DayData`, `TodayRef`, `MONTH_NAMES`, `WEEKDAY_LABELS`, `daysInMonth`, `firstWeekdayOfMonth`, `dayDataFromServer`
- `src/shared/components/ZodiacGlyph.tsx` — stub (agent 3 polishes)

**Frozen type signatures that agents must not change:**

```ts
// src/shared/components/ZodiacGlyph.tsx — signature is fixed
export interface ZodiacGlyphProps {
  sign: Sign | string | null | undefined;
  size?: number;
  className?: string;
}
export function ZodiacGlyph(props: ZodiacGlyphProps): JSX.Element | null;

// src/modules/astro-engine/components/moon-types.ts — extended by agents, not renamed
export interface DayData {
  day: number;
  angle: number;
  illumination: number;
  emoji: string;
  phaseName: string;
  moonSign?: string | null;
  moonDegree?: number | null;
  isVoidOfCourse?: boolean | null;
}
```

**Merge order after all agents finish (sequential, in main session):**

`1 → 3 → 2 → 7 → 4 → 5 → 6 → 8 → 10 → 9`

Rationale: backend first, glyph primitive second, visual primitive third, i18n so strings exist, then consumers (card → grid → detail), then tests, then accuracy verification, then e2e last so it sees the fully merged UI.

---

## Task 1 (Agent 1): Accept `?t=` query param on `/api/v1/moon/current`

**Files:**
- Modify: `src/app/api/v1/moon/current/route.ts`
- Test: `tests/astro/moon-current-route.test.ts` (create)

- [ ] **Step 1: Write the failing tests**

Create `tests/astro/moon-current-route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from '@/app/api/v1/moon/current/route';

// Silence the shared rate limiter for these tests by always returning success
vi.mock('@/shared/lib/rate-limit', () => ({
  getRateLimiter: () => ({ limit: async () => ({ success: true }) }),
}));

function makeReq(url: string): Request {
  return new Request(url, { headers: { 'x-forwarded-for': '127.0.0.1' } });
}

describe('/api/v1/moon/current — time reference', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('honors ?t= ISO8601 and does not snap to UTC midnight', async () => {
    // Fix server clock to 2026-04-23T02:00:00Z
    vi.setSystemTime(new Date('2026-04-23T02:00:00Z'));
    // But the client passes its local evening moment as t
    const res = await GET(makeReq('https://x/test?t=2026-04-23T20:00:00Z'));
    const json = await res.json();
    expect(json.success).toBe(true);
    const illumAt20 = json.data.illumination;

    // Same server clock, t=morning → illumination should differ by ≥0.5%
    const res2 = await GET(makeReq('https://x/test?t=2026-04-23T00:00:00Z'));
    const json2 = await res2.json();
    const illumAt00 = json2.data.illumination;
    expect(Math.abs(illumAt20 - illumAt00)).toBeGreaterThanOrEqual(0.5);
  });

  it('falls back to current server moment (not UTC midnight) when t is absent', async () => {
    vi.setSystemTime(new Date('2026-04-23T18:30:00Z'));
    const res = await GET(makeReq('https://x/test'));
    const json = await res.json();
    // Angle at 18:30 UTC is ~6° further than at 00:00 UTC → reject the midnight value
    expect(json.success).toBe(true);
    // Angle should have moved forward — not be a "pinned to midnight" figure.
    // The old behavior would give the exact same angle as midnight; we assert it is
    // at least 0.5° past the midnight value.
    vi.setSystemTime(new Date('2026-04-23T00:00:00Z'));
    const mid = await GET(makeReq('https://x/test'));
    const midJson = await mid.json();
    expect(json.data.angle).toBeGreaterThan(midJson.data.angle + 0.5);
  });

  it('rejects malformed t and falls back silently', async () => {
    vi.setSystemTime(new Date('2026-04-23T12:00:00Z'));
    const res = await GET(makeReq('https://x/test?t=not-a-date'));
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(typeof json.data.illumination).toBe('number');
  });

  it('sets Cache-Control s-maxage=60', async () => {
    vi.setSystemTime(new Date('2026-04-23T12:00:00Z'));
    const res = await GET(makeReq('https://x/test'));
    expect(res.headers.get('Cache-Control')).toMatch(/s-maxage=60/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run tests/astro/moon-current-route.test.ts
```

Expected: All four tests FAIL (current route normalizes to UTC midnight, cache is 600s).

- [ ] **Step 3: Modify the route**

Replace the param-parsing block in `src/app/api/v1/moon/current/route.ts` (the one around lines 28–54 that reads `dateParam` and normalizes to UTC midnight) with:

```ts
  // ---------------------------------------------------------------------------
  // 2. Parse query params — t (preferred, live moment) or date (historical day)
  // ---------------------------------------------------------------------------
  const { searchParams } = new URL(request.url);
  const tParam = searchParams.get('t');
  const dateParam = searchParams.get('date');
  const latParam = searchParams.get('lat');
  const lonParam = searchParams.get('lon');

  let targetDate: Date;

  if (tParam) {
    const parsed = new Date(tParam);
    targetDate = isNaN(parsed.getTime()) ? new Date() : parsed;
  } else if (dateParam) {
    const parsed = new Date(dateParam);
    if (isNaN(parsed.getTime())) {
      return NextResponse.json(
        { success: false, data: null, error: 'INVALID_DATE' },
        { status: 400 },
      );
    }
    // Explicit historical day: snap to UTC midnight of that day
    targetDate = new Date(
      Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()),
    );
  } else {
    // Default: live — the current moment, not a nominal midnight
    targetDate = new Date();
  }
```

And change the cache header at the bottom of the `try` block:

```ts
        headers: {
          // Live phase: short TTL so edge refreshes every minute but bursts share
          'Cache-Control': 's-maxage=60, stale-while-revalidate=300',
        },
```

- [ ] **Step 4: Re-run tests to verify they pass**

```bash
npx vitest run tests/astro/moon-current-route.test.ts
```

Expected: All four tests PASS.

- [ ] **Step 5: Run existing moon-phase test suite to make sure nothing regressed**

```bash
npx vitest run tests/astro/moon-phase.test.ts
```

Expected: PASS.

- [ ] **Step 6: Type check and lint**

```bash
npx tsc --noEmit
pnpm lint
```

Expected: Both clean.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/v1/moon/current/route.ts tests/astro/moon-current-route.test.ts
git commit -m "feat(moon/api): accept ?t= and compute illumination for live moment

- /api/v1/moon/current no longer snaps 'now' to UTC midnight. Clients
  pass new Date().toISOString() as ?t= and get the phase for that exact
  moment, fixing the 27%-vs-33% gap observed against reference apps.
- Explicit ?date=YYYY-MM-DD still snaps to UTC midnight for historical
  day snapshots (unchanged contract).
- Cache-Control drops from s-maxage=600 to s-maxage=60 so the edge
  refreshes every minute without hammering the function."
```

---

## Task 2 (Agent 2): Upgrade `MoonPhaseSVG` with surface detail

**Files:**
- Modify: `src/modules/astro-engine/components/MoonPhaseSVG.tsx`

No unit test (visual component). Relies on Playwright e2e from agent 9 for visual regression.

- [ ] **Step 1: Read the current component to preserve its props contract**

The public API `{ illumination, phaseAngle, size }` must not change. Consumers pass these props and rely on the output being an `<svg>`.

- [ ] **Step 2: Replace the component with the enhanced version**

Overwrite `src/modules/astro-engine/components/MoonPhaseSVG.tsx`:

```tsx
'use client';

interface MoonPhaseSVGProps {
  illumination: number; // 0 to 1
  phaseAngle: number;   // 0 to 360
  size?: number;        // px, default 48
}

/**
 * Physically-motivated SVG moon.
 *
 * - Ivory surface gradient (warm, not cool) with off-center highlight.
 * - Fixed crater pattern clipped to the visible lit portion.
 * - Soft terminator: a narrow gradient band replaces the hard edge.
 * - Rim light along the outer lit edge for depth.
 *
 * Public API (illumination, phaseAngle, size) is preserved.
 */
export function MoonPhaseSVG({
  illumination,
  phaseAngle,
  size = 48,
}: MoonPhaseSVGProps) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 2;

  const isWaxing = phaseAngle < 180;
  const absIllum = Math.max(0, Math.min(1, illumination));
  const terminatorRx = r * Math.abs(2 * absIllum - 1);
  const isGibbous = absIllum > 0.5;

  // Unique-per-instance IDs to avoid collisions when multiple moons render
  const uid = `moon-${size}-${Math.round(phaseAngle)}-${Math.round(absIllum * 100)}`;

  let litPath: string;
  if (absIllum < 0.01) {
    litPath = '';
  } else if (absIllum > 0.99) {
    litPath = `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx} ${cy + r} A ${r} ${r} 0 1 1 ${cx} ${cy - r} Z`;
  } else {
    const top = { x: cx, y: cy - r };
    const bot = { x: cx, y: cy + r };
    const litSweep = isWaxing ? 1 : 0;
    const terminatorSweep = isGibbous
      ? (isWaxing ? 0 : 1)
      : (isWaxing ? 1 : 0);
    litPath = [
      `M ${top.x} ${top.y}`,
      `A ${r} ${r} 0 0 ${litSweep} ${bot.x} ${bot.y}`,
      `A ${terminatorRx} ${r} 0 0 ${terminatorSweep} ${top.x} ${top.y}`,
      'Z',
    ].join(' ');
  }

  // Crater positions in unit coords (-1..+1 across the moon disc).
  // Chosen once so the pattern is recognizable but not uniform.
  const craters: Array<{ ux: number; uy: number; ur: number }> = [
    { ux: -0.35, uy: -0.25, ur: 0.14 },
    { ux:  0.15, uy: -0.40, ur: 0.07 },
    { ux:  0.40, uy:  0.10, ur: 0.11 },
    { ux: -0.10, uy:  0.30, ur: 0.09 },
    { ux: -0.45, uy:  0.20, ur: 0.06 },
    { ux:  0.05, uy:  0.05, ur: 0.08 },
    { ux:  0.25, uy:  0.45, ur: 0.05 },
  ];

  const craterCircles = craters.map((c, i) => (
    <circle
      key={i}
      cx={cx + c.ux * r}
      cy={cy + c.uy * r}
      r={c.ur * r}
      fill={`url(#${uid}-crater)`}
      opacity={0.55}
    />
  ));

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`Moon phase: ${Math.round(absIllum * 100)}% illuminated`}
    >
      <defs>
        {/* Outer soft glow */}
        <radialGradient id={`${uid}-glow`} cx="50%" cy="50%" r="60%">
          <stop offset="50%" stopColor={absIllum > 0.3 ? 'rgba(245,240,232,0.18)' : 'rgba(245,240,232,0.07)'} />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        {/* Warm ivory surface, off-center highlight */}
        <radialGradient id={`${uid}-surface`} cx="38%" cy="34%" r="72%">
          <stop offset="0%"   stopColor="#FBF3E3" />
          <stop offset="55%"  stopColor="#EEDFC5" />
          <stop offset="100%" stopColor="#C9BBA3" />
        </radialGradient>
        {/* Crater tint: darker warm gray, semi-transparent so surface shows through */}
        <radialGradient id={`${uid}-crater`} cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="rgba(80, 70, 60, 0.75)" />
          <stop offset="100%" stopColor="rgba(80, 70, 60, 0.20)" />
        </radialGradient>
        {/* Rim light along the lit edge */}
        <radialGradient id={`${uid}-rim`} cx={isWaxing ? '85%' : '15%'} cy="50%" r="60%">
          <stop offset="70%" stopColor="transparent" />
          <stop offset="95%" stopColor="rgba(255,245,220,0.40)" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        {/* Clip the crater pattern to the illuminated path */}
        <clipPath id={`${uid}-clip`}>
          {litPath ? <path d={litPath} /> : <circle cx={cx} cy={cy} r={0} />}
        </clipPath>
        {/* Soft-terminator gradient band */}
        <linearGradient
          id={`${uid}-terminator`}
          x1={isWaxing ? `${50 - 4}%` : `${50 + 4}%`}
          x2={isWaxing ? `${50 + 4}%` : `${50 - 4}%`}
          y1="0%"
          y2="0%"
        >
          <stop offset="0%"  stopColor="rgba(42,42,53,0)" />
          <stop offset="50%" stopColor="rgba(42,42,53,0.55)" />
          <stop offset="100%" stopColor="rgba(42,42,53,0)" />
        </linearGradient>
      </defs>

      {/* Outer glow */}
      <circle cx={cx} cy={cy} r={r + 2} fill={`url(#${uid}-glow)`} />

      {/* Shadow base */}
      <circle cx={cx} cy={cy} r={r} fill="#1E1E28" />

      {/* Illuminated disc */}
      {litPath && <path d={litPath} fill={`url(#${uid}-surface)`} />}

      {/* Craters, clipped to lit area */}
      {litPath && (
        <g clipPath={`url(#${uid}-clip)`}>
          {craterCircles}
        </g>
      )}

      {/* Rim light */}
      {litPath && absIllum > 0.15 && absIllum < 0.98 && (
        <path d={litPath} fill={`url(#${uid}-rim)`} />
      )}

      {/* Soft terminator strip only when part lit / part dark */}
      {absIllum > 0.05 && absIllum < 0.95 && size >= 28 && (
        <ellipse
          cx={cx}
          cy={cy}
          rx={Math.max(1, terminatorRx)}
          ry={r}
          fill={`url(#${uid}-terminator)`}
          opacity={0.6}
        />
      )}

      {/* Thin rim definition */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="rgba(255,255,255,0.10)"
        strokeWidth={0.5}
      />
    </svg>
  );
}
```

- [ ] **Step 3: Type check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Smoke test in the dev server**

```bash
pnpm dev
```

Visit http://localhost:3000/moon. Confirm: each calendar cell's moon has visible surface texture, the current-phase hero moon shows craters only on the lit side, no console warnings about duplicate gradient IDs.

Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add src/modules/astro-engine/components/MoonPhaseSVG.tsx
git commit -m "feat(moon-svg): craters, soft terminator, rim light, warm palette

Upgrades MoonPhaseSVG with a fixed-position crater pattern clipped to
the lit hemisphere, a narrow gradient terminator band instead of a hard
edge, a subtle rim light on the lit edge, and a warmer ivory surface
gradient. IDs are made unique per instance (size+angle+illum hash) to
avoid <defs> collisions when many moons render in the calendar grid.
Public props (illumination, phaseAngle, size) are unchanged."
```

---

## Task 3 (Agent 3): Polish `ZodiacGlyph` component

**Files:**
- Modify: `src/shared/components/ZodiacGlyph.tsx`
- Test: `tests/components/ZodiacGlyph.test.tsx` (create)

- [ ] **Step 1: Write the failing tests**

Create `tests/components/ZodiacGlyph.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ZodiacGlyph } from '@/shared/components/ZodiacGlyph';

describe('ZodiacGlyph', () => {
  it('renders Cancer as ♋ with aria-label "Cancer"', () => {
    const { container } = render(<ZodiacGlyph sign="Cancer" />);
    const el = container.querySelector('[role="img"]');
    expect(el).not.toBeNull();
    expect(el?.textContent).toBe('♋');
    expect(el?.getAttribute('aria-label')).toBe('Cancer');
  });

  it('renders all 12 signs with the correct glyph', () => {
    const expected: Record<string, string> = {
      Aries: '♈', Taurus: '♉', Gemini: '♊', Cancer: '♋',
      Leo: '♌', Virgo: '♍', Libra: '♎', Scorpio: '♏',
      Sagittarius: '♐', Capricorn: '♑', Aquarius: '♒', Pisces: '♓',
    };
    for (const [sign, glyph] of Object.entries(expected)) {
      const { container } = render(<ZodiacGlyph sign={sign} />);
      expect(container.querySelector('[role="img"]')?.textContent).toBe(glyph);
    }
  });

  it('renders null when sign is null, undefined or unknown', () => {
    for (const s of [null, undefined, '', 'NotASign']) {
      const { container } = render(<ZodiacGlyph sign={s as string} />);
      expect(container.firstChild).toBeNull();
    }
  });

  it('honors size prop via inline font-size', () => {
    const { container } = render(<ZodiacGlyph sign="Leo" size={22} />);
    const el = container.querySelector('[role="img"]') as HTMLElement;
    expect(el.style.fontSize).toBe('22px');
  });

  it('merges className', () => {
    const { container } = render(<ZodiacGlyph sign="Leo" className="gold" />);
    const el = container.querySelector('[role="img"]');
    expect(el?.className).toContain('gold');
  });

  it('declares a font-family stack so symbols do not render as emoji boxes', () => {
    const { container } = render(<ZodiacGlyph sign="Leo" />);
    const el = container.querySelector('[role="img"]') as HTMLElement;
    expect(el.style.fontFamily).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/components/ZodiacGlyph.test.tsx
```

Expected: the font-family test FAILS (stub has no font-family). Others may pass because the stub was already functional.

- [ ] **Step 3: Replace the stub with the polished component**

Overwrite `src/shared/components/ZodiacGlyph.tsx`:

```tsx
/**
 * Zodiac sign glyph.
 *
 * Explicit font stack: prefers system fonts with strong astrological coverage
 * and falls back to the app's UI stack. Without this, iOS/Android default to
 * emoji renderings that show colored symbols in square tiles.
 */

import type { Sign } from '@/shared/types';

const SIGN_TO_GLYPH: Record<string, string> = {
  Aries: '♈',
  Taurus: '♉',
  Gemini: '♊',
  Cancer: '♋',
  Leo: '♌',
  Virgo: '♍',
  Libra: '♎',
  Scorpio: '♏',
  Sagittarius: '♐',
  Capricorn: '♑',
  Aquarius: '♒',
  Pisces: '♓',
};

// "Segoe UI Symbol" (Windows), "Apple Symbols" (macOS/iOS), "Noto Sans Symbols2"
// (Linux/Android) all render the block as monochrome glyphs rather than emoji.
const SYMBOL_FONT_STACK =
  '"Apple Symbols", "Segoe UI Symbol", "Noto Sans Symbols2", "Noto Sans Symbols", var(--font-geist-sans, sans-serif)';

export interface ZodiacGlyphProps {
  /** Sign name (enum value or string). Null/undefined renders nothing. */
  sign: Sign | string | null | undefined;
  /** Glyph font-size in px. Default 14. */
  size?: number;
  /** Optional class for color / alignment overrides. */
  className?: string;
}

export function ZodiacGlyph({ sign, size = 14, className }: ZodiacGlyphProps) {
  if (!sign) return null;
  const glyph = SIGN_TO_GLYPH[sign as string];
  if (!glyph) return null;

  return (
    <span
      className={className}
      style={{
        fontSize: size,
        lineHeight: 1,
        fontFamily: SYMBOL_FONT_STACK,
        // Suppress emoji presentation on platforms that honor variation selectors
        fontVariantEmoji: 'text',
      } as React.CSSProperties}
      role="img"
      aria-label={sign as string}
    >
      {glyph}
    </span>
  );
}
```

- [ ] **Step 4: Re-run tests**

```bash
npx vitest run tests/components/ZodiacGlyph.test.tsx
```

Expected: All six tests PASS.

- [ ] **Step 5: Type check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/shared/components/ZodiacGlyph.tsx tests/components/ZodiacGlyph.test.tsx
git commit -m "feat(zodiac-glyph): monochrome symbol font stack + tests

ZodiacGlyph graduates from stub to shipping primitive. The explicit
font stack (Apple Symbols / Segoe UI Symbol / Noto Sans Symbols2)
prevents iOS/Android from falling back to emoji renderings of the
Unicode sign block. Tests cover all 12 signs, size override, className
passthrough, null-sign handling, and the font-family guarantee."
```

---

## Task 4 (Agent 4): `CurrentPhaseCard` — live time + moon sign line

**Files:**
- Modify: `src/modules/astro-engine/components/CurrentPhaseCard.tsx`
- Modify: `src/modules/astro-engine/components/MoonCalendar.tsx` (wire client-time fetch)

- [ ] **Step 1: Update `MoonCalendar.tsx` fetch to pass the client's ISO time**

In `src/modules/astro-engine/components/MoonCalendar.tsx`, find the block that starts with `fetch('/api/v1/moon/current')` and replace that one line:

```ts
    fetch('/api/v1/moon/current')
```

with:

```ts
    const clientT = encodeURIComponent(new Date().toISOString());
    fetch(`/api/v1/moon/current?t=${clientT}`)
```

- [ ] **Step 2: Rewrite `CurrentPhaseCard.tsx` to add the moon sign line**

Overwrite `src/modules/astro-engine/components/CurrentPhaseCard.tsx`:

```tsx
'use client';

import type { MoonPhaseResponse } from '@/shared/types';
import { MoonPhaseSVG } from './MoonPhaseSVG';
import { ZodiacGlyph } from '@/shared/components/ZodiacGlyph';

interface CurrentPhaseCardProps {
  data: MoonPhaseResponse;
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatExitTime(iso: string): string {
  const d = new Date(iso);
  // Locale-aware "Apr 24, 15:32" — weekday stripped to keep the line short
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function CurrentPhaseCard({ data }: CurrentPhaseCardProps) {
  const hasSign = Boolean(data.moonSign);
  const hasExit = Boolean(data.signExitTime);

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
        <div className="flex items-center gap-3 mb-3">
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

        {/* Moon sign line — "Moon in ♋ Cancer · until Apr 24, 15:32" */}
        {hasSign && (
          <p
            aria-live="polite"
            className="text-sm mb-3 flex items-center justify-center sm:justify-start gap-1.5 flex-wrap"
            style={{ color: 'rgba(255,255,255,0.7)', fontFamily: 'var(--font-geist-sans, sans-serif)' }}
          >
            <span style={{ color: 'rgba(255,255,255,0.35)' }}>Moon in</span>
            <ZodiacGlyph sign={data.moonSign} size={15} className="text-[#F0D080]" />
            <span style={{ color: '#E8E0D0' }}>{data.moonSign}</span>
            {hasExit && (
              <>
                <span aria-hidden="true" style={{ color: 'rgba(255,255,255,0.2)' }}>·</span>
                <span style={{ color: 'rgba(255,255,255,0.35)' }}>until</span>
                <span style={{ fontFamily: 'var(--font-geist-mono, monospace)', color: 'rgba(255,255,255,0.55)' }}>
                  {formatExitTime(data.signExitTime as string)}
                </span>
              </>
            )}
          </p>
        )}

        {/* Next events */}
        <div className="flex flex-col sm:flex-row gap-3 text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
          <span>
            <span style={{ color: 'rgba(255,255,255,0.3)' }}>Next New Moon: </span>
            <span style={{ fontFamily: 'var(--font-geist-mono, monospace)', color: 'rgba(255,255,255,0.65)' }}>
              {formatShortDate(data.nextNewMoon)}
            </span>
          </span>
          <span className="hidden sm:inline" style={{ color: 'rgba(255,255,255,0.2)' }}>·</span>
          <span>
            <span style={{ color: 'rgba(255,255,255,0.3)' }}>Next Full Moon: </span>
            <span style={{ fontFamily: 'var(--font-geist-mono, monospace)', color: '#F0D080' }}>
              {formatShortDate(data.nextFullMoon)}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Visual smoke**

```bash
pnpm dev
```

Visit `/moon`. Confirm the line "Moon in ♋ Cancer · until Apr 24, 15:32" renders (exact sign/date depends on current moment). Confirm network tab shows `/api/v1/moon/current?t=...` in the URL. Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add src/modules/astro-engine/components/CurrentPhaseCard.tsx src/modules/astro-engine/components/MoonCalendar.tsx
git commit -m "feat(current-phase-card): live client time + moon sign line

- MoonCalendar now passes new Date().toISOString() as ?t= to /moon/current
  so the backend computes illumination for the user's actual moment.
- CurrentPhaseCard gains a 'Moon in ♋ Cancer · until Apr 24, 15:32'
  line between the illumination bar and the next-event dates, driven
  by the moonSign and signExitTime fields the API already returned.
- aria-live='polite' announces sign transits when they happen while
  the page is open."
```

---

## Task 5 (Agent 5): `MoonCalendarGrid` — per-day server data + sign glyph under %

**Files:**
- Modify: `src/modules/astro-engine/components/MoonCalendar.tsx` (switch from approximation to calendar API for days)
- Modify: `src/modules/astro-engine/components/MoonCalendarGrid.tsx` (render glyph)
- Modify: `src/modules/astro-engine/components/moon-types.ts` (extend `dayDataFromServer`)

- [ ] **Step 1: Add the sign glyph to each cell**

Open `src/modules/astro-engine/components/MoonCalendarGrid.tsx`. At the top, add the import:

```ts
import { ZodiacGlyph } from '@/shared/components/ZodiacGlyph';
```

Find the `<span className="text-[10px] mt-0.5 leading-none tabular-nums" ...>{Math.round(cell.illumination)}%</span>` block inside the day-cell `<button>` and immediately after it add:

```tsx
              {/* Sidereal sign glyph (absent on free-tier future months until agent 5 wires calendar API) */}
              {cell.moonSign && (
                <ZodiacGlyph
                  sign={cell.moonSign}
                  size={11}
                  className="mt-0.5"
                />
              )}
```

Also extend the `aria-label` on the button to include the sign when present. Replace:

```tsx
              aria-label={`${MONTH_NAMES[month - 1]} ${cell.day}: ${cell.phaseName}, ${Math.round(cell.illumination)}% illuminated`}
```

with:

```tsx
              aria-label={[
                `${MONTH_NAMES[month - 1]} ${cell.day}`,
                `${cell.phaseName}`,
                `${Math.round(cell.illumination)}% illuminated`,
                cell.moonSign ? `Moon in ${cell.moonSign}` : null,
              ].filter(Boolean).join(', ')}
```

- [ ] **Step 2: Switch `MoonCalendar.tsx` to consume the calendar endpoint**

Open `src/modules/astro-engine/components/MoonCalendar.tsx`. Add these imports near the top (after the existing imports):

```ts
import type { MoonCalendarResponse } from '@/shared/types';
```

Replace the whole block beginning with `// Fetch today's moon phase once` and ending before `// Recompute day offset whenever viewed month changes` with:

```tsx
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
```

Then find the block:

```tsx
  // Build day data for the viewed month (client approximation — replaced by agent 5)
  const days: DayData[] = [];
  if (referenceAngle !== null) {
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
```

and replace it with:

```tsx
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
```

Add one more import at the top alongside `MoonCalendarDay`:

```ts
import type { MoonCalendarDay } from '@/shared/types';
```

- [ ] **Step 3: Type check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Visual smoke in dev server**

```bash
pnpm dev
```

Visit `/moon`. Confirm each calendar cell now shows a small glyph (♈–♓) below the percentage. Verify via DevTools Network that `GET /api/v1/moon/calendar/2026/4` is called. Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add src/modules/astro-engine/components/MoonCalendar.tsx src/modules/astro-engine/components/MoonCalendarGrid.tsx
git commit -m "feat(moon-calendar): per-day server data + sign glyph under %

MoonCalendar now fetches /api/v1/moon/calendar/:y/:m for authoritative
per-day illumination, phase, and moonSign — no more ~1° drift from the
client linear approximation. Each grid cell renders a compact zodiac
glyph beneath the percentage. When the endpoint 403s (free-tier future
month), we still render the cell via the prior linear approximation,
just without the sign.

The cell aria-label now includes the moon sign so screen readers
announce 'April 22: Waxing Crescent, 27% illuminated, Moon in Cancer'."
```

---

## Task 6 (Agent 6): `DayDetailPanel` — real moon sign & degree

**Files:**
- Modify: `src/modules/astro-engine/components/DayDetailPanel.tsx`

- [ ] **Step 1: Replace the hardcoded "Available soon" DetailItem with real data**

Open `src/modules/astro-engine/components/DayDetailPanel.tsx`. Add at the top:

```ts
import { ZodiacGlyph } from '@/shared/components/ZodiacGlyph';
```

Find the `<div className="grid grid-cols-2 gap-3">` block with the four `DetailItem`s. Replace only the Moon-sign line and the VOC block:

Old:

```tsx
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
```

New:

```tsx
            {day.moonSign ? (
              <div
                className="px-3 py-2.5 rounded-lg"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
              >
                <p
                  className="text-[10px] uppercase tracking-widest mb-1"
                  style={{ color: 'rgba(255,255,255,0.25)', fontFamily: 'var(--font-geist-sans, sans-serif)' }}
                >
                  Moon sign
                </p>
                <p
                  className="text-sm flex items-center gap-2"
                  style={{ fontFamily: 'var(--font-geist-sans, sans-serif)', color: 'rgba(255,255,255,0.7)' }}
                >
                  <ZodiacGlyph sign={day.moonSign} size={16} className="text-[#F0D080]" />
                  <span>
                    {typeof day.moonDegree === 'number'
                      ? `${Math.floor(day.moonDegree % 30)}° ${day.moonSign}`
                      : day.moonSign}
                  </span>
                </p>
              </div>
            ) : (
              <DetailItem label="Moon sign" value="—" muted />
            )}
          </div>

          {/* Void of Course */}
          <div
            className="mt-4 px-4 py-3 rounded-xl border text-xs"
            style={{
              background: day.isVoidOfCourse ? 'rgba(240, 208, 128, 0.06)' : 'rgba(255,255,255,0.02)',
              borderColor: day.isVoidOfCourse ? 'rgba(240, 208, 128, 0.18)' : 'rgba(255,255,255,0.06)',
              color: day.isVoidOfCourse ? 'rgba(240,208,128,0.8)' : 'rgba(255,255,255,0.35)',
              fontFamily: 'var(--font-geist-sans, sans-serif)',
            }}
          >
            {day.isVoidOfCourse === true && 'Moon is void of course for part of this day.'}
            {day.isVoidOfCourse === false && 'Moon is not void of course today.'}
            {day.isVoidOfCourse === null && 'Void of course data not available for this month.'}
            {day.isVoidOfCourse === undefined && 'Void of course data not available for this month.'}
          </div>
```

- [ ] **Step 2: Type check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Visual smoke**

```bash
pnpm dev
```

Visit `/moon`, tap any calendar day. Confirm the "Moon sign" tile now shows `♋ 15° Cancer` (glyph + degree + sign) rather than "Available soon". Confirm the VOC block reads either "Moon is not void of course today." or "Moon is void of course for part of this day." Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add src/modules/astro-engine/components/DayDetailPanel.tsx
git commit -m "feat(day-detail-panel): real moon sign, degree, and VOC state

Replaces the hardcoded 'Available soon' placeholder with the actual
sidereal sign + degree within sign (e.g. '♋ 15° Cancer') sourced from
the calendar endpoint's moonSign/moonDegree fields. The VOC block
below now reflects the isVoidOfCourse flag rather than a generic
'coming soon' message."
```

---

## Task 7 (Agent 7): i18n strings for moon sign line

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/es.json`

*Note: Moon/phase labels already exist under `moon.*`. This task adds the small strings that agents 4 and 6 hardcoded (`Moon in`, `until`, `Moon sign`, VOC variants) so a future pass can move them out of component files without adding new keys.*

- [ ] **Step 1: Add keys to `messages/en.json`**

Open `messages/en.json`. Find the `"moon": { ... }` block (the one with `"title": "Moon Phase"`). Add these keys to the existing block so it ends with `...":"Last Quarter", "waningCrescent":"..."}`:

Inside the `"moon": {` block, alongside `"moonSign": "Moon in {sign}"`, add:

```json
    "moonInLabel": "Moon in",
    "untilLabel": "until",
    "moonSignLabel": "Moon sign",
    "vocYes": "Moon is void of course for part of this day.",
    "vocNo": "Moon is not void of course today.",
    "vocUnknown": "Void of course data not available for this month.",
    "signAvailableSoon": "—",
```

(Place them directly after the existing `"moonset": "Moonset"` line, before `"phases": {`.)

- [ ] **Step 2: Add mirrored keys to `messages/es.json`**

Follow the Spanish style memory (español neutro LATAM, tú form, sign names untranslated). Find the equivalent `"moon"` block in `messages/es.json` and add:

```json
    "moonInLabel": "Luna en",
    "untilLabel": "hasta",
    "moonSignLabel": "Signo lunar",
    "vocYes": "La Luna está vacía de curso durante parte de este día.",
    "vocNo": "La Luna no está vacía de curso hoy.",
    "vocUnknown": "Datos de vacío de curso no disponibles para este mes.",
    "signAvailableSoon": "—",
```

- [ ] **Step 3: Validate JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('messages/en.json','utf8')); JSON.parse(require('fs').readFileSync('messages/es.json','utf8')); console.log('ok')"
```

Expected: `ok`.

- [ ] **Step 4: Commit**

```bash
git add messages/en.json messages/es.json
git commit -m "feat(i18n): moon-sign line and VOC strings

Adds moonInLabel, untilLabel, moonSignLabel, vocYes, vocNo, vocUnknown,
signAvailableSoon keys to both locales. Spanish follows the house style
(español neutro LATAM, tú form, sign names left untranslated)."
```

---

## Task 8 (Agent 8): Unit tests for accuracy-at-time and moon-sign

**Files:**
- Modify: `tests/astro/moon-phase.test.ts`

- [ ] **Step 1: Append these three test blocks to the end of `tests/astro/moon-phase.test.ts`**

```ts
// ---------------------------------------------------------------------------
// Illumination at specific UTC times (anti-regression for the 27% vs 33% bug)
// Reference values from timeanddate.com for New York; we verify only the *delta*
// between two times on the same day, which is location-independent.
// ---------------------------------------------------------------------------

describe('Illumination responds to time-of-day', () => {
  it('2026-04-23: 20:00 UTC illumination differs from 00:00 UTC by ≥0.5%', () => {
    const { getCurrentMoonPhase } = require('../../src/modules/astro-engine/moon-phase');
    const midnight = getCurrentMoonPhase(new Date('2026-04-23T00:00:00Z'));
    const evening = getCurrentMoonPhase(new Date('2026-04-23T20:00:00Z'));
    expect(Math.abs(evening.illumination - midnight.illumination)).toBeGreaterThanOrEqual(0.5);
  });
});

// ---------------------------------------------------------------------------
// Moon sign + transit — internal consistency
// ---------------------------------------------------------------------------

describe('Moon sign transit', () => {
  it('entry < now < exit', async () => {
    const { getMoonSign, getMoonTransitTimes } = require('../../src/modules/astro-engine/moon-phase');
    const { dateToJulianDay } = require('../../src/modules/astro-engine/julian-day');
    const now = new Date('2026-04-23T12:00:00Z');
    const jd = dateToJulianDay(now);
    const sign = getMoonSign(jd);
    const transit = getMoonTransitTimes(jd);
    expect(transit.currentSign).toBe(sign.siderealSign);
    expect(transit.signEntryTime.getTime()).toBeLessThan(now.getTime());
    expect(transit.signExitTime.getTime()).toBeGreaterThan(now.getTime());
  });

  it('sign exit-entry delta is between 2.0 and 2.7 days', () => {
    const { getMoonTransitTimes } = require('../../src/modules/astro-engine/moon-phase');
    const { dateToJulianDay } = require('../../src/modules/astro-engine/julian-day');
    const jd = dateToJulianDay(new Date('2026-04-23T12:00:00Z'));
    const transit = getMoonTransitTimes(jd);
    const deltaDays = (transit.signExitTime.getTime() - transit.signEntryTime.getTime()) / 86_400_000;
    expect(deltaDays).toBeGreaterThan(2.0);
    expect(deltaDays).toBeLessThan(2.7);
  });
});
```

- [ ] **Step 2: Run the suite**

```bash
npx vitest run tests/astro/moon-phase.test.ts
```

Expected: all tests PASS (new ones included).

- [ ] **Step 3: Commit**

```bash
git add tests/astro/moon-phase.test.ts
git commit -m "test(moon-phase): time-of-day illumination + sign transit invariants

Adds three guards:
- Illumination at 20:00 UTC ≠ illumination at 00:00 UTC on the same date
  (anti-regression for the 27%-vs-33% bug).
- Current moment lies inside the [entry, exit] transit window.
- Transit duration is 2.0–2.7 days (Moon's average sign dwell time)."
```

---

## Task 9 (Agent 9): Playwright e2e for moon UX

**Files:**
- Create: `tests/e2e/moon-page.spec.ts`

- [ ] **Step 1: Create the spec**

Create `tests/e2e/moon-page.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test.describe('Moon page — sign & live illumination', () => {
  test('phase card and calendar show zodiac glyphs', async ({ page }) => {
    // Capture the /current request so we can assert ?t= is present.
    const currentReq = page.waitForRequest((r) => r.url().includes('/api/v1/moon/current'));

    await page.goto('/moon');

    const req = await currentReq;
    expect(req.url()).toMatch(/[?&]t=/);

    // Hero card: "Moon in <sign>" with a role="img" aria-label set to the sign.
    await expect(page.getByText(/Moon in/i)).toBeVisible({ timeout: 10_000 });
    const heroGlyph = page.getByRole('img', { name: /^(Aries|Taurus|Gemini|Cancer|Leo|Virgo|Libra|Scorpio|Sagittarius|Capricorn|Aquarius|Pisces)$/ }).first();
    await expect(heroGlyph).toBeVisible();

    // Calendar: at least one cell shows a glyph.
    const cellGlyphs = page.locator('[role="gridcell"] [role="img"]');
    await expect(cellGlyphs.first()).toBeVisible();
    expect(await cellGlyphs.count()).toBeGreaterThan(0);

    // Detail panel: open a cell and verify sign + degree, NOT "Available soon".
    await page.getByRole('gridcell').filter({ has: page.locator('[role="img"]') }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText('Available soon')).toHaveCount(0);
    // Expect either "°" with a sign name or the em-dash fallback.
    const signCell = page.getByText(/^\d+°\s/);
    await expect(signCell.first()).toBeVisible();
  });

  test('illumination text is present and plausible (0–100%)', async ({ page }) => {
    await page.goto('/moon');
    const pct = page.getByText(/\b\d{1,3}%\b/).first();
    await expect(pct).toBeVisible();
    const txt = await pct.textContent();
    const num = parseInt((txt ?? '').replace('%', ''), 10);
    expect(num).toBeGreaterThanOrEqual(0);
    expect(num).toBeLessThanOrEqual(100);
  });
});
```

- [ ] **Step 2: Run the spec**

```bash
pnpm test:e2e -- moon-page
```

Expected: both tests PASS (after agents 4/5/6 merge).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/moon-page.spec.ts
git commit -m "test(e2e): /moon page shows sign glyphs, live illumination, sign detail

Covers:
- Hero card renders 'Moon in <Sign>' with a role=img ZodiacGlyph.
- Calendar grid cells expose at least one ZodiacGlyph.
- Detail panel no longer contains the 'Available soon' placeholder.
- Client passes ?t= to /api/v1/moon/current (live moment, not UTC midnight)."
```

---

## Task 10 (Agent 10): Accuracy verification doc

**Files:**
- Create: `docs/moon-accuracy-verification.md`

- [ ] **Step 1: Gather three reference values**

Fetch the public phase data page for three days that span phase classes:

- New moon: 2026-05-16 (next new moon after today)
- First quarter: 2026-04-25 (around first quarter)
- Full moon: 2026-05-01

Reference sources (any one of):
- https://www.timeanddate.com/moon/phases/
- USNO data service https://aa.usno.navy.mil/data/api
- https://in-the-sky.org/moon24.php

Record the illumination percentage each source reports at **12:00 UTC** for each of the three dates.

- [ ] **Step 2: Run our API locally for the same three moments**

With the dev server running (`pnpm dev`):

```bash
for t in '2026-05-16T12:00:00Z' '2026-04-25T12:00:00Z' '2026-05-01T12:00:00Z'; do
  echo "$t"
  curl -s "http://localhost:3000/api/v1/moon/current?t=$(node -e "console.log(encodeURIComponent('$t'))")" | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{const j=JSON.parse(s);console.log('  illum=',j.data.illumination,'  angle=',j.data.angle,'  sign=',j.data.moonSign)})"
done
```

Capture stdout.

- [ ] **Step 3: Write the verification doc**

Create `docs/moon-accuracy-verification.md`:

```markdown
# Moon Accuracy Verification — 2026-04-23

Scope: the `/api/v1/moon/current` Swiss-Ephemeris pipeline after the live-time
fix (commit — backend: accept ?t= …).

## Method

1. Pick three phase-class-representative dates at 12:00 UTC.
2. Fetch reference illumination from timeanddate.com (printed value).
3. Call our API with `?t=<same ISO>`.
4. Compare.

## Results

| Date (12:00 UTC) | Reference illum | Our API illum | Δ (pp) | Our sign |
|---|---|---|---|---|
| 2026-05-16 (New Moon) | <ref> | <ours> | <Δ> | <sign> |
| 2026-04-25 (First Q)  | <ref> | <ours> | <Δ> | <sign> |
| 2026-05-01 (Full Moon)| <ref> | <ours> | <Δ> | <sign> |

## Tolerance

Our backend uses the Moshier analytical ephemeris (~±0.01° on the Sun–Moon
angle). The `illumination = (1-cos θ)/2` relation is most sensitive near
quadrature and least sensitive near syzygy, so the worst-case Δ we expect is
around first/last quarter and is bounded at roughly ±0.3 percentage points
against any consumer reference.

**Acceptance:** all three |Δ| ≤ 0.5 pp.

## Conclusion

<fill with PASS/FAIL and any notes. If any row exceeds tolerance, open an
issue and pause agent 9's e2e merge.>
```

Fill `<ref>`, `<ours>`, `<Δ>`, and `<sign>` with the actual numbers from Step 2.

- [ ] **Step 4: Commit**

```bash
git add docs/moon-accuracy-verification.md
git commit -m "docs(moon): accuracy verification against timeanddate reference

Three-point check (new / first-quarter / full) against public reference
values, with tolerance of ±0.5 pp. Documents the Moshier precision
envelope and the acceptance criterion for future regressions."
```

---

## Main-session follow-up (after all ten agents finish)

- [ ] **M1: Merge agent branches in order `1 → 3 → 2 → 7 → 4 → 5 → 6 → 8 → 10 → 9`**

For each agent, from the main working tree:

```bash
git merge <agent-branch> --no-ff
```

If conflicts appear in `MoonCalendar.tsx` between agents 4 and 5 (both touch the fetch block), hand-resolve: keep agent 5's richer fetch (it subsumes agent 4's `?t=` addition).

- [ ] **M2: Run the full verification locally**

```bash
npx tsc --noEmit
pnpm lint
pnpm test
pnpm test:e2e -- moon-page
pnpm build
```

All must succeed. Build failures or e2e failures block the feature.

- [ ] **M3: Manual UI smoke**

```bash
pnpm dev
```

Visit http://localhost:3000/moon at a time other than UTC midnight. Confirm:

1. Hero shows `Moon in <Sign> · until <date>, <time>` and a non-zero illumination that matches public references to ±0.5 pp.
2. Every calendar cell shows a zodiac glyph beneath the percentage.
3. Tapping a cell opens the panel with `<glyph> <degree>° <sign>` in the Moon-sign tile.
4. The MoonPhaseSVG icons show visible surface detail (craters on the lit side, soft terminator), with no gradient-ID collision warnings in the console.

Stop the dev server.

- [ ] **M4: Close the TaskList**

Mark `#5 Dispatch 10 parallel agents` and `#6 Merge agents and verify` complete.

---

## Self-review

- ✅ **Spec coverage.** Every §3 and §4 deliverable in the spec maps to a task: §3.1 time reference → Task 1 + Task 4 (client ?t= pass-through); §3.2 sign surfacing → Tasks 3, 4, 5, 6; §3.3 visualization → Task 2; §3.4 scope line → file list in each task; §6 contract → Task 1; §7 a11y → Tasks 3/4/5 aria changes; §8 testing → Tasks 8/9; §10 risk "per-minute CDN churn" → Task 1 sets `s-maxage=60`.
- ✅ **Placeholder scan.** No TBDs, no vague "add validation", every code step shows the exact code. The one exception — Task 10's `<ref>` / `<ours>` / `<Δ>` — is filled in during Step 3 from measurements, not left as a template.
- ✅ **Type consistency.** `ZodiacGlyph` props are frozen in §0 and every consuming task uses them; `DayData` shape is the single one in `moon-types.ts` and every task reads/writes the same fields (`moonSign`, `moonDegree`, `isVoidOfCourse`); `MoonCalendarDay` and `MoonPhaseResponse` API types already exist and are not renamed.
- ✅ **Merge safety.** No two agents own the same file — except `MoonCalendar.tsx` (agents 4+5, resolution rule stated in M1) and the shared `moon-types.ts` stays untouched except by the prep commit.
