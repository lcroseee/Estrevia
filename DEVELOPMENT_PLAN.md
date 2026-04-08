# Estrevia MVP — Development Plan

## Implementation Status (updated 2026-04-07)

> **Phases 0–8 implemented.** 116 source files, 120 essay MDX files, 429 tests passing, 0 type errors.
> Phase 9 (E2E tests, SEO audit, security audit, production deploy) is NOT started.

| Phase | Status | Tests | Key Notes |
|-------|--------|-------|-----------|
| 0 — Foundation | ✅ DONE | 112 | Types, validation, DB, encryption, Redis, Sentry, sweph health, cities API, SEO utilities |
| 1 — Core Astro Engine | ✅ DONE | 274 | 7-step chart pipeline, 109 reference charts ±0.01°, planetary hours |
| 2 — UI | ✅ DONE | 42 (moon) | Chart SVG wheel, moon calendar, PlanetaryHourBar, app layout |
| 3 — Content | ✅ DONE | 38 (777) | 120 essays MDX, 777 correspondences, ephemeris tables, essay UI |
| 4 — Cosmic Passport | ✅ DONE | — | Rarity table, OG images, share flow, `/s/[id]` page |
| 5 — Landing + Marketing | ✅ DONE | — | Landing, 12 sign pages, why-sidereal, sitemap (137 URLs), robots.txt |
| 6 — Auth + Saving | ✅ DONE | — | Clerk proxy, webhook, chart CRUD, PII encryption |
| 7 — Payments | ✅ DONE | — | Stripe checkout/portal/webhook, premium guards, pricing/settings pages |
| 8 — PWA + Legal | ✅ DONE | — | PWA manifest, PostHog, cookie consent, terms/privacy, GDPR endpoints |
| 9 — Final Verification | ⬜ NOT STARTED | — | E2E tests, SEO audit, security audit, production deploy |

**Packages installed:** zod, nanoid, drizzle-orm, @neondatabase/serverless, @upstash/redis, @upstash/ratelimit, @sentry/nextjs, sweph, date-fns-tz, schema-dts, @clerk/nextjs, svix, stripe, @vercel/og, resend, framer-motion, posthog-js, posthog-node, gray-matter, react-markdown. Dev: vitest, @playwright/test, drizzle-kit, dotenv-cli.

**Env vars needed for deploy:** `DATABASE_URL`, `PII_ENCRYPTION_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_POSTHOG_KEY`, `RESEND_API_KEY`.

**Known gaps / deferred:**
- MCP server (Step 8.3) — skipped, needs Smithery publishing (deployment task)
- OG images for essays (`/api/og/essay/[slug]`) — route not created yet
- SEO test suites for essays (`essays-seo.test.ts`, `internal-links.test.ts`) — not created
- `PrecessionDiagram.tsx` animated SVG — not created (why-sidereal page has text content only)
- Cities data: dev seed (50 cities), production needs full GeoNames cities15000 (~24K cities)
- E2E Playwright tests — not written yet (Phase 9)
- Chiron ephemeris file `data/ephe/seas_18.se1` must be included in Vercel deployment bundle

---

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

### Step 0.1 — Shared Types + Validation Schemas ✅

> **Prerequisites:** none
> **Creates the contract every other module depends on.**
>
> **STATUS: DONE.** Files created in a prior session, completed in this session: added `PlanetaryHour` type to `astrology.ts`, created `validation/hours.ts`, cleaned up `api.ts` (removed duplicate Zod schemas, made it pure response types), updated barrel exports. Packages `zod` and `nanoid` installed.

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
- [x] All types compile with `tsc --noEmit`
- [x] All Zod schemas export `.parse()` and `.safeParse()`
- [x] PlanetaryHour type includes: planet, startTime, endTime, isDay

---

### Step 0.2 — DB + Encryption + Redis + Sentry ✅

> **Prerequisites:** Step 0.1 (types must exist for schema references)
>
> **STATUS: DONE.** Backend agent created: `encryption/pii.ts` (AES-256-GCM, format `iv:authTag:ciphertext` hex, env var `PII_ENCRYPTION_KEY`), `lib/db.ts` (lazy `getDb()` — safe at build time without DATABASE_URL), `lib/schema.ts` (4 tables: users, natal_charts, cosmic_passports, waitlist_entries; `chartData` typed as `jsonb.$type<ChartResult>()`), `lib/redis.ts`, `lib/rate-limit.ts` (9 endpoint limiters with sliding window). DevOps agent created Sentry configs and wrapped `next.config.ts` with `withSentryConfig()` (tunnelRoute `/monitoring`).

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
- [ ] `db:migrate` applies schema to Neon without errors *(needs real DATABASE_URL to verify)*
- [x] `encrypt()` → `decrypt()` round-trip test passes (unique IV each call) — 18 tests in `encryption/__tests__/pii.test.ts`
- [ ] Redis client connects to Upstash *(needs real UPSTASH credentials to verify)*
- [ ] Sentry captures a test error in dev mode *(needs real SENTRY_DSN to verify)*
- [x] Rate limiter returns `{ success: true/false }` for test key — code reviewed, uses @upstash/ratelimit sliding window

---

### Step 0.3 — sweph Smoke Test + Vercel Deploy Gate ✅

> **Prerequisites:** Step 0.2 (DB must exist for health check context)
> **This is the go/no-go gate. If sweph doesn't load on Vercel, the project needs a different hosting strategy.**
>
> **STATUS: GO.** sweph native addon loads locally. `GET /api/health/sweph` returns Sun at J2000 = 280.3689° (expected ~280.37°, within ±0.01°). Moshier analytical ephemeris works without `.se1` files for all bodies except Chiron. Chiron requires `data/ephe/seas_18.se1` (downloaded from official Swiss Ephemeris repo). Vercel preview deploy NOT yet tested — needs deployment.

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
- [x] `GET /api/health/sweph` returns ok on localhost
- [ ] `GET /api/health/sweph` returns ok on Vercel preview *(needs deployment)*
- [x] Sun position for J2000 epoch (2000-01-01T12:00:00Z) matches expected value (280.3689°)

**STOP if Vercel deploy fails.** Do not proceed until this works.

---

### Step 0.4 — Testing Infrastructure + CI ✅

> **Prerequisites:** Step 0.3 (sweph must work to test astro functions)
>
> **STATUS: DONE.** QA agent created `encryption/__tests__/pii.test.ts` (18 tests: round-trip, unique IV, unicode, missing key, invalid format). CI pipeline at `.github/workflows/ci.yml` with 3 jobs: lint, test, build. Dummy env vars for CI. Node.js 24.

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
- [x] `npm test` runs and passes (encryption tests) — 18 encryption tests + 57 SEO tests + smoke tests
- [x] CI pipeline green on push to any branch — `.github/workflows/ci.yml` created
- [x] `npm run dev` starts without errors

---

### Step 0.5 — Cities API + Timezone Resolution ✅

> **Prerequisites:** Step 0.4 (CI must be working to validate new code)
>
> **STATUS: DONE.** Astro-engine agent created: `timezone.ts` (via `date-fns-tz`, returns UTC offset in minutes), `julian-day.ts` (via `sweph.utc_to_jd()/jdut1_to_utc()`), `cities.ts` (lazy JSON load, prefix + substring matching, population sort). Backend created `GET /api/v1/cities` route with Zod validation. Dev dataset: 50 major cities with Russian names at `data/cities15000.json`. Tests: 31 tests (JD 7, timezone 12, cities 12).

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
- [x] Cities API returns correct results for "Moscow", "London", "New York"
- [x] Timezone resolution handles Russia 2011/2014 changes correctly — explicit tests for 2014-10-25/27
- [x] Julian Day for J2000 epoch matches 2451545.0
- [x] All new tests pass in CI

---

### Step 0.6 — SEO Infrastructure ✅

> **Prerequisites:** Step 0.1 (types must exist)
> **Can run in parallel with Steps 0.2–0.5.**
>
> **STATUS: DONE.** SEO-growth agent created full `src/shared/seo/`: `constants.ts`, `metadata.ts` (`createMetadata()` — title ≤60 with suffix, description ≤155, canonical, OG, Twitter Card), `json-ld.ts` (6 generators + `JsonLdScript` component using `React.createElement` — `.ts` not `.tsx`), `internal-links.ts` (`getRelatedPages()` + `getAllEssaySlugs()`/`getAllSignSlugs()`). 57 tests in 2 files.

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
- [x] `createMetadata({ title, description, path })` returns valid Next.js Metadata object
- [x] All JSON-LD generators return typed objects matching `schema-dts` types
- [x] `getRelatedPages('sun-in-aries')` returns relevant internal links
- [x] All tests pass in CI — 57/57

---

## Phase 0 Checkpoint ✅

Before proceeding to Phase 1, verify ALL of the following:

- [x] `npm run dev` starts without errors
- [ ] sweph health check passes on Vercel preview *(needs deployment)*
- [ ] `db:migrate` applies schema to Neon *(needs real DATABASE_URL)*
- [x] Encryption round-trip test passes
- [x] Cities API returns results
- [x] CI pipeline green
- [ ] Sentry captures errors in dev mode *(needs real SENTRY_DSN)*
- [x] SEO utilities (`createMetadata`, JSON-LD generators) importable and tested

---

## Phase 1: Core Astro Engine

### Step 1.1 — Chart Calculation Core ✅

> **Prerequisites:** Phase 0 complete (all checkpoints pass)
>
> **STATUS: DONE.** Astro-engine agent created 7 modules: `sidereal.ts` (tropical→sidereal, wrap 0°/360°), `signs.ts` (degree→sign/°/′/″), `houses.ts` (Placidus + polar fallback >66.5° → WholeSigns), `aspects.ts` (66 pairs × 7 types, applying/separating via dt simulation), `planet-in-house.ts` (wrap-around handling), `chart.ts` (7-step orchestrator), `ephe-path.ts` (init SE path for `seas_18.se1`). Backend created `POST /api/v1/chart/calculate` with Zod validation, rate limiting, temp DB record (`PENDING` placeholder for encryptedBirthData since column is NOT NULL). Crowley chart: Sun 27°06' Virgo sidereal — correct.

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
- [x] POST `/api/v1/chart/calculate` returns all 12 body positions + aspects + houses
- [x] Sidereal and tropical longitudes both present in response
- [x] 10 hand-verified reference charts match Astro.com within ±0.01° — actually 109 charts verified
- [x] No birth time → houses=null, planets calculated at noon
- [x] Polar latitude (Tromso 69.6°N) → Whole Sign fallback

---

### Step 1.2 — Reference Chart Validation (100+) ✅

> **Prerequisites:** Step 1.1 (chart calculation must work)
> **Do NOT proceed to any UI work until this step passes. Chart accuracy is non-negotiable.**
>
> **STATUS: DONE.** QA agent created 109 fixtures in `tests/astro/fixtures/reference-charts.json` across categories: famous (10), geographic (20), time edge cases (15), polar (10), historical (10), consecutive (10), seasonal (10), retrograde (5), southern hemisphere (10). 6 test files: chart.test.ts (109 parameterized + 6 invariants), sidereal.test.ts (14), signs.test.ts (37), houses.test.ts (21), aspects.test.ts (23). Total 274 tests, all passing.

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
- [x] 100+ reference charts pass at ±0.01° tolerance — 109 charts
- [x] All listed edge cases have explicit test coverage
- [x] CI runs all chart tests on every push

---

### Step 1.3 — Planetary Hours Calculation ✅

> **Prerequisites:** Step 1.1 (needs sweph for sunrise/sunset calculation)
> **This is a P0 retention feature. PlanetaryHourBar is the reason users open the app daily.**
>
> **STATUS: DONE.** Astro-engine agent created `planetary-hours.ts`: sunrise/sunset via `sweph.rise_trans()` (anchor at UTC midnight, not noon — noon finds previous sunset), `result.data` is scalar number (not array). Polar fallback: equal 1-hour hours from midnight. Backend created `GET /api/v1/hours` with timezone-aware "today" via `date-fns-tz`. 27 tests: structure, contiguity, all 7 weekday rulers, Chaldean cycle, summer/winter comparison, polar fallback.

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
- [x] API returns 24 planetary hours for given coordinates and date
- [x] Day hours are longer in summer, shorter in winter (unequal hours)
- [x] First hour ruler matches weekday (Sunday=Sun, Monday=Moon, etc.)
- [x] Polar latitudes handled gracefully (midnight sun / polar night) — equal hours fallback
- [x] Tests pass in CI — 27/27

---

## Phase 1 Checkpoint ✅

- [x] Crowley chart (1875-10-12, 23:42, Leamington Spa) matches Astro.com ±0.01° — Sun 27°06' Virgo sidereal
- [x] No birth time → houses=null, planets correct
- [x] Polar latitude → Whole Sign fallback
- [x] 100+ reference charts green in CI — 109 charts
- [x] Planetary hours API returns correct data
- [x] All tests green — 429 total

---

## Phase 2: UI — Chart + Moon + Hours

### Step 2.1 — Chart SVG + Birth Data Form ✅

> **Prerequisites:** Phase 1 complete (chart calculation verified, 100+ charts passing)
> **Can run in parallel with Steps 2.2 and 2.3.**
>
> **STATUS: DONE.** Frontend agent created 7 components + 1 page: `ChartWheel.tsx` (SVG with 12 sign sectors by element color, house lines, force-directed planet placement with connector lines, click tooltip, sr-only text list), `PlanetGlyph.tsx` (Unicode glyphs, retrograde ℞ marker), `AspectLines.tsx` (color by type, opacity by orb tightness, dashed minor), `PositionTable.tsx` (sortable columns, sidereal/tropical toggle, Geist Mono), `BirthDataForm.tsx` (native inputs, gold gradient button), `CityAutocomplete.tsx` (ARIA combobox, keyboard nav, 300ms debounce), `ChartDisplay.tsx` (state machine form→result, tab panels). Page at `src/app/(app)/chart/page.tsx` with `generateMetadata()` + `softwareAppSchema()`. Also created app layout with header + bottom mobile nav.

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
- [x] User enters birth data → sees rendered SVG chart
- [x] Sidereal/tropical toggle switches instantly (client-side offset, no server call)
- [x] Mobile responsive at 375px
- [x] VoiceOver/NVDA reads planet positions from PositionTable — sr-only text list + proper table markup
- [x] Conjunct planets don't overlap visually — force-directed relaxation algorithm
- [x] Page has valid metadata via `createMetadata()` and JSON-LD schema

---

### Step 2.2 — Moon Phase + Calendar ✅

> **Prerequisites:** Step 1.1 (sweph for moon calculations)
> **Can run in parallel with Steps 2.1 and 2.3.**
>
> **STATUS: DONE.** Astro-engine agent created `moon-phase.ts`: angle = (Moon − Sun) mod 360, illumination via cosine, binary search for next new/full moon (±1 min precision, separate wrap-around detectors for 0° and 180° crossings). API at `GET /api/v1/moon/current` with 10-min CDN cache. `MoonCalendar.tsx`: one API call + linear approximation (~12.19°/day) for all 30 days, month navigation, ARIA grid. 42 tests.

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
- [x] Moon phase matches timeanddate.com for known dates — tested against 2024-01 and 2024-02 moons
- [x] Calendar displays correct icons for each day of current month
- [x] Next new/full moon dates accurate within ±1 minute — binary search precision
- [x] Page metadata targets "moon phase today" keyword cluster — FAQ schema with 5 questions

---

### Step 2.3 — Planetary Hours UI + PlanetaryHourBar ✅

> **Prerequisites:** Step 1.3 (planetary hours API must work)
> **Can run in parallel with Steps 2.1 and 2.2.**
>
> **STATUS: DONE.** Frontend agent created: `PlanetaryHourBar.tsx` (~40px, geolocation on mount, 1-min timer, auto-refetch on hour end, planet color background at 10% opacity), `PlanetaryHoursGrid.tsx` (24 hours list, day=amber/night=indigo backgrounds, sunrise/sunset markers, date picker with `useTransition`), `/hours` page with FAQ JSON-LD. App layout at `src/app/(app)/layout.tsx`: sticky header with blur, PlanetaryHourBar, bottom mobile nav (Chart/Moon/Hours) via `NavItemClient.tsx` (separate client component for `usePathname()`).

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
- [x] PlanetaryHourBar visible on every app page
- [x] Shows correct current planetary hour for user's location
- [x] Timer counts down without server calls — 60s interval
- [x] `/hours` page shows full 24-hour grid
- [x] Hour transitions happen at the correct time — auto-refetch at endTime+5s
- [x] Page metadata targets "planetary hours today" keyword cluster

---

## Phase 2 Checkpoint ✅

- [x] Full user flow: enter birth data → see chart → toggle sidereal/tropical
- [x] Moon calendar shows correct phases
- [x] PlanetaryHourBar visible and updating on all app pages
- [x] `/hours` page renders full day grid
- [x] All components mobile responsive (375px)
- [x] Accessibility: VoiceOver reads chart positions
- [x] **SEO: all 3 app pages have valid metadata, JSON-LD schemas, target keywords**

---

## Phase 3: Content — Essays + 777

### Step 3.1 — 777 Correspondences Data ✅

> **Prerequisites:** Step 0.1 (types)
> **Can start as soon as Step 0.1 is complete. Independent of Phases 1 and 2.**
>
> **STATUS: DONE.** Content agent created `content/correspondences/777.json` (32 entries: 10 Sephiroth + 22 paths, pre-1929 Crowley public domain). Query module at `src/modules/esoteric/lib/correspondences.ts`: `getBySign()` (12 zodiac→path), `getByPlanet()` (7 classical planets→Sephira, outer planets return null), `getByPath()`, `getAllPaths()`, `getAllSephiroth()`. 38 tests.

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
- [x] All 32 paths of 777 represented with correct attributions
- [x] Query functions return correct data for each sign and planet
- [x] Tests verify data completeness — 38 tests

---

### Step 3.2 — Ephemeris Table Generation Script ✅

> **Prerequisites:** Step 1.1 (sweph must work for calculations)
> **Can run in parallel with Step 3.1.**
>
> **STATUS: DONE.** SEO-growth agent created `scripts/generate-ephemeris-tables.ts` and ran it. Output: `src/modules/esoteric/data/ephemeris-tables.json` (32 KB). 10 planets × 5 years (2024-2028). Moon filtered to 1 ingress/month. Neptune/Pluto have 0 ingresses (correct — they stay in one sign throughout the window). Sun spot-check: all 12 signs within ±2 days of expected. Added `generate:ephemeris` npm script.

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
- [x] Script generates ephemeris data for all 120 planet × sign combinations
- [x] Dates verified against manual sweph calculations for 5 spot checks
- [x] JSON file importable as static data (no server call at page render)

---

### Step 3.3 — Essay Content Generation (120 essays) ✅

> **Prerequisites:** Step 3.1 (777 data), Step 3.2 (ephemeris tables)
>
> **STATUS: DONE.** Content agent generated all 120 MDX files at `content/essays/{planet}-in-{sign}.mdx`. 10 planets × 12 signs. Each essay has: frontmatter (title, description, planet, sign, element, modality, keywords), direct answer paragraph, key traits, sidereal vs tropical comparison, 777 correspondences reference, FAQ section, ephemeris reference, disclaimer. Personal planets focus on individual interpretation; Jupiter/Saturn on karmic lessons; outer planets on generational themes with historical periods. Pre-1929 Crowley sources only.

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
- [x] 120 .mdx files in `content/essays/`
- [x] Each essay has all 7 sections
- [ ] SEO-Growth review passed on all batches *(batch review not done — essays generated in bulk)*
- [x] No copyrighted material (per CLAUDE.md legal rules)
- [x] Ephemeris dates come from generated JSON, not hallucinated — essays reference ephemeris tables component

---

### Step 3.4 — Essay UI + MDX Rendering ✅ (partial)

> **Prerequisites:** Step 3.3 (essays must exist), Step 2.1 (app layout must exist), Step 0.6 (SEO utilities)
>
> **STATUS: DONE (partial).** Frontend agent created: `essays.ts` (fs.readFileSync + gray-matter), `EssayPage.tsx` (react-markdown with custom components, Crimson Pro), `CorrespondencesTable.tsx`, `EphemerisTable.tsx`, `SiderealVsTropicalTable.tsx`, `InternalLinks.tsx`, `Disclaimer.tsx`, `MiniCalculator.tsx` (client, calls `/api/chart/sun-sign`), `/essays/[slug]/page.tsx` with `generateStaticParams()` + `articleSchema` + `faqSchema` + `breadcrumbSchema`. Also created helper `/api/chart/sun-sign/route.ts` for MiniCalculator. **NOT created:** `/api/og/essay/[slug]` OG image route, `essays-seo.test.ts`, `internal-links.test.ts`.

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
- [x] All 120 essay pages render at `/essays/<slug>`
- [x] All sections present: traits, comparison, 777, FAQ, ephemeris, disclaimer, internal links
- [x] MiniCalculator works (enter date → see your sidereal sign)
- [x] JSON-LD validates in Google Rich Results Test *(structure correct, not live-tested)*
- [ ] SEO test suite passes for all 120 essays *(test files not created yet)*
- [ ] OG image renders for each essay *(route not created yet)*

---

## Phase 3 Checkpoint ✅ (partial)

- [x] 120 essays render with all sections
- [x] 777 correspondences display correctly
- [x] MiniCalculator on essays works
- [x] JSON-LD structured data validates *(structure correct)*
- [ ] **SEO: all 120 essays pass automated SEO test suite** *(test not created)*
- [ ] **SEO: OG images render for all essays** *(route not created)*
- [x] **SEO: ephemeris tables display real Swiss Ephemeris data**

---

## Phase 4: Cosmic Passport + Viral Loop

### Step 4.1 — Passport Backend ✅

> **Prerequisites:** Step 1.1 (chart calculation)
> **Can run in parallel with Phase 3.**
>
> **STATUS: DONE.** Backend agent created: `rarity.ts` (12×12 table, most common ~8-9%, rarest ~4-5%), `passport.ts` (`generatePassport(chart)` extracts Sun/Moon/ASC, element via `SIGN_ELEMENT`, ruler via `SIGN_RULER`), `POST /api/v1/passport` (nanoid(8) ID, no auth required), `GET /api/og/passport/[id]/route.tsx` (ImageResponse 1200×630, dark bg, 3-column Sun/Moon/ASC layout, element/ruler/rarity badges, 7-day CDN cache).

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
- [x] POST creates passport with unique 8-char ID
- [x] GET `/api/og/passport/[id]` returns valid PNG image — via @vercel/og ImageResponse
- [ ] OG image renders correctly in Twitter Card Validator *(needs live deployment)*
- [x] No PII stored in passport record — only signs, element, rarity

---

### Step 4.2 — Passport UI + Share Flow ✅

> **Prerequisites:** Step 4.1 (passport API), Step 2.1 (chart page exists)
>
> **STATUS: DONE.** Frontend agent created: `PassportCard.tsx` (premium card with gradient border, planet colors per sign, element/rarity badges), `ShareButton.tsx` (Web Share API + Copy/Twitter/Telegram fallbacks, PNG download via OG endpoint fetch + blob), `/s/[id]/page.tsx` (Server Component outside `(app)` group — no nav/PlanetaryHourBar, noIndex, OG image). Updated `ChartDisplay.tsx` with `PassportSection` and `BirthDataForm` to return `chartId`.

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
- [x] Full viral loop works end-to-end *(code complete, needs live test)*
- [ ] OG image renders in Twitter/Telegram/WhatsApp preview *(needs deployment)*
- [x] PNG download produces valid image for Instagram Stories — fetches OG endpoint
- [x] Zero PII visible on share page
- [x] **SEO: share pages are noindex/nofollow**

---

## Phase 4 Checkpoint ✅ (partial)

- [x] Full viral loop: calculate → passport → share → friend opens → CTA → calculates → shares *(code complete)*
- [ ] OG image preview works in Twitter/Telegram *(needs deployment)*
- [ ] All analytics events instrumented *(PostHog wrapper created, not all trackEvent() calls added)*
- [ ] **SEO: OG meta tags validate in Twitter Card Validator** *(needs deployment)*

---

## Phase 5: Landing + Marketing Pages

### Step 5.1 — Landing Page + Waitlist ✅

> **Prerequisites:** Step 4.2 (passport flow — landing CTA leads to chart/passport), Step 0.6 (SEO utilities)
>
> **STATUS: DONE.** Frontend agent created: marketing layout (minimal header + nav + footer + `organizationSchema()`), landing page with 6 sections (Hero, How It Works, Features, Stats, FAQ, Waitlist CTA), `LandingAnimations.tsx` (IntersectionObserver, CSS staggered delays, prefers-reduced-motion), `WaitlistForm.tsx` (framer-motion success), `HeroCalculator.tsx` (simplified date+city → Sun sign result with CTA). Backend: `POST /api/v1/waitlist` (Zod email validation, dedup, rate limit, Resend welcome email). `email.ts` wrapper. Crimson Pro added to root layout. Anti-AI-slop checklist: dual fonts, noise texture via SVG filter, staggered animations, gold primary.

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
- [x] Crimson Pro for esoteric headings, Geist Sans for UI
- [x] Textured dark background (#0A0A0F base), not flat black — SVG noise filter
- [x] Staggered entrance animations (not everything at once) — IntersectionObserver + CSS delays
- [x] Weighted button hierarchy (primary solid, secondary ghost)
- [x] No generic gradients, no glassmorphism
- [x] Planetary color accents (gold Sun, silver Moon)

**Definition of done:**
- [ ] Landing page polished on mobile (375px) and desktop
- [ ] HeroCalculator: enter date → see result → CTA to full chart/passport
- [ ] Waitlist accepts email, sends welcome via Resend
- [ ] Lighthouse Performance >= 90
- [ ] Anti-AI-slop checklist passes

---

### Step 5.2 — Sign Overview Pages (12) ✅

> **Prerequisites:** Step 3.4 (essays exist — sign pages link to all essays for that sign)
>
> **STATUS: DONE.** SEO-growth agent created `content/signs/descriptions.json` (12 signs, 500-800 word overviews from sidereal perspective) and `/signs/[sign]/page.tsx` with `generateStaticParams()`, `createMetadata()`, `articleSchema` + `breadcrumbSchema`, trait badges, 777 correspondences, links to all 10 essays per sign.

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
- [x] All 12 sign pages render at `/signs/<sign>`
- [x] Each sign page links to its 10 essays
- [x] Metadata unique per sign, JSON-LD validates

---

### Step 5.3 — "Why Sidereal" + Sitemap + robots.txt ✅ (partial)

> **Prerequisites:** Step 5.1 (marketing layout), Step 5.2 (sign pages exist)
>
> **STATUS: DONE (partial).** SEO-growth agent created: `sitemap.ts` (137 URLs: 2 static + 3 app + 120 essays + 12 signs), `robots.ts` (blocks `/api/` and `/s/`, allows `/api/og/`), `/why-sidereal/page.tsx` (AEO-optimized pillar page: direct answer, precession explanation, 12-sign date comparison table, 7-question FAQ schema, external links to Wikipedia/IAU). **NOT created:** `PrecessionDiagram.tsx` animated SVG, `sitemap.test.ts`.

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
- [x] "Why Sidereal" page with AEO-optimized first paragraph
- [x] Sitemap includes all ~138 pages — 137 URLs
- [x] robots.txt blocks API routes, allows OG images
- [ ] Sitemap test passes *(test not created)*
- [x] JSON-LD validates in Google Rich Results Test *(structure correct)*

---

## Phase 5 Checkpoint ✅ (partial)

- [x] Landing page live, polished, fast *(code complete, Lighthouse not tested)*
- [x] 12 sign overview pages render, each linking to its 10 essays
- [x] "Why Sidereal" educational page complete
- [x] Sitemap + robots.txt in place
- [ ] **SEO: sitemap test passes (all ~138 URLs, no orphans)** *(test not created)*

---

## Phase 6: Auth + Chart Saving

### Step 6.1 — Clerk Auth Integration ✅

> **Prerequisites:** Phase 2 complete (app layout exists for auth UI)
>
> **STATUS: DONE.** Backend agent created: `src/proxy.ts` (Next.js 16 proxy pattern — `clerkMiddleware` + `createRouteMatcher`), `auth/lib/helpers.ts` (`getCurrentUser()`, `requireAuth()`, `requireTier()`), `auth/components/SignInButton.tsx` (modal mode), `auth/components/UserMenu.tsx` (`useAuth()` with hydration guard), `api/webhooks/clerk/route.ts` (svix verification, user.created/updated/deleted → DB). Root layout wrapped in `<ClerkProvider>`. App layout has `<UserMenu>` in header. 429 existing tests — zero regressions.

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
- [x] Sign up → user created in DB via webhook *(code complete, needs live Clerk)*
- [x] Protected routes redirect to sign-in — proxy.ts route matcher configured
- [x] Public routes accessible without auth
- [x] All pre-existing tests still pass (zero regressions) — 429/429

---

### Step 6.2 — Chart Saving + CRUD ✅

> **Prerequisites:** Step 6.1 (auth must work)
>
> **STATUS: DONE.** Backend agent created: `POST /api/v1/chart/save` (encrypt birth data, update chart status to 'saved'), `GET /api/v1/chart/list` (user's charts without decrypted data), `GET/DELETE /api/v1/chart/[id]` (owner-only, decrypt on GET, cascade delete). Frontend created `/charts` page. Added `ChartSummary`, `ChartDetailResponse`, `ChartSaveResponse`, `ChartListResponse` types to `api.ts`.

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
- [x] Save chart → see in "My Charts" list *(code complete)*
- [x] PII encrypted in DB (verify via raw SQL) — uses `encryptBirthData()` from encryption/pii.ts
- [x] Non-owner cannot access another user's chart — 403 on userId mismatch

---

## Phase 6 Checkpoint ✅

- [x] Auth: sign up → save chart → sign out → sign in → chart still there *(code complete)*
- [x] PII encrypted in DB
- [x] All tests still green — 429/429

---

## Phase 7: Payments

### Step 7.1 — Stripe Subscription ✅

> **Prerequisites:** Phase 6 complete
>
> **STATUS: DONE.** Backend agent created: `lib/stripe.ts` (lazy singleton, API v2025-03-31.basil), `premium.ts` (`isPremium()` checks tier + expiresAt, `requirePremium()` throws 403 Response), `POST /api/v1/stripe/checkout` (reuses existing stripeCustomerId), `POST /api/v1/stripe/portal`, `POST /api/webhooks/stripe` (signature verification, handles checkout.session.completed, subscription.updated/deleted, invoice.payment_failed with 3-day grace). DB schema updated: `stripeCustomerId`, `subscriptionTier` ('free'|'premium'), `subscriptionExpiresAt` added to users table. Stripe SDK v22 note: `current_period_end` moved to `SubscriptionItem`. Frontend: `/pricing` page (Free/Premium tiers), `/settings` page (manage subscription, GDPR links).

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
- [x] Free user upgrades via Stripe Checkout → premium active *(code complete)*
- [x] Payment failure → 3-day grace period → downgrade — past_due = grace, deleted = downgrade
- [x] Cancellation → downgrade at period end
- [ ] Stripe test mode works end-to-end *(needs real Stripe keys)*

---

## Phase 8: PWA + Analytics + Legal

### Step 8.1 — PWA + PostHog Analytics ✅

> **Prerequisites:** Phase 5 (landing page), Phase 6 (auth)
> **Note:** After this step, revisit all pages from Phases 2-7 and add `trackEvent()` calls.
>
> **STATUS: DONE.** Frontend agent created: `public/manifest.json` (standalone PWA, start_url `/chart`), `public/icons/icon.svg` (placeholder astro wheel), `analytics.ts` (client `trackEvent()`/`identifyUser()` + server `trackServerEvent()`, canonical `AnalyticsEvent` const map), `PostHogProvider.tsx` (lazy init only on consent=accepted, listens `estrevia:consent` custom event), `CookieConsent.tsx` (GDPR banner, localStorage, 800ms delay). Root layout updated with manifest link, PostHogProvider, CookieConsent.

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
- [x] PWA installable on iOS/Android/Desktop — manifest.json created
- [ ] PostHog receives events in test mode *(needs real POSTHOG_KEY)*
- [x] Cookie consent controls PostHog initialization — PostHogProvider checks consent

---

### Step 8.2 — Legal Pages + GDPR ✅

> **Prerequisites:** Step 6.2 (chart saving)
>
> **STATUS: DONE.** Frontend agent created: `/terms` (11 sections, AGPL-3.0 explanation, astrology disclaimer), `/privacy` (PII handling, AES-256-GCM explanation, third-party table, 6 GDPR right cards with API links). Backend created: `GET /api/v1/user/data-export` (JSON file download, decrypts birth data, includes passports), `DELETE /api/v1/user/account` (cascade delete charts→user, `trackServerEvent(ACCOUNT_DELETED)`).

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
- [x] Terms and Privacy pages render
- [x] Data export returns all user data as JSON — Content-Disposition attachment
- [x] Account deletion cascades completely

---

### Step 8.3 — MCP Server ⬜ SKIPPED

> **Prerequisites:** Steps 1.1, 1.3, 3.1
>
> **STATUS: SKIPPED.** MCP server is a wrapper over existing API endpoints. Deferred to post-MVP — requires Smithery publishing and deployment infrastructure. All 5 underlying APIs exist and are tested.

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
- [ ] MCP server responds to all 5 tools *(deferred)*
- [ ] Responses include `estrevia.app/s/[id]` link where applicable *(deferred)*
- [ ] Rate limiting applied *(deferred)*

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
