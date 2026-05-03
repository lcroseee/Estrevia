# AI Avatar — Mount Existing Component on Chart Page

**Status:** Approved design
**Date:** 2026-05-03
**Author:** Kirill (founder) + Claude (brainstorming partner)

## Problem

The AI Avatar feature is fully implemented but unreachable in the UI:

- Backend route `src/app/api/v1/avatar/generate/route.ts` works (Gemini Imagen 3.0, rate-limited, tier-gated free 3/month vs Pro unlimited + 4 styles).
- React component `src/modules/astro-engine/components/AvatarGenerator.tsx` is built and styled.
- Translations live in `messages/en.json:1176` and `messages/es.json:1176`.
- Pricing page already promises **"3 AI avatars per month"** (`messages/en.json:916`).
- Yet `<AvatarGenerator />` is not imported on any page — `grep` finds zero JSX usages.

Users see the promise, pay (or sign up), and never find the feature.

A second, blocking defect surfaced during brainstorm: the component calls `t()` with six translation keys that do not exist in either locale file (`styleLabel`, `regenerateFree`, `errorRateLimit`, `errorGeneration`, `proHint`, `download`). Even if mounted, `next-intl` would throw `MISSING_MESSAGE` on first render.

## Goals

1. Render the avatar generator on `/chart` after a chart is calculated, so the feature is reachable through the same flow that already produces the data it needs.
2. Fix the missing-translation defect so the component does not crash at runtime.
3. Reuse the existing `generatePassport(chart)` derivation — no new chart-calculation logic.
4. Stay framework-faithful: locale routing via next-intl, Clerk auth on the API, AGPL split (no `content/` touched).

## Non-Goals

- Persisting generated images to Vercel Blob (TODO in `route.ts:188`, separate task).
- Replacing inline base64 with hosted URLs.
- Refactoring `AvatarGenerator` to read style labels from `avatar.styles.*` (current hardcoded English labels stay; can be revisited).
- Adding the avatar to the Cosmic Passport share card.
- Feature-flagging the rollout — feature is already promised on pricing.
- Adding an "Avatar" tab inside the chart Wheel/Table tab group.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Placement | New section in `ChartDisplay` directly below `<PassportSection />` | Matches existing post-chart section pattern (divider + section); keeps Wheel/Table tabs focused on chart representation |
| Wrapper component | New `AvatarSection` wraps `<AvatarGenerator />` with `<h2>` heading | Keeps `AvatarGenerator` reusable for future surfaces (synastry, passport share); centralizes ARIA + heading concerns |
| Data source | `generatePassport(chart)` (already imported pattern) | Avoids duplicating Sun/Moon/Asc/Element extraction; one source of truth |
| Translation key gap | Add 5 keys + rename `t('styleLabel')` → `t('style')` in component | `style` already exists in JSON and is semantically the right label key; no need for a duplicate `styleLabel` |
| Birth time unknown | Pass `ascendantSign={undefined}` (component already supports optional) | Component degrades gracefully; API prompt omits ASC descriptor |
| Lazy mount | No — render inline | Component itself does not auto-fire the API; no cost until user clicks "Generate" |

## Architecture

**Files touched (5):**

1. `messages/en.json` — add 5 new keys under `avatar.*`: `regenerateFree`, `errorRateLimit`, `errorGeneration`, `proHint`, `download`. (`style` already exists.)
2. `messages/es.json` — same 5 keys, español neutro LATAM, tú-form (per `feedback_spanish_style`).
3. `src/modules/astro-engine/components/AvatarGenerator.tsx` — rename one call: `t('styleLabel')` → `t('style')`. No other changes.
4. `src/modules/astro-engine/components/AvatarSection.tsx` — **new file**, ~30 lines. Renders `<section>` with `<h2>{t('avatar.title')}</h2>` + `<AvatarGenerator />`. Accepts `passport: PassportData` prop.
5. `src/modules/astro-engine/components/ChartDisplay.tsx` — add `<AvatarSection passport={passport} />` below `<PassportSection />`. Compute `passport` once via `useMemo(() => generatePassport(chart), [chart])`.

**Data flow:**

```
ChartDisplay (chart calculated)
  └─ useMemo → generatePassport(chart) → passport: PassportData
       ├─ <PassportSection chartId={chartId} />          ← already exists
       └─ <AvatarSection passport={passport} />          ← NEW
            └─ <AvatarGenerator
                  sunSign={passport.sunSign}
                  moonSign={passport.moonSign}
                  ascendantSign={passport.ascendantSign ?? undefined}
                  element={passport.element} />
                 └─ POST /api/v1/avatar/generate         ← already works
```

`AvatarGenerator`'s `ascendantSign?: string` prop accepts `undefined`; `passport.ascendantSign` is `Sign | null`, so the wrapper coerces `null → undefined` at the boundary.

## Error Handling

All paths already exist in the route + component; mounting the component preserves them:

- `GEMINI_NOT_CONFIGURED` (env missing) → red error banner via `t('errorGeneration')` (now resolves correctly).
- `RATE_LIMITED` (3 req/min per user) → `t('errorRateLimit')` (now resolves).
- `FREE_LIMIT_REACHED` (3/month for free tier) → `t('freeLimitReached', { limit })` (already works).
- Network failure → same `errorGeneration` path.
- Chart missing Sun or Moon → `generatePassport()` throws synchronously; existing `ChartDisplay` error boundary handles.

## Testing

- **Manual:** dev-server smoke on `/en/chart` and `/es/chart` — calculate chart, scroll to Avatar section, click Generate, verify image renders. Repeat with no birth time. (Per CLAUDE.md UI-changes rule.)
- **Unit:** new `AvatarSection.test.tsx` — renders heading from `avatar.title`, passes through PassportData props (mock `AvatarGenerator`).
- **Integration:** if `ChartDisplay` already has tests, extend one to assert AvatarSection appears after chart calculation. Otherwise skip — no existing harness to reuse for this layer.
- **Verification before "done":** `npm run typecheck`, `npm run lint`, `npm test` — must all pass clean.

## Rollout

Direct-to-main per repo workflow. No feature flag — pricing already advertises the feature, so visibility risk is reversed (current state is the regression).

## Out-of-Scope Follow-Ups

Tracked for later, not part of this change:

- Vercel Blob upload + URL-based response (route.ts TODO).
- Migrate hardcoded style button labels in `AvatarGenerator` to `t('avatar.styles.*')`.
- Add the avatar to the Cosmic Passport share card / OG image.
- Telemetry: `posthog.capture('avatar_generated', { style, tier })` for conversion analytics.
