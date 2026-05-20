# Audit 2026-05-19 Quick Wins — Design Spec

**Date:** 2026-05-19
**Owner:** Kirill Kovalenko
**Status:** Draft → pending user review
**Estimated effort:** ~3 hours total code (excluding review/CI)

## Goal

Ship three small, independent fixes from the 2026-05-19 audit that together unblock measurement and recover an ES-specific revenue leak:

1. **C2** — PostHog `locale` super-property so every event carries `locale: 'en' | 'es'`
2. **A1** — Pass `locale` to Stripe Checkout so ES users see Spanish UI
3. **C1** — Restore the missing `chart_calculated` PostHog event from `HeroCalculator`

These three are bundled into one spec/plan because they are causally linked: without C2 we cannot measure whether A1 lifts ES conversion, and without C1 the upstream funnel reading is broken regardless of A1's impact.

## Background

### Why these three, why now

- **C1 root cause confirmed:** `HeroCalculator.tsx:220-283` (landing hero) calls `/api/v1/chart/calculate` but never fires `trackEvent(CHART_CALCULATED)`. Only `BirthDataForm.tsx:127` (secondary `/chart` page form) fires it. Result: 518 charts/30d in DB → 0 `chart_calculated` events in PostHog.
- **A1 root cause confirmed:** `src/app/api/v1/stripe/checkout/route.ts` has two `stripe.checkout.sessions.create()` calls (lines 155, 224); neither passes `locale`. ES users land on English Stripe Checkout UI — current ES conversion: 0%.
- **C2 root cause confirmed:** `AnalyticsEvent.PAYWALL_*` and `CHECKOUT_*` events fire from ~8 call sites (`PaywallModal`, `PaywallCta`, `PricingUpgradeButton`, `CheckoutStartClient`, `route.ts`); none attach `locale` property. Without it we cannot split EN vs ES funnel.

### Decisions locked during brainstorming

| # | Decision | Reason |
|---|----------|--------|
| D1 | Bundle as single spec + single plan + 3 separate commits | Logical link, small surface; separate commits keep bisect viable |
| D2 | Execution order: C2 → A1 → C1 | C2 first so A1 result is measurable; C1 last because it's lowest revenue urgency (only restores baseline) |
| D3 | C1 = client-only fix | Server safety-net rejected (duplication, distinctId plumbing, breaks Pixel ViewContent) |
| D4 | C2 = PostHog `register()` super-property | Single point of attachment; new event call sites get `locale` for free |
| D5 | A1 = `locale` carried in POST body alongside UTM | Consistent with existing UTM pass-through pattern; explicit, visible in server logs |

## Architecture

Three layered changes, no shared module added:

| # | Files touched | Net effect |
|---|---|---|
| C2 | `src/shared/components/PostHogProvider.tsx` (+ test) | `locale` attached to every PostHog event for the session |
| A1 | `src/app/api/v1/stripe/checkout/route.ts` + 3 callers + 2 test files | ES users see Spanish Stripe Checkout UI |
| C1 | `src/modules/astro-engine/components/HeroCalculator.tsx` + test | Landing-page calculator emits `chart_calculated` |

No new shared abstractions. Each fix is local to its concern; existing module boundaries unchanged.

## Component Design

### C2 — PostHog `locale` super-property

**File:** `src/shared/components/PostHogProvider.tsx`

Add a `useEffect` after PostHog init that reads the next-intl pathname, derives locale, and calls `posthog.register({ locale })`. Re-run on pathname change so the in-session language switcher updates the property.

```tsx
const pathname = usePathname();
useEffect(() => {
  if (typeof window === 'undefined') return;
  const posthog = (window as { posthog?: PostHogClient }).posthog;
  if (!posthog?.register) return;
  const locale = pathname?.startsWith('/es') ? 'es' : 'en';
  posthog.register({ locale });
}, [pathname]);
```

`register()` overwrites the previous value, so re-registration is idempotent and safe. Not PII. Attaches to all subsequent `posthog.capture()` calls including `chart_calculated`, `email_lead_submitted`, all `paywall_*` and `checkout_*` events.

### A1 — Stripe Checkout `locale` parameter

**File:** `src/app/api/v1/stripe/checkout/route.ts`

Add `locale` to `checkoutBodySchema`:

```ts
const checkoutBodySchema = z.object({
  plan: z.enum(['pro_monthly', 'pro_annual']).default('pro_annual'),
  locale: z.enum(['en', 'es']).optional(),
  utm_source: z.string().optional(),
  utm_medium: z.string().optional(),
  utm_campaign: z.string().optional(),
  utm_content: z.string().optional(),
  utm_term: z.string().optional(),
  utm_click_timestamp: z.string().datetime().optional(),
});
```

Derive Stripe locale (separate from app locale because Stripe uses its own enum):

```ts
const stripeLocale: 'auto' | 'es' = parsed.locale === 'es' ? 'es' : 'auto';
```

`'auto'` for EN/missing lets Stripe respect browser Accept-Language. `'es'` for explicit Spanish.

Pass to both `sessions.create()` calls (authenticated branch line ~155, anonymous branch line ~224):

```ts
const session = await stripe.checkout.sessions.create({
  // ...existing fields
  locale: stripeLocale,
  // ...
});
```

Pass `locale` to both `metadata` blobs as well (top-level + `subscription_data.metadata`) so the Stripe webhook can attribute future conversions by language without browser context:

```ts
metadata: { ...(parsed.locale ? { locale: parsed.locale } : {}), ...utm, ... },
```

**Callers (3 files), each adds `locale: useLocale()` to fetch body:**

1. `src/app/[locale]/(marketing)/pricing/PricingUpgradeButton.tsx`
2. `src/app/[locale]/checkout/start/CheckoutStartClient.tsx`
3. `src/shared/components/PaywallModal.tsx`

All three already live under `[locale]` route, so `useLocale()` from `next-intl` is the natural source.

### C1 — HeroCalculator `chart_calculated` emission

**File:** `src/modules/astro-engine/components/HeroCalculator.tsx`

Add after `setResult(heroResult)` (line ~266) and before `setGateOpen(true)`:

```tsx
trackEvent(AnalyticsEvent.CHART_CALCULATED, {
  source: 'hero',
  has_birth_time: form.knowsBirthTime,
  sun: sunPlanet.sign,
  moon: json.data?.chart?.planets?.find((p) => p.planet === 'Moon')?.sign ?? null,
  is_authenticated: isSignedIn,
});

if (typeof window !== 'undefined' && (window as unknown as { fbq?: (...args: unknown[]) => void }).fbq) {
  (window as unknown as { fbq: (...args: unknown[]) => void }).fbq(
    'track',
    'ViewContent',
    { content_type: 'natal_chart' },
  );
}
```

Mirrors `BirthDataForm.tsx:127-143` exactly. `source: 'hero'` discriminates from `source: 'form'` so PostHog can split landing-page vs `/chart` page usage.

Imports to add:
```tsx
import { trackEvent, AnalyticsEvent } from '@/shared/lib/analytics';
```

`AnalyticsEvent.CHART_CALCULATED` is already exported (`src/shared/lib/analytics.ts:213`).

## Data Flow

### C2 cascade
```
User loads /es/pricing
  → PostHogProvider mounts → register({ locale: 'es' })
  → posthog.capture('paywall_opened', { trigger }) → wire payload includes locale='es'
  → PostHog dashboard: filter `locale = 'es'` works on every event from session
```

### A1 cascade
```
ES user clicks "Probar Pro" in /es/pricing
  → POST /api/v1/stripe/checkout { plan, locale: 'es', utm_source }
  → route.ts → stripeLocale = 'es'
  → stripe.checkout.sessions.create({ locale: 'es', metadata: { locale: 'es', ... } })
  → Stripe returns hosted Checkout URL → user sees Spanish UI
  → on success → webhook reads metadata.locale (available for future analysis)
```

### C1 cascade
```
Landing visitor submits HeroCalculator
  → POST /api/v1/chart/calculate (server computes)
  → response → setResult(heroResult)
  → trackEvent('chart_calculated', { source: 'hero', ...props })
  → window.posthog.capture(...) → wire (with C2's locale super-prop attached)
  → cookie consent gating still applies (existing GDPR behaviour)
  → email gate opens (unaffected)
```

## Error Handling

| Scenario | Behaviour |
|---|---|
| C2: pathname undefined / posthog not loaded | graceful no-op (matches existing `analytics.ts` pattern) |
| A1: caller passes `locale: 'fr'` (invalid) | Zod schema rejects → 400 INVALID_INPUT, no Stripe call |
| A1: caller omits `locale` (legacy / forgot) | `stripeLocale = 'auto'` → Stripe auto-detects → backward compatible |
| A1: Stripe API rejects locale | existing try/catch wraps as INTERNAL_ERROR + Sentry capture |
| C1: `trackEvent` throws | wrap in try/catch defensively; chart already shown to user, event is best-effort |
| C1: `sunPlanet` null | existing guard at line 256 returns early; `chart_calculated` not fired (correct — invalid chart) |

## Testing Strategy

### C2 — `PostHogProvider.test.tsx` (new file or extend)

| Test | Assertion |
|---|---|
| Mounts on `/en/...` | `posthog.register` called with `{ locale: 'en' }` |
| Mounts on `/es/...` | `posthog.register` called with `{ locale: 'es' }` |
| Mounts on `/` (root) | `posthog.register` called with `{ locale: 'en' }` (default) |
| Pathname changes mid-session | `posthog.register` called again with new locale |

Mock `posthog` global, spy on `register`. Mock `usePathname()` from `next/navigation`.

### A1 — `route.test.ts` extensions

| Test | Assertion |
|---|---|
| `body.locale = 'es'` (authenticated) | `sessions.create` called with `locale: 'es'` |
| `body.locale = 'en'` | called with `locale: 'auto'` |
| `body.locale = undefined` | called with `locale: 'auto'` (backward compat) |
| `body.locale = 'fr'` | response 400 INVALID_INPUT, no Stripe call |
| `body.locale = 'es'` (anonymous) | called with `locale: 'es'` |
| Metadata when `locale = 'es'` | `metadata.locale = 'es'` on session + `subscription_data.metadata` |

Existing tests stay green (locale optional, current callers omit it → 'auto').

### A1 — caller tests (3 files, 1 test each)

| File | Assertion |
|---|---|
| `PricingUpgradeButton.test.tsx` | render with `useLocale → 'es'`: fetch body contains `locale: 'es'` |
| `CheckoutStartClient.test.tsx` | same |
| `PaywallModal.test.tsx` | same |

### C1 — `HeroCalculator.test.tsx`

The test file exists but currently has no `trackEvent` mock — the implementation task adds one mirroring `BirthDataForm.test.tsx:14`:

```tsx
vi.mock('@/shared/lib/analytics', () => ({
  trackEvent: vi.fn(),
  AnalyticsEvent: { CHART_CALCULATED: 'chart_calculated' },
}));
```

| Test | Assertion |
|---|---|
| Submit valid form → chart returns | `trackEvent('chart_calculated', { source: 'hero', sun, moon, has_birth_time, is_authenticated })` |
| `knowsBirthTime = false` | event payload has `has_birth_time: false` |
| Signed-in user | event payload has `is_authenticated: true` |
| Server returns 500 | event NOT fired |
| `fbq` present | `fbq('track', 'ViewContent', ...)` called |
| `fbq` absent | no throw, PostHog event still fires |

### Manual smoke (post-deploy)

| Step | Verify |
|---|---|
| Open `/es/pricing`, click upgrade | Network: `POST /api/v1/stripe/checkout` body contains `locale: 'es'`; Stripe Checkout opens in Spanish |
| Calculate chart on `/` (HeroCalculator) | PostHog Live Events shows `chart_calculated` with `source: 'hero'` and `locale: 'en'` |
| Open paywall on any page | PostHog event `paywall_opened` has `locale` property |
| Switch language `/en/` → `/es/` mid-session | Subsequent events carry new `locale` |

### Quality gates

- `npm run typecheck` — zero errors
- `npm run lint` — zero new warnings (scope to `src/` only per `feedback_lint_worktrees_pollution`)
- `npm test` — all unit tests pass, +10 new tests
- Smoke `localhost:3000` for C1 and `/es/` for A1+C2 before push

## Out of Scope

- Localized currency (MXN/COP/ARS via Stripe `currency_options`) — separate spec (B3 from audit)
- `success_url` / `cancel_url` `/es/` prefix — requires routing semantics decision (separate task)
- Server-side `chart_calculated` safety net — explicitly rejected during brainstorming
- Audit of other ghost-defined events (`user_signed_up` etc per `feedback_grep_callers_not_just_definitions`) — separate task
- Stripe webhook reading `metadata.locale` for postpaid analytics — metadata pass-through ships, but consumption is future work

## Success Criteria

Measured at 2026-05-26 (one week post-deploy):

| Metric | Pre-fix baseline | Target post-fix |
|---|---|---|
| `chart_calculated` events / chart row in DB | ~0% | ≥80% (rest = no consent) |
| PostHog events with `locale` property | 0% | 100% of events fired after C2 ships |
| Stripe Checkout language for `/es/` referrals | English | Spanish |
| ES `paywall_opened → checkout_stripe_redirected` conversion | 0% | ≥5% (proves A1 unblocked, not just measured) |

## Rollout

Single push to `main` triggering single Vercel deploy. No migrations. No env var changes. No feature flag.

Risk of rollback is low: each change is additive and backward-compatible.

If post-deploy smoke reveals any of:
- Stripe API rejects `locale: 'es'` (extremely unlikely — documented as supported)
- PostHog stops receiving events (super-property doesn't break capture but worth verifying)
- HeroCalculator regression (unrelated chart calc breaks)

→ `git revert` the offending commit (separate-commit decision D1 makes this surgical).
