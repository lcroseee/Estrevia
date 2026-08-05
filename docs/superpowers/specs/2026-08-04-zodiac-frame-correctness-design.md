# SP-0 · Zodiac Frame Correctness — Design Spec

**Date:** 2026-08-04
**Baseline:** `642dbc2` on `main`. 2984 tests pass, 1 skipped, 1 todo. Two test *files* error under vitest because `tests/baselines/*.spec.ts` are Playwright specs and `vitest.config.ts` excludes only `tests/e2e/**` — pre-existing, unrelated, already fixed as W1-8 on the unmerged `seo-fixes` branch.
**Landing zone:** `main`, per the direct-to-main workflow. Ships independently of SP-A..SP-C.

## Purpose

House cusps are stored in the **tropical** frame while planets, the Ascendant and the Midheaven are stored in the **sidereal** frame. Four call sites pair the two, and every one of them produces wrong output.

The mismatch was confirmed by execution, not by reading. Probe chart — 1990-06-15 14:30, New York, Placidus:

```
ayanamsa            = 23.7237
ASC absoluteDegree  = 169.9717  Virgo      <- sidereal
cusp[1].degree      = 193.6955  Libra      <- tropical
cusp1 - ASC_sidereal = 23.7237             <- exactly the ayanamsa
cusp1 - ASC_tropical =  0.0000
```

`sweph.houses()` is called without `SEFLG_SIDEREAL`, so it always returns tropical cusps. `chart.ts` converts the planets and the angles by subtracting the ayanamsa, but never converts the cusps.

### The four defects

| # | Defect | Location |
|---|---|---|
| F1 | `getPlanetHouse()` receives a sidereal planet longitude and tropical cusps. House assignment is off by the ayanamsa. | `chart.ts:193` → `planet-in-house.ts:20-21` |
| F2 | The wheel rotates by the sidereal ASC and plots planets by sidereal longitude, but draws house-cusp lines by tropical degree. The 1st-house line does not land on the ASC marker — a ~24° visible split. | `ChartWheel.tsx:301` |
| F3 | `PositionTable`'s tropical toggle switches only the degree number; `pos.sign` and `pos.minutes` stay sidereal. Tropical mode shows a tropical degree next to a sidereal sign — frequently a different sign. Strings are also hardcoded English, bypassing `next-intl`. | `PositionTable.tsx:45-49,56` |
| F4 | The **paid** AI reading derives the Ascendant sign from the tropical cusp instead of the correct `chart.ascendant` sitting unused beside it, and feeds all 12 cusps to the LLM in tropical signs. On the probe chart the reading says **Libra** rising while the wheel says **Virgo**. | `chart-interpretation-prompt.ts:86,112` |

### Magnitude

Frame-consistent recomputation of the probe chart against the current output:

```
Sun     now= 8  fixed= 9      Venus    now= 7  fixed= 8
Moon    now= 5  fixed= 6      Mars     now= 5  fixed= 6
Saturn  now= 3  fixed= 4      Jupiter  now= 9  fixed=10
Pluto   now= 1  fixed= 2      Chiron   now= 9  fixed=10

8 / 12 planets change house.
```

Not cosmetic. On any chart with a known birth time, most planetary house placements are wrong, and the paid interpretation is built on top of them.

### What is *not* affected

Verified, and it bounds the work:

- **Cosmic Passport / OG images.** `passport.ts:39` reads `chart.ascendant?.sign` — the correct sidereal value. The viral surface was never poisoned.
- **Aspects.** `aspects.ts` and `synastry.ts` operate on sidereal planet longitudes only. Angular separation is invariant under a constant offset, so aspects are correct in both frames and need no change.
- **Charts without a birth time.** `houses` is `null`, so no pairing occurs.
- **The public API contract.** `/api/v1/docs` documents no house-cusp shape; the only documented public endpoint is `/v1/sidereal/sun-sign`.

### Why no test caught it

`tests/astro/houses.test.ts` asserts cusp count, `[0, 360)` ranges, sign validity and ordering — never a house *number*. `tests/astro/fixtures/reference-charts.json` fixes planet longitudes and ASC/MC but contains zero expected house assignments. Nothing locks in the current behaviour, so the fix fights no existing test.

## Decisions taken before design

Put to the founder on 2026-08-04:

1. **Scope of the parent idea.** The founder's request is a 3-state sidereal/tropical toggle for the chart and synastry views, plus a comparative interpretive layer. Too large for one spec. **Decision: decompose into SP-0 (this spec, correctness), SP-A (frame projection + toggle in `/chart`), SP-B (synastry), SP-C (comparative reflection). SP-0 first, shipped on its own.**
2. **Stale AI readings.** **Decision: invalidate only `chart_readings` rows whose chart has `houses ≠ null`.** Only those name an Ascendant. Readings for unknown-birth-time charts are correct and are left alone, so no tokens are spent regenerating sound content.
3. **Persisted charts.** **Decision: one-off backfill script, dry-run by default, run by the founder.** Read-time normalization was rejected because the shim would live in the code permanently.

## Scope

### 1. Contracts

`houses.ts` stops knowing about signs and becomes pure sweph geometry. It returns a local, explicitly-named tropical type and no longer imports `absoluteToSignPosition`:

```ts
export interface TropicalCusp {
  house: number;
  tropicalDegree: number;
}

export interface HouseCalculationResult {
  cusps: TropicalCusp[];
  ascendant: number;   // tropical
  midheaven: number;   // tropical
}
```

`chart.ts` — which already owns the ayanamsa and already converts planets and angles — performs the projection and assembles the public type:

```ts
export interface HouseCusp {
  house: number;
  siderealDegree: number;   // was `degree`, which held tropical
  tropicalDegree: number;
  sign: Sign;               // sidereal sign of the cusp
  signDegree: number;
}
```

This mirrors the existing `calcPlanet` → `chart.ts` pattern exactly: the ephemeris layer reports what Swiss Ephemeris says, and one place decides the frame. The bug existed because houses were the sole exception to that pattern.

`degree` is **renamed**, not supplemented. A neutral name holding a frame-specific value is what caused the defect; renaming forces the compiler to surface all four readers instead of silently changing their meaning under them.

### 2. Call sites

Complete — enumerated by grep, not estimated. `MiniCalculator.tsx` has its own unrelated `result.degree` and is untouched.

| File | Change |
|---|---|
| `planet-in-house.ts:20-21` | Read `cusp.siderealDegree`; the planet longitude passed in is already sidereal, so the pair becomes consistent |
| `ChartWheel.tsx:301` | Read `cusp.siderealDegree`; the 1st-house line then coincides with the ASC marker |
| `chart-interpretation-prompt.ts:86` | `ascSign` from `chart.ascendant.sign`, not `longitudeToSign(chart.houses[0].degree)` |
| `chart-interpretation-prompt.ts:112` | Render `cusp.sign` and `cusp.siderealDegree % 30`; drop `longitudeToSign` for cusps |
| `houses.ts` | Return `TropicalCusp[]`; drop the `absoluteToSignPosition` import |
| `chart.ts` | Project cusps to sidereal, derive `sign`/`signDegree`, assemble `HouseCusp[]` |

`PositionTable.tsx` — **delete the broken toggle** (`isTropical` state, `formatDegree`'s branch, the toggle button, the two footer strings). It emits a tropical degree beside a sidereal sign, and SP-A replaces it with a correct one. Repairing code that is about to be discarded is wasted diff; shipping a mislabelled control in the meantime is worse than shipping none.

### 3. Data remediation

Two scripts under `scripts/`, both dry-run by default, both run by the founder. Order is load-bearing.

**`scripts/backfill-house-frame-2026-08-04.mjs`** — rewrites `natal_charts.chart_data`:
- `houses[].degree` → `{ siderealDegree: degree - ayanamsa (normalised), tropicalDegree: degree }`
- recompute each cusp's `sign` / `signDegree` from `siderealDegree`
- recompute `planets[].house` against the corrected cusps
- skip rows where `houses` is `null` or already migrated (presence of `siderealDegree`)

Deterministic from data already in the row: `ayanamsa` lives inside the same `chart_data` blob, so no ephemeris call and no decryption of `encrypted_birth_data`. No PII is read. Temp charts are purged after 7 days by `cleanup-temp-charts`, so the durable population is `status = 'saved'` plus at most a week of temp rows.

**`scripts/invalidate-stale-readings-2026-08-04.mjs`** — deletes `chart_readings` rows joined to a `natal_charts` row whose `chart_data->'houses'` is not null. Next view regenerates against the corrected chart.

**Sequence: deploy code → backfill → invalidate.** Inverting the last two would regenerate a reading against a chart that has not been corrected yet, reproducing F4 in fresh rows.

### 4. Tests

TDD — each written failing first.

| Test | Asserts | Fails today? |
|---|---|---|
| House-frame invariance | A planet's house number is identical whether computed as (sidereal planet, sidereal cusps) or (tropical planet, tropical cusps). Both frames shift by the same constant, so this must hold. | **Yes** — this is the test whose absence allowed the bug |
| ASC ≡ cusp 1 | `chart.ascendant.siderealDegree === chart.houses[0].siderealDegree` within float epsilon, for Placidus | **Yes** |
| ASC sign ≡ cusp 1 sign | `chart.ascendant.sign === chart.houses[0].sign` | **Yes** |
| Reference house numbers | Expected house assignments for 2–3 charts added to `reference-charts.json`, which currently contains none | **Yes** |
| Prompt Ascendant | `buildChartInterpretationPrompt` emits the sign from `chart.ascendant`, and its cusp lines match `chart.houses[].sign` | **Yes** |
| Cusp sign validity | Moves from `houses.test.ts` to a `chart.ts` test, where a sign is now a meaningful sidereal value rather than a tropical artefact | Relocated |

`houses.test.ts`'s remaining assertions (12 cusps, `[0, 360)`, ordering, opposition of 1/7 and 4/10, polar fallback) stay valid — `calculateHouses` still returns tropical geometry. Only the field name changes.

## Out of scope

- The sidereal/tropical toggle itself, in any view — that is SP-A.
- Synastry — SP-B. It reads no houses and its aspects are already frame-correct.
- The comparative interpretive layer and its copy — SP-C.
- Cosmic Passport, `/sidereal-dates`, `/why-sidereal`, and all SEO surfaces. Sidereal there is a position, not a setting.
- `calcPlanet`, ayanamsa selection, house systems, node type. Lahiri and Placidus remain the only options in SP-0; CLAUDE.md's "Lahiri ayanamsa only" rule is amended in SP-A, not here.

## Verification before "done"

- `npm test` — 2984 passing plus the new tests; the two pre-existing `tests/baselines` file errors remain and are not introduced here
- `npm run typecheck` — zero errors; the `degree` → `siderealDegree` rename must resolve cleanly at the four reader sites, the two producers, and `tests/astro/houses.test.ts`
- `npm run lint` — filter `.claude/worktrees/` noise before reading the count
- Visual check on one known-time chart: the 1st-house cusp line lands on the ASC marker in the wheel, and the AI reading's Ascendant matches the wheel's. This is the defect that is visible to the naked eye, so it is the one to confirm by eye.
- Backfill and invalidation scripts exercised in dry-run against production before any write, with row counts reported to the founder for approval.

## Follow-on

SP-A depends on this spec landing. Its core is a pure `projectChart(chart, frame)` in a new `zodiac-frame.ts` — no `sweph` call, because the ayanamsa is a constant offset and both frames are derivable from one calculation. That module is only sound once cusps carry both frames explicitly, which is what SP-0 delivers.
