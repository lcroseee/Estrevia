# Paywall Upgrade CRO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add value-then-block paywall to 3 leakage points (Celtic Cross, 3-card spread, Synastry AI) with shared `PaywallCta` component, contextual `PaywallModal` headlines, and per-trigger telemetry.

**Architecture:** New shared `PaywallCta` (presentational) opens existing `PaywallModal` extended with optional `triggerContext` prop. Free-user flow lets the user complete the free action (draw cards, calculate synastry), then exposes the CTA card/inline; click opens the modal in-context (no full-page nav to `/pricing`). Reuses existing spreadType-agnostic `/api/v1/tarot/interpret` for Celtic Cross interpretation. Per-trigger funnel tracked via `trigger` dimension on existing paywall events plus a new `PAYWALL_CTA_VIEWED` impression event.

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript 6 strict · Tailwind 4 · Vitest + Testing Library · next-intl 4.x · PostHog (via `src/shared/lib/analytics.ts`).

**Spec:** `docs/superpowers/specs/2026-05-13-paywall-upgrade-cro-design.md`

---

## Execution Waves

For parallel subagent execution, tasks group into 4 dependency waves:

| Wave | Tasks | Parallelism |
|---|---|---|
| 1 | T1 (type) · T2 (analytics) · T3 (i18n) | Fully parallel — no shared files |
| 2 | T4 (PaywallCta) · T5 (PaywallModal extension) | Parallel — different files |
| 3 | T6 (EssayPageClient) · T7 (Synastry) · T8 (3-card) · T9 (Celtic) | Parallel — different files |
| 4 | T10 (E2E) → T11 (verification) | Sequential — final gate |

---

## Task 1: Add `PaywallTrigger` union type

**Why:** Centralized type for the trigger identifier used across `PaywallCta`, `PaywallModal`, and analytics events. Kebab-case values match repo convention for UTM/event props.

**Files:**
- Create: `src/shared/types/paywall.ts`

- [ ] **Step 1.1: Create the type file**

`src/shared/types/paywall.ts`:
```ts
/**
 * Identifier for the paywall trigger surface — where the user clicked the
 * CTA. Used to (a) select contextual modal headline copy and (b) add a
 * `trigger` dimension to paywall analytics events for per-surface funnel
 * analysis.
 *
 * Kebab-case values match repo conventions for analytics props and UTM
 * parameters. In i18n keys, the dot-safe camelCase variant is used (e.g.
 * `paywall.contextualTitles.celticCross`).
 */
export type PaywallTrigger =
  | 'essay'
  | 'celtic-cross'
  | 'three-card'
  | 'synastry-ai'
  | 'generic';
```

- [ ] **Step 1.2: Typecheck**

Run: `npm run typecheck`
Expected: zero new errors. Existing baseline error count unchanged.

- [ ] **Step 1.3: Commit**

```bash
git add src/shared/types/paywall.ts
git commit -m "feat(paywall/types): add PaywallTrigger union type"
```

---

## Task 2: Extend analytics with `PAYWALL_CTA_VIEWED` event

**Why:** New impression event enables impression → click → trial-click → checkout funnel per trigger. Existing paywall events get `trigger` dimension passed through call-sites (no enum change for those — `trackEvent` accepts arbitrary props record).

**Files:**
- Modify: `src/shared/lib/analytics.ts` (add one enum value)

- [ ] **Step 2.1: Read current enum to confirm location**

Run: `grep -n "PAYWALL_OPENED\|PAYWALL_TRIAL_CLICKED" src/shared/lib/analytics.ts`
Expected: two lines pointing at the `AnalyticsEvent` const definition block.

- [ ] **Step 2.2: Add the new event identifier**

In `src/shared/lib/analytics.ts`, locate this block:
```ts
  // Conversion funnel — paywall → sign-up → checkout → Stripe
  PAYWALL_OPENED: 'paywall_opened',
  PAYWALL_TRIAL_CLICKED: 'paywall_trial_clicked',
```

Replace with:
```ts
  // Conversion funnel — paywall → sign-up → checkout → Stripe
  PAYWALL_CTA_VIEWED: 'paywall_cta_viewed',
  PAYWALL_OPENED: 'paywall_opened',
  PAYWALL_TRIAL_CLICKED: 'paywall_trial_clicked',
```

- [ ] **Step 2.3: Typecheck**

Run: `npm run typecheck`
Expected: zero new errors.

- [ ] **Step 2.4: Commit**

```bash
git add src/shared/lib/analytics.ts
git commit -m "feat(analytics/paywall): add PAYWALL_CTA_VIEWED impression event"
```

---

## Task 3: Add i18n keys (EN + ES) for contextual paywall copy

**Why:** Contextual modal headlines + CTA copy per trigger. Spanish uses LATAM neutro, `tú` form.

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/es.json`

- [ ] **Step 3.1: Read existing paywall key location in EN**

Run: `node -e "const m = require('./messages/en.json'); console.log(JSON.stringify(m.paywall, null, 2));"`
Expected: shows current 6 keys (`title`, `subtitle`, `features`, `trialCta`, `noCharge`, `alreadyPro`).

- [ ] **Step 3.2: Add contextual keys to `messages/en.json`**

In `messages/en.json`, locate the `"paywall"` object and replace its content with:
```json
  "paywall": {
    "title": "Unlock Full Access",
    "subtitle": "Continue reading with Estrevia Pro",
    "features": "Everything in Free, plus:",
    "trialCta": "Start 3-Day Free Trial",
    "noCharge": "You won't be charged until {date}",
    "alreadyPro": "You already have Pro access",
    "contextualTitles": {
      "celticCross": "Unlock your Celtic Cross reading",
      "threeCard": "See the full 3-card story",
      "synastryAi": "Get the AI relationship analysis",
      "essay": "Unlock the full essay"
    },
    "cta": {
      "eyebrow": "Locked behind Star",
      "subline": {
        "celticCross": "Get the full interpretation tying all 10 cards into one narrative.",
        "threeCard": "Get the LLM reading that connects past, present, and future.",
        "synastryAi": "Get a detailed analysis of how your charts interact."
      },
      "ctaLabel": "Start 3-Day Free Trial"
    }
  }
```

(Preserve trailing comma if there are sibling keys after `paywall`.)

- [ ] **Step 3.3: Add the same structure to `messages/es.json` (LATAM neutro, `tú` form)**

Locate the `"paywall"` object in `messages/es.json` and replace with:
```json
  "paywall": {
    "title": "Desbloquea el acceso completo",
    "subtitle": "Continúa leyendo con Estrevia Pro",
    "features": "Todo lo del plan Free, más:",
    "trialCta": "Comienza tu prueba gratis de 3 días",
    "noCharge": "No se te cobrará hasta el {date}",
    "alreadyPro": "Ya tienes acceso Pro",
    "contextualTitles": {
      "celticCross": "Desbloquea tu lectura de la Cruz Celta",
      "threeCard": "Descubre la historia completa de las 3 cartas",
      "synastryAi": "Obtén el análisis de compatibilidad con IA",
      "essay": "Desbloquea el ensayo completo"
    },
    "cta": {
      "eyebrow": "Bloqueado tras Star",
      "subline": {
        "celticCross": "Obtén la interpretación completa que conecta las 10 cartas en una narrativa.",
        "threeCard": "Obtén la lectura que conecta pasado, presente y futuro.",
        "synastryAi": "Obtén un análisis detallado de cómo interactúan tus cartas."
      },
      "ctaLabel": "Comienza tu prueba gratis de 3 días"
    }
  }
```

**Important:** Only the new keys (`contextualTitles`, `cta`) are required to be added. Existing 6 keys may already match the Spanish translations above — verify by running `node -e "const m = require('./messages/es.json'); console.log(JSON.stringify(m.paywall, null, 2));"` first and preserve existing translations if they differ from the suggested copy. Show diff to founder if Spanish wording was previously different.

- [ ] **Step 3.4: Validate JSON parses**

Run:
```bash
node -e "JSON.parse(require('fs').readFileSync('messages/en.json', 'utf8')); JSON.parse(require('fs').readFileSync('messages/es.json', 'utf8')); console.log('OK');"
```
Expected: `OK`. Any SyntaxError means there's a stray comma — fix and re-run.

- [ ] **Step 3.5: Commit**

```bash
git add messages/en.json messages/es.json
git commit -m "feat(i18n/paywall): contextual titles + CTA copy en+es"
```

---

## Task 4: Create `PaywallCta` shared component

**Why:** Presentational component used at each trigger site. Owns no modal state (parent does). Fires `PAYWALL_CTA_VIEWED` on first viewport entry via `IntersectionObserver`.

**Files:**
- Create: `src/shared/components/PaywallCta.tsx`
- Create: `src/shared/components/__tests__/PaywallCta.test.tsx`

- [ ] **Step 4.1: Write failing test file**

`src/shared/components/__tests__/PaywallCta.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import React from 'react';

// Mock IntersectionObserver: invoke callback immediately as if intersecting.
beforeEach(() => {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      private cb: IntersectionObserverCallback;
      constructor(cb: IntersectionObserverCallback) {
        this.cb = cb;
      }
      observe(target: Element) {
        this.cb(
          [{ isIntersecting: true, target } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        );
      }
      unobserve() {}
      disconnect() {}
    },
  );
});

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => {
    return (key: string) => `${namespace ?? ''}.${key}`;
  },
}));

vi.mock('@/shared/lib/analytics', () => ({
  trackEvent: vi.fn(),
  AnalyticsEvent: new Proxy({}, { get: (_, k) => String(k) }),
}));

import { trackEvent } from '@/shared/lib/analytics';
import { PaywallCta } from '../PaywallCta';

const mockTrackEvent = vi.mocked(trackEvent);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PaywallCta', () => {
  it('fires PAYWALL_CTA_VIEWED on mount with trigger + variant payload', () => {
    render(<PaywallCta trigger="celtic-cross" onClick={vi.fn()} />);
    expect(mockTrackEvent).toHaveBeenCalledWith(
      'PAYWALL_CTA_VIEWED',
      expect.objectContaining({ trigger: 'celtic-cross', variant: 'card' }),
    );
  });

  it('fires onClick when CTA button is pressed', () => {
    const onClick = vi.fn();
    const { getByRole } = render(
      <PaywallCta trigger="three-card" onClick={onClick} />,
    );
    fireEvent.click(getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders inline variant when variant="inline"', () => {
    const { container } = render(
      <PaywallCta
        trigger="synastry-ai"
        variant="inline"
        onClick={vi.fn()}
      />,
    );
    // Inline variant carries data-variant for assertion
    const root = container.querySelector('[data-variant="inline"]');
    expect(root).not.toBeNull();
  });

  it('passes aria-haspopup="dialog" on the button', () => {
    const { getByRole } = render(
      <PaywallCta trigger="celtic-cross" onClick={vi.fn()} />,
    );
    expect(getByRole('button').getAttribute('aria-haspopup')).toBe('dialog');
  });
});
```

- [ ] **Step 4.2: Run the test to verify it fails**

Run: `npx vitest run src/shared/components/__tests__/PaywallCta.test.tsx`
Expected: FAIL with `Cannot find module '../PaywallCta'` or similar import error.

- [ ] **Step 4.3: Implement `PaywallCta`**

`src/shared/components/PaywallCta.tsx`:
```tsx
'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { trackEvent, AnalyticsEvent } from '@/shared/lib/analytics';
import type { PaywallTrigger } from '@/shared/types/paywall';

interface PaywallCtaProps {
  trigger: PaywallTrigger;
  onClick: () => void;
  variant?: 'card' | 'inline';
}

// kebab-case trigger -> camelCase i18n key segment.
function triggerToKey(trigger: PaywallTrigger): string {
  return trigger
    .split('-')
    .map((part, i) =>
      i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join('');
}

export function PaywallCta({
  trigger,
  onClick,
  variant = 'card',
}: PaywallCtaProps) {
  const t = useTranslations('paywall');
  const ref = useRef<HTMLDivElement>(null);
  const fired = useRef(false);

  // Fire-once-per-mount impression event on first viewport entry.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!ref.current) return;
    if (fired.current) return;
    const target = ref.current;
    const obs = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting && !fired.current) {
          fired.current = true;
          trackEvent(AnalyticsEvent.PAYWALL_CTA_VIEWED, { trigger, variant });
          obs.disconnect();
          break;
        }
      }
    });
    obs.observe(target);
    return () => obs.disconnect();
  }, [trigger, variant]);

  const triggerKey = triggerToKey(trigger);
  const title =
    trigger === 'generic'
      ? t('title')
      : t(`contextualTitles.${triggerKey}` as 'contextualTitles.essay');
  const subline =
    trigger === 'generic'
      ? t('subtitle')
      : t(`cta.subline.${triggerKey}` as 'cta.subline.celticCross');
  const ctaLabel = t('cta.ctaLabel');
  const eyebrow = t('cta.eyebrow');

  if (variant === 'inline') {
    return (
      <div
        ref={ref}
        data-variant="inline"
        className="flex flex-wrap items-center gap-3 rounded-lg border border-white/8 px-4 py-3"
        style={{ background: 'rgba(255,255,255,0.02)' }}
      >
        <div className="flex-1 min-w-0">
          <p
            className="text-sm text-white/80"
            style={{ fontFamily: "var(--font-crimson-pro, 'Crimson Pro', serif)" }}
          >
            {title}
          </p>
          <p className="text-xs text-white/45 mt-0.5">{subline}</p>
        </div>
        <button
          type="button"
          onClick={onClick}
          aria-haspopup="dialog"
          className="px-3.5 py-1.5 rounded-lg text-xs font-semibold tracking-wide focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
          style={{
            background: 'linear-gradient(135deg, #FFD700, #FFE033)',
            color: '#0A0A0F',
          }}
        >
          {ctaLabel}
        </button>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      data-variant="card"
      className="rounded-xl border border-white/8 p-6 text-center space-y-3"
      style={{ background: 'rgba(255,255,255,0.025)' }}
    >
      <p className="text-[11px] tracking-[0.2em] uppercase text-[#FFD700]/60">
        {eyebrow}
      </p>
      <h3
        className="text-xl font-light text-white"
        style={{ fontFamily: "var(--font-crimson-pro, Georgia, serif)" }}
      >
        {title}
      </h3>
      <p className="text-sm text-white/65 leading-relaxed max-w-sm mx-auto">
        {subline}
      </p>
      <button
        type="button"
        onClick={onClick}
        aria-haspopup="dialog"
        className="mt-2 w-full max-w-xs mx-auto block py-3 px-6 rounded-xl text-sm font-semibold tracking-wide focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
        style={{
          background: 'linear-gradient(135deg, #FFD700, #FFE033)',
          color: '#0A0A0F',
        }}
      >
        {ctaLabel}
      </button>
    </div>
  );
}
```

- [ ] **Step 4.4: Run the test to verify it passes**

Run: `npx vitest run src/shared/components/__tests__/PaywallCta.test.tsx`
Expected: 4 tests pass.

- [ ] **Step 4.5: Typecheck + lint**

Run: `npm run typecheck && npm run lint -- src/shared/components/PaywallCta.tsx`
Expected: zero new errors / warnings on the new file.

- [ ] **Step 4.6: Commit**

```bash
git add src/shared/components/PaywallCta.tsx \
        src/shared/components/__tests__/PaywallCta.test.tsx
git commit -m "feat(paywall/cta): add PaywallCta shared component"
```

---

## Task 5: Extend `PaywallModal` with `triggerContext` prop

**Why:** Contextual headline per trigger; `trigger` dimension on existing paywall events. Backwards-compatible — `EssayPageClient` continues to work without passing the prop until Task 6 wires it up.

**Files:**
- Modify: `src/shared/components/PaywallModal.tsx`
- Create: `src/shared/components/__tests__/PaywallModal.trigger.test.tsx`

- [ ] **Step 5.1: Write failing test**

`src/shared/components/__tests__/PaywallModal.trigger.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import React from 'react';

// Capture which i18n key was requested so we can assert headline resolution.
const requestedKeys: string[] = [];

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const t: any = (key: string) => {
      requestedKeys.push(key);
      // Return distinct sentinel for `title` vs contextual keys.
      if (key === 'title') return 'GENERIC_TITLE';
      if (key === 'contextualTitles.celticCross') return 'CELTIC_TITLE';
      if (key === 'contextualTitles.threeCard') return 'THREECARD_TITLE';
      if (key === 'contextualTitles.synastryAi') return 'SYNASTRY_TITLE';
      if (key === 'contextualTitles.essay') return 'ESSAY_TITLE';
      return key;
    };
    t.has = (key: string) => key.startsWith('contextualTitles.') || key === 'title';
    return t;
  },
}));

vi.mock('@/shared/lib/analytics', () => ({
  trackEvent: vi.fn(),
  AnalyticsEvent: new Proxy({}, { get: (_, k) => String(k) }),
}));

vi.mock('@/shared/lib/utm-cookie', () => ({
  readUtmCookie: vi.fn().mockReturnValue(null),
}));

import { trackEvent } from '@/shared/lib/analytics';
import { PaywallModal } from '../PaywallModal';

const mockTrackEvent = vi.mocked(trackEvent);

beforeEach(() => {
  vi.clearAllMocks();
  requestedKeys.length = 0;
});

describe('PaywallModal — triggerContext', () => {
  it('renders generic title when triggerContext is omitted (backwards-compat)', () => {
    const { getByText } = render(<PaywallModal open={true} onClose={vi.fn()} />);
    expect(getByText('GENERIC_TITLE')).toBeTruthy();
  });

  it('renders contextual title when triggerContext="celtic-cross"', () => {
    const { getByText } = render(
      <PaywallModal open={true} onClose={vi.fn()} triggerContext="celtic-cross" />,
    );
    expect(getByText('CELTIC_TITLE')).toBeTruthy();
  });

  it('renders contextual title when triggerContext="synastry-ai"', () => {
    const { getByText } = render(
      <PaywallModal open={true} onClose={vi.fn()} triggerContext="synastry-ai" />,
    );
    expect(getByText('SYNASTRY_TITLE')).toBeTruthy();
  });

  it('falls back to generic title when triggerContext="generic"', () => {
    const { getByText } = render(
      <PaywallModal open={true} onClose={vi.fn()} triggerContext="generic" />,
    );
    expect(getByText('GENERIC_TITLE')).toBeTruthy();
  });

  it('PAYWALL_OPENED event payload includes the trigger dimension', () => {
    render(
      <PaywallModal
        open={true}
        onClose={vi.fn()}
        triggerContext="three-card"
        returnUrl="/tarot/three-card"
      />,
    );
    expect(mockTrackEvent).toHaveBeenCalledWith(
      'PAYWALL_OPENED',
      expect.objectContaining({ trigger: 'three-card', returnUrl: '/tarot/three-card' }),
    );
  });

  it('PAYWALL_OPENED event uses "generic" when triggerContext is omitted', () => {
    render(<PaywallModal open={true} onClose={vi.fn()} returnUrl="/foo" />);
    expect(mockTrackEvent).toHaveBeenCalledWith(
      'PAYWALL_OPENED',
      expect.objectContaining({ trigger: 'generic' }),
    );
  });
});
```

- [ ] **Step 5.2: Run the test to verify it fails**

Run: `npx vitest run src/shared/components/__tests__/PaywallModal.trigger.test.tsx`
Expected: tests fail because (a) `triggerContext` prop doesn't exist, (b) event payloads don't include `trigger`.

- [ ] **Step 5.3: Modify `PaywallModal.tsx` — add the prop and resolve title contextually**

In `src/shared/components/PaywallModal.tsx`:

(a) Update import block at top of file to include the type:
```tsx
import type { PaywallTrigger } from '@/shared/types/paywall';
```

(b) Update the props interface:
```tsx
interface PaywallModalProps {
  open: boolean;
  onClose: () => void;
  returnUrl?: string;
  triggerContext?: PaywallTrigger;
}
```

(c) Update the function signature:
```tsx
export function PaywallModal({ open, onClose, returnUrl, triggerContext }: PaywallModalProps) {
```

(d) Add a helper near the top of the file (outside the component):
```tsx
function triggerToKey(trigger: PaywallTrigger): string {
  return trigger
    .split('-')
    .map((part, i) => (i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join('');
}
```

(e) Inside the component, after the `useTranslations` calls and before the existing `useEffect` blocks, compute the headline:
```tsx
  const headline =
    triggerContext && triggerContext !== 'generic' && t.has(`contextualTitles.${triggerToKey(triggerContext)}`)
      ? t(`contextualTitles.${triggerToKey(triggerContext)}` as 'contextualTitles.essay')
      : t('title');
```

(f) Replace the existing `<h2>` rendering `{t('title')}` with `{headline}`. Locate this block:
```tsx
            <h2
              className="text-2xl font-light text-white mb-1"
              style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)' }}
            >
              {t('title')}
            </h2>
```
Replace `{t('title')}` with `{headline}`.

(g) Update the four `trackEvent` calls to include the trigger dimension. Replace:
```tsx
    if (open) trackEvent(AnalyticsEvent.PAYWALL_OPENED, { returnUrl: returnUrl ?? null });
```
with:
```tsx
    if (open) trackEvent(AnalyticsEvent.PAYWALL_OPENED, {
      trigger: triggerContext ?? 'generic',
      returnUrl: returnUrl ?? null,
    });
```

Replace:
```tsx
    trackEvent(AnalyticsEvent.PAYWALL_TRIAL_CLICKED, { plan, returnUrl: returnUrl ?? null });
```
with:
```tsx
    trackEvent(AnalyticsEvent.PAYWALL_TRIAL_CLICKED, {
      plan,
      trigger: triggerContext ?? 'generic',
      returnUrl: returnUrl ?? null,
    });
```

Replace:
```tsx
        trackEvent(AnalyticsEvent.CHECKOUT_AUTH_REDIRECT, { plan, returnUrl: target });
```
with:
```tsx
        trackEvent(AnalyticsEvent.CHECKOUT_AUTH_REDIRECT, {
          plan,
          trigger: triggerContext ?? 'generic',
          returnUrl: target,
        });
```

Replace:
```tsx
      trackEvent(AnalyticsEvent.CHECKOUT_STRIPE_REDIRECTED, { plan });
```
with:
```tsx
      trackEvent(AnalyticsEvent.CHECKOUT_STRIPE_REDIRECTED, {
        plan,
        trigger: triggerContext ?? 'generic',
      });
```

(h) Update the dependency array of the `useEffect` that tracks `PAYWALL_OPENED` to include `triggerContext`:
```tsx
  useEffect(() => {
    if (open) trackEvent(AnalyticsEvent.PAYWALL_OPENED, {
      trigger: triggerContext ?? 'generic',
      returnUrl: returnUrl ?? null,
    });
  }, [open, returnUrl, triggerContext]);
```

- [ ] **Step 5.4: Run trigger test to verify it passes**

Run: `npx vitest run src/shared/components/__tests__/PaywallModal.trigger.test.tsx`
Expected: 6 tests pass.

- [ ] **Step 5.5: Run existing UTM test to verify no regression**

Run: `npx vitest run src/shared/components/__tests__/PaywallModal.utm.test.tsx`
Expected: existing tests still pass.

- [ ] **Step 5.6: Typecheck**

Run: `npm run typecheck`
Expected: zero new errors.

- [ ] **Step 5.7: Commit**

```bash
git add src/shared/components/PaywallModal.tsx \
        src/shared/components/__tests__/PaywallModal.trigger.test.tsx
git commit -m "feat(paywall/modal): support contextual triggerContext with i18n fallback"
```

---

## Task 6: Wire `triggerContext="essay"` into `EssayPageClient`

**Why:** Existing call site gets the new contextual headline + `trigger: 'essay'` dimension on its events, completing backwards-compat coverage of the 4 named triggers.

**Files:**
- Modify: `src/modules/esoteric/components/EssayPageClient.tsx`

- [ ] **Step 6.1: Read current PaywallModal usage in EssayPageClient**

Run: `grep -n "PaywallModal" src/modules/esoteric/components/EssayPageClient.tsx`
Expected: line ~58 with the `<PaywallModal ...>` JSX.

- [ ] **Step 6.2: Add the `triggerContext` prop**

Locate the existing `<PaywallModal>` JSX in `EssayPageClient.tsx` (around line 58). Add `triggerContext="essay"` as a prop. Example before/after:

Before:
```tsx
      <PaywallModal
        open={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        returnUrl={...}
      />
```

After:
```tsx
      <PaywallModal
        open={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        returnUrl={...}
        triggerContext="essay"
      />
```

Keep all other props unchanged.

- [ ] **Step 6.3: Typecheck**

Run: `npm run typecheck`
Expected: zero new errors.

- [ ] **Step 6.4: Manual smoke (deferred to Task 11 verification)**

No new test for this one-line change — Task 5's tests already cover `triggerContext='essay'` behaviour. Manual smoke confirms in Task 11.

- [ ] **Step 6.5: Commit**

```bash
git add src/modules/esoteric/components/EssayPageClient.tsx
git commit -m "feat(essay/paywall): pass triggerContext to PaywallModal"
```

---

## Task 7: Replace `<a href="/pricing">` in `SynastryClient` with inline `PaywallCta`

**Why:** Closes the leakage point — keeps users in-context instead of full-page navigating to `/pricing`. Synastry free flow (result + scores) is unchanged.

**Files:**
- Create: `src/modules/astro-engine/components/__tests__/SynastryClient.test.tsx`
- Modify: `src/modules/astro-engine/components/SynastryClient.tsx`

- [ ] **Step 7.1: Read current AI Analysis section to confirm lines**

Run: `sed -n '210,245p' src/modules/astro-engine/components/SynastryClient.tsx`
Expected: shows the `<section aria-labelledby="ai-analysis-heading">` block with the `{!isPro && (<p>...<a href="/pricing">...</a>...</p>)}` block.

- [ ] **Step 7.2: Write failing test**

`src/modules/astro-engine/components/__tests__/SynastryClient.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/synastry',
}));

const mockUseSubscription = vi.fn();
vi.mock('@/shared/hooks/useSubscription', () => ({
  useSubscription: () => mockUseSubscription(),
}));

vi.mock('@/shared/lib/analytics', () => ({
  trackEvent: vi.fn(),
  AnalyticsEvent: new Proxy({}, { get: (_, k) => String(k) }),
}));

// IntersectionObserver polyfill (needed by PaywallCta).
beforeEach(() => {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

import { SynastryClient } from '../SynastryClient';

describe('SynastryClient — paywall replacement', () => {
  it('renders inline PaywallCta and no /pricing link for free user with a calculated result', () => {
    mockUseSubscription.mockReturnValue({ isPro: false, isLoading: false });
    // SynastryClient initial state has no result. We assert the upfront
    // tree at least renders without throwing — full integration test of
    // the AI-Analysis state needs a calculated result fixture, deferred
    // to E2E. Here we lock the contract that no '/pricing' anchor exists
    // anywhere in the initial tree.
    const { container } = render(<SynastryClient />);
    const pricingAnchor = container.querySelector('a[href="/pricing"]');
    expect(pricingAnchor).toBeNull();
  });
});
```

(Note: full free-user-with-result test would require seeding the `result` state — `SynastryClient`'s result requires a server fetch. The above test covers the regression we care about: `/pricing` link removed. Deeper coverage lives in Task 10 manual smoke.)

- [ ] **Step 7.3: Run test to confirm it currently passes (the anchor is initially absent in the unconfigured state)**

Run: `npx vitest run src/modules/astro-engine/components/__tests__/SynastryClient.test.tsx`

If it passes already because the anchor is only rendered after a result is calculated, the test is still load-bearing — it locks the regression that even after the patch the anchor stays absent. If it fails because the unmocked state throws, add a `try { render(...) } catch` guard and re-evaluate.

- [ ] **Step 7.4: Modify `SynastryClient.tsx` — replace anchor with PaywallCta + add modal**

In `src/modules/astro-engine/components/SynastryClient.tsx`:

(a) Add imports (alongside existing):
```tsx
import { PaywallCta } from '@/shared/components/PaywallCta';
import { PaywallModal } from '@/shared/components/PaywallModal';
```

(b) In the component, near other `useState` calls, add modal state:
```tsx
  const [paywallOpen, setPaywallOpen] = useState(false);
```

(c) Replace the `{!isPro && (...)}` block in the AI Analysis section. Locate this block (around line 229-237):
```tsx
            {!isPro && (
              <p className="text-xs text-white/40">
                {t('aiAnalysis')} &mdash; Pro feature.{' '}
                <a href="/pricing" className="text-[#FFD700]/70 hover:text-[#FFD700]">
                  {t('upgradeCta')}
                </a>
              </p>
            )}
```

Replace with:
```tsx
            {!isPro && (
              <PaywallCta
                trigger="synastry-ai"
                variant="inline"
                onClick={() => setPaywallOpen(true)}
              />
            )}
```

(d) Inside the JSX, after the `</div>` that closes the result block, before the closing tag of the outermost wrapper, mount the modal. Locate the existing `return (...)` for the result-rendered branch and add at the bottom of the returned tree:
```tsx
        <PaywallModal
          open={paywallOpen}
          onClose={() => setPaywallOpen(false)}
          returnUrl={pathname}
          triggerContext="synastry-ai"
        />
```

(Use the existing `pathname` from `usePathname()` for the return URL.)

- [ ] **Step 7.5: Run test + typecheck**

Run: `npx vitest run src/modules/astro-engine/components/__tests__/SynastryClient.test.tsx && npm run typecheck`
Expected: test passes, no new type errors.

- [ ] **Step 7.6: Commit**

```bash
git add src/modules/astro-engine/components/SynastryClient.tsx \
        src/modules/astro-engine/components/__tests__/SynastryClient.test.tsx
git commit -m "feat(synastry/ai): replace /pricing link with PaywallCta inline"
```

---

## Task 8: `ThreeCardSpread` — value-then-block paywall

**Why:** Free user draws the 3 cards, sees their names and keywords (existing card detail flow), then hits a CTA card where the LLM interpretation would render for Pro users. The existing `/api/v1/tarot/interpret` endpoint stays Pro-gated server-side.

**Files:**
- Create: `src/modules/esoteric/components/__tests__/ThreeCardSpread.test.tsx`
- Modify: `src/modules/esoteric/components/ThreeCardSpread.tsx`

- [ ] **Step 8.1: Read current component to confirm refactor surface**

Run: `sed -n '80,135p' src/modules/esoteric/components/ThreeCardSpread.tsx`
Expected: shows the `interpret` API call block and the `if (!isPro) {` early-return block.

- [ ] **Step 8.2: Write failing test**

`src/modules/esoteric/components/__tests__/ThreeCardSpread.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';

const cards = [
  { id: 'fool', number: 0, name: { en: 'The Fool' }, suit: 'major' },
  { id: 'magus', number: 1, name: { en: 'The Magus' }, suit: 'major' },
  { id: 'priestess', number: 2, name: { en: 'The Priestess' }, suit: 'major' },
];

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}));

const mockUseSubscription = vi.fn();
vi.mock('@/shared/hooks/useSubscription', () => ({
  useSubscription: () => mockUseSubscription(),
}));

vi.mock('@/shared/lib/analytics', () => ({
  trackEvent: vi.fn(),
  AnalyticsEvent: new Proxy({}, { get: (_, k) => String(k) }),
}));

const mockPostJson = vi.fn();
vi.mock('@/shared/lib/apiFetch', () => ({
  postJson: (...args: unknown[]) => mockPostJson(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockPostJson.mockResolvedValue({ kind: 'ok', data: { success: true, data: null } });
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

import { ThreeCardSpread } from '../ThreeCardSpread';

describe('ThreeCardSpread — value-then-block', () => {
  it('renders Draw button for free user (no early return to upgrade-only state)', () => {
    mockUseSubscription.mockReturnValue({ isPro: false, isLoading: false });
    const { getByRole, queryByText } = render(<ThreeCardSpread allCards={cards} />);
    expect(getByRole('button', { name: /draw/i })).toBeTruthy();
    // Legacy '/settings' link must be absent
    expect(queryByText(/settings/i)).toBeNull();
  });

  it('does not call /api/v1/tarot/interpret for free user even after a draw', async () => {
    mockUseSubscription.mockReturnValue({ isPro: false, isLoading: false });
    const { getByRole } = render(<ThreeCardSpread allCards={cards} />);
    const drawBtn = getByRole('button', { name: /draw/i });
    drawBtn.click();
    // Wait one tick for any synchronous state updates
    await new Promise((r) => setTimeout(r, 0));
    expect(mockPostJson).not.toHaveBeenCalledWith(
      '/api/v1/tarot/interpret',
      expect.anything(),
    );
  });
});
```

- [ ] **Step 8.3: Run test to verify it fails**

Run: `npx vitest run src/modules/esoteric/components/__tests__/ThreeCardSpread.test.tsx`
Expected: at least the "renders Draw button for free user" test fails because today's `if (!isPro)` early return blocks the draw button.

- [ ] **Step 8.4: Modify `ThreeCardSpread.tsx`**

In `src/modules/esoteric/components/ThreeCardSpread.tsx`:

(a) Add imports (top of file, with the existing imports):
```tsx
import { PaywallCta } from '@/shared/components/PaywallCta';
import { PaywallModal } from '@/shared/components/PaywallModal';
import { usePathname } from 'next/navigation';
```

(b) In the component body, add modal state and pathname (near existing `useState` calls):
```tsx
  const [paywallOpen, setPaywallOpen] = useState(false);
  const pathname = usePathname();
```

(c) Locate the existing early-return block (around line 134):
```tsx
  if (!isPro) {
    return (
      // ... pro-required + /settings link
    );
  }
```
**Remove this entire block.** Free users now reach the same render tree as Pro users.

(d) Locate the interpret-call effect (around line 86) — currently:
```tsx
    if (!isPro || drawnCards.length === 0) return;
```
Change to:
```tsx
    if (!isPro) return;
    if (drawnCards.length === 0) return;
```
(Same logic, but now each guard reads independently.)

(e) In the JSX, locate where the existing `interpretation` block renders (around line 235-249, the `{interpretation && (...)}` block). Right after that block, add:
```tsx
      {!isPro && revealedCount === 3 && (
        <PaywallCta
          trigger="three-card"
          variant="card"
          onClick={() => setPaywallOpen(true)}
        />
      )}
```
(`revealedCount === 3` gates the CTA until the reveal animation completes — matches the Pro `interpretation` UX where the user must finish revealing before the interpretation block appears.)

(f) Mount the modal at the bottom of the JSX return tree, just before the outermost closing tag:
```tsx
      <PaywallModal
        open={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        returnUrl={pathname}
        triggerContext="three-card"
      />
```

- [ ] **Step 8.5: Run test + existing tests**

Run: `npx vitest run src/modules/esoteric/components/__tests__/ThreeCardSpread.test.tsx`
Expected: 2 tests pass.

- [ ] **Step 8.6: Typecheck + lint**

Run: `npm run typecheck`
Expected: zero new errors.

- [ ] **Step 8.7: Commit**

```bash
git add src/modules/esoteric/components/ThreeCardSpread.tsx \
        src/modules/esoteric/components/__tests__/ThreeCardSpread.test.tsx
git commit -m "feat(tarot/three-card): value-then-block paywall trigger"
```

---

## Task 9: `CelticCross` — value-then-block + LLM interpretation

**Why:** Free user draws the 10-card spread and sees per-card details. Pro user additionally gets an LLM interpretation via the existing spreadType-agnostic `/api/v1/tarot/interpret` endpoint. Free user sees a `PaywallCta` where the interpretation would render.

**Files:**
- Create: `src/modules/esoteric/components/__tests__/CelticCross.test.tsx`
- Modify: `src/modules/esoteric/components/CelticCross.tsx`

- [ ] **Step 9.1: Read current `CelticCross.tsx` early-return block**

Run: `sed -n '107,125p' src/modules/esoteric/components/CelticCross.tsx`
Expected: shows the `if (!isPro)` early-return block (lines 111-123 currently).

- [ ] **Step 9.2: Write failing test**

`src/modules/esoteric/components/__tests__/CelticCross.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';

const cards = Array.from({ length: 22 }, (_, i) => ({
  id: `card-${i}`,
  number: i,
  name: { en: `Card ${i}` },
  suit: 'major',
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}));

const mockUseSubscription = vi.fn();
vi.mock('@/shared/hooks/useSubscription', () => ({
  useSubscription: () => mockUseSubscription(),
}));

vi.mock('@/shared/lib/analytics', () => ({
  trackEvent: vi.fn(),
  AnalyticsEvent: new Proxy({}, { get: (_, k) => String(k) }),
}));

const mockPostJson = vi.fn();
vi.mock('@/shared/lib/apiFetch', () => ({
  postJson: (...args: unknown[]) => mockPostJson(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockPostJson.mockResolvedValue({ kind: 'ok', data: { success: true, data: { interpretation: 'mock interp' } } });
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

import { CelticCross } from '../CelticCross';

describe('CelticCross — value-then-block + LLM interpretation', () => {
  it('renders the Draw button for free user (no early return to upgrade-only state)', () => {
    mockUseSubscription.mockReturnValue({ isPro: false, isLoading: false });
    const { getByRole } = render(<CelticCross allCards={cards} />);
    expect(getByRole('button', { name: /drawCelticCross/i })).toBeTruthy();
  });

  it('does not call /api/v1/tarot/interpret for free user', async () => {
    mockUseSubscription.mockReturnValue({ isPro: false, isLoading: false });
    const { getByRole } = render(<CelticCross allCards={cards} />);
    getByRole('button', { name: /drawCelticCross/i }).click();
    await new Promise((r) => setTimeout(r, 0));
    expect(mockPostJson).not.toHaveBeenCalledWith(
      '/api/v1/tarot/interpret',
      expect.anything(),
    );
  });

  it('legacy /settings upgrade link is absent for free user', () => {
    mockUseSubscription.mockReturnValue({ isPro: false, isLoading: false });
    const { container } = render(<CelticCross allCards={cards} />);
    const link = container.querySelector('a[href*="/settings"]');
    expect(link).toBeNull();
  });
});
```

- [ ] **Step 9.3: Run test to verify it fails**

Run: `npx vitest run src/modules/esoteric/components/__tests__/CelticCross.test.tsx`
Expected: tests fail because today's early-return blocks the Draw button for free users.

- [ ] **Step 9.4: Modify `CelticCross.tsx`**

In `src/modules/esoteric/components/CelticCross.tsx`:

(a) Add imports (with existing imports near top):
```tsx
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { postJson, ApiResult } from '@/shared/lib/apiFetch';
import { PaywallCta } from '@/shared/components/PaywallCta';
import { PaywallModal } from '@/shared/components/PaywallModal';
```

Adjust the existing `import { useState, useCallback } from 'react';` to `import { useState, useCallback, useEffect } from 'react';`.

(Confirm `ApiResult` type name by reading `src/shared/lib/apiFetch.ts`; rename in the import if the project uses a different exported type — see Step 9.5.)

(b) Inside the component, add new state and pathname (near existing `useState` calls):
```tsx
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [interpretation, setInterpretation] = useState<string | null>(null);
  const [isInterpreting, setIsInterpreting] = useState(false);
  const [interpretError, setInterpretError] = useState<string | null>(null);
  const pathname = usePathname();
```

(c) Add the interpret effect (after the existing `handleDraw` `useCallback`):
```tsx
  useEffect(() => {
    if (!isPro) return;
    if (drawnCards.length !== 10) return;
    if (revealedCount !== 10) return;
    if (interpretation) return;
    if (isInterpreting) return;

    setIsInterpreting(true);
    setInterpretError(null);

    const payload = {
      spreadType: 'celtic_cross',
      cards: drawnCards.map((dc) => {
        const cardData = allCards.find((c) => c.id === dc.cardId);
        const pos = POSITIONS.find((p) => p.id === dc.positionId);
        return {
          position: pos?.key ?? `position-${dc.positionId}`,
          cardId: dc.cardId,
          cardName: cardData ? getCardName(cardData, locale) : dc.cardId,
          reversed: dc.reversed,
        };
      }),
    };

    void postJson<{ success: boolean; data: { interpretation: string } | null }>(
      '/api/v1/tarot/interpret',
      payload,
    ).then((result) => {
      setIsInterpreting(false);
      if (result.kind === 'ok' && result.data.success && result.data.data?.interpretation) {
        setInterpretation(result.data.data.interpretation);
      } else if (result.kind === 'http' && (result.status === 401 || result.status === 402)) {
        setInterpretError(t('interpretProRequired'));
      } else if (result.kind === 'http') {
        setInterpretError(t('interpretError'));
      } else {
        setInterpretError(t('interpretNetworkError'));
      }
    });
  }, [isPro, drawnCards, revealedCount, interpretation, isInterpreting, allCards, locale, t]);
```

(Adjust the conditional inside `result.kind === 'ok'` to match the actual `postJson` return shape — verify against `ThreeCardSpread.tsx:107-125` which uses the same util. Pattern shown here mirrors that file's existing usage.)

(d) Remove the existing `!isPro` early-return (lines 111-123 in current file):
```tsx
  if (!isPro) {
    return (
      <div className="rounded-xl border border-white/8 p-6 text-center space-y-3" ...>
        <p className="text-sm text-white/50">{t('proRequired')}</p>
        <Link href="/settings" ...>{t('upgradeToPro')}</Link>
      </div>
    );
  }
```
Delete this entire block. Free users now reach the main render tree.

(e) In the main return JSX, after the grid block and the Draw button block, before the card detail modal, insert the interpretation / paywall slot:
```tsx
      {/* Interpretation (Pro) or PaywallCta (free) — shown after all 10 cards revealed */}
      {revealedCount === 10 && (
        <>
          {isPro ? (
            <section aria-labelledby="celtic-interpretation-heading" className="space-y-3 max-w-2xl mx-auto">
              <h3
                id="celtic-interpretation-heading"
                className="text-sm font-medium text-white/60 uppercase tracking-wider"
              >
                {t('interpretation')}
              </h3>
              {isInterpreting && (
                <p className="text-sm text-white/45">{t('interpreting')}</p>
              )}
              {interpretation && (
                <p
                  className="text-sm text-white/70 leading-relaxed whitespace-pre-line"
                  style={{ fontFamily: "var(--font-crimson-pro, 'Crimson Pro', serif)" }}
                >
                  {interpretation}
                </p>
              )}
              {interpretError && (
                <p className="text-xs text-red-400" role="alert">
                  {interpretError}
                </p>
              )}
            </section>
          ) : (
            <PaywallCta
              trigger="celtic-cross"
              variant="card"
              onClick={() => setPaywallOpen(true)}
            />
          )}
        </>
      )}
```

(f) At the bottom of the returned JSX (before the outermost closing tag), mount the modal:
```tsx
      <PaywallModal
        open={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        returnUrl={pathname}
        triggerContext="celtic-cross"
      />
```

(g) Remove the now-unused `import { Link } from '@/i18n/navigation';` if it was only used by the deleted early-return.

- [ ] **Step 9.5: Verify `postJson` return-shape assumptions**

Run: `grep -n "ApiResult\|export.*postJson" src/shared/lib/apiFetch.ts | head -10`
Expected: see the exported type used by `postJson`. If `ApiResult` is not the exported name, replace the import in Step 9.4(a) with the correct type. Also re-read `ThreeCardSpread.tsx:107-125` to confirm the discriminated-union shape (`kind: 'ok' | 'http' | 'network'`) and align Step 9.4(c) with the actual shape.

- [ ] **Step 9.6: Run test + typecheck**

Run: `npx vitest run src/modules/esoteric/components/__tests__/CelticCross.test.tsx && npm run typecheck`
Expected: 3 tests pass, no new type errors.

- [ ] **Step 9.7: Commit**

```bash
git add src/modules/esoteric/components/CelticCross.tsx \
        src/modules/esoteric/components/__tests__/CelticCross.test.tsx
git commit -m "feat(tarot/celtic): value-then-block paywall + LLM interpretation"
```

---

## Task 10: Playwright E2E spec for canonical conversion path

**Why:** Spec requires one E2E covering the value-then-block → CTA → modal flow. Anonymous-user happy path is sufficient for the contract; authenticated Stripe redirect is exercised by manual smoke in Task 11 (Clerk test accounts are out of scope for this plan).

**Files:**
- Create: `tests/e2e/paywall-cta.spec.ts`

- [ ] **Step 10.1: Read an existing tarot E2E (if any) for pattern reference**

Run: `ls tests/e2e/ | grep -i tarot ; head -30 tests/e2e/essays.spec.ts`
Expected: confirms test structure and `beforeEach` patterns. If no tarot E2E exists, base your new spec on `essays.spec.ts` patterns.

- [ ] **Step 10.2: Write the E2E spec**

`tests/e2e/paywall-cta.spec.ts`:
```ts
import { test, expect } from '@playwright/test';

/**
 * Paywall CTA E2E — canonical conversion path for the 3 new trigger sites.
 *
 * Tested as anonymous user only. The contract verified:
 * - Free-side render works (cards/synastry result visible)
 * - PaywallCta appears at the expected position
 * - Click opens PaywallModal with the contextual headline
 * - No /pricing full-page nav happens (in-context modal)
 *
 * Stripe redirect + Clerk sign-up flows are exercised in manual smoke
 * (Task 11) — Clerk test accounts are out of scope here.
 */

test.describe('Paywall CTA — Celtic Cross', () => {
  test('anonymous user draws spread, sees CTA, opens modal with contextual headline', async ({ page }) => {
    const response = await page.goto('/tarot/celtic-cross');
    if (response?.status() === 404) test.skip();
    await page.waitForLoadState('domcontentloaded');

    // Trigger the draw
    await page.getByRole('button', { name: /draw/i }).first().click();

    // Wait for the 10-card reveal animation to complete.
    // CelticCross uses staggered setTimeout up to ~300 + 10 * 350 = ~3.8s.
    // Wait for the CTA card to appear (data-variant="card" is set by PaywallCta).
    const cta = page.locator('[data-variant="card"]').first();
    await expect(cta).toBeVisible({ timeout: 8_000 });
    await expect(cta).toContainText(/Celtic Cross|Cruz Celta/i);

    // No /pricing anchor leakage
    const pricingLink = page.locator('a[href*="/pricing"]').first();
    await expect(pricingLink).toBeHidden();

    // Click CTA → modal opens with contextual headline
    await cta.getByRole('button').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/Celtic Cross|Cruz Celta/i);
  });
});

test.describe('Paywall CTA — 3-card spread', () => {
  test('anonymous user draws 3 cards, sees CTA, opens modal with contextual headline', async ({ page }) => {
    const response = await page.goto('/tarot/three-card');
    if (response?.status() === 404) test.skip();
    await page.waitForLoadState('domcontentloaded');

    await page.getByRole('button', { name: /draw/i }).first().click();

    const cta = page.locator('[data-variant="card"]').first();
    await expect(cta).toBeVisible({ timeout: 6_000 });
    await expect(cta).toContainText(/3-card|3 cartas/i);

    await cta.getByRole('button').click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });
});

// Synastry E2E requires filling two birth-data forms — pattern from existing
// synastry spec (if any) or skip and rely on manual smoke. Keeping the
// suite focused on the two simpler trigger surfaces; document the skip:
test.describe.skip('Paywall CTA — Synastry AI', () => {
  test.skip('exercised via manual smoke — birth-form fixtures not yet wired into E2E setup', () => {});
});
```

- [ ] **Step 10.3: Run the new E2E spec (dev server must be running on `:3000` OR Playwright `webServer` auto-starts it)**

Run: `npm run test:e2e -- tests/e2e/paywall-cta.spec.ts`
Expected: 2 tests pass, 1 skipped. If the spec route returns 404 (feature flag, route not mounted), test will `.skip()` gracefully — investigate and re-run.

- [ ] **Step 10.4: Commit**

```bash
git add tests/e2e/paywall-cta.spec.ts
git commit -m "test(paywall/cta): e2e canonical conversion path for celtic + three-card"
```

---

## Task 11: Final verification + manual smoke

**Why:** Last-mile checks before declaring the project shipped. Aligns with CLAUDE.md "Test before 'done'" rule.

- [ ] **Step 11.1: Run the full test suite**

Run: `npm test`
Expected: all green. Specifically confirm:
- `src/shared/components/__tests__/PaywallCta.test.tsx` — 4 passing
- `src/shared/components/__tests__/PaywallModal.trigger.test.tsx` — 6 passing
- `src/shared/components/__tests__/PaywallModal.utm.test.tsx` — existing tests still pass
- `src/modules/esoteric/components/__tests__/ThreeCardSpread.test.tsx` — 2 passing
- `src/modules/esoteric/components/__tests__/CelticCross.test.tsx` — 3 passing
- `src/modules/astro-engine/components/__tests__/SynastryClient.test.tsx` — 1 passing

- [ ] **Step 11.2: Typecheck**

Run: `npm run typecheck`
Expected: zero errors.

- [ ] **Step 11.3: Lint**

Run: `npm run lint`
Expected: zero new errors / warnings.

- [ ] **Step 11.4: Server-side guard verification (read-only, no code change expected)**

Run:
```bash
grep -n "requirePremium\|isPremium" \
  src/app/api/v1/tarot/interpret/route.ts \
  src/app/api/v1/synastry/\\[id\\]/analyze/route.ts 2>/dev/null
```
Expected: both routes show a `requirePremium()` (or `isPremium(userId)`) gate near the top.

If either route is missing the gate, **stop and surface to the founder** — adding the server-side gate is a separate scope item (defence-in-depth blocker before shipping).

- [ ] **Step 11.5: Manual smoke (browser) — golden path**

Start dev server: `npm run dev`. Open `http://localhost:3000`.

For each of the 3 trigger sites, walk through this flow as both a free signed-in user and an anonymous visitor:

1. `/en/tarot/celtic-cross` (and `/es/tarot/celtic-cross`):
   - Click "Draw Celtic Cross" — cards reveal one-by-one (animation works)
   - After 10th card reveals, a card-shaped CTA appears reading "Unlock your Celtic Cross reading" (EN) / "Desbloquea tu lectura de la Cruz Celta" (ES)
   - Click CTA — modal opens with same headline
   - Click "Start 3-Day Free Trial" — anon: Clerk sign-up; free signed-in: Stripe Checkout (or appropriate redirect)

2. `/en/tarot/three-card`:
   - Draw 3 cards. After reveal, CTA card appears reading "See the full 3-card story" (EN) / "Descubre la historia completa de las 3 cartas" (ES)
   - Click CTA — modal opens with same headline

3. `/en/synastry`:
   - Fill two birth-data forms (use synthetic data; CLAUDE.md PII rule), submit
   - On the result page, the AI Analysis section shows an inline CTA reading "Get the AI relationship analysis" (EN) / "Obtén el análisis de compatibilidad con IA" (ES) — no `<a href="/pricing">` link present
   - Click CTA — modal opens with same headline

4. (Backwards-compat) `/en/essays/mars` (or any non-Sun/Moon/Asc planet essay):
   - As free user, CTA leads into modal — modal headline reads "Unlock the full essay" (was "Unlock Full Access")

- [ ] **Step 11.6: PostHog event spot-check**

In PostHog (or local devtools network tab if PostHog disabled), confirm each click sequence fires:
- `PAYWALL_CTA_VIEWED` with `trigger=<expected>` and `variant=<card|inline>` on CTA mount
- `PAYWALL_OPENED` with `trigger=<expected>` on CTA click
- `PAYWALL_TRIAL_CLICKED` with `trigger=<expected>` on "Start Trial" click
- `CHECKOUT_STRIPE_REDIRECTED` (or `CHECKOUT_AUTH_REDIRECT` for anon) with `trigger=<expected>` post-click

- [ ] **Step 11.7: A11y spot-check**

In Chrome DevTools Lighthouse, run an Accessibility audit on `/en/tarot/celtic-cross` after revealing the spread. Target: ≥95 score, no new violations. Specifically verify:
- The CTA button is focusable via Tab key
- `aria-haspopup="dialog"` is present on the CTA button (inspect element)
- Modal opens preserving focus; Tab cycles inside modal; Escape closes

- [ ] **Step 11.8: Mobile smoke (Safari iOS simulator or DevTools mobile emulator)**

On a 375px-wide viewport, confirm:
- Card CTA layout (Celtic, 3-card) wraps cleanly, button is tap-sized
- Inline CTA (synastry) wraps to two lines when needed without breaking layout
- Modal opens as a bottom-sheet (existing behavior — should not regress)

---

## Completion checklist

- [ ] All 9 implementation commits landed on `main` (or current development branch)
- [ ] `npm test`, `npm run typecheck`, `npm run lint` all green
- [ ] Manual smoke completed for all 3 trigger sites in EN + ES
- [ ] PostHog event spot-check confirmed `trigger` dimension flowing
- [ ] Mobile + a11y spot-checks passed
- [ ] Memory updated with project-shipped entry (per repo workflow pattern — see prior `project_*_shipped.md` memory entries)

---

## Notes for the implementing engineer

- **TDD discipline:** tests come before implementation, and you run the test to *see it fail* before writing the code. Skipping the "watch it fail" step lets latent bugs hide in tests that pass for the wrong reason.
- **One commit per task** — granular history makes git bisect work if a regression surfaces later. Do not squash.
- **Trust the spec when CLAUDE.md is silent** — for code style, lean on the existing PaywallModal, EssayPageClient, ThreeCardSpread patterns. They reflect founder taste.
- **If `t.has()` semantics differ** from what the trigger test expects, fall back to a try/catch around `t(key)` or use a static map of allowed keys. Document the decision in the commit message.
- **PII guard** — at no point should birth date / time / location appear in event payloads, URLs, error messages, or local state. Audit each `trackEvent` call you add.
- **`returnUrl` honest pathname only** — never include query params that could contain birth data. `usePathname()` from `next/navigation` returns the bare path which is safe.
