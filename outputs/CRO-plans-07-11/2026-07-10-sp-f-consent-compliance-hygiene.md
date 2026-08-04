# SP-F — Consent Compliance & Repo Hygiene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close LIVE-7 (Meta Pixel `_fbp` set pre-consent and after Decline while the banner claims "no third-party tracking") by making the pixel a consent-gated client component, expire leftover Meta cookies on Decline, repair the drizzle journal's broken ordering (missing idx 13, 2025-epoch `when` on idx 14–17), complete `.env.example`, and align `/privacy` copy with the post-fix reality — all before scaled Meta re-spend.

**Architecture:** One new client component (`src/shared/components/MetaPixelLoader.tsx`) reusing the existing consent plumbing (`getCookieConsent()` + `estrevia:consent` CustomEvent from `PostHogProvider.tsx`); the inline pixel snippet + `<noscript>` img are excised from `src/app/[locale]/layout.tsx`. Hand-edit of `drizzle/meta/_journal.json` guarded by a new permanent integrity test. Copy edits to `messages/{en,es}.json` `privacyPage` namespace + one new `ThirdParty` entry in the privacy page. No schema changes, no migrations, no prod-mutating scripts. Spec: `docs/superpowers/specs/2026-07-10-sp-f-consent-compliance-hygiene-design.md`.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript strict, next/script, next-intl, Drizzle ORM journal format v7, Vitest (jsdom for components) + Playwright.

## Global Constraints

- i18n message files live at `messages/en.json` and `messages/es.json` (repo root). ES copy = español neutro LATAM, `tú` form.
- Tests: `npx vitest run <path>` for single files; full gate = `npx vitest run` + `npm run typecheck` + `npm run lint` (lint: ignore `.claude/worktrees/**` noise). E2E: `npx playwright test <spec>` (dev server auto-started, workers=1).
- Component tests need `// @vitest-environment jsdom` pragma (vitest default env is node).
- The pixel snippet string in MetaPixelLoader must be **verbatim** the one currently in `src/app/[locale]/layout.tsx:60-69` (same fbevents.js URL, same `fbq('init', '${pixelId}')` interpolation) — no "improvements".
- Never run `npm run db:migrate` against prod (`__drizzle_migrations` ledger is empty; hand-applied idempotent-SQL pattern stays — spec non-goal, decision recorded). The journal edit in this plan is repo-only and touches no database.
- `npm run db:generate` after the journal edit MUST produce an empty diff. If it re-emits existing tables, STOP and hand-trim per `feedback_drizzle_snapshot_stale` — do not commit a fat migration.
- PII: never log emails or birth data; no birth data in URLs. The e2e collector logs request URLs only (facebook.net script loads — no PII).
- `/privacy` is legal copy: surgical fixes only. Structural claims (e.g. "we do not use your data for advertising targeting") are founder flags, NOT edits.
- E2E must not depend on Meta uptime: abort all facebook.net/facebook.com requests via `page.route` — the `page.on('request')` collector still observes the attempt.
- Commit style: `feat(sp-f/T<n>): ...` / `fix(...)` / `test(...)` / `chore(...)`.

---

### Task 1: MetaPixelLoader — consent-gated client component (D1 + D2)

**Files:**
- Create: `src/shared/components/MetaPixelLoader.tsx`
- Test: `src/shared/components/__tests__/MetaPixelLoader.test.tsx`

**Interfaces:**
- Consumes: `getCookieConsent(): CookieConsentValue` and `type CookieConsentValue = 'accepted' | 'declined' | null` from `./PostHogProvider` (exports at `PostHogProvider.tsx:36-44`); the `estrevia:consent` CustomEvent with `detail: { consent: CookieConsentValue }` dispatched by `CookieConsent.tsx:37-39`.
- Produces: `export function MetaPixelLoader({ pixelId }: { pixelId: string }): JSX.Element | null` — renders the verbatim pixel base `<Script id="meta-pixel-base">` ONLY when `pixelId` is non-empty AND consent === 'accepted'; expires `_fbp`/`_fbc` cookies on decline (event or stored). Consumed by Task 2 (layout).
- Downstream `fbq(...)` emitters (`MetaPixelLeadEmitter.tsx:37-47`, `MetaPixelSubscribeEmitter.tsx:40-47`, `EmailGateModal.tsx:171-176`, `HeroCalculator.tsx:283-284`, `BirthDataForm.tsx:136-137`) all guard on `typeof fbq === 'function'` — verified in research, no changes needed.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/shared/components/__tests__/MetaPixelLoader.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';

// next/script with strategy="afterInteractive" defers injection to the client
// and emits nothing during a jsdom render. Replace it with a plain <script>
// tag so presence/absence can be asserted directly (same shim as the
// [locale] layout.test.tsx).
vi.mock('next/script', () => ({
  default: ({ children, id }: { children?: React.ReactNode; id?: string }) => (
    <script id={id} data-testid="meta-pixel-script">
      {children}
    </script>
  ),
}));

import { MetaPixelLoader } from '../MetaPixelLoader';
import { COOKIE_CONSENT_KEY } from '../PostHogProvider';

function dispatchConsent(consent: 'accepted' | 'declined'): void {
  window.dispatchEvent(
    new CustomEvent('estrevia:consent', { detail: { consent } }),
  );
}

/** Remove any `_fbp` / `_fbc` left over from a previous test. */
function clearMetaCookies(): void {
  document.cookie = '_fbp=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  document.cookie = '_fbc=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
}

beforeEach(() => {
  localStorage.clear();
  clearMetaCookies();
});

describe('MetaPixelLoader consent gating (SP-F D1, LIVE-7)', () => {
  it('renders nothing when no consent decision exists', () => {
    render(<MetaPixelLoader pixelId="PIX_TEST" />);
    expect(screen.queryByTestId('meta-pixel-script')).toBeNull();
  });

  it('renders nothing when consent is declined', () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, 'declined');
    render(<MetaPixelLoader pixelId="PIX_TEST" />);
    expect(screen.queryByTestId('meta-pixel-script')).toBeNull();
  });

  it('renders nothing without a pixelId even when consent is accepted', () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, 'accepted');
    render(<MetaPixelLoader pixelId="" />);
    expect(screen.queryByTestId('meta-pixel-script')).toBeNull();
  });

  it('mounts the verbatim pixel snippet when consent was already accepted', () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, 'accepted');
    render(<MetaPixelLoader pixelId="PIX_TEST" />);
    const script = screen.getByTestId('meta-pixel-script');
    expect(script.textContent).toContain("fbq('init', 'PIX_TEST')");
    expect(script.textContent).toContain("fbq('track', 'PageView')");
    expect(script.textContent).toContain('connect.facebook.net/en_US/fbevents.js');
  });

  it('mounts the pixel after an accept event without navigation', () => {
    render(<MetaPixelLoader pixelId="PIX_TEST" />);
    expect(screen.queryByTestId('meta-pixel-script')).toBeNull();
    act(() => dispatchConsent('accepted'));
    expect(screen.getByTestId('meta-pixel-script')).not.toBeNull();
  });

  it('decline event renders nothing and expires leftover _fbp/_fbc (D2)', () => {
    document.cookie = '_fbp=fb.1.1700000000000.123456789; path=/';
    document.cookie = '_fbc=fb.1.1700000000000.AbCdEf; path=/';
    render(<MetaPixelLoader pixelId="PIX_TEST" />);
    act(() => dispatchConsent('declined'));
    expect(screen.queryByTestId('meta-pixel-script')).toBeNull();
    expect(document.cookie).not.toContain('_fbp');
    expect(document.cookie).not.toContain('_fbc');
  });

  it('stored decline from a previous visit clears leftover cookies on mount (old-build migration)', () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, 'declined');
    document.cookie = '_fbp=fb.1.1700000000000.123456789; path=/';
    render(<MetaPixelLoader pixelId="PIX_TEST" />);
    expect(document.cookie).not.toContain('_fbp');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/shared/components/__tests__/MetaPixelLoader.test.tsx`
Expected: FAIL — `Cannot find module '../MetaPixelLoader'`

- [ ] **Step 3: Write the implementation**

The snippet below is copied **character-for-character** from `src/app/[locale]/layout.tsx:60-69` (only the `${pixelId}` source changes from env var to prop):

```tsx
// src/shared/components/MetaPixelLoader.tsx
'use client';

/**
 * MetaPixelLoader — consent-gated Meta Pixel base snippet.
 *
 * Replaces the previously unconditional inline snippet in [locale]/layout.tsx
 * (LIVE-7: `_fbp` was set before consent and survived Decline while the
 * cookie banner claimed "no third-party tracking").
 *
 * Behavior:
 *  - consent 'accepted' (stored, or via the `estrevia:consent` event fired by
 *    CookieConsent) → mounts the standard fbq base snippet (init + PageView)
 *    without requiring navigation.
 *  - consent absent or 'declined' → renders nothing; on decline it also
 *    expires leftover `_fbp` / `_fbc` cookies set by older (un-gated) builds.
 *  - Revoking AFTER fbevents.js has loaded cannot unload it without a reload;
 *    the banner only offers one decision per visitor (it never re-shows once
 *    a value is stored), so the accept-then-decline path is unreachable via
 *    UI. Cookie expiry covers the old-build migration case.
 *
 * Attribution trade-off (spec D3): browser pixel events now undercount by
 * the consent-decline/ignore rate; server-side CAPI is unaffected. Relaunch
 * metrics use server `landing_view` as the denominator.
 *
 * Downstream fbq() emitters (MetaPixelLeadEmitter, MetaPixelSubscribeEmitter,
 * EmailGateModal, HeroCalculator, BirthDataForm) all guard on
 * `typeof fbq === 'function'` and degrade silently pre-consent.
 */

import { useEffect, useState } from 'react';
import Script from 'next/script';
import { getCookieConsent } from './PostHogProvider';
import type { CookieConsentValue } from './PostHogProvider';

interface MetaPixelLoaderProps {
  /** Meta Pixel id (NEXT_PUBLIC_META_PIXEL_ID). Empty string → render nothing. */
  pixelId: string;
}

/**
 * Expire `_fbp` / `_fbc` on both the host-only and dotted-root-domain
 * variants — fbevents.js sets them on the registrable domain
 * (e.g. `.estrevia.app`), while dev/tests run on bare `localhost`.
 */
function expireMetaCookies(): void {
  const past = 'Thu, 01 Jan 1970 00:00:00 GMT';
  const rootDomain = window.location.hostname.replace(/^www\./, '');
  for (const name of ['_fbp', '_fbc']) {
    document.cookie = `${name}=; expires=${past}; path=/`;
    document.cookie = `${name}=; expires=${past}; path=/; domain=.${rootDomain}`;
  }
}

export function MetaPixelLoader({ pixelId }: MetaPixelLoaderProps) {
  // null until the mount effect reads localStorage — SSR and first client
  // paint never render the script, so no facebook request can precede the
  // consent read.
  const [consent, setConsent] = useState<CookieConsentValue>(null);

  useEffect(() => {
    // localStorage can throw in private mode — a failed read means "no consent".
    let stored: CookieConsentValue = null;
    try {
      stored = getCookieConsent();
    } catch {
      stored = null;
    }
    setConsent(stored);

    // Migration case: visitor declined (now, or under the old un-gated build)
    // but `_fbp` / `_fbc` from that build are still on the domain — clear them.
    if (stored === 'declined') {
      expireMetaCookies();
    }

    function handleConsentChange(event: Event) {
      const { detail } = event as CustomEvent<{ consent: CookieConsentValue }>;
      setConsent(detail.consent);
      if (detail.consent === 'declined') {
        expireMetaCookies();
      }
    }

    window.addEventListener('estrevia:consent', handleConsentChange);
    return () => {
      window.removeEventListener('estrevia:consent', handleConsentChange);
    };
  }, []);

  if (!pixelId || consent !== 'accepted') return null;

  return (
    <Script id="meta-pixel-base" strategy="afterInteractive">
      {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${pixelId}');
fbq('track', 'PageView');`}
    </Script>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/shared/components/__tests__/MetaPixelLoader.test.tsx`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/shared/components/MetaPixelLoader.tsx src/shared/components/__tests__/MetaPixelLoader.test.tsx
git commit -m "feat(sp-f/T1): consent-gated MetaPixelLoader — pixel only after accept, decline expires _fbp/_fbc"
```

---

### Task 2: Excise the pixel from the locale layout (D1 wiring)

**Files:**
- Modify: `src/app/[locale]/layout.tsx` (doc comment :22-25, `Script` import :4, pixel block :57-84)
- Test: `src/app/[locale]/__tests__/layout.test.tsx` (rewrite — it currently encodes the OLD unconditional-snippet behavior)

**Interfaces:**
- Consumes: `MetaPixelLoader` from Task 1 (`@/shared/components/MetaPixelLoader`).
- Produces: layout renders `<MetaPixelLoader pixelId={pixelId ?? ''} />` **unconditionally** (see deviation note below) and never emits the inline snippet or the `<noscript>` facebook.com/tr img. Server HTML contains zero facebook references.
- Deviation from spec D1 letter: the spec shows `{pixelId ? <MetaPixelLoader .../> : null}`. We mount the loader even when the env var is unset (with `pixelId=''`) so the D2 decline-cleanup of leftover `_fbp`/`_fbc` still runs on installs that later unset the pixel env — the loader renders no script without a pixelId (Task 1 guard), so behavior is otherwise identical. The `<noscript>` img is REMOVED per spec (cannot be consent-gated; value ~zero — ad clicks come from JS-capable in-app browsers).

- [ ] **Step 1: Rewrite the layout test to the new contract (failing first)**

Replace the entire contents of `src/app/[locale]/__tests__/layout.test.tsx` with:

```tsx
// src/app/[locale]/__tests__/layout.test.tsx
// @vitest-environment jsdom

/**
 * Smoke test for LocaleLayout — Meta Pixel mounting (consent-gated, SP-F).
 *
 * The layout no longer inlines the pixel snippet; it renders the client
 * component <MetaPixelLoader pixelId=…> which gates the snippet on cookie
 * consent. The layout-level contract is: pass the env pixel id through
 * (empty string when unset, so decline-cleanup still runs), and never emit
 * the inline fbq snippet or the un-gateable <noscript> tracking img in
 * server HTML.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import type React from 'react';

vi.mock('next-intl/server', () => ({
  getMessages: async () => ({}),
  setRequestLocale: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('notFound() called unexpectedly in test');
  }),
}));

vi.mock('@/shared/components/MetaPixelLoader', () => ({
  MetaPixelLoader: ({ pixelId }: { pixelId: string }) => (
    <div data-testid="meta-pixel-loader" data-pixel-id={pixelId} />
  ),
}));

import LocaleLayout from '../layout';

describe('LocaleLayout — consent-gated Meta Pixel mounting', () => {
  const ORIGINAL_PIXEL = process.env.NEXT_PUBLIC_META_PIXEL_ID;

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_META_PIXEL_ID;
  });

  afterEach(() => {
    if (ORIGINAL_PIXEL === undefined) {
      delete process.env.NEXT_PUBLIC_META_PIXEL_ID;
    } else {
      process.env.NEXT_PUBLIC_META_PIXEL_ID = ORIGINAL_PIXEL;
    }
  });

  it('passes the env pixel id through to MetaPixelLoader', async () => {
    process.env.NEXT_PUBLIC_META_PIXEL_ID = 'PIX_TEST';
    const element = await LocaleLayout({
      children: 'CHILDREN',
      params: Promise.resolve({ locale: 'en' }),
    });
    const html = renderToString(element as React.ReactElement);
    expect(html).toContain('data-pixel-id="PIX_TEST"');
  });

  it('mounts the loader with an empty pixelId when the env var is unset (decline cleanup still runs)', async () => {
    const element = await LocaleLayout({
      children: 'CHILDREN',
      params: Promise.resolve({ locale: 'en' }),
    });
    const html = renderToString(element as React.ReactElement);
    expect(html).toContain('data-pixel-id=""');
  });

  it('never emits the inline fbq snippet or the noscript tracking img (LIVE-7)', async () => {
    process.env.NEXT_PUBLIC_META_PIXEL_ID = 'PIX_TEST';
    const element = await LocaleLayout({
      children: 'CHILDREN',
      params: Promise.resolve({ locale: 'en' }),
    });
    const html = renderToString(element as React.ReactElement);
    expect(html).not.toContain('fbq(');
    expect(html).not.toContain('connect.facebook.net');
    expect(html).not.toContain('facebook.com/tr');
    expect(html).not.toContain('<noscript>');
  });
});
```

- [ ] **Step 2: Run to verify it fails against the current layout**

Run: `npx vitest run "src/app/[locale]/__tests__/layout.test.tsx"`
Expected: FAIL — tests 1-2 find no `data-pixel-id` in output; the third test finds `facebook.com/tr` and `<noscript>` in server HTML (real next/script emits no inline fbq body during renderToString, so the `fbq(`/`connect.facebook.net` assertions pass even pre-fix).

- [ ] **Step 3: Implement the layout change**

In `src/app/[locale]/layout.tsx`:

1. Line 4: delete `import Script from 'next/script';` and add `import { MetaPixelLoader } from '@/shared/components/MetaPixelLoader';` (keep import order: next-intl, next/navigation, then `@/` aliases).
2. Replace doc-comment responsibility 4 (lines 22-25) with:

```
 *  4. Mount the consent-gated Meta Pixel loader — companion to the
 *     server-side CAPI client. The base snippet lives in MetaPixelLoader
 *     and only runs after cookie-consent 'accepted' (LIVE-7). Without
 *     NEXT_PUBLIC_META_PIXEL_ID the Pixel quietly no-ops.
```

3. Replace the pixel block (the whole `{pixelId ? (…) : null}` expression, lines 57-84) with:

```tsx
      {/* Consent-gated Meta Pixel (LIVE-7). Mounted even without a pixelId so
          the loader can expire leftover `_fbp`/`_fbc` cookies for declined
          visitors; the snippet itself renders only with BOTH a pixelId and
          consent === 'accepted'. The old <noscript> tracking img is gone —
          it could never be consent-gated (noscript users cannot consent). */}
      <MetaPixelLoader pixelId={pixelId ?? ''} />
```

The `const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;` line (:53) and its comment stay; `<UtmCapture />` and `{children}` stay unchanged below.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run "src/app/[locale]/__tests__/layout.test.tsx" src/shared/components/__tests__/MetaPixelLoader.test.tsx`
Expected: PASS (10 tests)

- [ ] **Step 5: Grep for stragglers**

Run: `grep -rn "meta-pixel-base\|facebook.com/tr\|connect.facebook" src/ --include="*.tsx" --include="*.ts" | grep -v __tests__ | grep -v MetaPixelLoader`
Expected: zero hits (the snippet now exists ONLY in MetaPixelLoader; server-side CAPI uses graph.facebook.com under `src/modules/advertising/meta-capi/` which this grep deliberately does not match).

- [ ] **Step 6: Commit**

```bash
git add "src/app/[locale]/layout.tsx" "src/app/[locale]/__tests__/layout.test.tsx"
git commit -m "fix(sp-f/T2): LIVE-7 — excise unconditional pixel snippet + noscript img from locale layout"
```

---

### Task 3: E2E — no facebook requests pre-consent; Decline clears `_fbp`

**Files:**
- Create: `tests/e2e/meta-pixel-consent.spec.ts` (new spec file — `tests/e2e/landing.spec.ts` is NOT touched; SP-E Task 4 appends to it in the same wave, and a fresh Playwright context is all this suite needs)

**Interfaces:**
- Consumes: cookie banner `role="dialog"` + `aria-label="Cookie consent"` (`CookieConsent.tsx:58-60`), buttons "Accept"/"Decline" (`CookieConsent.tsx:118,135` — matched with `/accept/i`, `/decline/i` regexes so SP-B's i18n pass doesn't break EN runs); consent localStorage key stays absent (fresh Playwright context per test).
- Produces: regression coverage for the spec's success criterion "no `_fbp` cookie, no facebook requests until Accept; Decline leaves none and clears leftovers".

- [ ] **Step 1: Create the spec file**

Create `tests/e2e/meta-pixel-consent.spec.ts` with the following contents:

```ts
// tests/e2e/meta-pixel-consent.spec.ts
import { test, expect, type Page } from '@playwright/test';

test.describe('Meta Pixel consent gating (SP-F, LIVE-7)', () => {
  /**
   * Collector + firewall: records every request aimed at facebook.net /
   * facebook.com and aborts it so the test never depends on Meta uptime.
   * page.on('request') fires before the route handler aborts, so aborted
   * attempts are still observed.
   */
  async function collectFacebookRequests(page: Page): Promise<string[]> {
    const requests: string[] = [];
    await page.route(/facebook\.(net|com)/, (route) => route.abort());
    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('facebook.net') || url.includes('facebook.com')) {
        requests.push(url);
      }
    });
    return requests;
  }

  test('no facebook request or _fbp cookie before consent; Accept mounts the pixel', async ({ page, context }) => {
    const fbRequests = await collectFacebookRequests(page);

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    // Banner renders after an 800ms delay (CookieConsent.tsx:25).
    const banner = page.getByRole('dialog', { name: /cookie consent/i });
    await expect(banner).toBeVisible({ timeout: 15_000 });

    // Pre-consent: total silence toward Meta.
    expect(fbRequests).toHaveLength(0);
    const preCookies = await context.cookies();
    expect(preCookies.find((c) => c.name === '_fbp')).toBeUndefined();

    await banner.getByRole('button', { name: /accept/i }).click();

    // Positive branch only when the dev server has NEXT_PUBLIC_META_PIXEL_ID
    // set: the base snippet defines window.fbq synchronously on mount. When
    // the env var is unset MetaPixelLoader renders no script — the gating
    // assertions above are still meaningful, so don't fail the suite.
    const pixelConfigured = await page
      .waitForFunction(
        () => typeof (window as { fbq?: unknown }).fbq === 'function',
        undefined,
        { timeout: 5_000 },
      )
      .then(() => true)
      .catch(() => false);
    if (pixelConfigured) {
      expect(fbRequests.length).toBeGreaterThan(0);
    }
  });

  test('Decline keeps facebook silent and clears leftover _fbp', async ({ page, context }) => {
    // Old-build migration case (spec D2): `_fbp` already on the domain from
    // a visit before the pixel was consent-gated.
    await context.addCookies([
      { name: '_fbp', value: 'fb.1.1700000000000.123456789', url: 'http://localhost:3000' },
    ]);
    const fbRequests = await collectFacebookRequests(page);

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    const banner = page.getByRole('dialog', { name: /cookie consent/i });
    await expect(banner).toBeVisible({ timeout: 15_000 });

    await banner.getByRole('button', { name: /decline/i }).click();
    await expect(banner).toBeHidden();

    expect(fbRequests).toHaveLength(0);
    // expireMetaCookies runs synchronously in the consent event handler —
    // poll only to absorb Playwright cookie-jar propagation.
    await expect
      .poll(async () => (await context.cookies()).some((c) => c.name === '_fbp'))
      .toBe(false);
  });
});
```

- [ ] **Step 2: Run the new tests**

Run: `npx playwright test tests/e2e/meta-pixel-consent.spec.ts`
Expected: PASS (2 tests). Sanity-check regression detection: temporarily re-add `fbq('track', 'PageView')` unconditionally… is not practical post-excision — instead verify the decline test catches a broken cleanup by temporarily commenting out the `expireMetaCookies()` call in the `handleConsentChange` of MetaPixelLoader, re-running (expect FAIL on the `_fbp` poll), then restoring.

- [ ] **Step 3: Run both e2e specs together (no cross-suite interference)**

Run: `npx playwright test tests/e2e/landing.spec.ts tests/e2e/meta-pixel-consent.spec.ts`
Expected: PASS (existing 13 landing tests + 2 new; `landing.spec.ts` itself is untouched by this task)

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/meta-pixel-consent.spec.ts
git commit -m "test(sp-f/T3): e2e — zero facebook requests pre-consent; decline clears leftover _fbp"
```

---

### Task 4: Drizzle journal repair + permanent integrity test (D4)

**Files:**
- Modify: `drizzle/meta/_journal.json` (insert idx 13; fix `when` on idx 14-17)
- Test: `drizzle/__tests__/journal.test.ts` (new — picked up by vitest's default include; node env)

**Interfaces:**
- Consumes: on-disk migrations `drizzle/0000_huge_snowbird.sql` … `drizzle/0018_discount_blast_emails.sql` (19 files, all verified present).
- Produces: journal with contiguous idx 0-18 and strictly-increasing `when`; a permanent test that fails on any future journal drift. **No database is touched** — prod stays on the hand-applied idempotent-SQL pattern (spec non-goal, decision recorded).
- Current defects being fixed: idx 13 (`0013_curiosity_hook_renumber`) absent entirely; idx 14-17 carry `when` = 1748044800000-1748044803000 (2025-05-24 — one year off, LOWER than idx 12's 1779065701170, so drizzle's `folderMillis > last-applied` ordering silently skips them).

- [ ] **Step 1: Write the failing integrity test**

```ts
// drizzle/__tests__/journal.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Drizzle journal integrity (SP-F D4).
 *
 * The migrator applies entries where folderMillis (`when`) exceeds the
 * last-applied created_at — non-monotonic `when` values make it silently
 * skip migrations (this actually happened: idx 14-17 shipped with 2025
 * epochs below idx 12). This test makes any future drift a CI failure.
 *
 * Note: prod migrations stay hand-applied (idempotent SQL via Pool+ws);
 * this test guards the journal's internal consistency only.
 */

const DRIZZLE_DIR = path.resolve(__dirname, '..');

interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

const journal = JSON.parse(
  readFileSync(path.join(DRIZZLE_DIR, 'meta', '_journal.json'), 'utf8'),
) as { entries: JournalEntry[] };

describe('drizzle journal integrity', () => {
  it('idx values are contiguous from 0', () => {
    journal.entries.forEach((entry, i) => {
      expect(entry.idx).toBe(i);
    });
  });

  it('when timestamps are strictly increasing (migrator ordering)', () => {
    for (let i = 1; i < journal.entries.length; i++) {
      expect(
        journal.entries[i].when,
        `entry idx ${journal.entries[i].idx} (${journal.entries[i].tag}) must be after ${journal.entries[i - 1].tag}`,
      ).toBeGreaterThan(journal.entries[i - 1].when);
    }
  });

  it('every journal tag has a matching .sql migration file', () => {
    for (const entry of journal.entries) {
      expect(
        existsSync(path.join(DRIZZLE_DIR, `${entry.tag}.sql`)),
        `missing drizzle/${entry.tag}.sql`,
      ).toBe(true);
    }
  });

  it('every on-disk migration .sql is registered in the journal', () => {
    const onDisk = readdirSync(DRIZZLE_DIR)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => f.replace(/\.sql$/, ''))
      .sort();
    const registered = journal.entries.map((e) => e.tag).sort();
    expect(registered).toEqual(onDisk);
  });
});
```

- [ ] **Step 2: Run to verify it fails against the current journal**

Run: `npx vitest run drizzle/__tests__/journal.test.ts`
Expected: FAIL — 3 of 4 tests: idx jumps 12→14 (contiguity), idx 14 `when` 1748044800000 < idx 12's 1779065701170 (ordering), `0013_curiosity_hook_renumber` on disk but unregistered

- [ ] **Step 3: Hand-edit the journal**

Two edits to `drizzle/meta/_journal.json` (all other entries byte-identical):

1. Insert the idx 13 entry between idx 12 and idx 14 (`when` = idx 12's value + 1, keeping monotonicity without inventing a fake date):

```json
    {
      "idx": 13,
      "version": "7",
      "when": 1779065701171,
      "tag": "0013_curiosity_hook_renumber",
      "breakpoints": true
    },
```

2. Rewrite `when` on idx 14-17 to real 2026-05-24 epochs (the date of commit cdc69f6 which hand-added them), preserving their +1000ms spacing:

| idx | tag | old `when` (2025!) | new `when` |
|-----|-----|--------------------|------------|
| 14 | 0014_paywall_teaser_abtest | 1748044800000 | 1779580800000 |
| 15 | 0015_cart_abandon_emails | 1748044801000 | 1779580801000 |
| 16 | 0016_trial_expiration_emails | 1748044802000 | 1779580802000 |
| 17 | 0017_dunning_emails | 1748044803000 | 1779580803000 |

Resulting order check: 1779065701170 (12) < 1779065701171 (13) < 1779580800000 (14) < … < 1779580803000 (17) < 1780185031049 (18) — strictly increasing.

- [ ] **Step 4: Run the integrity test to verify it passes**

Run: `npx vitest run drizzle/__tests__/journal.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: db:generate empty-diff sanity check (spec error-handling: journal edit is all-or-nothing)**

Run: `npm run db:generate`
Expected: drizzle-kit reports no schema changes ("No schema changes, nothing to migrate 😴") and `git status --porcelain drizzle/` shows ONLY `M drizzle/meta/_journal.json` + the new test file — no new .sql, no new snapshot. The committed 0018 snapshot is the healed baseline, so this is the expected outcome. If drizzle-kit DOES emit files: do NOT commit them — delete the emitted files, then investigate per `feedback_drizzle_snapshot_stale` (hand-trim to your delta only) before proceeding; the journal edit commits only after this check passes.

- [ ] **Step 6: Commit**

```bash
git add drizzle/meta/_journal.json drizzle/__tests__/journal.test.ts
git commit -m "chore(sp-f/T4): repair drizzle journal — register idx 13, fix 2025-epoch when on 14-17, add integrity test"
```

---

### Task 5: `.env.example` completeness (D5)

**Files:**
- Modify: `.env.example` (two insertion points: after :105 `META_CAPI_TEST_EVENT_CODE=`, after :158 `RESEND_WEBHOOK_SECRET=`; plus a verify-present check for `COMPANY_POSTAL_ADDRESS` — see Step 3)
- Test: `src/shared/lib/__tests__/env-example.test.ts` (new)

**Interfaces:**
- Consumes: verified usage sites — `DRY_RUN` (`src/shared/lib/trial-expiration-email.ts:71`), `CART_ABANDON_DRY_RUN` (`src/app/api/cron/cart-abandon-daily/route.ts:44`, defaults dry), `DUNNING_DRY_RUN` (`src/shared/lib/dunning-emails.ts:253`), `META_CAPI_GRAPH_VERSION` (`src/modules/advertising/meta-capi/index.ts:35`, default v22.0), `COMPANY_POSTAL_ADDRESS` (`src/emails/components/EmailLayout.tsx:33` — THROWS for commercial emails when unset).
- Cross-plan ownership: `TRIAL_WINBACK_COUPON_CODE` is deliberately NOT handled here — SP-C T8 (same wave) removes its only src/ read and SP-C T6 owns the coupon block at `.env.example:41`; adding it here would break SP-C's pinned state and guarantee a merge conflict. `COMPANY_POSTAL_ADDRESS` in `.env.example` is owned by cro-phase0 T14 (committed, executes first) — this task only verifies presence and pins it in the test.
- Produces: `.env.example` documents every env var src/ reads except platform-injected ones (`NODE_ENV`, `NEXT_RUNTIME`, `VERCEL_ENV`, `VERCEL_URL`, `NEXT_PUBLIC_VERCEL_URL`, `VITEST` — spec D5 skips these).

- [ ] **Step 1: Write the failing test**

```ts
// src/shared/lib/__tests__/env-example.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * .env.example completeness (SP-F D5): every env var read in src/ must be
 * documented (platform-injected vars excluded — NODE_ENV, VERCEL_*, VITEST).
 * The audit grep lives in the SP-F plan Task 5 Step 4; this test pins the
 * keys that were found missing so they cannot regress.
 */

const envExample = readFileSync(path.resolve(process.cwd(), '.env.example'), 'utf8');
const declaredKeys = new Set(
  envExample
    .split('\n')
    .filter((line) => /^[A-Z0-9_]+=/.test(line))
    .map((line) => line.split('=')[0]),
);

describe('.env.example completeness', () => {
  // TRIAL_WINBACK_COUPON_CODE is intentionally NOT pinned: SP-C T8 (same
  // wave) removes its only src/ read, and SP-C T6 owns the coupon block in
  // .env.example — pinning it here would go red the moment SP-C lands.
  it.each([
    'DRY_RUN',
    'CART_ABANDON_DRY_RUN',
    'DUNNING_DRY_RUN',
    'META_CAPI_GRAPH_VERSION',
    'COMPANY_POSTAL_ADDRESS',
  ])('documents %s', (key) => {
    expect(declaredKeys.has(key)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/shared/lib/__tests__/env-example.test.ts`
Expected: FAIL — 4 of 5 keys missing (`DRY_RUN`, `CART_ABANDON_DRY_RUN`, `DUNNING_DRY_RUN`, `META_CAPI_GRAPH_VERSION`); `COMPANY_POSTAL_ADDRESS` already passes because cro-phase0 T14 (executed first) appended it. If it ALSO fails, T14 has not run yet — see the fallback in Step 3.

- [ ] **Step 3: Add the entries to `.env.example`**

(Deliberately NO coupon-code insertion at line 41: SP-C T6 owns the coupon block after `STRIPE_COUPON_HALF50=`, and SP-C T8 removes the `TRIAL_WINBACK_COUPON_CODE` read from src/ — see the cross-plan ownership note in Interfaces.)

Insertion 1 — after line 105 (`META_CAPI_TEST_EVENT_CODE=`), before the `# Facebook Page` comment:

```
# Meta Graph API version for server-side CAPI calls
# (src/modules/advertising/meta-capi/index.ts). Defaults to v22.0 when unset.
META_CAPI_GRAPH_VERSION=
```

Insertion 2 — in the `# Email retention` section, after line 158 (`RESEND_WEBHOOK_SECRET=`):

```
# Dry-run gates for lifecycle email senders. Semantics DIFFER — read carefully:
#   DRY_RUN=true          → trial-expiration emails log instead of sending (unset = live)
#   DUNNING_DRY_RUN=true  → dunning emails log instead of sending (unset = live)
#   CART_ABANDON_DRY_RUN  → defaults to TRUE (dry); set to "false" to enable real sends
DRY_RUN=
DUNNING_DRY_RUN=
CART_ABANDON_DRY_RUN=true
```

`COMPANY_POSTAL_ADDRESS` — verify present, do NOT insert a duplicate: cro-phase0 T14 (committed, executes before this plan) appends it to `.env.example`. Run `grep -n "^COMPANY_POSTAL_ADDRESS=" .env.example`; expect exactly one hit. Only if it is missing (T14 not yet executed) insert it near the email section with:

```
# CAN-SPAM §5 — physical postal address rendered in every commercial
# (unsubscribe-bearing) email footer. EmailLayout THROWS when a commercial
# email renders without it — set in Vercel prod BEFORE deploying marketing
# sends (transactional emails are exempt and render without it).
COMPANY_POSTAL_ADDRESS=
```

- [ ] **Step 4: Run the audit grep (spec success criterion "spot-check via the audit grep")**

Run:
```bash
comm -23 \
  <(grep -rhoE "process\.env\.[A-Z0-9_]+" src/ | sed 's/process\.env\.//' | sort -u) \
  <(grep -oE "^[A-Z0-9_]+" .env.example | sort -u)
```
Expected: only platform/framework-injected names remain — `NODE_ENV`, `NEXT_RUNTIME`, `VERCEL_ENV`, `VERCEL_URL`, `NEXT_PUBLIC_VERCEL_URL`, `VITEST` (spec D5 records these as deliberately skipped). `TRIAL_WINBACK_COUPON_CODE` may also appear until SP-C T8 (same wave) removes its src/ read — it is SP-C-owned, do NOT add it here. Any OTHER name in the output is a new gap — add it with a one-line comment before committing.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/shared/lib/__tests__/env-example.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add .env.example src/shared/lib/__tests__/env-example.test.ts
git commit -m "chore(sp-f/T5): .env.example — document dry-run gates + CAPI graph version, pin completeness test"
```

---

### Task 6: `/privacy` copy alignment + founder flags (D6)

**Files:**
- Modify: `messages/en.json` (`privacyPage.s7Footer` :1477; new `tpMetaPurpose`/`tpMetaData` after `tpSentryData` :1437)
- Modify: `messages/es.json` (`privacyPage.s7Footer` :1480; new keys after `tpSentryData` :1440)
- Modify: `src/app/[locale]/(marketing)/privacy/page.tsx` (new `<ThirdParty>` entry after the Sentry block :191-197)
- Test: `src/app/[locale]/(marketing)/privacy/__tests__/privacy-copy.test.ts` (new)

**Interfaces:**
- Consumes: `privacyPage` i18n namespace; `ThirdParty` helper component defined in the same page file (:409-443, props `name/purpose/link/data/dataPrefix`); existing `t('tpDataSharedPrefix')` key.
- Produces: `/privacy` no longer claims "We do not use advertising cookies" (factually false post-D1 — Meta Pixel sets `_fbp`, an advertising cookie, after Accept); Meta appears in the third-party services list. Structural legal claims are FLAGGED, not edited (see Step 6).
- Audit result (page read in full during planning): the page itself is 100% i18n-driven — the only false claim is `s7Footer`; `s2NotSell` ("use it for advertising targeting") is structural; Meta is absent from the third-party list (Clerk/Stripe/PostHog/Neon/Vercel/Resend/Sentry only).

- [ ] **Step 1: Write the failing test**

```ts
// src/app/[locale]/(marketing)/privacy/__tests__/privacy-copy.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * SP-F D6: /privacy must not contradict the consent-gated Meta Pixel.
 * Message-level assertions (the page renders privacyPage.* keys verbatim).
 */

const en = JSON.parse(
  readFileSync(path.resolve(process.cwd(), 'messages/en.json'), 'utf8'),
) as { privacyPage: Record<string, string> };
const es = JSON.parse(
  readFileSync(path.resolve(process.cwd(), 'messages/es.json'), 'utf8'),
) as { privacyPage: Record<string, string> };

describe('privacy page copy vs consent-gated pixel (D6)', () => {
  it('EN s7Footer no longer denies advertising cookies and names Meta Pixel', () => {
    expect(en.privacyPage.s7Footer).not.toContain('We do not use advertising cookies');
    expect(en.privacyPage.s7Footer).toContain('Meta Pixel');
  });

  it('ES s7Footer no longer denies advertising cookies and names Meta Pixel', () => {
    expect(es.privacyPage.s7Footer).not.toContain('No usamos cookies de publicidad');
    expect(es.privacyPage.s7Footer).toContain('Meta Pixel');
  });

  it('Meta appears in the third-party services strings, both locales', () => {
    for (const messages of [en, es]) {
      expect(messages.privacyPage.tpMetaPurpose).toBeTruthy();
      expect(messages.privacyPage.tpMetaData).toBeTruthy();
    }
  });

  it('the privacy page renders the Meta third-party entry', () => {
    const pageSource = readFileSync(
      path.resolve(process.cwd(), 'src/app/[locale]/(marketing)/privacy/page.tsx'),
      'utf8',
    );
    expect(pageSource).toContain("t('tpMetaPurpose')");
    expect(pageSource).toContain("t('tpMetaData')");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run "src/app/[locale]/(marketing)/privacy/__tests__/privacy-copy.test.ts"`
Expected: FAIL — all 4 tests (old s7Footer text; tpMeta keys absent)

- [ ] **Step 3: Edit the message files**

`messages/en.json`:

1. Line 1477, replace the `s7Footer` value:

```json
    "s7Footer": "You can withdraw analytics consent at any time by clearing your browser's localStorage or contacting us. Advertising cookies (Meta Pixel) are set only after you accept cookies — if you decline, they are never installed, and we never send your birth data to advertisers.",
```

2. After line 1437 (`"tpSentryData": "Error stack traces, anonymised user context",`), insert:

```json
    "tpMetaPurpose": "Ad measurement (Meta Pixel + Conversions API)",
    "tpMetaData": "Page-view and conversion events; the browser pixel loads only after you accept cookies — never birth data",
```

`messages/es.json`:

1. Line 1480, replace the `s7Footer` value:

```json
    "s7Footer": "Puedes retirar el consentimiento de análisis en cualquier momento borrando el localStorage de tu navegador o contactándonos. Las cookies publicitarias (Meta Pixel) se activan solo si aceptas las cookies — si las rechazas, nunca se instalan, y nunca enviamos tus datos de nacimiento a anunciantes.",
```

2. After line 1440 (`"tpSentryData": "Rastros de error, contexto de usuario anonimizado",`), insert:

```json
    "tpMetaPurpose": "Medición de anuncios (Meta Pixel + API de Conversiones)",
    "tpMetaData": "Eventos de vista de página y conversión; el píxel del navegador se carga solo si aceptas las cookies — nunca datos de nacimiento",
```

- [ ] **Step 4: Add the Meta entry to the third-party list**

In `src/app/[locale]/(marketing)/privacy/page.tsx`, immediately after the Sentry `<ThirdParty …/>` block (lines 191-197), insert:

```tsx
            <ThirdParty
              name="Meta"
              purpose={t('tpMetaPurpose')}
              link="https://www.facebook.com/privacy/policy/"
              data={t('tpMetaData')}
              dataPrefix={t('tpDataSharedPrefix')}
            />
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run "src/app/[locale]/(marketing)/privacy/__tests__/privacy-copy.test.ts"`
Expected: PASS (4 tests)

- [ ] **Step 6: Record the founder flags (do NOT edit these — report them in the end-of-plan summary)**

Two structural legal claims were audited and deliberately left untouched; surface both verbatim to the founder:

1. `privacyPage.s2NotSell` (en.json:1414 / es.json:1417): "We do not sell your data, use it for advertising targeting, or share it with data brokers." — Meta Pixel + CAPI conversion events feed Meta's ad-delivery optimization; whether that constitutes "advertising targeting" is a legal judgment for the founder (options: keep as-is, narrow to "we do not sell your data or share it with data brokers", or add a Meta carve-out).
2. Cookie banner desktop copy (`CookieConsent.tsx:91-93`): "No ads, no third-party tracking." — remains false-adjacent even post-D1 (the pixel IS third-party tracking after Accept). Banner strings ship via **SP-B's i18n work** per the SP-F spec; the founder/SP-B implementer must reword to match the mechanism (e.g. "Analytics and — only if you accept — ad-measurement cookies.").

- [ ] **Step 7: Commit**

```bash
git add messages/en.json messages/es.json "src/app/[locale]/(marketing)/privacy/page.tsx" "src/app/[locale]/(marketing)/privacy/__tests__/privacy-copy.test.ts"
git commit -m "fix(sp-f/T6): /privacy aligned with consent-gated pixel — s7Footer truthful, Meta listed as third party"
```

---

### Task 7: Full verification gate

**Files:**
- None modified — verification only.

**Interfaces:**
- Consumes: everything shipped in T1-T6.
- Produces: green gate + evidence for the end-of-plan summary.

- [ ] **Step 1: Full unit suite**

Run: `npx vitest run`
Expected: PASS, zero failures (baseline was 2265+ tests; T1-T6 add ~24)

- [ ] **Step 2: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: typecheck clean; lint reports no NEW issues in files this plan touched (ignore pre-existing `.claude/worktrees/**` noise per `feedback_lint_worktrees_pollution`)

- [ ] **Step 3: E2E**

Run: `npx playwright test tests/e2e/landing.spec.ts tests/e2e/meta-pixel-consent.spec.ts`
Expected: PASS (including the two Task 3 tests in `meta-pixel-consent.spec.ts`)

- [ ] **Step 4: Manual devtools smoke (evidence for the spec's success criteria)**

Run `npm run dev` with `NEXT_PUBLIC_META_PIXEL_ID` set in `.env`, then in a fresh incognito window on `http://localhost:3000`:
1. Before touching the banner: DevTools → Application → Cookies shows NO `_fbp`; Network filtered to `facebook` shows zero requests.
2. Click Decline: still no `_fbp`, still zero facebook requests (reload once to confirm persistence).
3. Clear site data, reload, click Accept: `connect.facebook.net/en_US/fbevents.js` request appears and `_fbp` is set.
Record the three observations in the end-of-plan summary alongside the Task 6 Step 6 founder flags.

- [ ] **Step 5: Commit (only if steps 1-3 required fixes; otherwise nothing to commit)**

```bash
git add -A && git commit -m "chore(sp-f/T7): verification-gate fixes"
```

---

## Self-review notes

**Spec-coverage mapping:**
- Goal 1 (no `_fbp` / no facebook request before consent or after Decline) → T1 (mechanism), T2 (wiring + noscript removal), T3 (e2e proof), T7 Step 4 (manual devtools evidence).
- Goal 2 (copy tells the truth) → T6 (privacy page — the part this spec owns); banner strings deferred to SP-B per spec, coordination flag recorded in T6 Step 6.
- Goal 3 (journal internally consistent, manual-apply discipline kept) → T4; discipline restated in Global Constraints + journal test header comment.
- Goal 4 (`.env.example` complete) → T5 including the audit-grep spot-check from the success criteria.
- D1 (consent-gated client loader, verbatim snippet, noscript removed, downstream fbq no-op) → T1 + T2. D2 (Decline expires `_fbp`/`_fbc`) → T1 (`expireMetaCookies`), e2e-proven in T3. D3 (attribution trade-off, no code) → recorded in the MetaPixelLoader header comment; runbook denominator decision lives in Phase 0 T11, out of this plan. D4 (journal repair + empty-diff verify) → T4. D5 (env additions) → T5. D6 (privacy audit, surgical edits + structural founder flags) → T6.
- Testing section of the spec → unit (T1), layout regression (T2), journal assertions (T4), e2e facebook-request collector (T3), full gate (T7).

**Deviations (all with rationale):**
1. **MetaPixelLoader mounts unconditionally** (`pixelId ?? ''`) instead of the spec's `{pixelId ? … : null}` — the D2 decline-cleanup must run even when the pixel env var is absent (e2e Decline test would otherwise fail on env-less dev servers, and real declined visitors would keep stale `_fbp` if the founder ever unsets the var). The no-pixelId path renders nothing (guard in T1), so observable behavior is otherwise identical.
2. **Stored-decline cleanup on mount** (T1) — spec D2 only names the event path; the stored path covers visitors who declined under the old build and never see the banner again. Strict superset required by the success criterion "Decline leaves none and clears leftovers".
3. **`COMPANY_POSTAL_ADDRESS` pinned in the completeness test but only verify-present in `.env.example`** — cro-phase0 T14 (committed, executes first) owns the insertion; T5 inserts it only if T14 somehow hasn't run. It stays in the pinned test because EmailLayout THROWS without it and the spec's success criterion 4 demands every src/-read var be documented. `TRIAL_WINBACK_COUPON_CODE` is excluded from both the test and the insertions — SP-C T8 removes its src/ read and SP-C T6 owns the coupon block at `.env.example:41` (same wave; avoiding a pinned-test regression and a merge conflict).
4. **e2e in a new `tests/e2e/meta-pixel-consent.spec.ts`** rather than the spec's "extends paywall/landing specs" pair — a fresh Playwright context is all the suite needs, and SP-E Task 4 appends to `landing.spec.ts` in the same wave (appending here too would guarantee a merge conflict); duplicating the collector in paywall-cta.spec.ts would add Clerk-rate-limit surface without new coverage.
5. **Accept-path positive assertion is env-conditional** (skips when the dev server lacks `NEXT_PUBLIC_META_PIXEL_ID`) — the negative assertions (the actual compliance property) always run.

**Deliberately-untouched hazards:**
- `CookieConsent.tsx` copy ("No ads, no third-party tracking", hardcoded EN) — SP-B owns banner strings; flagged in T6 Step 6, not edited (avoids append-conflict with SP-B's i18n pass).
- `privacyPage.s2NotSell` — structural legal claim; founder flag only (spec D6 instruction).
- `__drizzle_migrations` prod ledger backfill / making `db:migrate` authoritative — explicit spec non-goal; journal edit is repo-only.
- Downstream `fbq()` emitters — verified no-op-safe; changing them would add consent logic in five places for zero behavior change.
- `fbq('consent', 'revoke'/'grant')` alternative remediation — rejected by spec D1 in favor of not loading fbevents.js at all (the noscript img and pre-init `_fbp` can't be fixed by the consent API).
- Consent-rate optimization and CookieConsent visual changes (incl. LIVE-1 z-index clash) — audit exclusions / other sub-projects.
