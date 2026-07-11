# SP-B — ES/LATAM Conversion Pack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the dominant ES leak (Stripe page created→complete 4.5% vs EN 24.1%) by making every ES-visible price unambiguously **US$** with single-sourced local-currency equivalents, adding card-decision trust copy in the paywall modal, and finishing Spanish localization of the conversion path (cookie banner, birth-date calendar, aria-labels) — the gate for re-enabling ES Meta spend. Spec: `docs/superpowers/specs/2026-07-10-sp-b-es-latam-conversion-design.md`.

**Architecture:** No new services, no schema changes, no migrations. One new lib (`src/shared/lib/currency-equiv.ts` — single FX source, sync-tested against `messages/es.json`), one new shared component (`CurrencyEquivNote` — replaces the equiv JSX duplicated in `PricingToggle` and `PaywallModal`), a prop-based i18n bridge for `CookieConsent` (it mounts OUTSIDE `NextIntlClientProvider`), in-place localization of `DateInput`/`TimeInput`/`CityAutocomplete`, message additions in both locales, a checkout-route refactor to consume the shared FX source, and a committed local-currency-billing decision doc (evaluate only — D5 settled: stay USD).

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript strict, next-intl, Stripe Checkout (`custom_text`), Vitest + Testing Library (jsdom), Playwright.

## Global Constraints

- **Phase 0 dependency.** This plan is written against the **POST-Phase-0** state of `src/shared/components/PaywallModal.tsx` (plan `2026-07-10-cro-phase0-relaunch-blockers.md`, Tasks 6 + 9: portal root + `z-[60]`, default plan `pro_monthly`, `tCommon` hook, `formatTrialEndDate(locale)`, error strings via `tPage`). Execute Phase 0 T6/T9 first. All PaywallModal anchors below are **JSX-content anchors, not line numbers**, so they survive the drift; the two tests that could flip on plan-default (`PaywallModal.currency.test.tsx`) click the monthly toggle explicitly and are order-proof.
- **Cross-plan line drift (SP-A):** SP-A T1 lands first and shifts `checkout/route.ts` + `route.test.ts` line numbers — treat all Task 4 line refs as content anchors (the `esCurrencyEquiv`/`customTextForLocale` const block and the locale-forwarding describe).
- **Cross-plan line drift (SP-E):** `messages/*.json` line numbers are pre-SP-E-insertion (SP-E T2 inserts `landing.heroProof` at ~line 788 in both files) — locate keys by NAME, never by absolute line after any same-file plan lands.
- i18n message files live at `messages/en.json` and `messages/es.json` (repo root). ES copy = español neutro LATAM, `tú` form. Sign names untranslated; planet names translated (not relevant here, but the style guide applies to all new ES strings).
- **EN `cookieConsent.ariaLabel` must be EXACTLY `"Cookie consent"`** — Phase 0's e2e `tests/e2e/paywall-mobile-consent.spec.ts` locates the banner via `page.getByLabel('Cookie consent')`.
- **FX numbers are [FOUNDER-VERIFY] constants** (the ONLY permitted placeholder-like marker in this plan): live FX cannot be fetched at plan time, so Task 1 keeps the 2026-05-23 values, concentrates them in ONE file (`currency-equiv.ts`) with refresh instructions, and Task 10 hands the refresh to the founder. A sync test fails the build if `messages/es.json` ever drifts from the lib.
- The equiv strings contain **U+202F NARROW NO-BREAK SPACE** as the thousands separator (rendered like `21 000`). The code blocks in this plan carry the literal U+202F characters — copy them byte-exact (do NOT retype the strings by hand). The Task 1 sync test fails loudly if an editor mangles them.
- Tests: `npx vitest run <path>` for single files; full gate = `npx vitest run` + `npm run typecheck` + `npm run lint` (lint: ignore `.claude/worktrees/**` noise). E2E: `npm run test:e2e`.
- Component tests need the `// @vitest-environment jsdom` pragma (vitest default env is node).
- No PII surfaces touched; no webhooks touched; no prod-mutating scripts in this SP.
- Commit style: `feat(sp-b/T<n>): …` / `test(sp-b/T<n>): …` / `chore(sp-b/T<n>): …`.
- Out of scope (owned elsewhere — do NOT fix here): unlocalized `cancel_url`/`success_url` (SP-A routing), pixel-consent mechanics (SP-F — only banner STRINGS live here), ChartWheel/PositionTable/etc. aria-labels (later a11y batch), the two ES 'gratis' CTA strings + modal l10n (Phase 0 T9).

---

### Task 1: `currency-equiv.ts` — single FX source + es.json sync test (D2 core)

**Files:**
- Create: `src/shared/lib/currency-equiv.ts`
- Test: `src/shared/lib/__tests__/currency-equiv.test.ts`

**Interfaces:**
- Produces: `type ProPlan = 'pro_monthly' | 'pro_annual'`; `CURRENCY_EQUIV: Record<ProPlan, string>` — the canonical LATAM-equivalence strings. Consumed by Task 4 (checkout route) and type-consumed by Task 3 (`CurrencyEquivNote` prop type). `messages/es.json` `pricing.monthlyPriceEquiv`/`annualPriceEquiv` stay the UI copy (next-intl cannot import TS); the sync test makes the mirror drift-proof.
- Consumes: `messages/es.json` (JSON import — `resolveJsonModule: true` is already set in `tsconfig.json:16`).

- [ ] **Step 1: Write the failing test**

```ts
// src/shared/lib/__tests__/currency-equiv.test.ts
import { describe, it, expect } from 'vitest';
import { CURRENCY_EQUIV } from '../currency-equiv';
import esMessages from '../../../../messages/es.json';

describe('currency-equiv — single source of truth (SP-B D2)', () => {
  it('messages/es.json pricing equiv strings mirror CURRENCY_EQUIV byte-exact', () => {
    // next-intl reads the JSON; the checkout route reads the TS module.
    // If a quarterly FX refresh edits one side only, this fails the build.
    expect(esMessages.pricing.monthlyPriceEquiv).toBe(CURRENCY_EQUIV.pro_monthly);
    expect(esMessages.pricing.annualPriceEquiv).toBe(CURRENCY_EQUIV.pro_annual);
  });

  it('uses NARROW NO-BREAK SPACE (U+202F) as the thousands separator', () => {
    expect(CURRENCY_EQUIV.pro_annual).toContain('147 000');
    expect(CURRENCY_EQUIV.pro_monthly).toContain('21 000');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shared/lib/__tests__/currency-equiv.test.ts`
Expected: FAIL — `Cannot find module '../currency-equiv'`

- [ ] **Step 3: Write the implementation**

```ts
// src/shared/lib/currency-equiv.ts
/**
 * LATAM currency equivalents for the two Pro plans — SINGLE SOURCE OF TRUTH.
 *
 * Consumed by:
 *   - src/app/api/v1/stripe/checkout/route.ts — custom_text.submit on the
 *     hosted Stripe Checkout page for ES-locale callers.
 *   - messages/es.json pricing.{monthlyPriceEquiv,annualPriceEquiv} — the UI
 *     copy (PaywallModal + /pricing via CurrencyEquivNote). next-intl cannot
 *     import TS, so the JSON holds a byte-exact mirror; the sync test in
 *     __tests__/currency-equiv.test.ts fails the build when the two drift.
 *
 * HOW TO REFRESH (quarterly, and before any ES ad relaunch):
 *   1. Look up USD→{MXN, COP, CLP, PEN, UYU} mid-market rates (e.g. xe.com).
 *   2. Recompute: monthly = 4.99 × rate, annual = 34.99 × rate; round to
 *      marketing-friendly figures (~2 significant digits) and keep the format
 *      below — "≈ <n> MXN · <n> COP · <n> CLP · <n> PEN · <n> UYU" with
 *      NARROW NO-BREAK SPACE (U+202F — the space inside "21 000" below) as the thousands
 *      separator.
 *   3. Edit the two strings below (one line per plan) and paste the SAME
 *      values into messages/es.json pricing.monthlyPriceEquiv/annualPriceEquiv.
 *   4. `npx vitest run src/shared/lib/__tests__/currency-equiv.test.ts` must pass.
 *
 * [FOUNDER-VERIFY] The values below are the 2026-05-23 vintage (USD→MXN ≈ 18,
 * COP ≈ 4 210, CLP ≈ 950, PEN ≈ 3.8, UYU ≈ 40). Verify/refresh them before
 * re-enabling ES Meta spend — see the founder checklist in the SP-B plan Task 10.
 */

export type ProPlan = 'pro_monthly' | 'pro_annual';

export const CURRENCY_EQUIV: Record<ProPlan, string> = {
  pro_monthly: '≈ 90 MXN · 21 000 COP · 4 740 CLP · 19 PEN · 200 UYU',
  pro_annual: '≈ 630 MXN · 147 000 COP · 33 200 CLP · 133 PEN · 1 400 UYU',
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/shared/lib/__tests__/currency-equiv.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/shared/lib/currency-equiv.ts src/shared/lib/__tests__/currency-equiv.test.ts
git commit -m "feat(sp-b/T1): currency-equiv single FX source + es.json sync test"
```

---

### Task 2: US$ price framing + billedInUsd key — ES only (D1)

**Files:**
- Modify: `messages/es.json` (lines 949, 951, 953; insert after 955)

**Interfaces:**
- Produces: `pricing.monthlyPrice = "US$4.99"`, `pricing.annualPrice = "US$34.99"`, `pricing.annualPerMonth = "~US$2,92/mes"`, new key `pricing.billedInUsd = "Se factura en dólares (USD)"` (rendered by Task 3's `CurrencyEquivNote`). **EN untouched.** Flows automatically into every render site: PaywallModal price block, PricingToggle Pro card AND its toggle summary line (`PricingToggle.tsx:91` concatenates `t('monthlyPrice') + t('monthlyLabel')`).
- Consumes: nothing. The Task 1 sync test stays green (equiv keys unchanged).

- [ ] **Step 1: Edit `messages/es.json`**

Line 949: `"monthlyPrice": "$4.99",` → `"monthlyPrice": "US$4.99",`
Line 951: `"annualPrice": "$34.99",` → `"annualPrice": "US$34.99",`
Line 953: `"annualPerMonth": "~$2,92/mes",` → `"annualPerMonth": "~US$2,92/mes",`
Insert after line 955 (`"annualPriceEquiv": …`), as a sibling key:

```json
    "billedInUsd": "Se factura en dólares (USD)",
```

- [ ] **Step 2: Verify JSON validity + values**

Run: `node -e "const m=require('./messages/es.json').pricing; console.log(m.monthlyPrice, m.annualPrice, m.annualPerMonth, m.billedInUsd)"`
Expected: `US$4.99 US$34.99 ~US$2,92/mes Se factura en dólares (USD)`

Run: `node -e "const m=require('./messages/en.json').pricing; console.log(m.monthlyPrice, m.billedInUsd)"`
Expected: `$4.99 undefined` (EN untouched — the US$ framing is ES-only by design)

- [ ] **Step 3: Run the sync test (must still pass)**

Run: `npx vitest run src/shared/lib/__tests__/currency-equiv.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add messages/es.json
git commit -m "feat(sp-b/T2): D1 — US\$ price framing + billedInUsd note key (ES only)"
```

---

### Task 3: `CurrencyEquivNote` shared component — replaces duplicated equiv JSX (D1 render + D2)

**Files:**
- Create: `src/shared/components/CurrencyEquivNote.tsx`
- Modify: `src/app/[locale]/(marketing)/pricing/PricingToggle.tsx` (equiv block at lines 183–191)
- Modify: `src/shared/components/PaywallModal.tsx` (equiv block — anchor: the `{/* LATAM currency equivalents — ES-only via locale gate */}` comment inside the Price-display div)
- Test: `src/shared/components/__tests__/CurrencyEquivNote.test.tsx` (new), `src/shared/components/__tests__/PaywallModal.currency.test.tsx` (new), `src/app/[locale]/(marketing)/pricing/__tests__/PricingToggle.currencyBadge.test.tsx` (extend)

**Interfaces:**
- Produces: `CurrencyEquivNote({ plan, className }: { plan: ProPlan; className?: string })` — ES-only (renders `null` for every other locale, the same gate the two inline copies had); renders the equiv line (aria `pricingPage.currencyEquivAria`) plus the `pricing.billedInUsd` note beneath it.
- Consumes: `type ProPlan` from Task 1; i18n keys `pricing.monthlyPriceEquiv`/`annualPriceEquiv`/`billedInUsd` (es.json only — safe: the `locale !== 'es'` early-return means the keys are never resolved for EN, matching today's behavior where `monthlyPriceEquiv` is absent from en.json).

- [ ] **Step 1: Write the failing component test**

```tsx
// src/shared/components/__tests__/CurrencyEquivNote.test.tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import React from 'react';

// Hoisted spy lets each test override the locale return value
// (same pattern as PricingToggle.currencyBadge.test.tsx).
const mockLocale = vi.fn<() => string>(() => 'es');

vi.mock('next-intl', () => ({
  useTranslations: (ns: string) => (key: string) => `${ns}.${key}`,
  useLocale: () => mockLocale(),
}));

import { CurrencyEquivNote } from '../CurrencyEquivNote';

describe('CurrencyEquivNote', () => {
  it('es + pro_annual renders the annual equiv, the billedInUsd note and the aria label', () => {
    mockLocale.mockReturnValue('es');
    render(<CurrencyEquivNote plan="pro_annual" className="mb-3" />);
    expect(screen.getByText('pricing.annualPriceEquiv')).toBeTruthy();
    expect(screen.getByText('pricing.billedInUsd')).toBeTruthy();
    expect(screen.getByLabelText('pricingPage.currencyEquivAria')).toBeTruthy();
  });

  it('es + pro_monthly renders the monthly equiv', () => {
    mockLocale.mockReturnValue('es');
    render(<CurrencyEquivNote plan="pro_monthly" />);
    expect(screen.getByText('pricing.monthlyPriceEquiv')).toBeTruthy();
  });

  it('en renders nothing at all (locale gate)', () => {
    mockLocale.mockReturnValue('en');
    const { container } = render(<CurrencyEquivNote plan="pro_annual" />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shared/components/__tests__/CurrencyEquivNote.test.tsx`
Expected: FAIL — `Cannot find module '../CurrencyEquivNote'`

- [ ] **Step 3: Write the component**

```tsx
// src/shared/components/CurrencyEquivNote.tsx
'use client';

import { useLocale, useTranslations } from 'next-intl';
import type { ProPlan } from '@/shared/lib/currency-equiv';

interface CurrencyEquivNoteProps {
  plan: ProPlan;
  /** Layout-specific tint/spacing (modal vs pricing card), applied to the wrapper. */
  className?: string;
}

/**
 * LATAM currency-equivalence line + "billed in USD" note — ES-only.
 * Renders null for every other locale (same gate the two former inline
 * copies in PricingToggle/PaywallModal had, so missing en.json keys are safe).
 * Copy source: messages/es.json pricing.{monthlyPriceEquiv,annualPriceEquiv,billedInUsd},
 * kept byte-exact with src/shared/lib/currency-equiv.ts (sync-tested — see its header
 * for the quarterly FX refresh procedure).
 */
export function CurrencyEquivNote({ plan, className }: CurrencyEquivNoteProps) {
  const t = useTranslations('pricing');
  const tPage = useTranslations('pricingPage');
  const locale = useLocale();

  if (locale !== 'es') return null;

  return (
    <div className={className}>
      <p
        className="text-xs font-[var(--font-geist-mono)] leading-relaxed"
        aria-label={tPage('currencyEquivAria')}
      >
        {t(plan === 'pro_annual' ? 'annualPriceEquiv' : 'monthlyPriceEquiv')}
      </p>
      <p className="text-xs mt-0.5">{t('billedInUsd')}</p>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/shared/components/__tests__/CurrencyEquivNote.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Swap into PricingToggle**

In `src/app/[locale]/(marketing)/pricing/PricingToggle.tsx`, add the import (after the `PricingUpgradeButton` import at line 5):

```tsx
import { CurrencyEquivNote } from '@/shared/components/CurrencyEquivNote';
```

Replace lines 183–191:

```tsx
            {/* LATAM currency equivalents — ES-only via locale gate */}
            {locale === 'es' && (
              <p
                className="text-xs text-white/40 mb-3 font-[var(--font-geist-mono)] leading-relaxed"
                aria-label={tPage('currencyEquivAria')}
              >
                {t(billing === 'annual' ? 'annualPriceEquiv' : 'monthlyPriceEquiv')}
              </p>
            )}
```

with:

```tsx
            {/* LATAM currency equivalents + billed-in-USD note — ES-only (renders null for en) */}
            <CurrencyEquivNote plan={plan} className="text-white/40 mb-3" />
```

(`plan` already exists at line 38: `const plan = billing === 'monthly' ? 'pro_monthly' : 'pro_annual';`. `locale` and `tPage` remain used elsewhere in the file — no unused-var fallout.)

- [ ] **Step 6: Swap into PaywallModal**

In `src/shared/components/PaywallModal.tsx`, add the import next to the other shared imports at the top:

```tsx
import { CurrencyEquivNote } from './CurrencyEquivNote';
```

Inside the `{/* Price display */}` div, replace the block

```tsx
            {/* LATAM currency equivalents — ES-only via locale gate */}
            {locale === 'es' && (
              <p
                className="text-xs text-white/50 mt-2 font-[var(--font-geist-mono)] leading-relaxed"
                aria-label={tPage('currencyEquivAria')}
              >
                {tp(plan === 'pro_annual' ? 'annualPriceEquiv' : 'monthlyPriceEquiv')}
              </p>
            )}
```

with:

```tsx
            {/* LATAM currency equivalents + billed-in-USD note — ES-only (renders null for en) */}
            <CurrencyEquivNote plan={plan} className="text-white/50 mt-2" />
```

(Post-Phase-0, `tPage` and `locale` remain used by the error strings / `formatTrialEndDate(locale)` — no unused-var fallout.)

- [ ] **Step 7: Write the modal integration test**

```tsx
// src/shared/components/__tests__/PaywallModal.currency.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

const mockLocale = vi.fn<() => string>(() => 'es');

// Translator mock echoes namespaced keys so assertions can target them.
vi.mock('next-intl', () => ({
  useTranslations: (ns: string) => {
    const t = ((key: string, vars?: Record<string, unknown>) =>
      vars ? `${ns}.${key}:${JSON.stringify(vars)}` : `${ns}.${key}`) as ((
      k: string,
      v?: Record<string, unknown>,
    ) => string) & { has: (k: string) => boolean };
    t.has = () => false;
    return t;
  },
  useLocale: () => mockLocale(),
}));
vi.mock('@/shared/lib/analytics', () => ({
  trackEvent: vi.fn(),
  AnalyticsEvent: new Proxy({}, { get: (_, k) => String(k) }),
}));
vi.mock('@/shared/lib/utm-cookie', () => ({
  readUtmLastTouch: vi.fn().mockReturnValue({}),
}));

import { PaywallModal } from '../PaywallModal';

describe('PaywallModal — ES currency note (SP-B T3)', () => {
  it('renders equiv + billedInUsd for the selected plan when locale=es', () => {
    mockLocale.mockReturnValue('es');
    render(<PaywallModal open={true} onClose={vi.fn()} />);
    // Select monthly explicitly — assertion is then independent of the
    // component's default plan (pro_monthly post-Phase-0).
    fireEvent.click(screen.getByText('pricing.monthly'));
    expect(screen.getByText('pricing.monthlyPriceEquiv')).toBeTruthy();
    expect(screen.getByText('pricing.billedInUsd')).toBeTruthy();
    fireEvent.click(screen.getByText('pricing.annual'));
    expect(screen.getByText('pricing.annualPriceEquiv')).toBeTruthy();
  });

  it('renders neither for locale=en', () => {
    mockLocale.mockReturnValue('en');
    render(<PaywallModal open={true} onClose={vi.fn()} />);
    expect(screen.queryByText('pricing.monthlyPriceEquiv')).toBeNull();
    expect(screen.queryByText('pricing.annualPriceEquiv')).toBeNull();
    expect(screen.queryByText('pricing.billedInUsd')).toBeNull();
  });
});
```

- [ ] **Step 8: Extend the existing PricingToggle badge test**

In `src/app/[locale]/(marketing)/pricing/__tests__/PricingToggle.currencyBadge.test.tsx` (its module-level `vi.mock('next-intl', …)` also intercepts `CurrencyEquivNote`'s imports, echoing bare keys — existing assertions keep working unchanged):

In the first test (`renders annual equiv badge when locale=es`), append after the existing assertion:

```tsx
    expect(screen.getByText('billedInUsd')).not.toBeNull();
```

In the third test (`renders NO badge when locale=en`), append:

```tsx
    expect(screen.queryByText('billedInUsd')).toBeNull();
```

- [ ] **Step 9: Run all Task 3 tests**

Run: `npx vitest run src/shared/components/__tests__/CurrencyEquivNote.test.tsx src/shared/components/__tests__/PaywallModal.currency.test.tsx "src/app/[locale]/(marketing)/pricing/__tests__/PricingToggle.currencyBadge.test.tsx" src/shared/components/__tests__/PaywallModal.trigger.test.tsx src/shared/components/__tests__/PaywallModal.utm.test.tsx`
Expected: PASS (new tests + no regressions in the existing modal/badge suites)

- [ ] **Step 10: Commit**

```bash
git add src/shared/components/CurrencyEquivNote.tsx src/shared/components/__tests__/CurrencyEquivNote.test.tsx src/shared/components/__tests__/PaywallModal.currency.test.tsx src/shared/components/PaywallModal.tsx "src/app/[locale]/(marketing)/pricing/PricingToggle.tsx" "src/app/[locale]/(marketing)/pricing/__tests__/PricingToggle.currencyBadge.test.tsx"
git commit -m "feat(sp-b/T3): CurrencyEquivNote shared component replaces duplicated equiv JSX + billedInUsd note"
```

---

### Task 4: Checkout route consumes the shared FX source (D2 server)

**Files:**
- Modify: `src/app/api/v1/stripe/checkout/route.ts` (the `esCurrencyEquiv`/`customTextForLocale` block at lines 157–168)
- Test: `src/app/api/v1/stripe/checkout/__tests__/route.test.ts` (extend the `locale forwarding (authenticated)` describe starting at line 197)

**Interfaces:**
- Consumes: `CURRENCY_EQUIV` from Task 1 (`@/shared/lib/currency-equiv` — plain module, no env deps, safe under the test file's mocks). `plan` is already narrowed to `'pro_monthly' | 'pro_annual'` at that point (route.ts:126).
- Produces: `custom_text.submit.message` on both session-create branches (applied at route.ts:280 and :402 — untouched) now sourced from the ONE file. The third hardcoded copy of the FX strings is deleted.

**TDD note:** This is red-first TDD: the route hardcode uses ASCII SPACE (U+0020) thousands separators while `CURRENCY_EQUIV` (byte-exact with `messages/es.json`) uses NARROW NO-BREAK SPACE (U+202F), so the new exact-match test FAILS against the current hardcode; Step 3's refactor turns it green. Deliberate side effect: after the refactor the live Stripe `custom_text` thousands separators change from U+0020 to U+202F (visually identical).

- [ ] **Step 1: Write the failing test**

In `src/app/api/v1/stripe/checkout/__tests__/route.test.ts`, add the import at the top of the file (below the existing imports):

```ts
import { CURRENCY_EQUIV } from '@/shared/lib/currency-equiv';
```

Append inside the `describe('POST /api/v1/stripe/checkout — locale forwarding (authenticated)', …)` block (after the existing `custom_text` tests at lines 208–235, following their `makeRequest`/`POST`/`mockSessionsCreate` conventions):

```ts
  it('custom_text.submit.message comes verbatim from the shared CURRENCY_EQUIV source (SP-B D2)', async () => {
    await POST(makeRequest({ locale: 'es', plan: 'pro_annual' }));
    let callArg = mocks.mockSessionsCreate.mock.calls.at(-1)![0];
    expect(callArg.custom_text?.submit?.message).toBe(CURRENCY_EQUIV.pro_annual);

    await POST(makeRequest({ locale: 'es', plan: 'pro_monthly' }));
    callArg = mocks.mockSessionsCreate.mock.calls.at(-1)![0];
    expect(callArg.custom_text?.submit?.message).toBe(CURRENCY_EQUIV.pro_monthly);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/v1/stripe/checkout/__tests__/route.test.ts`
Expected: FAIL on the new test: the route hardcode uses ASCII-space thousands separators (U+0020) while CURRENCY_EQUIV uses U+202F; the diff looks identical because the difference is whitespace.

- [ ] **Step 3: Refactor the route**

In `src/app/api/v1/stripe/checkout/route.ts`, add to the import block (after the `coupons` import at line 33):

```ts
import { CURRENCY_EQUIV } from '@/shared/lib/currency-equiv';
```

Replace lines 157–168 (the comment + `esCurrencyEquiv` + `customTextForLocale` consts):

```ts
  // LATAM currency-equivalent shown inside Stripe Checkout (custom_text.submit).
  // Single source: src/shared/lib/currency-equiv.ts (mirrored into
  // messages/es.json for the UI, sync-tested — see the module header for the
  // quarterly FX refresh procedure).
  const customTextForLocale =
    localeFromBody === 'es'
      ? { submit: { message: CURRENCY_EQUIV[plan] } }
      : undefined;
```

- [ ] **Step 4: Run tests to verify the new test turns green and the hardcode is gone**

Run: `grep -c "630 MXN" src/app/api/v1/stripe/checkout/route.ts`
Expected: `0`

Run: `npx vitest run src/app/api/v1/stripe/checkout/__tests__/`
Expected: PASS (the Step-1 test is now green; all three checkout test files pass — the existing `toContain('MXN')`/`toContain('630')` tests keep passing against the shared strings)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/v1/stripe/checkout/route.ts src/app/api/v1/stripe/checkout/__tests__/route.test.ts
git commit -m "feat(sp-b/T4): checkout custom_text consumes shared CURRENCY_EQUIV (3rd FX copy deleted)"
```

---

### Task 5: In-modal trust row (D3)

**Files:**
- Modify: `messages/en.json` (insert after line 1038, `paywall.noCharge`), `messages/es.json` (insert after line 1041, `paywall.noCharge`)
- Modify: `src/shared/components/PaywallModal.tsx` (after the CTA `<button>` block — anchor: the button with `aria-busy={loading}`, before the `{/* Error */}` block)
- Test: `src/shared/components/__tests__/PaywallModal.trustRow.test.tsx` (new)

**Interfaces:**
- Produces: `paywall.trustRow` key, rendered unconditionally (both locales) as one muted line under the CTA. Text only — badges/logos were rejected in the spec (no legal review for card-network logos).

- [ ] **Step 1: Write the failing test**

```tsx
// src/shared/components/__tests__/PaywallModal.trustRow.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

const mockLocale = vi.fn<() => string>(() => 'es');

vi.mock('next-intl', () => ({
  useTranslations: (ns: string) => {
    const t = ((key: string, vars?: Record<string, unknown>) =>
      vars ? `${ns}.${key}:${JSON.stringify(vars)}` : `${ns}.${key}`) as ((
      k: string,
      v?: Record<string, unknown>,
    ) => string) & { has: (k: string) => boolean };
    t.has = () => false;
    return t;
  },
  useLocale: () => mockLocale(),
}));
vi.mock('@/shared/lib/analytics', () => ({
  trackEvent: vi.fn(),
  AnalyticsEvent: new Proxy({}, { get: (_, k) => String(k) }),
}));
vi.mock('@/shared/lib/utm-cookie', () => ({
  readUtmLastTouch: vi.fn().mockReturnValue({}),
}));

import { PaywallModal } from '../PaywallModal';

describe('PaywallModal — trust row (SP-B D3)', () => {
  it('renders the trust row for locale=es', () => {
    mockLocale.mockReturnValue('es');
    render(<PaywallModal open={true} onClose={vi.fn()} />);
    expect(screen.getByText('paywall.trustRow')).toBeTruthy();
  });

  it('renders the trust row for locale=en (both locales, unconditional)', () => {
    mockLocale.mockReturnValue('en');
    render(<PaywallModal open={true} onClose={vi.fn()} />);
    expect(screen.getByText('paywall.trustRow')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shared/components/__tests__/PaywallModal.trustRow.test.tsx`
Expected: FAIL — `Unable to find an element with the text: paywall.trustRow`

- [ ] **Step 3: Add the message keys**

`messages/en.json` — insert after line 1038 (`"noCharge": "You won't be charged until {date}",`):

```json
    "trustRow": "Cancel anytime · 14-day money-back · Secured by Stripe",
```

`messages/es.json` — insert after line 1041 (`"noCharge": "No se te cobrará hasta el {date}",`):

```json
    "trustRow": "Cancela cuando quieras · Garantía de 14 días · Pago seguro con Stripe",
```

- [ ] **Step 4: Render it in the modal**

In `src/shared/components/PaywallModal.tsx`, immediately after the CTA button's closing `</button>` (the button with `aria-busy={loading}`) and before the `{/* Error */}` block, insert:

```tsx
          {/* Trust row — card-decision reassurance, both locales (SP-B D3) */}
          <p className="text-xs text-white/35 text-center mt-3">
            {t('trustRow')}
          </p>
```

- [ ] **Step 5: Run the modal test files**

Run: `npx vitest run src/shared/components/__tests__/PaywallModal.trustRow.test.tsx src/shared/components/__tests__/PaywallModal.trigger.test.tsx src/shared/components/__tests__/PaywallModal.utm.test.tsx src/shared/components/__tests__/PaywallModal.currency.test.tsx`
Expected: PASS (2 new + no regressions)

- [ ] **Step 6: Verify JSON validity**

Run: `node -e "console.log(require('./messages/en.json').paywall.trustRow); console.log(require('./messages/es.json').paywall.trustRow)"`
Expected: the two trust-row strings, no parse error

- [ ] **Step 7: Commit**

```bash
git add messages/en.json messages/es.json src/shared/components/PaywallModal.tsx src/shared/components/__tests__/PaywallModal.trustRow.test.tsx
git commit -m "feat(sp-b/T5): D3 — in-modal trust row (cancel anytime / money-back / Stripe) both locales"
```

---

### Task 6: CookieConsent i18n via server-resolved props from RootLayout (D4)

**Files:**
- Modify: `messages/en.json`, `messages/es.json` (new top-level `cookieConsent` namespace — insert immediately BEFORE the `"appShell"` key, line 578 in both files)
- Modify: `src/shared/components/CookieConsent.tsx` (strings + hrefs + required props)
- Modify: `src/app/layout.tsx` (resolve strings server-side at lines 55–56, pass at line 85)
- Test: `src/shared/components/__tests__/CookieConsent.test.tsx` (new)

**Interfaces:**
- Produces: `CookieConsent({ strings, privacyHref }: { strings: CookieConsentStrings; privacyHref: string })` — **required** props (D4/error-handling: compile-time guarantee, no runtime English fallback). `CookieConsentStrings` exported for the test + layout.
- Consumes: `getLocale()`/`getTranslations()` already called in RootLayout (`src/app/layout.tsx:55-56` — the appShell pattern). The component stays mounted OUTSIDE `NextIntlClientProvider` (layout.tsx:85) — do NOT move it under `[locale]` (Phase 0's portal z-fix and mount order depend on the current topology).
- Copy is the SP-F-coordinated honest version (analytics AND ad measurement). **EN `ariaLabel` stays exactly `"Cookie consent"`** (Phase 0 e2e contract, see Global Constraints).

- [ ] **Step 1: Write the failing test**

```tsx
// src/shared/components/__tests__/CookieConsent.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';

// CookieConsent imports the consent helpers from PostHogProvider — stub them
// so no PostHog init runs and the "no decision yet" branch always shows.
vi.mock('../PostHogProvider', () => ({
  COOKIE_CONSENT_KEY: 'estrevia_cookie_consent',
  getCookieConsent: vi.fn(() => null),
}));
vi.mock('@/shared/lib/analytics', () => ({
  trackEvent: vi.fn(),
  AnalyticsEvent: new Proxy({}, { get: (_, k) => String(k) }),
}));

import { CookieConsent, type CookieConsentStrings } from '../CookieConsent';

const ES_STRINGS: CookieConsentStrings = {
  ariaLabel: 'Consentimiento de cookies',
  shortCopy: 'Cookies de analítica y anuncios.',
  shortPrivacyLabel: 'Privacidad',
  shortPrivacyAria: 'Política de privacidad',
  fullCopy: 'Usamos cookies para analítica y medición de anuncios — solo después de que aceptes.',
  privacyPolicyLabel: 'Política de privacidad',
  decline: 'Rechazar',
  accept: 'Aceptar',
};

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

function renderBanner() {
  const utils = render(<CookieConsent strings={ES_STRINGS} privacyHref="/es/privacy" />);
  // The banner shows after an 800ms anti-flash delay.
  act(() => {
    vi.advanceTimersByTime(800);
  });
  return utils;
}

describe('CookieConsent — server-resolved strings (SP-B D4)', () => {
  it('renders the Spanish strings passed via props', () => {
    renderBanner();
    expect(screen.getByRole('dialog', { name: 'Consentimiento de cookies' })).toBeTruthy();
    expect(screen.getByText(/solo después de que aceptes/)).toBeTruthy();
    expect(screen.getByText('Cookies de analítica y anuncios.', { exact: false })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Rechazar' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Aceptar' })).toBeTruthy();
  });

  it('both privacy links carry the locale-prefixed href', () => {
    renderBanner();
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link.getAttribute('href')).toBe('/es/privacy');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shared/components/__tests__/CookieConsent.test.tsx`
Expected: FAIL — TS: `CookieConsent` takes no props / `CookieConsentStrings` not exported; hardcoded "Decline"/"Accept" render instead of Spanish

- [ ] **Step 3: Add the message namespace (both locales)**

In `messages/en.json`, insert immediately BEFORE the `"appShell": {` line (line 578), as a top-level sibling:

```json
  "cookieConsent": {
    "ariaLabel": "Cookie consent",
    "shortCopy": "Analytics & ad cookies.",
    "shortPrivacyLabel": "Privacy",
    "shortPrivacyAria": "Privacy Policy",
    "fullCopy": "We use cookies for analytics and ad measurement — only after you accept.",
    "privacyPolicyLabel": "Privacy Policy",
    "decline": "Decline",
    "accept": "Accept"
  },
```

In `messages/es.json`, same position (before `"appShell": {`, line 578):

```json
  "cookieConsent": {
    "ariaLabel": "Consentimiento de cookies",
    "shortCopy": "Cookies de analítica y anuncios.",
    "shortPrivacyLabel": "Privacidad",
    "shortPrivacyAria": "Política de privacidad",
    "fullCopy": "Usamos cookies para analítica y medición de anuncios — solo después de que aceptes.",
    "privacyPolicyLabel": "Política de privacidad",
    "decline": "Rechazar",
    "accept": "Aceptar"
  },
```

- [ ] **Step 4: Convert the component to required props**

In `src/shared/components/CookieConsent.tsx`:

1. Update the header comment (lines 3–10) — append one line to the doc block:

```tsx
 * i18n: mounts OUTSIDE NextIntlClientProvider (root layout), so strings are
 * resolved server-side in RootLayout (getTranslations('cookieConsent')) and
 * passed via the required `strings` prop — see src/app/layout.tsx.
```

2. Below the imports, add the interfaces and change the signature:

```tsx
export interface CookieConsentStrings {
  ariaLabel: string;
  shortCopy: string;
  shortPrivacyLabel: string;
  shortPrivacyAria: string;
  fullCopy: string;
  privacyPolicyLabel: string;
  decline: string;
  accept: string;
}

interface CookieConsentProps {
  /** Server-resolved i18n strings (component mounts outside NextIntlClientProvider). */
  strings: CookieConsentStrings;
  /** Locale-prefixed privacy policy path, e.g. "/es/privacy". */
  privacyHref: string;
}

export function CookieConsent({ strings, privacyHref }: CookieConsentProps) {
```

3. String/href swaps in the JSX (each anchor is unique in the file):
   - `aria-label="Cookie consent"` → `aria-label={strings.ariaLabel}`
   - Mobile span: `Analytics cookies only.{' '}` → `{strings.shortCopy}{' '}`
   - Mobile link: `href="/privacy"` → `href={privacyHref}`; `aria-label="Privacy Policy"` → `aria-label={strings.shortPrivacyAria}`; link text `Privacy` → `{strings.shortPrivacyLabel}`
   - Desktop span: the two-line copy `We use analytics cookies to understand how you use Estrevia and improve the experience. No ads, no third-party tracking.{' '}` → `{strings.fullCopy}{' '}`
   - Desktop link: `href="/privacy"` → `href={privacyHref}`; link text `Privacy Policy` → `{strings.privacyPolicyLabel}`
   - Decline button text `Decline` → `{strings.decline}`
   - Accept button text `Accept` → `{strings.accept}`

- [ ] **Step 5: Wire RootLayout**

In `src/app/layout.tsx`, after line 56 (`const tAppShell = await getTranslations('appShell');`) add:

```tsx
  // CookieConsent mounts outside NextIntlClientProvider (below), so its
  // strings are resolved here server-side and passed as props (appShell pattern).
  const tCookie = await getTranslations('cookieConsent');
  const cookieConsentStrings = {
    ariaLabel: tCookie('ariaLabel'),
    shortCopy: tCookie('shortCopy'),
    shortPrivacyLabel: tCookie('shortPrivacyLabel'),
    shortPrivacyAria: tCookie('shortPrivacyAria'),
    fullCopy: tCookie('fullCopy'),
    privacyPolicyLabel: tCookie('privacyPolicyLabel'),
    decline: tCookie('decline'),
    accept: tCookie('accept'),
  };
```

and change the mount at line 85:

```tsx
          <CookieConsent
            strings={cookieConsentStrings}
            privacyHref={locale === 'es' ? '/es/privacy' : '/privacy'}
          />
```

- [ ] **Step 6: Run tests + typecheck**

Run: `npx vitest run src/shared/components/__tests__/CookieConsent.test.tsx`
Expected: PASS (2 tests)

Run: `npm run typecheck`
Expected: clean — this also proves RootLayout passes the now-required props (the layout has no unit test; the required-prop contract IS the compile-time test).

- [ ] **Step 7: Commit**

```bash
git add messages/en.json messages/es.json src/shared/components/CookieConsent.tsx src/app/layout.tsx src/shared/components/__tests__/CookieConsent.test.tsx
git commit -m "feat(sp-b/T6): D4 — CookieConsent i18n via server-resolved props + locale-prefixed privacy links"
```

---

### Task 7: Spanish calendar + DateInput aria i18n (D6a)

**Files:**
- Modify: `messages/en.json`, `messages/es.json` (new top-level `dateInput` namespace — insert immediately BEFORE the `"appShell"` key, i.e. directly above the `cookieConsent` block added in Task 6)
- Modify: `src/modules/astro-engine/components/DateInput.tsx` (month/weekday tables at lines 37–45; segment arias at 286/303/320; toggle aria at 353; popover at 484/492/496-497/504/512/540)
- Test: `src/modules/astro-engine/components/__tests__/DateInput.calendar.test.tsx` (new)

**Interfaces:**
- Produces: locale-keyed `MONTH_NAMES`/`MONTH_ABBR`/`WEEKDAY_HEADERS` tables + `localeKey()` helper; all seven hardcoded aria-labels move to the `dateInput` namespace. No library added (D6 — DateInput is fully custom).
- Consumes: existing `useLocale()` (DateInput.tsx:90); `useTranslations` (new — all consumers `BirthDataForm`, `HeroCalculator`, `BirthDataFormStandalone`, `PlanetaryHoursGrid` render under `NextIntlClientProvider`, and every existing test that renders those consumers mocks DateInput — verified — so no test collateral).

- [ ] **Step 1: Write the failing test**

```tsx
// src/modules/astro-engine/components/__tests__/DateInput.calendar.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { DateInput } from '../DateInput';

const esMessages = {
  dateInput: {
    monthAria: 'Mes',
    dayAria: 'Día',
    yearAria: 'Año',
    openCalendarAria: 'Abrir calendario',
    calendarDialogAria: 'Calendario para elegir fecha',
    prevMonthAria: 'Mes anterior',
    nextMonthAria: 'Mes siguiente',
  },
};

const enMessages = {
  dateInput: {
    monthAria: 'Month',
    dayAria: 'Day',
    yearAria: 'Year',
    openCalendarAria: 'Open calendar',
    calendarDialogAria: 'Date picker calendar',
    prevMonthAria: 'Previous month',
    nextMonthAria: 'Next month',
  },
};

function renderInput(locale: 'en' | 'es') {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === 'es' ? esMessages : enMessages}>
      <DateInput value="1990-01-15" onChange={vi.fn()} />
    </NextIntlClientProvider>,
  );
}

describe('DateInput — Spanish calendar (SP-B D6)', () => {
  it('popover header, weekdays and day-cell aria are Spanish for locale=es', () => {
    renderInput('es');
    fireEvent.click(screen.getByRole('button', { name: 'Abrir calendario' }));
    expect(screen.getByRole('dialog', { name: 'Calendario para elegir fecha' })).toBeTruthy();
    expect(screen.getByText(/enero/)).toBeTruthy(); // header "enero 1990"
    expect(screen.getByText('Lu')).toBeTruthy(); // weekday headers Do…Sá
    expect(screen.getByText('Sá')).toBeTruthy();
    expect(screen.getByRole('button', { name: '15 ene 1990' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mes anterior' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mes siguiente' })).toBeTruthy();
  });

  it('segment inputs announce in Spanish', () => {
    renderInput('es');
    expect(screen.getByLabelText('Día')).toBeTruthy();
    expect(screen.getByLabelText('Mes')).toBeTruthy();
    expect(screen.getByLabelText('Año')).toBeTruthy();
  });

  it('stays English for locale=en (regression)', () => {
    renderInput('en');
    fireEvent.click(screen.getByRole('button', { name: 'Open calendar' }));
    expect(screen.getByText(/January/)).toBeTruthy();
    expect(screen.getByText('Su')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Jan 15, 1990' })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/astro-engine/components/__tests__/DateInput.calendar.test.tsx`
Expected: FAIL — no button named "Abrir calendario" (aria is hardcoded "Open calendar"), header/weekdays English

- [ ] **Step 3: Add the message namespace (both locales)**

In `messages/en.json`, insert immediately BEFORE the `"cookieConsent"` block (top-level sibling):

```json
  "dateInput": {
    "monthAria": "Month",
    "dayAria": "Day",
    "yearAria": "Year",
    "openCalendarAria": "Open calendar",
    "calendarDialogAria": "Date picker calendar",
    "prevMonthAria": "Previous month",
    "nextMonthAria": "Next month"
  },
```

In `messages/es.json`, same position:

```json
  "dateInput": {
    "monthAria": "Mes",
    "dayAria": "Día",
    "yearAria": "Año",
    "openCalendarAria": "Abrir calendario",
    "calendarDialogAria": "Calendario para elegir fecha",
    "prevMonthAria": "Mes anterior",
    "nextMonthAria": "Mes siguiente"
  },
```

- [ ] **Step 4: Localize the tables and arias in DateInput.tsx**

1. Line 5: extend the next-intl import → `import { useLocale, useTranslations } from 'next-intl';`

2. Replace the `MONTH_NAMES`/`MONTH_ABBR` consts (lines 37–45) with:

```ts
const MONTH_NAMES: Record<'en' | 'es', readonly string[]> = {
  en: [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ],
  // Spanish month names are lowercase by convention (RAE).
  es: [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ],
};

const MONTH_ABBR: Record<'en' | 'es', readonly string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
};

const WEEKDAY_HEADERS: Record<'en' | 'es', readonly string[]> = {
  en: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
  es: ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'],
};

/** App locales are 'en' | 'es'; anything unexpected falls back to English. */
function localeKey(locale: string): 'en' | 'es' {
  return locale === 'es' ? 'es' : 'en';
}
```

3. In the `DateInput` component body, after `const order = orderForLocale(locale);` (line 91), add:

```ts
  const t = useTranslations('dateInput');
```

4. Segment/toggle aria swaps:
   - line 286: `aria-label="Month"` → `aria-label={t('monthAria')}`
   - line 303: `aria-label="Day"` → `aria-label={t('dayAria')}`
   - line 320: `aria-label="Year"` → `aria-label={t('yearAria')}`
   - line 353: `aria-label="Open calendar"` → `aria-label={t('openCalendarAria')}`

5. In `CalendarPopover` (same file), at the top of the function body — immediately before `const today = new Date();` (line 392) — add:

```ts
    const locale = useLocale();
    const lk = localeKey(locale);
    const t = useTranslations('dateInput');
```

6. Popover swaps:
   - line 484: `aria-label="Date picker calendar"` → `aria-label={t('calendarDialogAria')}`
   - line 492: `aria-label="Previous month"` → `aria-label={t('prevMonthAria')}`
   - line 497: `{MONTH_NAMES[viewMonth - 1]} {viewYear}` → `{MONTH_NAMES[lk][viewMonth - 1]} {viewYear}`
   - line 504: `aria-label="Next month"` → `aria-label={t('nextMonthAria')}`
   - line 512: `{['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (` → `{WEEKDAY_HEADERS[lk].map((d) => (`
   - line 540, the day-cell aria:

```tsx
                  aria-label={
                    lk === 'es'
                      ? `${d} ${MONTH_ABBR.es[viewMonth - 1]} ${viewYear}`
                      : `${MONTH_ABBR.en[viewMonth - 1]} ${d}, ${viewYear}`
                  }
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/modules/astro-engine/components/__tests__/DateInput.calendar.test.tsx src/modules/astro-engine/components/__tests__/BirthDataForm.test.tsx src/modules/astro-engine/components/__tests__/HeroCalculator.test.tsx`
Expected: PASS (new suite green; BirthDataForm/HeroCalculator unaffected — they mock DateInput)

- [ ] **Step 6: Commit**

```bash
git add messages/en.json messages/es.json src/modules/astro-engine/components/DateInput.tsx src/modules/astro-engine/components/__tests__/DateInput.calendar.test.tsx
git commit -m "feat(sp-b/T7): D6 — Spanish calendar (months/weekdays/day-aria) + DateInput aria i18n"
```

---

### Task 8: TimeInput + CityAutocomplete Spanish aria/error strings (D6b)

**Files:**
- Modify: `messages/en.json`, `messages/es.json` (`timePicker` gains `timeGroupAria`; new top-level `cityAutocomplete` namespace)
- Modify: `src/modules/astro-engine/components/TimeInput.tsx` (arias at lines 156/171/188)
- Modify: `src/modules/astro-engine/components/CityAutocomplete.tsx` (listbox aria at line 238; `fetchError` string state → boolean + i18n render at lines 51/72/86/228-230)
- Test: `src/modules/astro-engine/components/__tests__/ConversionPathAria.es.test.tsx` (new)

**Interfaces:**
- Produces: `timePicker.timeGroupAria` (EN "Time" / ES "Hora"); reuses existing `timePicker.hourLabel`/`minuteLabel` ("Hour"/"Hora", "Minute"/"Minutos" — already translated, currently unused by TimeInput). New `cityAutocomplete.suggestionsAria` + `cityAutocomplete.searchUnavailable` (the fetch-error line is user-visible English on /es/ — localized here because it sits on the same conversion path; noted as a deliberate minor scope addition).
- Consumes: `useTranslations` (both components render only under `NextIntlClientProvider`; every existing test that touches them mocks the component — verified for BirthDataForm/HeroCalculator suites).
- Design note: `fetchError` becomes a **boolean** so `t()` is not called inside the fetch `useEffect` (a `t` dep would re-fire the effect every render); the message is resolved at render time instead.

- [ ] **Step 1: Write the failing test**

```tsx
// src/modules/astro-engine/components/__tests__/ConversionPathAria.es.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { TimeInput } from '../TimeInput';
import { CityAutocomplete } from '../CityAutocomplete';

const esMessages = {
  timePicker: {
    hourLabel: 'Hora',
    minuteLabel: 'Minutos',
    timeGroupAria: 'Hora',
  },
  cityAutocomplete: {
    suggestionsAria: 'Sugerencias de ciudades',
    searchUnavailable: 'Búsqueda de ciudades no disponible',
  },
};

function renderEs(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="es" messages={esMessages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Conversion-path aria i18n (SP-B D6)', () => {
  it('TimeInput group and segments announce in Spanish', () => {
    renderEs(<TimeInput value="12:30" onChange={vi.fn()} />);
    expect(screen.getByRole('group', { name: 'Hora' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Hora' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Minutos' })).toBeTruthy();
  });

  it('CityAutocomplete dropdown announces in Spanish', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [
            {
              name: 'Bogotá',
              admin1: 'Bogotá D.C.',
              country: 'Colombia',
              countryCode: 'CO',
              latitude: 4.71,
              longitude: -74.07,
              timezone: 'America/Bogota',
              population: 7900000,
            },
          ],
        }),
      }),
    );
    renderEs(<CityAutocomplete value="" onCitySelect={vi.fn()} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Bogo' } });
    // 300ms debounce + fetch — findBy polls past both.
    const list = await screen.findByRole('listbox', { name: 'Sugerencias de ciudades' });
    expect(list).toBeTruthy();
  });

  it('CityAutocomplete fetch failure shows the Spanish error line', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    renderEs(<CityAutocomplete value="" onCitySelect={vi.fn()} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Bogo' } });
    expect(await screen.findByText('Búsqueda de ciudades no disponible')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/astro-engine/components/__tests__/ConversionPathAria.es.test.tsx`
Expected: FAIL — group is named "Time", listbox "City suggestions", error "City search unavailable" (all hardcoded English)

- [ ] **Step 3: Add the message keys (both locales)**

In `messages/en.json`, inside the `timePicker` object, insert directly above the `"hourLabel": "Hour",` line (do NOT append after `"switchFormatAria"` — it is the LAST key of the object, so a trailing comma there would break the JSON):

```json
    "timeGroupAria": "Time",
```

In `messages/es.json`, same position inside `timePicker` — directly above the `"hourLabel": "Hora",` line:

```json
    "timeGroupAria": "Hora",
```

In `messages/en.json`, insert a new top-level namespace immediately BEFORE the `"dateInput"` block (added in Task 7):

```json
  "cityAutocomplete": {
    "suggestionsAria": "City suggestions",
    "searchUnavailable": "City search unavailable"
  },
```

In `messages/es.json`, same position:

```json
  "cityAutocomplete": {
    "suggestionsAria": "Sugerencias de ciudades",
    "searchUnavailable": "Búsqueda de ciudades no disponible"
  },
```

- [ ] **Step 4: Localize TimeInput**

In `src/modules/astro-engine/components/TimeInput.tsx`:

1. After the react import (line 3), add:

```ts
import { useTranslations } from 'next-intl';
```

2. In the component body, after the `const parsed = parseTime(value);` line, add:

```ts
  const t = useTranslations('timePicker');
```

3. Aria swaps:
   - line 156: `aria-label="Time"` → `aria-label={t('timeGroupAria')}`
   - line 171: `aria-label="Hour"` → `aria-label={t('hourLabel')}`
   - line 188: `aria-label="Minute"` → `aria-label={t('minuteLabel')}`

- [ ] **Step 5: Localize CityAutocomplete**

In `src/modules/astro-engine/components/CityAutocomplete.tsx`:

1. After the react import block (ends line 11), add:

```ts
import { useTranslations } from 'next-intl';
```

2. In the component body, next to the other hooks (after the `const [fetchError, …]` line), add:

```ts
  const t = useTranslations('cityAutocomplete');
```

3. `fetchError` string → boolean (avoids `t` inside the effect):
   - line 51: `const [fetchError, setFetchError] = useState<string | null>(null);` → `const [fetchError, setFetchError] = useState(false);`
   - line 72: `setFetchError(null);` → `setFetchError(false);`
   - line 86: `setFetchError('City search unavailable');` → `setFetchError(true);`
   - lines 228–230, the render:

```tsx
      {/* Fetch error */}
      {fetchError && !isOpen && (
        <p className="mt-1 text-xs text-amber-400/70">{t('searchUnavailable')}</p>
      )}
```

4. line 238: `aria-label="City suggestions"` → `aria-label={t('suggestionsAria')}`

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/modules/astro-engine/components/__tests__/ConversionPathAria.es.test.tsx src/modules/astro-engine/components/__tests__/BirthDataForm.test.tsx src/modules/astro-engine/components/__tests__/HeroCalculator.test.tsx`
Expected: PASS (3 new tests; BirthDataForm/HeroCalculator unaffected — they mock CityAutocomplete/TimePickerField)

- [ ] **Step 7: Commit**

```bash
git add messages/en.json messages/es.json src/modules/astro-engine/components/TimeInput.tsx src/modules/astro-engine/components/CityAutocomplete.tsx src/modules/astro-engine/components/__tests__/ConversionPathAria.es.test.tsx
git commit -m "feat(sp-b/T8): D6 — TimeInput + CityAutocomplete Spanish aria and error strings"
```

---

### Task 9: Local-currency-billing decision doc + watch-metric runbook (D5)

**Files:**
- Create: `outputs/sp-b/currency-decision.md`

**Interfaces:**
- Produces: the committed evaluation D5 requires — what `currency_options` would take end-to-end, the uplift hypothesis, an explicit revisit trigger, and the post-relaunch watch-metric runbook (spec success criterion 4). No code.

- [ ] **Step 1: Write the doc**

```markdown
# Local-currency billing for ES/LATAM — decision record (SP-B D5)

**Date:** 2026-07-11 · **Decision: STAY USD for now.** Display-only US$ framing +
fresh equivalents + trust pack (SP-B) ship first; real multi-currency is deferred
behind the trigger below.

## Why not now

Stripe `currency_options` on the two live Prices (`STRIPE_PRICE_ID_PRO_MONTHLY`,
`STRIPE_PRICE_ID_PRO_ANNUAL`) would make Checkout charge real MXN/COP/etc. by buyer
location with ZERO session-creation code change — which is exactly the problem:
every surface downstream assumes USD.

## What `currency_options` would take end-to-end

1. **Stripe:** add `currency_options` to both Prices (Dashboard or API `prices.update`);
   pick per-currency price points (psychological pricing per market, not raw FX).
2. **UI:** `US$4.99`/`US$34.99` strings (messages/*.json) and the entire FX-equivalence
   layer (`src/shared/lib/currency-equiv.ts`, `CurrencyEquivNote`, checkout
   `custom_text`) become WRONG the moment Stripe charges real MXN — all three would
   need per-currency display logic or removal.
3. **Webhooks/analytics:** `checkout.session.completed` amount fields arrive in the
   charged currency; revenue events (SUBSCRIPTION_STARTED value), dunning email copy
   ("$34.99"), and every audit script that sums `amount_total` assume USD cents.
4. **Meta constraint:** the Stripe-USD AR-exclusion in
   `scripts/advertising/setup-meta-campaign.ts` exists BECAUSE billing is USD;
   charging ARS would reopen Argentina targeting — a separate decision with its own
   FX-volatility risk.
5. **Ops:** refunds/disputes/support in 5+ currencies; FX spread on payouts;
   per-currency tax handling review.

Estimated effort: ~2–4 days code + audit-script sweep + a repricing decision per
market. pix/OXXO stay out regardless — settled NOT implementable for subscriptions
(`outputs/cro-audit-2026-07-10/09-es.md` ES-3).

## Uplift hypothesis (unproven)

The audit shows ES users abandon AT the card decision (21/22 sessions expired
pre-card-entry). Foreign-currency friction is one plausible cause; ambiguous
"$34.99" (reads as pesos) is another — SP-B removes the second cheaply. If
US$-framing + trust copy already lifts ES completion toward EN's 24%, multi-currency
buys little; if ES stays flat, currency itself is the stronger suspect.

## Revisit trigger

Re-open this decision if **ES Stripe-page completion (sessions created → completed)
is still <10% after 2 weeks of post-SP-B ES traffic** (baseline 4.5%, EN 24.1%).

## Watch-metric runbook (post-ES-relaunch)

Metric: Stripe Checkout sessions created→completed, ES only. Target **>10%**.

Read-only check (run from repo root; uses `.env` `STRIPE_SECRET_KEY`):

    node --input-type=module -e "
    import { config } from 'dotenv'; config({ path: '.env' });
    import Stripe from 'stripe';
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const since = Math.floor(Date.now() / 1000) - 14 * 86400;
    let created = 0, completed = 0;
    for await (const s of stripe.checkout.sessions.list({ created: { gte: since }, limit: 100 })) {
      if (s.metadata?.locale !== 'es') continue;
      created += 1;
      if (s.status === 'complete') completed += 1;
    }
    console.log(\`ES sessions last 14d: created=\${created} completed=\${completed} rate=\${created ? ((100 * completed) / created).toFixed(1) : 'n/a'}%\`);
    "

Cross-check in PostHog: `checkout_stripe_redirected` vs `subscription_started`
by locale — derive locale from `$pathname` prefix until the super-prop backfill
settles (known /essays mislabel, fixed in CRO Phase 0).
```

- [ ] **Step 2: Verify the inline snippet parses**

Run: `node --check outputs/sp-b/currency-decision.md 2>/dev/null; echo "skip (markdown)"` — not applicable to markdown; instead sanity-run the embedded one-liner in DRY form:

Run: `node --input-type=module -e "import Stripe from 'stripe'; console.log('stripe import ok')"`
Expected: `stripe import ok` (the package is a prod dependency)

- [ ] **Step 3: Commit**

```bash
git add outputs/sp-b/currency-decision.md
git commit -m "chore(sp-b/T9): D5 — currency-billing decision record (stay USD) + ES watch-metric runbook"
```

---

### Task 10: Full verification gate + founder checklist

**Files:**
- None created — verification and handoff only.

- [ ] **Step 1: Full unit suite**

Run: `npx vitest run`
Expected: ALL PASS (baseline 2276+ tests plus the ~15 new SP-B tests; zero failures)

- [ ] **Step 2: Types + lint**

Run: `npm run typecheck`
Expected: clean.

Run: `npm run lint`
Expected: no NEW issues in files this plan touched (ignore the known `.claude/worktrees/**` noise — grep the output before treating anything as a regression).

- [ ] **Step 3: E2E — existing specs unaffected**

Run: `npm run test:e2e`
Expected: green, specifically `tests/e2e/paywall-cta.spec.ts` and (post-Phase-0) `tests/e2e/paywall-mobile-consent.spec.ts` — the latter proves the EN cookie-banner `aria-label="Cookie consent"` contract survived Task 6.

- [ ] **Step 4: Manual ES smoke (dev server)**

Run `npm run dev`, then verify:
- `/es/pricing`: Pro card shows `US$34.99`, the equiv line, and `Se factura en dólares (USD)`; toggle to Mensual shows `US$4.99` + monthly equiv.
- Any paywall trigger on /es/ (e.g. an essay): modal shows US$ price, equiv + billedInUsd, and the trust row `Cancela cuando quieras · Garantía de 14 días · Pago seguro con Stripe`.
- Fresh profile on /es/: cookie banner is Spanish, both privacy links go to `/es/privacy`.
- /es/ landing HeroCalculator: calendar popover shows `enero…`, weekdays `Do…Sá`.

- [ ] **Step 5: Founder handoff (record in the session summary — NOT code)**

1. **[FOUNDER-VERIFY] FX rates:** the equivalents in `src/shared/lib/currency-equiv.ts` are 2026-05-23 vintage. Follow the module-header refresh procedure (edit the two strings + mirror into `messages/es.json`; the sync test enforces the mirror) BEFORE re-enabling ES Meta spend.
2. **Trust-row claim check:** the copy promises a 14-day money-back guarantee — confirm this is the policy you honor (terms page currently documents the paid tier without an explicit money-back window).
3. **SP-F coordination:** banner strings shipped here are the agreed honest version ("analytics and ad measurement"); SP-F owns the consent MECHANICS and must not fork the copy.
4. **Post-deploy:** create one ES Stripe Checkout session end-to-end (test mode is fine) and confirm the Stripe page shows the equiv line under the pay button in es-419.
5. **Do NOT re-enable ES ads** until this SP is deployed and item 1 is done (spec gate).

No commit in this task.

---

## Self-review notes

**Spec coverage → tasks:**
- Goal 1 / D1 (US$ framing + billedInUsd, ES only, EN untouched) → T2 (strings), T3 (billedInUsd render in modal + pricing card via `CurrencyEquivNote`).
- Goal 1 / D2 (single FX source, 3 copies → 1; visible strings stay in `messages/*`; quarterly-refresh comment points at ONE file) → T1 (lib + sync test), T3 (component replaces the 2 inline copies), T4 (route consumes lib, 3rd copy deleted).
- Goal 2 / D3 (in-modal trust row, both locales, text-only) → T5.
- Goal 3 / D4 (CookieConsent Spanish via props from RootLayout, honest copy, locale-prefixed privacy links, component NOT moved under `[locale]`, TS-required prop) → T6.
- Goal 4 / D6 (Spanish calendar in DateInput, no library; conversion-path aria-labels → next-intl: DateInput/TimeInput/CityAutocomplete only) → T7, T8.
- Goal 5 / D5 (local-currency decision = stay USD; evaluation doc with end-to-end cost, uplift hypothesis, revisit trigger) → T9.
- Error handling (`CurrencyEquivNote` null for EN; required CookieConsent props) → T3 Step 3, T6 Step 4.
- Testing section (CurrencyEquivNote unit, checkout custom_text, trust row, DateInput es popover, PricingToggle badge test update, CookieConsent es, e2e green) → T1–T8 test steps + T10.
- Success criteria (US$ + billedInUsd + one-source custom_text; Spanish banner/calendar/arias; decision doc; watch-metric runbook >10% target) → T2–T4, T6–T8, T9, T10 Step 4.

**Deviations:**
1. **FX freshness (D2 "refresh at implementation time"):** live FX cannot be fetched from this environment. Kept the 2026-05-23 values as `[FOUNDER-VERIFY]` constants concentrated in ONE file with step-by-step refresh instructions; founder refresh is an explicit T10 gate. This is the only placeholder-like marker in the plan (orchestrator-sanctioned).
2. **"One source" is lib + mirrored es.json:** next-intl cannot import TS, so D2's own design keeps the UI strings in `messages/es.json`; the sync test makes drift a build failure. A refresh is therefore two mirrored line-edits, not one — enforced, but not literally single-file.
3. **CityAutocomplete "City search unavailable"** is a visible string, not an aria-label — localized anyway (same conversion path, 3-line change); D6 technically scoped only aria-labels.
4. **Watch-metric runbook** folded into `outputs/sp-b/currency-decision.md` as a section instead of a separate runbook file (the revisit trigger and the metric are the same measurement).
5. **ES day-cell aria uses day-first order** ("15 ene 1990"); D6 only required the localized abbreviation — day-first reads naturally in Spanish and costs one ternary.

**Deliberately untouched hazards:**
- `cancel_url`/`success_url` locale prefixes (ES cancels land on EN /pricing) — owned by the SP-A routing sub-project; double-fixing risks conflicts.
- `pricing.monthlyPriceEquiv`/`annualPriceEquiv` keys remain absent from `en.json` — intentional (ES-only gate in `CurrencyEquivNote` means they are never resolved for EN; adding EN keys would invite accidental EN rendering).
- CookieConsent stays mounted outside `NextIntlClientProvider` in `src/app/layout.tsx` — Phase 0's z-[60] portal fix and the PostHogProvider mount order depend on this topology.
- `CityAutocomplete`'s `placeholder = 'Search city...'` default — every prod consumer passes a translated placeholder (`birthDataForm.cityPlaceholder`); left as dead-default rather than widening scope.
- ChartWheel / PositionTable / AvatarGenerator / NotificationSettings aria-labels — non-goal (later a11y batch per spec).
- The `pricingPage.currencyEquivAria` key exists only in es.json (pre-existing) — same ES-gate reasoning as above.
