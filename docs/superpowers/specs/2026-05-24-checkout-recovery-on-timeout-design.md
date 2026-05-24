# Checkout Recovery on Timeout — Design Spec

**Date:** 2026-05-24
**Status:** Approved by founder, ready for implementation plan
**Author:** Claude (brainstorm session)
**Context:** PostHog audit 2026-05-24 — 14 `checkout_ticket_timeout` events across 5 unique EN users in last 14d. Users paid via Stripe but the webhook never finished provisioning before the client-side 30s poll gave up. Silent revenue loss ≈ 1 paying customer / week.

---

## 1. Problem

Today's checkout completion flow has three tiers of waiting for the Stripe webhook to write a Clerk sign-in ticket back to `session.metadata.signInTicket`:

1. **Server pre-poll** (`page.tsx`, 8s, 500ms interval) — handles 95th-percentile webhook delivery
2. **Client poll** (`CheckoutCompleteClient.tsx`, 30s, 2s interval) — handles slow webhook delivery
3. **Timeout fallback** — fires `checkout_ticket_timeout` PostHog event, shows "check your email" message

When the webhook is delayed beyond 38s OR fails entirely (Vercel cold start, Stripe lag, transient 5xx in handler), the user lands on a dead-end screen. They:
- Have paid (Stripe charged the card)
- Have no Clerk user (or have one but no sign-in ticket they can use)
- Get no purchase confirmation email (also fires from webhook)
- Cannot self-recover — must email support

**Evidence:**
- 14 events / 14d → 5 unique paying users stuck
- ~1 paying customer / week silently lost
- Revenue impact: $5–35/customer × 4/month = $20–140/month direct loss + downstream churn

## 2. Goals

- When the client 30s poll times out, **call Stripe directly** to verify payment status
- If session is paid → synchronously provision Clerk user + sign-in ticket + DB row → auto-redirect (same behavior as the happy path)
- If session is NOT paid → keep current "check email" fallback (no change)
- Zero TypeScript errors, zero lint warnings, all tests green
- Idempotent: webhook arriving after recovery does NOT double-provision (existing `processed_stripe_events` dedup + Clerk find-or-create + DB upsert make this safe)

## 3. Non-Goals

- ❌ Extract the webhook's `checkout.session.completed` branch into a shared module (over-engineering; the two paths have different requirements)
- ❌ Recover the 5 historical affected users (handled separately by founder via Clerk admin)
- ❌ Replicate PostHog `subscription_started` / Meta CAPI `Subscribe` / Resend purchase email from recovery path — those are best-effort side effects that webhook will fire when (if) it eventually arrives. Recovery's only goal is **giving the paid user access**.
- ❌ Add a scheduled recovery cron — single-shot client-triggered recovery is sufficient for the observed failure rate
- ❌ Extend the existing client poll timeout (doesn't fix outright webhook drops)

## 4. Decisions Log

| Decision | Choice | Rationale |
|---|---|---|
| **Endpoint shape** | New `POST /api/v1/checkout/recover` | Matches existing `/api/v1/*` REST convention; separable from read-only `/session-status` |
| **Trigger** | Client-side, on the existing 30s poll timeout | Smallest UX change — replaces `setTimedOut(true)` branch |
| **Auth** | Public (rate-limited by IP) | Session ID is the authorization; only the person holding it can recover |
| **Shared provisioner extract?** | **No** | Recovery does the MINIMUM (Clerk user + ticket + DB row). Webhook does that PLUS side effects (PostHog, CAPI, email). Coupling them creates worse code than duplicating the ~50 LoC of essential logic |
| **Idempotency** | Insert synthetic `recovery:cs_xxx` row into `processed_stripe_events` + Clerk find-or-create + DB upsert | Same primitives webhook already uses |
| **What if webhook arrives later?** | Webhook's own `processed_stripe_events` dedup is keyed by Stripe `event.id`, not session.id — so it WILL still run and fire its side effects (PostHog, email). Recovery only owns user-access provisioning; webhook owns telemetry. Both paths converge safely via DB upsert. |
| **Telemetry on recovery** | `checkout_recovery_attempted` + `checkout_recovery_succeeded` / `checkout_recovery_failed` PostHog events | Observability for post-deploy verification |
| **Rate limit** | 5 req/min per IP via `getRateLimiter('checkout/recover')` | Higher cost than session-status; one legitimate user needs 1–2 calls |

## 5. Architecture

### 5.1 File footprint

| File | Change | Lines |
|---|---|---|
| `src/app/api/v1/checkout/recover/route.ts` | **NEW** — POST endpoint | +180 |
| `src/app/api/v1/checkout/recover/__tests__/route.test.ts` | **NEW** — unit tests | +220 |
| `src/app/[locale]/checkout/complete/CheckoutCompleteClient.tsx` | On timeout, call recover endpoint before showing fallback | +25 |
| `src/app/[locale]/checkout/complete/__tests__/CheckoutCompleteClient.test.tsx` | Add 2 cases (recovery success → redirect; recovery fail → fallback) | +50 |
| `src/shared/lib/analytics/events.ts` | Add 3 enum entries | +3 |
| **Total** | | **~478** |

### 5.2 New endpoint contract

```
POST /api/v1/checkout/recover
Content-Type: application/json
Body: { "session_id": "cs_xxx" }

Responses:
  200 { success: true,  data: { ready: true,  ticket: "..." }, error: null }
  200 { success: true,  data: { ready: false }, error: null }    // session not paid yet
  400 { success: false, data: null, error: "BAD_REQUEST" }       // missing/malformed session_id
  404 { success: false, data: null, error: "NOT_FOUND" }         // Stripe says session doesn't exist
  429 { success: false, data: null, error: "RATE_LIMITED" }
  500 { success: false, data: null, error: "INTERNAL_ERROR" }    // Clerk down, DB down, etc.
```

Mirrors `session-status` response shape so the client can reuse its branching logic.

### 5.3 Recovery logic (pseudocode)

```ts
POST /api/v1/checkout/recover {session_id}:
  1. Parse body → session_id (zod). 400 on parse failure.
  2. Rate-limit by IP. 429 on limit.
  3. stripe.checkout.sessions.retrieve(session_id)
     - 404 on resource_missing
     - 500 on other Stripe errors
  4. Guard: session.payment_status !== 'paid' AND session.status !== 'complete'
     → return { ready: false } (let client show fallback message)
  5. Guard: session.mode !== 'subscription'
     → return { ready: false } (not our concern)
  6. If session.metadata.signInTicket exists already:
     → fire 'checkout_recovery_succeeded' (cached=true)
     → return { ready: true, ticket }
  7. Track 'checkout_recovery_attempted'
  8. Extract email = session.customer_details?.email; 400 if absent.
  9. Clerk find-or-create user by email (with race recovery, like webhook does)
 10. Generate Clerk signInToken(expiresInSeconds=600)
 11. Stripe.checkout.sessions.update(id, metadata: {...existing, signInTicket})
 12. DB users upsert (id, email, stripe IDs, tier='premium', plan, expiresAt) — copy of webhook's upsert
 13. Insert 'recovery:<session_id>' into processed_stripe_events (onConflictDoNothing) for observability
 14. Track 'checkout_recovery_succeeded' (cached=false)
 15. Return { ready: true, ticket }

On any unexpected error:
  → Sentry captureException
  → Track 'checkout_recovery_failed' with reason
  → Return 500
```

### 5.4 Client change (CheckoutCompleteClient.tsx)

Current:
```ts
if (!cancelled) {
  trackEvent(AnalyticsEvent.CHECKOUT_TICKET_TIMEOUT, { ... });
  setTimedOut(true);
}
```

New:
```ts
if (!cancelled) {
  trackEvent(AnalyticsEvent.CHECKOUT_TICKET_TIMEOUT, { ... });
  // Last-ditch: ask the server to self-recover by hitting Stripe directly.
  try {
    const res = await fetch('/api/v1/checkout/recover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
    });
    if (res.ok) {
      const json = (await res.json()) as StatusResponseOk;
      if (json.success && json.data.ready && json.data.ticket) {
        window.location.href = `/sign-in?__clerk_ticket=${encodeURIComponent(json.data.ticket)}&redirect_url=${encodeURIComponent('/settings')}`;
        return;
      }
    }
  } catch {
    // Network blip on recovery — fall through to fallback UI.
  }
  setTimedOut(true);
}
```

### 5.5 Idempotency story

The webhook handler dedups on `event.id` (Stripe event ID, unique per delivery). Recovery uses `recovery:<session.id>` as a marker row — it cannot collide with any real Stripe event ID (those start with `evt_`).

| Scenario | DB state | Behavior |
|---|---|---|
| Recovery → webhook arrives later | `users` row has Premium, ticket in Stripe metadata | Webhook upserts same data (no change) + fires PostHog/CAPI/email side effects |
| Webhook → recovery never called | Normal flow | (no change to today) |
| Recovery called twice (user double-clicks somehow) | Second call hits step 6 fast-path (ticket already in metadata) | Returns same ticket |
| Recovery succeeds, webhook NEVER arrives | `users` row has Premium, NO purchase email sent | Acceptable — user has access. Founder can manually trigger Resend if needed. |
| Recovery and webhook race | Both call Clerk find-or-create (race handled), both upsert DB (idempotent) | Last write wins; data is identical |

### 5.6 Data flow

```
[user pays on Stripe Checkout]
  → Stripe redirects to /checkout/complete?session_id=cs_xxx
    → page.tsx server poll (8s, looks for signInTicket in Stripe metadata)
       - Found? redirect to /sign-in?__clerk_ticket=…  [HAPPY PATH 95%]
    → CheckoutCompleteClient client poll (30s, polls /session-status)
       - Webhook eventually arrives, sets ticket → poll returns ready=true → redirect [HAPPY PATH 4%]
    → 30s timeout fires
       - track CHECKOUT_TICKET_TIMEOUT
       - POST /api/v1/checkout/recover  [NEW — handles last 1%]
         - Stripe says session paid → provision → return ticket → redirect to /sign-in
         - Stripe says session not paid → ready=false → setTimedOut(true) → "check email" UI
```

## 6. Error Handling

- **Stripe API down during recovery**: return 500, client falls back to "check email" UI. User is still stuck, but PostHog `checkout_recovery_failed` event surfaces it for ops.
- **Clerk API down during recovery**: same — 500 → fallback UI.
- **Clerk race (user created between getUserList and createUser calls)**: retry getUserList once (same pattern as webhook line 207-214).
- **DB upsert fails**: 500 → fallback UI. User can sign in later; Premium will be re-provisioned by webhook if it eventually arrives.
- **session.customer_details.email is null**: should not happen for subscription mode (Stripe requires email), but return 400 with `BAD_REQUEST` and skip recovery.

## 7. Testing

### 7.1 New tests: `src/app/api/v1/checkout/recover/__tests__/route.test.ts`

- ✅ Returns `ready: true` + ticket when session paid, no existing ticket
- ✅ Returns cached `ready: true` + ticket when session has existing `signInTicket` in metadata (fast path)
- ✅ Returns `ready: false` when session `payment_status !== 'paid'`
- ✅ Returns `ready: false` when session mode is not subscription
- ✅ Returns 400 when body missing `session_id`
- ✅ Returns 404 when Stripe says session doesn't exist
- ✅ Returns 429 when rate limit exceeded
- ✅ Handles Clerk find-then-create race (createUser fails, getUserList retry finds it)
- ✅ DB upsert merges with existing row (does not overwrite email if present)
- ✅ Returns 500 + fires Sentry when Stripe throws unexpected error

### 7.2 Updated tests: `CheckoutCompleteClient.test.tsx`

Existing 2 tests stay. Add:

- ✅ On 30s timeout, calls recovery endpoint and redirects when it returns `ready: true`
- ✅ On 30s timeout, calls recovery endpoint and shows fallback UI when it returns `ready: false`
- ✅ On 30s timeout, recovery fetch network error → shows fallback UI (no crash)

### 7.3 Manual smoke test (post-deploy)

1. Stripe Dashboard → temporarily disable webhook endpoint (Test mode)
2. Complete a test checkout
3. Wait 30s on /checkout/complete page
4. Confirm redirect to /sign-in fires (recovery path engaged)
5. Re-enable webhook
6. Check PostHog Live Events — see `checkout_recovery_attempted` + `checkout_recovery_succeeded`

## 8. Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Recovery code drifts from webhook over time → behavior diverges | Medium | Spec explicitly enumerates which fields recovery sets (Section 5.3 step 12). Future webhook changes touching `users` upsert must check recovery route — codified as TODO comment in route header. |
| Webhook fires AFTER recovery → double-fires `subscription_started` to PostHog | Low | `$insert_id` in webhook (line 425) keyed off `session.id` — PostHog server-side dedup handles it |
| Webhook fires AFTER recovery → double-fires Meta CAPI Subscribe | Low | Same `$insert_id` flows through to CAPI `event_id` per webhook comment line 405-406 |
| Recovery succeeds but no purchase email sent | Medium | Acceptable for 1/week edge case; founder can send manually. Future iteration: trigger email from recovery path too. |
| Rate limit blocks legitimate user retries | Low | 5 req/min per IP is generous for 1-2 manual retry attempts |
| Recovery endpoint becomes attack surface (someone hits it with random session_ids) | Low | Rate-limited; Stripe `resource_missing` returns 404 (no info leak); successful recovery requires session.customer_details.email to exist (signed by Stripe) |

## 9. Out of Scope (re-iterated)

- Historical recovery of the 5 affected users (founder handles separately)
- Refactor of webhook `checkout.session.completed` branch
- Purchase confirmation email from recovery path
- Scheduled recovery cron
- Increasing server pre-poll or client poll timeouts

## 10. Approval & Next Steps

- ✅ Design approved by founder 2026-05-24 (brainstorm session — "ок делай")
- → Spec self-review (this document)
- → Invoke `writing-plans` skill to produce implementation plan
- → Execute plan → smoke test → ship
