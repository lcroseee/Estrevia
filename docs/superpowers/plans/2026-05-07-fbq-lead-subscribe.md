# Browser-side fbq Lead + Subscribe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add browser-side `fbq('track','Lead')` on Clerk sign-up completion and `fbq('track','Subscribe')` on Stripe success-redirect, both deduplicated with the matching server-side CAPI events via shared `eventID`.

**Architecture:** Two new client components mounted at layout level (`MetaPixelLeadEmitter` in `[locale]/layout.tsx`, `MetaPixelSubscribeEmitter` in `[locale]/(app)/layout.tsx`). Each detects its trigger condition (fresh Clerk user / `?session_id=` URL param), gates with `localStorage` flag for idempotency, and fires `fbq('track', ...)` with an `eventID` that matches the server-side `$insert_id` used in CAPI dispatch. One single-line server change aligns the Subscribe dedupe key on `session.id`.

**Tech Stack:** Vitest + jsdom + React Testing Library for tests; React 19 client components; Clerk's `useUser` hook; Next.js `useSearchParams`; Meta Pixel via global `window.fbq`.

**Spec:** `docs/superpowers/specs/2026-05-07-fbq-lead-subscribe-design.md`

---

## File Structure

**Created:**
- `src/shared/components/MetaPixelLeadEmitter.tsx` — Lead emitter (~35 LOC)
- `src/shared/components/MetaPixelSubscribeEmitter.tsx` — Subscribe emitter (~30 LOC)
- `src/shared/components/__tests__/MetaPixelLeadEmitter.test.tsx` — Lead unit tests
- `src/shared/components/__tests__/MetaPixelSubscribeEmitter.test.tsx` — Subscribe unit tests

**Modified:**
- `src/app/api/webhooks/stripe/route.ts:276` — `$insert_id` format
- `src/app/api/webhooks/stripe/__tests__/route.test.ts:193,229` — expected `$insert_id` values
- `src/app/[locale]/layout.tsx` — mount `<MetaPixelLeadEmitter />`
- `src/app/[locale]/(app)/layout.tsx` — mount `<MetaPixelSubscribeEmitter />`

---

## Task 1: Align Stripe webhook `$insert_id` on `session.id`

Server-side change first: it's the smallest, most isolated, and unblocks the matching browser Subscribe component.

**Files:**
- Modify: `src/app/api/webhooks/stripe/route.ts:276`
- Modify: `src/app/api/webhooks/stripe/__tests__/route.test.ts:193,229`

- [ ] **Step 1: Update test expectations to new dedupe key format**

Open `src/app/api/webhooks/stripe/__tests__/route.test.ts`. Find each occurrence of the old format (lines 193 and 229 area) and update them.

Read each occurrence first to confirm exact context. The old assertion looks like:

```ts
$insert_id: `${stripeSubscriptionId}:subscription_started`,
```

or, in some assertions:

```ts
expect.objectContaining({
  $insert_id: expect.stringMatching(/^sub_.*:subscription_started$/),
})
```

Change to use `session.id` (`cs_test_...` / `cs_live_...`):

```ts
$insert_id: `${SESSION_ID}:subscription_started`,
```

or:

```ts
expect.objectContaining({
  $insert_id: expect.stringMatching(/^cs_.*:subscription_started$/),
})
```

Use whatever constant the test already uses to refer to the mock checkout session id. If the test file has both an exact-match assertion and a regex assertion, update both.

- [ ] **Step 2: Run the webhook tests, verify they FAIL**

Run: `npx vitest run src/app/api/webhooks/stripe/__tests__/route.test.ts -t subscription_started`

Expected: FAIL with diff between old and new `$insert_id` format. This confirms the test now demands the new behavior.

- [ ] **Step 3: Update the webhook source line**

Edit `src/app/api/webhooks/stripe/route.ts:276`:

```diff
-          $insert_id: `${stripeSubscriptionId ?? session.id}:subscription_started`,
+          $insert_id: `${session.id}:subscription_started`,
```

- [ ] **Step 4: Run the webhook tests, verify they PASS**

Run: `npx vitest run src/app/api/webhooks/stripe/__tests__/route.test.ts`

Expected: all tests in this file PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/webhooks/stripe/route.ts src/app/api/webhooks/stripe/__tests__/route.test.ts
git commit -m "fix(advertising/fbq): align Subscribe dedupe key on session.id

Browser-side fbq Subscribe (next task) only knows session_id from
Stripe success-redirect URL. Both sides must derive event_id from
the same value for Meta deduplication to merge them. Renewals are
unaffected — subscription_started fires only in checkout.session.completed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Create `MetaPixelLeadEmitter` component (TDD)

**Files:**
- Create: `src/shared/components/MetaPixelLeadEmitter.tsx`
- Create: `src/shared/components/__tests__/MetaPixelLeadEmitter.test.tsx`

- [ ] **Step 1: Write the failing test file**

Create `src/shared/components/__tests__/MetaPixelLeadEmitter.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import React from 'react';

// Mockable Clerk useUser. Each test sets the return value via setUseUserReturn().
let useUserReturn: { isLoaded: boolean; isSignedIn: boolean; user: { id: string; createdAt: Date } | null } = {
  isLoaded: false,
  isSignedIn: false,
  user: null,
};
function setUseUserReturn(v: typeof useUserReturn) {
  useUserReturn = v;
}

vi.mock('@clerk/nextjs', () => ({
  useUser: () => useUserReturn,
}));

import { MetaPixelLeadEmitter } from '../MetaPixelLeadEmitter';

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  // Default: no fbq present (Pixel disabled)
  delete (window as unknown as { fbq?: unknown }).fbq;
});

function makeFbqMock() {
  const fbq = vi.fn();
  (window as unknown as { fbq: typeof fbq }).fbq = fbq;
  return fbq;
}

function freshUser(id = 'user_abc'): { id: string; createdAt: Date } {
  return { id, createdAt: new Date(Date.now() - 30_000) }; // 30s old
}

function staleUser(id = 'user_old'): { id: string; createdAt: Date } {
  return { id, createdAt: new Date(Date.now() - 30 * 60_000) }; // 30min old
}

describe('MetaPixelLeadEmitter', () => {
  it('does nothing when Clerk has not loaded yet', () => {
    setUseUserReturn({ isLoaded: false, isSignedIn: false, user: null });
    const fbq = makeFbqMock();
    render(<MetaPixelLeadEmitter />);
    expect(fbq).not.toHaveBeenCalled();
  });

  it('does nothing when user is signed out', () => {
    setUseUserReturn({ isLoaded: true, isSignedIn: false, user: null });
    const fbq = makeFbqMock();
    render(<MetaPixelLeadEmitter />);
    expect(fbq).not.toHaveBeenCalled();
  });

  it('does nothing when user.createdAt is older than the freshness window', async () => {
    setUseUserReturn({ isLoaded: true, isSignedIn: true, user: staleUser() });
    const fbq = makeFbqMock();
    render(<MetaPixelLeadEmitter />);
    await waitFor(() => {
      expect(fbq).not.toHaveBeenCalled();
    });
  });

  it('does nothing when window.fbq is undefined (Pixel disabled)', async () => {
    setUseUserReturn({ isLoaded: true, isSignedIn: true, user: freshUser() });
    // No fbq set
    render(<MetaPixelLeadEmitter />);
    // Wait a tick so any useEffect runs
    await new Promise((r) => setTimeout(r, 0));
    expect((window as unknown as { fbq?: unknown }).fbq).toBeUndefined();
  });

  it('fires fbq Lead exactly once for a fresh signed-in user with the correct eventID', async () => {
    const user = freshUser('user_fresh_1');
    setUseUserReturn({ isLoaded: true, isSignedIn: true, user });
    const fbq = makeFbqMock();
    render(<MetaPixelLeadEmitter />);
    await waitFor(() => {
      expect(fbq).toHaveBeenCalledTimes(1);
    });
    expect(fbq).toHaveBeenCalledWith(
      'track',
      'Lead',
      {},
      { eventID: 'user_fresh_1:user_registered' },
    );
  });

  it('does not fire twice for the same user.id when localStorage flag is set', async () => {
    const user = freshUser('user_repeat');
    window.localStorage.setItem('lead_fired:user_repeat', '1');
    setUseUserReturn({ isLoaded: true, isSignedIn: true, user });
    const fbq = makeFbqMock();
    render(<MetaPixelLeadEmitter />);
    await new Promise((r) => setTimeout(r, 0));
    expect(fbq).not.toHaveBeenCalled();
  });

  it('writes the localStorage flag after firing', async () => {
    const user = freshUser('user_flag');
    setUseUserReturn({ isLoaded: true, isSignedIn: true, user });
    makeFbqMock();
    render(<MetaPixelLeadEmitter />);
    await waitFor(() => {
      expect(window.localStorage.getItem('lead_fired:user_flag')).toBe('1');
    });
  });

  it('tolerates localStorage throwing (silent fail, no fire)', async () => {
    const user = freshUser('user_ls_throws');
    setUseUserReturn({ isLoaded: true, isSignedIn: true, user });
    const fbq = makeFbqMock();
    const origGetItem = window.localStorage.getItem.bind(window.localStorage);
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('localStorage disabled');
    });
    render(<MetaPixelLeadEmitter />);
    await new Promise((r) => setTimeout(r, 0));
    expect(fbq).not.toHaveBeenCalled();
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(origGetItem);
  });
});
```

- [ ] **Step 2: Run the test, verify it FAILS**

Run: `npx vitest run src/shared/components/__tests__/MetaPixelLeadEmitter.test.tsx`

Expected: FAIL with module-not-found for `../MetaPixelLeadEmitter`. This confirms the test demands a not-yet-created file.

- [ ] **Step 3: Implement the component**

Create `src/shared/components/MetaPixelLeadEmitter.tsx`:

```tsx
'use client';

import { useEffect } from 'react';
import { useUser } from '@clerk/nextjs';

const FRESH_SIGNUP_WINDOW_MS = 10 * 60 * 1000;
const STORAGE_PREFIX = 'lead_fired:';

type FbqGlobal = (
  command: 'track',
  event: 'Lead',
  data: Record<string, unknown>,
  options: { eventID: string },
) => void;

/**
 * Fires a browser-side `fbq('track','Lead')` exactly once per fresh Clerk
 * sign-up, with `eventID` matching the server-side CAPI Lead event_id
 * (`${userId}:user_registered`) emitted from /api/webhooks/clerk. Meta
 * deduplicates the pair and lifts Match Quality Score.
 *
 * Idempotency: localStorage flag `lead_fired:${userId}` plus a 10-minute
 * `user.createdAt` freshness window (defense-in-depth — flag wipes won't
 * cause re-fires for old users).
 *
 * Failures are silent (analytics, not a critical path).
 */
export function MetaPixelLeadEmitter(): null {
  const { isLoaded, isSignedIn, user } = useUser();

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user) return;
    if (typeof window === 'undefined') return;

    const fbq = (window as unknown as { fbq?: FbqGlobal }).fbq;
    if (typeof fbq !== 'function') return;

    try {
      const ageMs = Date.now() - new Date(user.createdAt).getTime();
      if (!Number.isFinite(ageMs) || ageMs > FRESH_SIGNUP_WINDOW_MS) return;

      const key = `${STORAGE_PREFIX}${user.id}`;
      if (window.localStorage.getItem(key)) return;

      fbq('track', 'Lead', {}, { eventID: `${user.id}:user_registered` });
      window.localStorage.setItem(key, '1');
    } catch {
      // localStorage may throw in private mode / restricted contexts.
      // Silent fail — better to skip than risk firing without idempotency.
    }
  }, [isLoaded, isSignedIn, user]);

  return null;
}
```

- [ ] **Step 4: Run the test, verify all cases PASS**

Run: `npx vitest run src/shared/components/__tests__/MetaPixelLeadEmitter.test.tsx`

Expected: all 8 cases PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/components/MetaPixelLeadEmitter.tsx src/shared/components/__tests__/MetaPixelLeadEmitter.test.tsx
git commit -m "feat(advertising/fbq): add MetaPixelLeadEmitter for browser-side Lead

Fires fbq('track','Lead') once per fresh Clerk sign-up with eventID
matching the existing server-side CAPI Lead. localStorage flag plus
createdAt freshness window provide belt-and-suspenders idempotency.
No PII in payload.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Mount `MetaPixelLeadEmitter` in `[locale]/layout.tsx`

**Files:**
- Modify: `src/app/[locale]/layout.tsx`

- [ ] **Step 1: Read the current layout to confirm import + JSX site**

Open `src/app/[locale]/layout.tsx`. Confirm the existing structure: `<UtmCapture />` is mounted as a sibling to `{children}` after the optional Pixel base `<Script>`. Plan to add `<MetaPixelLeadEmitter />` as a peer of `<UtmCapture />`.

- [ ] **Step 2: Add the import**

Add the import alongside the existing `UtmCapture` import (around the top of the file):

```tsx
import { UtmCapture } from '@/shared/components/UtmCapture';
import { MetaPixelLeadEmitter } from '@/shared/components/MetaPixelLeadEmitter';
```

- [ ] **Step 3: Mount the component in JSX**

Inside the returned JSX, place `<MetaPixelLeadEmitter />` next to `<UtmCapture />`:

```tsx
<UtmCapture />
<MetaPixelLeadEmitter />
{children}
```

- [ ] **Step 4: Verify the layout test still passes**

Run: `npx vitest run src/app/[locale]/__tests__/layout.test.tsx`

Expected: PASS. The existing layout tests focus on Pixel base inclusion conditioned on `NEXT_PUBLIC_META_PIXEL_ID`. Adding a passive client component should not affect those assertions. If a test fails because it asserts on the exact top-level JSX shape, update the assertion to permit the new sibling — but only if the failure is structural, not behavioral.

- [ ] **Step 5: Run typecheck and lint**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run lint -- src/app/[locale]/layout.tsx`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/[locale]/layout.tsx
git commit -m "feat(advertising/fbq): mount MetaPixelLeadEmitter in locale layout

Layout-level mount means every signed-in render checks for fresh-signup
condition. The component is a no-op when Pixel is disabled or the user
isn't fresh, so cost is one useEffect + one localStorage read per mount.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Create `MetaPixelSubscribeEmitter` component (TDD)

**Files:**
- Create: `src/shared/components/MetaPixelSubscribeEmitter.tsx`
- Create: `src/shared/components/__tests__/MetaPixelSubscribeEmitter.test.tsx`

- [ ] **Step 1: Write the failing test file**

Create `src/shared/components/__tests__/MetaPixelSubscribeEmitter.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import React from 'react';

// Mockable Next.js useSearchParams. Each test sets the URLSearchParams via setSearchParams().
let currentParams = new URLSearchParams();
function setSearchParams(qs: string) {
  currentParams = new URLSearchParams(qs);
}

vi.mock('next/navigation', () => ({
  useSearchParams: () => currentParams,
}));

import { MetaPixelSubscribeEmitter } from '../MetaPixelSubscribeEmitter';

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  setSearchParams('');
  delete (window as unknown as { fbq?: unknown }).fbq;
});

function makeFbqMock() {
  const fbq = vi.fn();
  (window as unknown as { fbq: typeof fbq }).fbq = fbq;
  return fbq;
}

describe('MetaPixelSubscribeEmitter', () => {
  it('does nothing when there is no session_id in URL', async () => {
    setSearchParams('');
    const fbq = makeFbqMock();
    render(<MetaPixelSubscribeEmitter />);
    await new Promise((r) => setTimeout(r, 0));
    expect(fbq).not.toHaveBeenCalled();
  });

  it('does nothing when window.fbq is undefined', async () => {
    setSearchParams('session_id=cs_test_1');
    // No fbq set
    render(<MetaPixelSubscribeEmitter />);
    await new Promise((r) => setTimeout(r, 0));
    expect((window as unknown as { fbq?: unknown }).fbq).toBeUndefined();
  });

  it('fires fbq Subscribe exactly once with the correct eventID', async () => {
    setSearchParams('session_id=cs_test_abc123');
    const fbq = makeFbqMock();
    render(<MetaPixelSubscribeEmitter />);
    await waitFor(() => {
      expect(fbq).toHaveBeenCalledTimes(1);
    });
    expect(fbq).toHaveBeenCalledWith(
      'track',
      'Subscribe',
      {},
      { eventID: 'cs_test_abc123:subscription_started' },
    );
  });

  it('does not fire twice for the same session_id when localStorage flag is set', async () => {
    setSearchParams('session_id=cs_test_repeat');
    window.localStorage.setItem('subscribe_fired:cs_test_repeat', '1');
    const fbq = makeFbqMock();
    render(<MetaPixelSubscribeEmitter />);
    await new Promise((r) => setTimeout(r, 0));
    expect(fbq).not.toHaveBeenCalled();
  });

  it('writes the localStorage flag after firing', async () => {
    setSearchParams('session_id=cs_test_flag');
    makeFbqMock();
    render(<MetaPixelSubscribeEmitter />);
    await waitFor(() => {
      expect(window.localStorage.getItem('subscribe_fired:cs_test_flag')).toBe('1');
    });
  });

  it('tolerates localStorage throwing (silent fail, no fire)', async () => {
    setSearchParams('session_id=cs_test_throws');
    const fbq = makeFbqMock();
    const origGetItem = window.localStorage.getItem.bind(window.localStorage);
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('localStorage disabled');
    });
    render(<MetaPixelSubscribeEmitter />);
    await new Promise((r) => setTimeout(r, 0));
    expect(fbq).not.toHaveBeenCalled();
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(origGetItem);
  });
});
```

- [ ] **Step 2: Run the test, verify it FAILS**

Run: `npx vitest run src/shared/components/__tests__/MetaPixelSubscribeEmitter.test.tsx`

Expected: FAIL with module-not-found for `../MetaPixelSubscribeEmitter`.

- [ ] **Step 3: Implement the component**

Create `src/shared/components/MetaPixelSubscribeEmitter.tsx`:

```tsx
'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

const STORAGE_PREFIX = 'subscribe_fired:';

type FbqGlobal = (
  command: 'track',
  event: 'Subscribe',
  data: Record<string, unknown>,
  options: { eventID: string },
) => void;

/**
 * Fires a browser-side `fbq('track','Subscribe')` exactly once per
 * Stripe success-redirect, gated on `?session_id=cs_...` in the URL.
 *
 * eventID matches the server-side CAPI Subscribe event_id
 * (`${session.id}:subscription_started`) emitted from
 * /api/webhooks/stripe. Meta deduplicates the pair and uses the browser
 * cookies (fbp/fbc) to lift Match Quality Score for value-based bidding.
 *
 * No `value`/`currency`/`predicted_ltv` in the browser payload — CAPI
 * already carries those server-side, and Meta merges deduped events
 * keeping the richer payload.
 *
 * Idempotency: localStorage flag `subscribe_fired:${sessionId}`.
 *
 * Failures are silent (analytics, not a critical path).
 */
export function MetaPixelSubscribeEmitter(): null {
  const params = useSearchParams();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const fbq = (window as unknown as { fbq?: FbqGlobal }).fbq;
    if (typeof fbq !== 'function') return;

    const sessionId = params.get('session_id');
    if (!sessionId) return;

    try {
      const key = `${STORAGE_PREFIX}${sessionId}`;
      if (window.localStorage.getItem(key)) return;

      fbq('track', 'Subscribe', {}, { eventID: `${sessionId}:subscription_started` });
      window.localStorage.setItem(key, '1');
    } catch {
      // Silent fail.
    }
  }, [params]);

  return null;
}
```

- [ ] **Step 4: Run the test, verify all cases PASS**

Run: `npx vitest run src/shared/components/__tests__/MetaPixelSubscribeEmitter.test.tsx`

Expected: all 6 cases PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/components/MetaPixelSubscribeEmitter.tsx src/shared/components/__tests__/MetaPixelSubscribeEmitter.test.tsx
git commit -m "feat(advertising/fbq): add MetaPixelSubscribeEmitter for browser-side Subscribe

Reads ?session_id from Stripe success-redirect URL, fires fbq
Subscribe with eventID matching CAPI dedupe key. localStorage flag
ensures one fire per session. No revenue payload — CAPI provides
that server-side, Meta merges deduped pair.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Mount `MetaPixelSubscribeEmitter` in `[locale]/(app)/layout.tsx`

**Files:**
- Modify: `src/app/[locale]/(app)/layout.tsx`

- [ ] **Step 1: Read the current `(app)` layout**

Open `src/app/[locale]/(app)/layout.tsx`. Confirm what wraps `{children}` — likely a navigation shell. Plan to insert `<MetaPixelSubscribeEmitter />` as a sibling of `{children}` (or wherever client components mount; doesn't matter where in the subtree, only that it mounts on every (app) page render).

- [ ] **Step 2: Add the import**

Add the import near the other component imports:

```tsx
import { MetaPixelSubscribeEmitter } from '@/shared/components/MetaPixelSubscribeEmitter';
```

- [ ] **Step 3: Mount the component**

Inside the returned JSX (next to `{children}` or near other mount-once helpers), add:

```tsx
<MetaPixelSubscribeEmitter />
{children}
```

- [ ] **Step 4: Run typecheck and lint**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run lint -- src/app/[locale]/(app)/layout.tsx`
Expected: no errors.

- [ ] **Step 5: Run any existing layout tests for the (app) group**

Run: `npx vitest run src/app/[locale]/(app)/__tests__/ 2>/dev/null || npx vitest run src/app/[locale]/(app)/`
Expected: PASS (if tests exist; otherwise no-op).

- [ ] **Step 6: Commit**

```bash
git add 'src/app/[locale]/(app)/layout.tsx'
git commit -m "feat(advertising/fbq): mount MetaPixelSubscribeEmitter in app layout

Layout-level mount triggers on every (app) page; the ?session_id URL
guard does the actual gating. Robust against any future change to
Stripe's success_url destination.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Final verification

**Files:** none modified — verification only.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests PASS. No regressions in unrelated suites.

- [ ] **Step 2: Run typecheck across the whole repo**

Run: `npm run typecheck`
Expected: zero TypeScript errors.

- [ ] **Step 3: Run lint across the whole repo**

Run: `npm run lint`
Expected: zero lint errors. Warnings are acceptable but should not be net-new from this change.

- [ ] **Step 4: Boot the dev server and smoke-check both layouts render**

Run: `npm run dev`

In a browser, open `http://localhost:3000/`. Open DevTools Console. Check:
- No client-side errors logged on landing page mount.
- `window.fbq` is defined (only if `NEXT_PUBLIC_META_PIXEL_ID` is in your local `.env.local`; if not, this check passes silently — emitter is a no-op).

Navigate to `http://localhost:3000/settings`. Same console-error check.

Stop the dev server with Ctrl-C.

- [ ] **Step 5: Confirm no straggling artifacts**

Run: `git status`
Expected: clean working tree (all changes committed across Tasks 1-5).

If you see uncommitted changes, identify which task they belong to and fold them into the right commit (or, if the change is unrelated, exclude it from this PR).

- [ ] **Step 6: No commit needed for this task** — verification only.

---

## Post-implementation (founder-driven, NOT in scope of plan execution)

These steps require production access and are documented for hand-off but should not be executed by the agent running this plan:

1. Push branch / merge `main`. Vercel auto-deploys.
2. Run `npm run db:migrate` against prod `DATABASE_URL` to apply unrelated migration 0007 (adds `users.locale` — discovered during 2026-05-07 investigation, separate from this plan but blocks deploys).
3. Open Meta Events Manager → Test Events tab → enter the prod URL with `?fbclid=test_<random>`. Run Clerk sign-up → confirm Lead event shows both Browser and Server tags merged into one row. Repeat with a Stripe test-mode subscription for Subscribe.
4. Within 3-7 days: Meta Events Manager → Diagnostics tab → confirm zero "Missing Browser/Server Pair" warnings for Lead and Subscribe.
