# Anonymous Stripe Checkout with Deferred Clerk Materialization

**Status:** Approved design
**Date:** 2026-05-17
**Author:** Kirill (founder) + Claude (brainstorming partner)

## Problem

Paywall-to-Stripe conversion is at **0%**. PostHog data for 2026-05-17 (post US-region migration) shows a single user (`019e37de-7e0d-75fb-b0b3-e5b6105015f8`) walked the entire paywall funnel in 4 minutes — pageview → chart_calculated → email_lead_submitted → paywall_cta_viewed → paywall_opened → paywall_trial_clicked → **checkout_auth_redirect** → `$pageleave`. Zero `checkout_stripe_redirected` events. Zero `subscription_started` events.

Root cause: the current flow forces anonymous users through Clerk sign-up **before** Stripe Checkout. `POST /api/v1/stripe/checkout` calls `requireAuth()` → returns 401 for anonymous users → `PaywallModal` redirects to `/sign-up?redirect_url=/checkout/start?…`. The Clerk sign-up screen on mobile (~95% of traffic per PostHog device breakdown) and especially in Facebook in-app browser (third-party-cookie blocked, no Google One Tap, no Apple Sign-In WebAuthn) becomes the conversion killer.

Today the funnel collapses at the sign-up gate. We need to flip the order: pay first via Stripe Checkout (which already supports Apple Pay / Google Pay / one-click email collection in mobile webviews), materialize the Clerk account from the webhook on success, and auto-sign-in via a Clerk sign-in ticket.

## Goals

1. Allow anonymous users to start Stripe Checkout without first creating a Clerk account.
2. Pre-fill `customer_email` from `email_leads` when the visitor has gone through HeroCalculator's email-gate; otherwise let Stripe Checkout collect email natively.
3. After successful payment, materialize the Clerk user server-side (via Clerk Backend SDK) and auto-sign-in the buyer via a single-use Clerk sign-in ticket.
4. Preserve all existing behavior for signed-in users (no regression to current logged-in checkout path).
5. Preserve UTM attribution end-to-end (anonymous → Stripe metadata → webhook → `subscription_started` event → Meta CAPI Subscribe).

## Non-Goals

- A/B testing the new flow vs. old flow. Current conversion is 0%; cut over fully. (No feature flag.)
- Inline email input on the PaywallModal. Stripe Checkout collects email natively when `customer_email` is not pre-filled.
- Magic-link sign-in email as the primary auth path. (Server-side sign-in ticket is the primary; magic-link only as 30-second-timeout fallback.)
- Password setup prompt after payment. Clerk supports passwordless natively; users can set a password later via account settings.
- Refactoring the Stripe webhook dedup-row bug into its own PR. (Mitigation noted in Error Handling; the underlying bug fix is out of scope for this spec but recommended as a follow-up.)
- Real-time push of "account ready" via WebSocket. Server-side polling + client fallback is sufficient.
- Custom Stripe Elements embedded form. Hosted Stripe Checkout is the chosen surface.
- Schema migration. `users.id` stays Clerk user ID; the anonymous_id and email-lead linkage live in Stripe metadata + existing columns.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Post-payment auth UX | Auto-create Clerk user + auto-sign-in via short-lived sign-in ticket | Zero clicks between Stripe success and signed-in app state — lowest possible friction. |
| Email source for users without `email_lead` | Stripe Checkout collects natively | Stripe UI is trusted, mobile-optimised, integrates with Apple Pay / Google Pay. No friction added on our side. |
| Endpoint architecture | One endpoint with conditional `auth()` | Single Stripe-session-create surface; client (PaywallModal) never branches; UTM/Idempotency/customer-reuse logic stays in one place. |
| Clerk user creation timing | Webhook-side (post-payment) | Avoids ghost Clerk accounts for abandoned checkouts; clean idempotency via Stripe event retries. |
| Sign-in ticket transport | Stored in Stripe session `metadata.signInTicket` (updated by webhook) | Settings page can read it server-side via `stripe.checkout.sessions.retrieve`; no separate DB table; survives webhook/success-page race. |
| Settings page ticket wait strategy | Server-side poll up to 8s, then client-side polling fallback to 30s | Fluid Compute default 300s budget easily covers 8s wait; client fallback handles slow webhook delivery; degraded UX after 30s falls back to "check email" path. |
| Anonymous rate-limit key | `anonymous_id` cookie first, fallback IP | Existing Upstash limiter; protects against DDoS without blocking legitimate retries. |
| `email_leads.converted_to_user_id` linkage | UPDATE via `(anonymous_id = ? OR email = ?)` in webhook | Captures both linkage paths; covers case where user changes email at Stripe Checkout. |

## Architecture

### High-level

```
ANONYMOUS USER PATH (NEW)
─────────────────────────
PaywallModal click "Start Free Trial"
   ↓
POST /api/v1/stripe/checkout  (no auth, anonymous_id cookie)
   ↓
checkout route:
   - auth() → null → anonymous branch
   - lookup email from email_leads via anonymous_id (best-effort)
   - stripe.checkout.sessions.create:
       customer_email (if found),
       client_reference_id = anonymous_id,
       metadata = { anonymous_id, ...utm },
       trial_period_days: 3,
       success_url = /settings?session_id={CHECKOUT_SESSION_ID}
   - return { url }
   ↓
[user redirects to Stripe Checkout, pays]
   ↓
[Stripe redirects to /settings?session_id=cs_xxx (parallel to webhook)]
[Stripe sends webhook checkout.session.completed]
   ↓
Webhook (async):
   - extract clerkUserId from metadata → null
   - email = session.customer_details.email
   - clerkUserId = findOrCreateClerkUser(email)
   - ticket = clerkClient.signInTokens.createSignInToken(userId)
   - stripe.checkout.sessions.update(id, metadata: { …, signInTicket })
   - UPDATE email_leads SET converted_to_user_id = userId WHERE …
   - existing users upsert (now with materialized clerkUserId)
   ↓
/settings server component (server-side):
   - auth() → null (still anonymous)
   - waitForTicket(sessionId, 8000ms):
       loop stripe.checkout.sessions.retrieve until metadata.signInTicket exists
   - if ticket: redirect /sign-in?__clerk_ticket=…
   - if no ticket after 8s: render <ClientPolling/>
   ↓
Clerk consumes ticket → session cookie set → land on /settings, signed-in, Pro tier active

SIGNED-IN USER PATH (UNCHANGED)
───────────────────────────────
PaywallModal click "Start Free Trial"
   ↓
POST /api/v1/stripe/checkout
   ↓
checkout route:
   - auth() → user → existing branch (clerkUserId metadata, customer reuse, etc.)
   - returns Stripe URL
   ↓
[Stripe → success_url → /settings?session_id=… → auth() resolves → render normal settings]
```

### Boundaries

| Concern | Location | Not in |
|---|---|---|
| Auth mode decision (anonymous vs signed-in) | `/api/v1/stripe/checkout` route | PaywallModal (always calls one URL) |
| Email lookup (anonymous_id → email) | checkout route, server-side | Stripe Checkout (fallback only) |
| Clerk user creation | webhook (`checkout.session.completed`) | checkout route (never creates accounts pre-payment) |
| Sign-in ticket creation | webhook, after Clerk user materialization | client |
| Ticket consumption | `/settings` page server component | webhook |
| Pre-payment Clerk operations | NONE | (deliberate invariant) |

## Data Flow

### Detailed timeline

```
T=0     PaywallModal.handleCheckout()
        cookie: anonymous_id=xyz (set by analytics layer / PostHog)
        POST /api/v1/stripe/checkout
          body: { plan, returnUrl, utm_source, utm_campaign, utm_content, utm_medium, utm_term }
T=0.1   checkout route:
          - auth() → null
          - SELECT email FROM email_leads WHERE anonymous_id='xyz' ORDER BY created_at DESC LIMIT 1
          - stripe.checkout.sessions.create({
              mode: 'subscription',
              line_items: [{ price: priceId, quantity: 1 }],
              customer_email: <found email or undefined>,
              client_reference_id: 'xyz',
              metadata: { anonymous_id: 'xyz', ...utm },
              subscription_data: { trial_period_days: 3, metadata: { anonymous_id: 'xyz', ...utm } },
              success_url: `${appUrl}/settings?session_id={CHECKOUT_SESSION_ID}`,
              cancel_url: `${appUrl}/pricing`,
              allow_promotion_codes: true,
              billing_address_collection: 'auto',
            })
          - trackServerEvent(distinctId='xyz', AnalyticsEvent.ANONYMOUS_CHECKOUT_STARTED, { email_known: bool, plan, ...utm })
          - return { url: session.url }
T=0.3   PaywallModal: window.location.href = session.url
T=0.5   user lands on Stripe Checkout
T=...   user enters card / Apple Pay / Google Pay → pays
T=N     Stripe redirects to /settings?session_id=cs_xxx
        Stripe POSTs webhook (parallel, T=N+0.1 to N+3s)

WEBHOOK (async, may arrive before/after user lands on /settings)
─────────────────────────────────────────────────────────────────
case 'checkout.session.completed':
  clerkUserId = extractClerkUserId(session) → null (anonymous case)
  if (clerkUserId === null):
    email = session.customer_details?.email
    if (!email): throw — Stripe always provides email on completion
    try:
      existing = await clerkClient.users.getUserList({ emailAddress: [email] })
      if (existing.totalCount > 0):
        clerkUserId = existing.data[0].id
      else:
        try:
          newUser = await clerkClient.users.createUser({
            emailAddress: [email],
            skipPasswordChecks: true,
            skipPasswordRequirement: true,
            externalId: `stripe:${session.id}`,
          })
          clerkUserId = newUser.id
        except 'form_identifier_exists' / similar race:
          retry = await clerkClient.users.getUserList({ emailAddress: [email] })
          if (retry.totalCount > 0): clerkUserId = retry.data[0].id
          else: throw
      ticket = await clerkClient.signInTokens.createSignInToken({
        userId: clerkUserId,
        expiresInSeconds: 600,
      })
      await stripe.checkout.sessions.update(session.id, {
        metadata: { ...session.metadata, signInTicket: ticket.token }
      })
      anonymous_id = session.metadata?.anonymous_id ?? null
      await db.update(emailLeads)
        .set({ convertedToUserId: clerkUserId, convertedAt: new Date() })
        .where(or(
          eq(emailLeads.anonymousId, anonymous_id),
          eq(emailLeads.email, email)
        ))
      trackServerEvent(clerkUserId, AnalyticsEvent.ANONYMOUS_USER_MATERIALIZED, {
        created_new: bool, session_id: session.id, anonymous_id,
      })
      trackServerEvent(clerkUserId, AnalyticsEvent.CHECKOUT_TICKET_READY, { session_id: session.id })
    except (Clerk error):
      // Rollback dedup so Stripe retries; throw to outer catch
      await db.delete(processedStripeEvents).where(eq(processedStripeEvents.eventId, event.id))
      throw
  // Continue existing upsert into our users table with the now-materialized clerkUserId

T=N+1   /settings server component
        - auth() → null
        - sessionId = searchParams.session_id
        - ticket = await waitForTicket(sessionId, 8000ms)
            loop: const s = await stripe.checkout.sessions.retrieve(sessionId)
                  if (s.metadata?.signInTicket): return s.metadata.signInTicket
                  await sleep(500); retry
        - if ticket: redirect(`/sign-in?__clerk_ticket=${ticket}`)
        - else: render <ClientCheckoutPolling sessionId={sessionId} />

T=N+1.x ClientCheckoutPolling component (only if 8s server poll failed)
        - GET /api/v1/checkout/session-status?id=cs_xxx every 2s, max 30s
        - on ready=true with ticket: window.location.href = '/sign-in?__clerk_ticket=…'
        - on 30s timeout: trackEvent(CHECKOUT_TICKET_TIMEOUT, { session_id, waited_ms })
                          show "Account is being set up. Check your email for sign-in link."

T=N+2   Clerk processes ticket → session cookie set → redirects back to /settings
        Now signed-in, ticket consumed, Pro tier active per webhook upsert
```

## Components Changed

| # | File | Change | Approx LOC |
|---|---|---|---|
| 1 | `src/app/api/v1/stripe/checkout/route.ts` | `requireAuth()` → `auth()`. Anonymous branch: cookie read, `email_leads` lookup, Stripe session without `clerkUserId`. Preserves all signed-in behavior. | +80 |
| 2 | `src/app/api/webhooks/stripe/route.ts` | In `checkout.session.completed`: handle null `clerkUserId` via `findOrCreateClerkUser(email)` → `createSignInToken` → `sessions.update`. Wrap in try/catch with dedup-row rollback. Update `email_leads.converted_to_user_id`. | +60 |
| 3 | `src/shared/components/PaywallModal.tsx` | Remove the `isAuthFailure` branch + `/sign-up?redirect_url=…` redirect. Endpoint always returns Stripe URL. | −30 |
| 4 | `src/app/[locale]/settings/page.tsx` | Add server-side `?session_id=…` handling: when `auth()` is null and session_id is present, server-poll for ticket up to 8s; redirect to `/sign-in?__clerk_ticket=…` if found, else render `<ClientCheckoutPolling/>`. | +40 |
| 5 | `src/app/api/v1/checkout/session-status/route.ts` | **NEW.** `GET ?id=cs_xxx` → `{ ready: bool, ticket?: string }`. Reads Stripe session metadata. Rate-limited. | +50 |
| 6 | `src/shared/components/ClientCheckoutPolling.tsx` | **NEW.** Client component polling `session-status` every 2s, max 30s, with progress + fallback copy + analytics event. | +80 |
| 7 | `src/shared/lib/analytics.ts` | Add `ANONYMOUS_CHECKOUT_STARTED`, `ANONYMOUS_USER_MATERIALIZED`, `CHECKOUT_TICKET_READY`, `CHECKOUT_TICKET_TIMEOUT` event constants. Keep `CHECKOUT_AUTH_REDIRECT` (used for signed-in session-expired edge case). | +6 |
| 8 | `src/messages/en.json` + `src/messages/es.json` | New copy: `settings.finalizing.title`, `.description`, `.checkEmail`, `.contactSupport`. | +8 keys × 2 langs |

### Not changed

- `src/app/[locale]/checkout/start/CheckoutStartClient.tsx` — kept as-is; serves signed-in users coming from `/pricing` page.
- DB schema — no migration. `users.id` stays Clerk user ID; linkage data lives in Stripe metadata + existing columns.
- Webhook handlers for `customer.subscription.updated/deleted/trial_will_end/invoice.*` — unchanged.

### New tests

| File | Coverage |
|---|---|
| `src/app/api/v1/stripe/checkout/__tests__/anonymous.test.ts` | POST without auth: email_lead found → `customer_email` pre-filled; not found → omitted; no cookie → minimal metadata; signed-in regression. Rate limit by anonymous_id. |
| `src/app/api/webhooks/stripe/__tests__/anonymous-completion.test.ts` | `checkout.session.completed` without `clerkUserId`: existing Clerk user found → reuse; not found → createUser + ticket; Stripe `sessions.update` receives `signInTicket`; `email_leads.converted_to_user_id` set; Clerk failure → dedup row removed + 500; createUser race → retry getUserList recovers. |
| `src/app/api/v1/checkout/session-status/__tests__/route.test.ts` | Ready=true with ticket; ready=false without; invalid sessionId → 404. |
| `src/shared/components/__tests__/PaywallModal.trigger.test.tsx` | UPDATE: remove `expect(window.location.href).toContain('/sign-up')`; add `expect(window.location.href).toBe(stripeUrl)` for both anonymous and signed-in cases. |
| `src/shared/components/__tests__/ClientCheckoutPolling.test.tsx` | **NEW.** Poll fires every 2s; redirects on `ready=true`; fires timeout event after 30s. |
| `src/app/[locale]/settings/__tests__/anonymous-arrival.test.tsx` | **NEW.** Server component with `auth()=null + session_id` → redirects with ticket if available; renders `<ClientCheckoutPolling/>` if not. |

## Error Handling

| Where | Failure | Action | User-facing |
|---|---|---|---|
| Checkout route | Stripe API down | log + Sentry `{checkout:'anonymous', stage:'session-create'}` | 503 → PaywallModal retry button |
| Checkout route | `email_leads` DB lookup fail | log warning, continue without `customer_email` | seamless — Stripe collects email |
| Checkout route | Rate limit (key: anonymous_id / IP) | 429 + `Retry-After` header | "Too many attempts, try in N min" |
| Checkout route | Invalid plan | 400 | Should not happen (UI restricts) |
| Webhook | Clerk getUserList/createUser down | catch → `DELETE FROM processed_stripe_events WHERE event_id=…` → re-throw → 500 to Stripe → retry | invisible — user sees "Finalizing…" on settings page |
| Webhook | Clerk createUser race ("identifier exists") | retry `getUserList`, use found userId | invisible |
| Webhook | `stripe.checkout.sessions.update` fails | log + Sentry `{stage:'ticket-save'}`, **continue** (user can poll via `session-status`) | invisible if recovered; fallback copy otherwise |
| Webhook | DB upsert fails | return 500 → Stripe retries (idempotent) | invisible |
| Settings page | Invalid sessionId / 404 from Stripe | redirect → `/pricing?error=session_not_found` | "Session not found. Please try again." |
| Settings page | 30s polling timeout (ticket never appears) | fire `CHECKOUT_TICKET_TIMEOUT` event | "Account is being set up. Check your email for sign-in link." |
| Settings page | Stripe session retrieve fails | redirect → `/pricing?error=session_check_failed` | "Couldn't verify payment. Check email for confirmation." |
| Sign-in page | Ticket expired / consumed | Clerk native error UI | "Link expired" + manual sign-in fallback |

### Critical path protection — dedup-row bug mitigation

The existing webhook has a known weakness: `processed_stripe_events` is inserted **before** the `switch` block, so if the handler throws, Stripe's retry is skipped (dedup row already exists). For anonymous flow this becomes critical because Clerk Backend SDK is now in the critical path.

**Mitigation in this spec:** wrap the Clerk-dependent code (lines `findOrCreateClerkUser` through `sessions.update`) in a dedicated try/catch. On Clerk failure, `DELETE FROM processed_stripe_events WHERE event_id = ?` before re-throwing, so Stripe's retry will reprocess. This is a localized fix; the broader dedup refactor can be a follow-up patch but is not in scope for this spec.

### Sentry tags strategy

- All anonymous-flow errors: `tags: { checkout: 'anonymous', stage: 'session-create' | 'webhook-materialize' | 'ticket-create' | 'ticket-save' | 'success-page' }`
- Existing `tags: { webhook: 'stripe', eventType }` preserved
- Signed-in path: add `tags: { checkout: 'authenticated' }` for symmetry

### Observability — new PostHog events

| Event | Fired by | Properties |
|---|---|---|
| `ANONYMOUS_CHECKOUT_STARTED` | checkout route, server-side, after `sessions.create` success | `email_known: bool, anonymous_id, plan, utm_source, utm_campaign, utm_content` |
| `ANONYMOUS_USER_MATERIALIZED` | webhook, after Clerk createUser/getUserList | `created_new: bool, anonymous_id, session_id` |
| `CHECKOUT_TICKET_READY` | webhook, after `sessions.update({signInTicket})` | `session_id` |
| `CHECKOUT_TICKET_TIMEOUT` | settings page client-side, if 30s poll fails | `session_id, waited_ms` |

Combined with existing `PAYWALL_TRIAL_CLICKED` / `CHECKOUT_STRIPE_REDIRECTED` / `SUBSCRIPTION_STARTED`, this gives a complete funnel:

```
PAYWALL_TRIAL_CLICKED
  → ANONYMOUS_CHECKOUT_STARTED  (anonymous) OR (signed-in: CHECKOUT_AUTO_STARTED)
  → CHECKOUT_STRIPE_REDIRECTED
  → ANONYMOUS_USER_MATERIALIZED  (anonymous only)
  → CHECKOUT_TICKET_READY        (anonymous only)
  → SUBSCRIPTION_STARTED
```

## Edge Cases

| # | Scenario | Handling |
|---|---|---|
| 1 | Webhook arrives after success page (1–3s race) | 8s server-poll + 30s client-poll covers gap |
| 2 | User changes email at Stripe Checkout vs. email_lead email | webhook uses `session.customer_details.email` as source of truth; both lookups (anonymous_id and email) link the original email_lead to the new userId |
| 3 | Existing Clerk user matches Stripe email | `getUserList` finds them → use existing userId → upsert as Premium → ticket signs them into their old account (correct behavior) |
| 4 | Concurrent webhook retries during Clerk createUser | try/catch + retry `getUserList` recovers; idempotent |
| 5 | Sign-in ticket consumed in duplicate browser tab | Second tab gets Clerk native "expired/used" UI; acceptable degradation |
| 6 | `anonymous_id` cookie cleared between checkout and webhook | `session.metadata.anonymous_id` was captured at session create; lookup still works |
| 7 | Stripe Radar / fraud rejects payment | `checkout.session.completed` never fires → no Clerk user created (correct) |
| 8 | Subscription trial abuse: same email tries trial repeatedly | Stripe natively skips `trial_period_days` for returning customers (existing logic preserved) |
| 9 | Email-lead lookup returns multiple rows | `LIMIT 1 ORDER BY created_at DESC` — most recent email |
| 10 | Multiple anonymous_ids share the same email | All matching email_leads get `converted_to_user_id` set via the OR clause |

## Testing

### Unit tests (vitest)

See **Components Changed → New tests** table above. Coverage targets:

- Critical paths (anonymous checkout + webhook materialization): 100%
- Edge cases (race, timeout, createUser race): unit-tested with mocked Clerk + Stripe SDKs
- Existing PaywallModal tests: updated to remove the auth-redirect assertion

### Manual smoke (founder, post-ship)

1. Open `/chart` in incognito; complete chart calculation; close email-gate (or submit, both paths)
2. Navigate to a paywall surface (`/tarot/spread`, `/chart` AI section, etc.)
3. Click "Start Free Trial" → should land on Stripe Checkout (not sign-up screen)
4. Pay with test card `4242 4242 4242 4242`
5. Should auto-redirect through "Finalizing…" → `/settings` already signed in + Premium badge
6. Sign out → sign in again with the same email → land in the same account

### CI gates

- `npm run test` — all suites green (existing + new)
- `npm run typecheck` — 0 errors
- `npm run lint` — 0 new warnings (worktrees pollution noted in memory; ignore those rows)

## Migration / Rollout

- **Direct-to-main** per CLAUDE.md workflow.
- No DB migration. No env var changes (Clerk Backend SDK uses the existing `CLERK_SECRET_KEY`).
- No feature flag. Current conversion is 0% — risk of regression is bounded by impossibility of being worse.
- Webhook + checkout route deploy atomically with PaywallModal change. Old anonymous users in-flight at deploy time will hit the auth-redirect path one more time (no harm).
- Rollback: revert the commit; old `requireAuth()` path resumes. Stripe sessions created during the broken window can be manually completed via Stripe Dashboard if needed.

## Future Work

- Dedup-row refactor in webhook (move dedup insert to after successful handler completion; use transactional rollback). Spec'd as a follow-up patch.
- "Set password" prompt in `/settings` for users who arrived via auto-sign-in ticket and never set one. Currently passwordless via Clerk magic-link is acceptable.
- Email confirmation post-purchase ("you can sign in with this email at any time") — current purchase confirmation email exists; consider adding sign-in CTA.
- E2E Playwright test for the full anonymous purchase flow. Deferred; manual smoke is sufficient for first iteration.
- Per-creative paywall conversion dashboard (PostHog × Stripe by `utm_content`). UTM is already preserved end-to-end; dashboard build is its own spec.

## References

- PostHog session evidence: visitor `019e37de-7e0d-75fb-b0b3-e5b6105015f8` (4-minute full-funnel drop at `checkout_auth_redirect`)
- Existing checkout route: `src/app/api/v1/stripe/checkout/route.ts`
- Existing webhook: `src/app/api/webhooks/stripe/route.ts`
- Clerk Backend SDK sign-in tokens: https://clerk.com/docs/references/backend/sign-in-tokens/create-sign-in-token
- Clerk Backend SDK user create: https://clerk.com/docs/references/backend/user/create-user
- Stripe Checkout `customer_email` + `sessions.update` for metadata mutation: https://docs.stripe.com/api/checkout/sessions
