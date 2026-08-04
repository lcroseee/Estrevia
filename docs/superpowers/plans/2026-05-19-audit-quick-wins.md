# Audit 2026-05-19 Quick Wins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship three small bundled fixes from the 2026-05-19 audit — PostHog `locale` super-property (C2), Stripe Checkout `locale` parameter (A1), and HeroCalculator `chart_calculated` emission (C1) — to unblock funnel measurement and recover ES-locale Stripe revenue.

**Architecture:** Three layered, locally-scoped changes. No new shared modules. Execution order is C2 → A1 → C1 with one commit per fix (bisect-friendly per spec D1). C2 ships first so A1's impact is measurable on the EN/ES split; C1 last because it only restores baseline (lowest revenue urgency).

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 6 strict, next-intl, posthog-js, Stripe Node SDK, Vitest (`@vitest-environment jsdom`).

**Spec reference:** `docs/superpowers/specs/2026-05-19-audit-quick-wins-design.md`

---

## File Map

### C2 — PostHog `locale` super-property
- Modify: `src/shared/components/PostHogProvider.tsx` (add `usePathname` import + `useEffect` that calls `posthog.register({ locale })`)
- Create: `src/shared/components/__tests__/PostHogProvider.test.tsx` (new — no prior test file exists)

### A1 — Stripe Checkout `locale`
- Modify: `src/app/api/v1/stripe/checkout/route.ts` (add `locale` to schema, derive `stripeLocale`, pass to both `sessions.create()` calls + metadata)
- Modify: `src/app/api/v1/stripe/checkout/__tests__/route.test.ts` (extend with locale tests)
- Modify: `src/app/[locale]/(marketing)/pricing/PricingUpgradeButton.tsx` (add `locale` to fetch body)
- Modify: `src/app/[locale]/(marketing)/pricing/__tests__/PricingUpgradeButton.utm.test.tsx` (assert locale in body)
- Modify: `src/app/[locale]/checkout/start/CheckoutStartClient.tsx` (add `locale` to fetch body)
- Modify: `src/app/[locale]/checkout/start/__tests__/CheckoutStartClient.utm.test.tsx` (assert locale in body)
- Modify: `src/shared/components/PaywallModal.tsx` (add `locale` to fetch body)
- Modify: `src/shared/components/__tests__/PaywallModal.utm.test.tsx` (assert locale in body)

### C1 — HeroCalculator `chart_calculated`
- Modify: `src/modules/astro-engine/components/HeroCalculator.tsx` (import `trackEvent` + `AnalyticsEvent`, emit event after `setResult`, fire `fbq` ViewContent)
- Modify: `src/modules/astro-engine/components/__tests__/HeroCalculator.test.tsx` (add `analytics` mock, assert event fires)

---

# Phase C2 — PostHog `locale` super-property

### Task C2-1: Write the failing PostHogProvider test

**Files:**
- Create: `src/shared/components/__tests__/PostHogProvider.test.tsx`

- [ ] **Step 1: Create the test file with locale registration assertions**

```tsx
// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { PostHogProvider } from '../PostHogProvider';

// ----- Hoisted mocks -------------------------------------------------------

const hoisted = vi.hoisted(() => {
  const mockUsePathname = vi.fn();
  const mockRegister = vi.fn();
  return { mockUsePathname, mockRegister };
});

vi.mock('next/navigation', () => ({
  usePathname: hoisted.mockUsePathname,
}));

// ----- Test setup ----------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // Place a posthog stub on window so the effect's `if (!posthog?.register)`
  // guard passes. Real PostHog init is async + gated by consent; we shortcut.
  (window as unknown as Record<string, unknown>).posthog = {
    register: hoisted.mockRegister,
  };
  // Avoid initPostHog noise: clear the consent key.
  window.localStorage.removeItem('estrevia_cookie_consent');
});

describe('PostHogProvider — locale super-property', () => {
  it('registers locale="en" on EN pathnames', async () => {
    hoisted.mockUsePathname.mockReturnValue('/en/pricing');
    render(<PostHogProvider><div /></PostHogProvider>);
    await waitFor(() => {
      expect(hoisted.mockRegister).toHaveBeenCalledWith({ locale: 'en' });
    });
  });

  it('registers locale="es" on ES pathnames', async () => {
    hoisted.mockUsePathname.mockReturnValue('/es/pricing');
    render(<PostHogProvider><div /></PostHogProvider>);
    await waitFor(() => {
      expect(hoisted.mockRegister).toHaveBeenCalledWith({ locale: 'es' });
    });
  });

  it('defaults to locale="en" on root pathname', async () => {
    hoisted.mockUsePathname.mockReturnValue('/');
    render(<PostHogProvider><div /></PostHogProvider>);
    await waitFor(() => {
      expect(hoisted.mockRegister).toHaveBeenCalledWith({ locale: 'en' });
    });
  });

  it('re-registers when pathname changes mid-session', async () => {
    hoisted.mockUsePathname.mockReturnValue('/en');
    const { rerender } = render(<PostHogProvider><div /></PostHogProvider>);
    await waitFor(() => {
      expect(hoisted.mockRegister).toHaveBeenCalledWith({ locale: 'en' });
    });
    act(() => {
      hoisted.mockUsePathname.mockReturnValue('/es');
    });
    rerender(<PostHogProvider><div /></PostHogProvider>);
    await waitFor(() => {
      expect(hoisted.mockRegister).toHaveBeenCalledWith({ locale: 'es' });
    });
  });

  it('no-ops when posthog global is not loaded yet', async () => {
    hoisted.mockUsePathname.mockReturnValue('/en');
    delete (window as unknown as Record<string, unknown>).posthog;
    render(<PostHogProvider><div /></PostHogProvider>);
    // Wait a tick to ensure no async register call.
    await new Promise((r) => setTimeout(r, 10));
    expect(hoisted.mockRegister).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test, expect failure**

Run: `npx vitest run src/shared/components/__tests__/PostHogProvider.test.tsx`
Expected: FAIL — `posthog.register` is never called because `PostHogProvider` does not yet read pathname or call `register`.

---

### Task C2-2: Implement locale registration in PostHogProvider

**Files:**
- Modify: `src/shared/components/PostHogProvider.tsx`

- [ ] **Step 1: Add `usePathname` import**

In the import block at top of file, add:

```tsx
import { usePathname } from 'next/navigation';
```

Place near the existing `next/navigation` consumers (there are none yet — add it as a separate `next/navigation` import after the React imports).

- [ ] **Step 2: Add pathname read + register effect inside `PostHogProvider`**

Add immediately after the `initAttempted = useRef(false)` line (before `initPostHog`):

```tsx
const pathname = usePathname();
```

Then add a new `useEffect` immediately after the existing consent-change listener `useEffect` (before the `return` statement):

```tsx
  // Locale super-property: every subsequent posthog.capture() inherits
  // { locale: 'en' | 'es' }. Re-runs on pathname change (e.g. language
  // switcher) and on init completion so events fired right after consent
  // pick up the locale immediately.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const posthog = (window as unknown as {
      posthog?: { register?: (props: Record<string, unknown>) => void };
    }).posthog;
    if (!posthog?.register) return;
    const locale = pathname?.startsWith('/es') ? 'es' : 'en';
    posthog.register({ locale });
  }, [pathname, isInitialized]);
```

`isInitialized` is in deps so registration runs the moment PostHog finishes loading after consent (e.g. user accepts cookies on `/es/...` — register fires with `'es'` once `posthog` global appears).

- [ ] **Step 3: Run the test, expect pass**

Run: `npx vitest run src/shared/components/__tests__/PostHogProvider.test.tsx`
Expected: PASS, 5 tests green.

- [ ] **Step 4: Run typecheck + lint scoped to changed file**

Run: `npm run typecheck`
Expected: zero errors.

Run: `npx eslint src/shared/components/PostHogProvider.tsx src/shared/components/__tests__/PostHogProvider.test.tsx`
Expected: zero warnings. (Per `feedback_lint_worktrees_pollution`: project-wide `npm run lint` is polluted by stale worktree copies — scope to the files we touched.)

- [ ] **Step 5: Commit**

```bash
git add src/shared/components/PostHogProvider.tsx \
        src/shared/components/__tests__/PostHogProvider.test.tsx
git commit -m "$(cat <<'EOF'
feat(audit-quick-wins/C2): PostHog locale super-property

Adds posthog.register({ locale }) inside PostHogProvider so every
event (chart_calculated, email_lead_submitted, paywall_*, checkout_*)
carries locale='en'|'es' without per-callsite changes.

Re-runs on pathname change (language switcher) and on PostHog init
completion (consent accepted mid-session).

Closes C2 from 2026-05-19 audit-quick-wins spec.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# Phase A1 — Stripe Checkout `locale` parameter

### Task A1-1: Write failing route test for locale forwarding

**Files:**
- Modify: `src/app/api/v1/stripe/checkout/__tests__/route.test.ts`

- [ ] **Step 1: Append a new `describe` block after the existing UTM `describe`**

At the bottom of `route.test.ts`, after the closing `});` of the existing `describe('POST /api/v1/stripe/checkout — UTM metadata forwarding', ...)`, append:

```ts
describe('POST /api/v1/stripe/checkout — locale forwarding (authenticated)', () => {
  it('passes locale="es" to Stripe Checkout when body.locale="es"', async () => {
    const req = makeRequest({ locale: 'es' });
    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(mocks.mockSessionsCreate).toHaveBeenCalledOnce();
    const callArg = mocks.mockSessionsCreate.mock.calls[0][0];
    expect(callArg.locale).toBe('es');
  });

  it('passes locale="auto" when body.locale="en"', async () => {
    const req = makeRequest({ locale: 'en' });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const callArg = mocks.mockSessionsCreate.mock.calls[0][0];
    expect(callArg.locale).toBe('auto');
  });

  it('passes locale="auto" when body.locale is omitted (backward compat)', async () => {
    const req = makeRequest({});
    const res = await POST(req);
    expect(res.status).toBe(200);

    const callArg = mocks.mockSessionsCreate.mock.calls[0][0];
    expect(callArg.locale).toBe('auto');
  });

  it('falls back to locale="auto" on invalid locale (lenient parse pattern)', async () => {
    // Existing route swallows zod errors silently and defaults to pro_annual
    // with empty utm. We preserve that contract; invalid locale → 'auto'.
    const req = makeRequest({ locale: 'fr' });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const callArg = mocks.mockSessionsCreate.mock.calls[0][0];
    expect(callArg.locale).toBe('auto');
  });

  it('includes locale in session metadata and subscription_data.metadata when set', async () => {
    const req = makeRequest({ locale: 'es', utm_source: 'meta' });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const callArg = mocks.mockSessionsCreate.mock.calls[0][0];
    expect(callArg.metadata).toMatchObject({
      clerkUserId: USER_ID,
      locale: 'es',
      utm_source: 'meta',
    });
    expect(callArg.subscription_data.metadata).toMatchObject({
      clerkUserId: USER_ID,
      locale: 'es',
      utm_source: 'meta',
    });
  });

  it('omits locale key from metadata when locale not set', async () => {
    const req = makeRequest({ utm_source: 'meta' });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const callArg = mocks.mockSessionsCreate.mock.calls[0][0];
    expect(callArg.metadata).not.toHaveProperty('locale');
    expect(callArg.subscription_data.metadata).not.toHaveProperty('locale');
  });
});

describe('POST /api/v1/stripe/checkout — locale forwarding (anonymous)', () => {
  beforeEach(() => {
    // Unauthenticate for the anonymous branch.
    mocks.mockAuth.mockResolvedValue({ userId: null });
    mocks.mockCookieGet.mockReturnValue({ value: 'anon_abc' });
  });

  it('passes locale="es" to anonymous Stripe Checkout', async () => {
    const req = makeRequest({ locale: 'es' });
    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(mocks.mockSessionsCreate).toHaveBeenCalledOnce();
    const callArg = mocks.mockSessionsCreate.mock.calls[0][0];
    expect(callArg.locale).toBe('es');
    expect(callArg.metadata).toMatchObject({ locale: 'es', anonymous_id: 'anon_abc' });
  });
});
```

- [ ] **Step 2: Run the tests, expect failure**

Run: `npx vitest run src/app/api/v1/stripe/checkout/__tests__/route.test.ts`
Expected: FAIL — `route.ts` does not yet add `locale` to the schema, does not derive `stripeLocale`, and does not pass `locale` to Stripe or metadata.

---

### Task A1-2: Implement locale in checkout route

**Files:**
- Modify: `src/app/api/v1/stripe/checkout/route.ts`

- [ ] **Step 1: Extend the zod schema to accept `locale`**

Locate the `checkoutBodySchema` declaration (currently lines 31-39). Replace it with:

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

- [ ] **Step 2: Capture `localeFromBody` during parse + exclude from `utm`**

Replace the existing parse block (currently lines 73-87) with:

```ts
  // ---------------------------------------------------------------------------
  // 3. Parse plan + locale + UTM
  // ---------------------------------------------------------------------------
  let plan: 'pro_monthly' | 'pro_annual' = 'pro_annual';
  let localeFromBody: 'en' | 'es' | undefined = undefined;
  let utm: Record<string, string> = {};
  try {
    const body = await request.json();
    const parsed = checkoutBodySchema.parse(body);
    plan = parsed.plan;
    localeFromBody = parsed.locale;
    utm = Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] =>
          entry[0] !== 'plan' && entry[0] !== 'locale' && entry[1] !== undefined,
      ),
    );
  } catch {
    plan = 'pro_annual';
  }

  // Stripe Checkout uses 'auto' (browser language) for EN/missing; explicit
  // 'es' for Spanish-locale callers. Stripe also supports 'en' explicitly,
  // but 'auto' is friendlier when the user is on /en but their browser is
  // set to another language Stripe supports.
  const stripeLocale: 'auto' | 'es' = localeFromBody === 'es' ? 'es' : 'auto';
```

- [ ] **Step 3: Wire `stripeLocale` + locale-in-metadata into the AUTHENTICATED branch**

Find the `stripe.checkout.sessions.create({ ... })` call inside the authenticated branch (around lines 155-169). Replace it with:

```ts
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        ...(stripeCustomerId ? { customer: stripeCustomerId } : { customer_email: userEmail }),
        client_reference_id: userId,
        locale: stripeLocale,
        metadata: {
          clerkUserId: userId,
          ...(localeFromBody ? { locale: localeFromBody } : {}),
          ...utm,
        },
        subscription_data: {
          ...(stripeCustomerId ? {} : { trial_period_days: 3 }),
          metadata: {
            clerkUserId: userId,
            ...(localeFromBody ? { locale: localeFromBody } : {}),
            ...utm,
          },
        },
        success_url: `${appUrl}/checkout/complete?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/pricing`,
        allow_promotion_codes: true,
        billing_address_collection: 'auto',
      });
```

- [ ] **Step 4: Wire `stripeLocale` + locale-in-metadata into the ANONYMOUS branch**

Find the second `stripe.checkout.sessions.create({ ... })` (around lines 224-238). Replace the metadata construction + session call with:

```ts
    const stripe = getStripe();
    const metadata: Record<string, string> = { ...utm };
    if (anonymousId) metadata.anonymous_id = anonymousId;
    if (localeFromBody) metadata.locale = localeFromBody;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      ...(prefilledEmail ? { customer_email: prefilledEmail } : {}),
      ...(anonymousId ? { client_reference_id: anonymousId } : {}),
      locale: stripeLocale,
      metadata,
      subscription_data: {
        trial_period_days: 3,
        metadata,
      },
      success_url: `${appUrl}/checkout/complete?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/pricing`,
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
    });
```

- [ ] **Step 5: Run the tests, expect pass**

Run: `npx vitest run src/app/api/v1/stripe/checkout/__tests__/route.test.ts`
Expected: PASS, all existing UTM tests still green + 7 new locale tests green.

---

### Task A1-3: Write failing PricingUpgradeButton test for locale in body

**Files:**
- Modify: `src/app/[locale]/(marketing)/pricing/__tests__/PricingUpgradeButton.utm.test.tsx`

- [ ] **Step 1: Add hoisted locale control + `useLocale` to the existing `next-intl` mock**

The current mock at the top of the file (line 6-8) is:

```tsx
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
```

Replace it with a hoisted-value pattern so individual tests can flip the locale:

```tsx
const hoistedLocale = vi.hoisted(() => ({ value: 'en' as 'en' | 'es' }));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => hoistedLocale.value,
}));
```

Reset the locale to default in the existing `beforeEach` block (line 35):

```tsx
beforeEach(() => {
  vi.clearAllMocks();
  hoistedLocale.value = 'en';
});
```

- [ ] **Step 2: Append two locale-forwarding tests inside the existing `describe(...)` block**

```tsx
  it('includes locale="en" in the fetch body by default', async () => {
    mockReadUtmCookie.mockReturnValue(null);
    const mockFetch = makeFetchMock();
    vi.stubGlobal('fetch', mockFetch);

    const { getByRole } = render(<PricingUpgradeButton plan="pro_annual" />);
    await act(async () => {
      getByRole('button').click();
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as Record<string, unknown>;
    expect(body.locale).toBe('en');
  });

  it('includes locale="es" in the fetch body when rendered under /es', async () => {
    hoistedLocale.value = 'es';
    mockReadUtmCookie.mockReturnValue(null);
    const mockFetch = makeFetchMock();
    vi.stubGlobal('fetch', mockFetch);

    const { getByRole } = render(<PricingUpgradeButton plan="pro_annual" />);
    await act(async () => {
      getByRole('button').click();
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as Record<string, unknown>;
    expect(body.locale).toBe('es');
  });
```

- [ ] **Step 3: Run the test, expect failure**

Run: `npx vitest run src/app/[locale]/(marketing)/pricing/__tests__/PricingUpgradeButton.utm.test.tsx`
Expected: FAIL on the new test — fetch body does not yet include `locale`.

---

### Task A1-4: Implement locale in PricingUpgradeButton fetch

**Files:**
- Modify: `src/app/[locale]/(marketing)/pricing/PricingUpgradeButton.tsx`

- [ ] **Step 1: Import `useLocale`**

Replace the existing `import { useTranslations } from 'next-intl';` line (line 4) with:

```tsx
import { useTranslations, useLocale } from 'next-intl';
```

- [ ] **Step 2: Read locale at component scope + add to fetch body**

Inside `PricingUpgradeButton`, after the existing `const tPage = useTranslations('pricingPage');` (line 19), add:

```tsx
  const locale = useLocale();
```

Then replace the fetch body (line 34):

```tsx
        body: JSON.stringify({ plan, locale, ...(utmFields ?? {}) }),
```

`locale` comes after `plan` so it's grouped with other route-level params, before the spread `utmFields` (UTM keys never collide with `locale` per the schema).

- [ ] **Step 3: Run the test, expect pass**

Run: `npx vitest run src/app/[locale]/(marketing)/pricing/__tests__/PricingUpgradeButton.utm.test.tsx`
Expected: PASS, all existing tests + new locale test green.

---

### Task A1-5: Repeat locale wiring for CheckoutStartClient

**Files:**
- Modify: `src/app/[locale]/checkout/start/CheckoutStartClient.tsx`
- Modify: `src/app/[locale]/checkout/start/__tests__/CheckoutStartClient.utm.test.tsx`

- [ ] **Step 1: Mirror the hoisted-locale pattern at the top of the file**

The existing mock at lines 17-19 is:

```tsx
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
```

Replace with:

```tsx
const hoistedLocale = vi.hoisted(() => ({ value: 'en' as 'en' | 'es' }));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => hoistedLocale.value,
}));
```

Add the reset to the existing `beforeEach` (line 40):

```tsx
beforeEach(() => {
  vi.clearAllMocks();
  hoistedLocale.value = 'en';
  mockPostJson.mockResolvedValue({ kind: 'error', status: 500, message: 'test' });
});
```

- [ ] **Step 2: Add two locale-forwarding tests inside the existing `describe(...)` block**

```tsx
  it('includes locale="en" in the postJson body by default', async () => {
    mockReadUtmCookie.mockReturnValue(null);

    render(<CheckoutStartClient />);

    await waitFor(() => {
      expect(mockPostJson).toHaveBeenCalledTimes(1);
    });

    const [, body] = mockPostJson.mock.calls[0] as [string, Record<string, unknown>];
    expect(body.locale).toBe('en');
  });

  it('includes locale="es" in the postJson body when rendered under /es', async () => {
    hoistedLocale.value = 'es';
    mockReadUtmCookie.mockReturnValue(null);

    render(<CheckoutStartClient />);

    await waitFor(() => {
      expect(mockPostJson).toHaveBeenCalledTimes(1);
    });

    const [, body] = mockPostJson.mock.calls[0] as [string, Record<string, unknown>];
    expect(body.locale).toBe('es');
  });
```

- [ ] **Step 2: Run the test, expect failure**

Run: `npx vitest run src/app/[locale]/checkout/start/__tests__/CheckoutStartClient.utm.test.tsx`
Expected: FAIL — body does not include `locale`.

- [ ] **Step 3: Implement in `CheckoutStartClient.tsx`**

Replace the existing `useTranslations` import line:

```tsx
import { useTranslations, useLocale } from 'next-intl';
```

After `const t = useTranslations('pricingPage.checkout');` (line 37), add:

```tsx
  const locale = useLocale();
```

In the `postJson` call (line 54-57), update the body:

```tsx
      const result = await postJson<CheckoutResponse>(
        '/api/v1/stripe/checkout',
        { plan, returnUrl, locale, ...(utmFields ?? {}) },
      );
```

- [ ] **Step 4: Run the test, expect pass**

Run: `npx vitest run src/app/[locale]/checkout/start/__tests__/CheckoutStartClient.utm.test.tsx`
Expected: PASS.

---

### Task A1-6: Repeat locale wiring for PaywallModal

**Files:**
- Modify: `src/shared/components/PaywallModal.tsx`
- Modify: `src/shared/components/__tests__/PaywallModal.utm.test.tsx`

- [ ] **Step 1: Mirror the hoisted-locale pattern at the top of the file**

The existing mock at lines 6-8 is:

```tsx
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
```

Replace with:

```tsx
const hoistedLocale = vi.hoisted(() => ({ value: 'en' as 'en' | 'es' }));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => hoistedLocale.value,
}));
```

Add the reset to the existing `beforeEach` (line 35):

```tsx
beforeEach(() => {
  vi.clearAllMocks();
  hoistedLocale.value = 'en';
});
```

- [ ] **Step 2: Add two locale-forwarding tests inside the existing `describe(...)` block**

The existing tests use `<PaywallModal open={true} onClose={vi.fn()} returnUrl="/chart" />` and click `getByRole('button', { name: /trialCta/i })`. Mirror that prop shape and selector.

```tsx
  it('includes locale="en" in the fetch body by default', async () => {
    mockReadUtmCookie.mockReturnValue(null);
    const mockFetch = makeFetchMock();
    vi.stubGlobal('fetch', mockFetch);

    const { getByRole } = render(
      <PaywallModal open={true} onClose={vi.fn()} returnUrl="/chart" />,
    );

    const ctaButton = getByRole('button', { name: /trialCta/i });
    await act(async () => {
      ctaButton.click();
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as Record<string, unknown>;
    expect(body.locale).toBe('en');
  });

  it('includes locale="es" in the fetch body when locale is es', async () => {
    hoistedLocale.value = 'es';
    mockReadUtmCookie.mockReturnValue(null);
    const mockFetch = makeFetchMock();
    vi.stubGlobal('fetch', mockFetch);

    const { getByRole } = render(
      <PaywallModal open={true} onClose={vi.fn()} returnUrl="/chart" />,
    );

    const ctaButton = getByRole('button', { name: /trialCta/i });
    await act(async () => {
      ctaButton.click();
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as Record<string, unknown>;
    expect(body.locale).toBe('es');
  });
```

- [ ] **Step 2: Run the test, expect failure**

Run: `npx vitest run src/shared/components/__tests__/PaywallModal.utm.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement in `PaywallModal.tsx`**

Replace the existing `useTranslations` import:

```tsx
import { useTranslations, useLocale } from 'next-intl';
```

After the existing `useTranslations` calls (lines 48-49), add:

```tsx
  const locale = useLocale();
```

In the fetch body inside `handleCheckout` (line 119), update:

```tsx
        body: JSON.stringify({ plan, returnUrl, locale, ...(utmFields ?? {}) }),
```

- [ ] **Step 4: Run the test, expect pass**

Run: `npx vitest run src/shared/components/__tests__/PaywallModal.utm.test.tsx`
Expected: PASS.

---

### Task A1-7: Verify full Stripe checkout test surface + lint + commit

- [ ] **Step 1: Run the full route + caller test suite**

Run:

```bash
npx vitest run \
  src/app/api/v1/stripe/checkout/__tests__/route.test.ts \
  src/app/[locale]/(marketing)/pricing/__tests__/PricingUpgradeButton.utm.test.tsx \
  src/app/[locale]/checkout/start/__tests__/CheckoutStartClient.utm.test.tsx \
  src/shared/components/__tests__/PaywallModal.utm.test.tsx
```

Expected: all green.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: zero errors.

- [ ] **Step 3: Scoped lint**

Run:

```bash
npx eslint \
  src/app/api/v1/stripe/checkout/route.ts \
  src/app/api/v1/stripe/checkout/__tests__/route.test.ts \
  src/app/[locale]/\(marketing\)/pricing/PricingUpgradeButton.tsx \
  src/app/[locale]/\(marketing\)/pricing/__tests__/PricingUpgradeButton.utm.test.tsx \
  src/app/[locale]/checkout/start/CheckoutStartClient.tsx \
  src/app/[locale]/checkout/start/__tests__/CheckoutStartClient.utm.test.tsx \
  src/shared/components/PaywallModal.tsx \
  src/shared/components/__tests__/PaywallModal.utm.test.tsx
```

Expected: zero warnings.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/v1/stripe/checkout/route.ts \
        src/app/api/v1/stripe/checkout/__tests__/route.test.ts \
        'src/app/[locale]/(marketing)/pricing/PricingUpgradeButton.tsx' \
        'src/app/[locale]/(marketing)/pricing/__tests__/PricingUpgradeButton.utm.test.tsx' \
        'src/app/[locale]/checkout/start/CheckoutStartClient.tsx' \
        'src/app/[locale]/checkout/start/__tests__/CheckoutStartClient.utm.test.tsx' \
        src/shared/components/PaywallModal.tsx \
        src/shared/components/__tests__/PaywallModal.utm.test.tsx

git commit -m "$(cat <<'EOF'
feat(audit-quick-wins/A1): pass locale to Stripe Checkout

ES users land on Spanish-language Stripe Checkout UI instead of English
(current ES conversion: 0%). Adds optional locale to checkoutBodySchema
and forwards it as Stripe Checkout 'locale' parameter + as metadata.

Schema:
  locale: 'en' | 'es' (optional) → Stripe locale 'auto' | 'es'
  'auto' for EN/omitted (Stripe respects browser Accept-Language)
  'es' explicit for Spanish UI

3 callers carry useLocale() to the fetch body:
  - PricingUpgradeButton
  - CheckoutStartClient
  - PaywallModal

Metadata pass-through on both session + subscription_data.metadata so
the Stripe webhook can attribute future conversions by language.

Closes A1 from 2026-05-19 audit-quick-wins spec.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# Phase C1 — HeroCalculator `chart_calculated`

### Task C1-1: Add analytics mock + failing test to HeroCalculator suite

**Files:**
- Modify: `src/modules/astro-engine/components/__tests__/HeroCalculator.test.tsx`

The existing file already has: (a) `fillFormAndSubmit()` helper (no params, submits via `getByRole('button', { name: /submit/i })`), (b) `vi.spyOn(global, 'fetch').mockResolvedValue(fakeChartResponse)` in `beforeEach` where `fakeChartResponse` returns Sun=Leo only (no Moon), (c) `next-intl` mock with `useLocale: () => 'en'`, (d) the form's default state has `knowsBirthTime: false`. Build on top of these — do not replace them.

- [ ] **Step 1: Add the analytics mock at the top of the file**

Insert after the `vi.mock('../TimePickerField', ...)` block (line 68-70), before `import { HeroCalculator } from '../HeroCalculator';`:

```tsx
vi.mock('@/shared/lib/analytics', () => ({
  trackEvent: vi.fn(),
  AnalyticsEvent: {
    CHART_CALCULATED: 'chart_calculated',
  },
}));
```

Then add this import alongside the `HeroCalculator` import (line 72):

```tsx
import { trackEvent } from '@/shared/lib/analytics';
```

(The mock makes `trackEvent` a `vi.fn`; tests assert via `vi.mocked(trackEvent)`.)

- [ ] **Step 2: Reset `trackEvent` between tests + clean up `fbq` global**

Extend the existing `beforeEach` (line 90-98):

```tsx
beforeEach(() => {
  searchParamsValue = new URLSearchParams();
  window.localStorage.clear();
  lastModalProps = null;
  vi.mocked(trackEvent).mockClear();
  delete (window as unknown as { fbq?: unknown }).fbq;
  vi.spyOn(global, 'fetch').mockResolvedValue(new Response(
    JSON.stringify(fakeChartResponse),
    { status: 200, headers: { 'content-type': 'application/json' } },
  ));
});
```

- [ ] **Step 3: Add a new `describe` block at the end of the file**

After the closing `});` of `describe('HeroCalculator gate state machine', ...)` (line 170), append:

```tsx
describe('HeroCalculator analytics (C1 — chart_calculated)', () => {
  it('fires chart_calculated with source="hero" on successful submit (anonymous, no Moon in payload)', async () => {
    // Uses the default fakeChartResponse — Sun=Leo, no Moon.
    render(<HeroCalculator isSignedIn={false} />);
    await fillFormAndSubmit();

    await waitFor(() => {
      expect(vi.mocked(trackEvent)).toHaveBeenCalledWith(
        'chart_calculated',
        expect.objectContaining({
          source: 'hero',
          has_birth_time: false,
          sun: 'Leo',
          moon: null,
          is_authenticated: false,
        }),
      );
    });
  });

  it('fires chart_calculated with is_authenticated=true when isSignedIn=true', async () => {
    render(<HeroCalculator isSignedIn={true} />);
    await fillFormAndSubmit();

    await waitFor(() => {
      expect(vi.mocked(trackEvent)).toHaveBeenCalledWith(
        'chart_calculated',
        expect.objectContaining({ is_authenticated: true }),
      );
    });
  });

  it('includes Moon sign in payload when the chart returns one', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response(
      JSON.stringify({
        success: true,
        data: {
          chartId: 'chart_with_moon',
          chart: {
            planets: [
              { planet: 'Sun', sign: 'Leo', signDegree: 12.34 },
              { planet: 'Moon', sign: 'Pisces', signDegree: 4.20 },
            ],
          },
        },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));

    render(<HeroCalculator isSignedIn={false} />);
    await fillFormAndSubmit();

    await waitFor(() => {
      expect(vi.mocked(trackEvent)).toHaveBeenCalledWith(
        'chart_calculated',
        expect.objectContaining({ sun: 'Leo', moon: 'Pisces' }),
      );
    });
  });

  it('does NOT fire chart_calculated when the server returns 500', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response(
      JSON.stringify({ error: 'server_error' }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    ));

    render(<HeroCalculator isSignedIn={false} />);
    await fillFormAndSubmit();

    // Settle: give the rejected branch a tick to run finally{}.
    await new Promise((r) => setTimeout(r, 30));
    expect(vi.mocked(trackEvent)).not.toHaveBeenCalled();
  });

  it('calls fbq("track", "ViewContent", ...) when fbq is on window', async () => {
    const fbqMock = vi.fn();
    (window as unknown as { fbq: typeof fbqMock }).fbq = fbqMock;

    render(<HeroCalculator isSignedIn={false} />);
    await fillFormAndSubmit();

    await waitFor(() => {
      expect(fbqMock).toHaveBeenCalledWith('track', 'ViewContent', { content_type: 'natal_chart' });
    });
  });

  it('does not throw when fbq is absent (PostHog event still fires)', async () => {
    // beforeEach already deletes window.fbq — assert default behavior.
    render(<HeroCalculator isSignedIn={false} />);
    await fillFormAndSubmit();

    await waitFor(() => {
      expect(vi.mocked(trackEvent)).toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 4: Run the tests, expect failure**

Run: `npx vitest run src/modules/astro-engine/components/__tests__/HeroCalculator.test.tsx`
Expected: FAIL on the 6 new tests — `trackEvent` mock is never invoked because `HeroCalculator.tsx` doesn't import or call it yet. Existing 6 gate-state-machine tests still pass.

---

### Task C1-2: Emit chart_calculated from HeroCalculator

**Files:**
- Modify: `src/modules/astro-engine/components/HeroCalculator.tsx`

- [ ] **Step 1: Add the analytics import**

Near the top of the file, alongside the other `@/shared/...` imports, add:

```tsx
import { trackEvent, AnalyticsEvent } from '@/shared/lib/analytics';
```

- [ ] **Step 2: Fire the event after a successful chart calculation**

Find the success block in `handleSubmit` (currently lines 261-269):

```tsx
        const heroResult = {
          sunSign: sunPlanet.sign,
          sunDegree: sunPlanet.signDegree,
          chartId: json.data.chartId,
        };
        setResult(heroResult);
        if (shouldShowGate()) {
          setGateOpen(true);
        }
```

Replace it with:

```tsx
        const heroResult = {
          sunSign: sunPlanet.sign,
          sunDegree: sunPlanet.signDegree,
          chartId: json.data.chartId,
        };
        setResult(heroResult);

        // Analytics fire: chart_calculated from landing hero. Mirrors the
        // BirthDataForm emission but discriminated by source='hero'. No PII
        // (birth fields are NOT included in the payload). Defensively wrapped
        // so an analytics failure cannot break the result UI.
        try {
          const moonPlanet = json.data?.chart?.planets?.find((p) => p.planet === 'Moon');
          trackEvent(AnalyticsEvent.CHART_CALCULATED, {
            source: 'hero',
            has_birth_time: form.knowsBirthTime,
            sun: sunPlanet.sign,
            moon: moonPlanet?.sign ?? null,
            is_authenticated: isSignedIn ?? false,
          });

          if (typeof window !== 'undefined' && (window as unknown as { fbq?: (...args: unknown[]) => void }).fbq) {
            (window as unknown as { fbq: (...args: unknown[]) => void }).fbq(
              'track',
              'ViewContent',
              { content_type: 'natal_chart' },
            );
          }
        } catch (err) {
          if (process.env.NODE_ENV !== 'production') {
            console.warn('[HeroCalculator] analytics fire failed (non-fatal):', err);
          }
        }

        if (shouldShowGate()) {
          setGateOpen(true);
        }
```

The Sun planet read at line 254 is reused here for `sun:` — no extra DB/CPU cost. Moon is looked up freshly because `BirthDataForm` looks it up too; mirroring is the goal per spec.

Note on the chart-payload type: the existing `json` typedef at line 253 narrows `chart` to `{ planets: Array<{ planet: string; sign: string; signDegree: number }> }`. That's enough for the Moon lookup; no type changes needed.

- [ ] **Step 3: Run the tests, expect pass**

Run: `npx vitest run src/modules/astro-engine/components/__tests__/HeroCalculator.test.tsx`
Expected: PASS, all 5 new tests green + any pre-existing tests still passing.

- [ ] **Step 4: Typecheck + scoped lint**

Run: `npm run typecheck`
Expected: zero errors.

Run: `npx eslint src/modules/astro-engine/components/HeroCalculator.tsx src/modules/astro-engine/components/__tests__/HeroCalculator.test.tsx`
Expected: zero warnings.

- [ ] **Step 5: Commit**

```bash
git add src/modules/astro-engine/components/HeroCalculator.tsx \
        src/modules/astro-engine/components/__tests__/HeroCalculator.test.tsx
git commit -m "$(cat <<'EOF'
feat(audit-quick-wins/C1): emit chart_calculated from HeroCalculator

Landing-hero calculator now fires PostHog 'chart_calculated' + Meta
Pixel 'ViewContent' on successful chart calc, matching BirthDataForm.

Root cause: 518 charts/30d in DB, 0 chart_calculated PostHog events.
HeroCalculator (landing hero) was the missing emitter — only the
secondary /chart form was firing the event.

Discriminated by source='hero' (vs 'form') so the funnel can split
landing-page vs /chart-page usage in PostHog.

Defensively wrapped in try/catch — analytics failures cannot break
the result UI (chart is shown to the user before the event fires).

Closes C1 from 2026-05-19 audit-quick-wins spec.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# Phase Final — Full quality gates + manual smoke

### Task F-1: Run full test suite + typecheck + scoped lint

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: all green, including the existing pre-fix tests + ~12 new tests across C2/A1/C1.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: zero errors.

- [ ] **Step 3: Lint scoped to changed files only**

Run:

```bash
npx eslint \
  src/shared/components/PostHogProvider.tsx \
  src/shared/components/__tests__/PostHogProvider.test.tsx \
  src/app/api/v1/stripe/checkout/route.ts \
  src/app/api/v1/stripe/checkout/__tests__/route.test.ts \
  'src/app/[locale]/(marketing)/pricing/PricingUpgradeButton.tsx' \
  'src/app/[locale]/(marketing)/pricing/__tests__/PricingUpgradeButton.utm.test.tsx' \
  'src/app/[locale]/checkout/start/CheckoutStartClient.tsx' \
  'src/app/[locale]/checkout/start/__tests__/CheckoutStartClient.utm.test.tsx' \
  src/shared/components/PaywallModal.tsx \
  src/shared/components/__tests__/PaywallModal.utm.test.tsx \
  src/modules/astro-engine/components/HeroCalculator.tsx \
  src/modules/astro-engine/components/__tests__/HeroCalculator.test.tsx
```

Expected: zero warnings. (Per `feedback_lint_worktrees_pollution`: project-wide `npm run lint` is polluted by stale `.claude/worktrees/` copies — scope to the files we touched.)

---

### Task F-2: Local smoke

- [ ] **Step 1: Start dev**

Run: `npm run dev`
Wait for `ready` log.

- [ ] **Step 2: C1 + C2 smoke on EN**

Open `http://localhost:3000/` (HeroCalculator).
Open DevTools → Console + Network.

Fill out the form with a valid birth date + time + city (use a fixture from `tests/fixtures/`). Submit.

Verify:
- Network: `POST /api/v1/chart/calculate` returns 200.
- Console: no errors.
- Open PostHog Live Events (or run `posthog.debug()` in the console first): `chart_calculated` event fires with `source: 'hero'` and `locale: 'en'`.

If PostHog is blocked by consent in dev: accept cookies first, then redo the form fill.

- [ ] **Step 3: A1 + C2 smoke on ES**

Open `http://localhost:3000/es/pricing`. Click the "Probar Pro"/"Prueba" button.

Verify:
- Network: `POST /api/v1/stripe/checkout` request body contains `"locale":"es"` (and the existing UTM keys if present).
- The Stripe Checkout URL returned is followed → the hosted page renders in Spanish.
- If signed in: same on `/es/pricing` for an authenticated user. If anonymous: the response should still include the Stripe URL (anonymous checkout already shipped).

- [ ] **Step 4: PaywallModal smoke**

Trigger a paywall (e.g. open `/es/chart`, generate a chart, then trigger an AI reading paywall — exact trigger depends on which paywall is reachable locally). Click the trial CTA.

Verify the fetch body includes `locale: 'es'` (Network tab) and the resulting Stripe URL shows Spanish UI.

- [ ] **Step 5: Locale-switch smoke (C2 re-registration)**

On the same browser session, navigate from `/en/...` to `/es/...` without reloading (use the language switcher if present, otherwise click an `<a href="/es/...">` link). Calculate a chart or trigger any new PostHog event.

Verify in PostHog Live Events that the new event carries `locale: 'es'` — confirms the `useEffect([pathname])` re-registration.

---

### Task F-3: Push + post-deploy verification

- [ ] **Step 1: Push**

```bash
git push origin main
```

(Confirm with the founder before pushing per `feedback_main_branch_workflow`.)

- [ ] **Step 2: Wait for Vercel deploy + run prod smoke**

After Vercel reports a successful deploy:

- Open `https://estrevia.app/es/pricing` → click upgrade → check Network for `locale: 'es'` in the request body → confirm Spanish Stripe Checkout.
- Open `https://estrevia.app/` → calculate a chart with HeroCalculator → check PostHog Live Events for `chart_calculated` with `source: 'hero'` and `locale: 'en'`.
- Filter PostHog by `locale = 'es'` on any event from the last 5 minutes — should show events with the locale property attached.

If any smoke step fails, identify which commit is responsible and `git revert <sha>` for surgical rollback (the 3-commit decision D1 makes this possible).

---

## Success Criteria (post-deploy)

Measured one week post-ship (2026-05-26 vs 2026-05-19 audit baseline):

| Metric | Pre-fix baseline | Target post-fix |
|---|---|---|
| `chart_calculated` events / chart row in DB | ~0% | ≥80% (gap = no consent) |
| PostHog events with `locale` property | 0% | 100% post-C2 |
| Stripe Checkout language for `/es/` referrals | English | Spanish |
| ES `paywall_opened → checkout_stripe_redirected` conversion | 0% | ≥5% |

---

## Out of scope (per spec)

- Localized currency via Stripe `currency_options` (B3 from audit) — separate spec.
- `success_url` / `cancel_url` `/es/` prefix — requires routing semantics decision.
- Server-side `chart_calculated` safety net — explicitly rejected during brainstorming (D3).
- Audit of other ghost-defined events (e.g. `user_signed_up`) — separate task.
- Stripe webhook reading `metadata.locale` for postpaid analytics — pass-through ships, consumption is future work.

## Notes for the executing engineer

- **Lenient error handling preserved.** The existing route swallows zod errors silently and defaults to `pro_annual` + empty `utm`. We extend that pattern (invalid `locale` → `stripeLocale = 'auto'`). The spec's mention of "400 INVALID_INPUT for locale='fr'" describes aspirational behavior; do not change the contract here. The route test asserts the lenient behavior explicitly.
- **C2's `useEffect` depends on `isInitialized` too.** This guarantees that the first events after consent is accepted mid-session carry `locale` — otherwise the effect would only run once on mount when posthog wasn't yet on `window`.
- **No new shared abstractions.** Each fix is local to its concern; existing module boundaries unchanged.
- **No migrations, no env vars, no feature flags.** Single push triggers a single Vercel deploy.
- **Bisect viability.** Three commits with `audit-quick-wins/C2`, `audit-quick-wins/A1`, `audit-quick-wins/C1` scopes — if a problem shows up post-deploy, a `git revert <sha>` of the offending commit is surgical (D1 decision).
- **Lint scope.** Per `feedback_lint_worktrees_pollution`, do not interpret project-wide `npm run lint` output literally — stale worktree copies inflate the count. Scope `npx eslint` to the files this plan touches.
