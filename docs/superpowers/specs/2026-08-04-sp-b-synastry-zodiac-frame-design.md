# SP-B · Zodiac Frame in Synastry — Design Spec

**Date:** 2026-08-04
**Depends on:** SP-0 (frame correctness) and SP-A (`projectChart`, `ZodiacFrameToggle`). This spec adds no new primitives — it reuses both.
**Landing zone:** `main`. Smallest of the four sub-projects.

## Purpose

Carry the sidereal/tropical toggle into `/synastry`, so a user who has switched frames on their chart does not find the compatibility page silently contradicting it.

## What the toggle can actually change here — and what it cannot

Stated plainly, because it bounds the work and the founder asked the honest version:

`SynastryResult` renders exactly two kinds of frame-sensitive content — the Sun and Moon sign labels in each person's summary strip (`SynastryResult.tsx:185-191`). There is **no synastry wheel**, and the inter-chart aspect list shows planet pairs and orbs with no signs at all. Because angular separation is invariant under the ayanamsa offset, those aspects — and therefore every compatibility score derived from them — are **identical in both frames** and must not change.

So the visible effect of the toggle in synastry is four sign labels. That is the whole deliverable. It is worth building anyway: a user toggled to tropical on `/chart` who then opens `/synastry` and sees sidereal Sun signs experiences it as a bug, not as a scope boundary.

## The one real obstacle

`ChartSummary` (`SynastryClient.tsx:15`) carries `sunSign: string | null` and `moonSign: string | null` — **sign names only, no degrees**. `projectChart` needs longitudes, so the client cannot derive the tropical labels from what it currently receives. This is not a client change; it is a payload change.

## Scope

**1. Widen `ChartSummary` at the source.** The synastry endpoints already hold the full `ChartResult` for both charts server-side, so both frames' sign names are available without any new calculation:

```ts
interface ChartSummary {
  name: string | null;
  sunSign: string | null;          // sidereal — unchanged, existing consumers unaffected
  moonSign: string | null;         // sidereal — unchanged
  tropicalSunSign: string | null;  // new
  tropicalMoonSign: string | null; // new
}
```

Additive, so nothing that reads the current shape breaks. Populated by applying `projectChart(chart, 'tropical')` server-side and reading the two signs off the result — the same pure function SP-A introduces, no second ephemeris call.

**Exactly one file changes server-side: `api/v1/synastry/calculate/route.ts:183-190`.** That is where both summaries are built, and it already holds the full `ChartResult` for each person. The GET `api/v1/synastry/[id]/route.ts` returns only `id`, `overallScore`, `categoryScores` and `createdAt` — it carries no summaries at all, so there is nothing to widen there. A synastry result opened from its permalink therefore has no sign labels to toggle in the first place; that is pre-existing behaviour and this spec does not change it.

**2. Toggle in `SynastryResult`.** The same `ZodiacFrameToggle` component from SP-A, reading and writing the same `?z` parameter and the same `localStorage` key, so a choice made on `/chart` carries over. In `both` mode each summary strip shows the pair — `☉ Gemini / Cancer` — matching the delta-column idea from SP-A's table rather than inventing a third presentation.

**3. A short line stating what does not change.** In `both` mode, one localized sentence under the aspect list: the aspects and the compatibility score are the same in both systems, because both frames shift by the same amount. Without it, a user who sees the sign labels change but the score hold will read it as a bug. This is the cheapest possible defence of a correct-but-surprising result.

**4. The synastry AI prompt keeps its sidereal framing.** `analyze/route.ts:61` says "using sidereal astrology (Lahiri ayanamsa)" and stays true — the analysis is generated from aspects, which are frame-invariant. No prompt change, no cache concern. If a comparative synastry reading is ever wanted, that is SP-C territory, not this spec.

## Tests

- `ChartSummary` widening is additive: existing consumers compile and render unchanged with the new fields absent from old payloads
- Tropical sign labels match `projectChart(chart, 'tropical')` for a known pair
- Aspect list and compatibility score are byte-identical across all three toggle states — the invariant this spec rests on
- Frame choice made on `/chart` is in effect on `/synastry` on first render (shared `?z` and `localStorage` key)
- i18n: the new strings resolve in EN and ES

## Out of scope

- A synastry wheel. If one is ever built, the double-ring treatment from SP-A applies and this spec's toggle already has a place to put it.
- Composite or Davison charts.
- Any change to compatibility scoring — it is frame-invariant and must stay untouched.

## Verification before "done"

- `npm test`, `npm run typecheck`, `npm run lint` clean
- Manual: toggle on `/chart`, navigate to `/synastry`, confirm the frame carried and the score did not move
