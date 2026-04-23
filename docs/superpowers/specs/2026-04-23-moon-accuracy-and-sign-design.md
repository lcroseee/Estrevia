# Moon Accuracy, Visualization & Zodiac Sign — Design Spec

**Date:** 2026-04-23
**Scope:** `/moon` page only (CurrentPhaseCard + CalendarGrid + DayDetailPanel)
**Status:** Approved — ready for implementation plan.

## 1. Problem

Two defects visible in production today:

1. **Illumination accuracy.** For 2026-04-22 our UI reports **27%** while reference consumer apps report **33%**. Root cause: `src/app/api/v1/moon/current/route.ts:51-53` normalizes `now` to **UTC midnight** before calculating the phase. Between UTC 00:00 and user-local evening the Moon's Sun-elongation angle drifts ~6°, and at crescent that drift swings the illumination by ~6 percentage points. Moon illumination is a function of Sun-Moon elongation only — it is location-independent, but it is **time-dependent**, and the time must be the actual moment, not a nominal midnight.

2. **Missing moon-sign display.** The backend already calculates `moonSign` and `moonDegree` (via `getMoonSign()` and `getMoonTransitTimes()`) and both `/current` and `/calendar/:y/:m` return them. The frontend ignores them — DayDetailPanel literally renders the hardcoded string `"Available soon"`. The user wants the zodiac sign the Moon is currently transiting to be shown next to the illumination.

A third gap worth fixing while we are in this code: `MoonCalendar.tsx` currently uses a **linear client-side approximation** (`DEGREES_PER_DAY = 360 / 29.53059`) instead of the per-day server data that the calendar endpoint already returns. Accuracy drifts ~1° over 15 days. Since we are going to display real data per cell, we should switch to the server-calculated values.

## 2. Goals / Non-goals

**Goals**

- Moon illumination on `/moon` matches consumer references (timeanddate.com, USNO) within ±0.5 percentage points for the user's current moment.
- Each calendar cell shows the sidereal sign of the Moon via a small glyph beneath the percentage.
- The current-phase card names the Moon's sign and the time it exits that sign.
- The day-detail panel replaces "Available soon" with the actual sign + degree.
- Moon visualization is noticeably higher fidelity than today's flat SVG without adding raster assets or async generation.

**Non-goals**

- Site-wide header indicator, natal chart page moon redesign, tropical vs sidereal toggle, moon sign charts for past/future days beyond what the existing calendar endpoint returns.
- Changing the astronomical algorithm (we stay on Swiss Ephemeris Moshier, Lahiri ayanamsa — per `CLAUDE.md`).
- Replacing the paywall (calendar months outside the current month remain Pro-only).

## 3. Chosen approach

### 3.1 Time reference

- Client fetches `/api/v1/moon/current?t=<ISO8601>` where `t` is `new Date().toISOString()` at render time.
- Server parses `t`, uses the exact moment, no UTC-midnight normalization.
- If `t` is absent or invalid, fall back to server `new Date()`. Still live, just missing the user's sub-day precision.
- `Cache-Control` for `/current` drops from `s-maxage=600` to `s-maxage=60` so CDN returns recent-but-not-stale data.
- Calendar endpoint (`/calendar/:y/:m`) keeps its current "noon UTC per day" calculation — stable daily values that are fine for a monthly grid, and the 24-hour cache stays intact.

### 3.2 Zodiac sign surfacing

- Calendar cells gain a small muted-gold glyph beneath the `%`. Single glyph only; degree stays in the detail panel.
- `CurrentPhaseCard` adds one line: **"Moon in ♋ Cancer · until Apr 24, 15:32"** — sign name + exit time formatted in user locale.
- `DayDetailPanel` "Moon sign" detail item stops showing `"Available soon"` and shows `"♋ 15° Cancer"` (glyph, degree within sign, sign name).

### 3.3 Visualization

- Enhance the existing `MoonPhaseSVG` component (chosen over PNG sets and Gemini art for efficiency):
  - **Craters:** 5–7 small darker circles at fixed unit-coordinate positions, clipped by the illuminated path so they only appear on the visible lit portion.
  - **Soft terminator:** a narrow gradient band where lit meets shadow, not a hard edge.
  - **Rim light:** a subtle brighter arc along the outer lit edge.
  - **Palette:** warmer ivory (e.g., `#F2EADD` → `#D6CBB7`) rather than today's cool gray.
  - API (`illumination`, `phaseAngle`, `size`) stays source-compatible.

### 3.4 Scope line

- Changes land only in: moon-phase backend, `/api/v1/moon/current` route, `MoonPhaseSVG.tsx`, the three pieces of `MoonCalendar.tsx`, `ZodiacGlyph.tsx` (new), i18n files, and tests. Nav/header, chart page, share page are out of scope.

## 4. Component decomposition

Before any parallel work, a single prep commit in the main session splits the 753-line `MoonCalendar.tsx` into:

- `MoonCalendar.tsx` — top-level orchestrator (state, fetch coordination, free-tier gating, layout).
- `CurrentPhaseCard.tsx` — the hero block with large moon + illumination bar + next-event dates.
- `MoonCalendarGrid.tsx` — month grid (weekday headers + day cells).
- `DayDetailPanel.tsx` — slide-up sheet with per-day details and the `DetailItem` helper.

Also stubbed in the prep commit:

- `src/shared/components/ZodiacGlyph.tsx` — empty typed component so agents can import it.

This lets the ten agents write to non-overlapping files and avoid merge conflicts.

## 5. Parallel work package (10 agents)

| # | Scope | Owns files | Depends on |
|---|-------|------------|------------|
| 1 | Backend: accept `t=` param | `api/v1/moon/current/route.ts`, `moon-phase.ts` | prep commit |
| 2 | MoonPhaseSVG redesign | `components/MoonPhaseSVG.tsx` | prep commit |
| 3 | ZodiacGlyph component | `shared/components/ZodiacGlyph.tsx` | prep commit |
| 4 | CurrentPhaseCard | `components/CurrentPhaseCard.tsx` | ZodiacGlyph stub, API contract |
| 5 | CalendarGrid | `components/MoonCalendarGrid.tsx` | ZodiacGlyph stub, calendar API |
| 6 | DayDetailPanel | `components/DayDetailPanel.tsx` | ZodiacGlyph stub |
| 7 | i18n strings | `messages/en.json`, `messages/es.json` | prep commit |
| 8 | Unit tests | `src/modules/astro-engine/moon-phase.test.ts`, `src/shared/components/ZodiacGlyph.test.tsx` | prep commit |
| 9 | Playwright e2e | `tests/e2e/moon-page.spec.ts` | prep commit |
| 10 | Accuracy verification | `docs/moon-accuracy-verification.md` | prep commit |

Agents 4/5/6 import the ZodiacGlyph stub — they work against its signature, not its internals, so they are independent of agent 3's implementation. The stub signature is frozen in the prep commit: `ZodiacGlyph({ sign: Sign, size?: number, className?: string })`.

Agent 9 (e2e) runs after all other agents merge; it is dispatched in parallel but expected to iterate if any UI agent produced unexpected markup.

## 6. Data / API contract changes

**`GET /api/v1/moon/current`**

- New optional query param: `t` (ISO8601 string). When present and valid, phase is calculated for that exact moment.
- When absent or unparseable, server uses `new Date()` (current UTC moment — no longer normalized to midnight).
- Existing `date=YYYY-MM-DD` behavior preserved for callers that want a historical day snapshot (normalized to UTC midnight of that day, as today).
- Response shape unchanged.
- Cache header: `s-maxage=60, stale-while-revalidate=300`.

**`GET /api/v1/moon/calendar/:year/:month`**

- No contract change. Client switches from linear approximation to consuming this endpoint.

## 7. Accessibility

- `ZodiacGlyph` emits `aria-label` with the sign name (e.g., "Cancer") so screen readers don't read "Unicode 264B".
- Calendar cell `aria-label` gets the sign appended: `"April 22: Waxing Crescent, 27% illuminated, Moon in Cancer"`.
- CurrentPhaseCard sign line is a `<p>` with `aria-live="polite"` so sign transits announce when they happen while the page is open.

## 8. Testing

- **Unit:** `moon-phase.test.ts` asserts `getCurrentMoonPhase(new Date('2026-04-23T20:00:00Z'))` returns an illumination within ±0.5 of the USNO value (captured by agent 10). Also asserts `getMoonTransitTimes()` returns entry < now < exit and sign matches `getMoonSign()`.
- **Component:** snapshot of each of the 12 sign glyphs renders the correct Unicode code-point and aria-label.
- **E2E:** Playwright test visits `/moon`, reads the phase-card illumination text, pokes `?t=` into the network request URL (or asserts it's present with the client's ISO), asserts at least one calendar cell shows a glyph, asserts the detail panel sign row is no longer the literal `"Available soon"`.

## 9. Rollout

- Direct to `main` per user's standing workflow (`feedback_main_branch_workflow`).
- After the prep commit lands, dispatch the ten agents in parallel with worktree isolation.
- Merge agents back in order: 1, 3, 2, 7, 4, 5, 6, 8, 10, 9 (backend → components → consumers → tests → e2e).
- Verify with `pnpm test`, `pnpm build`, and manual visit to `/moon` before committing the last agent's branch.

## 10. Risks

- **Per-minute CDN churn.** Cache TTL of 60s means `/current` is re-computed once per minute per (CDN edge × `t` bucket). Acceptable: each call is ~3ms Swiss Ephemeris compute. If load appears, we can round `t` to the nearest 5 minutes server-side.
- **Timezone of transit text.** "Until Apr 24, 15:32" must be rendered in the user's locale time. Risk of showing UTC by mistake — mitigated by test that snapshots the formatted string under a fixed `TZ` env.
- **Glyph font coverage.** Some mobile fonts render ♈–♓ as emoji boxes. We declare an explicit font-family fallback on the glyph that prefers a system sans with astrological symbol coverage; if unreadable we fall back to short text ("Can").
