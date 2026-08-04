# Reconciliation — Contradiction #5: houses-null-when-birth-time-unknown

**Question:** Does the live app violate the "houses must be null when birth time is unknown" engine rule (10-live.md LIVE-6), or is the unknown-birth-time path correct (06-landing.md §c)?

**Verdict: 10-live.md LIVE-6 is RIGHT — real violation, severity stands (arguably understated at P2). 06-landing.md's "Unknown-birth-time path: good" is WRONG in its conclusion.** The walkthrough is NOT an artifact: the agent used the birth-time toggle OFF (unknown time), and the rendered Ascendant + 12 houses are exactly what the deployed code produces. The engine itself is correct; the defect is that **all three client callsites pre-bake the noon fallback as the literal string `'12:00'`, and the API schema silently coerces the only "unknown" signal (`houseSystem: null`) to Placidus** — so the server can never know the time was unknown.

All citations verified on `origin/main` (`git diff origin/main --name-only` shows the 6 unpushed local commits touch only HALF50/discount files — none of the files below differ; key lines additionally re-checked via `git show origin/main:<path>`).

---

## 1. What the two reports actually said

**06-landing.md:72** (code read of HeroCalculator):
> "**Unknown-birth-time path:** good — toggle off by default, noon fallback, `houseSystem: null`, helper text explains the trade (`Time lets us compute your Ascendant and houses.`)."

**10-live.md:108-109** (§LIVE-6, live walkthrough):
> "URL after calculation: `?bd=1990-01-15&lat=…&place=…&tz=…` — **no `bt`/`ktb`** (birth time unknown; form sends `time:'12:00', houseSystem:null` — `BirthDataForm.tsx:99–103`). Yet the live UI displays 'Ascendant in Aries', house cusps 1–12, and per-planet houses ('Sun in Capricorn at 1°36′, house 9')."

**Was the toggle used as "unknown"?** Yes. 10-live.md:99: "After manually re-entering the data (date + city only, **birth-time toggle OFF**), the chart renders: wheel + houses + planet table…". The agent did NOT submit 12:00 as a known time — it left the toggle off (`BirthDataForm.tsx:46` defaults `knowsBirthTime: false`). The URL it reported (`bd/lat/lon/place/tz`, no `bt`/`ktb`) is exactly what `ChartDisplay.tsx:240-251` writes when `knowsBirthTime` is false (`bt`/`ktb` only set inside `if (formValues.knowsBirthTime && formValues.time)`, lines 242-245). Walkthrough is internally consistent with code.

## 2. Code trace (origin/main)

### The engine is correct — houses gated on `time !== null`
`src/modules/astro-engine/chart.ts`:
- **:22** — `time: string | null; // HH:mm or null (unknown birth time)` (ChartInput)
- **:122** — `const hasBirthTime = time !== null && time.trim().length > 0;`
- **:123** — `const localTimeStr = hasBirthTime ? time! : '12:00';` ← **the engine already noon-defaults internally for planet positions when time is null**
- **:180** — `if (hasBirthTime) { housesResult = calculateHouses(...) ... ascendant = ... midheaven = ... }`
- **:219** — `houses: housesResult ? housesResult.cusps : null` — houses, Ascendant, Midheaven all null when `time === null`.

So the contract is: **send `time: null` when unknown**. The engine handles everything else.

### All three clients defeat the gate by sending `'12:00'` as a non-null string
1. `src/modules/astro-engine/components/HeroCalculator.tsx:238,243` — `time: form.knowsBirthTime ? form.time : '12:00'`, `houseSystem: form.knowsBirthTime ? 'Placidus' : null` (landing hero)
2. `src/modules/astro-engine/components/BirthDataForm.tsx:99,103` — `time: values.knowsBirthTime ? values.time : '12:00'`, `houseSystem: ... : null` (the /chart form the walkthrough used)
3. `src/modules/astro-engine/components/ChartDisplay.tsx:204,208` — URL auto-calc on mount: `time: knowsTime ? bt : '12:00'`, `houseSystem: knowsTime ? 'Placidus' : null` (reload/share links without `ktb=1` get the same fabricated houses)

### The API schema erases the only "unknown" signal the clients do send
`src/shared/validation/chart.ts:11-21` (`chartCalculateSchema`):
```ts
time: timeSchema.nullable(),          // null IS accepted — clients just never send it
// Frontend sends `null` when birth time is unknown (no houses needed).
// Coerce null/undefined to Placidus so the engine always gets a valid enum.
houseSystem: houseSystemSchema
  .nullish()
  .transform((v) => v ?? HouseSystem.Placidus),
```
The comment documents the intent, but the transform makes `houseSystem: null` a **no-op**: the route (`src/app/api/v1/chart/calculate/route.ts:75-82`) passes `time='12:00'` (non-null) + `houseSystem=Placidus` to `calculateChart` → `hasBirthTime=true` → **full Placidus houses + Ascendant + Midheaven computed for noon**. (HeroCalculator's extra `knowsBirthTime` body field is not in the schema and is stripped by zod — also inert.) The temp DB row (route.ts:120) even persists `houseSystem: 'Placidus'` for time-unknown charts.

### The UI's houses-null paths exist but are unreachable dead code from app flows
- `ChartDisplay.tsx:337` — `{!chart.houses && ` · ${t('noHouses')}`}` ("No houses (no birth time)", `messages/en.json:66`)
- `ChartDisplay.tsx:395` — `{chart.houses && (...)}` house-cusp rendering
- `ChartReadingSection.tsx:40-41` — `hasHouses = Array.isArray(chart.houses) && chart.houses.length > 0; ascSign = hasHouses ? chart.houses![0].sign : null`
- `ChartReadingSection.tsx:141,157,160` — teaser leads with `teaserAscendant` and picks `lockedLabelWithHouses` when `hasHouses`

Because the API never returns `houses: null` from any in-app submission, `hasHouses` is always true → the reading teaser confidently leads with a noon-fabricated Ascendant, exactly as LIVE-6 observed ("Ascendant in Aries" for 1990-01-15, toggle OFF, Mexico City).

## 3. Email-gate SKIP path — does it default the time silently?

The silent noon default is **not specific to the skip path** — it happens at submit time (`HeroCalculator.tsx:238`) for *every* toggle-OFF calculation, before the email gate even opens (gate fires at `HeroCalculator.tsx:296-298`, after the API call). Skip (`handleDismiss`) merely reveals the hero result card, which shows only Sun sign + degree — **no Ascendant/houses are rendered on the landing**, so the violation is invisible there. It surfaces on `/chart` when the user re-enters data (which they must, since `chartId` is a dead param — LIVE-2). Same fabricated-houses chart is nonetheless computed + stored as a temp DB row for every gated/skipped hero calculation.

## 4. Why 06-landing.md got it wrong

Its raw observations were accurate (toggle default off, noon fallback, `houseSystem: null` in the client body) — but it stopped at the client and assumed `houseSystem: null` propagates. It never traced (a) the zod transform that rewrites `null → Placidus`, or (b) the engine's `hasBirthTime` gate keying on `time !== null` — which the client has already defeated by substituting `'12:00'`. Classic "grep the definition, not the contract" miss.

## 5. What REPORT.md must say

- **LIVE-6 stands** as a confirmed correctness/trust defect: production renders a noon-fabricated Ascendant + 12 Placidus houses + per-planet house placements for time-unknown charts, violating the CLAUDE.md engine rule ("houses null when birth time unknown") at the UI/API layer while the engine itself is compliant. The paywall reading teaser leads with the fabricated Ascendant (`ChartReadingSection.tsx:141`).
- **06-landing.md §c must be corrected**: the unknown-birth-time path is NOT good; delete "good" and cross-reference LIVE-6.
- **Fix (small, precise):** change the three client literals to send `time: null` when `knowsBirthTime` is false (`HeroCalculator.tsx:238`, `BirthDataForm.tsx:99`, `ChartDisplay.tsx:204`) — the schema already accepts `time: null` and the engine already noon-defaults planets internally. Optionally also stop the schema transform from masking intent (keep it for engine safety, but it's the client `time` that decides houses). The existing UI fallbacks (`noHouses` label, `lockedLabelNoHouses`, `hasHouses` teaser branch) then activate with zero further work. Add a regression test: POST `/api/v1/chart/calculate` with `time: null` → `houses === null`, `ascendant === null`; and a component test: toggle-OFF submission sends `time: null`.
