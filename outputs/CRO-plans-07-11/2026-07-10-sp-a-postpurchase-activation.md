# SP-A Post-purchase Activation & Checkout Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A payer's post-purchase minute stops being wasted: `returnUrl` survives the Stripe round-trip (session metadata), ES payers stay in Spanish through success AND cancel, `/checkout/complete` reads the sign-in ticket from Redis (killing the dead 8s Stripe-metadata poll) and renders real strings in both locales, everyone lands on the page that made them pay (default localized `/chart`, never `/settings`), and new payers get a T+24h paid-onboarding activation email nudging them toward the AI reading.

**Architecture:** Two tracks over existing code. Track A (checkout routing): `src/app/api/v1/stripe/checkout/route.ts` (schema + metadata + URLs) and the `/checkout/complete` page pair (server page + client fallback) — the server resolves the redirect target once and passes it down; the client never re-derives it. Track B (paid onboarding): new transactional `PaidOnboardingEmail` template + `sendPaidOnboardingEmail` in `email.ts` + a `'paid_onboarding'` entry in the `sent_emails` TS-only enum (NO migration) + a new hourly cron registered in `vercel.json`. Founder checklist covers the dashboard-only Stripe Product rename (D7) and the test-mode E2E smoke. Spec: `docs/superpowers/specs/2026-07-10-sp-a-postpurchase-activation-design.md`.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript strict, zod 4, Drizzle ORM + Neon, Upstash Redis (`@/shared/lib/redis`), Clerk sign-in tickets, Stripe Checkout, Resend + @react-email, next-intl (`localePrefix: 'as-needed'`), Vitest.

## Global Constraints

- i18n message files live at `messages/en.json` and `messages/es.json` (repo root). **This plan changes NO message files** — the `pricingPage.checkout.complete` keys (`title, description, redirecting, checkEmail, contactSupport`) already exist in both locales (en.json:1024-1030, es.json:1027-1033); the bug is the namespace at the two call sites.
- Tests: `npx vitest run <path>` for single files; full gate = `npx vitest run` + `npm run typecheck` + `npm run lint` (lint: ignore `.claude/worktrees/**` noise). Component tests need the `// @vitest-environment jsdom` pragma (vitest default env is node).
- Crons and webhooks never log raw errors or email addresses (PII rule) — log `{ userId, message }` only. Per-user failures are isolated (try/catch + Sentry + continue).
- **Never run `npm run db:migrate` or `npm run db:generate`** — journal drift 0013–0017 (`feedback_drizzle_snapshot_stale`). Task 4's schema change is a Drizzle `text(..., { enum })` widening: TypeScript-only, zero DDL, zero migration.
- Resend `result.error` MUST be checked on every new send path (the welcome-email lesson / audit R-1): a rejected send records nothing so the next cron run retries. `idempotencyKey` goes in the SECOND argument of `resend.emails.send()`.
- Transactional emails (no `unsubscribeUrl` prop) are exempt from the `COMPANY_POSTAL_ADDRESS` gate (`src/emails/components/EmailLayout.tsx:28-38`) — `PaidOnboardingEmail` is transactional and MUST NOT pass `unsubscribeUrl`.
- The new sender honors the house `DRY_RUN=true` env gate (same pattern as `trial-expiration-email.ts:70-75`).
- ES copy = español neutro LATAM, `tú` form; sign names untranslated, planet names translated.
- returnUrl safety: only single-slash-rooted paths (`/^\/(?!\/)/`), max 500 chars (Stripe metadata value hard cap), validated at checkout AND re-checked at `/checkout/complete` (defense in depth — metadata is dashboard-editable). Validation failures are ALWAYS non-fatal: invalid → treated as absent, never a 4xx/5xx.
- Commit style: `feat(sp-a/T<n>): ...` / `fix(sp-a/T<n>): ...` / `test(...)` / `chore(...)`.

---

### Task 1: Checkout route — returnUrl into session metadata + locale-prefixed success/cancel URLs (D1 + D5)

**Files:**
- Modify: `src/app/api/v1/stripe/checkout/route.ts` (schema :35-46; parse block :126-144; `appUrl` :186; auth-branch metadata :281-285 and URLs :294-295; anon-branch metadata :370-372 and URLs :408-409)
- Test: `src/app/api/v1/stripe/checkout/__tests__/route.test.ts` (extend — uses existing hoisted `mocks.mockSessionsCreate` + `makeRequest` helper)

**Interfaces:**
- Consumes: existing `checkoutBodySchema` (zod 4 — `.catch(undefined)` makes a bad `returnUrl` degrade to absent without failing the whole parse, which would otherwise wipe `locale`/`utm`), `localeFromBody: 'en' | 'es' | undefined` (already validated, in scope at :134).
- Produces: `session.metadata.return_url` (both branches) consumed by Task 2's `/checkout/complete`; `success_url`/`cancel_url` gain the `/es` prefix for ES callers (next-intl `localePrefix: 'as-needed'` — EN stays at root, so EN URLs are byte-identical to today).
- Clients already POST `returnUrl` (server currently strips it): `PaywallModal.tsx:121` sends the paywall page's path; `CheckoutStartClient.tsx:43` reads `searchParams.get('return') ?? '/'` and **always** POSTs it (line 62) — so every `/checkout/start` entry without a `?return` param (trial-expiration email CTA, cart-abandon CTA, DiscountLaunchEmail links) POSTs `returnUrl: '/'`, and `PricingUpgradeButton.tsx:47`'s auth-failure fallback routes through `/checkout/start?return=%2Fpricing`. The SERVER normalizes these trivially-useless targets (`/`, `/es`, `/es/`, `/pricing`, `/es/pricing`) to absent (Step 3) so those payers get the default localized `/chart` instead of the marketing landing page or /pricing. **No client changes needed.**

- [ ] **Step 1: Write the failing tests**

Append to `src/app/api/v1/stripe/checkout/__tests__/route.test.ts` (after the existing `payment_method_types` describe, line 401):

```ts
describe('POST /api/v1/stripe/checkout — returnUrl metadata (SP-A D1)', () => {
  it('stores a valid same-origin path as metadata.return_url (authenticated)', async () => {
    const res = await POST(makeRequest({ returnUrl: '/tarot/celtic-cross', locale: 'en' }));
    expect(res.status).toBe(200);

    const callArg = mocks.mockSessionsCreate.mock.calls[0][0];
    expect(callArg.metadata.return_url).toBe('/tarot/celtic-cross');
  });

  it('rejects an absolute URL — return_url omitted, sibling fields NOT wiped', async () => {
    const res = await POST(
      makeRequest({ returnUrl: 'https://evil.example/phish', locale: 'es', utm_source: 'meta' }),
    );
    expect(res.status).toBe(200);

    const callArg = mocks.mockSessionsCreate.mock.calls[0][0];
    expect(callArg.metadata).not.toHaveProperty('return_url');
    // .catch(undefined) must degrade ONLY the returnUrl field — locale/utm survive.
    expect(callArg.metadata).toMatchObject({ locale: 'es', utm_source: 'meta' });
    expect(callArg.locale).toBe('es-419');
  });

  it('rejects a protocol-relative //host path', async () => {
    const res = await POST(makeRequest({ returnUrl: '//evil.example/phish' }));
    expect(res.status).toBe(200);
    const callArg = mocks.mockSessionsCreate.mock.calls[0][0];
    expect(callArg.metadata).not.toHaveProperty('return_url');
  });

  it('rejects a path longer than 500 chars (Stripe metadata value cap)', async () => {
    const res = await POST(makeRequest({ returnUrl: `/${'a'.repeat(500)}` }));
    expect(res.status).toBe(200);
    const callArg = mocks.mockSessionsCreate.mock.calls[0][0];
    expect(callArg.metadata).not.toHaveProperty('return_url');
  });

  it('never leaks returnUrl into the UTM passthrough key set', async () => {
    const res = await POST(makeRequest({ returnUrl: '/chart', utm_source: 'meta' }));
    expect(res.status).toBe(200);
    const callArg = mocks.mockSessionsCreate.mock.calls[0][0];
    expect(callArg.metadata).not.toHaveProperty('returnUrl');
    expect(callArg.subscription_data.metadata).not.toHaveProperty('returnUrl');
  });

  it('stores return_url in the anonymous branch too', async () => {
    mocks.mockAuth.mockResolvedValue({ userId: null });
    mocks.mockCookieGet.mockReturnValue({ value: 'anon_abc' });

    const res = await POST(makeRequest({ returnUrl: '/synastry', locale: 'es' }));
    expect(res.status).toBe(200);

    const callArg = mocks.mockSessionsCreate.mock.calls[0][0];
    expect(callArg.metadata.return_url).toBe('/synastry');
  });

  it("normalizes the CheckoutStartClient default '/' to absent — no return_url stored", async () => {
    // CheckoutStartClient.tsx:43 always POSTs returnUrl ?? '/' — storing '/'
    // would land payers on the marketing landing page instead of /chart.
    const res = await POST(makeRequest({ returnUrl: '/', locale: 'en' }));
    expect(res.status).toBe(200);
    const callArg = mocks.mockSessionsCreate.mock.calls[0][0];
    expect(callArg.metadata).not.toHaveProperty('return_url');
  });

  it("normalizes '/pricing' to absent — /pricing payers get the /chart default", async () => {
    // PricingUpgradeButton.tsx:47 auth-failure fallback routes through
    // /checkout/start?return=%2Fpricing — must not bounce payers back to /pricing.
    const res = await POST(makeRequest({ returnUrl: '/pricing' }));
    expect(res.status).toBe(200);
    const callArg = mocks.mockSessionsCreate.mock.calls[0][0];
    expect(callArg.metadata).not.toHaveProperty('return_url');
  });
});

describe('POST /api/v1/stripe/checkout — locale-prefixed success/cancel URLs (SP-A D5)', () => {
  it('prefixes both URLs with /es for ES callers (authenticated)', async () => {
    const res = await POST(makeRequest({ locale: 'es' }));
    expect(res.status).toBe(200);

    const callArg = mocks.mockSessionsCreate.mock.calls[0][0];
    expect(callArg.success_url).toBe(
      'https://estrevia.app/es/checkout/complete?session_id={CHECKOUT_SESSION_ID}',
    );
    expect(callArg.cancel_url).toBe('https://estrevia.app/es/pricing');
  });

  it('keeps EN URLs unprefixed (byte-identical to current behavior)', async () => {
    const res = await POST(makeRequest({ locale: 'en' }));
    expect(res.status).toBe(200);

    const callArg = mocks.mockSessionsCreate.mock.calls[0][0];
    expect(callArg.success_url).toBe(
      'https://estrevia.app/checkout/complete?session_id={CHECKOUT_SESSION_ID}',
    );
    expect(callArg.cancel_url).toBe('https://estrevia.app/pricing');
  });

  it('keeps URLs unprefixed when locale is omitted', async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(200);

    const callArg = mocks.mockSessionsCreate.mock.calls[0][0];
    expect(callArg.success_url).toBe(
      'https://estrevia.app/checkout/complete?session_id={CHECKOUT_SESSION_ID}',
    );
    expect(callArg.cancel_url).toBe('https://estrevia.app/pricing');
  });

  it('prefixes both URLs with /es for ES callers (anonymous branch)', async () => {
    mocks.mockAuth.mockResolvedValue({ userId: null });
    mocks.mockCookieGet.mockReturnValue({ value: 'anon_abc' });

    const res = await POST(makeRequest({ locale: 'es' }));
    expect(res.status).toBe(200);

    const callArg = mocks.mockSessionsCreate.mock.calls[0][0];
    expect(callArg.success_url).toBe(
      'https://estrevia.app/es/checkout/complete?session_id={CHECKOUT_SESSION_ID}',
    );
    expect(callArg.cancel_url).toBe('https://estrevia.app/es/pricing');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/api/v1/stripe/checkout/__tests__/route.test.ts`
Expected: FAIL — `metadata.return_url` is undefined (schema strips the field); `success_url` for ES has no `/es` prefix.

- [ ] **Step 3: Implement in `route.ts`**

1. Schema (lines 35-46) — add `returnUrl` after the `coupon` line:

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
  // A/B test coupon — only allowlisted values accepted (see ALLOWED_COUPON_CODES)
  coupon: z.enum(ALLOWED_COUPON_CODES).optional(),
  // Post-purchase return target — same-origin, single-slash-rooted path only
  // (e.g. /tarot/celtic-cross). .catch(undefined) degrades an invalid value to
  // absent instead of failing the whole parse: checkout must never break over
  // a redirect hint. 500-char cap = Stripe metadata value limit.
  returnUrl: z.string().max(500).regex(/^\/(?!\/)/).optional().catch(undefined),
});
```

2. Parse block (lines 126-144) — capture `returnUrl` and exclude it from the UTM passthrough:

```ts
  let plan: 'pro_monthly' | 'pro_annual' = 'pro_annual';
  let localeFromBody: 'en' | 'es' | undefined = undefined;
  let returnUrl: string | undefined = undefined;
  let utm: Record<string, string> = {};
  let couponCode: AllowedCouponCode | undefined = undefined;
  try {
    const body = await request.json();
    const parsed = checkoutBodySchema.parse(body);
    plan = parsed.plan;
    localeFromBody = parsed.locale;
    returnUrl = parsed.returnUrl;
    couponCode = parsed.coupon;
    utm = Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] =>
          entry[0] !== 'plan' &&
          entry[0] !== 'locale' &&
          entry[0] !== 'coupon' &&
          entry[0] !== 'returnUrl' &&
          entry[1] !== undefined,
      ),
    );
  } catch {
    plan = 'pro_annual';
  }
  // Normalize trivially-useless return targets to absent. CheckoutStartClient
  // ALWAYS POSTs returnUrl (default '/'), and PricingUpgradeButton's auth-failure
  // fallback routes through /checkout/start?return=%2Fpricing — storing those
  // would land payers on the marketing landing page (ES payers on EN '/') or
  // back on /pricing instead of the default localized /chart.
  // Drops: '/', '/es', '/es/', '/pricing', '/es/pricing'.
  if (returnUrl && /^\/(es\/?)?(pricing)?$/.test(returnUrl)) returnUrl = undefined;
```

3. After the `appUrl` const (line 186), add:

```ts
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://estrevia.app';
  // Locale-prefixed success/cancel URLs. next-intl localePrefix is 'as-needed':
  // EN lives at root (unchanged), ES under /es — so ES payers stay in Spanish
  // through Checkout success AND cancel instead of landing on EN /pricing.
  const localePath = localeFromBody === 'es' ? '/es' : '';
```

4. Authenticated branch — session metadata (lines 281-285 become):

```ts
          metadata: {
            clerkUserId: userId,
            ...utm,
            ...(localeFromBody ? { locale: localeFromBody } : {}),
            ...(returnUrl ? { return_url: returnUrl } : {}),
          },
```

(`subscription_data.metadata` at :288-292 stays unchanged — `/checkout/complete` reads the SESSION metadata.)

5. Authenticated branch — URLs (lines 294-295 become):

```ts
          success_url: `${appUrl}${localePath}/checkout/complete?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${appUrl}${localePath}/pricing`,
```

6. Anonymous branch — metadata (after line 372 `if (localeFromBody) metadata.locale = localeFromBody;` add):

```ts
    if (returnUrl) metadata.return_url = returnUrl;
```

(The anon branch reuses the same `metadata` object for `subscription_data.metadata` — the extra key there is harmless.)

7. Anonymous branch — URLs (lines 408-409, now shifted by the edits above, become):

```ts
        success_url: `${appUrl}${localePath}/checkout/complete?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}${localePath}/pricing`,
```

- [ ] **Step 4: Run all checkout route tests to verify pass + no regressions**

Run: `npx vitest run src/app/api/v1/stripe/checkout/__tests__/`
Expected: PASS — all three files (route.test.ts incl. 12 new tests, anonymous.test.ts, findOrPrepareCustomer.test.ts). The pre-existing "omits all UTM keys from metadata when body is empty" test (route.test.ts:183) still passes because `returnUrl` is excluded from the UTM filter and the spread adds no key when undefined.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/v1/stripe/checkout/route.ts src/app/api/v1/stripe/checkout/__tests__/route.test.ts
git commit -m "feat(sp-a/T1): returnUrl into session metadata + locale-prefixed success/cancel URLs"
```

---

### Task 2: /checkout/complete — Redis ticket, resolved redirect target, real i18n strings (D2 + D3 + D4)

**Files:**
- Modify: `src/app/[locale]/checkout/complete/page.tsx` (full-flow rewrite: header comment, `waitForTicket` :41-55, redirect target :67-71, namespace :73, client props :89)
- Modify: `src/app/[locale]/checkout/complete/CheckoutCompleteClient.tsx` (Props :7-9, namespace :21, `redirectWithTicket` :28-31, effect deps :85)
- Modify: `src/app/api/v1/checkout/recover/route.ts` (stale comment, line 17)
- Modify: `src/app/api/v1/checkout/session-status/route.ts` (stale comment, line 6)
- Test: `src/app/[locale]/checkout/complete/__tests__/page.test.tsx` (REWRITE — currently encodes the dead `metadata.signInTicket` behavior)
- Test: `src/app/[locale]/checkout/complete/__tests__/CheckoutCompleteClient.test.tsx` (update for prop + targets)

**Interfaces:**
- Consumes: `getCheckoutTicket(sessionId): Promise<string | null>` from `@/shared/lib/checkout-ticket` (Redis key `checkout_ticket:<session_id>`, written by the Stripe webhook and `/recover`); ONE `stripe.checkout.sessions.retrieve(sessionId)` for `metadata.return_url`; route `params.locale` for the localized default.
- Produces: `CheckoutCompleteClient` Props gain `redirectTarget: string` — the server resolves it once (D2: `metadata.return_url` → else localized `/chart`) and the client never re-derives. i18n namespace at both call sites becomes `pricingPage.checkout.complete` (keys exist in both message files; NO message changes).
- Success criteria encoded in tests: ≤1 Stripe GET, 0 metadata polls, no raw i18n keys.

- [ ] **Step 1: Rewrite the page test (encodes the NEW contract)**

Replace the entire contents of `src/app/[locale]/checkout/complete/__tests__/page.test.tsx` with:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const { getCheckoutTicketMock, sessionsRetrieveMock, redirectMock } = vi.hoisted(() => ({
  getCheckoutTicketMock: vi.fn(),
  sessionsRetrieveMock: vi.fn(),
  redirectMock: vi.fn().mockImplementation(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));

// The ticket lives ONLY in Redis (checkout-ticket.ts) since de39cee — the page
// must never poll Stripe metadata for it.
vi.mock('@/shared/lib/checkout-ticket', () => ({
  getCheckoutTicket: getCheckoutTicketMock,
}));
vi.mock('@/shared/lib/stripe', () => ({
  getStripe: () => ({ checkout: { sessions: { retrieve: sessionsRetrieveMock } } }),
}));
vi.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => redirectMock(...args),
}));
// Namespace-echoing translator: a regression back to the broken
// 'checkout.complete' namespace changes the rendered text and fails assertions.
vi.mock('next-intl/server', () => ({
  getTranslations: async (ns: string) => (key: string) => `${ns}.${key}`,
  getLocale: async () => 'en',
}));
// Stub the client fallback so the test can capture the redirectTarget prop
// without running its 30s poll loop.
vi.mock('../CheckoutCompleteClient', () => ({
  CheckoutCompleteClient: ({
    sessionId,
    redirectTarget,
  }: {
    sessionId: string;
    redirectTarget: string;
  }) => <div data-testid="client-stub" data-session={sessionId} data-target={redirectTarget} />,
}));

import CheckoutCompletePage from '../page';

function pageProps(sessionId: string | undefined, locale = 'en') {
  return {
    searchParams: Promise.resolve(sessionId ? { session_id: sessionId } : {}),
    params: Promise.resolve({ locale }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  redirectMock.mockImplementation(() => {
    throw new Error('NEXT_REDIRECT');
  });
  sessionsRetrieveMock.mockResolvedValue({ id: 'cs_test_1', metadata: {} });
});

describe('/checkout/complete page (SP-A D2/D3/D4)', () => {
  it('redirects to sign-in with redirect_url = metadata.return_url when the Redis ticket is ready', async () => {
    getCheckoutTicketMock.mockResolvedValue('ticket_xyz');
    sessionsRetrieveMock.mockResolvedValue({
      id: 'cs_test_1',
      metadata: { return_url: '/tarot/celtic-cross' },
    });

    await expect(CheckoutCompletePage(pageProps('cs_test_1'))).rejects.toThrow('NEXT_REDIRECT');

    expect(redirectMock).toHaveBeenCalledWith(
      '/sign-in?__clerk_ticket=ticket_xyz&redirect_url=%2Ftarot%2Fceltic-cross',
    );
    // Success criterion: exactly ONE Stripe GET (metadata read), zero polls.
    expect(sessionsRetrieveMock).toHaveBeenCalledTimes(1);
  });

  it('defaults to /chart when metadata has no return_url (EN)', async () => {
    getCheckoutTicketMock.mockResolvedValue('ticket_xyz');

    await expect(CheckoutCompletePage(pageProps('cs_test_1', 'en'))).rejects.toThrow('NEXT_REDIRECT');

    expect(redirectMock).toHaveBeenCalledWith(
      '/sign-in?__clerk_ticket=ticket_xyz&redirect_url=%2Fchart',
    );
  });

  it('defaults to /es/chart for the ES route locale', async () => {
    getCheckoutTicketMock.mockResolvedValue('ticket_xyz');

    await expect(CheckoutCompletePage(pageProps('cs_test_1', 'es'))).rejects.toThrow('NEXT_REDIRECT');

    expect(redirectMock).toHaveBeenCalledWith(
      '/sign-in?__clerk_ticket=ticket_xyz&redirect_url=%2Fes%2Fchart',
    );
  });

  it('re-validates return_url server-side: an absolute URL in metadata falls back to /chart', async () => {
    getCheckoutTicketMock.mockResolvedValue('ticket_xyz');
    sessionsRetrieveMock.mockResolvedValue({
      id: 'cs_test_1',
      metadata: { return_url: 'https://evil.example/phish' },
    });

    await expect(CheckoutCompletePage(pageProps('cs_test_1'))).rejects.toThrow('NEXT_REDIRECT');

    expect(redirectMock).toHaveBeenCalledWith(
      '/sign-in?__clerk_ticket=ticket_xyz&redirect_url=%2Fchart',
    );
  });

  it('a failed Stripe session fetch is non-fatal — redirects to /chart', async () => {
    getCheckoutTicketMock.mockResolvedValue('ticket_xyz');
    sessionsRetrieveMock.mockRejectedValue(new Error('stripe down'));

    await expect(CheckoutCompletePage(pageProps('cs_test_1'))).rejects.toThrow('NEXT_REDIRECT');

    expect(redirectMock).toHaveBeenCalledWith(
      '/sign-in?__clerk_ticket=ticket_xyz&redirect_url=%2Fchart',
    );
  });

  it('no ticket → renders pricingPage.checkout.complete strings and passes redirectTarget to the client', async () => {
    getCheckoutTicketMock.mockResolvedValue(null);
    sessionsRetrieveMock.mockResolvedValue({
      id: 'cs_test_1',
      metadata: { return_url: '/synastry' },
    });

    const result = await CheckoutCompletePage(pageProps('cs_test_1'));
    render(result);

    // Real namespace, not raw 'checkout.complete.*' keys (D4).
    expect(screen.getByText('pricingPage.checkout.complete.title')).toBeTruthy();
    expect(screen.getByText('pricingPage.checkout.complete.description')).toBeTruthy();

    const stub = screen.getByTestId('client-stub');
    expect(stub.getAttribute('data-session')).toBe('cs_test_1');
    expect(stub.getAttribute('data-target')).toBe('/synastry');
  }, 10_000); // Redis poll budget = 5s

  it('redirects to /pricing?error=session_not_found when session_id missing', async () => {
    await expect(CheckoutCompletePage(pageProps(undefined))).rejects.toThrow('NEXT_REDIRECT');
    expect(redirectMock).toHaveBeenCalledWith('/pricing?error=session_not_found');
    expect(sessionsRetrieveMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npx vitest run "src/app/[locale]/checkout/complete/__tests__/page.test.tsx"`
Expected: FAIL — the page never calls `getCheckoutTicket` (redirects don't happen / wrong `redirect_url=%2Fsettings`), fallback renders `checkout.complete.title` not `pricingPage.checkout.complete.title`.

- [ ] **Step 3: Rewrite `page.tsx`**

Replace the entire contents of `src/app/[locale]/checkout/complete/page.tsx` with:

```tsx
/**
 * /checkout/complete — public post-payment landing page.
 *
 * Outside the (app) route group so anonymous users can reach it without
 * Clerk middleware redirecting to /sign-in first.
 *
 * Server-component flow:
 *   1. Read ?session_id=cs_xxx
 *   2. In parallel: poll Redis for the Clerk sign-in ticket (written by the
 *      Stripe webhook / recover route via checkout-ticket.ts) for up to 5s,
 *      and fetch the Stripe session ONCE to resolve the post-sign-in target
 *      (metadata.return_url — the page that made them pay — or the localized
 *      /chart; never /settings).
 *   3a. If ticket found: server-redirect to /sign-in?__clerk_ticket=…&redirect_url=<target>
 *   3b. If not found: render <CheckoutCompleteClient/> which polls the
 *       session-status endpoint every 2s for up to 30s, then falls back to
 *       a "check your email" message.
 *
 * Once Clerk consumes the ticket at /sign-in, the user lands on the resolved
 * target with a session cookie set; middleware then allows access normally.
 */

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { createMetadata } from '@/shared/seo';
import { getStripe } from '@/shared/lib/stripe';
import { getCheckoutTicket } from '@/shared/lib/checkout-ticket';
import { CheckoutCompleteClient } from './CheckoutCompleteClient';

const SERVER_POLL_MAX_MS = 5000;
const SERVER_POLL_INTERVAL_MS = 500;

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const tMeta = await getTranslations('pageMeta.checkoutComplete');
  return createMetadata({
    title: tMeta('title'),
    description: tMeta('description'),
    path: '/checkout/complete',
    locale: locale as 'en' | 'es',
    noIndex: true,
  });
}

/**
 * The webhook writes the ticket to Redis within seconds of payment — poll the
 * same store /session-status reads. Stripe session metadata has NOT carried
 * the ticket since de39cee (Clerk tokens exceed the 500-char metadata cap).
 */
async function waitForTicket(sessionId: string): Promise<string | null> {
  const deadline = Date.now() + SERVER_POLL_MAX_MS;
  while (Date.now() < deadline) {
    try {
      const ticket = await getCheckoutTicket(sessionId);
      if (ticket) return ticket;
    } catch {
      // Redis blip — same as ticket-absent; the client poller is the fallback layer.
    }
    await new Promise((r) => setTimeout(r, SERVER_POLL_INTERVAL_MS));
  }
  return null;
}

/**
 * Where the payer lands after sign-in: metadata.return_url (same-origin path,
 * validated at checkout AND re-checked here — metadata is dashboard-editable)
 * or the localized /chart. One Stripe GET; failure is never fatal.
 */
async function resolveRedirectTarget(sessionId: string, locale: string): Promise<string> {
  const fallback = locale === 'es' ? '/es/chart' : '/chart';
  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const returnUrl = session.metadata?.return_url;
    if (returnUrl && /^\/(?!\/)/.test(returnUrl)) return returnUrl;
  } catch {
    // Session lookup failed — the redirect hint degrades to /chart.
  }
  return fallback;
}

interface PageProps {
  searchParams: Promise<{ session_id?: string }>;
  params: Promise<{ locale: string }>;
}

export default async function CheckoutCompletePage({ searchParams, params }: PageProps) {
  const sp = await searchParams;
  const { locale } = await params;
  const sessionId = sp.session_id;
  if (!sessionId) redirect('/pricing?error=session_not_found');

  const [ticket, redirectTarget] = await Promise.all([
    waitForTicket(sessionId),
    resolveRedirectTarget(sessionId, locale),
  ]);
  if (ticket) {
    const target = `/sign-in?__clerk_ticket=${encodeURIComponent(ticket)}&redirect_url=${encodeURIComponent(redirectTarget)}`;
    redirect(target);
  }

  const t = await getTranslations('pricingPage.checkout.complete');
  return (
    <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center px-4">
      <div className="max-w-sm text-center">
        <div
          className="inline-block w-8 h-8 border-2 border-[#FFD700]/30 border-t-[#FFD700] rounded-full animate-spin mb-5"
          role="status"
          aria-label={t('title')}
        />
        <h1
          className="text-lg font-light text-white mb-2"
          style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)' }}
        >
          {t('title')}
        </h1>
        <p className="text-sm text-white/50 mb-6">{t('description')}</p>
        <CheckoutCompleteClient sessionId={sessionId} redirectTarget={redirectTarget} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Update `CheckoutCompleteClient.tsx`**

Three edits:

1. Props (lines 7-9):

```tsx
interface Props {
  sessionId: string;
  /** Resolved by the server (return_url metadata or localized /chart) — never re-derived here. */
  redirectTarget: string;
}
```

2. Component signature + namespace (lines 20-21):

```tsx
export function CheckoutCompleteClient({ sessionId, redirectTarget }: Props) {
  const t = useTranslations('pricingPage.checkout.complete');
```

3. `redirectWithTicket` (lines 28-31) and the effect dependency array (line 85):

```tsx
    function redirectWithTicket(ticket: string): void {
      const target = `/sign-in?__clerk_ticket=${encodeURIComponent(ticket)}&redirect_url=${encodeURIComponent(redirectTarget)}`;
      window.location.href = target;
    }
```

```tsx
  }, [sessionId, redirectTarget]);
```

- [ ] **Step 5: Update the client test**

In `src/app/[locale]/checkout/complete/__tests__/CheckoutCompleteClient.test.tsx`:

1. All four `render(<CheckoutCompleteClient sessionId="cs_test_1" />)` calls (lines 50, 88, 119, 143) become:

```tsx
    render(<CheckoutCompleteClient sessionId="cs_test_1" redirectTarget="/chart" />);
```

2. Both redirect assertions (lines 56-58 and 98-100) change `%2Fsettings` → `%2Fchart`:

```tsx
    expect(setLoc).toHaveBeenCalledWith(
      '/sign-in?__clerk_ticket=ticket_zzz&redirect_url=%2Fchart',
    );
```

```tsx
    expect(setLoc).toHaveBeenCalledWith(
      '/sign-in?__clerk_ticket=ticket_recovered&redirect_url=%2Fchart',
    );
```

3. Append a new test inside the describe block (encodes that the prop — not a hardcode — drives the target):

```tsx
  it('encodes a non-default redirectTarget into the sign-in URL', async () => {
    const setLoc = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        set href(v: string) {
          setLoc(v);
        },
      },
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { ready: true, ticket: 'ticket_zzz' } }),
    });

    render(
      <CheckoutCompleteClient sessionId="cs_test_1" redirectTarget="/tarot/celtic-cross" />,
    );

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);

    expect(setLoc).toHaveBeenCalledWith(
      '/sign-in?__clerk_ticket=ticket_zzz&redirect_url=%2Ftarot%2Fceltic-cross',
    );
  });
```

- [ ] **Step 6: Delete the stale metadata.signInTicket comments (D3 tail)**

In `src/app/api/v1/checkout/recover/route.ts` line 17, change:

```
 *   - Fast-path step skipping if signInTicket already in session metadata
```

to:

```
 *   - Fast-path step skipping if a ticket is already stored in Redis (checkout-ticket)
```

In `src/app/api/v1/checkout/session-status/route.ts` line 6, change:

```
 *   { ready: true,  ticket: '...' } when the webhook has stored a signInTicket
```

to:

```
 *   { ready: true,  ticket: '...' } when the webhook has stored a sign-in ticket
```

- [ ] **Step 7: Run both test files to verify pass**

Run: `npx vitest run "src/app/[locale]/checkout/complete/__tests__/"`
Expected: PASS (7 page tests + 5 client tests).

- [ ] **Step 8: Commit**

```bash
git add "src/app/[locale]/checkout/complete/page.tsx" "src/app/[locale]/checkout/complete/CheckoutCompleteClient.tsx" "src/app/[locale]/checkout/complete/__tests__/page.test.tsx" "src/app/[locale]/checkout/complete/__tests__/CheckoutCompleteClient.test.tsx" src/app/api/v1/checkout/recover/route.ts src/app/api/v1/checkout/session-status/route.ts
git commit -m "fix(sp-a/T2): /checkout/complete — Redis ticket wait, return_url|/chart redirect, real i18n strings"
```

---

### Task 3: PaidOnboardingEmail template (D6, part 1)

**Files:**
- Create: `src/emails/PaidOnboardingEmail.tsx`
- Test: `src/emails/__tests__/PaidOnboardingEmail.test.tsx`

**Interfaces:**
- Consumes: `EmailLayout` (WITHOUT `unsubscribeUrl` — transactional, exempt from the `COMPANY_POSTAL_ADDRESS` gate per `EmailLayout.tsx:28-38`) and `Button` from `src/emails/components/`.
- Produces: `default PaidOnboardingEmail({ locale }: { locale: 'en' | 'es' })` — activation nudge: what Pro unlocked + ONE CTA to the localized `/chart` (generate the AI reading). Consumed by Task 4's sender.
- House pattern (mirrors `PurchaseConfirmationEmail.tsx`): inline `STRINGS = { en, es }`, hardcoded `SITE_URL`, no next-intl.

- [ ] **Step 1: Write the failing test**

```tsx
// src/emails/__tests__/PaidOnboardingEmail.test.tsx
import { describe, it, expect } from 'vitest';
import { render } from '@react-email/render';
import PaidOnboardingEmail from '../PaidOnboardingEmail';

describe('PaidOnboardingEmail', () => {
  it('renders EN with the AI-reading CTA pointing at /chart', async () => {
    const html = await render(PaidOnboardingEmail({ locale: 'en' }));
    expect(html).toContain('Your chart has more to say');
    expect(html).toContain('Generate my AI reading');
    expect(html).toContain('https://estrevia.app/chart');
    expect(html).not.toContain('https://estrevia.app/es/chart');
  });

  it('renders ES (neutral LATAM, tú form) with the /es/chart CTA', async () => {
    const html = await render(PaidOnboardingEmail({ locale: 'es' }));
    expect(html).toContain('Tu carta tiene más que decir');
    expect(html).toContain('Generar mi lectura con IA');
    expect(html).toContain('https://estrevia.app/es/chart');
  });

  it('is transactional: renders WITHOUT COMPANY_POSTAL_ADDRESS set and has no unsubscribe link', async () => {
    const prev = process.env.COMPANY_POSTAL_ADDRESS;
    delete process.env.COMPANY_POSTAL_ADDRESS;
    try {
      const html = await render(PaidOnboardingEmail({ locale: 'en' }));
      expect(html.toLowerCase()).not.toContain('unsubscribe');
    } finally {
      if (prev !== undefined) process.env.COMPANY_POSTAL_ADDRESS = prev;
    }
  });

  it('produces non-empty plaintext fallback', async () => {
    const text = await render(PaidOnboardingEmail({ locale: 'en' }), { plainText: true });
    expect(text.length).toBeGreaterThan(50);
    expect(text).toContain('AI reading');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/emails/__tests__/PaidOnboardingEmail.test.tsx`
Expected: FAIL — `Cannot find module '../PaidOnboardingEmail'`

- [ ] **Step 3: Write the template**

```tsx
// src/emails/PaidOnboardingEmail.tsx
import { Heading, Text } from '@react-email/components';
import { EmailLayout } from './components/EmailLayout';
import { Button } from './components/Button';

interface Props {
  locale: 'en' | 'es';
}

const SITE_URL = 'https://estrevia.app';

// Transactional activation nudge sent ~24h after subscribing (paid-onboarding
// cron). No unsubscribeUrl — EmailLayout's CAN-SPAM postal-address gate applies
// only to commercial (unsubscribe-bearing) emails.
const STRINGS = {
  en: {
    preview: 'Your first AI reading is waiting — it takes two minutes.',
    heading: 'Your chart has more to say',
    intro:
      "You unlocked Estrevia Pro yesterday. The fastest way to feel the difference: generate your AI reading — a personal interpretation of your actual sidereal chart, not a generic horoscope.",
    how: 'Open your chart and press "Generate reading". About two minutes, and it stays saved to your account.',
    cta: 'Generate my AI reading',
    also: 'Also included in Pro: unlimited synastry, AI tarot spreads, and 240+ essays.',
  },
  es: {
    preview: 'Tu primera lectura con IA te espera — toma dos minutos.',
    heading: 'Tu carta tiene más que decir',
    intro:
      'Ayer desbloqueaste Estrevia Pro. La forma más rápida de notar la diferencia: genera tu lectura con IA — una interpretación personal de tu carta sideral real, no un horóscopo genérico.',
    how: 'Abre tu carta y presiona "Generar lectura". Toma unos dos minutos y queda guardada en tu cuenta.',
    cta: 'Generar mi lectura con IA',
    also: 'También incluido en Pro: sinastría ilimitada, tiradas de tarot con IA y más de 240 ensayos.',
  },
};

export default function PaidOnboardingEmail({ locale }: Props) {
  const t = STRINGS[locale];
  const chartUrl = `${SITE_URL}${locale === 'es' ? '/es' : ''}/chart`;
  return (
    <EmailLayout preview={t.preview} locale={locale}>
      <Heading style={{ fontSize: 28, marginBottom: 16 }}>{t.heading}</Heading>
      <Text style={{ fontSize: 16, lineHeight: 1.6, marginBottom: 16 }}>{t.intro}</Text>
      <Text style={{ fontSize: 15, lineHeight: 1.6, color: 'rgba(255,255,255,0.8)', marginBottom: 28 }}>
        {t.how}
      </Text>
      <Button href={chartUrl}>{t.cta}</Button>
      <Text style={{ fontSize: 13, lineHeight: 1.6, color: 'rgba(255,255,255,0.5)', marginTop: 28 }}>
        {t.also}
      </Text>
    </EmailLayout>
  );
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/emails/__tests__/PaidOnboardingEmail.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/emails/PaidOnboardingEmail.tsx src/emails/__tests__/PaidOnboardingEmail.test.tsx
git commit -m "feat(sp-a/T3): PaidOnboardingEmail template — EN/ES transactional activation nudge"
```

---

### Task 4: `'paid_onboarding'` email type + `sendPaidOnboardingEmail` (D6, part 2)

**Files:**
- Modify: `src/shared/lib/schema.ts` (`sentEmails.emailType` enum, lines 471-480)
- Modify: `src/shared/lib/email.ts` (import block :6/:22; `SUBJECTS` :49-134; new sender after `sendPurchaseConfirmationEmail` which ends ~line 223)
- Test: `src/shared/lib/__tests__/email-paid-onboarding.test.ts`

**Interfaces:**
- Consumes: `PaidOnboardingEmail` (Task 3); `wasSentWithin` + `recordSent` from `./sent-emails` (both exist; `wasSentWithin` gains no changes — the widened enum flows through its `EmailType` inferred type automatically).
- Produces: `sendPaidOnboardingEmail(params: { userId: string; email: string; locale: 'en' | 'es'; subscriptionId: string }): Promise<{ sent: boolean; reason?: string }>` — consumed by Task 5's cron. Throws on Resend `result.error` WITHOUT recording, so the cron retries next hour.
- Schema note: `emailType` is a Drizzle `text(..., { enum })` — **TypeScript-only, no DB constraint, no migration**. The one-shot partial UNIQUE index stays `('welcome','account_deletion')`-only (deliberately — avoids a migration; dedup is `wasSentWithin` + the cron's NOT EXISTS + Resend idempotencyKey). Do NOT run `db:generate`.

- [ ] **Step 1: Widen the schema enum**

In `src/shared/lib/schema.ts`, the `sentEmails.emailType` enum (lines 471-480) becomes:

```ts
  emailType: text('email_type', {
    enum: [
      'welcome',
      'purchase_confirmation',
      'subscription_canceled',
      'account_deletion',
      'trial_ending',
      're_engagement_28d',
      // TS-only enum (text column, no DB constraint) — adding a value needs no
      // migration. NOT covered by sent_emails_oneshot_idx; dedup lives in
      // wasSentWithin + the paid-onboarding cron's NOT EXISTS guard.
      'paid_onboarding',
    ],
  }).notNull(),
```

- [ ] **Step 2: Write the failing sender tests**

```ts
// src/shared/lib/__tests__/email-paid-onboarding.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// email.ts imports * as Sentry at module scope — mock it like every sibling
// test (email-curiosity-hook.test.ts:3) so importing '../email' never loads
// the real SDK.
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

type ResendResult =
  | { data: { id: string }; error: null }
  | { data: null; error: { name: string; message: string } };
const resendSendMock = vi.fn<
  (
    _payload: Record<string, unknown>,
    _opts?: Record<string, unknown>,
  ) => Promise<ResendResult>
>(async () => ({
  data: { id: 'resend_msg_123' },
  error: null,
}));
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: resendSendMock };
  },
}));

const wasSentWithinMock = vi.fn(async () => false);
const recordSentMock = vi.fn(async () => undefined);
vi.mock('@/shared/lib/sent-emails', () => ({
  tryInsertOneShot: vi.fn(async () => true),
  recordSent: recordSentMock,
  wasSentWithin: wasSentWithinMock,
}));

vi.mock('@/shared/lib/unsubscribe-token', () => ({
  signUnsubscribeToken: vi.fn(async (id: string) => `tok_${id}`),
  signLeadUnsubscribeToken: vi.fn(async (id: string) => `tok_${id}`),
}));

vi.mock('@/shared/lib/analytics', () => ({
  trackServerEvent: vi.fn(),
  AnalyticsEvent: new Proxy({}, { get: (_t, k) => String(k) }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  wasSentWithinMock.mockResolvedValue(false);
  resendSendMock.mockResolvedValue({ data: { id: 'resend_msg_123' }, error: null });
  vi.stubEnv('RESEND_API_KEY', 're_test_key_aaaaaaaaaaaaaaaaaa');
  vi.stubEnv('DRY_RUN', 'false');
});

const params = {
  userId: 'user_1',
  email: 'payer@example.com',
  locale: 'en' as const,
  subscriptionId: 'sub_123',
};

describe('sendPaidOnboardingEmail', () => {
  it('sends with a stable idempotency key and records the message id', async () => {
    const { sendPaidOnboardingEmail } = await import('../email');
    const res = await sendPaidOnboardingEmail(params);

    expect(res.sent).toBe(true);
    expect(resendSendMock).toHaveBeenCalledTimes(1);
    const [payload, opts] = resendSendMock.mock.calls[0];
    expect(payload.to).toBe('payer@example.com');
    expect(payload.subject).toBe('Your first AI reading is waiting');
    expect(payload.html).toContain('https://estrevia.app/chart');
    expect(opts).toMatchObject({ idempotencyKey: 'user_1:paid_onboarding:sub_123' });
    expect(recordSentMock).toHaveBeenCalledWith('user_1', 'paid_onboarding', 'resend_msg_123');
  });

  it('dedups via wasSentWithin — no Resend call, no record', async () => {
    wasSentWithinMock.mockResolvedValue(true);
    const { sendPaidOnboardingEmail } = await import('../email');
    const res = await sendPaidOnboardingEmail(params);

    expect(res).toEqual({ sent: false, reason: 'already_sent' });
    expect(resendSendMock).not.toHaveBeenCalled();
    expect(recordSentMock).not.toHaveBeenCalled();
  });

  it('throws on result.error and does NOT record (welcome-email lesson — retry next run)', async () => {
    resendSendMock.mockResolvedValue({
      data: null,
      error: { name: 'validation_error', message: 'invalid to' },
    });
    const { sendPaidOnboardingEmail } = await import('../email');

    await expect(sendPaidOnboardingEmail(params)).rejects.toThrow(/paid_onboarding/);
    expect(recordSentMock).not.toHaveBeenCalled();
  });

  it('DRY_RUN=true skips the send entirely', async () => {
    vi.stubEnv('DRY_RUN', 'true');
    const { sendPaidOnboardingEmail } = await import('../email');
    const res = await sendPaidOnboardingEmail(params);

    expect(res).toEqual({ sent: false, reason: 'dry_run' });
    expect(resendSendMock).not.toHaveBeenCalled();
  });

  it('ES locale uses the Spanish subject and the /es/chart CTA', async () => {
    const { sendPaidOnboardingEmail } = await import('../email');
    await sendPaidOnboardingEmail({ ...params, locale: 'es' });

    const [payload] = resendSendMock.mock.calls[0];
    expect(payload.subject).toBe('Tu primera lectura con IA te espera');
    expect(payload.html).toContain('https://estrevia.app/es/chart');
  });
});
```

- [ ] **Step 3: Run to verify fail**

Run: `npx vitest run src/shared/lib/__tests__/email-paid-onboarding.test.ts`
Expected: FAIL — `sendPaidOnboardingEmail` is not exported from `../email`.

- [ ] **Step 4: Implement in `email.ts`**

1. Import block — add after the `PurchaseConfirmationEmail` import (line 6):

```ts
import PaidOnboardingEmail from '@/emails/PaidOnboardingEmail';
```

and extend the sent-emails import (line 22):

```ts
import { tryInsertOneShot, recordSent, wasSentWithin } from './sent-emails';
```

2. `SUBJECTS` — add after the `purchase_confirmation` entry (line 57):

```ts
  paid_onboarding: {
    en: 'Your first AI reading is waiting',
    es: 'Tu primera lectura con IA te espera',
  },
```

3. New sender — insert immediately after `sendPurchaseConfirmationEmail` (after its closing `}` at ~line 223):

```ts
// ---------------------------------------------------------------------------
// sendPaidOnboardingEmail — one activation nudge ~24h after subscribing.
//
// Dedup layers: wasSentWithin 30d belt here + the paid-onboarding cron's
// NOT EXISTS query guard + the Resend idempotencyKey. result.error IS checked
// (the welcome-email lesson): a rejected send records nothing, so the user
// stays eligible and the next cron run retries.
// ---------------------------------------------------------------------------
const PAID_ONBOARDING_DEDUP_MS = 30 * 24 * 60 * 60 * 1000;

export async function sendPaidOnboardingEmail(params: {
  userId: string;
  email: string;
  locale: 'en' | 'es';
  subscriptionId: string;
}): Promise<{ sent: boolean; reason?: string }> {
  if (process.env.DRY_RUN === 'true') {
    console.info('[email] paid_onboarding DRY_RUN — skipping send', { userId: params.userId });
    return { sent: false, reason: 'dry_run' };
  }

  const already = await wasSentWithin(params.userId, 'paid_onboarding', PAID_ONBOARDING_DEDUP_MS);
  if (already) return { sent: false, reason: 'already_sent' };

  const html = await render(PaidOnboardingEmail({ locale: params.locale }));
  const text = await render(PaidOnboardingEmail({ locale: params.locale }), { plainText: true });

  const result = await getResend().emails.send(
    {
      from: FROM_ADDRESS,
      to: params.email,
      subject: SUBJECTS.paid_onboarding[params.locale],
      html,
      text,
      headers: {
        'List-Unsubscribe': `<${SETTINGS_URL(params.locale)}>`,
      },
    },
    { idempotencyKey: `${params.userId}:paid_onboarding:${params.subscriptionId}` },
  );
  if (result.error) {
    // Do NOT recordSent — no row means the next cron run retries this user.
    throw new Error(`Resend rejected paid_onboarding send: ${result.error.message}`);
  }
  await recordSent(params.userId, 'paid_onboarding', result.data?.id ?? null);
  return { sent: true };
}
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run src/shared/lib/__tests__/email-paid-onboarding.test.ts src/shared/lib/__tests__/sent-emails.test.ts && npm run typecheck`
Expected: PASS (5 new tests; sent-emails tests unaffected by the enum widening); typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/shared/lib/schema.ts src/shared/lib/email.ts src/shared/lib/__tests__/email-paid-onboarding.test.ts
git commit -m "feat(sp-a/T4): sendPaidOnboardingEmail + paid_onboarding sent_emails type (TS-only, no migration)"
```

---

### Task 5: Hourly paid-onboarding cron + vercel.json registration (D6, part 3)

**Files:**
- Create: `src/app/api/cron/paid-onboarding/route.ts`
- Modify: `vercel.json` (crons array — currently 14 entries, ends with `cart-abandon-daily`)
- Test: `src/app/api/cron/paid-onboarding/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `sendPaidOnboardingEmail` (Task 4); `assertCronAuth` from `@/shared/lib/cron-auth`; `users` + `sentEmails` from schema.
- Produces: `GET /api/cron/paid-onboarding` (CRON_SECRET-protected) returning `{ ok, processed, sent, skipped, errors }` — modeled on `trial-expiration/route.ts`.
- Window (spec D6): a `purchase_confirmation` row in `sent_emails` aged 20–44h anchors the send (~T+24h; the wide window tolerates missed cron runs, the NOT EXISTS guard caps at exactly one send per payer, ever). Skips: `subscription_status NOT IN ('trialing','active')`, `stripe_subscription_id IS NULL`, `email_undeliverable = true`.
- Middleware: `/api/cron/:path*` wildcard already matches the new path (`src/middleware.ts:196`) — no middleware change.

- [ ] **Step 1: Write the failing tests**

```ts
// src/app/api/cron/paid-onboarding/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// Hoist mocks before imports (same layout as re-engagement cron test)
// ---------------------------------------------------------------------------
const sendPaidOnboardingMock = vi.hoisted(() => vi.fn());
vi.mock('@/shared/lib/email', () => ({
  sendPaidOnboardingEmail: sendPaidOnboardingMock,
}));

// db mock — candidates come from .select().from().innerJoin().where().limit()
const dbSelectMock = vi.hoisted(() => vi.fn());
vi.mock('@/shared/lib/db', () => ({
  getDb: () => ({ select: dbSelectMock }),
}));

vi.mock('@/shared/lib/cron-auth', () => ({
  assertCronAuth: vi.fn(() => null),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

import { GET } from '../route';
import { assertCronAuth } from '@/shared/lib/cron-auth';

function makeCronRequest(): Request {
  return new Request('http://localhost/api/cron/paid-onboarding', {
    method: 'GET',
    headers: { authorization: 'Bearer secret' },
  });
}

interface CandidateRow {
  userId: string;
  email: string;
  locale: 'en' | 'es';
  subscriptionId: string | null;
}

function mockCandidates(candidates: CandidateRow[]) {
  dbSelectMock.mockReturnValue({
    from: vi.fn().mockReturnValue({
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(candidates),
        }),
      }),
    }),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(assertCronAuth).mockReturnValue(null);
  sendPaidOnboardingMock.mockResolvedValue({ sent: true });
});

describe('GET /api/cron/paid-onboarding', () => {
  it('sends to each candidate with the right params and counts sent', async () => {
    mockCandidates([
      { userId: 'u1', email: 'a@x.test', locale: 'en', subscriptionId: 'sub_1' },
      { userId: 'u2', email: 'b@x.test', locale: 'es', subscriptionId: 'sub_2' },
    ]);

    const res = await GET(makeCronRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.sent).toBe(2);
    expect(body.skipped).toBe(0);
    expect(sendPaidOnboardingMock).toHaveBeenCalledWith({
      userId: 'u1',
      email: 'a@x.test',
      locale: 'en',
      subscriptionId: 'sub_1',
    });
    expect(sendPaidOnboardingMock).toHaveBeenCalledWith({
      userId: 'u2',
      email: 'b@x.test',
      locale: 'es',
      subscriptionId: 'sub_2',
    });
  });

  it('counts sender-level skips ({ sent: false }) as skipped, not sent', async () => {
    mockCandidates([
      { userId: 'u1', email: 'a@x.test', locale: 'en', subscriptionId: 'sub_1' },
    ]);
    sendPaidOnboardingMock.mockResolvedValue({ sent: false, reason: 'already_sent' });

    const res = await GET(makeCronRequest());
    const body = await res.json();

    expect(body.sent).toBe(0);
    expect(body.skipped).toBe(1);
  });

  it('isolates per-user failures — loop continues, error recorded, still 200', async () => {
    mockCandidates([
      { userId: 'u1', email: 'a@x.test', locale: 'en', subscriptionId: 'sub_1' },
      { userId: 'u2', email: 'b@x.test', locale: 'es', subscriptionId: 'sub_2' },
    ]);
    sendPaidOnboardingMock
      .mockRejectedValueOnce(new Error('Resend rejected paid_onboarding send: rate limit'))
      .mockResolvedValueOnce({ sent: true });

    const res = await GET(makeCronRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.sent).toBe(1);
    expect(body.errors).toHaveLength(1);
    expect(sendPaidOnboardingMock).toHaveBeenCalledTimes(2);
  });

  it('attempts a payer only once per run even with duplicate rows in the window', async () => {
    // Edge: a retried webhook can leave two purchase_confirmation rows.
    mockCandidates([
      { userId: 'u1', email: 'a@x.test', locale: 'en', subscriptionId: 'sub_1' },
      { userId: 'u1', email: 'a@x.test', locale: 'en', subscriptionId: 'sub_1' },
    ]);

    const res = await GET(makeCronRequest());
    const body = await res.json();

    expect(body.sent).toBe(1);
    expect(sendPaidOnboardingMock).toHaveBeenCalledTimes(1);
  });

  it('returns 401 when cron auth fails — no DB query, no sends', async () => {
    vi.mocked(assertCronAuth).mockReturnValueOnce(
      NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 }),
    );

    const res = await GET(makeCronRequest());

    expect(res.status).toBe(401);
    expect(dbSelectMock).not.toHaveBeenCalled();
    expect(sendPaidOnboardingMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run src/app/api/cron/paid-onboarding/__tests__/route.test.ts`
Expected: FAIL — `Cannot find module '../route'`

- [ ] **Step 3: Write the cron route**

```ts
// src/app/api/cron/paid-onboarding/route.ts
/**
 * GET /api/cron/paid-onboarding
 *
 * Vercel Cron — runs hourly at :30.
 *
 * Sends the paid-onboarding activation email (~T+24h after subscribing):
 * one nudge toward generating the AI reading on /chart. Anchor = the user's
 * purchase_confirmation row in sent_emails, aged 20–44h. The wide window
 * tolerates missed cron runs without spamming — the NOT EXISTS guard below
 * caps it at exactly one send per payer, ever.
 *
 * Skip conditions:
 *   - subscription_status not in ('trialing','active') (canceled during trial)
 *   - stripe_subscription_id IS NULL (incomplete checkout)
 *   - email_undeliverable = true
 *   - a paid_onboarding row already exists in sent_emails (any age)
 *
 * Idempotency: NOT EXISTS query guard + wasSentWithin inside the sender +
 * Resend idempotencyKey. A failed send records nothing → retried next hour
 * while still inside the window. DRY_RUN gate applies (in the sender).
 *
 * Protected by CRON_SECRET (same as all other crons).
 */

import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import { and, eq, gt, inArray, isNotNull, lt, sql } from 'drizzle-orm';
import { getDb } from '@/shared/lib/db';
import { users, sentEmails } from '@/shared/lib/schema';
import { assertCronAuth } from '@/shared/lib/cron-auth';
import { sendPaidOnboardingEmail } from '@/shared/lib/email';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

const HOUR_MS = 60 * 60 * 1000;
// purchase_confirmation went out 20–44h ago (~T+24h send)
const WINDOW_MIN_AGE_MS = 20 * HOUR_MS;
const WINDOW_MAX_AGE_MS = 44 * HOUR_MS;

export async function GET(request: Request): Promise<NextResponse> {
  const authError = assertCronAuth(request);
  if (authError) return authError;

  const now = Date.now();
  const windowStart = new Date(now - WINDOW_MAX_AGE_MS);
  const windowEnd = new Date(now - WINDOW_MIN_AGE_MS);

  let processed = 0;
  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  try {
    const db = getDb();

    // -------------------------------------------------------------------
    // Candidates: purchase_confirmation in the 20–44h window, still on an
    // active/trialing sub, deliverable, never sent paid_onboarding.
    // -------------------------------------------------------------------
    const candidates = await db
      .select({
        userId: users.id,
        email: users.email,
        locale: users.locale,
        subscriptionId: users.stripeSubscriptionId,
      })
      .from(sentEmails)
      .innerJoin(users, eq(sentEmails.userId, users.id))
      .where(
        and(
          eq(sentEmails.emailType, 'purchase_confirmation'),
          gt(sentEmails.sentAt, windowStart),
          lt(sentEmails.sentAt, windowEnd),
          isNotNull(users.stripeSubscriptionId),
          inArray(users.subscriptionStatus, ['trialing', 'active']),
          eq(users.emailUndeliverable, false),
          // Alias needed: the outer FROM is already sent_emails.
          sql`NOT EXISTS (
            SELECT 1 FROM sent_emails se2
            WHERE se2.user_id = ${users.id}
              AND se2.email_type = 'paid_onboarding'
          )`,
        ),
      )
      .limit(200);

    console.info('[cron/paid-onboarding] candidates found', { count: candidates.length });

    // A payer with two purchase_confirmation rows in the window (retried
    // webhook edge) must still get exactly one attempt per run.
    const seen = new Set<string>();
    for (const candidate of candidates) {
      if (seen.has(candidate.userId)) continue;
      seen.add(candidate.userId);
      processed++;

      try {
        const result = await sendPaidOnboardingEmail({
          userId: candidate.userId,
          email: candidate.email,
          locale: candidate.locale,
          subscriptionId: candidate.subscriptionId!,
        });
        if (result.sent) {
          sent++;
        } else {
          skipped++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown';
        errors.push(`${candidate.userId} — ${msg}`);
        // Log userId only — never the email address (PII rule)
        console.error('[cron/paid-onboarding] send failed', {
          userId: candidate.userId,
          error: msg,
        });
        try {
          Sentry.captureException(err, { tags: { cron: 'paid-onboarding' } });
        } catch {
          // Sentry best-effort
        }
        // Continue — don't block other users
      }
    }
  } catch (fatalErr) {
    console.error('[cron/paid-onboarding] fatal error', {
      error: fatalErr instanceof Error ? fatalErr.message : 'unknown',
    });
    try {
      Sentry.captureException(fatalErr, { tags: { cron: 'paid-onboarding' } });
    } catch {
      // Sentry best-effort
    }
    // Return 200 — Vercel doesn't alert on cron 200; next run retries naturally
    return NextResponse.json(
      { ok: false, error: 'fatal', processed, sent, skipped },
      { status: 200 },
    );
  }

  console.info('[cron/paid-onboarding] complete', { processed, sent, skipped, errors: errors.length });
  return NextResponse.json({ ok: true, processed, sent, skipped, errors }, { status: 200 });
}
```

- [ ] **Step 4: Register the cron in `vercel.json`**

Add after the `cart-abandon-daily` entry (keep it last in the array). Minute `:30` — the four existing hourly crons all fire at `:00`; offsetting avoids stacking cold starts:

```json
    {
      "path": "/api/cron/cart-abandon-daily",
      "schedule": "0 7 * * *"
    },
    {
      "path": "/api/cron/paid-onboarding",
      "schedule": "30 * * * *"
    }
```

- [ ] **Step 5: Run tests to verify pass**

Run: `npx vitest run src/app/api/cron/paid-onboarding/__tests__/route.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add src/app/api/cron/paid-onboarding/route.ts src/app/api/cron/paid-onboarding/__tests__/route.test.ts vercel.json
git commit -m "feat(sp-a/T5): hourly paid-onboarding cron — T+24h activation nudge toward the AI reading"
```

---

### Task 6: Full local gate + deploy smoke + founder checklist (D7 + spec Testing/Success criteria)

**Files:** none (verification + ops; founder items are dashboard-only)

- [ ] **Step 1: Full test suite**

Run: `npx vitest run`
Expected: 0 failures (this plan adds ~33 tests and rewrites 3 in page.test.tsx; everything else untouched).

- [ ] **Step 2: Types + lint**

Run: `npm run typecheck && npm run lint`
Expected: typecheck clean; lint — no NEW issues in files this plan touched (`.claude/worktrees/**` noise is pre-existing).

- [ ] **Step 3: Push (founder-confirmed)**

Run `git log origin/main..HEAD --oneline`, show the founder the list; on explicit OK: `git push origin main`. Watch the Vercel deployment to READY, then confirm `/api/cron/paid-onboarding` appears in Vercel → project → Settings → Cron Jobs (schedule `30 * * * *`).

- [ ] **Step 4: Stripe test-mode E2E smoke (deploy gate — manual, per spec)**

1. From an EN tarot page (e.g. `/tarot` → Celtic Cross paywall), start checkout, pay with `4242 4242 4242 4242` → after `/checkout/complete` you land back on THAT tarot page (not `/settings`).
2. From `/pricing`, subscribe → land on `/chart`.
3. From `/es/pricing`, open Checkout and press the back arrow → land on `/es/pricing` (not EN `/pricing`).
4. On `/checkout/complete`, DevTools Network: 0 requests polling Stripe (the page makes its 1 session fetch server-side); fallback (if shown) displays real copy — on `/es/...` in Spanish ("Activando tu cuenta"), never raw `checkout.complete.*` keys.

- [ ] **Step 5: Founder checklist — Stripe Product naming (D7, dashboard-only)**

1. Verify what payers actually see (research: "Estrevia Premium" exists nowhere in the repo — it can only be the Stripe Product display name):

```bash
curl -s "https://api.stripe.com/v1/products?limit=10&active=true" -u "$STRIPE_SECRET_KEY:" | python3 -c "import sys,json; [print(p['id'], '·', p['name'], '·', (p.get('description') or '')[:80]) for p in json.load(sys.stdin)['data']]"
```

(Read-only GET; `STRIPE_SECRET_KEY` from `.env`.)

2. In the Stripe Dashboard → Product catalog, for the product behind `STRIPE_PRICE_ID_PRO_MONTHLY`/`STRIPE_PRICE_ID_PRO_ANNUAL`:
   - **Name → `Estrevia Pro`** (one consistent name from paywall to invoice — the app's i18n, emails, and settings page all already say "Pro").
   - **Description →** `Full sidereal birth chart with AI readings, unlimited synastry, AI tarot spreads, and 240+ essays.` (matches actual features; replaces any stale copy).
3. Re-run the curl from item 1 to confirm the rename took.

- [ ] **Step 6: Post-deploy paid-onboarding observability (T+1 day)**

- Confirm prod `DRY_RUN` is NOT `'true'` in Vercel env (it also gates the live trial/dunning senders, so it is expected unset — but the new sender honors it, so verify once).
- After the next real purchase +24h: `sent_emails` has exactly one `paid_onboarding` row for that user with `resend_message_id` populated; the email appears in Resend (remember: read `last_event`, not `opened_at` — `feedback_resend_lastevent_not_opened_at`).
- Cron logs at `:30` show `[cron/paid-onboarding] complete` with sane counts.

---

## Self-review notes

- **Spec coverage:** Goal 1 (returnUrl end-to-end, default localized /chart, never /settings) → T1 (D1) + T2 (D2); Goal 2 (ES stays Spanish through success AND cancel) → T1 (D5); Goal 3 (Redis single source + real strings) → T2 (D3 + D4, incl. stale-comment deletions in recover/session-status); Goal 4 (paid-onboarding email ~24h) → T3 + T4 + T5 (D6); Goal 5 / D7 (Stripe Product naming, dashboard-only) → T6 Step 5. Error-handling section: non-fatal returnUrl (zod `.catch` in T1 + re-check fallback in T2), Redis-unavailable = ticket-absent (T2 `waitForTicket` catch), cron per-user try/catch + `result.error` check (T4/T5). Testing section: checkout-route accept/reject/locale tests → T1; page rewrite replacing the dead-metadata tests → T2; cron window/dedup/undeliverable/error-isolation → T5 (window + undeliverable + status filters are encoded in the WHERE clause; the query itself is exercised via the mocked chain, and dedup "second run sends nothing" is covered by the NOT EXISTS guard + T4's `wasSentWithin` test + T5's per-run Set test); manual E2E smoke → T6 Step 4. Success criteria: tarot-return + /chart default (T1/T2 tests + T6 smoke), ES cancel → /es/pricing (T1 test + smoke), ≤1 Stripe GET / 0 metadata polls (T2 test asserts `retrieve` called exactly once), ES fallback copy (T2 namespace test + smoke), exactly-once `paid_onboarding` rows (T4+T5).
- **Deviations from spec:** (1) returnUrl length cap is **500**, not the spec's 512 — Stripe's metadata VALUE hard cap is 500 chars; a 501–512-char value would make `sessions.create` throw, violating the spec's own "checkout must not break over a redirect hint" rule. (2) D3's "delete the stale metadata.signInTicket comments" is implemented as one-line rewords (the surrounding comments correctly document the Redis flow and stay). (3) D6's "wasSentWithin pattern" is implemented as three layers — NOT EXISTS in the cron query (primary, ever-once semantics matching the "exactly once per payer" success criterion), `wasSentWithin(30d)` belt inside the sender, Resend idempotencyKey — and the sent-lead-emails claim/update intent (failed sends must stay retryable) is satisfied by recording ONLY after `result.error` is checked, so no row = retry next hour; no UNIQUE-index migration needed. (4) Server poll budget drops 8s → 5s per D3 ("max ~5s"), which also shrinks the fallback-test wall time. (5) New cron fires at `:30`, not `:00` — the four existing hourly crons all stack at `:00`.
- **Deliberately untouched hazards:** `natal_charts.userId` backfill for converted leads (spec non-goal — returnUrl carries context without ownership changes); plan-name copy ("Locked behind Star") → SP-E; the `/settings?already_subscribed=1` short-circuit URLs in the checkout route (route.ts:229/:243/:359) still point at unprefixed `/settings` — they are pre-checkout short-circuits for already-premium users, not the post-purchase minute, and next-intl middleware localizes on arrival; `PricingUpgradeButton` POSTs no `returnUrl` directly, but its auth-failure fallback routes through `/checkout/start?return=%2Fpricing` and `CheckoutStartClient` always POSTs `returnUrl` (default `'/'`) — the server-side normalization in T1 drops both, so /pricing payers and no-`?return` email-CTA payers get the /chart default per Goal 1; the anon branch's shared `metadata` object also puts `return_url` into `subscription_data.metadata` (harmless, noted in T1); EN success/cancel URLs stay byte-identical (no `/en` prefix — `localePrefix: 'as-needed'`).
