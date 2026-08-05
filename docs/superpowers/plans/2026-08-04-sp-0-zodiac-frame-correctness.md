# SP-0 · Zodiac Frame Correctness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store house cusps in the same zodiac frame as the planets, so planetary house assignments, the wheel's cusp lines and the paid AI reading stop contradicting each other.

**Architecture:** `houses.ts` becomes pure Swiss Ephemeris geometry returning an explicitly-named tropical type. `chart.ts` — which already owns the ayanamsa and already converts planets and angles — performs the cusp projection and assembles the public `HouseCusp`. The field `degree` is *renamed* to `siderealDegree` so the TypeScript compiler surfaces every reader instead of silently changing their meaning.

**Tech Stack:** TypeScript 6 (strict), vitest, `sweph`, Drizzle ORM + Neon Postgres, Next.js 16.

**Spec:** `docs/superpowers/specs/2026-08-04-zodiac-frame-correctness-design.md`

## Global Constraints

- Lahiri ayanamsa only; Placidus houses only; 12 bodies. Verify against `tests/fixtures/` at ±0.01°.
- PII = birth date/time/location. Never log decrypted PII; never put it in URLs, error messages, or client state. Test fixtures use **synthetic data only**.
- Secrets via `process.env` only; never hardcode.
- Zero failing tests / zero type errors policy.
- `npm run lint` reports 5500+ pre-existing errors from stale copies under `.claude/worktrees/` — filter that directory out before reading the count.
- Two test *files* under `tests/baselines/*.spec.ts` error under vitest (they are Playwright specs; `vitest.config.ts` excludes only `tests/e2e/**`). Pre-existing and unrelated — do not fix here, do not count as a regression.
- Commit style: conventional scopes as used in the repo, e.g. `fix(astro-engine/SP-0): ...`.
- **Never `git add -A`.** The working tree holds ~29 untracked audit artifacts that carry customer PII. Stage only the files named in each step.

## File Structure

| File | Responsibility after this plan |
|---|---|
| `src/shared/types/astrology.ts` | `HouseCusp` carries both frames explicitly |
| `src/modules/astro-engine/houses.ts` | Pure sweph geometry; returns `TropicalCusp[]`; knows nothing about signs |
| `src/modules/astro-engine/chart.ts` | Sole place that decides the frame; projects cusps and assembles `HouseCusp[]` |
| `src/modules/astro-engine/planet-in-house.ts` | Reads `siderealDegree` |
| `src/modules/astro-engine/components/ChartWheel.tsx` | Draws cusp lines from `siderealDegree` |
| `src/modules/astro-engine/components/PositionTable.tsx` | Broken tropical toggle deleted |
| `src/modules/astro-engine/lib/chart-interpretation-prompt.ts` | Ascendant from `chart.ascendant`; cusp signs from `cusp.sign` |
| `tests/astro/frame-consistency.test.ts` | **New.** The invariant whose absence allowed the bug |
| `tests/astro/houses.test.ts` | Updated field name; sign assertions relocated |
| `scripts/backfill-house-frame-2026-08-04.mjs` | **New.** Rewrites persisted `chart_data` |
| `scripts/invalidate-stale-readings-2026-08-04.mjs` | **New.** Drops readings built on wrong houses |

---

### Task 1: The failing invariant test

This task exists first and alone because it is the test whose absence allowed the bug to ship. It must fail against current `main`.

**Files:**
- Create: `tests/astro/frame-consistency.test.ts`

**Interfaces:**
- Consumes: `calculateChart(input: ChartInput): ChartResult` from `@/modules/astro-engine/chart`; `getPlanetHouse(planetDegree: number, cusps: HouseCusp[]): number` from `@/modules/astro-engine/planet-in-house`.
- Produces: nothing consumed by later tasks — it is a gate.

- [ ] **Step 1: Write the failing test**

Create `tests/astro/frame-consistency.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { calculateChart } from '@/modules/astro-engine/chart';
import { getPlanetHouse } from '@/modules/astro-engine/planet-in-house';
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

describe('zodiac frame consistency', () => {
  it('places the Ascendant exactly on the 1st house cusp', () => {
    const chart = calculateChart({ ...PROBE });
    expect(chart.houses).not.toBeNull();
    expect(chart.ascendant).not.toBeNull();
    expect(chart.houses![0]!.siderealDegree).toBeCloseTo(
      chart.ascendant!.absoluteDegree,
      6,
    );
  });

  it('gives the Ascendant and the 1st house cusp the same sign', () => {
    const chart = calculateChart({ ...PROBE });
    expect(chart.houses![0]!.sign).toBe(chart.ascendant!.sign);
  });

  it('places the Midheaven exactly on the 10th house cusp', () => {
    const chart = calculateChart({ ...PROBE });
    const c10 = chart.houses!.find((c) => c.house === 10)!;
    expect(c10.siderealDegree).toBeCloseTo(chart.midheaven!.absoluteDegree, 6);
  });

  it('assigns the same house number in either frame', () => {
    // Both frames differ by a single constant (the ayanamsa), so a planet's
    // house number must be invariant: shifting planet AND cusps by the same
    // amount cannot move a planet across a boundary. This is the assertion
    // whose absence let tropical cusps sit beside sidereal planets.
    const chart = calculateChart({ ...PROBE });
    const tropicalCusps = chart.houses!.map((c) => ({
      ...c,
      siderealDegree: c.tropicalDegree,
    }));

    for (const p of chart.planets) {
      const inSidereal = getPlanetHouse(p.absoluteDegree, chart.houses!);
      const inTropical = getPlanetHouse(p.tropicalDegree, tropicalCusps);
      expect(inTropical, `${p.planet} disagrees across frames`).toBe(inSidereal);
    }
  });

  it('stores each cusp in both frames, separated by the ayanamsa', () => {
    const chart = calculateChart({ ...PROBE });
    for (const cusp of chart.houses!) {
      const delta =
        ((cusp.tropicalDegree - cusp.siderealDegree) % 360 + 360) % 360;
      expect(delta).toBeCloseTo(chart.ayanamsa, 6);
    }
  });

  it('derives each cusp sign from its sidereal degree', () => {
    const chart = calculateChart({ ...PROBE });
    for (const cusp of chart.houses!) {
      expect(cusp.signDegree).toBeCloseTo(cusp.siderealDegree % 30, 6);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/astro/frame-consistency.test.ts`

Expected: FAIL. Type errors on `siderealDegree` (the property does not exist yet) and, once that is worked around, an ~23.72° discrepancy between `houses[0]` and `ascendant`.

- [ ] **Step 3: Commit the failing test**

```bash
git add tests/astro/frame-consistency.test.ts
git commit -m "test(astro-engine/SP-0): add the frame-consistency invariant (fails on main)"
```

---

### Task 2: Widen the `HouseCusp` contract

**Files:**
- Modify: `src/shared/types/astrology.ts` (the `HouseCusp` interface)

**Interfaces:**
- Produces: the `HouseCusp` shape every later task reads.

- [ ] **Step 1: Replace the interface**

In `src/shared/types/astrology.ts`, find:

```ts
export interface HouseCusp {
  house: number;
  degree: number;
  sign: Sign;
  signDegree: number;
}
```

Replace with:

```ts
export interface HouseCusp {
  house: number;
  /**
   * Cusp longitude in the SIDEREAL frame — the same frame as
   * PlanetPosition.absoluteDegree, so the two can be compared directly.
   *
   * Renamed from `degree`, which held a TROPICAL value while every other
   * field on the chart was sidereal. A neutral name holding a frame-specific
   * value is what allowed planets to be assigned to the wrong houses.
   */
  siderealDegree: number;
  /** Cusp longitude in the tropical frame, exactly as Swiss Ephemeris reports it. */
  tropicalDegree: number;
  /** Sidereal sign of the cusp — derived from siderealDegree. */
  sign: Sign;
  signDegree: number;
}
```

- [ ] **Step 2: Run typecheck to enumerate every reader**

Run: `npm run typecheck`

Expected: FAIL, with errors at each site that reads `.degree` on a cusp. Record the list — it should be exactly `houses.ts`, `chart.ts`, `planet-in-house.ts`, `ChartWheel.tsx`, `chart-interpretation-prompt.ts` and `tests/astro/houses.test.ts`. If any site appears that is not in that list, stop and report it before continuing; the spec's call-site table was built by grep and a surprise means something reads cusps indirectly.

- [ ] **Step 3: Commit**

```bash
git add src/shared/types/astrology.ts
git commit -m "refactor(astro-engine/SP-0): rename HouseCusp.degree to siderealDegree, add tropicalDegree"
```

---

### Task 3: `houses.ts` becomes pure geometry

**Files:**
- Modify: `src/modules/astro-engine/houses.ts`

**Interfaces:**
- Produces: `TropicalCusp { house: number; tropicalDegree: number }` and `HouseCalculationResult { cusps: TropicalCusp[]; ascendant: number; midheaven: number }`, both consumed by Task 4.

- [ ] **Step 1: Rewrite the module**

Replace the whole of `src/modules/astro-engine/houses.ts` with:

```ts
import { HouseSystem } from '@/shared/types/astrology';
import { calcHouses } from './ephemeris';
import { HOUSE_SYSTEMS } from './constants';

/**
 * A house cusp exactly as Swiss Ephemeris reports it.
 *
 * `sweph.houses()` is called without SEFLG_SIDEREAL, so cusps are always
 * tropical. This type says so in its field name. Converting to sidereal and
 * deriving signs is chart.ts's job — it owns the ayanamsa and already does
 * the same for planets and angles.
 */
export interface TropicalCusp {
  house: number;
  tropicalDegree: number;
}

export interface HouseCalculationResult {
  cusps: TropicalCusp[];
  /** Tropical Ascendant longitude. */
  ascendant: number;
  /** Tropical Midheaven longitude. */
  midheaven: number;
}

/**
 * Calculate house cusps for a given Julian Day, geographic coordinates, and house system.
 *
 * Polar fallback: if |latitude| > 66.5° and Placidus is requested,
 * automatically switches to Whole Sign (Placidus is undefined at extreme latitudes).
 *
 * Returns null only when birth time is unknown — that check is handled by chart.ts,
 * not here. This function always attempts calculation.
 */
export function calculateHouses(
  julianDay: number,
  latitude: number,
  longitude: number,
  houseSystem: HouseSystem,
): HouseCalculationResult | null {
  let effectiveSystem = houseSystem;

  // Polar fallback: Placidus is undefined above Arctic/Antarctic circles
  if (houseSystem === HouseSystem.Placidus && Math.abs(latitude) > 66.5) {
    effectiveSystem = HouseSystem.WholeSigns;
  }

  const systemChar = HOUSE_SYSTEMS[effectiveSystem];

  let houseData;
  try {
    houseData = calcHouses(julianDay, latitude, longitude, systemChar);
  } catch {
    // Unexpected failure (extreme coordinates, etc.) — return null
    return null;
  }

  // houseData.cusps is 0-indexed array of 12 house cusp longitudes
  // houseData.ascmc[0] = Ascendant, houseData.ascmc[1] = Midheaven
  const cusps: TropicalCusp[] = houseData.cusps.map((degree, index) => ({
    house: index + 1,
    tropicalDegree: degree,
  }));

  return {
    cusps,
    ascendant: houseData.ascmc[0] ?? 0,
    midheaven: houseData.ascmc[1] ?? 0,
  };
}
```

Note the removed imports: `HouseCusp` and `absoluteToSignPosition` are both gone. This module no longer knows what a sign is.

- [ ] **Step 2: Update `tests/astro/houses.test.ts`**

Every `cusp.degree` / `.map(c => c.degree)` / `.find(...)!.degree` becomes `.tropicalDegree`. The assertions themselves stay valid — `calculateHouses` still returns tropical geometry, only the field name changed.

Delete the test `'each house cusp has a valid sign'` from this file entirely. Cusps no longer carry a sign here; the sign assertion is relocated to Task 6, where it becomes a meaningful sidereal value rather than a tropical artefact.

- [ ] **Step 3: Run the house tests**

Run: `npx vitest run tests/astro/houses.test.ts`

Expected: PASS, minus the one deleted test. `chart.ts` still fails to compile at this point — that is Task 4.

- [ ] **Step 4: Commit**

```bash
git add src/modules/astro-engine/houses.ts tests/astro/houses.test.ts
git commit -m "refactor(astro-engine/SP-0): houses.ts returns TropicalCusp, drops sign derivation"
```

---

### Task 4: `chart.ts` projects the cusps

This is the fix. Everything before it was scaffolding.

**Files:**
- Modify: `src/modules/astro-engine/chart.ts`

**Interfaces:**
- Consumes: `TropicalCusp`, `HouseCalculationResult` (Task 3); `HouseCusp` (Task 2).
- Produces: `ChartResult.houses: HouseCusp[] | null` with both frames populated.

- [ ] **Step 1: Import the public cusp type**

In `src/modules/astro-engine/chart.ts`, extend the type import:

```ts
import {
  ChartResult,
  HouseCusp,
  HouseSystem,
  Planet,
  PlanetPosition,
} from '@/shared/types/astrology';
```

- [ ] **Step 2: Add the projection helper**

Directly below `buildAnglePosition` (which ends around line 96), add:

```ts
/**
 * Project a tropical cusp into the sidereal frame and derive its sign.
 *
 * Mirrors what buildPlanetPosition/buildAnglePosition already do for bodies
 * and angles. Houses were the sole exception to that pattern, which is why
 * they ended up in a different frame from everything they were compared to.
 */
function buildHouseCusp(cusp: TropicalCusp, ayanamsa: number): HouseCusp {
  const siderealDegree = tropicalToSidereal(cusp.tropicalDegree, ayanamsa);
  const pos = absoluteToSignPosition(siderealDegree);
  return {
    house: cusp.house,
    siderealDegree,
    tropicalDegree: cusp.tropicalDegree,
    sign: pos.sign,
    signDegree: pos.signDegree,
  };
}
```

Add `TropicalCusp` to the existing `calculateHouses` import:

```ts
import { calculateHouses, type TropicalCusp } from './houses';
```

- [ ] **Step 3: Project before assigning planets**

In `calculateChart`, replace the body of the `if (housesResult !== null) {` block's opening — currently:

```ts
    if (housesResult !== null) {
      // Assign planets to houses
      for (const position of planetPositions) {
        position.house = getPlanetHouse(position.absoluteDegree, housesResult.cusps);
      }
```

with:

```ts
    if (housesResult !== null) {
      // Project cusps into the sidereal frame FIRST. Planet longitudes are
      // sidereal, so pairing them with raw tropical cusps offsets every house
      // assignment by the ayanamsa (~23.7° in 1990 — most planets land one
      // house off).
      siderealCusps = housesResult.cusps.map((c) => buildHouseCusp(c, ayanamsa));

      // Assign planets to houses — both sides now in the same frame
      for (const position of planetPositions) {
        position.house = getPlanetHouse(position.absoluteDegree, siderealCusps);
      }
```

- [ ] **Step 4: Declare the new binding and return it**

Beside the existing `let housesResult` declaration, add:

```ts
  let siderealCusps: HouseCusp[] | null = null;
```

Then in the returned object replace:

```ts
    houses: housesResult ? housesResult.cusps : null,
```

with:

```ts
    houses: siderealCusps,
```

- [ ] **Step 5: Run the invariant test**

Run: `npx vitest run tests/astro/frame-consistency.test.ts`

Expected: PASS, all six tests. If `'places the Ascendant exactly on the 1st house cusp'` still fails, the ayanamsa sign is inverted — check that `buildHouseCusp` uses `tropicalToSidereal` and not a hand-rolled addition.

- [ ] **Step 6: Run the full astro suite**

Run: `npx vitest run tests/astro/`

Expected: PASS. Reference-chart tests assert planet longitudes and ASC/MC, none of which this change touches.

- [ ] **Step 7: Commit**

```bash
git add src/modules/astro-engine/chart.ts
git commit -m "fix(astro-engine/SP-0): project house cusps to sidereal before assigning planets"
```

---

### Task 5: The three remaining readers

**Files:**
- Modify: `src/modules/astro-engine/planet-in-house.ts:20-21`
- Modify: `src/modules/astro-engine/components/ChartWheel.tsx:301`
- Modify: `src/modules/astro-engine/lib/chart-interpretation-prompt.ts:86,112`

**Interfaces:**
- Consumes: `HouseCusp` with `siderealDegree` (Task 2), populated by Task 4.

- [ ] **Step 1: `planet-in-house.ts`**

Replace:

```ts
    const start = cusp.degree;
    const end = nextCusp.degree;
```

with:

```ts
    // Sidereal on both sides: the caller passes a sidereal planet longitude.
    const start = cusp.siderealDegree;
    const end = nextCusp.siderealDegree;
```

- [ ] **Step 2: `ChartWheel.tsx`**

Replace line 301:

```ts
              const angle = eclipticToWheelAngle(cusp.degree, chartRotation);
```

with:

```ts
              // Sidereal, matching the rotation (derived from the sidereal ASC)
              // and the planet glyphs. Using the tropical value drew the
              // 1st-house line ~24° away from the ASC marker.
              const angle = eclipticToWheelAngle(cusp.siderealDegree, chartRotation);
```

- [ ] **Step 3: `chart-interpretation-prompt.ts` — the Ascendant**

Replace line 86:

```ts
  const ascSign = hasHouses ? longitudeToSign(chart.houses![0].degree) : null;
```

with:

```ts
  // chart.ascendant is the already-correct sidereal angle and was sitting
  // unused beside this line. Deriving the sign from the tropical cusp made
  // the paid reading name a different rising sign from the one on the wheel.
  const ascSign = chart.ascendant?.sign ?? null;
```

Then update the guard that uses it. Replace:

```ts
  const ascendantLine = hasHouses
    ? `Ascendant: ${ascSign}`
    : 'Ascendant: unknown — birth time not provided';
```

with:

```ts
  const ascendantLine = ascSign
    ? `Ascendant: ${ascSign}`
    : 'Ascendant: unknown — birth time not provided';
```

- [ ] **Step 4: `chart-interpretation-prompt.ts` — the cusp lines**

Replace line 112:

```ts
            `- House ${i + 1}: cusp at ${longitudeToSign(cusp.degree)} ${(cusp.degree % 30).toFixed(1)}°`,
```

with:

```ts
            `- House ${i + 1}: cusp at ${cusp.sign} ${cusp.signDegree.toFixed(1)}°`,
```

If `longitudeToSign` now has no remaining callers in this file, delete its import. Run `grep -n "longitudeToSign" src/modules/astro-engine/lib/chart-interpretation-prompt.ts` to check before deleting.

- [ ] **Step 5: Write the prompt test**

Append to the existing prompt test file (`grep -rl "buildChartInterpretationPrompt" src --include=*.test.ts` to locate it; if none exists, create `src/modules/astro-engine/lib/__tests__/chart-interpretation-prompt.test.ts`):

```ts
import { describe, it, expect } from 'vitest';
import { calculateChart } from '@/modules/astro-engine/chart';
import { buildChartInterpretationPrompt } from '../chart-interpretation-prompt';
import { HouseSystem } from '@/shared/types/astrology';

describe('prompt zodiac frame', () => {
  const chart = calculateChart({
    date: '1990-06-15',
    time: '14:30',
    latitude: 40.7128,
    longitude: -74.006,
    timezone: 'America/New_York',
    houseSystem: HouseSystem.Placidus,
  });

  it('names the same Ascendant the wheel shows', () => {
    const prompt = buildChartInterpretationPrompt(chart, 'en');
    expect(prompt).toContain(`Ascendant: ${chart.ascendant!.sign}`);
  });

  it('lists each cusp in its sidereal sign', () => {
    const prompt = buildChartInterpretationPrompt(chart, 'en');
    for (const cusp of chart.houses!) {
      expect(prompt).toContain(`House ${cusp.house}: cusp at ${cusp.sign}`);
    }
  });
});
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `npx vitest run tests/astro/ src/modules/astro-engine/` then `npm run typecheck`

Expected: PASS and zero type errors.

- [ ] **Step 7: Commit**

```bash
git add src/modules/astro-engine/planet-in-house.ts \
        src/modules/astro-engine/components/ChartWheel.tsx \
        src/modules/astro-engine/lib/chart-interpretation-prompt.ts \
        src/modules/astro-engine/lib/__tests__/chart-interpretation-prompt.test.ts
git commit -m "fix(astro-engine/SP-0): read cusps in the sidereal frame at all three call sites"
```

---

### Task 6: Delete the broken tropical toggle

`PositionTable`'s toggle switches only the degree number while the sign and minutes stay sidereal, so tropical mode shows a tropical degree beside a sidereal sign — usually a different sign entirely. SP-A replaces it with a correct one; repairing code that is about to be discarded is wasted diff, and shipping a mislabelled control meanwhile is worse than shipping none.

**Files:**
- Modify: `src/modules/astro-engine/components/PositionTable.tsx`

- [ ] **Step 1: Simplify `formatDegree`**

Replace:

```ts
function formatDegree(pos: PlanetPosition, isTropical: boolean): string {
  const deg = isTropical ? pos.tropicalDegree : pos.absoluteDegree;
  const wholeDeg = Math.floor(deg % 30);
  return `${wholeDeg}°${pos.minutes.toString().padStart(2, '0')}'`;
}
```

with:

```ts
function formatDegree(pos: PlanetPosition): string {
  const wholeDeg = Math.floor(pos.absoluteDegree % 30);
  return `${wholeDeg}°${pos.minutes.toString().padStart(2, '0')}'`;
}
```

- [ ] **Step 2: Remove the state and every use of it**

Delete `const [isTropical, setIsTropical] = useState(false);` (line 56).

In the `sorted` memo, replace:

```ts
      } else if (sortCol === 'degree') {
        const ad = isTropical ? a.tropicalDegree : a.absoluteDegree;
        const bd = isTropical ? b.tropicalDegree : b.absoluteDegree;
        cmp = ad - bd;
```

with:

```ts
      } else if (sortCol === 'degree') {
        cmp = a.absoluteDegree - b.absoluteDegree;
```

and drop `isTropical` from that memo's dependency array.

Delete the toggle `<button>` and the two footer strings that explain it. Update every `formatDegree(pos, isTropical)` call to `formatDegree(pos)`.

- [ ] **Step 3: Verify no references remain**

Run: `grep -n "isTropical\|tropicalDegree" src/modules/astro-engine/components/PositionTable.tsx`

Expected: no output.

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run src/modules/astro-engine/` then `npm run typecheck`

Expected: PASS, zero type errors. If a test asserted the toggle's presence, delete that test — the control is intentionally gone.

- [ ] **Step 5: Commit**

```bash
git add src/modules/astro-engine/components/PositionTable.tsx
git commit -m "fix(astro-engine/SP-0): delete the mislabelled tropical toggle from PositionTable"
```

---

### Task 7: Reference house numbers in the fixtures

`tests/astro/fixtures/reference-charts.json` holds 109 charts and fixes planet longitudes and ASC/MC — but **zero** expected house assignments. That gap is why nothing locked in the correct behaviour.

**Files:**
- Modify: `tests/astro/fixtures/reference-charts.json` (2 entries only)
- Create: `tests/astro/house-assignment.test.ts`

- [ ] **Step 1: Generate the values**

Write a throwaway script in the scratchpad that calls `calculateChart` on the first two fixture entries that have a non-null `time`, and prints `{ planet, house }` for all 12 bodies. Run it with `npx tsx --tsconfig tsconfig.json <path>`.

**Read the output against the wheel before trusting it.** These are being frozen as expectations, so a wrong value here bakes the next bug in. Sanity check: the Ascendant's sign must equal `houses[0].sign`, and every house number must be 1–12.

- [ ] **Step 2: Add an `expectedHouses` block to exactly two fixtures**

For each of the two chosen entries, add a sibling to `expected`:

```json
"expectedHouses": {
  "sun": 9,
  "moon": 6,
  "mercury": 9,
  "venus": 8,
  "mars": 6,
  "jupiter": 10,
  "saturn": 4,
  "uranus": 5,
  "neptune": 5,
  "pluto": 2,
  "northNode": 6,
  "chiron": 10
}
```

Substitute the values your script printed. Two entries is deliberate — enough to catch a frame regression, few enough that the fixtures stay maintainable.

- [ ] **Step 3: Write the test**

Create `tests/astro/house-assignment.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { calculateChart } from '@/modules/astro-engine/chart';
import { HouseSystem, Planet } from '@/shared/types/astrology';
import fixtures from './fixtures/reference-charts.json';

const KEY_TO_PLANET: Record<string, Planet> = {
  sun: Planet.Sun,
  moon: Planet.Moon,
  mercury: Planet.Mercury,
  venus: Planet.Venus,
  mars: Planet.Mars,
  jupiter: Planet.Jupiter,
  saturn: Planet.Saturn,
  uranus: Planet.Uranus,
  neptune: Planet.Neptune,
  pluto: Planet.Pluto,
  northNode: Planet.NorthNode,
  chiron: Planet.Chiron,
};

type Fixture = {
  name: string;
  input: {
    date: string; time: string | null; latitude: number;
    longitude: number; timezone: string; houseSystem: string;
  };
  expectedHouses?: Record<string, number>;
};

const withHouses = (fixtures as Fixture[]).filter((f) => f.expectedHouses);

describe('reference house assignments', () => {
  it('covers at least two reference charts', () => {
    expect(withHouses.length).toBeGreaterThanOrEqual(2);
  });

  for (const fx of withHouses) {
    it(`assigns the expected houses for ${fx.name}`, () => {
      const chart = calculateChart({
        date: fx.input.date,
        time: fx.input.time,
        latitude: fx.input.latitude,
        longitude: fx.input.longitude,
        timezone: fx.input.timezone,
        houseSystem: fx.input.houseSystem as HouseSystem,
      });

      for (const [key, expected] of Object.entries(fx.expectedHouses!)) {
        const planet = KEY_TO_PLANET[key]!;
        const pos = chart.planets.find((p) => p.planet === planet)!;
        expect(pos.house, `${fx.name} / ${key}`).toBe(expected);
      }
    });
  }
});
```

- [ ] **Step 4: Run it**

Run: `npx vitest run tests/astro/house-assignment.test.ts`

Expected: PASS. The `it('covers at least two reference charts')` guard exists because a JSON typo in `expectedHouses` would otherwise leave the suite green with zero assertions — the failure mode recorded in `feedback_dead_suite_zero_tests`.

- [ ] **Step 5: Commit**

```bash
git add tests/astro/fixtures/reference-charts.json tests/astro/house-assignment.test.ts
git commit -m "test(astro-engine/SP-0): freeze reference house assignments for two charts"
```

---

### Task 8: Relocate the cusp-sign assertion

**Files:**
- Modify: `tests/astro/frame-consistency.test.ts`

- [ ] **Step 1: Add the relocated test**

Append inside the existing `describe('zodiac frame consistency', ...)`:

```ts
  it('gives every cusp a valid sidereal sign', () => {
    // Relocated from houses.test.ts, where it asserted a tropical artefact.
    const SIGNS = [
      'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
      'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
    ];
    const chart = calculateChart({ ...PROBE });
    expect(chart.houses).toHaveLength(12);
    for (const cusp of chart.houses!) {
      expect(SIGNS).toContain(cusp.sign);
      expect(cusp.signDegree).toBeGreaterThanOrEqual(0);
      expect(cusp.signDegree).toBeLessThan(30);
    }
  });
```

- [ ] **Step 2: Run the full suite**

Run: `npm test`

Expected: the pre-existing 2984 pass plus the new tests; the two `tests/baselines` file errors remain (pre-existing, see Global Constraints).

- [ ] **Step 3: Commit**

```bash
git add tests/astro/frame-consistency.test.ts
git commit -m "test(astro-engine/SP-0): relocate cusp-sign validity to the sidereal frame"
```

---

### Task 9: Backfill script for persisted charts

Persisted `natal_charts.chart_data` blobs hold the old shape: `houses[].degree` (tropical), signs derived from it, and `planets[].house` computed against it. The fix is deterministic from data already in the row — `ayanamsa` lives in the same blob — so **no ephemeris call and no decryption of `encrypted_birth_data` is needed. This script reads no PII.**

**Files:**
- Create: `scripts/backfill-house-frame-2026-08-04.mjs`

- [ ] **Step 1: Write the script**

```js
#!/usr/bin/env node
/**
 * SP-0 backfill: rewrite persisted natal_charts.chart_data so house cusps
 * carry both zodiac frames and planets are assigned against sidereal cusps.
 *
 * Deterministic from the row itself: `ayanamsa` lives inside the same
 * chart_data blob, so there is no ephemeris call and no decryption of
 * encrypted_birth_data. This script never reads PII.
 *
 * DRY RUN BY DEFAULT. Pass --apply to write.
 *
 *   node scripts/backfill-house-frame-2026-08-04.mjs
 *   node scripts/backfill-house-frame-2026-08-04.mjs --apply
 */
import { Pool } from '@neondatabase/serverless';
import ws from 'ws';
import { neonConfig } from '@neondatabase/serverless';

neonConfig.webSocketConstructor = ws;

const APPLY = process.argv.includes('--apply');
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const SIGNS = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
];

const norm = (d) => ((d % 360) + 360) % 360;

function signPosition(absoluteDegree) {
  const deg = norm(absoluteDegree);
  const index = Math.floor(deg / 30);
  const signDegree = deg - index * 30;
  return { sign: SIGNS[index], signDegree };
}

function planetHouse(planetDegree, cusps) {
  const degree = norm(planetDegree);
  for (let i = 0; i < 12; i++) {
    const start = cusps[i].siderealDegree;
    const end = cusps[(i + 1) % 12].siderealDegree;
    if (start <= end) {
      if (degree >= start && degree < end) return cusps[i].house;
    } else if (degree >= start || degree < end) {
      return cusps[i].house;
    }
  }
  return 1;
}

function migrate(chartData) {
  if (!chartData?.houses || !Array.isArray(chartData.houses)) return null;
  if (chartData.houses.some((c) => c && c.siderealDegree !== undefined)) return null; // already migrated
  if (typeof chartData.ayanamsa !== 'number') return null;

  const ayanamsa = chartData.ayanamsa;
  const houses = chartData.houses.map((c, i) => {
    const tropicalDegree = c.degree;
    const siderealDegree = norm(tropicalDegree - ayanamsa);
    const pos = signPosition(siderealDegree);
    return {
      house: c.house ?? i + 1,
      siderealDegree,
      tropicalDegree,
      sign: pos.sign,
      signDegree: pos.signDegree,
    };
  });

  const planets = (chartData.planets ?? []).map((p) => ({
    ...p,
    house: planetHouse(p.absoluteDegree, houses),
  }));

  return { ...chartData, houses, planets };
}

const pool = new Pool({ connectionString: DATABASE_URL });

try {
  const { rows } = await pool.query(
    `SELECT id, chart_data FROM natal_charts
      WHERE chart_data->'houses' IS NOT NULL
        AND chart_data->'houses' != 'null'::jsonb`,
  );

  let migrated = 0;
  let skipped = 0;
  let housesChanged = 0;

  for (const row of rows) {
    const next = migrate(row.chart_data);
    if (!next) { skipped++; continue; }

    const before = (row.chart_data.planets ?? []).map((p) => p.house).join(',');
    const after = next.planets.map((p) => p.house).join(',');
    if (before !== after) housesChanged++;

    if (APPLY) {
      await pool.query('UPDATE natal_charts SET chart_data = $1 WHERE id = $2', [next, row.id]);
    }
    migrated++;
  }

  console.log(`${APPLY ? 'APPLIED' : 'DRY RUN'}`);
  console.log(`  rows with houses : ${rows.length}`);
  console.log(`  migrated         : ${migrated}`);
  console.log(`  skipped          : ${skipped} (no ayanamsa, or already migrated)`);
  console.log(`  planet houses moved: ${housesChanged}`);
  if (!APPLY) console.log('\nRe-run with --apply to write.');
} finally {
  await pool.end();
}
```

- [ ] **Step 2: Verify the migration function in isolation before touching the database**

Write a scratchpad test that feeds `migrate()` a hand-built blob whose `ayanamsa` is 24 and whose cusp `degree` values are `[0, 30, ..., 330]`, and assert the resulting `siderealDegree` values are `[336, 6, 36, ...]`. Run it. This is cheaper than discovering a sign error against production data.

- [ ] **Step 3: Run the dry run against production**

Run: `DATABASE_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)" node scripts/backfill-house-frame-2026-08-04.mjs`

**Report the row counts to the founder and stop.** Do not pass `--apply` without explicit approval — this rewrites production chart data.

- [ ] **Step 4: Commit the script**

```bash
git add scripts/backfill-house-frame-2026-08-04.mjs
git commit -m "chore(astro-engine/SP-0): add house-frame backfill script (dry-run default)"
```

---

### Task 10: Invalidate stale AI readings

Only readings for charts **with** houses name an Ascendant, so only those are wrong. Readings for unknown-birth-time charts are sound and are left alone — regenerating them would spend tokens rewriting correct content.

**Files:**
- Create: `scripts/invalidate-stale-readings-2026-08-04.mjs`

- [ ] **Step 1: Write the script**

```js
#!/usr/bin/env node
/**
 * SP-0 remediation: delete chart_readings generated against tropical house
 * cusps. Only readings whose chart HAS houses named an Ascendant, so only
 * those can be wrong — readings for unknown-birth-time charts are correct
 * and are deliberately left alone.
 *
 * MUST run AFTER the backfill. Inverting the order regenerates a reading
 * against a chart that has not been corrected yet, reproducing the bug in
 * fresh rows.
 *
 * DRY RUN BY DEFAULT. Pass --apply to delete.
 */
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

const APPLY = process.argv.includes('--apply');
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

const TARGET = `
  FROM chart_readings cr
  JOIN natal_charts nc ON nc.id = cr.chart_id
  WHERE nc.chart_data->'houses' IS NOT NULL
    AND nc.chart_data->'houses' != 'null'::jsonb
`;

try {
  const { rows: [counts] } = await pool.query(
    `SELECT COUNT(*)::int AS affected,
            COUNT(*) FILTER (WHERE cr.locale = 'en')::int AS en,
            COUNT(*) FILTER (WHERE cr.locale = 'es')::int AS es
     ${TARGET}`,
  );

  const { rows: [guard] } = await pool.query(
    `SELECT COUNT(*)::int AS unaffected FROM chart_readings cr
     JOIN natal_charts nc ON nc.id = cr.chart_id
     WHERE nc.chart_data->'houses' IS NULL
        OR nc.chart_data->'houses' = 'null'::jsonb`,
  );

  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'}`);
  console.log(`  readings to delete : ${counts.affected} (en ${counts.en}, es ${counts.es})`);
  console.log(`  readings preserved : ${guard.unaffected} (charts without houses — already correct)`);

  if (APPLY) {
    const res = await pool.query(
      `DELETE FROM chart_readings cr
        USING natal_charts nc
        WHERE nc.id = cr.chart_id
          AND nc.chart_data->'houses' IS NOT NULL
          AND nc.chart_data->'houses' != 'null'::jsonb`,
    );
    console.log(`  deleted            : ${res.rowCount}`);
  } else {
    console.log('\nRe-run with --apply to delete. Run the BACKFILL FIRST.');
  }
} finally {
  await pool.end();
}
```

- [ ] **Step 2: Dry run and report**

Run: `DATABASE_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)" node scripts/invalidate-stale-readings-2026-08-04.mjs`

Report both counts to the founder. Do not `--apply` without approval.

- [ ] **Step 3: Commit**

```bash
git add scripts/invalidate-stale-readings-2026-08-04.mjs
git commit -m "chore(astro-engine/SP-0): add stale-reading invalidation script (dry-run default)"
```

---

### Task 11: Full verification

- [ ] **Step 1: Run everything**

```bash
npm test
npm run typecheck
npm run lint 2>&1 | grep -v '.claude/worktrees/'
```

Expected: 2984 pre-existing tests plus the new ones pass; two `tests/baselines` file errors remain; zero type errors; lint clean once worktree noise is filtered.

- [ ] **Step 2: Visual confirmation — the one defect visible to the naked eye**

Run `npm run dev`, open `/chart`, and calculate with a **known birth time**. Confirm:
- the 1st-house cusp line lands on the ASC marker (it was ~24° off)
- the `PositionTable` has no tropical toggle
- with a Pro account, the AI reading's Ascendant matches the wheel's rising sign

- [ ] **Step 3: Report the deployment sequence to the founder**

State plainly: **deploy code → run backfill `--apply` → run invalidation `--apply`.** Inverting the last two regenerates readings against uncorrected charts. Do not run either `--apply` without approval.

---

## Self-Review

**Spec coverage:** F1 → Task 5 Step 1. F2 → Task 5 Step 2. F3 → Task 6. F4 → Task 5 Steps 3–4. Contracts → Tasks 2–4. Data remediation → Tasks 9–10. Tests table → Tasks 1, 7, 8 (house-frame invariance, ASC≡cusp1, ASC sign≡cusp1 sign, reference house numbers, prompt Ascendant, cusp sign validity relocated). Verification → Task 11.

**Placeholders:** none — every code step carries the literal replacement text. Task 7 Step 1 requires generated values rather than supplying them, because inventing house numbers would freeze a fiction into the fixtures; the step states how to produce and sanity-check them.

**Type consistency:** `TropicalCusp { house, tropicalDegree }` (Task 3) is consumed by `buildHouseCusp` (Task 4) and produces `HouseCusp { house, siderealDegree, tropicalDegree, sign, signDegree }` (Task 2), read by Tasks 5–8 and mirrored by the backfill script in Task 9. `siderealCusps` is declared in Task 4 Step 4 and used in Step 3 — the plan orders the edits so the compiler is only briefly unhappy.
