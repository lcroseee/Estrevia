# City Search Expansion — Design

**Date:** 2026-04-22
**Status:** Approved, ready for implementation planning

## Goal

Improve birth-city selection in the hero calculator and birth-data form:

1. Expand the city dataset from ~24K (pop ≥ 15,000) to ~50K (pop ≥ 5,000) — covers almost all birthplaces users actually type.
2. Surface the first-level administrative division (US state, French region, Russian oblast, etc.) alongside the city name so users can disambiguate same-named cities.

The autocomplete UX itself does not change — dropdown behavior, keyboard navigation, debounce, rate limits, and the `/api/v1/cities` endpoint shape remain identical.

## Non-Goals

- No localization of country or admin1 names (stays English-only; Spanish locale support is a separate task).
- No change to search algorithm (prefix → substring fallback on `name`/`asciiName`).
- No change to `/api/v1/chart/calculate` payload — still `latitude`, `longitude`, `timezone`.
- No migration to DB-backed city storage. Dataset stays as a bundled JSON loaded at module init.
- No admin2 (county/department) data.

## Background

Current state:

- `data/cities15000.json` (~24K cities, ~6MB) generated from GeoNames `cities15000.zip` via `scripts/generate-cities.ts`.
- Loaded once into `src/modules/astro-engine/cities.ts` via `import citiesData from '../../../data/cities15000.json'`.
- `CitySearchResult` type: `{ name, country, countryCode, latitude, longitude, timezone, population }`.
- Displayed as two-line row: `name` on top, `country · <pop>` below.
- Selection label stored in form state as `"${city.name}, ${city.country}"` (purely cosmetic, never parsed).
- API route `/api/v1/cities` is Node.js runtime, rate-limited per IP.

## Data Layer Changes

### Script: `scripts/generate-cities.ts`

Switch from `cities15000.zip` to `cities5000.zip` and join in admin1 names.

1. Download two files from `https://download.geonames.org/export/dump/`:
   - `cities5000.zip` — TSV of cities with population ≥ 5,000 (~50K rows).
   - `admin1CodesASCII.txt` — TSV of first-level admin divisions (~4,000 rows, ~250KB raw).
2. Parse `admin1CodesASCII.txt` into `Map<string, string>` keyed by `"${countryCode}.${admin1Code}"` (e.g., `"US.TX" → "Texas"`). File is TSV with columns `[code, name, asciiName, geonameId]` (zero-indexed: 0, 1, 2, 3) — use `asciiName` at index 2 for reliable ASCII matching.
3. Parse `cities5000.txt` as before; additionally read column 10 (`admin1Code`).
4. For each city, look up `admin1Code` in the map:
   - Empty string, `"00"`, or missing key → set `admin1 = null`.
   - Found → set `admin1 = <asciiName from map>`.
5. Write output to `data/cities5000.json`. Old `data/cities15000.json` is deleted (not kept as fallback).

Output JSON shape (one entry per line, same compact format as current):

```json
{"name":"Austin","asciiName":"Austin","admin1":"Texas","country":"United States","countryCode":"US","latitude":30.26715,"longitude":-97.74306,"timezone":"America/Chicago","population":961855}
```

Spot-check list expanded to include non-US admin1 cases:

- `Austin` → admin1 `"Texas"`
- `Lyon` → admin1 `"Auvergne-Rhône-Alpes"`
- `Moscow` → admin1 `"Moscow"` (city-region)
- `Monaco` → admin1 `null`

### Bundle size impact

- Current `cities15000.json`: ~6MB compact JSON.
- Projected `cities5000.json`: ~13MB compact JSON.
- Increase of ~7MB in the serverless function bundle. Still well under Vercel's Fluid Compute function size limits.
- Cold-start parse time estimate: ~50ms (current ~25ms).
- Acceptable because Fluid Compute instance reuse amortizes cold starts across many requests.

## Type Changes

### `src/shared/types/api.ts`

```ts
export interface CitySearchResult {
  name: string;
  admin1: string | null;    // NEW
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  timezone: string;
  population: number;
}
```

### `src/modules/astro-engine/cities.ts`

```ts
export interface City {
  name: string;
  asciiName: string;
  admin1: string | null;    // NEW
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  timezone: string;
  population: number;
}
```

Update `searchCities` to:

- Change import path: `citiesData from '../../../data/cities5000.json'`.
- Pass `admin1` through to the result object.
- Search logic unchanged.

## UI Changes

### `src/modules/astro-engine/components/CityAutocomplete.tsx`

**Dropdown row rendering** — change the metadata line to include admin1 when present:

```tsx
<span className="truncate text-xs text-white/40 leading-snug">
  {city.admin1 ? `${city.admin1} · ${city.country}` : city.country}
  {city.population > 0 && (
    <span className="font-mono tabular-nums">
      {' · '}{formatPopulation(city.population)}
    </span>
  )}
</span>
```

**Selection label** — `selectCity` callback:

```ts
const label = city.admin1
  ? `${city.name}, ${city.admin1}, ${city.country}`
  : `${city.name}, ${city.country}`;
```

### `src/modules/astro-engine/components/BirthDataForm.tsx`

Update `handleCitySelect` line 75 to use the same label logic:

```ts
cityLabel: city.admin1
  ? `${city.name}, ${city.admin1}, ${city.country}`
  : `${city.name}, ${city.country}`,
```

### Other callers

- `HeroCalculator.tsx:161` uses only `city.name` — no change needed (city name alone is sufficient for the hero card).
- `BirthDataFormStandalone.tsx`, `PlanetaryHoursGrid.tsx`, `SynastryClient.tsx` — review to confirm they don't need label updates; most likely they only need `latitude/longitude/timezone`.

## Validation & API

- `src/shared/validation/city.ts` — no change (query params unchanged).
- `src/app/api/v1/cities/route.ts` — no change (just returns `CitySearchResult[]` which now includes `admin1`).

## Edge Cases

| Case | Behavior |
|------|----------|
| City with empty `admin1Code` in GeoNames | `admin1 = null`, display/label omit admin1 |
| City with `admin1Code = "00"` (international waters, etc.) | Same as empty → `admin1 = null` |
| admin1Code present but missing from `admin1CodesASCII.txt` | `admin1 = null`, log a warning during generation |
| City-states (Monaco, Singapore, Vatican) | Naturally get `admin1 = null` |
| Moscow, Russia (admin1 = "Moscow") | Shows "Moscow · Russia" — duplicate-looking but technically correct |

## Testing / Verification

Manual verification before merging:

1. `npx tsx scripts/generate-cities.ts` runs successfully, produces `data/cities5000.json` of expected size (~13MB, ~50K entries).
2. Spot-check script output logs: Austin/Lyon/Moscow/Monaco admin1 values match expectations.
3. `pnpm tsc --noEmit` passes.
4. Dev server (`pnpm dev`) starts; typing "Austin" in the homepage hero returns Austin, Texas at the top.
5. Typing "Lyon" returns Lyon, Auvergne-Rhône-Alpes, France.
6. Typing "Monaco" returns Monaco, Monaco (no admin1 duplication in label).
7. Selecting a city fills the input with the expected label format.
8. Submitting the form still produces a chart — confirms the lat/lon/timezone payload is unaffected.

## Rollout

Single PR. No feature flag, no migration — the JSON bundle is regenerated and committed together with the code changes.
