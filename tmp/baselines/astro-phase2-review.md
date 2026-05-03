# T3: Astro-Engine Module Review — SEO Phase 2

**Date:** 2026-05-02  
**Reviewer:** astro-eng  
**Purpose:** Identify reusable functions and correct function signatures for T8 (getSunInSignRange).

---

## Critical Correction for T8

**The plan uses an incorrect function name.** Plan says `julianDayFromDate` — the actual function is `dateToJulianDay`.

```
Plan:    julianDayFromDate(date) → WRONG
Actual:  dateToJulianDay(date)   → in src/modules/astro-engine/julian-day.ts
```

---

## sweph Flag Set Used for Sun Longitude

From `src/modules/astro-engine/ephemeris.ts` (`calcPlanet` function):

```ts
const flags = SEFLG_SPEED | SEFLG_MOSEPH;  // = 256 | 4 = 260
const result = sweph.calc_ut(julianDay, bodyId, flags);
```

**NOT using `SEFLG_SIDEREAL`** — the codebase gets **tropical** longitude from sweph, then applies the Lahiri ayanamsa offset manually via `tropicalToSidereal()`. This is the correct Moshier-based pattern.

---

## Reusable Function Signatures

### 1. `dateToJulianDay(date: Date): number`

**File:** `src/modules/astro-engine/julian-day.ts`  
**Export:** yes (also re-exported from `index.ts`)  
Returns the ET (Ephemeris Time) Julian Day via `sweph.utc_to_jd(...).data[1]`.

```ts
export function dateToJulianDay(date: Date): number
```

### 2. `calcPlanet(julianDay: number, bodyId: number): PlanetData`

**File:** `src/modules/astro-engine/ephemeris.ts`  
**Export:** yes  
Returns `{ longitude, latitude, distance, speed }` — all **tropical**.  
For Sun: `bodyId = SWEPH_BODY_IDS.SE_SUN = 0`

```ts
export function calcPlanet(julianDay: number, bodyId: number): PlanetData
// PlanetData = { longitude: number; latitude: number; distance: number; speed: number }
```

**To get Sun's tropical longitude:**
```ts
const tropical = calcPlanet(jd, SWEPH_BODY_IDS.SE_SUN).longitude;
```

### 3. `getLahiriAyanamsa(julianDay: number): number`

**File:** `src/modules/astro-engine/sidereal.ts`  
**Export:** yes  
Thin wrapper: calls `getAyanamsa(jd)` → `sweph.get_ayanamsa_ut(jd)`.  
Requires `SE_SIDM_LAHIRI` to be set via `sweph.set_sid_mode()` — **already done at module load in `ephemeris.ts`** (first import sets it).

```ts
export function getLahiriAyanamsa(julianDay: number): number
```

### 4. `tropicalToSidereal(tropicalDegree: number, ayanamsa: number): number`

**File:** `src/modules/astro-engine/sidereal.ts`  
**Export:** yes  
Subtracts ayanamsa, normalizes to `[0, 360)`.

```ts
export function tropicalToSidereal(tropicalDegree: number, ayanamsa: number): number
```

---

## SiderealSign Type vs Sign Enum

The existing codebase uses `Sign` enum (capitalized): `Sign.Aries = 'Aries'`, `Sign.Taurus = 'Taurus'`, etc.

The **T8 implementation** creates a separate `SiderealSign` type using lowercase strings ('aries', 'taurus', ...) for:
- URL-safe sign slugs in `/sidereal-aries-dates`
- API response format: `{ "sign": "aries" }`
- Internal sign matching in `signFromLongitude()`

This is intentional — `SiderealSign` is the public-API/URL contract; `Sign` is the internal astrology type.

---

## SE_SIDM_LAHIRI Initialization

From `src/modules/astro-engine/ephemeris.ts` (line 5):
```ts
// Set Lahiri ayanamsa once at module load — applies to all subsequent sidereal calculations
sweph.set_sid_mode(SE_SIDM_LAHIRI, 0, 0);
```

**Confirmed:** SE_SIDM_LAHIRI is set at module load when `ephemeris.ts` is imported.  
Any file importing from `ephemeris.ts` (directly or via `index.ts`) gets this automatically.  
`sun-in-sign-range.ts` imports `getLahiriAyanamsa` from `./sidereal` which imports from `./ephemeris` → guaranteed initialization.

---

## Existing Vitest Helpers

- `src/modules/astro-engine/components/__tests__/time-format.test.ts` — UI component test only, no ephemeris assertions
- **No `src/modules/astro-engine/__tests__/` directory** — T8 creates it fresh

---

## T8 Import Corrections

The plan's `sun-in-sign-range.ts` template must be updated:

```ts
// Plan (WRONG):
import { julianDayFromDate } from './julian-day';  // ← does not exist
import { getSunLongitude } from './ephemeris';      // ← does not exist

// Correct:
import { dateToJulianDay } from './julian-day';
import { calcPlanet } from './ephemeris';
import { SWEPH_BODY_IDS } from './constants';
// Usage:
const jd = dateToJulianDay(date);
const tropical = calcPlanet(jd, SWEPH_BODY_IDS.SE_SUN).longitude;
```

---

## Rate-Limit Pattern (for T9)

**File found:** `src/shared/lib/rate-limit.ts`  
**Pattern:** registry of named limiters + `getRateLimiter(endpoint: string): Ratelimit`  
**Correct approach for T9:** Add `'sidereal/sun-sign'` entry to the registry in `rate-limit.ts`, then call `getRateLimiter('sidereal/sun-sign')` in the route.  
Do NOT create a new `makeRateLimit` factory (the plan's fallback option) — the registry pattern already exists.

---

## Summary for T8

```ts
// siderealSunLongitudeAt(date: Date): number
const jd = dateToJulianDay(date);
const tropical = calcPlanet(jd, SWEPH_BODY_IDS.SE_SUN).longitude;
const ay = getLahiriAyanamsa(jd);
return tropicalToSidereal(tropical, ay);
```

All functions re-exported from `src/modules/astro-engine/index.ts` — safe to import from `'../index'` or direct paths.
