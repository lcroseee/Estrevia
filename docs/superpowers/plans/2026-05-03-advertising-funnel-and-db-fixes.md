# Advertising Funnel + DB Fixes — Parallel-Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-05-03-advertising-funnel-and-db-fixes-design.md`

**Goal:** Stop the false-positive `critical_drift` Telegram alert by populating the 6 PostHog funnel events the agent expects, and wire real Drizzle DB clients into the cron pipeline so spend-cap enforcement and decision audit log stop crashing on first Tier-1 pause attempt.

**Architecture:** Two independent fix-sets executed by 10 parallel agent tracks. Fix #1 instruments 3 missing events (`landing_view`, `user_registered`, `subscription_started`) and adds canonical-name mapping in `funnel-client.ts` so the existing `passport_reshared` and `paywall_opened` events satisfy the agent's expected `passport_shared` / `paywall_view`. Fix #2 replaces the `null as any` DI factory stubs in `triage-hourly`, `triage-daily`, and `retro-weekly` with `getDb()` from `@/shared/lib/db`, and adds the missing integration test that would have caught the null-DB bug.

**Tech Stack:** TypeScript strict, Next.js 16 App Router, React 19 client components, next-intl `useTranslations`/`useLocale`, posthog-js (client) + posthog-node (server) via `@/shared/lib/analytics`, Drizzle ORM (Neon), Vitest, Sentry.

---

## File structure

```
src/shared/lib/analytics.ts                                              [MODIFY] (Track 1)

src/app/[locale]/(marketing)/LandingViewTracker.tsx                      [NEW]    (Track 2)
src/app/[locale]/(marketing)/__tests__/LandingViewTracker.test.tsx       [NEW]    (Track 2)
src/app/[locale]/(marketing)/page.tsx                                    [MODIFY] (Track 3)

src/app/api/webhooks/clerk/route.ts                                      [MODIFY] (Track 4)
src/app/api/webhooks/clerk/__tests__/route.test.ts                       [NEW]    (Track 5)

src/app/api/webhooks/stripe/route.ts                                     [MODIFY] (Track 6)
src/app/api/webhooks/stripe/__tests__/route.test.ts                      [NEW]    (Track 7)

src/modules/advertising/posthog/funnel-client.ts                         [MODIFY] (Track 8)
src/modules/advertising/posthog/__tests__/funnel-client.test.ts          [MODIFY] (Track 8)

src/app/api/cron/advertising/triage-hourly/route.ts                      [MODIFY] (Track 9)
src/app/api/cron/advertising/triage-daily/route.ts                       [MODIFY] (Track 9)
src/app/api/cron/advertising/retro-weekly/route.ts                       [MODIFY] (Track 9)
src/app/api/cron/advertising/__tests__/cron-handlers.test.ts             [MODIFY] (Tracks 9 + 10)
```

13 files. ~200 added / ~30 removed.

---

## Parallel execution model — 10 agents in 3 waves

```
Wave 0 (3 agents, fully parallel — start now):
  ┌─ Track 1: enum additions (analytics.ts)              [tiny, ~5 min]
  ├─ Track 8: funnel-client canonical mapping            [single module, no deps]
  └─ Track 9: cron-route DB factory rewiring             [3 routes + cron-handlers.test mock update]

Wave 1 (4 agents, fully parallel — start when blocker completes):
  ┌─ Track 2: LandingViewTracker component + test         (blocked by 1)
  ├─ Track 4: Clerk webhook trackServerEvent fire         (blocked by 1)
  ├─ Track 6: Stripe webhook trackServerEvent fire        (blocked by 1)
  └─ Track 10: cron-handlers DB-injection integration test (blocked by 9)

Wave 2 (3 agents, fully parallel — start when blocker completes):
  ┌─ Track 3: wire LandingViewTracker into marketing page (blocked by 2)
  ├─ Track 5: Clerk webhook test                          (blocked by 4)
  └─ Track 7: Stripe webhook test                         (blocked by 6)

Aggregator (after all tracks):
  └─ Final typecheck + lint + full vitest run + manual cron smoke test
```

**Total wall-clock:** ~3 wave-cycles. Critical path = Track 1 → Track 2 → Track 3 (~30–45 min serially).

---

## Conventions for ALL agents

**Worktree isolation.** Each agent runs with `isolation: "worktree"` to avoid conflicting writes to `main`. The coordinator merges worktree changes into `main` after a wave completes (Wave 0 first, then Wave 1, then Wave 2). Direct-to-main is the project workflow (CLAUDE.md), but parallel execution requires per-agent worktrees so commits don't race.

**No agent commits to `main` directly.** Each agent commits inside its own worktree with the conventional-style scope (`feat(...)`, `fix(...)`, `test(...)`). Coordinator cherry-picks or fast-forwards into `main` in dependency order.

**TDD cycle for every track.** Write failing test → run to confirm fail → implement minimum → run to confirm pass → commit. No skipping the verify-fail step.

**Test framework:** Vitest. Run a single file with `npx vitest run path/to/file.test.ts`. Run all advertising/webhook tests with `npx vitest run src/modules/advertising src/app/api/cron/advertising src/app/api/webhooks src/app/[locale]/(marketing)`.

**Typecheck:** `npm run typecheck`. **Lint:** `npm run lint` — pre-existing baseline 785 errors, do NOT add new errors in advertising/webhook scope.

**Commit format:** match existing branch style. Examples for this work:
- `feat(advertising/funnel): instrument landing_view client event`
- `feat(webhooks/clerk): fire user_registered to PostHog`
- `feat(webhooks/stripe): fire subscription_started with UTM attribution`
- `feat(advertising/funnel): map canonical → real event names in HogQL`
- `fix(advertising/cron): wire real Drizzle DB into spend-cap and audit factories`
- `test(advertising/cron): integration test guards against null-DB regression`

**Never commit:** decrypted PII, API keys, or `.env*` files. PostHog event payloads in webhooks must contain only `userId`, plan/amount/UTM strings, `email_domain` — never the full email.

---

# Track 1 — Analytics enum additions

**Owner:** Wave 0, agent 1
**Blockers:** none
**Blocks:** Tracks 2, 4, 6
**Files:**
- Modify: `src/shared/lib/analytics.ts:133-159`

This is the foundation. Three string constants. No tests required — these are typed string aliases imported by other tracks. Once committed in worktree, Tracks 2/4/6 can pull and proceed.

- [ ] **Step 1: Open analytics.ts and locate the `AnalyticsEvent` const block**

The block is at `src/shared/lib/analytics.ts:133-159`. Add three new entries: `LANDING_VIEW`, `USER_REGISTERED`, `SUBSCRIPTION_STARTED`. Place them in the existing semantic groups (Funnel for landing/conversion, Auth for user_registered).

- [ ] **Step 2: Apply the edit**

```ts
export const AnalyticsEvent = {
  // Funnel — viral acquisition path (matches advertising agent's expected events)
  LANDING_VIEW: 'landing_view',
  // Chart
  CHART_CALCULATED: 'chart_calculated',
  CHART_SAVED: 'chart_saved',
  CHART_TOGGLE_SIDEREAL: 'chart_toggle_sidereal',
  // Passport / viral
  PASSPORT_CREATED: 'passport_created',
  PASSPORT_VIEWED: 'passport_viewed',
  PASSPORT_CONVERTED: 'passport_converted',
  PASSPORT_RESHARED: 'passport_reshared',
  PASSPORT_DOWNLOADED: 'passport_downloaded',
  // Auth
  USER_SIGNED_UP: 'user_signed_up',
  USER_SIGNED_IN: 'user_signed_in',
  USER_REGISTERED: 'user_registered',
  // Conversion funnel — paywall → sign-up → checkout → Stripe
  PAYWALL_OPENED: 'paywall_opened',
  PAYWALL_TRIAL_CLICKED: 'paywall_trial_clicked',
  CHECKOUT_AUTH_REDIRECT: 'checkout_auth_redirect',
  CHECKOUT_AUTO_STARTED: 'checkout_auto_started',
  CHECKOUT_STRIPE_REDIRECTED: 'checkout_stripe_redirected',
  CHECKOUT_ERROR: 'checkout_error',
  SUBSCRIPTION_STARTED: 'subscription_started',
  // GDPR
  COOKIE_CONSENT_ACCEPTED: 'cookie_consent_accepted',
  COOKIE_CONSENT_DECLINED: 'cookie_consent_declined',
  DATA_EXPORT_REQUESTED: 'data_export_requested',
  ACCOUNT_DELETED: 'account_deleted',
} as const;
```

Use Edit tool with `old_string` matching the current `LANDING_VIEW`-absent block and `new_string` containing the new entries. The trailing `as const` and `export type AnalyticsEventName` line must remain unchanged.

**Why keep `USER_SIGNED_UP`?** Per spec "Known issues" section, `USER_SIGNED_UP` is a legacy artifact that's never fired. We're NOT removing it in this fix to minimize blast radius. `USER_REGISTERED` is the new canonical name expected by `funnel-client.ts`.

- [ ] **Step 3: Verify typecheck passes**

Run: `npm run typecheck`
Expected: PASS — no new errors. The new constants are type-safe additions to a `const` object.

- [ ] **Step 4: Commit**

```bash
git add src/shared/lib/analytics.ts
git commit -m "feat(analytics): add LANDING_VIEW, USER_REGISTERED, SUBSCRIPTION_STARTED enum entries"
```

- [ ] **Step 5: Notify coordinator** — Wave 0 / Track 1 complete. Tracks 2, 4, 6 can pull this commit and unblock.

---

# Track 2 — LandingViewTracker client component

**Owner:** Wave 1, agent 2
**Blockers:** Track 1 (uses `AnalyticsEvent.LANDING_VIEW`)
**Blocks:** Track 3
**Files:**
- Create: `src/app/[locale]/(marketing)/LandingViewTracker.tsx`
- Test: `src/app/[locale]/(marketing)/__tests__/LandingViewTracker.test.tsx`

A `'use client'` component with a single `useEffect` that fires `landing_view` once on mount with the current `locale` property. The marketing landing page is a Server Component (uses `getTranslations`, `getLocale`), so we cannot put `useEffect` directly there — Track 3 will import this tracker into the SC.

- [ ] **Step 1: Write the failing test**

Create `src/app/[locale]/(marketing)/__tests__/LandingViewTracker.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { LandingViewTracker } from '../LandingViewTracker';

vi.mock('@/shared/lib/analytics', () => ({
  trackEvent: vi.fn(),
  AnalyticsEvent: { LANDING_VIEW: 'landing_view' },
}));

import { trackEvent } from '@/shared/lib/analytics';

describe('LandingViewTracker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fires landing_view exactly once on mount with locale=en', () => {
    render(
      <NextIntlClientProvider locale="en" messages={{}}>
        <LandingViewTracker locale="en" />
      </NextIntlClientProvider>,
    );
    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith('landing_view', { locale: 'en' });
  });

  it('fires landing_view with locale=es when rendered in Spanish', () => {
    render(
      <NextIntlClientProvider locale="es" messages={{}}>
        <LandingViewTracker locale="es" />
      </NextIntlClientProvider>,
    );
    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith('landing_view', { locale: 'es' });
  });

  it('renders nothing visible (returns null)', () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={{}}>
        <LandingViewTracker locale="en" />
      </NextIntlClientProvider>,
    );
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/app/[locale]/(marketing)/__tests__/LandingViewTracker.test.tsx`
Expected: FAIL with `Cannot find module '../LandingViewTracker'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/app/[locale]/(marketing)/LandingViewTracker.tsx`:

```tsx
'use client';

import { useEffect } from 'react';
import { trackEvent, AnalyticsEvent } from '@/shared/lib/analytics';

/**
 * Fires `landing_view` once when the marketing landing page mounts.
 *
 * Why a separate component: the marketing page is a Server Component
 * (uses getTranslations/getLocale). useEffect requires a Client Component,
 * so we mount this tracker as a child of the SC. Standard Next.js App
 * Router pattern.
 *
 * The PostHog SDK respects cookie consent — if the user has not accepted
 * cookies, `posthog.capture()` is a no-op (handled inside trackEvent →
 * window.posthog guard).
 */
interface LandingViewTrackerProps {
  locale: 'en' | 'es';
}

export function LandingViewTracker({ locale }: LandingViewTrackerProps) {
  useEffect(() => {
    trackEvent(AnalyticsEvent.LANDING_VIEW, { locale });
    // Empty deps array → fires once per mount. Re-renders won't re-fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `npx vitest run src/app/[locale]/(marketing)/__tests__/LandingViewTracker.test.tsx`
Expected: PASS — all three test cases green.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/[locale]/(marketing)/LandingViewTracker.tsx \
        src/app/[locale]/(marketing)/__tests__/LandingViewTracker.test.tsx
git commit -m "feat(marketing): add LandingViewTracker client component for landing_view event"
```

- [ ] **Step 7: Notify coordinator** — Wave 1 / Track 2 complete. Track 3 can pull and unblock.

---

# Track 3 — Wire LandingViewTracker into marketing page

**Owner:** Wave 2, agent 3
**Blockers:** Track 2 (file `LandingViewTracker.tsx` must exist)
**Blocks:** none
**Files:**
- Modify: `src/app/[locale]/(marketing)/page.tsx`

Add the import and render the tracker once inside the existing JSX. Position right after `<JsonLdScript ... />` blocks — before any visible markup — so it mounts on every landing page hit.

- [ ] **Step 1: Read current marketing page imports**

The current import block is:
```ts
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Link } from '@/i18n/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { createMetadata, JsonLdScript, softwareAppSchema, howToSchema, faqSchema } from '@/shared/seo';
import { HeroCalculator } from '@/modules/astro-engine/components/HeroCalculator';
import { LandingAnimations } from './LandingAnimations';
import { NewFeatureCards } from './NewFeatureCards';
```

- [ ] **Step 2: Add `LandingViewTracker` import**

Edit `src/app/[locale]/(marketing)/page.tsx`. Append the import after `NewFeatureCards`:

```ts
import { LandingViewTracker } from './LandingViewTracker';
```

- [ ] **Step 3: Render tracker inside the page JSX**

The page's `return (...)` opens with `<>` then three `<JsonLdScript />` calls. After the third `<JsonLdScript schema={faqJsonLd} />` (around line 84), insert:

```tsx
      <LandingViewTracker locale={locale as 'en' | 'es'} />
```

The `locale` is already in scope at the top of the function body via `const locale = await getLocale();` — but the existing page does not extract `locale` outside `generateMetadata`. **Add this line at the top of `LandingPage()`** (right after `const t = await getTranslations('landing');`):

```ts
  const locale = await getLocale();
```

So the modified function header becomes:
```ts
export default async function LandingPage() {
  const t = await getTranslations('landing');
  const locale = await getLocale();
  // ...rest unchanged
```

And inside the JSX after the FAQ JsonLdScript:
```tsx
      <JsonLdScript schema={softwareAppSchema()} />
      <JsonLdScript schema={howToJsonLd} />
      <JsonLdScript schema={faqJsonLd} />

      <LandingViewTracker locale={locale as 'en' | 'es'} />
```

- [ ] **Step 4: Verify typecheck passes**

Run: `npm run typecheck`
Expected: PASS — `getLocale()` returns `string`, cast to the narrow `'en' | 'es'` matches the routing config (`src/i18n/routing.ts:4`: `locales: ['en', 'es']`).

- [ ] **Step 5: Manual smoke test (optional but recommended)**

```bash
npm run dev
# Open http://localhost:3000/ and http://localhost:3000/es/
# In browser DevTools → Network → filter "i.posthog.com" → confirm
# a POST to /e/ with event=landing_view fires within 1s of page load.
# (Requires a PostHog key in .env.local. If absent, just confirm no console errors.)
```

- [ ] **Step 6: Commit**

```bash
git add src/app/[locale]/(marketing)/page.tsx
git commit -m "feat(marketing): mount LandingViewTracker on landing page"
```

- [ ] **Step 7: Notify coordinator** — Wave 2 / Track 3 complete.

---

# Track 4 — Clerk webhook fires `user_registered`

**Owner:** Wave 1, agent 4
**Blockers:** Track 1 (uses `AnalyticsEvent.USER_REGISTERED`)
**Blocks:** Track 5
**Files:**
- Modify: `src/app/api/webhooks/clerk/route.ts`

Add `trackServerEvent` import and fire it inside the `user.created` branch after the DB insert succeeds. Wrap in try/catch so PostHog failure never propagates to a 500 (Clerk would retry → duplicate events).

- [ ] **Step 1: Add imports**

Top of `src/app/api/webhooks/clerk/route.ts`, append to the existing import block:

```ts
import { trackServerEvent, AnalyticsEvent } from '@/shared/lib/analytics';
```

- [ ] **Step 2: Modify the `user.created` branch**

Current code at `src/app/api/webhooks/clerk/route.ts:81-94`:

```ts
    if (eventType === 'user.created') {
      const email = data.email_addresses[0]?.email_address ?? '';
      await db
        .insert(users)
        .values({
          id: data.id,
          email,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoNothing(); // idempotent — safe to retry

      console.info('[clerk-webhook] user.created', { userId: data.id });
    }
```

Replace with:

```ts
    if (eventType === 'user.created') {
      const email = data.email_addresses[0]?.email_address ?? '';
      const emailDomain = email.includes('@') ? email.split('@')[1] : null;

      await db
        .insert(users)
        .values({
          id: data.id,
          email,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoNothing(); // idempotent — safe to retry

      console.info('[clerk-webhook] user.created', { userId: data.id });

      // Fire user_registered to PostHog so the advertising agent's funnel
      // reconciler can compare this against Meta clicks. Idempotency comes
      // from PostHog's $insert_id dedup — same event from a Clerk retry
      // collapses server-side. Wrapped in try/catch: PostHog being down must
      // never escalate to a 500 (Clerk would retry → duplicate users).
      try {
        trackServerEvent(data.id, AnalyticsEvent.USER_REGISTERED, {
          source: 'clerk_webhook',
          email_domain: emailDomain,
          $insert_id: `${data.id}:user_registered`,
        });
      } catch (phErr) {
        console.warn(
          '[clerk-webhook] PostHog user_registered fire failed (non-fatal)',
          phErr instanceof Error ? phErr.message : 'unknown',
        );
        try {
          const { captureException } = await import('@sentry/nextjs');
          captureException(phErr, {
            tags: { webhook: 'clerk', posthog: 'degraded' },
          });
        } catch {
          // Sentry capture is best-effort.
        }
      }
    }
```

**Why `email_domain` only, never `email`:** PII rule (CLAUDE.md) — "never log decrypted PII; never put PII in URLs, query params, error messages, or client state." Email domain is non-PII; full address is.

**Why `$insert_id`:** PostHog's server-side dedup key. If Clerk retries `user.created` due to a transient 500 elsewhere, PostHog collapses both events into one. Without it we'd inflate the `user_registered` count on every retry.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/webhooks/clerk/route.ts
git commit -m "feat(webhooks/clerk): fire user_registered to PostHog on user.created"
```

- [ ] **Step 5: Notify coordinator** — Wave 1 / Track 4 complete. Track 5 can pull and unblock.

---

# Track 5 — Clerk webhook test

**Owner:** Wave 2, agent 5
**Blockers:** Track 4 (route must already fire the event)
**Blocks:** none
**Files:**
- Create: `src/app/api/webhooks/clerk/__tests__/route.test.ts`

No existing tests for this webhook (verified by `find src/app/api/webhooks -name "*.test.ts"` returning empty). This file establishes the pattern. Mock svix `Webhook.verify`, mock `getDb`, mock `trackServerEvent`, then invoke `POST` with a fake `user.created` payload and assert.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/webhooks/clerk/__tests__/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mocks must come before route import.

const mockVerify = vi.fn();
vi.mock('svix', () => ({
  Webhook: vi.fn(() => ({ verify: mockVerify })),
}));

vi.mock('next/headers', () => ({
  headers: async () => new Map([
    ['svix-id', 'msg_test_001'],
    ['svix-timestamp', '1700000000'],
    ['svix-signature', 'v1,sig_test'],
  ]),
}));

const mockOnConflictDoNothing = vi.fn().mockResolvedValue(undefined);
const mockValues = vi.fn(() => ({ onConflictDoNothing: mockOnConflictDoNothing }));
const mockInsert = vi.fn(() => ({ values: mockValues }));
vi.mock('@/shared/lib/db', () => ({
  getDb: () => ({
    insert: mockInsert,
    update: vi.fn(() => ({ set: () => ({ where: vi.fn().mockResolvedValue(undefined) }) })),
    delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
  }),
}));

const mockTrackServerEvent = vi.fn();
vi.mock('@/shared/lib/analytics', () => ({
  trackServerEvent: mockTrackServerEvent,
  AnalyticsEvent: { USER_REGISTERED: 'user_registered' },
}));

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

import { POST } from '../route';

function makeReq(body: unknown): Request {
  return new Request('https://estrevia.app/api/webhooks/clerk', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  process.env.CLERK_WEBHOOK_SECRET = 'whsec_test_secret';
  mockVerify.mockReset();
  mockTrackServerEvent.mockReset();
  mockInsert.mockClear();
  mockValues.mockClear();
  mockOnConflictDoNothing.mockClear();
});

afterEach(() => {
  delete process.env.CLERK_WEBHOOK_SECRET;
});

describe('POST /api/webhooks/clerk — user_registered firing', () => {
  it('fires user_registered to PostHog on user.created with $insert_id and email_domain', async () => {
    mockVerify.mockReturnValue({
      type: 'user.created',
      data: {
        id: 'user_2abc123',
        email_addresses: [{ email_address: 'alice@example.com' }],
      },
    });

    const res = await POST(makeReq({}));
    expect(res.status).toBe(200);

    expect(mockTrackServerEvent).toHaveBeenCalledTimes(1);
    expect(mockTrackServerEvent).toHaveBeenCalledWith(
      'user_2abc123',
      'user_registered',
      {
        source: 'clerk_webhook',
        email_domain: 'example.com',
        $insert_id: 'user_2abc123:user_registered',
      },
    );
  });

  it('does NOT fire user_registered on user.updated', async () => {
    mockVerify.mockReturnValue({
      type: 'user.updated',
      data: {
        id: 'user_2abc123',
        email_addresses: [{ email_address: 'alice@example.com' }],
      },
    });

    const res = await POST(makeReq({}));
    expect(res.status).toBe(200);
    expect(mockTrackServerEvent).not.toHaveBeenCalled();
  });

  it('returns 200 even when PostHog throws — Clerk must not retry', async () => {
    mockVerify.mockReturnValue({
      type: 'user.created',
      data: {
        id: 'user_2err',
        email_addresses: [{ email_address: 'bob@test.io' }],
      },
    });
    mockTrackServerEvent.mockImplementationOnce(() => {
      throw new Error('PostHog timeout');
    });

    const res = await POST(makeReq({}));
    expect(res.status).toBe(200);
    // DB insert still ran:
    expect(mockOnConflictDoNothing).toHaveBeenCalled();
  });

  it('handles email without @ gracefully (email_domain=null)', async () => {
    mockVerify.mockReturnValue({
      type: 'user.created',
      data: {
        id: 'user_2no_email',
        email_addresses: [{ email_address: '' }],
      },
    });

    const res = await POST(makeReq({}));
    expect(res.status).toBe(200);
    expect(mockTrackServerEvent).toHaveBeenCalledWith(
      'user_2no_email',
      'user_registered',
      expect.objectContaining({ email_domain: null }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it goes green immediately**

Run: `npx vitest run src/app/api/webhooks/clerk/__tests__/route.test.ts`
Expected: PASS — Track 4's implementation is already in place. (This is "test after impl" because Track 4 ran first to unblock 5.) If FAIL, the failure surfaces a regression in Track 4's implementation — fix Track 4 before proceeding.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/webhooks/clerk/__tests__/route.test.ts
git commit -m "test(webhooks/clerk): cover user_registered firing + idempotency + PostHog failure"
```

- [ ] **Step 4: Notify coordinator** — Wave 2 / Track 5 complete.

---

# Track 6 — Stripe webhook fires `subscription_started`

**Owner:** Wave 1, agent 6
**Blockers:** Track 1 (uses `AnalyticsEvent.SUBSCRIPTION_STARTED`)
**Blocks:** Track 7
**Files:**
- Modify: `src/app/api/webhooks/stripe/route.ts`

Fire ONLY in `case 'checkout.session.completed'` (after successful upsert with `subscriptionTier: 'premium'`), NOT in `customer.subscription.updated` — the latter handles renewals/plan changes which would re-fire and inflate the count.

- [ ] **Step 1: Add imports**

Append to the existing import block at top of `src/app/api/webhooks/stripe/route.ts`:

```ts
import { trackServerEvent, AnalyticsEvent } from '@/shared/lib/analytics';
```

- [ ] **Step 2: Find the `checkout.session.completed` handler**

It's at `src/app/api/webhooks/stripe/route.ts:162-250`. The block ends with `console.info('[stripe-webhook] checkout.session.completed → premium activated', {...});` followed by `break;`.

- [ ] **Step 3: Insert the trackServerEvent call before the existing `console.info`**

Replace the tail of the block (from the `console.info` and `break`) with:

```ts
        // Fire subscription_started to PostHog so the agent's funnel
        // reconciler can attribute conversions back to Meta UTMs. Only
        // fired here (not in customer.subscription.updated) to avoid
        // counting renewals/plan changes as new conversions.
        // Idempotency: $insert_id keyed off subscription.id ensures Stripe
        // retries collapse server-side at PostHog. Wrapped in try/catch:
        // PostHog being down must never escalate to a 500 (Stripe would
        // retry → duplicate user upserts).
        try {
          const utm = (session.metadata ?? {}) as Record<string, string | undefined>;
          const amountTotal = session.amount_total ?? 0;
          const currency = session.currency ?? 'usd';
          trackServerEvent(clerkUserId, AnalyticsEvent.SUBSCRIPTION_STARTED, {
            plan,
            amount_usd: amountTotal / 100, // Stripe sends cents
            currency,
            stripe_subscription_id: stripeSubscriptionId,
            utm_source: utm.utm_source ?? null,
            utm_content: utm.utm_content ?? null, // ad_id by convention
            utm_campaign: utm.utm_campaign ?? null,
            $insert_id: `${stripeSubscriptionId ?? session.id}:subscription_started`,
          });
        } catch (phErr) {
          console.warn(
            '[stripe-webhook] PostHog subscription_started fire failed (non-fatal)',
            phErr instanceof Error ? phErr.message : 'unknown',
          );
          try {
            const { captureException } = await import('@sentry/nextjs');
            captureException(phErr, {
              tags: { webhook: 'stripe', posthog: 'degraded' },
            });
          } catch {
            // Sentry capture is best-effort.
          }
        }

        console.info('[stripe-webhook] checkout.session.completed → premium activated', {
          clerkUserId,
          stripeCustomerId,
          plan,
          subscriptionStatus,
          expiresAt,
        });
        break;
      }
```

**Why `session.metadata` and not `subscription.metadata`:** Stripe Checkout Sessions carry the UTMs as session metadata at create-time (set when the Checkout was created from the paywall flow). The Subscription object derived from the session does NOT inherit them by default. Reading from `session.metadata` is the right source.

**Why `amount_total / 100`:** Stripe amounts are in the smallest currency unit (cents for USD). The funnel needs USD for revenue dashboards.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS — `session.metadata` is `Stripe.Metadata | null`, the `?? {}` handles null. `amount_total` is `number | null`, `?? 0` handles null.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/webhooks/stripe/route.ts
git commit -m "feat(webhooks/stripe): fire subscription_started with UTM attribution on checkout completion"
```

- [ ] **Step 6: Notify coordinator** — Wave 1 / Track 6 complete. Track 7 can pull and unblock.

---

# Track 7 — Stripe webhook test

**Owner:** Wave 2, agent 7
**Blockers:** Track 6 (route must already fire the event)
**Blocks:** none
**Files:**
- Create: `src/app/api/webhooks/stripe/__tests__/route.test.ts`

No existing tests for this webhook. Establishes the pattern: mock `getStripe().webhooks.constructEvent`, mock `getDb`, mock `trackServerEvent`. Cover: fires once on `checkout.session.completed`, does NOT fire on `customer.subscription.updated`, propagates UTMs, returns 200 even when PostHog throws.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/webhooks/stripe/__tests__/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('next/headers', () => ({
  headers: async () => new Map([['stripe-signature', 't=1700000000,v1=sig']]),
}));

const mockConstructEvent = vi.fn();
const mockSubscriptionsRetrieve = vi.fn();
vi.mock('@/shared/lib/stripe', () => ({
  getStripe: () => ({
    webhooks: { constructEvent: mockConstructEvent },
    subscriptions: { retrieve: mockSubscriptionsRetrieve },
  }),
}));

const mockReturning = vi.fn().mockResolvedValue([{ eventId: 'evt_test_001' }]);
const mockOnConflictDoNothing = vi.fn(() => ({ returning: mockReturning }));
const mockOnConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
const mockInsertValues = vi.fn(() => ({
  onConflictDoNothing: mockOnConflictDoNothing,
  onConflictDoUpdate: mockOnConflictDoUpdate,
}));
const mockInsert = vi.fn(() => ({ values: mockInsertValues }));
const mockUpdateWhere = vi.fn().mockResolvedValue({ rowCount: 1 });
const mockUpdateSet = vi.fn(() => ({ where: mockUpdateWhere }));
const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }));
const mockSelectWhere = vi.fn(() => ({ limit: vi.fn().mockResolvedValue([]) }));
const mockSelectFrom = vi.fn(() => ({ where: mockSelectWhere }));
const mockSelect = vi.fn(() => ({ from: mockSelectFrom }));

vi.mock('@/shared/lib/db', () => ({
  getDb: () => ({
    insert: mockInsert,
    update: mockUpdate,
    select: mockSelect,
  }),
}));

const mockTrackServerEvent = vi.fn();
vi.mock('@/shared/lib/analytics', () => ({
  trackServerEvent: mockTrackServerEvent,
  AnalyticsEvent: { SUBSCRIPTION_STARTED: 'subscription_started' },
}));

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

import { POST } from '../route';

function makeReq(): Request {
  return new Request('https://estrevia.app/api/webhooks/stripe', {
    method: 'POST',
    body: 'raw_stripe_body',
  });
}

beforeEach(() => {
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_stripe_test';
  process.env.STRIPE_PRICE_ID_PRO_MONTHLY = 'price_pro_monthly_test';
  mockConstructEvent.mockReset();
  mockSubscriptionsRetrieve.mockReset();
  mockTrackServerEvent.mockReset();
  vi.clearAllMocks();
  // Re-prime the dedup return path
  mockReturning.mockResolvedValue([{ eventId: 'evt_test_001' }]);
});

afterEach(() => {
  delete process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.STRIPE_PRICE_ID_PRO_MONTHLY;
});

describe('POST /api/webhooks/stripe — subscription_started firing', () => {
  it('fires subscription_started with UTM attribution on checkout.session.completed', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_test_001',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_001',
          mode: 'subscription',
          metadata: {
            clerkUserId: 'user_2checkout_001',
            utm_source: 'meta',
            utm_content: 'ad_001',
            utm_campaign: 'launch',
          },
          customer: 'cus_test_001',
          subscription: 'sub_test_001',
          amount_total: 999,   // $9.99 in cents
          currency: 'usd',
        },
      },
    });
    mockSubscriptionsRetrieve.mockResolvedValue({
      id: 'sub_test_001',
      status: 'active',
      trial_end: null,
      items: {
        data: [
          { current_period_end: 1735689600, price: { id: 'price_pro_monthly_test' } },
        ],
      },
    });

    const res = await POST(makeReq());
    expect(res.status).toBe(200);

    expect(mockTrackServerEvent).toHaveBeenCalledTimes(1);
    expect(mockTrackServerEvent).toHaveBeenCalledWith(
      'user_2checkout_001',
      'subscription_started',
      expect.objectContaining({
        plan: 'pro_monthly',
        amount_usd: 9.99,
        currency: 'usd',
        stripe_subscription_id: 'sub_test_001',
        utm_source: 'meta',
        utm_content: 'ad_001',
        utm_campaign: 'launch',
        $insert_id: 'sub_test_001:subscription_started',
      }),
    );
  });

  it('does NOT fire subscription_started on customer.subscription.updated', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_test_002',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_test_002',
          status: 'active',
          metadata: { clerkUserId: 'user_2update' },
          customer: 'cus_test_002',
          trial_end: null,
          items: {
            data: [
              { current_period_end: 1735689600, price: { id: 'price_pro_monthly_test' } },
            ],
          },
        },
      },
    });

    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    expect(mockTrackServerEvent).not.toHaveBeenCalled();
  });

  it('does NOT fire when checkout.session.completed has no clerkUserId in metadata', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_test_003',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_003',
          mode: 'subscription',
          metadata: {}, // no clerkUserId
          customer: 'cus_test_003',
          subscription: 'sub_test_003',
        },
      },
    });

    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    expect(mockTrackServerEvent).not.toHaveBeenCalled();
  });

  it('returns 200 when PostHog throws — Stripe must not retry', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_test_004',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_004',
          mode: 'subscription',
          metadata: { clerkUserId: 'user_2err' },
          customer: 'cus_test_004',
          subscription: 'sub_test_004',
          amount_total: 999,
          currency: 'usd',
        },
      },
    });
    mockSubscriptionsRetrieve.mockResolvedValue({
      id: 'sub_test_004',
      status: 'active',
      trial_end: null,
      items: { data: [{ current_period_end: 1735689600, price: { id: 'price_pro_monthly_test' } }] },
    });
    mockTrackServerEvent.mockImplementationOnce(() => {
      throw new Error('PostHog timeout');
    });

    const res = await POST(makeReq());
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it goes green immediately**

Run: `npx vitest run src/app/api/webhooks/stripe/__tests__/route.test.ts`
Expected: PASS — Track 6's implementation is already in place. If FAIL, surfaces a regression in Track 6 — fix it before proceeding.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/webhooks/stripe/__tests__/route.test.ts
git commit -m "test(webhooks/stripe): cover subscription_started UTM propagation + idempotency + PostHog failure"
```

- [ ] **Step 4: Notify coordinator** — Wave 2 / Track 7 complete.

---

# Track 8 — Funnel client canonical-name mapping

**Owner:** Wave 0, agent 8
**Blockers:** none
**Blocks:** none
**Files:**
- Modify: `src/modules/advertising/posthog/funnel-client.ts`
- Modify: `src/modules/advertising/posthog/__tests__/funnel-client.test.ts`

The agent expects `passport_shared` and `paywall_view` but the codebase fires `passport_reshared` and `paywall_opened`. Rather than rename the existing events (high-blast-radius rename across 6 call sites), introduce a canonical-name → real-name mapping in the HogQL query and post-processing. The agent downstream still operates on canonical names — no other modules need to change.

- [ ] **Step 1: Replace the flat `FUNNEL_EVENTS` array with a canonical-mapping shape**

Edit `src/modules/advertising/posthog/funnel-client.ts:20-27`. Replace:

```ts
const FUNNEL_EVENTS: FunnelEvent['event_name'][] = [
  'landing_view',
  'chart_calculated',
  'passport_shared',
  'user_registered',
  'paywall_view',
  'subscription_started',
];
```

With:

```ts
/**
 * Canonical funnel event names (what the agent's reconciler operates on)
 * mapped to the actual event names fired in the codebase. The HogQL query
 * uses real names (right column); results are remapped back to canonical
 * names for the FunnelSnapshot consumers downstream.
 *
 * Identity mappings (canonical === real) for events instrumented by
 * Tracks 1/2/3/4/6 (`landing_view`, `user_registered`, `subscription_started`)
 * and the existing `chart_calculated`. Two events use legacy names that
 * we translate here to avoid renaming 6 call sites in product code.
 */
const FUNNEL_EVENT_MAP: Array<{
  canonical: FunnelEvent['event_name'];
  real: string;
}> = [
  { canonical: 'landing_view',         real: 'landing_view' },
  { canonical: 'chart_calculated',     real: 'chart_calculated' },
  { canonical: 'passport_shared',      real: 'passport_reshared' },
  { canonical: 'user_registered',      real: 'user_registered' },
  { canonical: 'paywall_view',         real: 'paywall_opened' },
  { canonical: 'subscription_started', real: 'subscription_started' },
];

const FUNNEL_EVENTS_REAL: string[] = FUNNEL_EVENT_MAP.map((m) => m.real);
```

- [ ] **Step 2: Update the `getFunnel` method to use real names in the query**

Replace lines 59 and 95-105 of the original `getFunnel` method.

Current `eventList` at line 59:
```ts
    const eventList = FUNNEL_EVENTS.map((e) => `'${e}'`).join(', ');
```

Replace with:
```ts
    const eventList = FUNNEL_EVENTS_REAL.map((e) => `'${e}'`).join(', ');
```

Current `steps` mapping at lines 95-105:
```ts
    const steps: FunnelEvent[] = FUNNEL_EVENTS.map((event_name) => {
      const r = counts.get(event_name) ?? { count: 0, unique: 0 };
      return {
        event_name,
        count: r.count,
        unique_users: r.unique,
        // conversion_from_previous is overwritten by normalizeConversions
        // in fetchFunnelSnapshot — pass 0 here as a placeholder.
        conversion_from_previous: 0,
      };
    });
```

Replace with:
```ts
    // Re-emit results under canonical names for downstream consumers.
    // counts is keyed by REAL event name (from HogQL), we pull-then-rename.
    const steps: FunnelEvent[] = FUNNEL_EVENT_MAP.map(({ canonical, real }) => {
      const r = counts.get(real) ?? { count: 0, unique: 0 };
      return {
        event_name: canonical,
        count: r.count,
        unique_users: r.unique,
        // conversion_from_previous is overwritten by normalizeConversions
        // in fetchFunnelSnapshot — pass 0 here as a placeholder.
        conversion_from_previous: 0,
      };
    });
```

- [ ] **Step 3: Update the existing test to assert the new query string + mapping**

Edit `src/modules/advertising/posthog/__tests__/funnel-client.test.ts`. The first test currently asserts:

```ts
    expect(body.query.query).toContain("event IN ('landing_view', 'chart_calculated', 'passport_shared', 'user_registered', 'paywall_view', 'subscription_started')");
```

Change to:
```ts
    expect(body.query.query).toContain("event IN ('landing_view', 'chart_calculated', 'passport_reshared', 'user_registered', 'paywall_opened', 'subscription_started')");
```

The first test's mocked HogQL result returns events under canonical names (`landing_view`, `chart_calculated`, `subscription_started`) — those won't match the new key (we look up by real name). Update the mock too. Replace the first test's `fetchImpl` mock body to use real names:

```ts
    const fetchImpl = vi.fn(async () =>
      ok({
        results: [
          ['landing_view', 87, 87],
          ['chart_calculated', 39, 39],
          ['passport_reshared', 12, 11],
          ['paywall_opened', 5, 5],
          ['subscription_started', 1, 1],
        ],
      }),
    );
```

Then strengthen the assertions to confirm canonical-name re-emission:
```ts
    expect(snapshot.steps).toHaveLength(6);
    expect(snapshot.steps[0]).toMatchObject({ event_name: 'landing_view', count: 87, unique_users: 87 });
    expect(snapshot.steps[1]).toMatchObject({ event_name: 'chart_calculated', count: 39 });
    // CANONICAL name in output, REAL name in HogQL response — proves mapping works
    expect(snapshot.steps[2]).toMatchObject({ event_name: 'passport_shared', count: 12, unique_users: 11 });
    // Missing event from PostHog (user_registered) → zeroed in funnel under canonical name
    expect(snapshot.steps[3]).toMatchObject({ event_name: 'user_registered', count: 0, unique_users: 0 });
    expect(snapshot.steps[4]).toMatchObject({ event_name: 'paywall_view', count: 5 });
    expect(snapshot.steps[5]).toMatchObject({ event_name: 'subscription_started', count: 1 });
```

- [ ] **Step 4: Add a dedicated mapping test**

Append a new `it(...)` case at the end of the `describe('PosthogFunnelClient', ...)` block:

```ts
  it('translates canonical names to real names in HogQL and back to canonical in results', async () => {
    const fetchImpl = vi.fn(async () =>
      ok({
        results: [
          // PostHog returns ONLY the real-name events that fired
          ['passport_reshared', 100, 80],
          ['paywall_opened', 50, 45],
        ],
      }),
    );

    const client = new PosthogFunnelClient({
      projectId: '1', apiKey: 'k', host: 'https://posthog.test', fetchImpl,
    });

    const snapshot = await client.getFunnel({
      date_from: '2026-04-25T00:00:00Z',
      date_to: '2026-04-26T00:00:00Z',
    });

    // HogQL must request the REAL names
    const body = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.query.query).toContain("'passport_reshared'");
    expect(body.query.query).toContain("'paywall_opened'");
    // and must NOT request the canonical names directly
    expect(body.query.query).not.toContain("'passport_shared'");
    expect(body.query.query).not.toContain("'paywall_view'");

    // Output uses CANONICAL names with the counts from the real-name events
    const passport = snapshot.steps.find((s) => s.event_name === 'passport_shared');
    const paywall = snapshot.steps.find((s) => s.event_name === 'paywall_view');
    expect(passport).toMatchObject({ event_name: 'passport_shared', count: 100, unique_users: 80 });
    expect(paywall).toMatchObject({ event_name: 'paywall_view', count: 50, unique_users: 45 });
  });
```

- [ ] **Step 5: Run the funnel-client test to verify pass**

Run: `npx vitest run src/modules/advertising/posthog/__tests__/funnel-client.test.ts`
Expected: PASS — all 6 cases (5 original updated + 1 new mapping case) green.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS. The `FunnelEvent['event_name']` union type from `src/shared/types/advertising/perceive.ts:18-24` already includes `'passport_shared'` and `'paywall_view'` as canonical names, so the mapping table types fine.

- [ ] **Step 7: Commit**

```bash
git add src/modules/advertising/posthog/funnel-client.ts \
        src/modules/advertising/posthog/__tests__/funnel-client.test.ts
git commit -m "feat(advertising/funnel): map canonical → real event names in HogQL query"
```

- [ ] **Step 8: Notify coordinator** — Wave 0 / Track 8 complete.

---

# Track 9 — Cron route DB factory rewiring

**Owner:** Wave 0, agent 9
**Blockers:** none
**Blocks:** Track 10 (uses the `getDb` import in routes)
**Files:**
- Modify: `src/app/api/cron/advertising/triage-hourly/route.ts:154-165`
- Modify: `src/app/api/cron/advertising/triage-daily/route.ts:263-273`
- Modify: `src/app/api/cron/advertising/retro-weekly/route.ts:251-266`
- Modify: `src/app/api/cron/advertising/__tests__/cron-handlers.test.ts:26-32` (mock-shape fix)

Replace `null as any` (and the no-op stub in retro-weekly) with `getDb()`. Critical: the existing `cron-handlers.test.ts` mock exports `db: { ... }` but the actual `db.ts` module only exports `getDb()`. The mock must be updated to also export `getDb` — without this, the patched routes hit `undefined.select(...)` even in tests.

- [ ] **Step 1: Patch `triage-hourly/route.ts`**

Add an import near the top of `src/app/api/cron/advertising/triage-hourly/route.ts` (after the existing `assertCronAuth` import):

```ts
import { getDb } from '@/shared/lib/db';
```

Replace lines 154-165 (the two factory functions):

```ts
function buildDecisionDb() {
  return getDb();
}

function buildSpendCapDb() {
  return getDb();
}
```

Remove both `// eslint-disable-next-line @typescript-eslint/no-explicit-any` comments — they're no longer needed.

- [ ] **Step 2: Patch `triage-daily/route.ts`**

Add the same import at the top of `src/app/api/cron/advertising/triage-daily/route.ts`:

```ts
import { getDb } from '@/shared/lib/db';
```

Replace lines 263-273:

```ts
function buildDecisionDb() {
  return getDb();
}

function buildSpendCapDb() {
  return getDb();
}
```

Remove both `eslint-disable` lines.

- [ ] **Step 3: Patch `retro-weekly/route.ts`**

Add the same import at the top of `src/app/api/cron/advertising/retro-weekly/route.ts`:

```ts
import { getDb } from '@/shared/lib/db';
```

Replace lines 251-267 (the no-op `buildGatesDb` stub):

```ts
function buildGatesDb(): GatesDb {
  // Real Drizzle client. The structural GatesDb interface in
  // feature-gates.ts is satisfied by the Drizzle db's select/insert/update
  // methods on the advertising_feature_gates table. evaluateGates is
  // safe on an empty table — returns [] when no rows present.
  return getDb() as unknown as GatesDb;
}
```

The `as unknown as GatesDb` cast is needed because the structural `GatesDb` interface in `src/modules/advertising/decide/feature-gates.ts:23-51` was tightened around mock shape; the real Drizzle client's chained methods are a structural superset but TypeScript can't infer compatibility automatically without the cast.

- [ ] **Step 4: Update the `cron-handlers.test.ts` db mock to export `getDb`**

Edit `src/app/api/cron/advertising/__tests__/cron-handlers.test.ts:26-32`. Current mock:

```ts
vi.mock('@/shared/lib/db', () => ({
  db: {
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
    select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) }),
    update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) }),
  },
}));
```

Replace with:

```ts
// Mock @/shared/lib/db — routes call getDb() lazily inside DI factories.
// Both `getDb` (the actual export) and `db` (legacy convenience) are exposed
// so existing test files importing either continue to work.
const mockDrizzleDb = {
  insert: vi.fn().mockReturnValue({
    values: vi.fn().mockReturnValue({
      onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
    }),
  }),
  select: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
  }),
  update: vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
  }),
};
vi.mock('@/shared/lib/db', () => ({
  getDb: () => mockDrizzleDb,
  db: mockDrizzleDb,
}));
```

The `onConflictDoUpdate` chain is added because spend-cap's upsert path (`spend-cap.ts:122-138`) chains `.insert().values().onConflictDoUpdate()` — the previous mock's `values().mockResolvedValue(undefined)` would return `undefined` instead of an object with `.onConflictDoUpdate`, crashing if a test ever exercised that path. Track 10 will exercise it.

- [ ] **Step 5: Add `db_layer: 'drizzle'` and `cron_route` Sentry tags (per spec §error-handling)**

Per spec: "add `db_layer: 'drizzle'` and `cron_route: '<route>'` to all `pause`/`scale`/`duplicate` Sentry captures. Existing tags `cron: true, route: ...` remain."

Three captures need updating (existing `tags` literals get the two new keys appended).

In `src/app/api/cron/advertising/triage-hourly/route.ts:111-113`:
```ts
    Sentry.captureException(e, {
      tags: {
        cron: true,
        route: '/api/cron/advertising/triage-hourly',
        db_layer: 'drizzle',
        cron_route: '/api/cron/advertising/triage-hourly',
      },
    });
```

In `src/app/api/cron/advertising/triage-daily/route.ts:169-172` (per-action catch):
```ts
        Sentry.captureException(actErr, {
          tags: {
            cron: true,
            route: '/api/cron/advertising/triage-daily',
            db_layer: 'drizzle',
            cron_route: '/api/cron/advertising/triage-daily',
          },
          extra: { ad_id: decision.ad_id, action: decision.action },
        });
```

And the top-level catch at `triage-daily/route.ts:218-220`:
```ts
    Sentry.captureException(e, {
      tags: {
        cron: true,
        route: '/api/cron/advertising/triage-daily',
        db_layer: 'drizzle',
        cron_route: '/api/cron/advertising/triage-daily',
      },
    });
```

In `src/app/api/cron/advertising/retro-weekly/route.ts:143-145`:
```ts
    Sentry.captureException(e, {
      tags: {
        cron: true,
        route: '/api/cron/advertising/retro-weekly',
        db_layer: 'drizzle',
        cron_route: '/api/cron/advertising/retro-weekly',
      },
    });
```

**Why both `route` AND `cron_route`:** the spec explicitly says existing `route: ...` tags remain. The `cron_route` is a new, additional dimension PostHog/Sentry queries can group by independently. Yes, the values are duplicated — that matches the spec.

- [ ] **Step 6: Run all advertising-cron tests to verify no regressions**

Run: `npx vitest run src/app/api/cron/advertising/__tests__/cron-handlers.test.ts`
Expected: PASS — all existing cases (auth enforcement, kill switch, successful execution, summary shape) remain green. The mock now correctly satisfies `getDb()` invocations from the patched factories.

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/cron/advertising/triage-hourly/route.ts \
        src/app/api/cron/advertising/triage-daily/route.ts \
        src/app/api/cron/advertising/retro-weekly/route.ts \
        src/app/api/cron/advertising/__tests__/cron-handlers.test.ts
git commit -m "fix(advertising/cron): wire real Drizzle DB + add db_layer/cron_route Sentry tags"
```

- [ ] **Step 9: Notify coordinator** — Wave 0 / Track 9 complete. Track 10 can pull and unblock.

---

# Track 10 — DB-injection integration test

**Owner:** Wave 1, agent 10
**Blockers:** Track 9 (route factories must call `getDb`; mock must export `getDb`)
**Blocks:** none
**Files:**
- Modify: `src/app/api/cron/advertising/__tests__/cron-handlers.test.ts` (append new `describe` block)

This is the test that would have caught the null-DB bug. It does NOT mock `pause()` wholesale (unlike all existing tests). Instead it lets the real `pause()` code path execute, with `checkSpendCap` and `logDecision` imported lazily — both of which call `deps.db.select(...)` and `deps.db.insert(...)`. Verifies the mock Drizzle chain receives the calls, proving the route's `buildDecisionDb()`/`buildSpendCapDb()` actually returns a usable DB rather than `null`.

- [ ] **Step 1: Append the integration test to `cron-handlers.test.ts`**

Add at the very bottom of `src/app/api/cron/advertising/__tests__/cron-handlers.test.ts` (after the last `describe` block, before EOF):

```ts
// ---------------------------------------------------------------------------
// Tests: DB injection — guards against the null-DB regression
// ---------------------------------------------------------------------------
//
// All tests above mock `pause()` wholesale, so `checkSpendCap` and
// `logDecision` are never invoked and `deps.db` is never dereferenced.
// That mocking masked a production bug where buildSpendCapDb() and
// buildDecisionDb() returned `null as any`, crashing the first real
// pause attempt with `TypeError: Cannot read properties of null`.
//
// This block bypasses the wholesale pause mock by re-importing the real
// pause module and injecting the mocked Drizzle chain. If anyone ever
// regresses the factories back to `null`, the .select/.insert call counts
// here go to zero and the test fails.
// ---------------------------------------------------------------------------

describe('triage-hourly — DB injection guard (regression test)', () => {
  it('invokes mockDrizzleDb.select and .insert through the real pause/spend-cap path', async () => {
    // Reset module cache so the un-mocked pause is loaded
    vi.resetModules();

    // Re-mock everything except pause itself — pause must run for real so
    // it calls checkSpendCap → deps.db.select(), and logDecision →
    // deps.db.insert(). Both touch our mockDrizzleDb chain; if either is
    // null the test crashes.
    vi.doMock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
    vi.doMock('@/shared/lib/db', () => ({
      getDb: () => mockDrizzleDb,
      db: mockDrizzleDb,
    }));
    vi.doMock('@/modules/advertising/safety/kill-switch', () => ({
      assertKillSwitchOff: vi.fn(),
      isKillSwitchEngaged: vi.fn().mockReturnValue(false),
      isDryRun: vi.fn().mockReturnValue(false),
      getStatus: vi.fn().mockReturnValue({ enabled: true, dryRun: false }),
    }));
    vi.doMock('@/modules/advertising/alerts/telegram-bot', () => {
      const mockBot = {
        sendAlert: vi.fn().mockResolvedValue({ message_id: 1, text: 'ok' }),
        sendDailyDigest: vi.fn().mockResolvedValue({ message_id: 2, text: 'ok' }),
        sendMessage: vi.fn().mockResolvedValue({ message_id: 3, text: 'ok' }),
      };
      return {
        TelegramBot: vi.fn().mockImplementation(() => mockBot),
        createTelegramBot: vi.fn(() => mockBot),
      };
    });
    vi.doMock('@/modules/advertising/perceive/meta-insights', () => ({
      fetchMetaInsights: vi.fn().mockResolvedValue([
        {
          ad_id: 'ad_pause_001',
          adset_id: 'adset_001',
          campaign_id: 'campaign_001',
          date: '2026-05-03',
          impressions: 1000,
          clicks: 1,                 // CTR will trigger Tier 1 pause
          spend_usd: 5.0,
          ctr: 0.001,                // 0.1% — well below pause threshold
          cpc: 5.0,
          cpm: 5.0,
          frequency: 1.2,
          reach: 900,
          days_running: 5,
          status: 'ACTIVE',
        },
      ]),
    }));
    vi.doMock('@/modules/advertising/decide/orchestrator', () => ({
      decide: vi.fn().mockResolvedValue({
        decisions: [
          {
            ad_id: 'ad_pause_001',
            action: 'pause',
            reason: 'tier_1_low_ctr',
            reasoning_tier: 'tier_1_rules',
            confidence: 1.0,
            metrics_snapshot: {},
            delta_budget_usd: 0,
          },
        ],
        shadowLog: [],
      }),
    }));
    // act-layer: real pause WITH a mocked Meta API client returned by
    // `getMetaAdClient` so the Meta API is never actually hit.
    vi.doMock('@/modules/advertising/act', () => ({
      getMetaAdClient: vi.fn(() => ({
        pauseAd: vi.fn().mockResolvedValue({ paused: true, ad_id: 'ad_pause_001' }),
      })),
    }));
    // Stub createMetaAdClient too (used as insightsApi by spend-cap)
    vi.doMock('@/modules/advertising/meta-graph-api', () => ({
      createMetaAdClient: vi.fn(() => ({
        getInsights: vi.fn().mockResolvedValue([]),  // real spend-cap path: 0 spent today
        pauseAd: vi.fn().mockResolvedValue({ paused: true }),
      })),
    }));
    // Required env for spend cap
    process.env.ADVERTISING_DAILY_SPEND_CAP_USD = '80';
    process.env.CRON_SECRET = CRON_SECRET;
    process.env.ADVERTISING_AGENT_ENABLED = 'true';

    // Reset call counts on the shared mockDrizzleDb chain
    mockDrizzleDb.select.mockClear();
    mockDrizzleDb.insert.mockClear();

    // Re-import the route after re-mocking
    const { GET: realTriageHourly } = await import('../triage-hourly/route');
    const res = await realTriageHourly(makeRequest(`Bearer ${CRON_SECRET}`));

    expect(res.status).toBe(200);
    const body = await res.json() as { success: boolean; summary: { pauses_applied: number } };
    expect(body.success).toBe(true);
    expect(body.summary.pauses_applied).toBe(1);

    // Proof of life: the spend-cap and decision-log paths actually called
    // into the Drizzle mock. If buildSpendCapDb()/buildDecisionDb() ever
    // regress back to `null as any`, these counts will be 0.
    expect(mockDrizzleDb.select).toHaveBeenCalled();
    expect(mockDrizzleDb.insert).toHaveBeenCalled();

    // Cleanup
    delete process.env.ADVERTISING_DAILY_SPEND_CAP_USD;
    vi.resetModules();
  });
});
```

**Why `vi.resetModules()` and `vi.doMock`:** the top of the file uses `vi.mock(...)` which is hoisted statically. To bypass the wholesale `vi.mock('@/modules/advertising/act/pause', ...)` we need to clear the module cache and re-register dynamic mocks via `vi.doMock` BEFORE the dynamic `import(...)`. The wholesale `pause` mock at line 178 is then NOT applied because the re-imported route module loads a fresh, un-mocked copy of `@/modules/advertising/act/pause`.

Actually — `vi.doMock` only affects future imports, but `vi.mock(...)` hoisted at the top is global. To truly bypass the pause mock, we use `vi.unmock` for that one module:

Insert before `vi.resetModules()`:
```ts
    vi.unmock('@/modules/advertising/act/pause');
```

This restores the real `pause` implementation for this test only.

- [ ] **Step 2: Run the new test in isolation to verify the failing path is exercised**

Run: `npx vitest run src/app/api/cron/advertising/__tests__/cron-handlers.test.ts -t "DB injection guard"`
Expected: PASS — Track 9's `getDb()` returns `mockDrizzleDb`, real pause runs, real spend-cap calls `.select()` then `.insert().values().onConflictDoUpdate()`, real logDecision calls `.insert().values()`. Both `.select` and `.insert` mocks register call counts > 0.

- [ ] **Step 3: Run the full cron-handlers test suite to confirm no test interference**

Run: `npx vitest run src/app/api/cron/advertising/__tests__/cron-handlers.test.ts`
Expected: PASS — all original tests still green, new DB-injection test passes.

If existing tests fail after this addition: the `vi.unmock` + `vi.resetModules` from this test is leaking into later tests. Add at the end of the new `it(...)` block:
```ts
    vi.doMock('@/modules/advertising/act/pause', () => ({
      pause: vi.fn().mockResolvedValue({ id: 'rec_001', applied: true }),
    }));
```
to restore the wholesale mock for any test that runs after.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/advertising/__tests__/cron-handlers.test.ts
git commit -m "test(advertising/cron): integration test guards against null-DB regression"
```

- [ ] **Step 6: Notify coordinator** — Wave 1 / Track 10 complete.

---

# Aggregator — final verification + deploy gate

**Owner:** coordinator (after all 10 tracks complete)

The 10 worktrees are merged into `main` in dependency order: Track 1 → Tracks 8/9 (Wave 0 tail) → Tracks 2/4/6/10 → Tracks 3/5/7. After merge, run the pre-deploy gate from the spec.

- [ ] **Step 1: Pre-deploy gate**

Run all in parallel:
```bash
npm run typecheck
npm run lint
npx vitest run src/modules/advertising src/app/api/cron/advertising src/app/api/webhooks src/app/[locale]/(marketing)
```

Expected:
- `typecheck`: clean (no new errors)
- `lint`: 785 pre-existing baseline. Verify no NEW errors in the 13 changed files. (`npm run lint -- --max-warnings 0` will not pass globally — verify scoped via `npm run lint -- src/modules/advertising src/app/api/cron/advertising src/app/api/webhooks src/app/[locale]/(marketing) src/shared/lib/analytics.ts`.)
- vitest: all advertising / webhook / marketing tests passing.

- [ ] **Step 2: Optional manual smoke test in dev**

```bash
npm run dev
```

In a second terminal:
```bash
# 1. landing_view fires from the browser
open http://localhost:3000/
# Browser DevTools → Network → filter "i.posthog.com" → confirm POST /e/ with event=landing_view

# 2. user_registered fires on Clerk webhook (requires svix-cli or staging Clerk)
# Manual: trigger a fresh sign-up flow → check PostHog events feed for user_registered

# 3. subscription_started fires on Stripe checkout
# Manual: complete Stripe Checkout in test mode → check PostHog events feed for subscription_started
# Verify utm_source/utm_content propagated from session metadata
```

- [ ] **Step 3: Deploy to prod**

```bash
git push origin main
# Vercel auto-deploys
```

- [ ] **Step 4: Post-deploy verification (T+1h)**

```bash
# Force-run the hourly cron and inspect logs for:
#  - no "Cannot read properties of null" errors in spend-cap path
#  - decision audit table receiving rows
vercel crons run /api/cron/advertising/triage-hourly

# Force-run daily and verify funnel reconciler sees non-zero landings
vercel crons run /api/cron/advertising/triage-daily
```

Confirm:
- Telegram daily digest no longer shows `delta_pct=100%` `critical_drift` alert
- Funnel digest shows non-zero counts for `landing_view`, `chart_calculated`, `passport_shared` (mapped from `passport_reshared`), `paywall_view` (mapped from `paywall_opened`)
- `user_registered` and `subscription_started` populate as conversions occur

- [ ] **Step 5: Update memory**

After 24h of clean cron runs, update `MEMORY.md`:

```markdown
- [Advertising agent funnel + DB fixes shipped](project_advertising_funnel_db_fixes.md) — 2026-05-03 stopped critical_drift alert, wired real Drizzle into spend-cap/audit/gates
```

---

## Out of scope (per spec — do NOT touch in this plan)

- `spend-cap.ts:122-138` `triggeredHalt` regression (separate semantic bug; follow-up)
- Removing the unused `USER_SIGNED_UP` enum entry (legacy, blast-radius minimization)
- Re-tuning `THRESHOLD_CRITICAL = 0.25` after real funnel data arrives (post-data-collection)
- Building a DAO abstraction layer over Drizzle (deferred — direct injection is sufficient now)
- E2E tests for funnel events end-to-end through PostHog (covered by manual verification post-deploy)
- Refactoring webhook handlers beyond the minimal hooks needed for event firing
