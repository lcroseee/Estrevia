# Wave 2 — Conversion Foundation Design

**Date:** 2026-05-17
**Author:** Kirill (founder) + Claude (brainstorm)
**Status:** Spec (approved 2026-05-17)
**Parent roadmap:** `docs/superpowers/specs/2026-05-17-advertising-improvements-design.md`

---

## 1. Context

This spec details the **Top-3** Wave 2 items selected from the parent audit roadmap (12 items total).

**Top-3:**
- **L4-B** — A/B test infrastructure (PostHog feature flags wrapper)
- **L3-B** — Pricing page CRO (static improvements, no A/B variants for v1)
- **L2-B** — Nurture re-engagement (T+7d / T+14d / T+21d)

**Dropped from Top-3:** L5-A (customer research mechanisms) — founder bandwidth for daily reply commitment not committed.

**Scope mode:** Static + infrastructure only. No A/B variants run live in Wave 2; Wave 3 will layer experiments on top of L4-B once L3-B/L2-B have shipped and traffic accumulates for stat-sig sample sizes (current 22 leads/day × ~5% Lead→Pro best-case = ~1 sub/day; need ≥150 conv/variant per industry standard).

**Wave 1 state when this is written:** T1–T4 shipped to `main` via commits `2670c39..e5007a8`. T5 founder-async pending (smoke test + 2 dashboards + baseline doc). Wave 2 design is baseline-independent; priorities will not shift based on T5 data.

**Approach:** Mirror Wave 1 — single spec with 3 parallel-shippable sections. Parallel execution via 10-teammate Agent Team (~17-30 min wall-clock per ship wave, per recent Estrevia sprints).

**Parallelizable:** No dependency between the 3 items in "static + infra only" mode.

---

## 2. L4-B: A/B test infrastructure

### Problem

Wave 3 will need to run A/B tests on pricing copy, paywall variants, and email subject lines. Currently there is no infrastructure to plumb a PostHog feature flag into a React component cleanly. Without this foundation, every Wave 3 experiment would re-implement flag wiring from scratch.

### Change

Lightweight client-side `posthog-js` wrapper. **Server-side feature-flag evaluation is explicitly out of scope** (no SSR experiments in Wave 2; pricing page changes are static).

**1. Create `src/shared/hooks/useFeatureFlag.ts`:**

```ts
import { useEffect, useState } from 'react';
import { usePostHog } from 'posthog-js/react';

interface Loadable<T> {
  value: T;
  isLoading: boolean;
}

export function useFeatureFlag<T = boolean>(
  key: string,
  defaultValue: T
): Loadable<T> {
  const posthog = usePostHog();
  const [state, setState] = useState<Loadable<T>>({
    value: defaultValue,
    isLoading: true,
  });

  useEffect(() => {
    if (!posthog) return;
    const evaluate = () => {
      const flagValue = posthog.getFeatureFlag(key);
      const resolved = (flagValue ?? defaultValue) as T;
      setState({ value: resolved, isLoading: false });
    };
    evaluate();
    posthog.onFeatureFlags(evaluate);
  }, [posthog, key, defaultValue]);

  return state;
}
```

**2. Create `docs/posthog/feature-flags-guide.md`:**

- How to create a flag in PostHog UI (project `407908`).
- Boolean A/B (50/50) flag setup walkthrough.
- Hook usage example: `useFeatureFlag('experiment-key', false)`.
- QA override pattern: `?ph_flag_override=variant_a` query param (PostHog built-in).
- Sticky-assignment behavior (anonymous → identified continuity via `posthog-js` cookie).
- When NOT to use: server-side render (defer to future wave).
- Reference flag `wave2-demo-flag` (created in PostHog UI; not wrapped around production logic — pure docs example).

### Tests

`src/shared/hooks/__tests__/useFeatureFlag.test.ts`:

1. Renders with `defaultValue` initially (`isLoading: true`).
2. Resolves to flag value once PostHog evaluates (`isLoading: false`).
3. Falls back to `defaultValue` when PostHog returns `null` / `undefined`.
4. Sticky behavior: same key returns same value across re-renders.
5. Re-renders on `onFeatureFlags` callback fire.

Mock `posthog-js/react`'s `usePostHog` hook. No real PostHog SDK in jsdom tests.

### Acceptance

- Hook compiles, all unit tests pass.
- Docs include working example with screenshot from PostHog UI showing flag creation.
- Demo flag `wave2-demo-flag` exists in PostHog and can be toggled manually.
- Manual QA: `?ph_flag_override=variant_a` query param overrides flag value (PostHog default behavior).

### Effort

~1-2 days engineer.

---

## 3. L3-B: Pricing page CRO

### Problem

Current pricing page (`src/app/[locale]/(marketing)/pricing/page.tsx`) renders Monthly/Annual price toggle with no anchoring, guarantee, or trust signals. Industry data: adding money-back guarantee + clear anchoring lifts conversion 15-30%. At Estrevia's current 0 paying users, the operational cost of honoring refunds ≈ $0 expected.

### Change

Static improvements (no A/B variants for v1). Wave 3 will layer A/B on top via L4-B.

**4 specific edits to `src/app/[locale]/(marketing)/pricing/page.tsx`:**

**1. Annual savings anchoring** — Above the Annual price card:
- EN: badge "Save 33% with annual"
- ES: badge "Ahorra 33% anual"
- Computation: `Math.round((1 - annualMonthly / monthly) * 100)` (auto-derived; verify actual % against current Stripe prices before commit).

**2. 14-day money-back guarantee block** — Below pricing cards, dedicated section:
- EN headline: "14-day money-back guarantee, no questions asked"
- ES headline: "Garantía de devolución de 14 días, sin preguntas"
- EN subcopy: "Try Pro risk-free. Full refund within 14 days. Just email us."
- ES subcopy: "Prueba Pro sin riesgo. Reembolso total en 14 días. Solo escríbenos."
- Icon: shield/check via shadcn/ui Icon (existing).

**3. Trust signals block** — Above pricing cards, below value-prop hero:
- EN: "Lahiri ayanamsa ±0.01° accuracy" + "Built by working astrologers"
- ES: "Precisión Lahiri ayanamsa ±0.01°" + "Hecho por astrólogos en activo"
- 2-column or icon-row layout (founder picks at design review).

**4. Refined value prop hero** — Single sentence above-the-fold:
- EN: "Sidereal Vedic charts — Lahiri-accurate, the way the ancient texts intended."
- ES: "Cartas védicas siderales — precisión Lahiri, como los textos antiguos las querían."

**i18n:** All new strings in `src/i18n/messages/en/pricing.json` and `src/i18n/messages/es/pricing.json`. Founder reviews ES translation per español neutro LATAM, `tú` form, before deploy.

**Stripe-side:** No code changes to webhook or subscription logic. Refunds honored manually via Stripe dashboard.

### Tests

`src/app/[locale]/(marketing)/pricing/__tests__/`:

- Snapshot test: EN pricing page renders with 4 new elements.
- Snapshot test: ES pricing page renders with 4 new elements (LATAM neutro).
- A11y: `axe-core` audit on rendered page — WCAG 2.1 AA compliant.
- Unit: annual savings computation (`monthly=19, annual=160` → ~30%; verify exact % per actual Stripe prices).

### Acceptance

- Both EN and ES pricing pages render new elements correctly.
- Guarantee block visible without scrolling on desktop ≥1024px viewport.
- No a11y regressions per `axe-core` audit.
- Founder reviews ES copy; LATAM neutro / `tú` form verified.
- Stripe checkout flow unchanged (Wave 1 T5 founder smoke test still passes after L3-B deploy).

### Effort

~2-3 days engineer + ~2 hours founder copy review.

---

## 4. L2-B: Nurture re-engagement (T+7d / T+14d / T+21d)

### Problem

Current nurture pipeline ends at T+72h paywall teaser (commits `0ab4f89`, `30a1811`, `7c9e30f`). After that — silence. SaaS industry standard is 5-9 emails in first month; Estrevia ships 3. Pre-Sev1-fix Lead→User baseline was 5.9%. 5-9 email drip vs 3-email typically delivers 2-3× Lead→User uplift.

### Change

Extend lead-nurture pipeline with 3 new emails on schedule. T+14d auto-generates personalized mini-reading from user's `chart_data`; T+7d and T+21d are founder-written static templates.

**1. Static keyword map (`src/shared/lib/chart-keywords.ts`):**

```ts
export type SignKey =
  | 'aries' | 'taurus' | 'gemini' | 'cancer' | 'leo' | 'virgo'
  | 'libra' | 'scorpio' | 'sagittarius' | 'capricorn' | 'aquarius' | 'pisces';

export type Locale = 'en' | 'es';

export interface SignKeywords {
  sun: string;
  moon: string;
  asc: string;
}

export const SIGN_KEYWORDS: Record<Locale, Record<SignKey, SignKeywords>> = {
  en: {
    aries: { sun: 'pioneer', moon: 'fiery emotion', asc: 'forward-charging presence' },
    // ... 11 more signs
  },
  es: {
    aries: { sun: 'pionero', moon: 'emoción ardiente', asc: 'presencia frontal' },
    // ... 11 more signs
  },
};

export function getSignKeywords(
  locale: Locale,
  sign: SignKey,
  placement: keyof SignKeywords
): string {
  return SIGN_KEYWORDS[locale][sign][placement];
}
```

**Founder owns content:** 12 signs × 3 placements × 2 locales = **72 keyword strings** before deploy.

**2. Three new email templates (`src/modules/advertising/emails/`):**

- **`SaturnWeekly.tsx`** (T+7d):
  - Static template, founder-written content.
  - Body: weekly astrology angle (Saturn / Saturn return / Saturn-in-X). No personalization beyond first name.
  - Subject EN: "Your Saturn this week"
  - Subject ES: "Tu Saturno esta semana"

- **`MiniReading.tsx`** (T+14d):
  - Templated. Reads Sun/Moon/Asc signs from `email_leads.chart_data` (decrypted via existing PII encryption module at send-time, never logged).
  - Fills 3 keyword slots via `getSignKeywords(locale, sign, placement)`.
  - Body template EN: "Your Sun in {sign} suggests {sunKeyword}. Your Moon in {sign} reveals {moonKeyword}. Your Ascendant in {sign} shapes how others see you: {ascKeyword}."
  - Body template ES: equivalent, español neutro LATAM, `tú` form.
  - Soft CTA at end: "See your full chart →" linking to user's chart page.
  - Subject EN: "Your sidereal mini-reading"
  - Subject ES: "Tu mini-lectura sideral"

- **`SynastryTeaser.tsx`** (T+21d):
  - Static template, founder-written content.
  - Body: invites adding partner's birth data for free synastry reading.
  - Subject EN: "Want to see your compatibility?"
  - Subject ES: "¿Quieres ver tu compatibilidad?"

**3. Cron extension (`src/modules/advertising/lead-nurture/cron.ts`):**

- Extend `nurture_stage` enum transitions: existing `t0` / `t24h` / `t72h` → new `t7d` (168h after lead) / `t14d` (336h) / `t21d` (504h) / `done`.
- `nurture_stage` column already exists via Wave 1 migration `0011`.
- Failed sends retry per existing logic (Sev1 fix `c94316f` checks `result.error` before advancing stage).
- Cron schedule unchanged (existing every-5-min cron handles new stages via stage-current check).

**4. Edge cases (must handle):**

- **Birth time unknown (Asc is null):** T+14d falls back to 2-line template: "Your Sun in {sign}... Your Moon in {sign}..." Skip Asc line. Subject unchanged.
- **Decryption fails or chart_data missing:** Skip T+14d for this lead (advance `nurture_stage` to `t21d`, log warning). Lead still receives T+7d and T+21d.
- **Unknown sign value (e.g. malformed chart_data):** Skip T+14d as above. Sentry alert.

### Tests

`src/modules/advertising/lead-nurture/__tests__/`:

- Unit: `getSignKeywords()` returns expected keyword for each sign+placement+locale.
- Integration: T+14d email renders with fixture `chart_data` (synthetic per CLAUDE.md PII rules).
- Integration: T+14d falls back to 2-line template when Asc is null.
- Integration: T+14d skips and advances stage when chart_data missing or decryption fails.
- Integration: cron stage transitions advance `nurture_stage` `t72h` → `t7d` → `t14d` → `t21d` → `done` at correct time deltas.
- Integration (regression): failed Resend `result.error` triggers retry, not stage advance (Sev1 regression test).
- Mock Resend per existing pattern.

### Acceptance

- 72 keyword strings supplied by founder before deploy (T+14 won't render correctly without them).
- T+7 + T+14 + T+21 verified rendering in Resend preview.
- T+14 renders user's actual chart signs for a test lead (uses synthetic fixture).
- T+14 fallback verified for Asc-null lead.
- Cron stage transitions verified in test environment.
- PII safety: `chart_data` decrypted only inside send-job, never logged, never persisted in unencrypted form. Verified via test that asserts no decrypted PII in any log output.

### Effort

~3-5 days engineer + ~5 hours founder content (T+7 + T+21 email copy in EN + ES + 72 keyword strings).

---

## 5. Cross-cutting

### Quality bar

- TDD for all new code (Wave 1 pattern; CLAUDE.md zero-fail policy on payment + encryption paths).
- `npm test` + `npm run typecheck` + `npm run lint` clean before each commit.
- WCAG 2.1 AA on L3-B (a11y critical for pricing page).
- PII encryption preserved on L2-B (chart_data decrypted only at send-time, never logged).

### Migration

None — `email_leads.nurture_stage` column already exists via migration `0011` (Wave 1).

### Vercel / env

No new env vars needed. Reuses existing `RESEND_API_KEY`, `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`.

### Success criteria

- **L4-B:** `useFeatureFlag` hook exported + docs published. Demo flag `wave2-demo-flag` toggleable in PostHog UI and observable in browser.
- **L3-B:** Pricing page deployed with 4 new elements. EN + ES render correctly. `axe-core` audit clean. Stripe smoke test (Wave 1 T5) still passes.
- **L2-B:** Cron processes new stages on schedule. T+14d renders accurate sign keywords. Resend message IDs persisted in `email_leads` for each new email (per Sev1 fix pattern).

---

## 6. Out of scope (Wave 2)

- New astrology features (chart engine, spreads, house systems).
- A/B variants running live (Wave 3 task — needs traffic + L4-B foundation).
- L2-C nurture EN/ES + cold/hot segmentation (needs Resend `email.opened` webhook).
- L1-D Subscribe upgrade event (memory: deferred until ≥150 Subscribe events/week).
- L1-C geo expansion ES (operational Ads Manager work; no spec needed).
- L1-E AEO inbound instrumentation (deferred to Wave 2.5 / Wave 3).
- L4-C CAC + LTV tracking, L4-D per-creative ROI script (Wave 2.5).
- L5-A customer research mechanisms (dropped from Top-3 — founder bandwidth not committed).
- L5-D pricing test cycle (needs L4-B + traffic).
- Server-side feature-flag evaluation for SSR routes.
- New lead magnets (L2-D — Moon Sign PDF, mini-synastry, planetary hours).

---

## 7. Open questions (for founder)

1. Founder will provide **72 keyword strings** (12 signs × 3 placements × 2 locales) before deploy. Bandwidth for this in next ~1 week?
2. Founder will provide **T+7d (Saturn weekly) + T+21d (synastry teaser)** email body copy in EN + ES. Bandwidth for ~5h writing?
3. Founder will honor **14-day money-back guarantee refunds** via Stripe dashboard manually. Confirmed commitment?
4. Should T+14d soft CTA link target user's chart page or pricing page? (Default: chart page — softer; pricing better for conversion but matches existing T+72h CTA already.)

---

## 8. Wave 2 sequencing

1. Wave 1 T5 (founder async) closes → baseline doc + 2 dashboards live.
2. Wave 2 plan (via `superpowers:writing-plans` skill) defines task breakdown.
3. Wave 2 execution via `superpowers:subagent-driven-development` (10-teammate Agent Team).
4. Push to main, verify Vercel deploy, smoke test pricing page + nurture cron.
5. Wave 2 close: post-shipping baseline measurement after 2-4 weeks of nurture data.

---

## 9. References

- Parent audit roadmap: `docs/superpowers/specs/2026-05-17-advertising-improvements-design.md`
- Wave 1 spec: `docs/superpowers/specs/2026-05-17-wave-1-instrumentation-design.md`
- Wave 1 plan: `docs/superpowers/plans/2026-05-17-wave-1-instrumentation.md`
- Lead nurture (T+0 / T+24 / T+72): `docs/superpowers/specs/2026-05-17-lead-nurture-emails-design.md`
- Marketing psychology archetypes: `docs/superpowers/specs/2026-05-11-marketing-psychology-archetypes-design.md`
- PostHog feature flags: https://posthog.com/docs/feature-flags
