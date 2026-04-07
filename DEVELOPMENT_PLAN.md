# Estrevia MVP — Development Plan

## How to Use This Plan

This is a sequential roadmap. Each step depends on the previous ones. Do not skip steps. Do not start a step until all its prerequisites (listed at the top of each step) are met and verified.

**Execution model:** Claude Code Agent Teams. Router reads this plan and dispatches tasks to agents.

### Agent Teams Protocol

**Every step has an Agent Assignments table.** Router reads it and dispatches. Format:

```
| Agent | Task | Depends on | Parallel |
|-------|------|------------|----------|
| backend | Create API route | — | — |
| frontend | Build UI component | backend | after |
| seo-growth | Metadata + JSON-LD | — | with frontend |
| qa | Tests | frontend | after |
```

- **Depends on:** which agent's output this task needs. `—` = no dependency within this step
- **Parallel:** `—` = first to start, `with X` = can run simultaneously with X, `after` = starts after its dependency finishes

**Handoff between agents** includes:
1. What the previous agent produced (files, types, endpoints)
2. The contract/interface the next agent must satisfy
3. How to verify the handoff is complete

**Checkpoints are STOP gates.** Router verifies ALL items before proceeding to the next phase.

### Active Agents (MVP)

| Agent | Model | Core role |
|-------|-------|-----------|
| `router` | Sonnet | Dispatches tasks, tracks progress, resolves conflicts |
| `architect` | Opus | Architecture decisions, API contracts, file maps |
| `frontend` | Sonnet | UI components, pages, SVG chart, PWA, a11y |
| `backend` | Sonnet | API routes, DB, auth, payments, encryption |
| `astro-engine` | Sonnet | Swiss Ephemeris, chart calculation, planetary hours |
| `content` | Sonnet | Essays (MDX), 777 correspondences, legal compliance |
| `seo-growth` | Sonnet | SEO infrastructure, metadata, schema, sitemap, analytics, viral funnel |
| `qa` | Sonnet | Tests, security audit, Lighthouse, E2E |
| `devops` | Sonnet | Vercel, CI/CD, env vars, monitoring |
| `security` | Opus | On-demand security audit (called before deploy) |

**Current state:** Root layout, empty page, one Button component, `cn()` utility, pre-commit hooks. No packages for DB/auth/payments/testing installed.

### Architecture Refinements (applied before this plan)

1. **Two-step chart flow:** `POST /api/v1/chart/calculate` creates a temp DB record and returns `chartId` immediately. `POST /api/v1/chart/save` associates user + encrypts PII. Temp records cleaned by cron after 7 days.
2. **Dual longitudes:** API returns both `siderealLongitude` and `tropicalLongitude` per planet — client toggles without server call.
3. **Data model:** Added `status` ('temp'/'saved') to `natal_chart`, `chart_id` FK to `cosmic_passport`.
4. **Rate limits:** Canonical table in `docs/security.md` covering all 9 endpoints.
5. **Server-side geocoding/timezone:** No client-side `timezone-lookup`. Cities API returns timezone, server resolves via `date-fns-tz`.
6. **Cities strategy:** Static JSON (GeoNames cities15000, ~24K cities, ~2-3MB) loaded in memory on cold start.
7. **Sentry:** `@sentry/nextjs` from step 1 (free tier 5K errors/mo, source maps, alerting).
8. **Planetary hours:** P0 — PlanetaryHourBar in app header, primary daily retention mechanism.
9. **Crimson Pro font:** Preloaded globally. Used on chart wheel, positions table, landing.

---

## Dependency Graph

```
shared/types → shared/validation → shared/encryption → shared/lib (DB, Redis)
                                                              |
sweph integration (astro-engine) <──────────────────── Cities API
         |
POST /api/v1/chart/calculate
    |               |              |                |
Chart SVG UI    Moon Calendar    Planetary Hours    Cosmic Passport (NO auth needed)
    |               |              |                |
Essays UI      Moon page       /hours page       OG image + /s/[id] share page
                                                    |
                                              Landing page + Waitlist

Clerk Auth ──> Chart Saving ──> Stripe Subscription ──> Premium Gating

PWA + Analytics + Legal ──> Launch
```

**Critical path:** types → sweph → chart calc API → chart SVG → auth → saving → Stripe (serial).

**Key insight:** Cosmic Passport depends only on chart calculation, NOT on auth. Can ship the viral loop early and independently.

---

## Phase 0: Foundation

### Step 0.1 — Shared Types + Validation Schemas

> **Prerequisites:** none
> **Creates the contract every other module depends on.**

**Agent assignments:**

| Agent | Task | Depends on | Parallel |
|-------|------|------------|----------|
| architect | Define all types, enums, interfaces in `astrology.ts`. Define Zod schemas. Barrel exports | — | — |

**Handoff:** architect → all agents. Output: `src/shared/types/` and `src/shared/validation/` fully typed. Every agent imports from here.

**Install packages:**
```bash
npm install zod nanoid
```

**Files to create:**

| File | Purpose |
|------|---------|
| `src/shared/types/astrology.ts` | Planet, Sign, Aspect, Element, HouseSystem enums. ChartResult, PlanetPosition, HouseCusp, AspectData interfaces. PlanetaryHour type |
| `src/shared/types/api.ts` | API response types: ChartCalculateResponse, MoonPhaseResponse, PlanetaryHoursResponse, CitySearchResponse, PassportResponse |
| `src/shared/types/index.ts` | Barrel re-export |
| `src/shared/validation/chart.ts` | chartCalculateSchema, chartSaveSchema (Zod) |
| `src/shared/validation/common.ts` | Shared sub-schemas: coordinatesSchema, houseSystemEnum, ayanamsaEnum |
| `src/shared/validation/city.ts` | cityQuerySchema |
| `src/shared/validation/passport.ts` | createPassportSchema |
| `src/shared/validation/hours.ts` | planetaryHoursQuerySchema (lat, lon, date?) |
| `src/shared/validation/index.ts` | Barrel re-export |

**Definition of done:**
- [ ] All types compile with `tsc --noEmit`
- [ ] All Zod schemas export `.parse()` and `.safeParse()`
- [ ] PlanetaryHour type includes: planet, startTime, endTime, isDay

---

### Step 0.2 — DB + Encryption + Redis + Sentry

> **Prerequisites:** Step 0.1 (types must exist for schema references)

**Agent assignments:**

| Agent | Task | Depends on | Parallel |
|-------|------|------------|----------|
| backend | Encryption (`pii.ts`), DB client (`db.ts`), Drizzle schema (`schema.ts`), Redis client, rate limiting, `drizzle.config.ts` | — | — |
| devops | Sentry config files (`sentry.*.config.ts`), update `next.config.ts` with `withSentryConfig()`. Set env vars in Vercel: `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `DATABASE_URL`, `UPSTASH_REDIS_REST_URL` | — | with backend |

**Handoff:** backend → all agents (DB schema is the contract). devops → all agents (Sentry catches errors from day 1).

**Install packages:**
```bash
# DB + cache
npm install drizzle-orm @neondatabase/serverless @upstash/redis @upstash/ratelimit

# Dev tooling
npm install -D drizzle-kit dotenv-cli

# Monitoring (day 1 — not deferred)
npm install @sentry/nextjs
```

**Files to create:**

| File | Purpose |
|------|---------|
| `src/shared/encryption/pii.ts` | AES-256-GCM `encrypt()`/`decrypt()` + `encryptBirthData()`/`decryptBirthData()`. Unique IV per record |
| `src/shared/lib/db.ts` | Drizzle client (Neon serverless HTTP driver) |
| `src/shared/lib/schema.ts` | Full Drizzle schema: users, natalCharts, chartPlanets, chartAspects, chartHouses, cosmicPassports, waitlistEntries |
| `src/shared/lib/redis.ts` | Upstash Redis client |
| `src/shared/lib/rate-limit.ts` | Per-endpoint rate limiters (9 endpoints per `docs/security.md`) |
| `drizzle.config.ts` | Drizzle Kit config |
| `sentry.client.config.ts` | Sentry browser SDK init |
| `sentry.server.config.ts` | Sentry server SDK init |
| `sentry.edge.config.ts` | Sentry edge SDK init |
| `next.config.ts` | Update: wrap with `withSentryConfig()` |

**Definition of done:**
- [ ] `db:migrate` applies schema to Neon without errors
- [ ] `encrypt()` → `decrypt()` round-trip test passes (unique IV each call)
- [ ] Redis client connects to Upstash
- [ ] Sentry captures a test error in dev mode
- [ ] Rate limiter returns `{ success: true/false }` for test key

---

### Step 0.3 — sweph Smoke Test + Vercel Deploy Gate

> **Prerequisites:** Step 0.2 (DB must exist for health check context)
> **This is the go/no-go gate. If sweph doesn't load on Vercel, the project needs a different hosting strategy.**

**Agent assignments:**

| Agent | Task | Depends on | Parallel |
|-------|------|------------|----------|
| astro-engine | Install `sweph`, create `ephemeris.ts` wrapper, `constants.ts` | — | — |
| backend | Create `/api/health/sweph` route | astro-engine | after |
| devops | Deploy to Vercel preview, hit health endpoint, verify sweph loads | backend | after |

**Handoff:** astro-engine → backend (ephemeris wrapper). devops → router (**GO/NO-GO decision**). If Vercel fails → escalate to user.

**Install packages:**
```bash
npm install sweph date-fns-tz
```

**Files to create:**

| File | Purpose |
|------|---------|
| `src/modules/astro-engine/ephemeris.ts` | Thin sweph wrapper: `initSweph()`, `calcPlanet()`, `calcHouses()`, `getAyanamsa()`. Moshier mode (no .se1 files) |
| `src/modules/astro-engine/constants.ts` | sweph body IDs, sign names, aspect orbs, Chaldean planetary order |
| `src/app/api/health/sweph/route.ts` | GET: loads sweph, calculates Sun for J2000 epoch, returns ok/error |

**Verification:**
1. Run locally: `GET /api/health/sweph` returns `{ status: "ok", sun: <degrees> }`
2. Deploy to Vercel preview
3. Hit the same endpoint on Vercel preview URL
4. If Vercel returns 500 (native binary fails) → evaluate fallbacks: `swisseph` package, or Railway/Fly.io container

**Definition of done:**
- [ ] `GET /api/health/sweph` returns ok on localhost
- [ ] `GET /api/health/sweph` returns ok on Vercel preview
- [ ] Sun position for J2000 epoch (2000-01-01T12:00:00Z) matches expected value

**STOP if Vercel deploy fails.** Do not proceed until this works.

---

### Step 0.4 — Testing Infrastructure + CI

> **Prerequisites:** Step 0.3 (sweph must work to test astro functions)

**Agent assignments:**

| Agent | Task | Depends on | Parallel |
|-------|------|------------|----------|
| qa | Create `vitest.config.ts`, encryption tests | — | — |
| devops | Create `.github/workflows/ci.yml` (lint + typecheck + test + build) | — | with qa |

**Handoff:** qa + devops → all agents (CI pipeline catches regressions from now on).

**Install packages:**
```bash
npm install -D vitest @playwright/test
```

**Files to create:**

| File | Purpose |
|------|---------|
| `vitest.config.ts` | Vitest config: exclude Playwright, setup env |
| `src/shared/encryption/__tests__/pii.test.ts` | Encryption round-trip, unique IV, invalid key handling |
| `.github/workflows/ci.yml` | Lint + typecheck + unit tests + build |

**Definition of done:**
- [ ] `npm test` runs and passes (encryption tests)
- [ ] CI pipeline green on push to any branch
- [ ] `npm run dev` starts without errors

---

### Step 0.5 — Cities API + Timezone Resolution

> **Prerequisites:** Step 0.4 (CI must be working to validate new code)

**Agent assignments:**

| Agent | Task | Depends on | Parallel |
|-------|------|------------|----------|
| astro-engine | `timezone.ts`, `julian-day.ts`, `cities.ts` search logic. Prepare `data/cities15000.json` | — | — |
| backend | Create `/api/v1/cities` route with rate limiting | astro-engine | after |
| qa | Julian Day tests, timezone edge case tests, cities search tests | backend | after |

**Handoff:** astro-engine → backend (timezone/JD functions). backend → frontend (Cities API ready for autocomplete).

**Files to create:**

| File | Purpose |
|------|---------|
| `src/modules/astro-engine/timezone.ts` | IANA zone + date → UTC offset via `date-fns-tz`. Handles historical timezone changes |
| `src/modules/astro-engine/julian-day.ts` | UTC date → Julian Day via `sweph.utc_to_jd()` |
| `src/modules/astro-engine/cities.ts` | City search: load GeoNames cities15000 JSON, prefix search sorted by population |
| `data/cities15000.json` | GeoNames dataset (~24K cities, population >15000) |
| `src/app/api/v1/cities/route.ts` | GET `/api/v1/cities?q=<query>&limit=10` with rate limiting |
| `tests/astro/julian-day.test.ts` | JD conversion tests: J2000, Crowley (1875-10-12), calendar boundaries |
| `tests/astro/timezone.test.ts` | 9 edge cases: Russia 2011/2014, DST fall-back, UTC offsets |
| `tests/astro/cities.test.ts` | Search returns Moscow, filters by population, handles Cyrillic |

**Definition of done:**
- [ ] Cities API returns correct results for "Moscow", "London", "New York"
- [ ] Timezone resolution handles Russia 2011/2014 changes correctly
- [ ] Julian Day for J2000 epoch matches 2451545.0
- [ ] All new tests pass in CI

---

### Step 0.6 — SEO Infrastructure

> **Prerequisites:** Step 0.1 (types must exist)
> **Can run in parallel with Steps 0.2–0.5.**

**Agent assignments:**

| Agent | Task | Depends on | Parallel |
|-------|------|------------|----------|
| seo-growth | Create all `src/shared/seo/` files: `metadata.ts`, `json-ld.ts`, `internal-links.ts`, `constants.ts`, tests | — | — |

**Handoff:** seo-growth → frontend (every page imports `createMetadata()` and JSON-LD generators from here).

**Install packages:**
```bash
npm install schema-dts
```

**Files to create:**

| File | Agent | Purpose |
|------|-------|---------|
| `src/shared/seo/constants.ts` | SEO-Growth | Site name, base URL, default OG image path, social accounts |
| `src/shared/seo/metadata.ts` | SEO-Growth | `createMetadata()` helper — generates title, description, OG, Twitter Card, canonical |
| `src/shared/seo/json-ld.ts` | SEO-Growth | Schema generators: `articleSchema()`, `faqSchema()`, `howToSchema()`, `organizationSchema()`, `softwareAppSchema()`, `breadcrumbSchema()` |
| `src/shared/seo/internal-links.ts` | SEO-Growth | Internal linking config: `getRelatedPages(slug)` returns 3-5 related page URLs per essay |
| `src/shared/seo/__tests__/metadata.test.ts` | SEO-Growth | Test: title ≤60, description ≤155, canonical is absolute URL |
| `src/shared/seo/__tests__/json-ld.test.ts` | SEO-Growth | Test: each schema validates against schema.org types |

**Definition of done:**
- [ ] `createMetadata({ title, description, path })` returns valid Next.js Metadata object
- [ ] All JSON-LD generators return typed objects matching `schema-dts` types
- [ ] `getRelatedPages('sun-in-aries')` returns relevant internal links
- [ ] All tests pass in CI

---

## Phase 0 Checkpoint

Before proceeding to Phase 1, verify ALL of the following:

- [ ] `npm run dev` starts without errors
- [ ] sweph health check passes on Vercel preview
- [ ] `db:migrate` applies schema to Neon
- [ ] Encryption round-trip test passes
- [ ] Cities API returns results
- [ ] CI pipeline green
- [ ] Sentry captures errors in dev mode
- [ ] SEO utilities (`createMetadata`, JSON-LD generators) importable and tested

---

## Phase 1: Core Astro Engine

### Step 1.1 — Chart Calculation Core

> **Prerequisites:** Phase 0 complete (all checkpoints pass)

**Agent assignments:**

| Agent | Task | Depends on | Parallel |
|-------|------|------------|----------|
| astro-engine | `sidereal.ts`, `signs.ts`, `houses.ts`, `aspects.ts`, `planet-in-house.ts`, `chart.ts` orchestrator, `index.ts` barrel | — | — |
| backend | POST `/api/v1/chart/calculate` route: Zod validation, rate limiting, temp DB record, response | astro-engine | after |
| qa | 10 hand-verified reference charts against Astro.com ±0.01° | backend | after |

**Handoff:** astro-engine → backend (`calculateChart()` function). backend → frontend (chart API ready). qa verifies accuracy before proceeding.

**Files to create:**

| File | Purpose |
|------|---------|
| `src/modules/astro-engine/sidereal.ts` | `tropicalToSidereal()`, `getLahiriAyanamsa()`. Always compute tropical, subtract ayanamsa manually |
| `src/modules/astro-engine/signs.ts` | `absoluteToSignPosition()` — absolute degrees → { sign, degrees, minutes, seconds } |
| `src/modules/astro-engine/houses.ts` | `calculateHouses()` — Placidus + automatic fallback to Whole Sign at polar latitudes (>66.5°) |
| `src/modules/astro-engine/aspects.ts` | `calculateAspects()` — 66 pairs (12 bodies), 7 aspect types, orb table from constants, applying/separating flag |
| `src/modules/astro-engine/planet-in-house.ts` | `getPlanetHouse()` — assign each planet to its house |
| `src/modules/astro-engine/chart.ts` | `calculateChart()` — 7-step orchestrator: JD → planets → ayanamsa → signs → houses → planet-house → aspects |
| `src/modules/astro-engine/index.ts` | Public barrel export |
| `src/app/api/v1/chart/calculate/route.ts` | POST handler: Zod validation → `calculateChart()` → temp DB record → response with both sidereal + tropical positions. `runtime = "nodejs"`, `maxDuration = 10` |

**Definition of done:**
- [ ] POST `/api/v1/chart/calculate` returns all 12 body positions + aspects + houses
- [ ] Sidereal and tropical longitudes both present in response
- [ ] 10 hand-verified reference charts match Astro.com within ±0.01°
- [ ] No birth time → houses=null, planets calculated at noon
- [ ] Polar latitude (Tromso 69.6°N) → Whole Sign fallback

---

### Step 1.2 — Reference Chart Validation (100+)

> **Prerequisites:** Step 1.1 (chart calculation must work)
> **Do NOT proceed to any UI work until this step passes. Chart accuracy is non-negotiable.**

**Agent assignments:**

| Agent | Task | Depends on | Parallel |
|-------|------|------------|----------|
| qa | Create 100+ reference chart fixtures, write all test files (chart, sidereal, signs, houses, aspects), verify all edge cases | — | — |
| astro-engine | Assist with fixture sourcing, debug any calculation failures qa discovers | qa | with qa |

**Handoff:** qa → router (**QUALITY GATE**). All 100+ charts must pass ±0.01° before ANY UI work begins.

**Files to create:**

| File | Purpose |
|------|---------|
| `tests/astro/fixtures/reference-charts.json` | 100+ verified chart fixtures (sourced from Astro.com / Solar Fire) |
| `tests/astro/chart.test.ts` | Full pipeline test: input → calculateChart() → compare against fixtures at ±0.01° |
| `tests/astro/sidereal.test.ts` | Ayanamsa subtraction + wrap-around at 0°/360° boundary |
| `tests/astro/signs.test.ts` | Degree parsing: exact sign boundaries, 0°00'00" cases |
| `tests/astro/houses.test.ts` | Normal, polar (>66.5°), no-birth-time cases |
| `tests/astro/aspects.test.ts` | Aspect detection, applying/separating, 0°/360° conjunction wrap |

**Edge cases that MUST be covered:**
- Polar latitudes (Tromso 69.6°N → Whole Sign fallback)
- No birth time → houses=null, planets at noon UTC
- Sign boundary (exactly 0° after ayanamsa subtraction)
- Retrograde Mercury (speed < 0, isRetrograde: true)
- Conjunction near 0°/360° boundary (358° + 2° = 4° separation, not 356°)
- Historical dates (Crowley: 1875-10-12, 23:42, Leamington Spa)
- Far future dates (2050+)
- Southern hemisphere (Sydney, Buenos Aires)

**Definition of done:**
- [ ] 100+ reference charts pass at ±0.01° tolerance
- [ ] All listed edge cases have explicit test coverage
- [ ] CI runs all chart tests on every push

---

### Step 1.3 — Planetary Hours Calculation

> **Prerequisites:** Step 1.1 (needs sweph for sunrise/sunset calculation)
> **This is a P0 retention feature. PlanetaryHourBar is the reason users open the app daily.**

**Agent assignments:**

| Agent | Task | Depends on | Parallel |
|-------|------|------------|----------|
| astro-engine | `planetary-hours.ts`: sunrise/sunset via sweph, Chaldean order, 24 unequal hours | — | — |
| backend | GET `/api/v1/hours` route with rate limiting | astro-engine | after |
| qa | Tests: Chaldean order, weekday rulers, 24h coverage, polar edge cases | backend | after |

**Handoff:** astro-engine → backend (calculation function). backend → frontend (hours API ready for PlanetaryHourBar).

**Files to create:**

| File | Purpose |
|------|---------|
| `src/modules/astro-engine/planetary-hours.ts` | `calculatePlanetaryHours(lat, lon, date)`: sunrise/sunset via sweph `rise_trans()`, divide day/night into 12 unequal hours each, assign planets in Chaldean order. Returns 24 PlanetaryHour objects |
| `src/app/api/v1/hours/route.ts` | GET `/api/v1/hours?lat=X&lon=Y&date=YYYY-MM-DD` with rate limiting |
| `tests/astro/planetary-hours.test.ts` | Verify: Chaldean order, day ruler matches weekday, hours cover full 24h with no gaps, polar edge cases |

**Definition of done:**
- [ ] API returns 24 planetary hours for given coordinates and date
- [ ] Day hours are longer in summer, shorter in winter (unequal hours)
- [ ] First hour ruler matches weekday (Sunday=Sun, Monday=Moon, etc.)
- [ ] Polar latitudes handled gracefully (midnight sun / polar night)
- [ ] Tests pass in CI

---

## Phase 1 Checkpoint

- [ ] Crowley chart (1875-10-12, 23:42, Leamington Spa) matches Astro.com ±0.01°
- [ ] No birth time → houses=null, planets correct
- [ ] Polar latitude → Whole Sign fallback
- [ ] 100+ reference charts green in CI
- [ ] Planetary hours API returns correct data
- [ ] All tests green

---

## Phase 2: UI — Chart + Moon + Hours

### Step 2.1 — Chart SVG + Birth Data Form

> **Prerequisites:** Phase 1 complete (chart calculation verified, 100+ charts passing)
> **Can run in parallel with Steps 2.2 and 2.3.**

**Agent assignments:**

| Agent | Task | Depends on | Parallel |
|-------|------|------------|----------|
| frontend | `ChartWheel.tsx`, `PlanetGlyph.tsx`, `AspectLines.tsx`, `PositionTable.tsx`, `BirthDataForm.tsx`, `CityAutocomplete.tsx`, chart page | — | — |
| seo-growth | Provide `createMetadata()` call for `/chart` page, `softwareAppSchema()` JSON-LD. Review heading hierarchy | — | with frontend |
| qa | Accessibility audit: VoiceOver reads positions, keyboard nav, touch targets | frontend | after |

**Handoff:** frontend → qa (chart page complete). seo-growth signs off on SEO checklist.

**Files to create:**

| File | Purpose |
|------|---------|
| `src/modules/astro-engine/components/ChartWheel.tsx` | SVG natal chart wheel: 12 sign sectors, house cusps, planet glyphs, aspect lines. Force-directed radial positioning for conjunctions |
| `src/modules/astro-engine/components/PlanetGlyph.tsx` | Individual planet SVG glyph with `aria-label` |
| `src/modules/astro-engine/components/AspectLines.tsx` | Aspect lines between planets (color-coded by type) |
| `src/modules/astro-engine/components/PositionTable.tsx` | Accessible text table: all positions in text. `sr-only` for screen readers, visible toggle for data view |
| `src/modules/astro-engine/components/BirthDataForm.tsx` | Date picker + "time known" toggle + city autocomplete |
| `src/modules/astro-engine/components/CityAutocomplete.tsx` | Debounced (300ms) city search, dropdown with city + country + population |
| `src/app/(app)/chart/page.tsx` | Chart page: BirthDataForm → loading → ChartWheel + PositionTable |

**Definition of done:**
- [ ] User enters birth data → sees rendered SVG chart
- [ ] Sidereal/tropical toggle switches instantly (client-side offset, no server call)
- [ ] Mobile responsive at 375px
- [ ] VoiceOver/NVDA reads planet positions from PositionTable
- [ ] Conjunct planets don't overlap visually
- [ ] Page has valid metadata via `createMetadata()` and JSON-LD schema

---

### Step 2.2 — Moon Phase + Calendar

> **Prerequisites:** Step 1.1 (sweph for moon calculations)
> **Can run in parallel with Steps 2.1 and 2.3.**

**Agent assignments:**

| Agent | Task | Depends on | Parallel |
|-------|------|------------|----------|
| astro-engine | `moon-phase.ts`: phase calculation, illumination, next new/full moon | — | — |
| backend | GET `/api/v1/moon/current` route | astro-engine | after |
| frontend | `MoonCalendar.tsx`, `/moon` page | backend | after |
| seo-growth | Metadata for `/moon` targeting "moon phase today" (50K-100K/mo). JSON-LD | — | with frontend |
| qa | Verify phases against timeanddate.com for 12 known dates | frontend | after |

**Handoff:** astro-engine → backend → frontend (sequential pipeline). seo-growth provides metadata in parallel.

**Files to create:**

| File | Purpose |
|------|---------|
| `src/modules/astro-engine/moon-phase.ts` | `getCurrentMoonPhase(date)`: phase name, illumination %, angle, next new/full moon dates |
| `src/modules/astro-engine/components/MoonCalendar.tsx` | Monthly grid view: each day shows moon phase icon + illumination |
| `src/app/(app)/moon/page.tsx` | Moon calendar page |
| `src/app/api/v1/moon/current/route.ts` | GET: current moon phase + next new/full dates |
| `tests/astro/moon-phase.test.ts` | Verify phases against timeanddate.com for 12 known dates |

**Definition of done:**
- [ ] Moon phase matches timeanddate.com for known dates
- [ ] Calendar displays correct icons for each day of current month
- [ ] Next new/full moon dates accurate within ±1 minute
- [ ] Page metadata targets "moon phase today" keyword cluster

---

### Step 2.3 — Planetary Hours UI + PlanetaryHourBar

> **Prerequisites:** Step 1.3 (planetary hours API must work)
> **Can run in parallel with Steps 2.1 and 2.2.**

**Agent assignments:**

| Agent | Task | Depends on | Parallel |
|-------|------|------------|----------|
| frontend | `PlanetaryHourBar.tsx`, `PlanetaryHoursGrid.tsx`, `/hours` page, update `(app)/layout.tsx` with PlanetaryHourBar in header | — | — |
| seo-growth | Metadata for `/hours` targeting "planetary hours today" (5K-10K/mo) | — | with frontend |

**Handoff:** frontend delivers app layout with PlanetaryHourBar visible on every page.

**Files to create:**

| File | Purpose |
|------|---------|
| `src/modules/astro-engine/components/PlanetaryHourBar.tsx` | Persistent single line in app header: "☿ Mercury Hour — 47min left". Updates locally every minute. Tap → `/hours` |
| `src/modules/astro-engine/components/PlanetaryHoursGrid.tsx` | Full day view: 24 hours grid with current hour highlighted |
| `src/app/(app)/hours/page.tsx` | Planetary hours page: today's grid + date picker |
| `src/app/(app)/layout.tsx` | App layout: includes PlanetaryHourBar in header |

**Definition of done:**
- [ ] PlanetaryHourBar visible on every app page
- [ ] Shows correct current planetary hour for user's location
- [ ] Timer counts down without server calls
- [ ] `/hours` page shows full 24-hour grid
- [ ] Hour transitions happen at the correct time
- [ ] Page metadata targets "planetary hours today" keyword cluster

---

## Phase 2 Checkpoint

- [ ] Full user flow: enter birth data → see chart → toggle sidereal/tropical
- [ ] Moon calendar shows correct phases
- [ ] PlanetaryHourBar visible and updating on all app pages
- [ ] `/hours` page renders full day grid
- [ ] All components mobile responsive (375px)
- [ ] Accessibility: VoiceOver reads chart positions
- [ ] **SEO: all 3 app pages have valid metadata, JSON-LD schemas, target keywords**

---

## Phase 3: Content — Essays + 777

### Step 3.1 — 777 Correspondences Data

> **Prerequisites:** Step 0.1 (types)
> **Can start as soon as Step 0.1 is complete. Independent of Phases 1 and 2.**

**Agent assignments:**

| Agent | Task | Depends on | Parallel |
|-------|------|------------|----------|
| content | Create `777.json` structured data (32 paths, all attributions). Verify pre-1929 sources only | — | — |
| backend | `correspondences.ts` query functions: `getBySign()`, `getByPlanet()`, `getByPath()` | content | after |
| qa | Data integrity tests: all 32 paths, no missing fields | backend | after |

**Handoff:** content → backend (JSON data). backend → frontend (query API ready for essays).

**Files to create:**

| File | Purpose |
|------|---------|
| `content/correspondences/777.json` | Structured 777 data: 32 paths, each with Tarot trump, Hebrew letter, color scales, stone, perfume, plant, animal, sign/planet attribution |
| `src/modules/esoteric/lib/correspondences.ts` | Query functions: `getBySign()`, `getByPlanet()`, `getByPath()` |
| `tests/esoteric/correspondences.test.ts` | Verify data integrity: all 32 paths present, no missing fields |

**Definition of done:**
- [ ] All 32 paths of 777 represented with correct attributions
- [ ] Query functions return correct data for each sign and planet
- [ ] Tests verify data completeness

---

### Step 3.2 — Ephemeris Table Generation Script

> **Prerequisites:** Step 1.1 (sweph must work for calculations)
> **Can run in parallel with Step 3.1.**

**Agent assignments:**

| Agent | Task | Depends on | Parallel |
|-------|------|------------|----------|
| seo-growth | Create `scripts/generate-ephemeris-tables.ts` build-time script. Define output JSON structure | — | — |
| astro-engine | Provide sweph API guidance for sign ingress dates. Review calculation accuracy | — | with seo-growth |
| qa | Verify 5 spot-check dates against manual sweph calculations | seo-growth | after |

**Handoff:** seo-growth → content (ephemeris JSON ready for essay references). seo-growth → frontend (JSON importable as static data in essay pages).

**Files to create:**

| File | Purpose |
|------|---------|
| `scripts/generate-ephemeris-tables.ts` | Build-time script: calls sweph for each planet × sign, calculates entry/exit dates for 5 years, outputs JSON |
| `src/modules/esoteric/data/ephemeris-tables.json` | Generated output (~50KB) |

**Definition of done:**
- [ ] Script generates ephemeris data for all 120 planet × sign combinations
- [ ] Dates verified against manual sweph calculations for 5 spot checks
- [ ] JSON file importable as static data (no server call at page render)

---

### Step 3.3 — Essay Content Generation (120 essays)

> **Prerequisites:** Step 3.1 (777 data), Step 3.2 (ephemeris tables)

**Agent assignments:**

| Agent | Task | Depends on | Parallel |
|-------|------|------------|----------|
| seo-growth | Define AEO structure template, keyword targets per essay, FAQ question bank, internal/external link map | — | — |
| content | Generate 120 MDX files in batches of 10-12 (per planet). Follow AEO template. Verify legal compliance | seo-growth | after |
| seo-growth | **Review each batch**: AEO first paragraph, FAQ targets, similarity <30%, link placeholders, 777 accuracy | content | after each batch |

**Handoff:** content delivers batches of 10-12 essays → seo-growth reviews → approved batches accumulate until 120 complete.

**Files to create:**
- `content/essays/sun-in-aries.mdx` through `content/essays/pluto-in-pisces.mdx` (120 files: 10 planets × 12 signs)

**Essay structure (defined by SEO-Growth agent per AEO strategy):**
1. **Direct answer** (1st paragraph) — 40-60 words, specific dates/degrees, no filler
2. **Key Traits** section — 5-7 bullet points
3. **Sidereal vs Tropical comparison table** — specific date ranges
4. **777 Correspondences** — Tarot, Hebrew letter, Color, Stone (from 777.json)
5. **FAQ section** — 3-5 questions (JSON-LD `FAQPage` schema)
6. **Ephemeris table** — from `ephemeris-tables.json`, NOT hallucinated
7. **Disclaimer** — "Astrology is not medical, financial, or legal advice"

**SEO-Growth review per batch:**
- [ ] First paragraph is direct answer (featured snippet target)
- [ ] FAQ questions match target search queries
- [ ] Comparison table has specific date ranges
- [ ] Similarity score < 30% between essays
- [ ] Internal link placeholders (3-5, descriptive anchor text)
- [ ] External link placeholders (1-2, NASA/IAU/Wikipedia)

**Definition of done:**
- [ ] 120 .mdx files in `content/essays/`
- [ ] Each essay has all 7 sections
- [ ] SEO-Growth review passed on all batches
- [ ] No copyrighted material (per CLAUDE.md legal rules)
- [ ] Ephemeris dates come from generated JSON, not hallucinated

---

### Step 3.4 — Essay UI + MDX Rendering

> **Prerequisites:** Step 3.3 (essays must exist), Step 2.1 (app layout must exist), Step 0.6 (SEO utilities)

**Install packages:**
```bash
npm install @vercel/og
```

**Agent assignments:**

| Agent | Task | Depends on | Parallel |
|-------|------|------------|----------|
| frontend | All essay components: `EssayPage`, `CorrespondencesTable`, `MiniCalculator`, `EphemerisTable`, `Disclaimer`, `SiderealVsTropicalTable`, `InternalLinks`. Essay route + layout | — | — |
| backend | Create `/api/og/essay/[slug]` OG image route via `@vercel/og` (Satori). Dark bg + planet glyph + sign + branding | — | with frontend |
| seo-growth | Create `essays-seo.test.ts` and `internal-links.test.ts`. Review every page against 16-point checklist | — | with frontend |
| qa | Verify all 120 pages render, MiniCalculator works, a11y check, JSON-LD validates, OG images render | frontend + backend + seo-growth | after |

**Handoff:** frontend + seo-growth → qa (all essays rendered with full SEO). qa signs off on rendering + accessibility.

**Files to create by Frontend:**

| File | Purpose |
|------|---------|
| `src/modules/esoteric/lib/essays.ts` | Load/parse MDX files, extract frontmatter |
| `src/modules/esoteric/components/EssayPage.tsx` | Full essay layout: header + body + correspondences + FAQ + ephemeris + disclaimer |
| `src/modules/esoteric/components/CorrespondencesTable.tsx` | 777 data display table |
| `src/modules/esoteric/components/MiniCalculator.tsx` | Inline widget: "Is YOUR Sun in sidereal Pisces?" |
| `src/modules/esoteric/components/EphemerisTable.tsx` | Sign entry/exit dates table (imports from `ephemeris-tables.json`) |
| `src/modules/esoteric/components/Disclaimer.tsx` | Standard astrology disclaimer |
| `src/modules/esoteric/components/SiderealVsTropicalTable.tsx` | Comparison table |
| `src/modules/esoteric/components/InternalLinks.tsx` | Related essays component using `getRelatedPages()` |
| `src/app/(app)/essays/[slug]/page.tsx` | Dynamic essay route with `generateStaticParams()`. Uses `createMetadata()` + `articleSchema()` + `faqSchema()` |

**Files to create by Backend:**

| File | Purpose |
|------|---------|
| `src/app/api/og/essay/[slug]/route.ts` | Dynamic OG image for essays via `@vercel/og`. Cached on CDN |

**Files to create by SEO-Growth:**

| File | Purpose |
|------|---------|
| `src/shared/seo/__tests__/essays-seo.test.ts` | Test: all 120 essays have unique title ≤60, unique description ≤155, valid JSON-LD, 3-5 internal links |
| `src/shared/seo/__tests__/internal-links.test.ts` | Test: no broken internal links, every essay has 3-5 links, varied anchor text |

**Definition of done:**
- [ ] All 120 essay pages render at `/essays/<slug>`
- [ ] All sections present: traits, comparison, 777, FAQ, ephemeris, disclaimer, internal links
- [ ] MiniCalculator works (enter date → see your sidereal sign)
- [ ] JSON-LD validates in Google Rich Results Test
- [ ] SEO test suite passes for all 120 essays
- [ ] OG image renders for each essay

---

## Phase 3 Checkpoint

- [ ] 120 essays render with all sections
- [ ] 777 correspondences display correctly
- [ ] MiniCalculator on essays works
- [ ] JSON-LD structured data validates
- [ ] **SEO: all 120 essays pass automated SEO test suite**
- [ ] **SEO: OG images render for all essays**
- [ ] **SEO: ephemeris tables display real Swiss Ephemeris data**

---

## Phase 4: Cosmic Passport + Viral Loop

### Step 4.1 — Passport Backend

> **Prerequisites:** Step 1.1 (chart calculation)
> **Can run in parallel with Phase 3.**

**Agent assignments:**

| Agent | Task | Depends on | Parallel |
|-------|------|------------|----------|
| astro-engine | `rarity.ts` (12×12 Sun×Moon lookup), `passport.ts` (generate passport from chart) | — | — |
| backend | POST `/api/v1/passport` route (nanoid ID, store in DB). GET `/api/og/passport/[id]` OG image via `@vercel/og` | astro-engine | after |
| qa | Verify: passport created, OG image renders, no PII in DB record | backend | after |

**Handoff:** backend → frontend (passport API + OG endpoint ready).

**Files to create:**

| File | Purpose |
|------|---------|
| `src/modules/astro-engine/rarity.ts` | 12×12 Sun × Moon rarity lookup table |
| `src/modules/astro-engine/passport.ts` | `generatePassport(chartResult)`: extract Sun/Moon/ASC signs, element, ruling planet, rarity % |
| `src/app/api/v1/passport/route.ts` | POST: create passport (nanoid 8-char ID), store in DB. No auth required |
| `src/app/api/og/passport/[id]/route.ts` | GET: generate OG image via `@vercel/og`. Cached on CDN |

**Zero PII in passport data** — only sign results, element, rarity percentage.

**Definition of done:**
- [ ] POST creates passport with unique 8-char ID
- [ ] GET `/api/og/passport/[id]` returns valid PNG image
- [ ] OG image renders correctly in Twitter Card Validator
- [ ] No PII stored in passport record

---

### Step 4.2 — Passport UI + Share Flow

> **Prerequisites:** Step 4.1 (passport API), Step 2.1 (chart page exists)

**Agent assignments:**

| Agent | Task | Depends on | Parallel |
|-------|------|------------|----------|
| frontend | `PassportCard.tsx`, `ShareButton.tsx`, `/s/[id]` share page | — | — |
| seo-growth | OG meta for `/s/[id]` (noindex, nofollow). Validate OG in Twitter/Telegram. Define all PostHog passport events | — | with frontend |
| qa | E2E: full viral loop (create → share → open → CTA → create). Verify zero PII on share page | frontend + seo-growth | after |

**Handoff:** frontend + seo-growth → qa (viral loop ready for testing).

**Files to create:**

| File | Purpose |
|------|---------|
| `src/modules/astro-engine/components/PassportCard.tsx` | Visual passport card: Sun/Moon/ASC glyphs + sign names, element badge, rarity % |
| `src/modules/astro-engine/components/ShareButton.tsx` | Web Share API + fallbacks: copy link, Twitter intent, Telegram. PNG download |
| `src/app/s/[id]/page.tsx` | Public share page: PassportCard + CTA. noindex, nofollow |

**PostHog events (defined by SEO-Growth):**
- `passport_created`, `passport_shared` (with channel), `passport_viewed`, `passport_converted`, `passport_reshared`

**Definition of done:**
- [ ] Full viral loop works end-to-end
- [ ] OG image renders in Twitter/Telegram/WhatsApp preview
- [ ] PNG download produces valid image for Instagram Stories
- [ ] Zero PII visible on share page
- [ ] **SEO: share pages are noindex/nofollow**

---

## Phase 4 Checkpoint

- [ ] Full viral loop: calculate → passport → share → friend opens → CTA → calculates → shares
- [ ] OG image preview works in Twitter/Telegram
- [ ] All analytics events instrumented
- [ ] **SEO: OG meta tags validate in Twitter Card Validator**

---

## Phase 5: Landing + Marketing Pages

### Step 5.1 — Landing Page + Waitlist

> **Prerequisites:** Step 4.2 (passport flow — landing CTA leads to chart/passport), Step 0.6 (SEO utilities)

**Agent assignments:**

| Agent | Task | Depends on | Parallel |
|-------|------|------------|----------|
| frontend | Landing page, marketing layout, `HeroCalculator.tsx`. Apply anti-AI-slop checklist | — | — |
| backend | POST `/api/v1/waitlist` route, `email.ts` Resend wrapper | — | with frontend |
| seo-growth | Metadata, `softwareAppSchema()`, `organizationSchema()`, preload/preconnect hints. SEO review | — | with frontend |
| qa | Lighthouse >= 90, waitlist E2E, anti-AI-slop audit | frontend + backend + seo-growth | after |

**Install packages:**
```bash
npm install resend framer-motion
```

**Files to create:**

| File | Purpose |
|------|---------|
| `src/app/(marketing)/page.tsx` | Landing page: hero + inline calculator + CTA + social proof |
| `src/app/(marketing)/layout.tsx` | Marketing layout. Injects `organizationSchema()` site-wide |
| `src/modules/astro-engine/components/HeroCalculator.tsx` | Inline birth form on landing |
| `src/app/api/v1/waitlist/route.ts` | POST: save email + send welcome via Resend |
| `src/shared/lib/email.ts` | Resend client wrapper |

**Anti-AI-slop checklist (mandatory):**
- [ ] Crimson Pro for esoteric headings, Geist Sans for UI
- [ ] Textured dark background (#0A0A0F base), not flat black
- [ ] Staggered entrance animations (not everything at once)
- [ ] Weighted button hierarchy (primary solid, secondary ghost)
- [ ] No generic gradients, no glassmorphism
- [ ] Planetary color accents (gold Sun, silver Moon)

**Definition of done:**
- [ ] Landing page polished on mobile (375px) and desktop
- [ ] HeroCalculator: enter date → see result → CTA to full chart/passport
- [ ] Waitlist accepts email, sends welcome via Resend
- [ ] Lighthouse Performance >= 90
- [ ] Anti-AI-slop checklist passes

---

### Step 5.2 — Sign Overview Pages (12)

> **Prerequisites:** Step 3.4 (essays exist — sign pages link to all essays for that sign)

**Agent assignments:**

| Agent | Task | Depends on | Parallel |
|-------|------|------------|----------|
| content | Write overview text for each of 12 signs (sidereal perspective, 500-800 words each) | — | — |
| frontend | `/signs/[sign]` dynamic route page (12 pages). Links to all 10 essays for that sign | content | after |
| seo-growth | Metadata for each sign page. Internal links: sign → all 10 essays + pillar. SEO review | — | with frontend |

**Files to create:**

| File | Purpose |
|------|---------|
| `content/signs/descriptions.json` | Overview data for 12 signs (sidereal dates, key traits, element, modality) |
| `src/app/(app)/signs/[sign]/page.tsx` | Dynamic sign overview route with `generateStaticParams()` for 12 signs |

**Definition of done:**
- [ ] All 12 sign pages render at `/signs/<sign>`
- [ ] Each sign page links to its 10 essays
- [ ] Metadata unique per sign, JSON-LD validates

---

### Step 5.3 — "Why Sidereal" + Sitemap + robots.txt

> **Prerequisites:** Step 5.1 (marketing layout), Step 5.2 (sign pages exist)

**Agent assignments:**

| Agent | Task | Depends on | Parallel |
|-------|------|------------|----------|
| frontend | `/why-sidereal` page, `PrecessionDiagram.tsx` animated SVG | — | — |
| seo-growth | Create `sitemap.ts`, `robots.ts`, sitemap test. SEO review on "Why Sidereal" pillar page | — | with frontend |
| qa | Sitemap validates, robots.txt correct, "Why Sidereal" renders all sections | frontend + seo-growth | after |

**Files to create by Frontend:**

| File | Purpose |
|------|---------|
| `src/app/(marketing)/why-sidereal/page.tsx` | Pillar page: precession of equinoxes, sidereal vs tropical. Uses `createMetadata()` + `articleSchema()` + `faqSchema()` + `howToSchema()` |
| `src/modules/esoteric/components/PrecessionDiagram.tsx` | Animated SVG: Earth's axis wobble |

**Files to create by SEO-Growth:**

| File | Purpose |
|------|---------|
| `src/app/sitemap.ts` | Dynamic sitemap (~138 URLs). Post-MVP: +12 comparison pages, +city-hours pages |
| `src/app/robots.ts` | `Disallow: /api/` (except `Allow: /api/og/`), `Disallow: /s/` |
| `src/shared/seo/__tests__/sitemap.test.ts` | Test: all expected URLs, no orphans, no duplicates |

**Sitemap page count (MVP):**
| Category | Count |
|----------|-------|
| Landing + why-sidereal + pricing | 3 |
| App pages: chart + moon + hours | 3 |
| 120 essays | 120 |
| 12 sign overview pages | 12 |
| **Total** | **~138** |

**Definition of done:**
- [ ] "Why Sidereal" page with AEO-optimized first paragraph
- [ ] Sitemap includes all ~138 pages
- [ ] robots.txt blocks API routes, allows OG images
- [ ] Sitemap test passes
- [ ] JSON-LD validates in Google Rich Results Test

---

## Phase 5 Checkpoint

- [ ] Landing page live, polished, fast (Lighthouse >= 90)
- [ ] 12 sign overview pages render, each linking to its 10 essays
- [ ] "Why Sidereal" educational page complete
- [ ] Sitemap + robots.txt in place
- [ ] **SEO: sitemap test passes (all ~138 URLs, no orphans)**

---

## Phase 6: Auth + Chart Saving

### Step 6.1 — Clerk Auth Integration

> **Prerequisites:** Phase 2 complete (app layout exists for auth UI)

**Agent assignments:**

| Agent | Task | Depends on | Parallel |
|-------|------|------------|----------|
| backend | Clerk middleware/proxy (check current docs!), `auth/lib/helpers.ts`, Clerk webhook handler | — | — |
| frontend | `SignInButton.tsx`, `UserMenu.tsx` | backend | after |
| qa | All pre-existing tests still pass. Auth flow E2E | frontend | after |

**Important:** Check current `@clerk/nextjs` docs for Next.js 16 pattern (proxy.ts vs middleware.ts).

**Install packages:**
```bash
npm install @clerk/nextjs
```

**Files to create:**

| File | Purpose |
|------|---------|
| `src/middleware.ts` OR `src/proxy.ts` | Clerk auth (per current docs) |
| `src/modules/auth/lib/helpers.ts` | `getCurrentUser()`, `requireAuth()`, `requireTier()` |
| `src/modules/auth/components/SignInButton.tsx` | Clerk sign-in trigger |
| `src/modules/auth/components/UserMenu.tsx` | User dropdown |
| `src/app/api/webhooks/clerk/route.ts` | Clerk webhook with svix verification |

**Definition of done:**
- [ ] Sign up → user created in DB via webhook
- [ ] Protected routes redirect to sign-in
- [ ] Public routes accessible without auth
- [ ] All pre-existing tests still pass (zero regressions)

---

### Step 6.2 — Chart Saving + CRUD

> **Prerequisites:** Step 6.1 (auth must work)

**Agent assignments:**

| Agent | Task | Depends on | Parallel |
|-------|------|------------|----------|
| backend | Chart save/list/get/delete API routes. PII encryption on save | — | — |
| frontend | `/charts` saved charts list page | backend | after |
| security | Audit: PII encryption, owner-only access, no PII in logs/URLs | backend | after |
| qa | E2E: save → list → sign out → sign in → still there. PII is ciphertext in DB | frontend + security | after |

**Files to create:**

| File | Purpose |
|------|---------|
| `src/app/api/v1/chart/save/route.ts` | POST: encrypt birth data + save |
| `src/app/api/v1/chart/list/route.ts` | GET: list user's saved charts |
| `src/app/api/v1/chart/[id]/route.ts` | GET/DELETE: single chart (owner only) |
| `src/app/(app)/charts/page.tsx` | Saved charts list page |

**Definition of done:**
- [ ] Save chart → see in "My Charts" list
- [ ] PII encrypted in DB (verify via raw SQL)
- [ ] Non-owner cannot access another user's chart

---

## Phase 6 Checkpoint

- [ ] Auth: sign up → save chart → sign out → sign in → chart still there
- [ ] PII encrypted in DB
- [ ] All tests still green

---

## Phase 7: Payments

### Step 7.1 — Stripe Subscription

> **Prerequisites:** Phase 6 complete

**Agent assignments:**

| Agent | Task | Depends on | Parallel |
|-------|------|------------|----------|
| backend | Stripe checkout/portal/webhook routes, `premium.ts` guards | — | — |
| frontend | `/pricing` page, `/settings` page | backend | after |
| seo-growth | Metadata for `/pricing` page | — | with frontend |
| security | Audit: webhook signature, no Stripe keys in client | backend | after |
| qa | E2E: upgrade → premium → manage → cancel | frontend + security | after |

**Install packages:**
```bash
npm install stripe
```

**Files to create:**

| File | Purpose |
|------|---------|
| `src/app/api/v1/stripe/checkout/route.ts` | POST: create Checkout session |
| `src/app/api/v1/stripe/portal/route.ts` | POST: Billing Portal session |
| `src/app/api/webhooks/stripe/route.ts` | Webhook handler |
| `src/modules/auth/lib/premium.ts` | `isPremium()`, `requirePremium()` guards |
| `src/app/(marketing)/pricing/page.tsx` | Pricing page |
| `src/app/(app)/settings/page.tsx` | User settings + subscription management |

**Definition of done:**
- [ ] Free user upgrades via Stripe Checkout → premium active
- [ ] Payment failure → 3-day grace period → downgrade
- [ ] Cancellation → downgrade at period end
- [ ] Stripe test mode works end-to-end

---

## Phase 8: PWA + Analytics + Legal

### Step 8.1 — PWA + PostHog Analytics

> **Prerequisites:** Phase 5 (landing page), Phase 6 (auth)
> **Note:** After this step, revisit all pages from Phases 2-7 and add `trackEvent()` calls.

**Agent assignments:**

| Agent | Task | Depends on | Parallel |
|-------|------|------------|----------|
| frontend | PWA manifest, icons, service worker, `CookieConsent.tsx`, `PostHogProvider.tsx`. Instrument `trackEvent()` on all existing pages | — | — |
| backend | `analytics.ts` PostHog wrapper. Add server-side events | — | with frontend |
| seo-growth | Verify all canonical event names are instrumented correctly | frontend + backend | after |
| qa | PWA installable. PostHog receives events | frontend + backend | after |

**Install packages:**
```bash
npm install posthog-js posthog-node
```

**Files to create:**

| File | Purpose |
|------|---------|
| `public/manifest.json` | PWA manifest |
| `public/icons/icon-192.png`, `icon-512.png` | App icons |
| `src/shared/lib/analytics.ts` | PostHog wrapper: `trackEvent()`, `identifyUser()` |
| `src/shared/components/CookieConsent.tsx` | Cookie consent banner (GDPR) |
| `src/shared/components/PostHogProvider.tsx` | Client-side PostHog provider |

**Definition of done:**
- [ ] PWA installable on iOS/Android/Desktop
- [ ] PostHog receives events in test mode
- [ ] Cookie consent controls PostHog initialization

---

### Step 8.2 — Legal Pages + GDPR

> **Prerequisites:** Step 6.2 (chart saving)

**Agent assignments:**

| Agent | Task | Depends on | Parallel |
|-------|------|------------|----------|
| content | Terms of Service text, Privacy Policy text | — | — |
| frontend | `/terms` and `/privacy` pages | content | after |
| backend | GDPR data export endpoint, account deletion endpoint | — | with content |
| qa | Data export returns all user data. Deletion cascades | frontend + backend | after |

**Files to create:**

| File | Purpose |
|------|---------|
| `src/app/(marketing)/terms/page.tsx` | Terms of Service |
| `src/app/(marketing)/privacy/page.tsx` | Privacy Policy |
| `src/app/api/v1/user/data-export/route.ts` | GDPR data export |
| `src/app/api/v1/user/account/route.ts` | DELETE: GDPR account deletion |

**Definition of done:**
- [ ] Terms and Privacy pages render
- [ ] Data export returns all user data as JSON
- [ ] Account deletion cascades completely

---

### Step 8.3 — MCP Server

> **Prerequisites:** Steps 1.1, 1.3, 3.1

**Agent assignments:**

| Agent | Task | Depends on | Parallel |
|-------|------|------------|----------|
| astro-engine | Build 5 MCP tools wrapping existing API endpoints | — | — |
| backend | Rate limiting for MCP endpoints | astro-engine | after |
| qa | Test all 5 tools against reference data | backend | after |
| devops | Publish to Smithery, configure access | qa | after |

**5 tools:**
| Tool | Maps to |
|------|---------|
| `calculate_chart` | POST `/api/v1/chart/calculate` |
| `get_moon_phase` | GET `/api/v1/moon/current` |
| `get_planetary_hours` | GET `/api/v1/hours` |
| `compare_sidereal_tropical` | POST `/api/v1/chart/calculate` (both modes) |
| `get_correspondences_777` | Query `777.json` by sign/planet |

**Definition of done:**
- [ ] MCP server responds to all 5 tools
- [ ] Responses include `estrevia.app/s/[id]` link where applicable
- [ ] Rate limiting applied

---

## Phase 9: Final Verification + Launch

### Step 9.1 — E2E Test Suite

> **Prerequisites:** All previous phases

**Agent assignments:**

| Agent | Task | Depends on | Parallel |
|-------|------|------------|----------|
| qa | Create all E2E test files with Playwright. Run full suite | — | — |

**Files to create:**

| File | Purpose |
|------|---------|
| `tests/e2e/chart-flow.spec.ts` | Enter birth data → see chart → toggle sidereal/tropical |
| `tests/e2e/passport-flow.spec.ts` | Calculate → create passport → share → open share page → CTA |
| `tests/e2e/auth-flow.spec.ts` | Sign up → save chart → sign out → sign in → chart there |
| `tests/e2e/stripe-flow.spec.ts` | Upgrade → premium → manage → cancel (Stripe test mode) |
| `tests/e2e/moon-hours.spec.ts` | Moon calendar + planetary hours pages load |
| `tests/e2e/essay.spec.ts` | Essay pages render all sections, MiniCalculator works |

**Definition of done:**
- [ ] All 6 E2E test files created and passing
- [ ] Full user journey works end-to-end in browser
- [ ] No flaky tests (run suite 3× — all green each time)

---

### Step 9.2 — SEO Pre-Launch Audit

> **Can run in parallel with Step 9.1.**

**Agent assignments:**

| Agent | Task | Depends on | Parallel |
|-------|------|------------|----------|
| seo-growth | Full 24-point SEO audit. Run SEO test suite. Fix any issues | — | — |
| frontend | Fix any CWV issues seo-growth discovers | seo-growth | after (if needed) |

**Full-site SEO checklist (16 per-page + 8 site-wide):**

Per-page checks:

| # | Check | Requirement |
|---|-------|-------------|
| 1 | `<title>` | Unique, ≤60 chars, primary keyword near start |
| 2 | `meta description` | Unique, ≤155 chars, CTA or value prop |
| 3 | Canonical | Self-referencing, absolute URL |
| 4 | OG tags | og:title, og:description, og:image (1200×630) |
| 5 | Twitter Card | summary_large_image |
| 6 | Heading hierarchy | Single H1 with keyword, logical H2→H3 |
| 7 | Images | WebP, width/height, lazy loading, descriptive alt |
| 8 | JSON-LD | Correct schema type, datePublished/dateModified, BreadcrumbList |
| 9 | Internal links | 3-5 contextual, descriptive anchor text |
| 10 | External links | 1-2 authoritative sources on essays/pillars |
| 11 | URL slug | Lowercase, hyphens, 3-5 words, keyword |
| 12 | First paragraph | Direct answer (AEO), 40-60 words |
| 13 | Mobile | Readable at 375px, touch targets ≥44px |
| 14 | Core Web Vitals | LCP < 2.5s, CLS < 0.1, INP < 200ms |
| 15 | noindex | Share pages `/s/[id]` only |
| 16 | Fonts preloaded | Crimson Pro + Geist Sans in `<head>` |

Site-wide checks:

| # | Check |
|---|-------|
| 17 | Sitemap: all ~138 URLs, valid XML |
| 18 | robots.txt: blocks /api/ and /s/, allows /api/og/ |
| 19 | No orphan pages |
| 20 | No broken internal links |
| 21 | Topic clusters: pillar ↔ all cluster pages |
| 22 | Preconnect for Clerk, PostHog |
| 23 | Schema validates (Google Rich Results Test) |
| 24 | Essay similarity < 30% |

**Definition of done:**
- [ ] All 24 checks pass (16 per-page + 8 site-wide)
- [ ] SEO test suite green in CI

---

### Step 9.3 — Security + Performance Audit

> **Can run in parallel with Steps 9.1 and 9.2.**

**Agent assignments:**

| Agent | Task | Depends on | Parallel |
|-------|------|------------|----------|
| security | OWASP top 10 audit, PII verification, webhook signatures, CSP header | — | — |
| qa | Lighthouse all scores >= 90, 100+ reference charts still green | — | with security |
| frontend | Fix any issues found | security + qa | after (if needed) |
| backend | Fix any security issues found | security | after (if needed) |

**Lighthouse scores (all >= 90):**
- [ ] Performance
- [ ] Accessibility
- [ ] Best Practices
- [ ] SEO

**Security checklist:**
- [ ] No XSS, no SQL injection, CSRF protection
- [ ] Rate limiting on all public endpoints
- [ ] PII encryption verified, no secrets in client bundle
- [ ] Webhook signatures verified (Clerk + Stripe)
- [ ] Content-Security-Policy header set
- [ ] 100+ reference charts still green in CI

---

### Step 9.4 — Production Deploy

> **Prerequisites:** Steps 9.1, 9.2, 9.3 all pass

**Agent assignments:**

| Agent | Task | Depends on | Parallel |
|-------|------|------------|----------|
| devops | Configure domain, HTTPS, env vars, DB migration, smoke test | — | — |
| seo-growth | Submit sitemap to GSC, request indexing, verify robots.txt + OG + JSON-LD on production | devops | after |
| qa | Smoke test on production: calculate chart, create passport, share | devops | with seo-growth |

**Checklist:**
- [ ] `estrevia.app` domain configured on Vercel
- [ ] HTTPS active
- [ ] Production env vars set
- [ ] DB migration applied
- [ ] Smoke test: chart calculation works on production
- [ ] OG images render from production URL
- [ ] PWA installable from production
- [ ] Sitemap submitted to GSC
- [ ] PageSpeed Insights green on production

---

## Critical Files

1. **`src/shared/types/astrology.ts`** — contract for all modules
2. **`src/modules/astro-engine/chart.ts`** — 7-step calculation orchestrator
3. **`src/shared/encryption/pii.ts`** — AES-256-GCM (wrong IV = data loss)
4. **`src/modules/astro-engine/components/ChartWheel.tsx`** — most complex component
5. **`src/shared/lib/schema.ts`** — Drizzle DB schema
6. **`src/app/api/v1/chart/calculate/route.ts`** — most-called endpoint
7. **`src/modules/astro-engine/planetary-hours.ts`** — P0 retention feature
8. **`src/shared/seo/metadata.ts`** — SEO single source of truth for all pages
9. **`src/shared/seo/json-ld.ts`** — schema markup generators
10. **`scripts/generate-ephemeris-tables.ts`** — unique data advantage

---

## Parallel Work Map

| Parallel Group | Steps | Why safe |
|---------------|-------|----------|
| Foundation | 0.6 (SEO infra) can run in parallel with 0.2–0.5 | SEO infra depends only on Step 0.1 types |
| Phase 2 UI | 2.1 (Chart SVG) + 2.2 (Moon) + 2.3 (Hours UI) | Independent UI, all depend only on Phase 1 APIs |
| Content prep | 3.1 (777 data) starts after Step 0.1. 3.2 (ephemeris script) starts after Step 1.1 | Independent of each other |
| Content + Passport | 4.1 (passport backend) can start after Step 1.1, in parallel with all of Phase 3 | Passport depends on chart calc only |
| Landing | 5.1 can start once Phase 4 complete (passport flow) | Landing CTA leads to chart/passport |
| Auth + Legal | 8.2 (GDPR) can start after 6.2 | Legal pages independent |

**Never parallel:**
- Step 1.2 (validation) must finish before ANY UI work
- Step 3.2 (ephemeris script) must finish before 3.3 (essays need real dates)
- Step 5.2 (sign pages) must finish before 5.3 (sitemap needs all pages to exist)
- Step 6.1 (auth) must finish before 6.2 (chart saving)
- Step 7.1 (Stripe) must finish before premium gating
- Steps 9.1 + 9.2 + 9.3 (all audits) must finish before 9.4 (production deploy)

---

## Risk Register

| # | Risk | Severity | When | Mitigation |
|---|------|----------|------|------------|
| 1 | sweph native binary fails on Vercel | HIGH | Step 0.3 | Go/no-go gate. Fallback: `swisseph` package or Railway container |
| 2 | Chart accuracy below ±0.01° | HIGH | Step 1.2 | 100+ reference charts in CI. Do NOT proceed to UI until passing |
| 3 | SVG chart rendering complexity | MEDIUM | Step 2.1 | Start simple (signs + dots), progressively add complexity |
| 4 | Cold start on chart calculation | MEDIUM | Step 5.1 | Vercel Fluid Compute. Show animation during wait |
| 5 | Viral loop k-factor < 1 | HIGH (business) | Step 4.2 | Frictionless sharing, compelling card, rarity %. Instrument every funnel step |
| 6 | 120 essays quality control | MEDIUM | Step 3.3 | Batches of 10-12, SEO-Growth reviews each batch |
| 7 | Next.js 16 auth pattern change | LOW | Step 6.1 | Check current @clerk/nextjs docs. Plan supports both middleware.ts and proxy.ts |
| 8 | Google deindexes thin pages | MEDIUM (SEO) | Post-launch | Start with ~138 pages, monitor GSC. Each page has unique data + calculator |
| 9 | AI-generated essay similarity | MEDIUM (SEO) | Step 3.3 | SEO-Growth checks similarity < 30%. Unique ephemeris, FAQ per essay |
| 10 | JSON-LD schema errors | LOW (SEO) | Steps 3.4, 5.3 | Automated test suite. Google Rich Results Test on samples |

---

## Cost (MVP)

| Service | Monthly | When to pay |
|---------|---------|-------------|
| Vercel Pro | $20 | Day 1 |
| Neon | $0 | >5K queries/day |
| Clerk | $0 | >10K MAU |
| Upstash | $0 | >500 DAU |
| PostHog | $0 | >50K DAU |
| Sentry | $0 | >5K errors/mo |
| Stripe | 2.9% + $0.30 | First sale |
| Resend | $0 | >100 emails/day |
| Claude API (essays) | ~$3 one-time | Step 3.3 |
| **Total** | **~$25/mo** | |
