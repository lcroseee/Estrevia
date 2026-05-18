# Wave 2 — Conversion Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship L4-B (A/B feature flag hook), L3-B (pricing CRO with 14d guarantee), L2-B (nurture re-engagement T+7d/T+14d/T+21d) as static improvements layered on existing Estrevia infrastructure.

**Architecture:** Three parallel-shippable items from `docs/superpowers/specs/2026-05-17-wave-2-conversion-foundation-design.md`. L4-B = client-side wrapper integrating with existing `PostHogProvider` via `window.posthog`. L3-B = static improvements to the existing pricing page (no A/B variants for v1). L2-B = extend existing nurture cron from `nurture_step` 0-3 to 0-6 with 3 new email types.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 6 (strict), Vitest 3 + Testing Library 16 (jsdom), next-intl, posthog-js (no `/react`), Resend SDK v6 + React-email, Drizzle ORM, Neon Postgres.

**Spec reference:** `docs/superpowers/specs/2026-05-17-wave-2-conversion-foundation-design.md` (commit `166b4f6`)

---

## Pre-flight verification

Before starting Task 1:

- [ ] Run `npm test` — all current tests pass on `main`. If any fail, debug existing failures first; do not start Wave 2 on red.
- [ ] Run `npm run typecheck` — no type errors.
- [ ] Run `npm run lint` — clean (or only pre-existing `.claude/worktrees/` pollution per `feedback_lint_worktrees_pollution`).
- [ ] Verify Wave 1 commits `2670c39..e5007a8` are present: `git log --oneline | grep -E "2670c39|e5007a8"`.
- [ ] Verify spec at `docs/superpowers/specs/2026-05-17-wave-2-conversion-foundation-design.md` exists (commit `166b4f6`).

---

## Task 1: L4-B — useFeatureFlag hook (TDD)

**Files:**
- Create: `src/shared/hooks/useFeatureFlag.ts`
- Create: `src/shared/hooks/__tests__/useFeatureFlag.test.ts`

**Context:** The project lazy-loads `posthog-js` inside `src/shared/components/PostHogProvider.tsx` after cookie consent. The PostHog SDK is exposed globally via `(window as { posthog?: ... }).posthog`. The custom `usePostHog()` hook from that provider returns `{ isInitialized: boolean }` — NOT the standard `posthog-js/react` instance (that package is not installed).

- [ ] **Step 1: Write failing tests**

Create `src/shared/hooks/__tests__/useFeatureFlag.test.ts`:

```ts
import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFeatureFlag } from '../useFeatureFlag';

// Mock the PostHogProvider's usePostHog hook
const mockUsePostHog = vi.fn();
vi.mock('@/shared/components/PostHogProvider', () => ({
  usePostHog: () => mockUsePostHog(),
}));

interface MockPostHog {
  getFeatureFlag: ReturnType<typeof vi.fn>;
  onFeatureFlags: ReturnType<typeof vi.fn>;
}

let mockPostHog: MockPostHog;
let onFeatureFlagsCallback: (() => void) | null;

beforeEach(() => {
  onFeatureFlagsCallback = null;
  mockPostHog = {
    getFeatureFlag: vi.fn(() => 'variant-b'),
    onFeatureFlags: vi.fn((cb: () => void) => {
      onFeatureFlagsCallback = cb;
    }),
  };
  (window as unknown as { posthog?: MockPostHog }).posthog = mockPostHog;
  mockUsePostHog.mockReturnValue({ isInitialized: true });
});

afterEach(() => {
  delete (window as unknown as { posthog?: MockPostHog }).posthog;
  vi.clearAllMocks();
});

describe('useFeatureFlag', () => {
  it('returns defaultValue with isLoading=true when not initialized', () => {
    mockUsePostHog.mockReturnValue({ isInitialized: false });
    const { result } = renderHook(() => useFeatureFlag('test-flag', 'default-value'));
    expect(result.current.value).toBe('default-value');
    expect(result.current.isLoading).toBe(true);
  });

  it('resolves to flag value with isLoading=false when initialized', () => {
    const { result } = renderHook(() => useFeatureFlag('test-flag', 'default-value'));
    expect(result.current.value).toBe('variant-b');
    expect(result.current.isLoading).toBe(false);
  });

  it('falls back to defaultValue when posthog returns null', () => {
    mockPostHog.getFeatureFlag.mockReturnValue(null);
    const { result } = renderHook(() => useFeatureFlag('test-flag', 'fallback'));
    expect(result.current.value).toBe('fallback');
    expect(result.current.isLoading).toBe(false);
  });

  it('re-evaluates when onFeatureFlags callback fires', () => {
    const { result } = renderHook(() => useFeatureFlag('test-flag', 'default'));
    expect(result.current.value).toBe('variant-b');

    mockPostHog.getFeatureFlag.mockReturnValue('variant-c');
    act(() => {
      onFeatureFlagsCallback?.();
    });
    expect(result.current.value).toBe('variant-c');
  });

  it('returns defaultValue when window.posthog is missing despite isInitialized=true', () => {
    delete (window as unknown as { posthog?: MockPostHog }).posthog;
    const { result } = renderHook(() => useFeatureFlag('test-flag', 'safe-default'));
    expect(result.current.value).toBe('safe-default');
    expect(result.current.isLoading).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shared/hooks/__tests__/useFeatureFlag.test.ts`
Expected: FAIL with "Cannot find module '../useFeatureFlag'".

- [ ] **Step 3: Implement hook**

Create `src/shared/hooks/useFeatureFlag.ts`:

```ts
import { useEffect, useState } from 'react';
import { usePostHog } from '@/shared/components/PostHogProvider';

interface Loadable<T> {
  value: T;
  isLoading: boolean;
}

interface PostHogClient {
  getFeatureFlag: (key: string) => string | boolean | null | undefined;
  onFeatureFlags: (callback: () => void) => void;
}

function getPostHogClient(): PostHogClient | null {
  if (typeof window === 'undefined') return null;
  const candidate = (window as unknown as { posthog?: PostHogClient }).posthog;
  return candidate ?? null;
}

/**
 * useFeatureFlag — read a PostHog feature flag in a React component.
 *
 * Integrates with the existing PostHogProvider (cookie-consent-gated lazy load).
 * Returns `defaultValue` until PostHog is initialized AND the flag is resolved.
 * Re-renders when PostHog re-evaluates flags (e.g. user identification flips
 * a flag's value via cohort-based targeting).
 *
 * @example
 *   const { value: variant, isLoading } = useFeatureFlag('paywall-copy-test', 'control');
 *   if (isLoading) return <ControlVariant />;
 *   return variant === 'b' ? <VariantB /> : <ControlVariant />;
 */
export function useFeatureFlag<T = boolean>(
  key: string,
  defaultValue: T
): Loadable<T> {
  const { isInitialized } = usePostHog();
  const [state, setState] = useState<Loadable<T>>({
    value: defaultValue,
    isLoading: true,
  });

  useEffect(() => {
    if (!isInitialized) return;
    const posthog = getPostHogClient();
    if (!posthog) return;

    const evaluate = () => {
      const flagValue = posthog.getFeatureFlag(key);
      const resolved = (flagValue ?? defaultValue) as T;
      setState({ value: resolved, isLoading: false });
    };
    evaluate();
    posthog.onFeatureFlags(evaluate);
  }, [isInitialized, key, defaultValue]);

  return state;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/shared/hooks/__tests__/useFeatureFlag.test.ts`
Expected: PASS (5/5 tests).

- [ ] **Step 5: Run typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/shared/hooks/useFeatureFlag.ts src/shared/hooks/__tests__/useFeatureFlag.test.ts
git commit -m "$(cat <<'EOF'
feat(wave2/L4-B): useFeatureFlag hook integrating with PostHogProvider

Client-side wrapper around window.posthog.getFeatureFlag exposed by lazy-loaded posthog-js inside PostHogProvider. Returns defaultValue until isInitialized and flag is resolved. Re-renders on PostHog onFeatureFlags callback. Foundation for Wave 3 A/B experiments.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: L4-B — feature flags guide doc

**Files:**
- Create: `docs/posthog/feature-flags-guide.md`

**Context:** Wave 3 will create experiments using this hook. Founder + future engineers need a one-page reference.

- [ ] **Step 1: Create docs/posthog/ directory if needed**

Run: `mkdir -p docs/posthog`

- [ ] **Step 2: Create the guide file**

Create `docs/posthog/feature-flags-guide.md`:

```markdown
# PostHog Feature Flags — Estrevia Guide

**Hook:** `src/shared/hooks/useFeatureFlag.ts`
**PostHog project:** `407908` (US region, `us.posthog.com`)
**Integration:** Lazy-loaded via `src/shared/components/PostHogProvider.tsx` after cookie consent.

## When to use

Wrap any client-side UI element you want to A/B test:

- Paywall copy variants
- CTA button label tests
- Pricing page section reorders
- Email subject line A/B (server-side; see "Server-side" section)

## When NOT to use

- **Server-side rendered routes** (e.g. `/pricing/page.tsx`) — hook is client-only. Wave 2 ships static pricing changes; server-side feature flag evaluation is deferred to a future wave.
- **Anonymous-only experiments before cookie consent** — flag is only evaluated after `isInitialized: true`, which requires user consent.
- **Performance-critical render path on first paint** — hook returns `defaultValue` with `isLoading: true` until PostHog resolves; design your variants so the default is the control.

## Step-by-step setup

### 1. Create the flag in PostHog UI

1. Log in to https://us.posthog.com/project/407908/feature_flags
2. Click "New feature flag".
3. Set `Key` (e.g. `paywall-copy-test`). This is the string you pass to `useFeatureFlag(key, ...)`.
4. Choose `Boolean` or `Multivariate`:
   - **Boolean** — flag is true/false. Use for simple on/off toggles.
   - **Multivariate** — flag returns one of N variant strings (e.g. `control`, `variant-b`). Use for A/B/N tests.
5. For a 50/50 boolean rollout: set "Release condition" → "Roll out to 50% of all users".
6. For multivariate: define each variant with weight (sum to 100).
7. Save. Flag is now live.

### 2. Use the hook in a React client component

```tsx
'use client';

import { useFeatureFlag } from '@/shared/hooks/useFeatureFlag';

export function PaywallCta() {
  const { value: variant, isLoading } = useFeatureFlag<string>(
    'paywall-copy-test',
    'control',
  );

  if (isLoading) return <ControlCta />;
  return variant === 'urgency' ? <UrgencyCta /> : <ControlCta />;
}
```

### 3. QA override

PostHog supports URL-based flag override for QA. Append `?__ph_flag_override=KEY:VALUE` to any page URL while logged in to PostHog (toolbar) to force a specific variant. Exact param name may vary; check the active PostHog version's docs: https://posthog.com/docs/feature-flags/testing

## Sticky assignment

- `posthog-js` stores a distinct `device_id` (anonymous) cookie pre-login.
- On `posthog.identify(userId)` (currently fired in `src/shared/lib/analytics.ts`), the device_id is associated with the user.
- Flag evaluations are sticky per user/device — repeat visits return the same variant unless the flag's release condition changes.

## Reference demo flag

A flag named `wave2-demo-flag` should be created in PostHog for documentation purposes. It is not wired to any production component. Use it to verify the toolbar override works:

```tsx
const { value } = useFeatureFlag<boolean>('wave2-demo-flag', false);
console.log('demo flag:', value);
```

## Future: server-side feature flags

For SSR routes (pricing page, marketing landing), you need server-side flag evaluation via `posthog-node`. This is deferred to a future Wave once a real experiment requires it. The current pricing page A/B (Wave 3) will use the client-side hook on `PricingToggle.tsx` (a client component), not the SSR `page.tsx`.
```

- [ ] **Step 3: Commit**

```bash
git add docs/posthog/feature-flags-guide.md
git commit -m "$(cat <<'EOF'
docs(wave2/L4-B): PostHog feature flags guide for useFeatureFlag hook

Setup walkthrough (create flag in UI, use hook in client component), QA override pattern, sticky-assignment notes, when to NOT use (SSR routes deferred), reference demo flag wave2-demo-flag.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Founder owes** — Create `wave2-demo-flag` in PostHog UI for docs validation. (Not engineer-task; founder asynchronous.)

---

## Task 3: L3-B — i18n new strings (EN + ES)

**Files:**
- Modify: `messages/en.json` (`pricing.*` namespace)
- Modify: `messages/es.json` (`pricing.*` namespace)

**Context:** Existing `pricing.heading`, `pricing.subheading`, `pricing.trustNoContracts`, `pricing.trustSecure` get replaced. Three new keys added: `saveBadgeLong`, `guaranteeHeading`, `guaranteeSubcopy`, `trustLahiri`, `trustAstrologers`. Founder must review ES copy for español neutro LATAM, `tú` form (per CLAUDE.md i18n rule).

- [ ] **Step 1: Locate the `pricing` block in `messages/en.json`**

Search: `grep -n '"pricing": {' messages/en.json`
The block starts where `"title": "Pricing"` exists (around line where I-18-N for pricing namespace begins).

- [ ] **Step 2: Update EN `pricing` namespace**

In `messages/en.json`, inside the `"pricing": {` object:

- **Modify** `"heading"` → `"Sidereal Vedic charts — Lahiri-accurate"`
- **Modify** `"subheading"` → `"The way the ancient texts intended. Try Pro risk-free for 14 days."`
- **Add** `"saveBadgeLong"` → `"Save 42% — pay $34.99 once vs $59.88 monthly"`
- **Add** `"guaranteeHeading"` → `"14-day money-back guarantee, no questions asked"`
- **Add** `"guaranteeSubcopy"` → `"Try Pro risk-free. Full refund within 14 days. Just email us."`
- **Replace** `"trustNoContracts"` with `"trustLahiri"` → `"Lahiri ayanamsa ±0.01° accuracy"`
- **Replace** `"trustSecure"` with `"trustAstrologers"` → `"Built by working astrologers"`
- **Keep** `"trustCancel"` (existing string)

Verify by reading the existing values first; replace exactly. Don't break JSON syntax.

- [ ] **Step 3: Update ES `pricing` namespace**

In `messages/es.json`:

- **Modify** `"heading"` → `"Cartas védicas siderales — precisión Lahiri"`
- **Modify** `"subheading"` → `"Como los textos antiguos las querían. Prueba Pro sin riesgo por 14 días."`
- **Add** `"saveBadgeLong"` → `"Ahorra 42% — paga $34.99 una vez vs $59.88 mensual"`
- **Add** `"guaranteeHeading"` → `"Garantía de devolución de 14 días, sin preguntas"`
- **Add** `"guaranteeSubcopy"` → `"Prueba Pro sin riesgo. Reembolso total en 14 días. Solo escríbenos."`
- **Replace** `"trustNoContracts"` with `"trustLahiri"` → `"Precisión Lahiri ayanamsa ±0.01°"`
- **Replace** `"trustSecure"` with `"trustAstrologers"` → `"Hecho por astrólogos en activo"`
- **Keep** `"trustCancel"` (existing string)

- [ ] **Step 4: Update consumer code references**

The pricing page (`src/app/[locale]/(marketing)/pricing/page.tsx:83-87`) references `trustNoContracts` + `trustCancel` + `trustSecure` in `trustItems` array. Update to reference new keys:

```tsx
const trustItems = [
  t('trustLahiri'),
  t('trustAstrologers'),
  t('trustCancel'),
];
```

This belongs in Task 5 (page.tsx). For now, just add the new keys + remove the old; Task 5 will update consumer.

- [ ] **Step 5: Validate JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/en.json'))" && node -e "JSON.parse(require('fs').readFileSync('messages/es.json'))"`
Expected: no output (parse succeeded).

- [ ] **Step 6: Commit**

```bash
git add messages/en.json messages/es.json
git commit -m "$(cat <<'EOF'
feat(wave2/L3-B): pricing i18n strings — guarantee + trust + hero refresh

New keys: saveBadgeLong, guaranteeHeading, guaranteeSubcopy, trustLahiri, trustAstrologers. Replaces trustNoContracts + trustSecure with sidereal-specific trust signals. Hero copy emphasizes Lahiri accuracy + 14d guarantee.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: L3-B — PricingToggle long-form save badge

**Files:**
- Modify: `src/app/[locale]/(marketing)/pricing/PricingToggle.tsx`
- Create: `src/app/[locale]/(marketing)/pricing/__tests__/PricingToggle.test.tsx`

**Context:** The existing `saveBadge` chip is small and positioned on the Annual toggle button. We're keeping it AND adding a more prominent long-form version below the price when Annual mode is selected.

- [ ] **Step 1: Write failing test**

Create `src/app/[locale]/(marketing)/pricing/__tests__/PricingToggle.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PricingToggle } from '../PricingToggle';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, vars?: Record<string, unknown>) =>
    vars ? `${key}:${JSON.stringify(vars)}` : key,
  useLocale: () => 'en',
}));

vi.mock('../PricingUpgradeButton', () => ({
  PricingUpgradeButton: () => <button>upgrade-stub</button>,
}));

describe('PricingToggle', () => {
  it('shows the long-form savings text when Annual is selected', () => {
    render(<PricingToggle />);
    // Annual is default per `useState('annual')`
    expect(screen.getByText('saveBadgeLong')).toBeInTheDocument();
  });

  it('hides the long-form savings text when Monthly is selected', () => {
    render(<PricingToggle />);
    const monthlyButton = screen.getByRole('radio', { name: 'monthly' });
    fireEvent.click(monthlyButton);
    expect(screen.queryByText('saveBadgeLong')).not.toBeInTheDocument();
  });

  it('still renders the existing saveBadge chip on the Annual button', () => {
    render(<PricingToggle />);
    expect(screen.getByText('saveBadge')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/\[locale\]/\(marketing\)/pricing/__tests__/PricingToggle.test.tsx`
Expected: FAIL — `saveBadgeLong` not found in render output.

- [ ] **Step 3: Modify PricingToggle.tsx**

Open `src/app/[locale]/(marketing)/pricing/PricingToggle.tsx`. Find the price text rendering (around line 90-92):

```tsx
      <p className="text-xs text-white/60 text-center mb-12">
        {billing === 'monthly' ? t('monthlyPrice') + t('monthlyLabel') : t('annualPrice') + t('annualLabel') + ' · ' + t('annualPerMonth')}
      </p>
```

Replace with:

```tsx
      <p className="text-xs text-white/60 text-center mb-3">
        {billing === 'monthly' ? t('monthlyPrice') + t('monthlyLabel') : t('annualPrice') + t('annualLabel') + ' · ' + t('annualPerMonth')}
      </p>
      {billing === 'annual' && (
        <p className="text-sm text-[#FFD700]/80 text-center mb-12 font-medium">
          {t('saveBadgeLong')}
        </p>
      )}
      {billing === 'monthly' && (
        <div className="mb-12" aria-hidden="true" />
      )}
```

The empty spacer keeps vertical rhythm consistent across modes.

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/app/\[locale\]/\(marketing\)/pricing/__tests__/PricingToggle.test.tsx`
Expected: PASS (3/3).

- [ ] **Step 5: Run typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/app/\[locale\]/\(marketing\)/pricing/PricingToggle.tsx src/app/\[locale\]/\(marketing\)/pricing/__tests__/PricingToggle.test.tsx
git commit -m "$(cat <<'EOF'
feat(wave2/L3-B): prominent long-form 42% savings text on Annual mode

Adds a second visible savings cue below the price (annual mode only). Existing small chip on the Annual toggle button is preserved. Empty spacer in monthly mode keeps vertical rhythm.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: L3-B — pricing page guarantee block + trust refresh + hero

**Files:**
- Modify: `src/app/[locale]/(marketing)/pricing/page.tsx`
- Create: `src/app/[locale]/(marketing)/pricing/__tests__/PricingPage.test.tsx`

**Context:** Adds a 14-day money-back guarantee block + updates trust footer + refines hero copy. Pricing page is a server component using `getTranslations('pricing')`.

- [ ] **Step 1: Write failing test**

Create `src/app/[locale]/(marketing)/pricing/__tests__/PricingPage.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PricingPage from '../page';

vi.mock('next-intl/server', () => ({
  getLocale: async () => 'en',
  getTranslations: async (namespace: string) =>
    (key: string) => `${namespace}.${key}`,
}));

vi.mock('@/shared/seo', () => ({
  createMetadata: vi.fn(),
  JsonLdScript: ({ schema }: { schema: unknown }) => <script data-testid="json-ld" />,
  faqSchema: () => ({}),
  breadcrumbSchema: () => ({}),
  productSchema: () => ({}),
}));

vi.mock('@/shared/seo/constants', () => ({
  SITE_URL: 'https://estrevia.app',
}));

vi.mock('../PricingToggle', () => ({
  PricingToggle: () => <div>pricing-toggle-stub</div>,
}));

describe('PricingPage', () => {
  it('renders the guarantee block', async () => {
    const ui = await PricingPage();
    render(ui);
    expect(screen.getByText('pricing.guaranteeHeading')).toBeInTheDocument();
    expect(screen.getByText('pricing.guaranteeSubcopy')).toBeInTheDocument();
  });

  it('renders refreshed trust footer items', async () => {
    const ui = await PricingPage();
    render(ui);
    expect(screen.getByText('pricing.trustLahiri')).toBeInTheDocument();
    expect(screen.getByText('pricing.trustAstrologers')).toBeInTheDocument();
    expect(screen.getByText('pricing.trustCancel')).toBeInTheDocument();
  });

  it('renders refined hero copy', async () => {
    const ui = await PricingPage();
    render(ui);
    expect(screen.getByText('pricing.heading')).toBeInTheDocument();
    expect(screen.getByText('pricing.subheading')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/\[locale\]/\(marketing\)/pricing/__tests__/PricingPage.test.tsx`
Expected: FAIL — `trustLahiri`, `guaranteeHeading`, `guaranteeSubcopy` not yet referenced.

- [ ] **Step 3: Modify page.tsx — trust items**

Open `src/app/[locale]/(marketing)/pricing/page.tsx`. Find `trustItems` (around line 83-87):

```tsx
  const trustItems = [
    t('trustNoContracts'),
    t('trustCancel'),
    t('trustSecure'),
  ];
```

Replace with:

```tsx
  const trustItems = [
    t('trustLahiri'),
    t('trustAstrologers'),
    t('trustCancel'),
  ];
```

- [ ] **Step 4: Modify page.tsx — add guarantee block**

Find `{/* Trust signals */}` section (around line 130-142). Insert a new `<section>` BEFORE the trust signals section but AFTER `<PricingToggle />`:

```tsx
          {/* Pricing cards with monthly/annual toggle */}
          <PricingToggle />

          {/* 14-day money-back guarantee block */}
          <section
            className="mt-10 mx-auto max-w-2xl rounded-xl border border-[#FFD700]/15 px-6 py-5 text-center"
            style={{ background: 'rgba(255,215,0,0.04)' }}
            aria-labelledby="guarantee-heading"
          >
            <div className="flex items-center justify-center gap-2 mb-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                width="20"
                height="20"
                style={{ color: 'rgba(255,215,0,0.7)' }}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h2
                id="guarantee-heading"
                className="text-base font-light text-white/90"
                style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)' }}
              >
                {t('guaranteeHeading')}
              </h2>
            </div>
            <p className="text-sm text-white/65 leading-relaxed">
              {t('guaranteeSubcopy')}
            </p>
          </section>

          {/* Trust signals */}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/app/\[locale\]/\(marketing\)/pricing/__tests__/PricingPage.test.tsx`
Expected: PASS (3/3).

- [ ] **Step 6: Run full pricing test suite + typecheck**

Run: `npx vitest run src/app/\[locale\]/\(marketing\)/pricing/__tests__/`
Expected: all pass (existing `PricingUpgradeButton.utm.test.tsx` + new tests).

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/app/\[locale\]/\(marketing\)/pricing/page.tsx src/app/\[locale\]/\(marketing\)/pricing/__tests__/PricingPage.test.tsx
git commit -m "$(cat <<'EOF'
feat(wave2/L3-B): guarantee block + sidereal-specific trust signals

Adds 14d money-back guarantee section below pricing cards (shield icon + heading + subcopy). Replaces generic trustNoContracts/trustSecure with Estrevia-specific trustLahiri (ayanamsa ±0.01°) + trustAstrologers. Hero copy auto-refreshes via existing t('heading')/t('subheading') keys updated in Task 3.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: L2-B — chart-keywords static map

**Files:**
- Create: `src/shared/lib/chart-keywords.ts`
- Create: `src/shared/lib/__tests__/chart-keywords.test.ts`

**Context:** Static map of 12 signs × 3 placements × 2 locales = 72 keyword strings. Used by `MiniReadingEmail.tsx` (T+14d) to template a 3-line personalized reading from Sun/Moon/Asc sign data. **Founder owns these 72 strings as content commitment.** This task ships engineer-side placeholders; founder iterates content before deploy.

- [ ] **Step 1: Write failing tests**

Create `src/shared/lib/__tests__/chart-keywords.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getSignKeywords, type SignKey } from '../chart-keywords';

describe('getSignKeywords', () => {
  const SIGNS: SignKey[] = [
    'aries', 'taurus', 'gemini', 'cancer',
    'leo', 'virgo', 'libra', 'scorpio',
    'sagittarius', 'capricorn', 'aquarius', 'pisces',
  ];

  it.each(SIGNS)('returns non-empty Sun keyword for %s (EN)', (sign) => {
    expect(getSignKeywords('en', sign, 'sun')).toMatch(/^.+$/);
  });

  it.each(SIGNS)('returns non-empty Moon keyword for %s (EN)', (sign) => {
    expect(getSignKeywords('en', sign, 'moon')).toMatch(/^.+$/);
  });

  it.each(SIGNS)('returns non-empty Asc keyword for %s (EN)', (sign) => {
    expect(getSignKeywords('en', sign, 'asc')).toMatch(/^.+$/);
  });

  it.each(SIGNS)('returns non-empty Sun keyword for %s (ES)', (sign) => {
    expect(getSignKeywords('es', sign, 'sun')).toMatch(/^.+$/);
  });

  it.each(SIGNS)('returns non-empty Moon keyword for %s (ES)', (sign) => {
    expect(getSignKeywords('es', sign, 'moon')).toMatch(/^.+$/);
  });

  it.each(SIGNS)('returns non-empty Asc keyword for %s (ES)', (sign) => {
    expect(getSignKeywords('es', sign, 'asc')).toMatch(/^.+$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shared/lib/__tests__/chart-keywords.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement chart-keywords.ts**

Create `src/shared/lib/chart-keywords.ts` with engineer placeholder keywords (founder will rewrite content):

```ts
export type SignKey =
  | 'aries' | 'taurus' | 'gemini' | 'cancer'
  | 'leo' | 'virgo' | 'libra' | 'scorpio'
  | 'sagittarius' | 'capricorn' | 'aquarius' | 'pisces';

export type Locale = 'en' | 'es';

export interface SignKeywords {
  sun: string;
  moon: string;
  asc: string;
}

/**
 * Static keyword map for the T+14d mini-reading email template.
 *
 * Each entry is a short noun-phrase that fits into the template:
 *   "Your Sun in {sign} suggests {sun}."
 *   "Your Moon in {sign} reveals {moon}."
 *   "Your Ascendant in {sign} shapes how others see you: {asc}."
 *
 * Founder content commitment: 12 × 3 × 2 = 72 strings. Engineer placeholders
 * below pass tests but are intentionally generic; founder iterates content
 * with authentic Vedic-astrology phrasing before deploy.
 */
export const SIGN_KEYWORDS: Record<Locale, Record<SignKey, SignKeywords>> = {
  en: {
    aries: { sun: 'pioneer energy', moon: 'fiery emotional response', asc: 'forward-charging presence' },
    taurus: { sun: 'steady builder', moon: 'sensual grounded feeling', asc: 'calm rooted presence' },
    gemini: { sun: 'curious mind', moon: 'restless thoughtful mood', asc: 'quick conversational presence' },
    cancer: { sun: 'caring heart', moon: 'tidal protective feeling', asc: 'sensitive nurturing presence' },
    leo: { sun: 'radiant self', moon: 'warm theatrical emotion', asc: 'magnetic confident presence' },
    virgo: { sun: 'precise craftsman', moon: 'analytic measured feeling', asc: 'attentive composed presence' },
    libra: { sun: 'relational diplomat', moon: 'balanced harmonic emotion', asc: 'graceful poised presence' },
    scorpio: { sun: 'depth seeker', moon: 'intense undercurrent feeling', asc: 'still penetrating presence' },
    sagittarius: { sun: 'wide-sky explorer', moon: 'restless wandering feeling', asc: 'open optimistic presence' },
    capricorn: { sun: 'long-game architect', moon: 'reserved enduring feeling', asc: 'measured authoritative presence' },
    aquarius: { sun: 'systems thinker', moon: 'detached observant feeling', asc: 'individual unconventional presence' },
    pisces: { sun: 'oceanic dreamer', moon: 'fluid empathic feeling', asc: 'soft transparent presence' },
  },
  es: {
    aries: { sun: 'energía pionera', moon: 'reacción emocional ardiente', asc: 'presencia frontal y directa' },
    taurus: { sun: 'constructor firme', moon: 'sentimiento sensorial y arraigado', asc: 'presencia calma y enraizada' },
    gemini: { sun: 'mente curiosa', moon: 'ánimo inquieto y pensativo', asc: 'presencia rápida y conversadora' },
    cancer: { sun: 'corazón protector', moon: 'sentimiento de marea protectora', asc: 'presencia sensible y nutritiva' },
    leo: { sun: 'identidad radiante', moon: 'emoción cálida y teatral', asc: 'presencia magnética y segura' },
    virgo: { sun: 'artesano preciso', moon: 'sentimiento analítico y medido', asc: 'presencia atenta y compuesta' },
    libra: { sun: 'diplomático relacional', moon: 'emoción equilibrada y armónica', asc: 'presencia grácil y serena' },
    scorpio: { sun: 'buscador de profundidad', moon: 'sentimiento intenso subterráneo', asc: 'presencia quieta y penetrante' },
    sagittarius: { sun: 'explorador de horizontes', moon: 'sentimiento inquieto y errante', asc: 'presencia abierta y optimista' },
    capricorn: { sun: 'arquitecto de largo plazo', moon: 'sentimiento reservado y duradero', asc: 'presencia medida y autoritaria' },
    aquarius: { sun: 'pensador de sistemas', moon: 'sentimiento desapegado y observador', asc: 'presencia individual y poco convencional' },
    pisces: { sun: 'soñador oceánico', moon: 'sentimiento fluido y empático', asc: 'presencia suave y transparente' },
  },
};

export function getSignKeywords(
  locale: Locale,
  sign: SignKey,
  placement: keyof SignKeywords,
): string {
  return SIGN_KEYWORDS[locale][sign][placement];
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/shared/lib/__tests__/chart-keywords.test.ts`
Expected: PASS (72 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shared/lib/chart-keywords.ts src/shared/lib/__tests__/chart-keywords.test.ts
git commit -m "$(cat <<'EOF'
feat(wave2/L2-B): chart-keywords static map for T+14d mini-reading

12 signs × 3 placements (sun/moon/asc) × 2 locales = 72 keyword strings. Engineer placeholders; founder iterates Vedic-authentic phrasing before deploy. Powers MiniReadingEmail.tsx personalization from user chart_data.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: Founder owes** — Rewrite all 72 strings with authentic Vedic phrasing. Engineer placeholders are intentionally bland; replace before deploy.

---

## Task 7: L2-B — schema extension + migration 0012

**Files:**
- Modify: `src/shared/lib/schema.ts` (`sentLeadEmails.emailType` enum, `email_leads_nurture_due_idx` predicate)
- Create: `drizzle/0012_<generated-name>.sql` (via `npm run db:generate`)

**Context:** Current `nurture_step` integer column is 0-3 (final). Extending to 0-6 doesn't need a schema change to the column itself, just an update to the partial index `email_leads_nurture_due_idx` predicate and to the TypeScript-only `email_type` enum on `sentLeadEmails`.

- [ ] **Step 1: Modify schema.ts — extend email_type enum**

Open `src/shared/lib/schema.ts`. Find `sentLeadEmails` definition (around line 538-551):

```ts
  emailType: text('email_type', {
    enum: ['lead_chart', 'lead_moon_asc', 'lead_paywall_teaser'],
  }).notNull(),
```

Replace with:

```ts
  emailType: text('email_type', {
    enum: [
      'lead_chart',
      'lead_moon_asc',
      'lead_paywall_teaser',
      'lead_saturn_weekly',
      'lead_mini_reading',
      'lead_synastry_teaser',
    ],
  }).notNull(),
```

- [ ] **Step 2: Modify schema.ts — extend index predicate**

In the same file, find the `email_leads_nurture_due_idx` definition (around line 530-532):

```ts
  index('email_leads_nurture_due_idx')
    .on(table.nurtureNextAt)
    .where(sql`nurture_step < 3 AND converted_to_user_id IS NULL AND unsubscribed_at IS NULL AND email_undeliverable = false`),
```

Replace with:

```ts
  index('email_leads_nurture_due_idx')
    .on(table.nurtureNextAt)
    .where(sql`nurture_step < 6 AND converted_to_user_id IS NULL AND unsubscribed_at IS NULL AND email_undeliverable = false`),
```

- [ ] **Step 3: Generate migration**

Run: `npm run db:generate`
Expected: produces a new file `drizzle/0012_<random_descriptor>.sql` containing the `DROP INDEX` + `CREATE INDEX` statements. (Drizzle will auto-name; do not rename.)

- [ ] **Step 4: Inspect generated migration**

Run: `cat drizzle/0012_*.sql`
Expected SQL contents include:

```sql
DROP INDEX "email_leads_nurture_due_idx";
CREATE INDEX "email_leads_nurture_due_idx" ON "email_leads" USING btree ("nurture_next_at") WHERE nurture_step < 6 AND converted_to_user_id IS NULL AND unsubscribed_at IS NULL AND email_undeliverable = false;
```

(Exact statement names/order may vary; the WHERE clause must say `nurture_step < 6`.)

If the migration is missing the email_type enum changes — that's expected. The enum on `sent_lead_emails.email_type` is enforced only at the Drizzle TypeScript level (the DB column is plain `text`); no SQL change needed.

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 6: Run existing tests**

Run: `npm test`
Expected: all existing tests still pass.

- [ ] **Step 7: Commit**

```bash
git add src/shared/lib/schema.ts drizzle/0012_*.sql drizzle/meta/0012_snapshot.json drizzle/meta/_journal.json
git commit -m "$(cat <<'EOF'
feat(wave2/L2-B): extend nurture index + email_type enum for T+7/14/21d

Drizzle migration 0012 drops + recreates email_leads_nurture_due_idx with nurture_step < 6 (was < 3). email_type enum on sent_lead_emails extends with lead_saturn_weekly + lead_mini_reading + lead_synastry_teaser (TypeScript-only; DB column stays plain text).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 8: Founder owes** — Run `npm run db:migrate` against production after deploy (per Wave 1 pattern; founder operates DB migrations manually).

---

## Task 8: L2-B — SaturnWeekly + SynastryTeaser email templates

**Files:**
- Create: `src/emails/SaturnWeeklyEmail.tsx`
- Create: `src/emails/SynastryTeaserEmail.tsx`

**Context:** Both are static templates. Founder owns content; engineer ships skeleton + safe placeholders. Mirrors patterns from existing `src/emails/LeadChartEmail.tsx` and `src/emails/ReEngagementEmail.tsx`: `EmailLayout` + `Heading` + `Text` + `Button`.

- [ ] **Step 1: Create SaturnWeeklyEmail.tsx**

Create `src/emails/SaturnWeeklyEmail.tsx`:

```tsx
import { Heading, Text } from '@react-email/components';
import { EmailLayout } from './components/EmailLayout';
import { Button } from './components/Button';

interface Props {
  locale: 'en' | 'es';
  chartUrl: string;
  unsubscribeUrl: string;
}

const STRINGS = {
  en: {
    preview: 'A weekly note from Estrevia: what your Saturn is doing.',
    heading: 'Your Saturn this week',
    body1:
      'Saturn rules discipline, time, and the slow shaping of who you are becoming. In sidereal Vedic astrology, its position right now shows where life is asking for patience and structure.',
    body2:
      'Step back this week and notice: where are you being asked to slow down? Where would 1% more consistency compound over the next year?',
    cta: 'Open your chart',
  },
  es: {
    preview: 'Una nota semanal de Estrevia: qué está haciendo tu Saturno.',
    heading: 'Tu Saturno esta semana',
    body1:
      'Saturno rige la disciplina, el tiempo y la lenta formación de quien estás siendo. En astrología sideral védica, su posición ahora muestra dónde la vida pide paciencia y estructura.',
    body2:
      'Esta semana, da un paso atrás y observa: ¿dónde te están pidiendo desacelerar? ¿Dónde un 1% más de consistencia compondría durante el próximo año?',
    cta: 'Abre tu carta',
  },
};

export default function SaturnWeeklyEmail({ locale, chartUrl, unsubscribeUrl }: Props) {
  const t = STRINGS[locale];
  return (
    <EmailLayout preview={t.preview} locale={locale} unsubscribeUrl={unsubscribeUrl}>
      <Heading style={{ fontSize: 28, marginBottom: 16 }}>{t.heading}</Heading>
      <Text style={{ fontSize: 16, lineHeight: 1.6, marginBottom: 16 }}>{t.body1}</Text>
      <Text style={{ fontSize: 16, lineHeight: 1.6, marginBottom: 32 }}>{t.body2}</Text>
      <Button href={chartUrl}>{t.cta}</Button>
    </EmailLayout>
  );
}
```

- [ ] **Step 2: Create SynastryTeaserEmail.tsx**

Create `src/emails/SynastryTeaserEmail.tsx`:

```tsx
import { Heading, Text } from '@react-email/components';
import { EmailLayout } from './components/EmailLayout';
import { Button } from './components/Button';

interface Props {
  locale: 'en' | 'es';
  synastryUrl: string;
  unsubscribeUrl: string;
}

const STRINGS = {
  en: {
    preview: 'Compare your chart with someone you love — free synastry reading.',
    heading: 'Want to see your compatibility?',
    body1:
      "We've sent you your sidereal chart, your Moon and Ascendant, a paywall teaser, and a weekly Saturn note. Here's one more: synastry — the chart comparison between two people.",
    body2:
      'Add a partner, friend, or family member’s birth data and Estrevia will calculate your synastry reading free. No card required, no nudge: just curiosity.',
    cta: 'Open synastry',
  },
  es: {
    preview: 'Compara tu carta con alguien que amas — lectura de sinastría gratis.',
    heading: '¿Quieres ver tu compatibilidad?',
    body1:
      'Te hemos enviado tu carta sideral, tu Luna y Ascendente, un teaser del paywall y una nota semanal sobre Saturno. Aquí hay una más: la sinastría — la comparación entre dos cartas.',
    body2:
      'Agrega los datos de nacimiento de una pareja, amistad o familiar y Estrevia calculará tu lectura de sinastría gratis. Sin tarjeta, sin presión: pura curiosidad.',
    cta: 'Abrir sinastría',
  },
};

export default function SynastryTeaserEmail({
  locale,
  synastryUrl,
  unsubscribeUrl,
}: Props) {
  const t = STRINGS[locale];
  return (
    <EmailLayout preview={t.preview} locale={locale} unsubscribeUrl={unsubscribeUrl}>
      <Heading style={{ fontSize: 28, marginBottom: 16 }}>{t.heading}</Heading>
      <Text style={{ fontSize: 16, lineHeight: 1.6, marginBottom: 16 }}>{t.body1}</Text>
      <Text style={{ fontSize: 16, lineHeight: 1.6, marginBottom: 32 }}>{t.body2}</Text>
      <Button href={synastryUrl}>{t.cta}</Button>
    </EmailLayout>
  );
}
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/emails/SaturnWeeklyEmail.tsx src/emails/SynastryTeaserEmail.tsx
git commit -m "$(cat <<'EOF'
feat(wave2/L2-B): SaturnWeekly + SynastryTeaser email templates

Static React-email templates for T+7d (Saturn weekly note) and T+21d (synastry teaser / free reading invite). Bilingual EN/ES via STRINGS map. Engineer placeholder content; founder iterates before deploy.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: Founder owes** — Rewrite body copy of both templates with authentic Vedic phrasing.

---

## Task 9: L2-B — MiniReadingEmail template + tests

**Files:**
- Create: `src/emails/MiniReadingEmail.tsx`
- Create: `src/emails/__tests__/MiniReadingEmail.test.tsx`

**Context:** T+14d email. Takes Sun/Moon/Asc sign strings as props (from `pickKeySigns(chart)` already in `src/shared/lib/email.ts:296`) plus locale. Looks up `chart-keywords.ts` and renders 3-line personalized text. Falls back to 2-line template if Asc is null (birth-time-unknown lead).

- [ ] **Step 1: Write failing tests**

Create `src/emails/__tests__/MiniReadingEmail.test.tsx`:

```tsx
import { render } from '@react-email/render';
import { describe, expect, it } from 'vitest';
import MiniReadingEmail from '../MiniReadingEmail';

describe('MiniReadingEmail', () => {
  const baseProps = {
    locale: 'en' as const,
    chartUrl: 'https://estrevia.app/chart?chartId=test',
    unsubscribeUrl: 'https://estrevia.app/unsubscribe?token=test',
  };

  it('renders 3-line template when all signs are provided', async () => {
    const html = await render(
      MiniReadingEmail({
        ...baseProps,
        sunSign: 'aries',
        moonSign: 'cancer',
        ascSign: 'libra',
      }),
    );
    expect(html).toContain('Aries');
    expect(html).toContain('Cancer');
    expect(html).toContain('Libra');
    expect(html).toContain('Your Sun in');
    expect(html).toContain('Your Moon in');
    expect(html).toContain('Your Ascendant in');
  });

  it('renders 2-line fallback when ascSign is null', async () => {
    const html = await render(
      MiniReadingEmail({
        ...baseProps,
        sunSign: 'aries',
        moonSign: 'cancer',
        ascSign: null,
      }),
    );
    expect(html).toContain('Your Sun in');
    expect(html).toContain('Your Moon in');
    expect(html).not.toContain('Your Ascendant in');
  });

  it('renders 1-line fallback when only sunSign is provided', async () => {
    const html = await render(
      MiniReadingEmail({
        ...baseProps,
        sunSign: 'aries',
        moonSign: null,
        ascSign: null,
      }),
    );
    expect(html).toContain('Your Sun in');
    expect(html).not.toContain('Your Moon in');
    expect(html).not.toContain('Your Ascendant in');
  });

  it('renders ES locale', async () => {
    const html = await render(
      MiniReadingEmail({
        ...baseProps,
        locale: 'es',
        sunSign: 'aries',
        moonSign: 'cancer',
        ascSign: 'libra',
      }),
    );
    expect(html).toContain('Tu Sol en');
    expect(html).toContain('Tu Luna en');
    expect(html).toContain('Tu Ascendente en');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/emails/__tests__/MiniReadingEmail.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement MiniReadingEmail.tsx**

Create `src/emails/MiniReadingEmail.tsx`:

```tsx
import { Heading, Text } from '@react-email/components';
import { EmailLayout } from './components/EmailLayout';
import { Button } from './components/Button';
import {
  getSignKeywords,
  type Locale,
  type SignKey,
} from '@/shared/lib/chart-keywords';

interface Props {
  locale: Locale;
  sunSign: string | null;
  moonSign: string | null;
  ascSign: string | null;
  chartUrl: string;
  unsubscribeUrl: string;
}

const HEADING = {
  en: 'Your sidereal mini-reading',
  es: 'Tu mini-lectura sideral',
};

const PREVIEW = {
  en: 'A short reading from your sidereal chart — Sun, Moon, and Ascendant.',
  es: 'Una lectura corta de tu carta sideral — Sol, Luna y Ascendente.',
};

const CTA = {
  en: 'See your full chart',
  es: 'Ver tu carta completa',
};

interface LineBuilder {
  prefix: string;
  middle: string;
  suffix: string;
}

const LINE_BUILDERS: Record<Locale, { sun: LineBuilder; moon: LineBuilder; asc: LineBuilder }> = {
  en: {
    sun: { prefix: 'Your Sun in ', middle: ' suggests ', suffix: '.' },
    moon: { prefix: 'Your Moon in ', middle: ' reveals ', suffix: '.' },
    asc: { prefix: 'Your Ascendant in ', middle: ' shapes how others see you: ', suffix: '.' },
  },
  es: {
    sun: { prefix: 'Tu Sol en ', middle: ' sugiere ', suffix: '.' },
    moon: { prefix: 'Tu Luna en ', middle: ' revela ', suffix: '.' },
    asc: { prefix: 'Tu Ascendente en ', middle: ' moldea cómo te ven los demás: ', suffix: '.' },
  },
};

function titleCase(sign: string): string {
  return sign.charAt(0).toUpperCase() + sign.slice(1);
}

function isKnownSign(sign: string | null): sign is SignKey {
  if (!sign) return false;
  const known: SignKey[] = [
    'aries', 'taurus', 'gemini', 'cancer',
    'leo', 'virgo', 'libra', 'scorpio',
    'sagittarius', 'capricorn', 'aquarius', 'pisces',
  ];
  return (known as string[]).includes(sign.toLowerCase());
}

function renderLine(
  locale: Locale,
  placement: 'sun' | 'moon' | 'asc',
  sign: string | null,
) {
  if (!isKnownSign(sign)) return null;
  const normalized = sign.toLowerCase() as SignKey;
  const builder = LINE_BUILDERS[locale][placement];
  const keyword = getSignKeywords(locale, normalized, placement);
  return (
    <Text key={placement} style={{ fontSize: 16, lineHeight: 1.6, marginBottom: 12 }}>
      {builder.prefix}
      {titleCase(normalized)}
      {builder.middle}
      {keyword}
      {builder.suffix}
    </Text>
  );
}

export default function MiniReadingEmail({
  locale,
  sunSign,
  moonSign,
  ascSign,
  chartUrl,
  unsubscribeUrl,
}: Props) {
  const lines = [
    renderLine(locale, 'sun', sunSign),
    renderLine(locale, 'moon', moonSign),
    renderLine(locale, 'asc', ascSign),
  ].filter((x) => x !== null);

  return (
    <EmailLayout preview={PREVIEW[locale]} locale={locale} unsubscribeUrl={unsubscribeUrl}>
      <Heading style={{ fontSize: 28, marginBottom: 16 }}>{HEADING[locale]}</Heading>
      {lines}
      <div style={{ marginTop: 24 }}>
        <Button href={chartUrl}>{CTA[locale]}</Button>
      </div>
    </EmailLayout>
  );
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/emails/__tests__/MiniReadingEmail.test.tsx`
Expected: PASS (4/4 tests).

- [ ] **Step 5: Run typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/emails/MiniReadingEmail.tsx src/emails/__tests__/MiniReadingEmail.test.tsx
git commit -m "$(cat <<'EOF'
feat(wave2/L2-B): MiniReadingEmail template with auto-fallback for null signs

T+14d personalized email rendering Sun/Moon/Asc keywords from chart-keywords map. Falls back gracefully when ascSign (birth-time-unknown) or moonSign is null — only renders lines for known signs. Bilingual EN/ES.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: L2-B — email.ts new send functions

**Files:**
- Modify: `src/shared/lib/email.ts` (add 3 new `sendLead*Email` functions + update SUBJECTS)

**Context:** Mirror the existing `sendLeadChartEmail` / `sendLeadMoonAscEmail` / `sendLeadPaywallTeaserEmail` pattern: claim idempotency slot via `tryInsertOneShotLead`, build unsubscribe URL, render template, send via Resend with idempotencyKey, throw on `result.error` (Sev1 pattern from commit `c94316f`), record sent.

- [ ] **Step 1: Add SUBJECTS entries**

Open `src/shared/lib/email.ts`. Find `SUBJECTS` constant (around line 37-78). Add to the object:

```ts
  lead_saturn_weekly: {
    en: 'Your Saturn this week',
    es: 'Tu Saturno esta semana',
  },
  lead_mini_reading: {
    en: 'Your sidereal mini-reading',
    es: 'Tu mini-lectura sideral',
  },
  lead_synastry_teaser: {
    en: 'Want to see your compatibility?',
    es: '¿Quieres ver tu compatibilidad?',
  },
```

- [ ] **Step 2: Add imports**

Near the top of the file, add:

```ts
import SaturnWeeklyEmail from '@/emails/SaturnWeeklyEmail';
import MiniReadingEmail from '@/emails/MiniReadingEmail';
import SynastryTeaserEmail from '@/emails/SynastryTeaserEmail';
```

- [ ] **Step 3: Add sendLeadSaturnWeeklyEmail**

At the end of the file (after `sendLeadPaywallTeaserEmail`), add:

```ts
// ---------------------------------------------------------------------------
// sendLeadSaturnWeeklyEmail — T+7d nurture drip, one-shot per lead
// ---------------------------------------------------------------------------
export async function sendLeadSaturnWeeklyEmail(params: {
  leadId: string;
  email: string;
  locale: 'en' | 'es';
  chart: ChartResult | null;
  chartId: string | null;
}): Promise<{ sent: boolean; reason?: string }> {
  const claim = await tryInsertOneShotLead(params.leadId, 'lead_saturn_weekly');
  if (claim === 'delivered') return { sent: false, reason: 'already_sent' };

  const token = await signLeadUnsubscribeToken(params.leadId);
  const unsubscribeUrl = `${SITE_URL}/${params.locale === 'es' ? 'es/' : ''}unsubscribe?token=${token}`;

  const chartPath = params.chartId
    ? `/${params.locale === 'es' ? 'es/' : ''}chart?chartId=${params.chartId}&utm_source=lead-nurture&utm_campaign=t7d`
    : `/${params.locale === 'es' ? 'es' : ''}?utm_source=lead-nurture&utm_campaign=t7d`;
  const chartUrl = `${SITE_URL}${chartPath}`;

  const html = await render(
    SaturnWeeklyEmail({ locale: params.locale, chartUrl, unsubscribeUrl }),
  );
  const text = await render(
    SaturnWeeklyEmail({ locale: params.locale, chartUrl, unsubscribeUrl }),
    { plainText: true },
  );

  const result = await getResend().emails.send(
    {
      from: FROM_ADDRESS,
      to: params.email,
      subject: SUBJECTS.lead_saturn_weekly[params.locale],
      html,
      text,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    },
    { idempotencyKey: `${params.leadId}:lead_saturn_weekly` },
  );
  if (result.error) {
    throw new Error(
      `Resend rejected lead_saturn_weekly for ${params.leadId}: ${result.error.message ?? 'unknown'}`,
    );
  }

  await recordSentLead(params.leadId, 'lead_saturn_weekly', result.data?.id ?? null);
  return { sent: true };
}
```

- [ ] **Step 4: Add sendLeadMiniReadingEmail**

After the function from Step 3:

```ts
// ---------------------------------------------------------------------------
// sendLeadMiniReadingEmail — T+14d nurture drip, one-shot per lead
// ---------------------------------------------------------------------------
export async function sendLeadMiniReadingEmail(params: {
  leadId: string;
  email: string;
  locale: 'en' | 'es';
  chart: ChartResult | null;
  chartId: string | null;
}): Promise<{ sent: boolean; reason?: string }> {
  const claim = await tryInsertOneShotLead(params.leadId, 'lead_mini_reading');
  if (claim === 'delivered') return { sent: false, reason: 'already_sent' };

  const token = await signLeadUnsubscribeToken(params.leadId);
  const unsubscribeUrl = `${SITE_URL}/${params.locale === 'es' ? 'es/' : ''}unsubscribe?token=${token}`;

  const signs = pickKeySigns(params.chart);
  const chartPath = params.chartId
    ? `/${params.locale === 'es' ? 'es/' : ''}chart?chartId=${params.chartId}&utm_source=lead-nurture&utm_campaign=t14d`
    : `/${params.locale === 'es' ? 'es' : ''}?utm_source=lead-nurture&utm_campaign=t14d`;
  const chartUrl = `${SITE_URL}${chartPath}`;

  const html = await render(
    MiniReadingEmail({
      locale: params.locale,
      sunSign: signs.sunSign,
      moonSign: signs.moonSign,
      ascSign: signs.ascSign,
      chartUrl,
      unsubscribeUrl,
    }),
  );
  const text = await render(
    MiniReadingEmail({
      locale: params.locale,
      sunSign: signs.sunSign,
      moonSign: signs.moonSign,
      ascSign: signs.ascSign,
      chartUrl,
      unsubscribeUrl,
    }),
    { plainText: true },
  );

  const result = await getResend().emails.send(
    {
      from: FROM_ADDRESS,
      to: params.email,
      subject: SUBJECTS.lead_mini_reading[params.locale],
      html,
      text,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    },
    { idempotencyKey: `${params.leadId}:lead_mini_reading` },
  );
  if (result.error) {
    throw new Error(
      `Resend rejected lead_mini_reading for ${params.leadId}: ${result.error.message ?? 'unknown'}`,
    );
  }

  await recordSentLead(params.leadId, 'lead_mini_reading', result.data?.id ?? null);
  return { sent: true };
}
```

- [ ] **Step 5: Add sendLeadSynastryTeaserEmail**

After the function from Step 4:

```ts
// ---------------------------------------------------------------------------
// sendLeadSynastryTeaserEmail — T+21d nurture drip, one-shot per lead
// ---------------------------------------------------------------------------
export async function sendLeadSynastryTeaserEmail(params: {
  leadId: string;
  email: string;
  locale: 'en' | 'es';
  chart: ChartResult | null;
  chartId: string | null;
}): Promise<{ sent: boolean; reason?: string }> {
  const claim = await tryInsertOneShotLead(params.leadId, 'lead_synastry_teaser');
  if (claim === 'delivered') return { sent: false, reason: 'already_sent' };

  const token = await signLeadUnsubscribeToken(params.leadId);
  const unsubscribeUrl = `${SITE_URL}/${params.locale === 'es' ? 'es/' : ''}unsubscribe?token=${token}`;

  const synastryPath = `/${params.locale === 'es' ? 'es/' : ''}synastry?utm_source=lead-nurture&utm_campaign=t21d`;
  const synastryUrl = `${SITE_URL}${synastryPath}`;

  const html = await render(
    SynastryTeaserEmail({ locale: params.locale, synastryUrl, unsubscribeUrl }),
  );
  const text = await render(
    SynastryTeaserEmail({ locale: params.locale, synastryUrl, unsubscribeUrl }),
    { plainText: true },
  );

  const result = await getResend().emails.send(
    {
      from: FROM_ADDRESS,
      to: params.email,
      subject: SUBJECTS.lead_synastry_teaser[params.locale],
      html,
      text,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    },
    { idempotencyKey: `${params.leadId}:lead_synastry_teaser` },
  );
  if (result.error) {
    throw new Error(
      `Resend rejected lead_synastry_teaser for ${params.leadId}: ${result.error.message ?? 'unknown'}`,
    );
  }

  await recordSentLead(params.leadId, 'lead_synastry_teaser', result.data?.id ?? null);
  return { sent: true };
}
```

- [ ] **Step 6: Run typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 7: Run email-related tests**

Run: `npx vitest run src/shared/lib/__tests__/`
Expected: existing email tests still pass (if any reference `lead_chart` enum).

- [ ] **Step 8: Commit**

```bash
git add src/shared/lib/email.ts
git commit -m "$(cat <<'EOF'
feat(wave2/L2-B): sendLead Saturn/Mini/Synastry email functions

3 new send functions mirroring existing lead-email pattern: tryInsertOneShotLead claim → render → Resend send with idempotencyKey → throw on result.error (Sev1 pattern c94316f) → recordSentLead. utm_campaign t7d/t14d/t21d. MiniReading uses pickKeySigns to extract Sun/Moon/Asc from ChartResult.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: L2-B — cron route extension + tests

**Files:**
- Modify: `src/app/api/cron/lead-nurture/route.ts`
- Modify: `src/app/api/cron/lead-nurture/__tests__/route.test.ts`

**Context:** Extend the existing hourly cron to handle `nurture_step` transitions 2→3, 3→4, 4→5, 5→6 (final). T+72h teaser (step 2 → 3) now stores `nurture_next_at = +96h` instead of `null`. Steps 3-5 each store `nurture_next_at = +168h`. Step 6 is final (null).

- [ ] **Step 1: Read existing cron test to understand patterns**

Run: `cat src/app/api/cron/lead-nurture/__tests__/route.test.ts | head -100`
Note the test setup pattern (mock DB, mock Resend, fixture lead). Reuse these.

- [ ] **Step 2: Extend test file mocks for 3 new send functions**

Open `src/app/api/cron/lead-nurture/__tests__/route.test.ts`. Find the existing email-module mock block (around lines 13-21):

```ts
// Mock send functions
const sendChartMock = vi.fn(async () => ({ sent: true }));
const sendMoonAscMock = vi.fn(async () => ({ sent: true }));
const sendPaywallMock = vi.fn(async () => ({ sent: true }));
vi.mock('@/shared/lib/email', () => ({
  sendLeadChartEmail: sendChartMock,
  sendLeadMoonAscEmail: sendMoonAscMock,
  sendLeadPaywallTeaserEmail: sendPaywallMock,
}));
```

Replace with:

```ts
// Mock send functions
const sendChartMock = vi.fn(async () => ({ sent: true }));
const sendMoonAscMock = vi.fn(async () => ({ sent: true }));
const sendPaywallMock = vi.fn(async () => ({ sent: true }));
const sendSaturnMock = vi.fn(async () => ({ sent: true }));
const sendMiniReadingMock = vi.fn(async () => ({ sent: true }));
const sendSynastryMock = vi.fn(async () => ({ sent: true }));
vi.mock('@/shared/lib/email', () => ({
  sendLeadChartEmail: sendChartMock,
  sendLeadMoonAscEmail: sendMoonAscMock,
  sendLeadPaywallTeaserEmail: sendPaywallMock,
  sendLeadSaturnWeeklyEmail: sendSaturnMock,
  sendLeadMiniReadingEmail: sendMiniReadingMock,
  sendLeadSynastryTeaserEmail: sendSynastryMock,
}));
```

- [ ] **Step 3: Add new test cases inside the existing `describe` block**

Inside `describe('/api/cron/lead-nurture', () => { ... })`, append these tests after the existing ones:

```ts
  it('advances step 2 → 3 after T+72h teaser send and schedules T+7d (~96h later)', async () => {
    candidates = [{
      id: 'lead_s2_to_3',
      email: 's2@example.com',
      locale: 'en',
      chartId: 'chart_s2',
      nurtureStep: 2,
      nurtureNextAt: new Date(Date.now() - 60_000),
      createdAt: new Date(Date.now() - 73 * 3600_000),
    }];
    const before = Date.now();
    const { GET } = await import('../route');
    await GET(new Request('http://localhost/api/cron/lead-nurture'));
    const after = Date.now();
    expect(sendPaywallMock).toHaveBeenCalledTimes(1);
    expect(updates).toHaveLength(1);
    const update = updates[0]!;
    expect(update.vals.nurtureStep).toBe(3);
    const scheduled = (update.vals.nurtureNextAt as Date).getTime();
    expect(scheduled).toBeGreaterThanOrEqual(before + 96 * 3600_000);
    expect(scheduled).toBeLessThanOrEqual(after + 96 * 3600_000);
  });

  it('dispatches to sendLeadSaturnWeeklyEmail when step=3 and due', async () => {
    candidates = [{
      id: 'lead_s3',
      email: 's3@example.com',
      locale: 'en',
      chartId: 'chart_s3',
      nurtureStep: 3,
      nurtureNextAt: new Date(Date.now() - 60_000),
      createdAt: new Date(Date.now() - 170 * 3600_000),
    }];
    const before = Date.now();
    const { GET } = await import('../route');
    await GET(new Request('http://localhost/api/cron/lead-nurture'));
    expect(sendSaturnMock).toHaveBeenCalledTimes(1);
    expect(sendChartMock).not.toHaveBeenCalled();
    expect(sendMoonAscMock).not.toHaveBeenCalled();
    expect(sendPaywallMock).not.toHaveBeenCalled();
    expect(sendMiniReadingMock).not.toHaveBeenCalled();
    expect(sendSynastryMock).not.toHaveBeenCalled();
    expect(updates).toHaveLength(1);
    expect(updates[0]!.vals.nurtureStep).toBe(4);
    const scheduled = (updates[0]!.vals.nurtureNextAt as Date).getTime();
    expect(scheduled).toBeGreaterThanOrEqual(before + 168 * 3600_000);
  });

  it('dispatches to sendLeadMiniReadingEmail when step=4 and due', async () => {
    candidates = [{
      id: 'lead_s4',
      email: 's4@example.com',
      locale: 'en',
      chartId: 'chart_s4',
      nurtureStep: 4,
      nurtureNextAt: new Date(Date.now() - 60_000),
      createdAt: new Date(Date.now() - 340 * 3600_000),
    }];
    const before = Date.now();
    const { GET } = await import('../route');
    await GET(new Request('http://localhost/api/cron/lead-nurture'));
    expect(sendMiniReadingMock).toHaveBeenCalledTimes(1);
    expect(updates).toHaveLength(1);
    expect(updates[0]!.vals.nurtureStep).toBe(5);
    const scheduled = (updates[0]!.vals.nurtureNextAt as Date).getTime();
    expect(scheduled).toBeGreaterThanOrEqual(before + 168 * 3600_000);
  });

  it('dispatches to sendLeadSynastryTeaserEmail when step=5 and due (final state)', async () => {
    candidates = [{
      id: 'lead_s5',
      email: 's5@example.com',
      locale: 'en',
      chartId: 'chart_s5',
      nurtureStep: 5,
      nurtureNextAt: new Date(Date.now() - 60_000),
      createdAt: new Date(Date.now() - 508 * 3600_000),
    }];
    const { GET } = await import('../route');
    await GET(new Request('http://localhost/api/cron/lead-nurture'));
    expect(sendSynastryMock).toHaveBeenCalledTimes(1);
    expect(updates).toHaveLength(1);
    expect(updates[0]!.vals.nurtureStep).toBe(6);
    expect(updates[0]!.vals.nurtureNextAt).toBeNull();
  });

  it('does NOT advance step when sendLeadMiniReadingEmail throws (Sev1 regression)', async () => {
    sendMiniReadingMock.mockRejectedValueOnce(new Error('Resend rejected lead_mini_reading'));
    candidates = [{
      id: 'lead_s4_fail',
      email: 'fail@example.com',
      locale: 'en',
      chartId: 'chart_s4_fail',
      nurtureStep: 4,
      nurtureNextAt: new Date(Date.now() - 60_000),
      createdAt: new Date(Date.now() - 340 * 3600_000),
    }];
    const { GET } = await import('../route');
    const res = await GET(new Request('http://localhost/api/cron/lead-nurture'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.failed).toBe(1);
    expect(json.sent).toBe(0);
    expect(updates).toHaveLength(0);
  });
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run src/app/api/cron/lead-nurture/__tests__/route.test.ts`
Expected: FAIL — the cron route doesn't handle steps 3/4/5 yet.

- [ ] **Step 5: Modify route.ts — add time constants**

Open `src/app/api/cron/lead-nurture/route.ts`. Find the constants block (around line 49-54):

```ts
const STUCK_T0_GRACE_MS = 15 * 60 * 1000;
const T24_DELAY_MS = 24 * 60 * 60 * 1000;
const T48_AFTER_T24_MS = 48 * 60 * 60 * 1000; // step1→step2: +48h (total T+72h)
const BATCH_LIMIT = 100;
const RESEND_PACING_MS = 1100;
```

Add two new constants:

```ts
const T96_AFTER_T72_MS = 96 * 60 * 60 * 1000; // step2→step3: +96h (total T+7d ≈ 168h)
const T168_DELAY_MS = 168 * 60 * 60 * 1000;   // step3→step4 and step4→step5: +168h between weekly sends
```

- [ ] **Step 6: Modify route.ts — extend imports**

Find the email imports (around line 39-43):

```ts
import {
  sendLeadChartEmail,
  sendLeadMoonAscEmail,
  sendLeadPaywallTeaserEmail,
} from '@/shared/lib/email';
```

Replace with:

```ts
import {
  sendLeadChartEmail,
  sendLeadMoonAscEmail,
  sendLeadPaywallTeaserEmail,
  sendLeadSaturnWeeklyEmail,
  sendLeadMiniReadingEmail,
  sendLeadSynastryTeaserEmail,
} from '@/shared/lib/email';
```

- [ ] **Step 7: Modify route.ts — extend filter**

Find the candidates query `lt(emailLeads.nurtureStep, 3)` (around line 94):

```ts
          lt(emailLeads.nurtureStep, 3),
```

Replace with:

```ts
          lt(emailLeads.nurtureStep, 6),
```

- [ ] **Step 8: Modify route.ts — update step 2 → 3 transition**

Find the existing step 2 branch (around line 145-154):

```ts
        } else if (lead.nurtureStep === 2) {
          sendResult = await sendLeadPaywallTeaserEmail({
            leadId: lead.id,
            email: lead.email,
            locale: lead.locale,
            chart,
            chartId: lead.chartId,
          });
          nextStep = 3;
          nextAt = null;
        } else {
```

Replace with:

```ts
        } else if (lead.nurtureStep === 2) {
          sendResult = await sendLeadPaywallTeaserEmail({
            leadId: lead.id,
            email: lead.email,
            locale: lead.locale,
            chart,
            chartId: lead.chartId,
          });
          nextStep = 3;
          nextAt = new Date(Date.now() + T96_AFTER_T72_MS);
        } else if (lead.nurtureStep === 3) {
          sendResult = await sendLeadSaturnWeeklyEmail({
            leadId: lead.id,
            email: lead.email,
            locale: lead.locale,
            chart,
            chartId: lead.chartId,
          });
          nextStep = 4;
          nextAt = new Date(Date.now() + T168_DELAY_MS);
        } else if (lead.nurtureStep === 4) {
          sendResult = await sendLeadMiniReadingEmail({
            leadId: lead.id,
            email: lead.email,
            locale: lead.locale,
            chart,
            chartId: lead.chartId,
          });
          nextStep = 5;
          nextAt = new Date(Date.now() + T168_DELAY_MS);
        } else if (lead.nurtureStep === 5) {
          sendResult = await sendLeadSynastryTeaserEmail({
            leadId: lead.id,
            email: lead.email,
            locale: lead.locale,
            chart,
            chartId: lead.chartId,
          });
          nextStep = 6;
          nextAt = null;
        } else {
```

- [ ] **Step 9: Run tests to verify pass**

Run: `npx vitest run src/app/api/cron/lead-nurture/__tests__/route.test.ts`
Expected: all tests pass (existing + new).

- [ ] **Step 10: Run typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 11: Update file comment**

At the top of `route.ts` (lines 1-30), update the JSDoc comment to mention the new steps. Find:

```ts
 *   3. T+72h — `nurture_step=2 AND nurture_next_at <= NOW()` → send the
 *      paywall-teaser email, advance to step=3 with nextAt=null.
```

Replace with:

```ts
 *   3. T+72h — `nurture_step=2 AND nurture_next_at <= NOW()` → send the
 *      paywall-teaser email, advance to step=3 with nextAt=NOW()+96h.
 *   4. T+7d — `nurture_step=3 AND nurture_next_at <= NOW()` → send the
 *      Saturn-weekly email, advance to step=4 with nextAt=NOW()+168h.
 *   5. T+14d — `nurture_step=4 AND nurture_next_at <= NOW()` → send the
 *      mini-reading email, advance to step=5 with nextAt=NOW()+168h.
 *   6. T+21d — `nurture_step=5 AND nurture_next_at <= NOW()` → send the
 *      synastry-teaser email, advance to step=6 with nextAt=null (final).
```

- [ ] **Step 12: Commit**

```bash
git add src/app/api/cron/lead-nurture/route.ts src/app/api/cron/lead-nurture/__tests__/route.test.ts
git commit -m "$(cat <<'EOF'
feat(wave2/L2-B): nurture cron extension — T+7d/T+14d/T+21d steps

Adds nurture_step 3/4/5 transitions to hourly cron: T+72h teaser → +96h → T+7d Saturn → +168h → T+14d MiniReading → +168h → T+21d Synastry → done (step=6). Filter relaxes to nurture_step < 6. Sev1 retry semantics preserved (throw on Resend result.error → no step advance → next hour retries via 'retry' claim).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Final verification

**Files:** none

**Context:** Full-suite verification before push.

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: all green. Note count vs. baseline (~+15-20 new tests).

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: zero errors.

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: no new errors. Pre-existing `.claude/worktrees/` pollution is acceptable per `feedback_lint_worktrees_pollution`.

- [ ] **Step 4: Verify all 11 commits landed in order**

Run: `git log --oneline -15`
Expected: 11 new commits from Tasks 1-11 plus prior Wave 2 spec commits (`166b4f6` + `9791115`).

- [ ] **Step 5: Manual smoke — dev server**

Run: `npm run dev`
Browser checks (do these before reporting Wave 2 complete):
- [ ] Navigate to `/pricing` (EN) — confirm guarantee block + new trust signals + refreshed hero copy render.
- [ ] Navigate to `/es/pricing` — confirm ES translations render.
- [ ] Toggle Monthly/Annual — confirm `saveBadgeLong` appears in Annual mode.
- [ ] Open browser console — confirm no errors related to PostHogProvider or useFeatureFlag (hook should be importable but not yet used in production code).
- [ ] Accept cookies → wait for PostHog init → in console run `window.posthog.getFeatureFlag('wave2-demo-flag')` (after founder creates flag in PostHog UI per Task 2 founder-owe).

- [ ] **Step 6: Report Wave 2 ready for shared-state action**

After all checks pass, summarize:
- N commits ready to push to origin/main.
- Pending founder actions:
  - Run `npm run db:migrate` against production after deploy (Task 7 owes).
  - Create `wave2-demo-flag` in PostHog UI (Task 2 owes).
  - Rewrite 72 keyword strings in `chart-keywords.ts` with authentic Vedic phrasing (Task 6 owes).
  - Rewrite SaturnWeekly + SynastryTeaser email body copy (Task 8 owes).
  - Verify pricing page deploys correctly on Vercel preview before promoting to prod.

Push (founder confirms first per shared-state action rule):

```bash
git push origin main
```

---

## Out of scope for this plan (Wave 3 / later)

- A/B variant tests running live (need traffic + experiments).
- L2-C nurture EN/ES + cold/hot segmentation (needs Resend `email.opened` webhook).
- L1-D Subscribe upgrade event (needs ≥150 Subscribe events/week).
- L1-C geo expansion ES (operational Ads Manager work — no engineer plan).
- L1-E AEO inbound instrumentation.
- L4-C CAC + LTV tracking, L4-D per-creative ROI.
- L5-A customer research mechanisms.
- L5-D pricing test cycle.
- Server-side feature-flag evaluation for SSR routes.
- New lead magnets (L2-D).

---

## Founder-owed asynchronous tasks summary

After engineer ships Tasks 1-12, founder owes:

1. **Production DB migration:** `npm run db:migrate` against prod after deploy (Task 7).
2. **PostHog flag creation:** `wave2-demo-flag` in PostHog UI (Task 2).
3. **Content — keywords:** 72 keyword strings in `chart-keywords.ts` (Task 6).
4. **Content — email bodies:** rewrite SaturnWeekly + SynastryTeaser body copy in `src/emails/SaturnWeeklyEmail.tsx` and `src/emails/SynastryTeaserEmail.tsx` (Task 8).
5. **ES translation review:** verify new pricing strings in `messages/es.json` are LATAM neutro + `tú` form (Task 3).
6. **Vercel preview smoke:** verify pricing page deploys correctly on Vercel preview before promoting to production.
7. **PostHog dashboard refresh:** after T+7/14/21d emails ship, extend Wave 1 full-funnel dashboard with the new email_type values for tracking.

These are NOT engineer tasks. The plan is complete when Tasks 1-12 are shipped to `main`.
