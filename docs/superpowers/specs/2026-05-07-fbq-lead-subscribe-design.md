# Browser-side fbq Lead + Subscribe — Design

**Date:** 2026-05-07
**Author:** Kirill (founder) + Claude
**Status:** Approved (sections 1-3)

## Context

Estrevia tracks Lead and Subscribe conversion events for Meta ads in two layers:
- **Server-side via CAPI** (Conversions API) — fired from `/api/webhooks/clerk` (`user_registered` → CAPI `Lead`) and `/api/webhooks/stripe` (`subscription_started` → CAPI `Subscribe`).
- **Browser-side via Meta Pixel** — should fire `fbq('track', 'Lead'|'Subscribe')` at the same user moment with a matching `eventID` so Meta can deduplicate the pair and use the browser-side signal (with `fbp`/`fbc` cookies, IP, UA) to lift Match Quality Score.

Investigation on 2026-05-07 revealed the browser-side half is missing entirely. Comments in `webhooks/clerk/route.ts:115` and `webhooks/stripe/route.ts:257` mention "browser-side fbq Lead/Subscribe" as if it exists, but no `fbq('track','Lead'|'Subscribe')` call is present in the codebase. Only `PageView` (in `[locale]/layout.tsx:69`) and `ViewContent` (in `BirthDataForm.tsx:136`) fire client-side.

Consequence: CAPI events arrive at Meta with low Match Quality Score because there is no browser counterpart contributing identifiers. This degrades Meta's ability to attribute conversions to specific ad clicks and to optimize bidding (especially value-based bidding for Subscribe).

## Goal

Add browser-side `fbq('track', 'Lead')` and `fbq('track', 'Subscribe')` calls that:
1. Fire at the same user moments as the existing server-side CAPI calls.
2. Use a matching `eventID` so Meta deduplicates.
3. Are idempotent — exactly once per user (Lead) / per checkout session (Subscribe).
4. Fail silently if the Pixel base script is absent or `localStorage` is unavailable.

## Non-goals

- Adding a new email-capture UI gate before sign-up (deferred — separate spec).
- Custom `<SignUp />` Clerk component with `onComplete` callback (heavier refactor; not needed for this fix).
- Adding `value` / `currency` / `predicted_ltv` to the browser Subscribe payload — CAPI already carries this server-side, Meta merges deduped events keeping the richer one.
- E2E Playwright coverage of the full sign-up + Stripe flow.

## Architecture

### Two new client components

#### `src/shared/components/MetaPixelLeadEmitter.tsx`

Client-only component placed in `src/app/[locale]/layout.tsx` next to `<UtmCapture />`. On mount and whenever Clerk's `useUser()` hook resolves a signed-in user, it inspects whether this is a fresh sign-up and fires `fbq('track','Lead')` exactly once.

Pseudocode:

```tsx
'use client';
import { useEffect } from 'react';
import { useUser } from '@clerk/nextjs';

const FRESH_SIGNUP_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const STORAGE_PREFIX = 'lead_fired:';

export function MetaPixelLeadEmitter() {
  const { isLoaded, isSignedIn, user } = useUser();

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user) return;
    if (typeof window === 'undefined') return;
    if (typeof (window as any).fbq !== 'function') return; // Pixel disabled

    try {
      const ageMs = Date.now() - new Date(user.createdAt).getTime();
      if (!Number.isFinite(ageMs) || ageMs > FRESH_SIGNUP_WINDOW_MS) return;

      const key = `${STORAGE_PREFIX}${user.id}`;
      if (window.localStorage.getItem(key)) return;

      const eventId = `${user.id}:user_registered`;
      (window as any).fbq('track', 'Lead', {}, { eventID: eventId });
      window.localStorage.setItem(key, '1');
    } catch {
      // localStorage may throw in private/restricted contexts. Silent fail.
    }
  }, [isLoaded, isSignedIn, user]);

  return null;
}
```

#### `src/shared/components/MetaPixelSubscribeEmitter.tsx`

Client-only component placed in `src/app/[locale]/(app)/layout.tsx`. On render with `?session_id=cs_...` in the URL (Stripe success redirect), fires `fbq('track','Subscribe')` exactly once per session id. Layout-level placement (vs page-level on `/settings`) means the emitter is robust against future redirect-target changes — the `?session_id=` URL guard does the actual gating.

Pseudocode:

```tsx
'use client';
import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

const STORAGE_PREFIX = 'subscribe_fired:';

export function MetaPixelSubscribeEmitter() {
  const params = useSearchParams();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (typeof (window as any).fbq !== 'function') return;

    const sessionId = params.get('session_id');
    if (!sessionId) return;

    try {
      const key = `${STORAGE_PREFIX}${sessionId}`;
      if (window.localStorage.getItem(key)) return;

      const eventId = `${sessionId}:subscription_started`;
      (window as any).fbq('track', 'Subscribe', {}, { eventID: eventId });
      window.localStorage.setItem(key, '1');
    } catch {
      // Silent fail.
    }
  }, [params]);

  return null;
}
```

### Server-side change

`src/app/api/webhooks/stripe/route.ts:276` — change the dedupe key from a subscription-id-or-session-id mix to session-id only:

```diff
- $insert_id: `${stripeSubscriptionId ?? session.id}:subscription_started`,
+ $insert_id: `${session.id}:subscription_started`,
```

Rationale: the browser only knows `session_id` from the Stripe success redirect URL. To match `eventID` for dedupe, both sides must derive the key from a value both have. `session.id` is the canonical entry point of `subscription_started` (it fires only inside `checkout.session.completed`), so using it for the dedupe key is sound. Renewals are not counted as `subscription_started` (already enforced — fired only here, not in `customer.subscription.updated`).

## Data flow

```
Sign-up:
  1. User completes Clerk hosted /sign-up
  2. Clerk → POST /api/webhooks/clerk → trackServerEvent(user_registered, {$insert_id: `${userId}:user_registered`, ...})
                                       → CAPI Lead with event_id = `${userId}:user_registered`
  3. Clerk redirects browser to redirect_url (or /)
  4. [locale]/layout.tsx mounts → MetaPixelLeadEmitter detects fresh user → fbq('track','Lead', {}, {eventID: `${userId}:user_registered`})
  5. Meta dedupes by event_id, merges events, keeps richer payload (CAPI side)

Subscribe:
  1. User completes Stripe Checkout
  2. Stripe → POST /api/webhooks/stripe (checkout.session.completed) → trackServerEvent(subscription_started, {$insert_id: `${session.id}:subscription_started`, ...})
                                       → CAPI Subscribe with event_id = `${session.id}:subscription_started`
  3. Stripe redirects browser to ${appUrl}/settings?session_id=cs_...
  4. /settings renders → MetaPixelSubscribeEmitter reads session_id from URL → fbq('track','Subscribe', {}, {eventID: `${session_id}:subscription_started`})
  5. Meta dedupes by event_id
```

## Idempotency

- **Lead:** key `lead_fired:${userId}` in `localStorage`. Plus `user.createdAt` freshness window (≤10 min) acts as belt-and-suspenders — even if `localStorage` is wiped, an old user logging in won't refire.
- **Subscribe:** key `subscribe_fired:${sessionId}` in `localStorage`. Stripe success URLs aren't normally re-loaded, but a refresh would be a re-fire risk without the flag.

Both flags survive page navigation within the same browser. They do not survive across browsers/devices, but Meta's server-side dedupe by event_id covers that case (browser fires once per device max; CAPI fires once total; Meta keeps one).

## Error handling

| Failure mode | Behavior |
|---|---|
| `NEXT_PUBLIC_META_PIXEL_ID` unset | `window.fbq` is undefined; emitter returns early silently. |
| `localStorage` unavailable (private mode, ITP) | try/catch around get/setItem; on throw, return silently (do not fire — better to skip than risk dupes). |
| Clerk `useUser` not yet loaded | Gated by `isLoaded` — useEffect re-runs once Clerk resolves. |
| Stripe redirect with malformed `session_id` | `eventID` becomes `${malformed}:subscription_started`; no harm, Meta will accept any string and match (or not) on its side. |
| Pixel base script blocked by ad-blocker | Same as Pixel disabled path — emitter is no-op. CAPI server-side still works. |

No errors propagate. No `console.error` either (this is best-effort analytics).

## Testing

### New Vitest unit tests

`src/shared/components/__tests__/MetaPixelLeadEmitter.test.tsx`
- Does not fire when `isSignedIn=false`
- Does not fire when `user.createdAt` is older than the freshness window
- Does not fire when `window.fbq` is undefined
- Does not fire twice for the same `user.id` (`localStorage` flag prevents)
- Fires exactly once for a fresh signed-in user with the correct `eventID = ${userId}:user_registered`
- Tolerates `localStorage` throwing on `getItem` / `setItem` (silent fail)

`src/shared/components/__tests__/MetaPixelSubscribeEmitter.test.tsx`
- Does not fire without `?session_id=` in URL
- Does not fire when `window.fbq` is undefined
- Does not fire twice for the same `session_id`
- Fires exactly once with `eventID = ${session_id}:subscription_started`
- Tolerates `localStorage` throwing

### Existing tests to update

`src/app/api/webhooks/stripe/__tests__/route.test.ts:193,229`
- Update expected `$insert_id` value to `${session.id}:subscription_started` (drop the subscription-id branch).

### Manual smoke check (post-deploy)

In Meta Events Manager → Test Events tab, paste a prod URL with `?fbclid=test_<random>`. Run through:
1. Sign up via Clerk hosted page → see `Lead` event with `Browser` AND `Server` tags merged into one row in the activity log. Match Quality column reports a score.
2. Complete a Stripe test-mode subscription → repeat for `Subscribe`.

Within ~3-7 days Meta recalculates Match Quality Score on a rolling basis. Expect Lead and Subscribe to move from `Low`/`Medium` to `Medium`/`High`.

## Release checklist

1. Open PR with the changes.
2. Verify `npm test`, `npm run typecheck`, `npm run lint` are green.
3. Merge to `main`. Vercel auto-deploys.
4. Run **migration 0007** against prod (`npm run db:migrate` against prod `DATABASE_URL`). This is unrelated to this spec but discovered during 2026-05-07 investigation; without it, `users.locale` column is missing and the Clerk webhook will fail when the deployed code includes the locale field.
5. Run the manual smoke check in Meta Events Manager (Test Events tab).
6. Monitor: open Meta Events Manager → Diagnostics tab → confirm zero "Missing Browser/Server Pair" warnings for Lead and Subscribe within 24h.

## Files affected

```
+ src/shared/components/MetaPixelLeadEmitter.tsx                       (new, ~30 LOC)
+ src/shared/components/MetaPixelSubscribeEmitter.tsx                  (new, ~25 LOC)
+ src/shared/components/__tests__/MetaPixelLeadEmitter.test.tsx        (new, ~80 LOC)
+ src/shared/components/__tests__/MetaPixelSubscribeEmitter.test.tsx   (new, ~70 LOC)
M src/app/[locale]/layout.tsx                                          (+1 import, +1 JSX)
M src/app/[locale]/(app)/layout.tsx                                    (+1 import, +1 JSX)
M src/app/api/webhooks/stripe/route.ts                                 (1 line: $insert_id format)
M src/app/api/webhooks/stripe/__tests__/route.test.ts                  (2 expected values updated)
```

Estimated effort: 1-1.5 hours (component code + tests + webhook line + test fixtures).

## Out of scope (for follow-up specs)

- Email-capture gate before Clerk sign-up (lead magnet pattern). Bigger UX change; lifts Lead-event volume by capturing visitors who aren't ready to commit to full sign-up.
- Custom audiences built off the new richer Lead/Subscribe data once Meta accumulates enough events.
- Migrating `chart_calculated` ViewContent event to the same dedupe pattern (currently fires only client-side; CAPI side is mapped but never invoked because `trackServerEvent` is not called from `/api/v1/chart/calculate`).
