# Anonymous-Checkout Sign-In Fix — Design

**Date:** 2026-05-30
**Author:** Claude (Opus 4.8) + founder
**Severity:** P0 (payment path — paying users locked out of the product)
**Source:** `outputs/ad-audit-2026-05-29/REPORT.md` finding `P0-1` (root cause corrected during verification)

## Problem

Anonymous users who **pay** for a subscription cannot sign in to access the product. Their real Clerk account stays on the free tier; a premium `users` row is created under a fake id with a placeholder email. PostHog shows `checkout_recovery_failed = 8/8 (100%)`.

## Root cause (three interacting bugs, confirmed in code)

1. **The anonymous-materialization branch is dead in production.** `src/app/api/v1/stripe/checkout/route.ts:340` sets `client_reference_id: anonymousId` on anonymous sessions. The webhook's `extractClerkUserId()` (`src/app/api/webhooks/stripe/route.ts:47-56`) returns `metadata.clerkUserId ?? client_reference_id`, so for an anonymous session it returns the **anonymousId** (non-null). The `if (!clerkUserId)` guard at `route.ts:181` is therefore skipped — **no Clerk user is created, no sign-in ticket is generated** — and the DB upsert at `route.ts:352` writes a premium row keyed on the raw `anonymousId` with a `stripe-pending-…@placeholder.invalid` email. The real Clerk user (created when the person later signs up) is a different row and stays `free`.
   - **Why the test suite missed it:** `src/app/api/webhooks/stripe/__tests__/anonymous-completion.test.ts` builds mock sessions (`makeSessionCompletedEvent`, lines 89-105) that never set `client_reference_id`, so `extractClerkUserId` returns null in the test and the anon branch runs — the test does not reproduce production.

2. **The sign-in ticket exceeds Stripe's metadata limit.** A Clerk sign-in token (`signInTokens.createSignInToken(...).token`) is a ~552-char JWT. Both the webhook (`route.ts:223-225`) and `/recover` (`recover/route.ts:228-230`) write it into `stripe.checkout.sessions.update({ metadata: { signInTicket } })`. Stripe caps metadata **values at 500 chars** → the call throws. In the webhook this throw rolls back the dedup row (`route.ts:297-300`) and rethrows (`route.ts:315`) **before** the DB upsert and `subscription_started`, so Stripe retries forever and the path never provisions.

3. **`/recover` and `/session-status` depend on the metadata write.** `/session-status` reads `session.metadata?.signInTicket` (`session-status/route.ts:45`); `/recover` reads the same on its fast path (`recover/route.ts:156`) and writes it on provision (`recover/route.ts:228`). Because bug 2 makes the write throw, `/session-status` always returns `ready:false` and `/recover` returns `CHECKOUT_RECOVERY_FAILED`.

The client consumes the ticket via Clerk's native flow: `/sign-in?__clerk_ticket=<token>` (`CheckoutCompleteClient.tsx:29`). The full token is required — we cannot shorten it; we must change **where it is stored**.

## Design

### 1. Ticket transport → Upstash Redis (not Stripe metadata)
New helper `src/shared/lib/checkout-ticket.ts`:
- `storeCheckoutTicket(sessionId: string, token: string): Promise<void>` → `redis.set('checkout_ticket:' + sessionId, token, { ex: 900 })`. TTL 900 s comfortably covers the Clerk token's 600 s expiry.
- `getCheckoutTicket(sessionId: string): Promise<string | null>` → `redis.get(...)`.

Uses the existing client in `src/shared/lib/redis.ts`. The ticket is an ephemeral, single-use credential — Redis with a TTL is the correct home (no migration, not persisted in the primary DB, not visible in the Stripe dashboard).

Replace every `signInTicket`-in-metadata read/write:
- Webhook `route.ts:222-225` → `await storeCheckoutTicket(session.id, ticket.token)` (drop the `sessions.update`).
- `/recover` `route.ts:227-230` → `await storeCheckoutTicket(session.id, ticket)`; fast path `route.ts:155-170` → `getCheckoutTicket(sessionId)`.
- `/session-status` `route.ts:44-51` → `getCheckoutTicket(id)` (no Stripe call needed for the ticket; keep a Stripe `retrieve` only if required for `resource_missing`/404 semantics — see Open Decisions).

### 2. `extractClerkUserId` must not mistake an anonymousId for a Clerk id
`src/app/api/webhooks/stripe/route.ts:47-56` — treat `client_reference_id` as a Clerk user id **only when it looks like one**:
```ts
const ref = obj.client_reference_id ?? null;
return (obj.metadata?.clerkUserId ?? null) || (ref?.startsWith('user_') ? ref : null) || null;
```
Authenticated sessions set both `metadata.clerkUserId` and `client_reference_id = userId` (`checkout/route.ts:220-224`), so they are unaffected. Anonymous sessions now resolve to `null` → the materialization branch runs → a real Clerk user is created and the DB row is keyed correctly. (Subscriptions have no `client_reference_id`, so `subscription.updated/deleted` are unaffected.)

> Bugs 1 and 2 **must ship together**: fixing `extractClerkUserId` alone would make every anonymous checkout enter the branch and then throw on the 500-char metadata write (bug 2), regressing provisioning to a hard 500.

### 3. `/recover` mirrors the webhook's `email_leads` linking (finding C5)
After the users upsert, `/recover` sets `emailLeads.convertedToUserId/convertedAt` (by `anonymous_id` from `session.metadata` or by email) exactly as the webhook does, so a webhook-dropped conversion is still attributed and the lead is suppressed from the drip. Reuse the webhook's matching shape; do **not** re-implement the 21-char `utm_content` unsubscribe fallback here (keep `/recover` minimal — it only links).

### 4. One-time repair of already-orphaned paying anons
Script `scripts/advertising/_repair_orphan_anon_payers_2026_05_30.mjs`, run in two phases:
- **Dry-run (read-only, default):** find `users` rows where `subscriptionTier='premium'` AND (`id` does not start with `user_` OR `email LIKE 'stripe-pending-%@placeholder.invalid'`). For each, resolve the Stripe customer/subscription → real email. Print a report. No writes.
- **Apply (explicit flag, founder-confirmed):** find-or-create the Clerk user by email, move the premium subscription fields onto the real Clerk id (delete/redirect the orphan row), and optionally email a sign-in link. **This mutates prod data + Clerk + possibly sends email → gated behind an explicit `--apply` flag and run only with founder confirmation** (per CLAUDE.md "ask for destructive ops").

## Testing (TDD — write failing tests first)

`anonymous-completion.test.ts` (webhook):
- **New regression test:** an anonymous session **with `client_reference_id` set to an anonymousId** (e.g. a UUID) still enters the materialization branch (`createUser`/`createSignInToken` called, premium row keyed on the materialized `user_…` id). This is the test that should have caught the bug.
- Update the existing "writes signInTicket back to Stripe session metadata" test → assert `storeCheckoutTicket(session.id, token)` is called and `sessions.update` is **not**.
- Add a test with a realistic ~552-char token → no throw, 200 response.
- Keep the "signed-in path when metadata.clerkUserId present" test green.

`extractClerkUserId` unit coverage: `client_reference_id='user_x'` → returns it; `client_reference_id='<uuid>'` → null; `metadata.clerkUserId` present → wins.

New tests for `checkout-ticket.ts` (mock `redis`), `/recover` (Redis store + lead-link mirrored), `/session-status` (reads Redis).

`CheckoutCompleteClient.test.tsx` stays green (client contract `{ ready, ticket }` unchanged).

Gate: `npm test` + `npm run typecheck` + `npm run lint` all green (zero-failure policy on payment path).

## Files touched
- NEW `src/shared/lib/checkout-ticket.ts` (+ `__tests__`)
- EDIT `src/app/api/webhooks/stripe/route.ts` (`extractClerkUserId` guard; ticket → Redis)
- EDIT `src/app/api/v1/checkout/recover/route.ts` (ticket → Redis; mirror lead-link)
- EDIT `src/app/api/v1/checkout/session-status/route.ts` (ticket ← Redis)
- EDIT `src/app/api/webhooks/stripe/__tests__/anonymous-completion.test.ts` (+ regression tests)
- NEW `scripts/advertising/_repair_orphan_anon_payers_2026_05_30.mjs` (dry-run + `--apply`)

## Out of scope (deferred)
- Full extraction of the shared provisioning logic into one helper (finding P2-1). The Redis ticket helper removes the most error-prone duplicated bit; a full extraction is a larger payment-path refactor — separate task.
- Trial-end billing recovery (STR-1), ES checkout friction (STR-2), `landing_view` (P1-1), drip `utm_content` (C4) — separate audit items.

## Risks & mitigations
- **Payment path** → TDD, idempotent upserts unchanged, no change to money movement (read-only Stripe + provisioning only).
- **Redis availability** → if `store` fails, the webhook should still provision (premium upsert) and log; the client falls back to the existing `checkEmail` UI. Ticket store is best-effort like the old metadata write, but its failure no longer throws before the upsert.
- **Single-use ticket** → Clerk tokens are single-use; leaving them to TTL-expire in Redis is fine (client redirects once).
- **Repair script** → dry-run by default; mutations founder-confirmed.

## Open decisions (resolved)
- Storage = **Upstash Redis**. Scope = **core + `/recover` lead-link + orphan repair**.
- `/session-status`: keep it Redis-only for the ticket (drop the Stripe `retrieve` for the happy path) — simpler and removes a Stripe round-trip per poll. 404 semantics become "ticket not yet present" → `ready:false`, which is acceptable (the client polls then falls back to `/recover`).
