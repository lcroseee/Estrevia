# SP-B · Zodiac Frame in Synastry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Carry the sidereal/tropical toggle into `/synastry`, so a user who switched frames on `/chart` does not find the compatibility page silently contradicting it.

**Architecture:** No new primitives. The server widens `ChartSummary` with the tropical sign names — derived from `projectChart`, no second ephemeris call — and `SynastryResult` renders the same `ZodiacFrameToggle` from SP-A, reading the same `?z` parameter and `localStorage` key. **Compatibility scores and the aspect list must not move**: angular separation is invariant under the ayanamsa offset, so they are identical in both frames.

**Tech Stack:** TypeScript 6 (strict), React 19, Next.js 16 API routes, next-intl, vitest.

**Spec:** `docs/superpowers/specs/2026-08-04-sp-b-synastry-zodiac-frame-design.md`
**Depends on:** SP-0 (frame correctness) and SP-A (`projectChart`, `ZodiacFrameToggle`, the `?z`/`localStorage` convention). Independent of SP-C.

## Global Constraints

- **i18n:** all copy through `next-intl`, EN + ES. Spanish = español neutro LATAM, `tú`. **Sign names stay untranslated.**
- PII = birth date/time/location — never in URLs, error messages, or client state. Names in `ChartSummary` are user-entered labels, not PII under this project's definition, and are already returned today; this plan does not add any new personal field.
- Zero failing tests / zero type errors. Payment and auth paths untouched here.
- `npm run lint`: filter `.claude/worktrees/` before reading the count.
- **Never `git add -A`.** Stage only named files.
- Commit scope: `feat(astro-engine/SP-B): ...`.

## File Structure

| File | Responsibility |
|---|---|
| `src/app/api/v1/synastry/calculate/route.ts` | **The only server file that changes.** Adds tropical sign names to both summaries |
| `src/modules/astro-engine/components/SynastryClient.tsx` | `ChartSummary` type widened additively |
| `src/modules/astro-engine/components/SynastryResult.tsx` | Toggle + frame-aware sign labels + the invariance note |
| `messages/en.json`, `messages/es.json` | `synastry.zodiacFrame.*` keys |

### A bound worth stating before starting

`SynastryResult` renders exactly **four** frame-sensitive strings — the Sun and Moon labels for each person (`SynastryResult.tsx:185-191`). There is no synastry wheel, and the inter-chart aspect list shows planet pairs and orbs with no signs at all. That is the entire visible deliverable. It is still worth building: a user toggled to tropical on `/chart` who opens `/synastry` and sees sidereal Sun signs experiences it as a bug, not as a scope boundary.

The GET route `src/app/api/v1/synastry/[id]/route.ts` returns only `id`, `overallScore`, `categoryScores` and `createdAt` — **it carries no summaries at all**, so there is nothing to widen there. A synastry result opened from its permalink has no sign labels to toggle. That is pre-existing behaviour and this plan does not change it.

---

### Task 1: Widen `ChartSummary` at the source

**Files:**
- Modify: `src/app/api/v1/synastry/calculate/route.ts:182-193`
- Modify: `src/modules/astro-engine/components/SynastryClient.tsx:15-20`
- Test: `src/app/api/v1/synastry/calculate/__tests__/summary-frames.test.ts`

**Interfaces:**
- Consumes: `projectChart(chart, 'tropical')` from `@/modules/astro-engine/zodiac-frame` (SP-A Task 1).
- Produces: `ChartSummary` gains `tropicalSunSign`, `tropicalMoonSign`, `tropicalAscendant`, all `string | null`. **Additive** — existing consumers compile unchanged.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/v1/synastry/calculate/__tests__/summary-frames.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { calculateChart } from '@/modules/astro-engine/chart';
import { projectChart } from '@/modules/astro-engine/zodiac-frame';
import { HouseSystem, Planet } from '@/shared/types/astrology';
import { buildChartSummary } from '../summary';

// Synthetic birth data — no real person, no PII.
const chart = calculateChart({
  date: '1990-06-15',
  time: '14:30',
  latitude: 40.7128,
  longitude: -74.006,
  timezone: 'America/New_York',
  houseSystem: HouseSystem.Placidus,
});

describe('buildChartSummary', () => {
  it('keeps the existing sidereal fields unchanged', () => {
    const s = buildChartSummary(chart, 'Alex');
    expect(s.sunSign).toBe(chart.planets.find((p) => p.planet === Planet.Sun)!.sign);
    expect(s.moonSign).toBe(chart.planets.find((p) => p.planet === Planet.Moon)!.sign);
    expect(s.ascendant).toBe(chart.ascendant!.sign);
    expect(s.name).toBe('Alex');
  });

  it('adds the tropical sign names', () => {
    const trop = projectChart(chart, 'tropical');
    const s = buildChartSummary(chart, null);
    expect(s.tropicalSunSign).toBe(trop.planets.find((p) => p.planet === Planet.Sun)!.sign);
    expect(s.tropicalMoonSign).toBe(trop.planets.find((p) => p.planet === Planet.Moon)!.sign);
    expect(s.tropicalAscendant).toBe(trop.ascendant!.sign);
  });

  it('differs between frames for this chart, proving the projection ran', () => {
    const s = buildChartSummary(chart, null);
    expect(s.tropicalSunSign).not.toBe(s.sunSign);
  });

  it('returns nulls rather than throwing when there is no birth time', () => {
    const noTime = calculateChart({
      date: '1990-06-15', time: null, latitude: 40.7128, longitude: -74.006,
      timezone: 'America/New_York', houseSystem: HouseSystem.Placidus,
    });
    const s = buildChartSummary(noTime, null);
    expect(s.ascendant).toBeNull();
    expect(s.tropicalAscendant).toBeNull();
    expect(s.sunSign).not.toBeNull();
    expect(s.tropicalSunSign).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/app/api/v1/synastry/calculate/__tests__/summary-frames.test.ts`

Expected: FAIL — `Cannot find module '../summary'`.

- [ ] **Step 3: Extract the summary builder**

The route currently inlines two near-identical object literals. Extracting them makes the projection testable without standing up the whole route, and removes the copy-paste.

Create `src/app/api/v1/synastry/calculate/summary.ts`:

```ts
import { projectChart } from '@/modules/astro-engine/zodiac-frame';
import { Planet, type ChartResult } from '@/shared/types/astrology';

export interface ChartSummary {
  sunSign: string | null;
  moonSign: string | null;
  ascendant: string | null;
  /** Tropical counterparts. Additive — older clients simply ignore them. */
  tropicalSunSign: string | null;
  tropicalMoonSign: string | null;
  tropicalAscendant: string | null;
  name: string | null;
}

const signOf = (chart: ChartResult, planet: Planet): string | null =>
  chart.planets.find((p) => p.planet === planet)?.sign ?? null;

/**
 * Build the per-person summary strip shown above the compatibility score.
 *
 * Both frames come from one calculateChart() result: projectChart is pure
 * arithmetic over a constant offset, so there is no second ephemeris call and
 * no measurable cost to always including the tropical labels.
 */
export function buildChartSummary(chart: ChartResult, name: string | null): ChartSummary {
  const tropical = projectChart(chart, 'tropical');
  return {
    sunSign: signOf(chart, Planet.Sun),
    moonSign: signOf(chart, Planet.Moon),
    ascendant: chart.ascendant?.sign ?? null,
    tropicalSunSign: signOf(tropical, Planet.Sun),
    tropicalMoonSign: signOf(tropical, Planet.Moon),
    tropicalAscendant: tropical.ascendant?.sign ?? null,
    name,
  };
}
```

- [ ] **Step 4: Use it in the route**

In `src/app/api/v1/synastry/calculate/route.ts`, replace:

```ts
  const chart1Summary = {
    sunSign: chart1.planets.find((p) => p.planet === 'Sun')?.sign ?? null,
    moonSign: chart1.planets.find((p) => p.planet === 'Moon')?.sign ?? null,
    ascendant: chart1.ascendant?.sign ?? null,
    name: body.birthData1.name ?? null,
  };
  const chart2Summary = {
    sunSign: chart2.planets.find((p) => p.planet === 'Sun')?.sign ?? null,
    moonSign: chart2.planets.find((p) => p.planet === 'Moon')?.sign ?? null,
    ascendant: chart2.ascendant?.sign ?? null,
    name: body.birthData2.name ?? null,
  };
```

with:

```ts
  const chart1Summary = buildChartSummary(chart1, body.birthData1.name ?? null);
  const chart2Summary = buildChartSummary(chart2, body.birthData2.name ?? null);
```

and add `import { buildChartSummary } from './summary';`.

- [ ] **Step 5: Widen the client type**

In `src/modules/astro-engine/components/SynastryClient.tsx`, replace the local `ChartSummary` interface with a re-export so there is one definition rather than two that can drift:

```ts
import type { ChartSummary } from '@/app/api/v1/synastry/calculate/summary';
```

Delete the local `interface ChartSummary { ... }` block. If the import direction is disallowed by the module boundary rules (`src/modules/` must not depend on `src/app/`), instead move the interface to `src/shared/types/synastry.ts` and import it from both sides. **Check `CLAUDE.md`'s module rule and follow whichever direction it permits** — do not create a cross-module dependency to save one file.

- [ ] **Step 6: Run the tests and typecheck**

```bash
npx vitest run src/app/api/v1/synastry/
npm run typecheck
```

Expected: PASS, zero type errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/v1/synastry/calculate/summary.ts \
        src/app/api/v1/synastry/calculate/route.ts \
        src/app/api/v1/synastry/calculate/__tests__/summary-frames.test.ts \
        src/modules/astro-engine/components/SynastryClient.tsx
git commit -m "feat(astro-engine/SP-B): return tropical sign names in the synastry summaries"
```

---

### Task 2: i18n strings

**Files:**
- Modify: `messages/en.json`, `messages/es.json`

- [ ] **Step 1: English**

Inside the existing top-level `"synastry"` object:

```json
"zodiacFrame": {
  "invariantNote": "The aspects and the compatibility score are the same in both systems — both zodiacs shift by the same amount, so the angles between planets never change.",
  "siderealTag": "Sidereal",
  "tropicalTag": "Tropical"
}
```

- [ ] **Step 2: Spanish**

```json
"zodiacFrame": {
  "invariantNote": "Los aspectos y el puntaje de compatibilidad son los mismos en ambos sistemas: los dos zodiacos se desplazan la misma cantidad, así que los ángulos entre planetas no cambian.",
  "siderealTag": "Sideral",
  "tropicalTag": "Tropical"
}
```

- [ ] **Step 3: Verify key parity**

```bash
node -e "
const en=require('./messages/en.json'), es=require('./messages/es.json');
const a=Object.keys(en.synastry.zodiacFrame).sort(), b=Object.keys(es.synastry.zodiacFrame).sort();
console.log(JSON.stringify(a)===JSON.stringify(b)?'KEYS MATCH':'MISMATCH');
"
```

- [ ] **Step 4: Commit**

```bash
git add messages/en.json messages/es.json
git commit -m "feat(astro-engine/SP-B): add synastry zodiac-frame strings"
```

---

### Task 3: The toggle in `SynastryResult`

**Files:**
- Modify: `src/modules/astro-engine/components/SynastryResult.tsx`
- Test: `src/modules/astro-engine/components/__tests__/SynastryResult.frame.test.tsx`

**Interfaces:**
- Consumes: `ZodiacFrameToggle`, `FrameState` (SP-A Task 3); widened `ChartSummary` (Task 1); strings (Task 2).

- [ ] **Step 1: Write the failing test — the invariance assertion is the important one**

Create `src/modules/astro-engine/components/__tests__/SynastryResult.frame.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { SynastryResult } from '../SynastryResult';
import en from '../../../../../messages/en.json';

const summary1 = {
  sunSign: 'Gemini', moonSign: 'Aquarius', ascendant: 'Virgo',
  tropicalSunSign: 'Cancer', tropicalMoonSign: 'Pisces', tropicalAscendant: 'Libra',
  name: 'A',
};
const summary2 = {
  sunSign: 'Leo', moonSign: 'Taurus', ascendant: 'Scorpio',
  tropicalSunSign: 'Virgo', tropicalMoonSign: 'Gemini', tropicalAscendant: 'Sagittarius',
  name: 'B',
};

// Minimal props — extend with whatever SynastryResult actually requires;
// read the component's props interface before filling this in.
const baseProps = {
  chart1Summary: summary1,
  chart2Summary: summary2,
} as const;

const wrap = (ui: React.ReactNode) => (
  <NextIntlClientProvider locale="en" messages={en}>{ui}</NextIntlClientProvider>
);

describe('SynastryResult zodiac frames', () => {
  it('shows sidereal Sun signs by default', () => {
    render(wrap(<SynastryResult {...(baseProps as never)} />));
    expect(screen.getByText(/Gemini/)).toBeInTheDocument();
  });

  it('shows tropical Sun signs after one press', async () => {
    render(wrap(<SynastryResult {...(baseProps as never)} />));
    await userEvent.click(screen.getByRole('button', { name: /Zodiac/ }));
    expect(screen.getByText(/Cancer/)).toBeInTheDocument();
  });

  it('leaves the compatibility score untouched across all three states', async () => {
    // The invariant this whole sub-project rests on. Angular separation does
    // not change under a constant offset, so a moving score is a bug.
    const { container } = render(wrap(<SynastryResult {...(baseProps as never)} />));
    const scoreText = () => container.querySelector('[data-testid="overall-score"]')?.textContent;
    const before = scoreText();
    const btn = screen.getByRole('button', { name: /Zodiac/ });
    await userEvent.click(btn);
    expect(scoreText()).toBe(before);
    await userEvent.click(btn);
    expect(scoreText()).toBe(before);
    await userEvent.click(btn);
    expect(scoreText()).toBe(before);
  });

  it('explains in both mode why the score did not move', async () => {
    render(wrap(<SynastryResult {...(baseProps as never)} />));
    const btn = screen.getByRole('button', { name: /Zodiac/ });
    await userEvent.click(btn);
    await userEvent.click(btn);
    expect(screen.getByText(en.synastry.zodiacFrame.invariantNote)).toBeInTheDocument();
  });
});
```

**Before running this**, read `SynastryResult`'s props interface and fill `baseProps` with real values — scores, aspects and labels. Add `data-testid="overall-score"` to the score element if it does not have a stable selector. Do not weaken the score assertion.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/modules/astro-engine/components/__tests__/SynastryResult.frame.test.tsx`

Expected: FAIL — no toggle rendered.

- [ ] **Step 3: Add frame state**

In `SynastryResult.tsx`:

```tsx
import { ZodiacFrameToggle, type FrameState } from './ZodiacFrameToggle';
import { useTranslations } from 'next-intl';
import { trackEvent, AnalyticsEvent } from '@/shared/lib/analytics';

const FRAME_STORAGE_KEY = 'estrevia.zodiacFrame';
```

Inside the component, hydrating from the same key SP-A writes so a choice made on `/chart` carries over:

```tsx
  const t = useTranslations('synastry.zodiacFrame');
  const [frame, setFrame] = useState<FrameState>(() => {
    if (typeof window === 'undefined') return 'sidereal';
    const params = new URLSearchParams(window.location.search);
    const fromUrl = { sid: 'sidereal', trop: 'tropical', both: 'both' }[params.get('z') ?? ''];
    if (fromUrl) return fromUrl as FrameState;
    const stored = window.localStorage.getItem(FRAME_STORAGE_KEY);
    return stored === 'tropical' || stored === 'both' ? stored : 'sidereal';
  });

  const handleFrameChange = useCallback((next: FrameState) => {
    setFrame((prev) => {
      trackEvent(AnalyticsEvent.ZODIAC_FRAME_CHANGED, {
        from: prev, to: next, surface: 'synastry',
      });
      return next;
    });
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(FRAME_STORAGE_KEY, next);
    }
  }, []);
```

Note `surface: 'synastry'` — SP-A sends `'chart'`. That property is what makes the event answer "does anyone use this outside the chart page".

- [ ] **Step 4: Render frame-aware labels**

Add a helper above the component:

```tsx
/**
 * Sign labels for one person in the active frame.
 *
 * In `both` the two are shown as a pair — `Gemini / Cancer` — matching the
 * delta-column presentation in SP-A's PositionTable rather than inventing a
 * third treatment.
 */
function frameLabels(s: ChartSummary, frame: FrameState) {
  if (frame === 'tropical') {
    return { sun: s.tropicalSunSign, moon: s.tropicalMoonSign };
  }
  if (frame === 'both') {
    return {
      sun: s.sunSign && s.tropicalSunSign ? `${s.sunSign} / ${s.tropicalSunSign}` : s.sunSign,
      moon: s.moonSign && s.tropicalMoonSign ? `${s.moonSign} / ${s.tropicalMoonSign}` : s.moonSign,
    };
  }
  return { sun: s.sunSign, moon: s.moonSign };
}
```

Then replace the summary strip (`SynastryResult.tsx:183-193`) so each `chart1Summary.sunSign` reads from `frameLabels(chart1Summary, frame).sun`, and likewise for moon and person 2. Render `<ZodiacFrameToggle value={frame} onChange={handleFrameChange} />` above the strip.

- [ ] **Step 5: Add the invariance note**

Under the aspect list, rendered only when `frame === 'both'`:

```tsx
        {frame === 'both' && (
          <p className="mt-4 text-xs leading-relaxed text-white/45">
            {t('invariantNote')}
          </p>
        )}
```

Without it, a user who sees the sign labels change while the score holds reads that as a bug. This is the cheapest possible defence of a correct-but-surprising result.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/modules/astro-engine/components/`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/modules/astro-engine/components/SynastryResult.tsx \
        src/modules/astro-engine/components/__tests__/SynastryResult.frame.test.tsx
git commit -m "feat(astro-engine/SP-B): add the zodiac frame toggle to synastry results"
```

---

### Task 4: Confirm the AI prompt needs no change

**Files:** none modified. This task is a verification, and it exists so the next reader does not "fix" a prompt that is already correct.

- [ ] **Step 1: Read the prompt**

Run: `grep -n "sidereal\|Lahiri" src/app/api/v1/synastry/\[id\]/analyze/route.ts`

Confirm the prompt says it is using sidereal astrology (Lahiri ayanamsa), and that the material it feeds the model is **aspects** — planet pairs, types and orbs.

- [ ] **Step 2: State the conclusion in a comment**

Add above the prompt builder:

```ts
// Deliberately frame-agnostic: this prompt is built from aspects, and angular
// separation is invariant under the ayanamsa offset — the same aspects hold in
// both zodiacs. The sidereal framing in the text stays accurate whatever the
// reader has the toggle set to. See SP-B.
```

- [ ] **Step 3: Commit**

```bash
git add 'src/app/api/v1/synastry/[id]/analyze/route.ts'
git commit -m "docs(astro-engine/SP-B): record why the synastry prompt is frame-agnostic"
```

---

### Task 5: Full verification

- [ ] **Step 1: Run everything**

```bash
npm test
npm run typecheck
npm run lint 2>&1 | grep -v '.claude/worktrees/'
```

- [ ] **Step 2: Cross-page carry-over**

Run `npm run dev`. Toggle to Tropical on `/chart`, navigate to `/synastry`, run a comparison. Confirm the Sun signs render tropical on first paint without touching the toggle.

- [ ] **Step 3: The score must not move**

With one synastry result open, cycle all three states and confirm the overall score and every category score are **byte-identical**. Then confirm the aspect list is unchanged. If either moves, stop — something frame-sensitive leaked into scoring, which contradicts the invariant this sub-project rests on.

- [ ] **Step 4: Both locales**

Repeat on `/es/synastry` and confirm the invariance note reads as natural español neutro LATAM with `tú`, and that sign names are still in English.

---

## Self-Review

**Spec coverage:** §1 widen `ChartSummary` → Task 1 (including the spec's note that exactly one server file changes; the extracted `summary.ts` is a second file but the route is the only *call site* touched). §2 toggle in `SynastryResult` → Task 3. §3 the invariance line → Task 3 Step 5. §4 prompt unchanged → Task 4. Test list → Tasks 1, 3, 5.

**Placeholders:** Task 3 Step 1 requires reading `SynastryResult`'s props before filling `baseProps`, and requires adding a stable test selector for the score. Both are stated explicitly with the reason, rather than left as "add appropriate props".

**Type consistency:** `ChartSummary` gains exactly `tropicalSunSign`, `tropicalMoonSign`, `tropicalAscendant` in Task 1 and is read under those names in Task 3's `frameLabels`. `FrameState` is SP-A's three-value type; `projectChart` receives only `'tropical'` here, never `'both'`.
