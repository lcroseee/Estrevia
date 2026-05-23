# Fix: anonymous checkout idempotency-key collision (StripeIdempotencyError → INTERNAL_ERROR)

**Date:** 2026-05-23
**Severity:** Sev1 — anonymous checkout (primary conversion funnel) broken in prod for both EN + ES.

## Root cause (proven, not inferred)

`PaywallModal` "Comenzar prueba de 3 días" → `POST /api/v1/stripe/checkout` → `500 INTERNAL_ERROR`
→ frontend shows generic "Something went wrong." (`PaywallModal.tsx:132`).

The swallowed error is **`StripeIdempotencyError: Keys for idempotent requests can only be
used with the same parameters they were first used with.`** (captured via live-Stripe probe).

Chain:
1. `route.ts:56` reads cookie `anonymous_id`, but **that cookie is never set anywhere** in the
   codebase (verified: only `estrevia_passport_ref`, `ph_device_id`, `_fbc/_fbp` are written).
2. So `anonymousId` is always `null` in prod.
3. `route.ts:293` key = `checkout:${anonymousId ?? 'noanon'}:${plan}:${day}` ⇒ always the **shared**
   `checkout:noanon:<plan>:<day>` for every anonymous visitor.
4. First anon request of the day claims the key; every later one with *different params*
   (locale / utm / email-state) ⇒ `StripeIdempotencyError` ⇒ `INTERNAL_ERROR`.

Introduced by T2/T3 (`200e80a`/`7ed2de9`, 2026-05-21 16:5x) which added the idempotency keys —
matches the "ES 0%" onset in the 05-21 audit. Authenticated branch (`checkout:${userId}:…`) is
unique per user, so the breakage is concentrated in the anonymous funnel.

Two defects to fix (both required for correctness):
- **(D1) shared identity** — `'noanon'` collapses all anon users to one key.
- **(D2) param-blind key** — even a unique per-user key false-errors when *that user's* params
  change between same-day clicks.

## Fix (scope: core + cookie, founder-approved)

### A. `findOrPrepareCustomer.ts` — add `buildCheckoutIdempotencyKey()`
Param-aware key: `checkout:<identity>:<plan>:<day>:<sha256(canonical params)[0:32]>`
- canonical params = `{ plan, stripeLocale, localeFromBody, sortedUtm, customer }`
- true double-click (identical body) ⇒ identical key ⇒ Stripe dedups (intended T2/T3 behavior) ✅
- any genuine difference ⇒ new key ⇒ no false error ✅  (fixes **D2**)

### B. `route.ts` — wire helper into BOTH branches
- identity = `userId ?? anonymousId ?? randomUUID()` (the `randomUUID()` fallback guarantees a
  cookieless-at-checkout race never reuses a shared key) (fixes **D1** at the route layer)
- customer component = resolved `stripeCustomerId | reuseCustomerId | email | 'new'`

### C. `middleware.ts` — set stable `anonymous_id` cookie
- if `req.cookies.get('anonymous_id')` absent → `crypto.randomUUID()`, attach to responses we
  already own (`intlMiddleware(req)` result + the page/redirect responses). Do **not** convert the
  `undefined`-continue branches to `NextResponse.next()` (would strip Clerk's auth headers).
- cookie attrs: `httpOnly` (no client reads it), `secure` in prod, `sameSite:'lax'`, `path:'/'`,
  `maxAge: 1y`. Set only when absent ⇒ only first request per visitor carries `Set-Cookie`.
- gives every anon a stable unique id (fixes **D1** at source) + fixes the rate-limit key
  (currently falls back to shared NAT IP).

## Tests (TDD — payment path, zero-failure policy)
1. `anonymous.test.ts`: NEW — two requests differing only in `locale` (or `utm`) ⇒ **different**
   `idempotencyKey`; identical params ⇒ **same** key. (Fails on current code: both = `checkout:noanon:…`.)
2. `anonymous.test.ts:116` + `route.test.ts:123` style assertions: update to new key format.
3. `tests/middleware-auth.test.ts`: NEW — no `anonymous_id` cookie ⇒ response sets it (httpOnly);
   present ⇒ no `Set-Cookie` for it.

## Verify
`npx vitest run` on checkout + middleware suites → `npm test` → `npm run typecheck` → `npm run lint`.
Founder owns: push to main + post-deploy fresh-anon prod smoke (expect `success:true` + checkout URL).

## Out of scope (note for later)
Aligning `anonymous_id` with PostHog distinctId so the anon **email prefill** lookup
(`route.ts:251-260`, currently dead) actually matches `email_leads.anonymousId`.
