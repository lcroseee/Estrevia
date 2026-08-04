# Clerk Route-Group Move — Design + Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use `- [ ]`.

**Status:** Design + plan. Deferred from the SEO roadmap (roadmap §5) as its own spec because of its auth blast-radius. **Ships AFTER Phase 1/2 indexation, behind its own smoke pass.**

**Goal:** Remove the ~356 KiB / 6-script `ClerkProvider` load from anonymous SEO pages (essays + tarot), which sit inside the Clerk-wrapped `(app)` route group. This is the largest client-JS win on the highest-traffic SEO surfaces (essay mobile LCP 10.0s).

**Key grounding finding (overturns the roadmap's stated risk):** the essays/tarot content tree contains **zero** direct `useUser`/`useAuth` calls — its only auth dependency is `useSubscription`, whose `SubscriptionProvider` is already **Clerk-free** and falls back to `DEFAULT_STATE`; Pro-unlock survives without a client `ClerkProvider` because the httpOnly Clerk session cookie authorizes the server-side `/api/v1/user/subscription` fetch. Route-group parentheses don't change URLs, so the move is redirect/canonical/hreflang-free. This is exactly the failure mode memory `feedback_clerk_provider_scope` warns about — but here it survives because it's an API-fetch path, not a client hook. **The linchpin smoke test is: signed-in-Pro user unlocks an essay with no client ClerkProvider.**

## Global Constraints

`npx vitest run` / `npm test` / `typecheck` / `lint`; auth/payment paths are zero-fail; SEO utilities in `src/shared/seo/`; commit `refactor(clerk/T<n>):` / `perf(clerk/T<n>):`. Confirm with founder before the deploy (auth surface).

---


---

### P3-CLERK: Clerk route-group move — remove ClerkProvider from anonymous SEO pages (separate design + cautious plan)

> **Sequencing:** This is Phase-3 / Deferred (roadmap §5). It ships **only after** Phase 1 (recrawl unblock) and Phase 2 (consolidate/deepen) have deployed and the two defective cohorts have indexed — and it gets **its own smoke pass** (it does not ride the Phase-1 deploy). It touches the highest-blast-radius shell in the app, so it is specced + tested in isolation.
>
> **REQUIRED SUB-SKILL:** `superpowers:executing-plans` (checkpoint review after each phase). The move itself (Phase 2) must not be interleaved with other feature work — keep it a clean, bisectable commit range.

---

#### Design

**Problem.** `src/app/[locale]/(app)/layout.tsx:26` wraps every `(app)` route — including the anonymous-first SEO pages `essays/*` and `tarot/*` — in `<ClerkProvider>` plus five auth widgets (`AnalyticsIdentifier` `:29`, `MetaPixelLeadEmitter`/`SubscribeEmitter` `:40-41`, `PostSignupAttribution` `:43`, `UserMenu` `:68`). That pulls the clerk-js runtime (root layout `app/layout.tsx:60` calls it "~324 KB"; roadmap §5 says "356 KiB / 6-script" — **re-baseline the real number in Phase 0**, don't trust either figure) onto pages that Googlebot renders as anonymous and never executes Clerk on. The win is real-user CWV/TBT on the two page types the whole SEO roadmap is trying to get indexed.

**What grounding changed.** The roadmap deferred this "because `useUser`/`useAuth` only work inside `(app)` … relocation can silently break auth-dependent components" (memory `feedback_clerk_provider_scope`). Reading the actual trees shows the fear is **contained**:
- **No content component calls a Clerk client hook.** `grep -rE 'useUser|useAuth|useClerk|useSession'` over `src/` (minus tests) puts *every* direct consumer OUTSIDE the essays/tarot content: `UserMenu.tsx:14`, `AnalyticsIdentifier.tsx:16`, `MetaPixelLeadEmitter.tsx:29`, `PostSignupAttribution.tsx:22` — all `(app)`-shell chrome — plus `BirthDataForm.tsx:41` / `ReferralTracker.tsx:31` (chart/referral, not content).
- **The content tree's only auth dependency is `useSubscription`** — `EssayPageClient.tsx:14`, and (under `tarot/spread`) `ThreeCardSpread.tsx:37` + `CelticCross.tsx:70`. `useSubscription` → `useSubscriptionContext()` (`SubscriptionProvider.tsx:188-191`) returns `DEFAULT_STATE {isPro:false, isLoading:true}` when no provider is present — it **does not throw**; free users just see truncated/paywalled content (the intended SEO state).
- **`SubscriptionProvider` is Clerk-free** (`SubscriptionProvider.tsx:1-80`): it `fetch`es `/api/v1/user/subscription` and treats 401 / `x-clerk-auth-status: signed-out` as "free". A signed-in Pro user's fetch still carries the **httpOnly Clerk session cookie** (sent by the browser regardless of any client `<ClerkProvider>`), so the API returns their real plan and content unlocks — **without** ClerkProvider on the client.
- **Route groups don't change URLs.** `(app)` and `(content)` are parenthesized → invisible to the path. Moving `essays/` + `tarot/` keeps `/essays/*`, `/tarot/*`, `/es/tarot/*` **byte-identical** — no redirects, no canonical change, no hreflang change, no sitemap change.

**Option A — relocate `essays/` + `tarot/` into a new `(content)` route group without ClerkProvider.** New `(content)/layout.tsx` mounts a Clerk-free shell: `SubscriptionProvider` (keeps Pro-unlock) + a marketing-style header/footer (extracted `SeoChrome`), no ClerkProvider, no UserMenu, no pixel/attribution emitters. This is the same server-`auth()`→`isSignedIn`-prop pattern marketing already uses (`(marketing)/page.tsx:47-50` → `HeroCalculator.tsx:152-156`).
- *Win:* full clerk-js removal from every essay/tarot page + drops 3 client emitters + `SubscriptionProvider`'s only remaining cost is one already-existing fetch.
- *Cost/risk:* signed-in users lose the header avatar/`UserButton` on essays/tarot (they keep it everywhere in `(app)`); the header nav switches from app-nav to marketing-nav; the pixel/attribution emitters no longer fire on these pages (already the documented rationale in `(app)/layout.tsx:36-39` — they fire on signup/checkout, which don't happen on SEO pages); PostHog `identify` no longer runs here (distinct_id carries from any prior `(app)` session — minor analytics gap).

**Option B — keep routes in `(app)`, lazy-mount Clerk on interaction.** Wrap the Clerk-dependent header (`UserMenu` + emitters) in `next/dynamic(..., {ssr:false})` and/or defer ClerkProvider until the user focuses/clicks the account control.
- *Win:* smaller — clerk-js still enters the graph; you only shift *when* it loads. React also can't add a provider *above* already-mounted consumers without a remount, so this means restructuring the header into a self-contained dynamically-imported island. Googlebot never runs Clerk anyway, so the SEO/CWV upside is the deferred main-thread cost only.
- *Risk:* lower auth-regression risk (nothing relocates), but fiddlier code and a hydration flash on the header; the bundle is still downloaded eventually.

**Recommendation: Option A.** Grounding shows the blast radius is small and fully testable, the URLs don't move, and Pro-unlock is preserved by an API path that doesn't need ClerkProvider. Option A is both the larger win and now the lower-*residual*-risk once the two guards below exist. Sub-decisions (I have authority; recorded): give `(content)` a Clerk-free header by **extracting** the marketing header/footer into a shared `SeoChrome` (no duplication; marketing markup locked byte-identical by a snapshot test *before* extraction) rather than adding a lazy UserMenu; re-provide Clerk-free `SubscriptionProvider`; drop the emitters on these pages.

**Risk register.**
| Risk | Likelihood | Mitigation (this plan) |
|---|---|---|
| Signed-in **Pro** user sees essay truncated / spread paywalled (unlock breaks) | Med if provider omitted | Re-provide `SubscriptionProvider` in `(content)`; **Phase-2 signed-in-Pro smoke is the gating check** (the exact `feedback_clerk_provider_scope` failure mode — survives here because it's the cookie-authorized API fetch, not a client hook) |
| A future edit adds `useUser`/`useAuth` into the essay/tarot tree → runtime throw for all visitors | Low but silent | Render regression test (Phase 1) + directory static-scan test (Phase 2) fail the build |
| Marketing header markup drifts during `SeoChrome` extraction | Low | Snapshot/DOM test locks the 4 nav links + 4 footer links **before** extraction |
| URL/canonical/hreflang regression from the move | ~None | Route-group parens don't affect URLs; curl-verify identical `<link rel=canonical>` before/after |
| Deploy not isolated (first prod deploy carried accumulated `main`) | — | Inherits Phase-1 Task-0 gate; this ships later on an already-clean `main` |

---

#### Files

**New:**
- `src/shared/components/SeoChrome.tsx` — Clerk-free header+footer+Organization JSON-LD server component, reused by `(marketing)` and `(content)` layouts.
- `src/app/[locale]/(content)/layout.tsx` — Clerk-free layout (`SubscriptionProvider` + `SeoChrome`).
- `src/modules/esoteric/components/__tests__/EssayPageClient.clerkfree.test.tsx` — render regression: paywall renders without ClerkProvider.
- `src/app/[locale]/(content)/__tests__/no-clerk-hooks.test.ts` — static scan: no Clerk client hooks in the `(content)` tree.
- `src/app/[locale]/(marketing)/__tests__/SeoChrome.test.tsx` — snapshot lock for the extracted chrome.

**Moved (git mv, imports unchanged — all `@/…` absolute or co-located relative):**
- `src/app/[locale]/(app)/essays/**` → `src/app/[locale]/(content)/essays/**`
- `src/app/[locale]/(app)/tarot/**` → `src/app/[locale]/(content)/tarot/**` (includes `tarot/spread/SpreadTabs.tsx`)

**Modified:**
- `src/app/[locale]/(marketing)/layout.tsx` — becomes a thin `<SeoChrome>{children}</SeoChrome>` wrapper.

---

#### Phase 0: Pre-flight (founder + baseline; blocks Phase 1, no code)

- [ ] **Confirm Phases 1-2 shipped & indexed.** GSC: tarot + compatibility cohorts index-or-noindexed and "Crawled — currently not indexed" (188 baseline) is falling — the §1 crawl-quality gate. This task is a perf/UX change, not a crawl fix; it must not front-run the indexation work.
- [ ] **Re-baseline the real Clerk payload** on the two page types (settles the ~324 KB vs 356 KiB discrepancy). With prod (or `npm run build && npm run start`) up:
```bash
# clerk-js bundle loads from clerk.estrevia.app/npm in prod (next.config.ts:40-42);
# cdn.clerk.com in app/layout.tsx:67 is only a PRECONNECT — do NOT count it.
curl -s https://estrevia.app/essays/sun-in-aries | grep -o 'clerk\.estrevia\.app/npm[^"]*' | sort -u
curl -s https://estrevia.app/tarot           | grep -o 'clerk\.estrevia\.app/npm[^"]*' | sort -u
```
Record: the script URLs present today (expected: ≥1 clerk-js entry per page) + transferred JS from a Chrome DevTools "Network → JS" load of `/essays/*` filtered by `clerk`. This is the before-number; Phase 3 asserts it goes to 0.
- [ ] **Founder sign-off** on the UX delta: essays/tarot header switches to the marketing header (no avatar/`UserButton`; app bottom-nav `MobileNav` replaced by the marketing compact header). One-line confirmation in the PR description.

---

#### Phase 1: Make the auth surface route-group-agnostic (no move yet — reversible, TDD)

**Task C1 — Lock the marketing chrome, then extract `SeoChrome`.**

- [ ] **Step 1 (failing test):** create `src/app/[locale]/(marketing)/__tests__/SeoChrome.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';

vi.mock('next-intl/server', () => ({
  getTranslations: async (ns: string) => (k: string) => `${ns}.${k}`,
}));
// i18n Link → plain anchor so we can assert hrefs in jsdom.
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...p}>{children}</a>
  ),
}));
vi.mock('@/shared/seo', () => ({
  JsonLdScript: () => null,
  organizationSchema: () => ({ '@type': 'Organization' }),
}));
vi.mock('@/shared/components/LanguageSwitcher', () => ({ LanguageSwitcher: () => null }));

import { SeoChrome } from '@/shared/components/SeoChrome';

describe('SeoChrome (extracted marketing chrome)', () => {
  it('renders the 4 header nav links + footer legal links + child main', async () => {
    const ui = await SeoChrome({ children: <p data-testid="child">hi</p> });
    const { container, getByTestId } = render(ui);
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(expect.arrayContaining(['/chart', '/moon', '/essays', '/pricing', '/terms', '/privacy']));
    expect(getByTestId('child')).toBeTruthy();
    expect(container.querySelector('#main-content')).not.toBeNull();
  });
});
```
- [ ] **Step 2 (run, fails):** `npx vitest run "src/app/[locale]/(marketing)/__tests__/SeoChrome.test.tsx"` → FAIL: cannot resolve `@/shared/components/SeoChrome`.
- [ ] **Step 3 (implement):** create `src/shared/components/SeoChrome.tsx` by moving the header+footer **verbatim** from `(marketing)/layout.tsx`. The header body is the current `layout.tsx:28-77`, the footer is `:83-146`, `navLinks`/`focusRing` are `:12-20`, and the top `<JsonLdScript schema={organizationSchema()} />` is `:24`:
```tsx
import type { ReactNode } from 'react';
import { Link } from '@/i18n/navigation';
import { getTranslations } from 'next-intl/server';
import { JsonLdScript, organizationSchema } from '@/shared/seo';
import { LanguageSwitcher } from '@/shared/components/LanguageSwitcher';

/**
 * Shared Clerk-FREE page chrome (header + footer + Organization JSON-LD) for
 * anonymous-first SEO surfaces. Rendered by BOTH (marketing)/layout.tsx and
 * (content)/layout.tsx so essays/tarot get this lightweight shell instead of
 * the (app) group's ClerkProvider. Markup copied verbatim from the previous
 * (marketing)/layout.tsx to keep the proven marketing surface byte-identical.
 */
export async function SeoChrome({ children }: { children: ReactNode }) {
  const tNav = await getTranslations('nav');
  const tCommon = await getTranslations('common');
  const tMarketing = await getTranslations('marketing');

  const focusRing =
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0F] rounded-sm';

  const navLinks = [
    { href: '/chart', label: tNav('chart') },
    { href: '/moon', label: tNav('moon') },
    { href: '/essays', label: tNav('essays') },
    { href: '/pricing', label: tNav('pricing') },
  ];

  return (
    <>
      <JsonLdScript schema={organizationSchema()} />
      <div className="flex flex-col min-h-screen bg-[#0A0A0F]">
        {/* ↓↓↓ PASTE (marketing)/layout.tsx:28-77 <header>…</header> VERBATIM ↓↓↓ */}
        {/* ↓↓↓ then <main id="main-content" className="flex-1">{children}</main> (was :80) ↓↓↓ */}
        {/* ↓↓↓ then PASTE (marketing)/layout.tsx:83-146 <footer>…</footer> VERBATIM ↓↓↓ */}
      </div>
    </>
  );
}
```
(Do not paraphrase the header/footer — copy the exact JSX from the read lines so the snapshot test stays green.)
- [ ] **Step 4 (run, passes):** `npx vitest run "src/app/[locale]/(marketing)/__tests__/SeoChrome.test.tsx"` → PASS.
- [ ] **Step 5 (rewire marketing layout):** replace the entire body of `src/app/[locale]/(marketing)/layout.tsx` with:
```tsx
import type { ReactNode } from 'react';
import { SeoChrome } from '@/shared/components/SeoChrome';

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return <SeoChrome>{children}</SeoChrome>;
}
```
- [ ] **Step 6 (verify):** `npm run typecheck && npx vitest run "src/app/[locale]/(marketing)"` → PASS (existing marketing/pricing tests still green; the chrome is byte-identical).
- [ ] **Step 7 (commit):** `git commit -m "refactor(seo-p3/T-clerk): extract SeoChrome from marketing layout (no behavior change)"`

**Task C2 — Render regression guard (locks: essay paywall renders with NO ClerkProvider).**

- [ ] **Step 1 (failing-first is trivial — assert the invariant that must never regress):** create `src/modules/esoteric/components/__tests__/EssayPageClient.clerkfree.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';

vi.mock('next-intl', () => ({
  useTranslations: () => (k: string) => k,
  useLocale: () => 'en',
}));
// PaywallModal pulls next-intl + analytics; stub to keep this unit-scoped.
vi.mock('@/shared/components/PaywallModal', () => ({ PaywallModal: () => null }));

import { SubscriptionProvider } from '@/shared/context/SubscriptionProvider';
import { EssayPageClient } from '@/modules/esoteric/components/EssayPageClient';

beforeEach(() => {
  // SubscriptionProvider fetches on mount; anon path returns "free".
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: false, status: 401,
    headers: { get: () => null },
    json: async () => ({}),
  }));
});

describe('essays render Clerk-free (auth-regression guard for (content) group)', () => {
  it('EssayPageClient mounts WITHOUT a ClerkProvider ancestor and does not throw', () => {
    // Clerk hooks throw "can only be used within <ClerkProvider>" outside one.
    // If a future edit adds useUser/useAuth to the essay tree, this throws.
    expect(() =>
      render(
        <SubscriptionProvider>
          <EssayPageClient><p>Essay body</p></EssayPageClient>
        </SubscriptionProvider>,
      ),
    ).not.toThrow();
  });

  it('free/anon reader (no provider result) gets the truncation wrapper, not a full unlock', () => {
    const { container } = render(
      <SubscriptionProvider>
        <EssayPageClient><p data-testid="body">Essay body</p></EssayPageClient>
      </SubscriptionProvider>,
    );
    // DEFAULT_STATE => isPro:false => the max-h-[60vh] overflow-hidden truncation div (EssayPageClient.tsx:30)
    expect(container.querySelector('[class*="max-h-"]')).not.toBeNull();
  });
});
```
- [ ] **Step 2 (run — passes today, proving the invariant already holds):** `npx vitest run src/modules/esoteric/components/__tests__/EssayPageClient.clerkfree.test.tsx` → PASS (no Clerk hook exists in the tree, so no throw). This test's value is forward-looking: it will FAIL the day someone reintroduces a Clerk client hook here.
- [ ] **Step 3 (commit):** `git commit -m "test(seo-p3/T-clerk): guard essay paywall renders without ClerkProvider"`

> **Checkpoint (review):** Phases-1 commits are pure refactor + tests, fully reversible, and change no URL or auth behavior. Get review sign-off before Phase 2.

---

#### Phase 2: The move (relocate essays/tarot into `(content)`)

**Task M1 — Create the Clerk-free `(content)` layout.**
- [ ] **Step 1:** create `src/app/[locale]/(content)/layout.tsx`:
```tsx
import type { ReactNode } from 'react';
import { SubscriptionProvider } from '@/shared/context/SubscriptionProvider';
import { SeoChrome } from '@/shared/components/SeoChrome';

/**
 * (content) route group — essays + tarot. Anonymous-first SEO landing pages.
 *
 * ClerkProvider is intentionally ABSENT: these pages drop the clerk-js load
 * that (app)/layout.tsx mounts (root app/layout.tsx:59-61 documents the scoping
 * intent). Route-group parentheses do NOT affect URLs, so /essays/* and
 * /tarot/* are byte-identical after the move — no redirects/canonicals/hreflang.
 *
 * Pro-unlock still works: SubscriptionProvider fetches /api/v1/user/subscription,
 * authorized by the httpOnly Clerk session cookie the browser sends
 * automatically — it needs NO client ClerkProvider. No component in this
 * subtree calls useUser()/useAuth() (only useSubscription); enforced by
 * (content)/__tests__/no-clerk-hooks.test.ts and the EssayPageClient render guard.
 */
export default function ContentLayout({ children }: { children: ReactNode }) {
  return (
    <SubscriptionProvider>
      <SeoChrome>{children}</SeoChrome>
    </SubscriptionProvider>
  );
}
```
- [ ] **Step 2 (optional parity):** if a spinner is desired, copy `src/app/[locale]/(app)/loading.tsx` → `src/app/[locale]/(content)/loading.tsx` (else Next falls back to the parent Suspense — acceptable).

**Task M2 — Move the trees (git mv; imports need no rewrite).**
- [ ] **Step 1:**
```bash
git mv "src/app/[locale]/(app)/essays" "src/app/[locale]/(content)/essays"
git mv "src/app/[locale]/(app)/tarot"  "src/app/[locale]/(content)/tarot"
```
- [ ] **Step 2 (confirm no dangling imports — the moved files import only `@/…` absolute or co-located relative like `tarot/spread/page.tsx` → `./SpreadTabs`):**
```bash
grep -rn "from '\./\|from '\.\./" "src/app/[locale]/(content)" | grep -v SpreadTabs || echo "no cross-group relative imports"
npm run typecheck
```
Expected: only the intra-`tarot/spread` `./SpreadTabs` relative import (moved together); typecheck PASS.

**Task M3 — Static-scan guard for the new group.**
- [ ] **Step 1 (test):** create `src/app/[locale]/(content)/__tests__/no-clerk-hooks.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const GROUP = join(process.cwd(), 'src/app/[locale]/(content)');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (name === '__tests__') return [];
    if (statSync(p).isDirectory()) return walk(p);
    return /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}

describe('(content) route group is Clerk-client-hook-free', () => {
  it('no useUser/useAuth/useClerk/useSession/useSignIn/useSignUp in the tree', () => {
    for (const file of walk(GROUP)) {
      const src = readFileSync(file, 'utf-8');
      expect(src, `${file} must not call a Clerk client hook`)
        .not.toMatch(/\buse(User|Auth|Clerk|Session|SignIn|SignUp)\s*\(/);
    }
  });
});
```
- [ ] **Step 2 (run, passes):** `npx vitest run "src/app/[locale]/(content)/__tests__/no-clerk-hooks.test.ts"` → PASS.

**Task M4 — Full suite + local SSR/URL/parity verify.**
- [ ] **Step 1:** `npm test && npm run typecheck && npm run lint` → green (per memory `feedback_lint_worktrees_pollution`, grep lint output for `src/` paths only).
- [ ] **Step 2 (build + curl parity — URLs unchanged, clerk-js gone, content intact):** `npm run build && npm run start`, then:
```bash
# URL/canonical unchanged (route-group move must be URL-invisible)
curl -s http://localhost:3000/essays/sun-in-aries    | grep -o '<link rel="canonical"[^>]*>'
curl -s http://localhost:3000/es/essays/sun-in-aries | grep -o '<link rel="canonical"[^>]*>'
# clerk-js bundle gone from content pages (compare to Phase-0 baseline; count EXCLUDES the cdn.clerk.com preconnect)
curl -s http://localhost:3000/essays/sun-in-aries | grep -oE 'clerk[^"]*/npm[^"]*|clerk\.accounts\.dev[^"]*' | sort -u   # expect: empty
curl -s http://localhost:3000/tarot               | grep -oE 'clerk[^"]*/npm[^"]*|clerk\.accounts\.dev[^"]*' | sort -u   # expect: empty
# content still SSR-present
curl -s http://localhost:3000/tarot | grep -c "<h1"
curl -s http://localhost:3000/tarot/spread | grep -c "<h1"
```
Expected: canonicals identical to Phase-0 baseline; **zero** clerk-js entries on content pages; `<h1>` present.
- [ ] **Step 3 (commit — single, bisectable move):**
```bash
git add -A
git commit -m "feat(seo-p3/T-clerk): relocate essays+tarot to Clerk-free (content) route group"
```

> **Checkpoint (review):** stop here for review before any deploy.

---

#### Phase 3: Auth-regression smoke + deploy (its own pass — does NOT ride the Phase-1 deploy)

**Auth-regression checklist (manual, against a preview deploy — the automated tests cannot see cross-page auth/session):**
- [ ] **1. Anon essay** → truncated body + "Read more" paywall CTA (unchanged from prod).
- [ ] **2. Signed-in FREE essay** → still truncated (unchanged).
- [ ] **3. ⭐ Signed-in PRO essay → FULL content unlocks.** *This is the gating check* — proves `/api/v1/user/subscription` still resolves the plan via the httpOnly session cookie with **no client ClerkProvider** (the exact `feedback_clerk_provider_scope` failure mode; it survives because it's an API fetch, not a client hook). Verify EN + ES.
- [ ] **4. Anon `/tarot/spread`** → Celtic Cross paywalled (unchanged).
- [ ] **5. Signed-in PRO `/tarot/spread`** → spreads unlocked.
- [ ] **6. Header on essays/tarot** → logo, LanguageSwitcher, nav, "Open App" work; **no console error** (`useAuth/useUser can only be used within <ClerkProvider>` must NOT appear).
- [ ] **7. Content → app hop** → click "Open App" (→ `/chart`, still `(app)`): ClerkProvider present, `UserMenu`/`UserButton` render, no auth re-init loop.
- [ ] **8. Sign-in from a content page** → user can reach `/sign-in`, authenticate, return; session recognized on next content-page load (cookie present).
- [ ] **9. DevTools Network on `/essays/*`** → **no request** to `clerk.estrevia.app/npm/*` (or `*.accounts.dev`); JS transfer drops by the Phase-0 baseline amount.
- [ ] **10. PostHog** → distinct_id continuity: a user identified in a prior `(app)` session still carries identity on content pages (funnel events not orphaned). Accept the known gap that fresh identify does not fire on content-only visits.
- [ ] **11. Middleware/CSP** → no CSP violations in console; `next.config.ts` clerk hosts untouched (still needed by `(app)`/sign-in/sign-up).

**Deploy:**
- [ ] **Step D1:** confirm `main` is clean and this is isolated on top of the already-deployed Phase-1/2 work (no reprise of the Phase-1 Task-0 accumulated-`main` risk).
- [ ] **Step D2 (confirm with founder — direct-to-main):** `git push origin main`.
- [ ] **Step D3 (post-deploy):** re-run checklist items 3, 5, 9 against prod; capture the prod JS-transfer delta on `/essays/*` and `/tarot/*` vs the Phase-0 baseline as the win metric.
- [ ] **Step D4 (measure):** at +1 week, read CrUX/GSC CWV for the essay + tarot page groups (TBT/INP + LCP) to quantify the real-user gain; note it did not affect indexation (URL-invariant change).

---

#### Notes / deferred (out of scope for this task)
- The 3 emitters (`MetaPixelLeadEmitter`, `MetaPixelSubscribeEmitter`, `PostSignupAttribution`) intentionally do not run on content pages — same rationale as `(app)/layout.tsx:36-39` (they key off signup/checkout, absent on SEO pages). If a future funnel needs Lead attribution on content pages, add a **server-`auth()`→prop** variant, never a client Clerk hook (keeps the `(content)` guard green).
- Optional Phase-2-perf follow-up (not required here): skip the `SubscriptionProvider` fetch for provably-anon visitors on content pages — currently it fires for everyone (parity with today's `(app)` behavior; not a regression).
- `SeoChrome` now emits `organizationSchema()` on essay/tarot pages too (they previously emitted none) — a small net Organization-entity plus; harmless alongside the existing Article/Breadcrumb JSON-LD.