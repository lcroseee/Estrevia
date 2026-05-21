# 2026-05-21 Marketing Audit P0 Fixes — Design Spec

**Source:** `outputs/marketing-audit-2026-05-21/`, `outputs/traffic-audit-2026-05-21-pm/`, memory `project_traffic_audit_2026_05_21_pm`

**Goal:** ship three independent P0 fixes from the 2026-05-21 marketing audit in a single bundled spec + plan. All three are code-level (no migrations, no founder-owed ops). All three block subsequent measurement or revenue work.

**Architecture:** minimal diffs to existing files. No new modules. No new dependencies. Tests extend existing test suites (`route.test.ts`, `anonymous.test.ts`, `PostHogProvider.test.tsx`).

**Tech stack:** Stripe Node SDK (existing), `posthog-js` (existing), Drizzle ORM (existing), Vitest (existing).

---

## Fix #1 — Anon-checkout dedup

### Problem

`/api/v1/stripe/checkout` (anonymous branch) does not deduplicate Stripe customers by email. Each form submit creates a fresh `cus_XXX`. Observed 2026-05-21:

- `gabrieljlugo` — 2 trial subscriptions, $34.99/yr × 2 (one canceled manually via API)
- `jaderising44` — duplicate `cus_XXX`, manual DB stripe_customer_id swap

Without dedup, repeat-visit anonymous checkouts continue to generate duplicate customers + duplicate subscriptions, risking erroneous charges and accounting integrity.

### Approach: customer-lookup + idempotency-key

**Two-layer defense:**

1. **Customer lookup by email** — before `stripe.checkout.sessions.create()`, when email is known (anon prefill OR auth user email), call `stripe.customers.list({ email, limit: 1 })`.
2. **Idempotency-key on session-create** — server-side key scoped to `anonymousId+plan+UTC-day` (anon) or `userId+plan+UTC-day` (auth). 24h dedup window.

### File: `src/app/api/v1/stripe/checkout/route.ts`

**New helper function** (top of file, before `POST`):

```ts
type FindOrPrepareCustomerResult =
  | { kind: 'block'; reason: 'already_subscribed' }
  | { kind: 'reuse'; customerId: string }
  | { kind: 'create' };

async function findOrPrepareCustomer(
  stripe: Stripe,
  email: string,
): Promise<FindOrPrepareCustomerResult> {
  const list = await stripe.customers.list({ email, limit: 1 });
  const existing = list.data[0];
  if (!existing) return { kind: 'create' };

  const subs = await stripe.subscriptions.list({
    customer: existing.id,
    status: 'all',
    limit: 5,
  });
  const blocking = subs.data.find((s) =>
    ['active', 'trialing', 'past_due'].includes(s.status),
  );
  if (blocking) return { kind: 'block', reason: 'already_subscribed' };

  return { kind: 'reuse', customerId: existing.id };
}

function utcDayBucket(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
}
```

### Integration: Authenticated branch (lines 120-214)

**Existing logic stays:** DB lookup for `users.stripeCustomerId`. If found, pass `customer: stripeCustomerId`.

**Add fallback:** if DB has NO `stripeCustomerId` but `userEmail` is present:

```ts
if (!stripeCustomerId && userEmail) {
  const result = await findOrPrepareCustomer(stripe, userEmail);
  if (result.kind === 'block') {
    return NextResponse.json(
      { success: true, data: { url: `${appUrl}/settings?already_subscribed=1` }, error: null },
      { status: 200 },
    );
  }
  if (result.kind === 'reuse') {
    stripeCustomerId = result.customerId;
  }
}
```

**Add idempotency-key:**

```ts
const idempotencyKey = `checkout:${userId}:${plan}:${utcDayBucket()}`;
const session = await stripe.checkout.sessions.create({
  // ... existing args ...
}, { idempotencyKey });
```

### Integration: Anonymous branch (lines 218-296)

**After `prefilledEmail` is resolved, before `sessions.create`:**

```ts
let reuseCustomerId: string | undefined = undefined;
if (prefilledEmail) {
  const result = await findOrPrepareCustomer(stripe, prefilledEmail);
  if (result.kind === 'block') {
    return NextResponse.json(
      { success: true, data: { url: `${appUrl}/settings?already_subscribed=1` }, error: null },
      { status: 200 },
    );
  }
  if (result.kind === 'reuse') {
    reuseCustomerId = result.customerId;
  }
}
```

**Update session-create call:**

```ts
const idempotencyKey = `checkout:${anonymousId ?? 'noanon'}:${plan}:${utcDayBucket()}`;
const session = await stripe.checkout.sessions.create({
  mode: 'subscription',
  payment_method_types: ['card', 'link'],  // (Fix #2 — see Section 2)
  line_items: [{ price: priceId, quantity: 1 }],
  ...(reuseCustomerId
    ? { customer: reuseCustomerId }
    : prefilledEmail
    ? { customer_email: prefilledEmail }
    : {}),
  ...(anonymousId ? { client_reference_id: anonymousId } : {}),
  locale: stripeLocale,
  metadata,
  subscription_data: { trial_period_days: 3, metadata },
  success_url: `${appUrl}/checkout/complete?session_id={CHECKOUT_SESSION_ID}`,
  cancel_url: `${appUrl}/pricing`,
  allow_promotion_codes: true,
  billing_address_collection: 'auto',
}, { idempotencyKey });
```

### Data flow

```
POST /api/v1/stripe/checkout
  ↓
[1] Rate limit (existing)
  ↓
[2] Parse body, resolve plan/locale/UTM (existing)
  ↓
[3] Resolve email:
    - Auth: users.email from DB (existing)
    - Anon: prefilledEmail from email_leads by anonymousId (existing)
  ↓
[4] NEW: findOrPrepareCustomer(stripe, email) if email known
    ↓
    → kind='block': return /settings?already_subscribed=1
    → kind='reuse': set customerId for sessions.create
    → kind='create': fall through (use customer_email if available)
  ↓
[5] sessions.create with idempotencyKey scoped to (id, plan, UTC-day)
  ↓
[6] Return { url }
```

### Error handling

| Failure | Behavior |
|---|---|
| `stripe.customers.list` throws | Log + Sentry, fall through to `kind='create'` (do not block checkout) |
| `stripe.subscriptions.list` throws | Log + Sentry, treat as `kind='block'` (safer to deny than create dup) |
| `sessions.create` throws | Existing behavior: log, Sentry, return `INTERNAL_ERROR` |
| Same idempotencyKey, second call | Stripe returns the original session URL (built-in dedup) |

### Testing

**Extend `src/app/api/v1/stripe/checkout/__tests__/route.test.ts`:**

- Mock `stripe.customers.list` returning `[]` → asserts `kind='create'` path
- Mock `stripe.customers.list` returning 1 customer with NO subs → asserts `kind='reuse'` + `customer:` arg passed to `sessions.create`
- Mock `stripe.customers.list` returning 1 customer with active sub → asserts `kind='block'` + response is `/settings?already_subscribed=1` URL
- Assert `idempotencyKey` is present + matches `^checkout:[a-zA-Z0-9_-]+:(pro_monthly|pro_annual):\d{4}-\d{2}-\d{2}$`

**Extend `src/app/api/v1/stripe/checkout/__tests__/anonymous.test.ts`:**

- All above scenarios against the anonymous branch
- Specifically: `anonymousId='anon_abc'` + `prefilledEmail='dup@x.com'` + existing customer → reuse path

**New file: `src/app/api/v1/stripe/checkout/__tests__/findOrPrepareCustomer.test.ts`** — unit tests for the helper in isolation (5+ scenarios).

**Manual smoke (after deploy):**

- Incognito #1: submit /pricing form, complete to Stripe Checkout page. Note `cus_XXX` from session URL or webhook.
- Incognito #2 (separate browser): submit /pricing form with same email. Assert response URL is `/settings?already_subscribed=1` (NOT a Stripe checkout URL).
- Stripe Dashboard: verify NO new `cus_YYY` was created for that email.

### Out of scope for Fix #1

- Backfill / merge of existing duplicate customers (gabrieljlugo + jaderising44 already handled manually 2026-05-21)
- Webhook hardening to merge any future dups post-payment
- Stripe Customer Portal setup (mentioned as option C in brainstorming, deferred)
- Form-level submit-button debounce (separate UX concern, deferred)

---

## Fix #2 — `payment_method_types` restrict

### Problem

`/api/v1/stripe/checkout` does NOT pass `payment_method_types` to `stripe.checkout.sessions.create()`. Stripe falls back to Dashboard defaults, which currently include `card`, `link`, `klarna`, `cashapp`, `amazon_pay`. Result:

- `destinig7996` paid via Cash App for a `subscription`-mode session
- Cash App's `pm_XXX` was attached with `usage: off_session`, but the first off-session billing attempt requires push-confirm on the customer's phone
- Push-confirm did not complete → subscription went to `past_due` (NOT a card decline)
- Stripe Smart Retry will attempt again, but Cash App's off-session model is fundamentally unreliable for recurring billing

Klarna and Amazon Pay have analogous off-session limitations for subscriptions.

### Approach: explicit allow-list

Set `payment_method_types: ['card', 'link']` on `stripe.checkout.sessions.create()` in BOTH branches (authenticated + anonymous) of `route.ts`.

### File: `src/app/api/v1/stripe/checkout/route.ts`

**Add to both `sessions.create()` calls** (line 165 auth branch + line 244 anon branch):

```ts
const session = await stripe.checkout.sessions.create({
  mode: 'subscription',
  payment_method_types: ['card', 'link'],   // ← NEW (both branches)
  line_items: [{ price: priceId, quantity: 1 }],
  // ... rest unchanged ...
}, { idempotencyKey });  // (Fix #1 — see Section 1)
```

### Why `['card', 'link']`

- `card` — auto-includes Apple Pay / Google Pay / Microsoft Pay (native browser wallets resolve to a card token, off-session safe)
- `link` — Stripe's first-party 1-click checkout (card-backed, off-session safe)
- Excludes `cashapp`, `klarna`, `amazon_pay`, `paypal` (off-session billing failures or BNPL-not-for-subs)

### Impact on existing customers

| Customer | Current PMT | Impact |
|---|---|---|
| Founder ($4.99/mo active) | card | No change |
| gabrieljlugo ($34.99/yr trialing) | card/link | No change |
| jaderising44 ($4.99/mo trialing) | card/link | No change |
| destinig7996 (past_due) | cashapp | Smart Retry continues with attached `pm_XXX`; new checkouts (if customer creates one) will show card/link only |

No data loss. Existing `PaymentMethod` records on Stripe remain attached; they just aren't selectable from a fresh `/checkout` flow.

### Testing

**Extend `route.test.ts` (both auth + anon mocks):**

```ts
expect(mockSessionsCreate).toHaveBeenCalledWith(
  expect.objectContaining({
    payment_method_types: ['card', 'link'],
  }),
  expect.any(Object),  // (idempotencyKey opts from Fix #1)
);
```

**Manual smoke (after deploy):**

- Open Stripe Checkout from `/pricing` form (anon)
- Verify only **Card** and **Link** tabs/options visible (no Cash App, Klarna, Amazon Pay sections)
- Same check from authenticated `/pricing` → Pro upgrade

### Error handling

Static value. No runtime decisions. Cannot fail.

### Out of scope for Fix #2

- Migrating destinig7996 to a card-based PaymentMethod (founder owns; Stripe Smart Retry running)
- Re-enabling wallet PMTs for one-off purchases (not currently a flow)
- PayPal / SEPA Direct Debit / Klarna Pay-Later integration (separate workstreams, deferred)

---

## Fix #3 — PostHog locale super-prop race

### Problem

`src/shared/components/PostHogProvider.tsx` initializes PostHog with `capture_pageview: true`. PostHog fires the first `$pageview` event **inside** the `posthog.init()` call synchronously. The `register({locale})` call lives in a separate `useEffect` that runs AFTER React's effect-cycle commits the init.

Net result: 86% of `$pageview` events in PostHog have `locale=null` (312 out of 363 events in 14d). This blocks all ES vs EN funnel analysis, dashboards, and A/B test segmentation.

### Approach: PostHog `loaded` callback

Use PostHog SDK's `loaded(posthog)` initialization-hook to `register({locale})` synchronously before the auto-captured first `$pageview` flushes. This is the SDK-documented pattern for setting super-properties at init time.

### File: `src/shared/components/PostHogProvider.tsx`

**Inside `initPostHog()` function, replace:**

```tsx
const { default: posthog } = await import('posthog-js');

// ... PII guard helper stays ...

posthog.init(apiKey, {
  api_host: '/ingest',
  ui_host: 'https://us.posthog.com',
  capture_pageview: true,
  disable_session_recording: true,
  persistence: 'localStorage',
  autocapture: false,
  enable_heatmaps: true,
  capture_performance: { web_vitals: true },
  bootstrap: {},
  sanitize_properties: (properties) => ({ /* ... existing ... */ }),
});

(window as ...).posthog = posthog;
setIsInitialized(true);
```

**With:**

```tsx
const { default: posthog } = await import('posthog-js');

// PII guard helper unchanged ...

// Compute locale BEFORE init — pathname is in scope of this provider render
const initialLocale = pathname?.startsWith('/es') ? 'es' : 'en';

posthog.init(apiKey, {
  api_host: '/ingest',
  ui_host: 'https://us.posthog.com',
  capture_pageview: true,
  disable_session_recording: true,
  persistence: 'localStorage',
  autocapture: false,
  enable_heatmaps: true,
  capture_performance: { web_vitals: true },
  bootstrap: {},
  sanitize_properties: (properties) => ({ /* ... existing ... */ }),
  loaded: (ph) => {
    // Register super-property BEFORE the auto-captured first $pageview flushes
    ph.register({ locale: initialLocale });
  },
});

(window as ...).posthog = posthog;
setIsInitialized(true);
```

**Keep the existing useEffect (lines 150-158) for subsequent pathname changes** — when a user navigates `/en/...` → `/es/...` mid-session, the super-prop must update:

```tsx
// EXISTING — unchanged. Handles route-change after init.
useEffect(() => {
  if (typeof window === 'undefined') return;
  const posthog = (window as ...).posthog;
  if (!posthog?.register) return;
  const locale = pathname?.startsWith('/es') ? 'es' : 'en';
  posthog.register({ locale });
}, [pathname, isInitialized]);
```

### Why `loaded` callback over `bootstrap.superProperties`

- PostHog's `bootstrap.superProperties` API is for **feature flag bootstrapping**, not user-defined event properties
- The `loaded(posthog)` hook is documented as the right place to call `register()` before the auto-pageview
- Verified: `loaded` runs synchronously after SDK ready, BEFORE any queued capture flushes

### Default locale rule

`pathname?.startsWith('/es') ? 'es' : 'en'` — unchanged from current code.

- `/es/...` → `'es'`
- `/en/...`, `/sign-in`, `/sign-up`, `/` → `'en'`

No new behavior; only the timing changes.

### Testing

**Extend `src/shared/components/__tests__/PostHogProvider.test.tsx`:**

- Mock `posthog.init` to capture the options arg
- Test 1: `usePathname` returns `/es/pricing` → assert `init` called with `loaded` callback → invoke the callback → assert `register({locale: 'es'})` called
- Test 2: `usePathname` returns `/en/chart` → assert `register({locale: 'en'})` via loaded callback
- Test 3: `usePathname` returns `/sign-in` → assert `register({locale: 'en'})` (default)
- Test 4: pathname changes EN → ES post-init → assert existing route-change useEffect calls `register({locale: 'es'})`

**Manual smoke (after deploy):**

- Open `/es/pricing` in incognito with cookies-accepted
- Open PostHog Live Events
- Verify first event (`$pageview` or `$pageleave`) has `locale: 'es'` in properties
- Run HogQL: `SELECT count() FROM events WHERE timestamp > now() - INTERVAL 1 HOUR AND properties.locale IS NULL` → expect 0 (was 86% before fix)

### Error handling

- `loaded` callback is sync per SDK docs; if `ph.register()` throws (it doesn't, but defensively), PostHog still functions without `locale` super-prop
- Existing top-level try/catch in `initPostHog()` covers any unexpected throw

### Out of scope for Fix #3

- Server-side locale super-prop on `trackServerEvent` (separate concern, lower-frequency events)
- Cookie-based locale detection for routes without `/es` prefix (overengineering for marginal gain)
- Historical event backfill (PostHog events are immutable; deferred — only new events benefit)

---

## Verification gate (Definition of Done)

All three fixes ship as a single feature commit-bundle. Plan-level done when:

- [ ] All new + extended tests pass (`npm test`)
- [ ] `npm run typecheck` zero errors
- [ ] `npm run lint` zero NEW errors on touched files (ignore `.claude/worktrees/` pollution per [[feedback_lint_worktrees_pollution]])
- [ ] Manual smoke matrix:
  - Incognito anon checkout dedup: same email → /settings redirect
  - Stripe Checkout page: card + link only, no Cash App / Klarna
  - PostHog Live Events: locale present on first $pageview
- [ ] Pushed to main
- [ ] Vercel production deploy verified

## Files touched

| File | Fix(es) | Type |
|---|---|---|
| `src/app/api/v1/stripe/checkout/route.ts` | #1 + #2 | Modify |
| `src/app/api/v1/stripe/checkout/__tests__/route.test.ts` | #1 + #2 | Modify |
| `src/app/api/v1/stripe/checkout/__tests__/anonymous.test.ts` | #1 + #2 | Modify |
| `src/app/api/v1/stripe/checkout/__tests__/findOrPrepareCustomer.test.ts` | #1 | Create |
| `src/shared/components/PostHogProvider.tsx` | #3 | Modify |
| `src/shared/components/__tests__/PostHogProvider.test.tsx` | #3 | Modify |

Six files total. No migrations. No env vars. No new dependencies.

## Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| `customers.list` returns wrong match (multiple cus per email, picked unexpected one) | Medium | Sort by `created desc` (Stripe default). Active-sub check covers the worst case (no double-subscribing) |
| Idempotency-key collision across legitimate retry-after-fix | Low | 24h UTC-day bucket; users retrying multiple plan changes in same day get the same plan-key, different plans get separate keys |
| `loaded` callback runs after first `$pageview` despite SDK docs | Low | Test verifies callback order via mocked spy; if fails, fallback is `posthog.register({locale})` immediately after init returns (still better than current race) |
| Removing wallet PMTs hurts LATAM conversion | Low | Today: 100% of active customers used card-backed PMTs. ES currency badge (already shipped) covers the perceived-cost concern |
| Stripe Checkout idempotency arg conflicts with existing `subscription_data.metadata` | None | `idempotencyKey` is a request-level opt, not a body field |

## Dependencies

None. All three fixes are standalone code changes in existing files. Order of implementation does not matter; can ship in parallel via subagent-driven development.
