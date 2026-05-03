# Avatar Telemetry — PostHog Event Coverage

**Status:** Approved design
**Date:** 2026-05-03
**Author:** Kirill (founder) + Claude (brainstorming partner)

## Problem

The AI Avatar feature is now reachable on `/chart` (mounted earlier today), but it has zero analytics coverage. We can't measure:

- How many users who see the section actually click Generate.
- How free users distribute across the 4 styles (and whether locked PRO styles drive measurable upsell intent).
- How often the API succeeds vs fails, with what error codes, and at what latency.
- How many free users hit the 3/month quota — i.e. who is the actual upsell-target population.

Without these signals, every other improvement to the feature (777 correspondences, save/share, gallery, model tier upgrades) is a guess. Telemetry is therefore a strict prerequisite for the rest of the avatar improvement roadmap.

## Goals

1. Capture the success/failure outcome of every generation attempt with enough metadata to debug latency, model issues, and error code distribution.
2. Track free-tier conversion signals: locked-style clicks (intent) and quota exhaustion (urgency).
3. Reuse the existing `analytics.ts` helpers so no new transport, batching, or session logic is added.
4. Stay within the project's PII boundary (no birth date/time/location in event properties).

## Non-Goals

- Page-view / impression tracking for the avatar section. PostHog's automatic `$pageview` + a `[data-testid="natal-chart-result"]` selector is enough to estimate impressions.
- A client-side `avatar_generate_requested` event. The server-side success/failure pair already brackets the funnel.
- Per-event tests with mocked PostHog client. The repo has no route-handler test harness today; building one is out of scope. Failure mode (events don't fire) is observable in the PostHog dashboard within ~1 day and trivial to fix.
- Identify-calls. The user is already identified by `PostHogProvider` after Clerk sign-in.
- Funnel queries / dashboards in PostHog. That's a separate setup task done in the PostHog UI, not in this codebase.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Transport for server events | `trackServerEvent()` from `analytics.ts` | Already wraps `posthog-node` + `waitUntil` to prevent event loss on Vercel cold-shutdown |
| Transport for client events | `trackEvent()` from `analytics.ts` | Already lazy-loads `posthog-js`, respects cookie consent |
| Event name registry | Append to `AnalyticsEvent` const in `analytics.ts` | Single source of truth — typo prevention is the whole reason this const exists |
| `distinctId` for server events | Clerk `userId` (already in scope at line 61 of route.ts) | Same identity as client-side identify call → events stitch automatically |
| Property naming | `snake_case` | Matches existing convention (`chart_calculated`, `passport_created`) |
| Locked-style click handling | Replace `disabled` attribute with `aria-disabled` + onClick guard | `disabled` blocks the DOM event entirely; we need the event to fire so we can telemetry-then-no-op |
| `latency_ms` measurement | `Date.now()` at handler entry minus at fire-point | Gemini call dominates latency; we want to see whether p99 stays under timeout |
| Failure event scope | Every error path **after** the increment + the increment-blocked path | Auth-required and rate-limit are framework-level, tracked elsewhere |

## Architecture

**Files touched (3):**

1. `src/shared/lib/analytics.ts` — add 4 entries to the `AnalyticsEvent` const.
2. `src/app/api/v1/avatar/generate/route.ts` — capture `latency_ms` at handler entry; fire `trackServerEvent` at three sites: success path, every error return, and the FREE_LIMIT_REACHED branch.
3. `src/modules/astro-engine/components/AvatarGenerator.tsx` — change locked-style buttons from `disabled` to `aria-disabled` and route their onClick through a guarded handler that fires the locked-click event.

**Event taxonomy:**

| Event | Side | Trigger site | Properties |
|---|---|---|---|
| `avatar_generated` | server | Right before the 200 OK return | `style`, `tier`, `model`, `latency_ms`, `sun_sign`, `moon_sign`, `has_ascendant` |
| `avatar_generation_failed` | server | Every non-2xx return after auth/rate-limit | `error_code`, `tier`, `latency_ms` |
| `avatar_quota_exhausted` | server | The FREE_LIMIT_REACHED 403 return | `tier: 'free'`, `limit`, `count` |
| `avatar_style_locked_clicked` | client | onClick of a locked PRO style button (free user only) | `style` |

**Property values:**
- `style`: `'cosmic' \| 'tarot' \| 'geometric' \| 'nebula'`
- `tier`: `'free' \| 'premium'`
- `model`: `'imagen-4.0-fast-generate-001'` (literal string for now; if we add tier-based model selection later, this varies)
- `error_code`: one of `'INVALID_INPUT' \| 'GEMINI_NOT_CONFIGURED' \| 'GENERATION_FAILED' \| 'NO_IMAGE_GENERATED' \| 'INTERNAL_ERROR'`
- `latency_ms`: integer, milliseconds since handler entry
- `sun_sign` / `moon_sign`: enum string from the chart (12 buckets, not PII)
- `has_ascendant`: boolean (true when user provided birth time)

## Data Flow

```
Browser click
  ├─ Locked PRO style?  → trackEvent('avatar_style_locked_clicked', {style})  → no-op
  └─ Generate button    → POST /api/v1/avatar/generate
                              │
       ┌──────────────────────┼─────────────────────┐
       ↓                      ↓                     ↓
  free quota exhausted   Gemini fails         success
       │                      │                     │
   trackServerEvent(      trackServerEvent(    trackServerEvent(
     QUOTA_EXHAUSTED)       FAILED)              GENERATED)
       │                      │                     │
   refund + 403 return    refund + 502/500      200 + image
```

## Error Handling

The PostHog wrapper itself is best-effort: `getServerClient()` returns `null` if `NEXT_PUBLIC_POSTHOG_KEY` is unset (e.g. local dev without analytics). `trackServerEvent` and `trackEvent` no-op silently in that case. No try/catch needed at call sites — the wrapper is already defensive.

If `trackServerEvent` itself throws (network failure to PostHog, posthog-node bug), `waitUntil` will swallow the error after the function returns. Worst case: one missed event. We do not block the user-facing response on telemetry.

## Privacy

The Estrevia PII rule (CLAUDE.md): "PII = birth date/time/location." None of those are in any event:

- `userId` (Clerk format `user_xxx`) is the distinctId — it's the same identifier used elsewhere; not PII per the project's policy.
- `sun_sign`, `moon_sign` are 12-bucket categorical values derived from PII but at extremely low entropy — about 30M people share each Sun sign. They cannot be reversed to a date.
- `has_ascendant` is a boolean (yes / no), not the actual sign, which avoids amplifying entropy when combined with sun/moon.
- No prompt text, no Gemini response data, no image bytes are sent to PostHog.

## Testing

Skipped per Non-Goals. Verification via the PostHog dashboard within 24 hours of deploy:

- Generate one avatar in dev → confirm `avatar_generated` shows up with all 7 properties.
- Click a locked PRO style → confirm `avatar_style_locked_clicked` event with `style`.
- Burn a free quota → confirm `avatar_quota_exhausted` (this is destructive on the dev DB; can be skipped if we don't want to re-block the founder again).
- Trigger a Gemini 502 (e.g. by temporarily hardcoding a bad model name in dev) → confirm `avatar_generation_failed` with `error_code: 'GENERATION_FAILED'`.

## Rollout

Direct-to-main per repo workflow. PostHog events are passive (no feature flag, no user-facing change). Cosmetically the locked-style buttons gain an `aria-disabled` attribute in place of `disabled` — visually identical because the styles already use `disabled:opacity-40 disabled:cursor-not-allowed` Tailwind classes; we'll replicate via `aria-disabled:opacity-40 aria-disabled:cursor-not-allowed` (or by switching to `data-locked` and matching that). One-line CSS update.

## Out-of-Scope Follow-Ups

Tracked for later:

- A PostHog dashboard JSON export checked into `/docs` for funnel/conversion charts.
- An `avatar_section_viewed` event if impression-rate measurement turns out to be needed.
- Per-tier model selection (Pro → `imagen-4.0-generate-001`) and the corresponding `model` property variation.
- Vercel Blob upload (separate task; affects payload, not telemetry).
- Sentry breadcrumbs (would complement telemetry — same call sites).
