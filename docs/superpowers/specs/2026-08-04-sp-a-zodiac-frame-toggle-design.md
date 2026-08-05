# SP-A · Zodiac Frame Toggle (`/chart`) — Design Spec

**Date:** 2026-08-04
**Depends on:** SP-0 (`2026-08-04-zodiac-frame-correctness-design.md`). Cusps must carry both frames explicitly before anything can project between them.
**Landing zone:** `main`.

## Purpose

Give the natal chart a three-state zodiac control: **Sidereal → Tropical → Both**, cycling on each press, as requested by the founder. Estrevia stops being an app that asserts one frame and becomes one that shows the relationship between two.

The founder's framing, which the UI copy carries: *tropical = who you're becoming here; sidereal = what you are beneath that.* This resolves rather than dilutes the `/why-sidereal` positioning — the claim moves from "we are more correct" to "we show both layers", which is a stronger and more defensible statement.

## The structural fact this design rests on

Sidereal and tropical differ by a **constant offset** (the ayanamsa) at any given moment. Three consequences, each verified against the code:

1. **Aspects are identical in both frames.** Angular separation is invariant under a constant offset. `aspects.ts` and `synastry.ts` need no frame awareness at all.
2. **House numbers are identical in both frames.** Cusps and planets shift together. (This is the invariant SP-0 introduces as a test.)
3. **On screen, nothing moves except the zodiac ring.** `getChartRotation()` returns `180 − ascendant.absoluteDegree`, and planets render through `eclipticToWheelAngle(longitude, rotation)`. Switching frames adds the ayanamsa to both terms, which cancels. Planets, house lines and aspect lines hold their pixels; only the sign sectors rotate by ~23.7°.

So the feature needs **no second ephemeris calculation** — both frames derive from one `calculateChart()` result by arithmetic. And the animation between states is a single ring rotation, which is what makes "the same you, a different reckoning" legible rather than merely stated.

## Decisions taken before design

Put to the founder on 2026-08-04:

1. **"Both" presentation.** **Decision: a double zodiac ring in one wheel** — outer band tropical, inner band sidereal, offset by the ayanamsa, over one set of planets, houses and aspects. Rejected: two side-by-side wheels (duplicates the three things that are identical in both frames, so it displays difference where none exists, and collapses on mobile) and wheel-plus-delta-table only (cheapest, but the shift cannot be *seen*, which was the stated goal).
2. **Persistence.** **Decision: `?z=sid|trop|both` as source of truth, `localStorage` as the default for new charts.** The URL is already the persistence layer for chart inputs in `ChartDisplay.handleChartCalculated`, so shared links carry the sender's view; `localStorage` means a tropical-preferring user does not re-toggle on every chart.
3. **Gating.** **Decision: all three states free.** The toggle is a positioning and sharing asset, and the measured conversion break is at `paywall_click`/Stripe, not feature scarcity. The paid artefact is the *comparative interpretation* in SP-C — gate the reading, not the view.

## Scope

### 1. `zodiac-frame.ts` — the projection module

New file, `src/modules/astro-engine/zodiac-frame.ts`. Pure: no `sweph`, no I/O, no clock. Fully unit-testable.

```ts
export type ZodiacFrame = 'sidereal' | 'tropical';

/**
 * Re-express a chart in the requested zodiac frame.
 *
 * Only sign-relative values change. House numbers and aspects are
 * invariant under the ayanamsa offset and are passed through unchanged.
 */
export function projectChart(chart: ChartResult, frame: ZodiacFrame): ChartResult;
```

What it recomputes: each `PlanetPosition`'s `absoluteDegree`, `sign`, `signDegree`, `minutes`, `seconds`; each `HouseCusp`'s `sign` and `signDegree`; `ascendant` and `midheaven` likewise; and `system`.

What it passes through untouched: `planets[].house`, `planets[].tropicalDegree`, `aspects`, `houses[].siderealDegree`, `houses[].tropicalDegree`, `ayanamsa`, `houseSystem`, `nodeType`, `calculatedAt`.

**Contract note.** `PlanetPosition.absoluteDegree` means *the longitude in the frame named by `ChartResult.system`*. `system` has existed as a discriminant since the beginning and was always `'sidereal'`; this extends it rather than reintroducing the ambiguity SP-0 removes. `tropicalDegree` remains an unconditional tropical reference, and the sidereal value stays recoverable everywhere as `tropicalDegree − ayanamsa`.

`projectChart(chart, 'sidereal')` on a sidereal chart must be an identity — an explicit test, because it is the cheap guard against sign-of-the-offset errors.

### 2. `ZodiacFrameToggle` — the control

New component, `src/modules/astro-engine/components/ZodiacFrameToggle.tsx`.

A single cycling `<button>`, matching the founder's "3rd press" model and thumb-friendly on mobile, which is where the traffic is.

Accessibility: `aria-pressed` is binary and would be wrong for a tri-state. Instead the button carries an `aria-label` naming the current state and the next one ("Zodiac: Sidereal. Activate for Tropical"), and state changes are announced through an `aria-live="polite"` region. Full keyboard operation comes free from using a real `<button>`.

All strings through `next-intl`, EN + ES. Per CLAUDE.md the sign names themselves stay untranslated; only the surrounding copy is localized, in español neutro LATAM with `tú`.

### 3. `ChartDisplay` — state owner

Holds `frame: 'sidereal' | 'tropical' | 'both'`, hydrated from `?z` then `localStorage`, written back to both on change. Computes the projection once:

```ts
const view = useMemo(
  () => projectChart(chart, frame === 'tropical' ? 'tropical' : 'sidereal'),
  [chart, frame],
);
```

**`view` is passed to `ChartWheel` and `PositionTable`. `chart` — the raw sidereal result — continues to feed `generatePassport()` and `ChartReadingSection`.** This separation is load-bearing: both sit on the same object today, so projecting `chart` in place would silently retune the Cosmic Passport (decided to stay sidereal) and the input to the paid reading whenever a user pressed the toggle. A test asserts the passport is stable across all three states.

### 4. `ChartWheel` — the double ring

Takes `frame` and renders one or two zodiac bands. Current geometry has the zodiac band at `0.82 → 1.0 × outerR`. In `both` the band splits — sidereal on `0.82 → 0.91`, tropical on `0.91 → 1.0` — with the tropical sectors offset by the ayanamsa. `houseRingR`, `planetRingR` and `aspectCircleR` are untouched, so the chart body does not reflow between states and the transition reads as rotation rather than resize.

The existing `describeArc` and sector-path code is reused with a rotation parameter; the ring is not reimplemented.

`aria-label` on the SVG names the active frame(s). The per-planet labels and the text fallback state the sign in the active frame, with both signs listed in `both` mode.

### 5. `PositionTable` — delta columns

The broken toggle deleted in SP-0 is replaced properly here. In `sidereal` and `tropical` the table shows one sign column, correctly derived (sign, degree, minutes all from the same frame — the specific bug SP-0 removed). In `both` it shows two sign columns side by side:

```
          SIDEREAL     TROPICAL
  ☉       Gemini       Cancer
  ☾       Aquarius     Pisces
  ASC     Virgo        Libra
```

This is the numeric counterpart to the wheel's double ring, and it is the structure SP-C's comparative reflection reads from.

Header, footer and column strings move to `next-intl` — they are currently hardcoded English.

### 6. Analytics

One PostHog event, `zodiac_frame_changed`, with `{ from, to, surface: 'chart' }`. Enough to answer whether anyone presses past the first state, which is the question that decides whether SP-C is worth building.

Registered in the event enum *and* verified to have a caller — per the repo's own lesson about ghost-defined events that silently never fire.

### 7. CLAUDE.md amendment

The rule "Astro engine MVP: Lahiri ayanamsa only" is amended to state that Lahiri remains the sole *ayanamsa*, and that tropical is a display frame derived from the same calculation rather than a second ayanamsa. The constraint is unchanged in substance; the wording currently forbids this feature by accident.

## Tests

- `projectChart(chart, 'sidereal')` is an identity on a sidereal chart
- Round trip: `projectChart(projectChart(c, 'tropical'), 'sidereal')` restores every sign and degree within float epsilon
- Frame invariants: `house` numbers and `aspects` are byte-identical across projections
- Sign correctness against a known chart: sidereal Sun in Gemini ⇒ tropical Sun in Cancer, with `minutes` recomputed rather than carried over (the exact defect deleted in SP-0)
- Wrap-around: a planet at sidereal 356° projects into the next sign, not past 360°
- Passport stability: `generatePassport` output identical in all three toggle states
- Toggle: three presses return to the start; `aria-label` names current and next state; `?z` and `localStorage` are both written; `?z` wins over `localStorage` on load
- `ChartWheel` in `both` renders two zodiac bands and exactly one set of house lines
- i18n: every new string resolves in EN and ES, no hardcoded literals

## Out of scope

- Synastry — SP-B.
- Comparative interpretation, and any copy beyond the toggle's own labels — SP-C.
- Cosmic Passport, `/sidereal-dates`, `/why-sidereal`, OG images. All stay sidereal.
- Any second ayanamsa, house system, or node type.
- Persisting the frame per user account. `localStorage` is deliberate: it needs no migration, no auth, and no write path.

## Verification before "done"

- `npm test`, `npm run typecheck`, `npm run lint` all clean
- Manual pass on one known-time chart: three presses cycle correctly; planets and house lines hold position across states while the sign ring rotates; the ASC marker stays on the 1st-house cusp in every state
- Mobile viewport check of `both`: the double ring stays legible and the page does not scroll horizontally
- `?z=both` survives a reload and reproduces on a second device from a shared link
