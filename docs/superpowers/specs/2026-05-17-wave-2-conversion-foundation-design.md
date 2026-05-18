# Wave 2 — Conversion Foundation Design

**Date:** 2026-05-17
**Author:** Kirill (founder) + Claude (brainstorm)
**Status:** Spec (approved 2026-05-17; corrected 2026-05-17 with ground-truth paths)
**Parent roadmap:** `docs/superpowers/specs/2026-05-17-advertising-improvements-design.md`

> **Note (2026-05-17 correction pass):** Initial spec had ghost paths. Corrected after `grep`-verification of actual codebase. Lessons saved in memory `feedback_grep_callers_not_just_definitions`. Architecture unchanged; only file paths, symbol names, and integration approaches updated to match reality.

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

Lightweight client-side wrapper integrating with the project's existing `PostHogProvider` (which lazy-loads `posthog-js` after cookie consent). **The `posthog-js/react` package is NOT installed**; the project uses a custom `usePostHog()` hook from `@/shared/components/PostHogProvider` that returns `{ isInitialized }`. The PostHog SDK is exposed globally via `(window as { posthog?: ... }).posthog` once initialized. **Server-side feature-flag evaluation is explicitly out of scope** (no SSR experiments in Wave 2).

**1. Create `src/shared/hooks/useFeatureFlag.ts`:**

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

1. Returns `defaultValue` with `isLoading: true` when `usePostHog()` reports `isInitialized: false`.
2. Resolves to flag value with `isLoading: false` once `isInitialized: true` and `window.posthog` is available.
3. Falls back to `defaultValue` when `window.posthog.getFeatureFlag` returns `null` / `undefined`.
4. Re-renders to new value when the registered `onFeatureFlags` callback fires (simulates PostHog re-evaluation).
5. Returns `defaultValue` if `window.posthog` is missing even after `isInitialized: true` (defensive — cookie consent path edge case).

Mock `@/shared/components/PostHogProvider`'s `usePostHog` hook via `vi.mock`. Stub `window.posthog` with `{ getFeatureFlag, onFeatureFlags }` in a `beforeEach`. No real PostHog SDK in jsdom tests.

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

**Ground-truth notes:**
- Pricing page is split: `page.tsx` (server component) renders header + `<PricingToggle />` (client) + trust footer + FAQ.
- `PricingToggle.tsx` renders the monthly/annual toggle + both pricing cards + Pro CTA via `<PricingUpgradeButton />`.
- A `Save 42%` badge **already exists** on the Annual toggle button (small chip via `t('saveBadge')`). Actual savings: `$4.99 × 12 = $59.88` vs `$34.99/yr` = 42% off.
- Existing trust footer: `trustNoContracts` + `trustCancel` + `trustSecure` rendered as small text below cards.
- Existing 3-day free trial (`Start 3-Day Free Trial`) — distinct from 14-day money-back guarantee (which kicks in post-charge).

**4 specific edits split across `page.tsx`, `PricingToggle.tsx`, `messages/{en,es}.json`:**

**1. Annual savings anchoring — promote existing `saveBadge`** — Currently rendered as a small absolute-positioned chip on the Annual toggle button (`PricingToggle.tsx` line ~85). Add a **second, prominent display** below the price when Annual is selected:
- EN: "Save 42% — pay $34.99 once vs $59.88 monthly"
- ES: "Ahorra 42% — paga $34.99 una vez vs $59.88 mensual"
- New `pricing.saveBadgeLong` translation key.

**2. 14-day money-back guarantee block** — Below pricing cards, dedicated section in `page.tsx` (after `<PricingToggle />`, before trust footer):
- EN headline: "14-day money-back guarantee, no questions asked"
- ES headline: "Garantía de devolución de 14 días, sin preguntas"
- EN subcopy: "Try Pro risk-free. Full refund within 14 days. Just email us."
- ES subcopy: "Prueba Pro sin riesgo. Reembolso total en 14 días. Solo escríbenos."
- New translation keys: `pricing.guaranteeHeading`, `pricing.guaranteeSubcopy`.
- Icon: shield/check inline SVG (existing pricing page uses inline SVGs for atmosphere, no shadcn Icon import).

**3. Trust signals refresh** — Replace existing `trustItems` (`trustNoContracts`, `trustCancel`, `trustSecure`) with stronger Estrevia-specific signals. Keep the 3-item layout in `page.tsx` trust footer; just swap copy:
- EN: "Lahiri ayanamsa ±0.01° accuracy" / "Built by working astrologers" / "Cancel anytime"
- ES: "Precisión Lahiri ayanamsa ±0.01°" / "Hecho por astrólogos en activo" / "Cancela cuando quieras"
- Replace `trustNoContracts` + `trustSecure` with `trustLahiri` + `trustAstrologers`; keep `trustCancel`.

**4. Refined value prop hero** — Replace existing `pricing.heading` + `pricing.subheading`:
- EN heading: "Sidereal Vedic charts — Lahiri-accurate"
- EN subheading: "The way the ancient texts intended. Try Pro risk-free for 14 days."
- ES heading: "Cartas védicas siderales — precisión Lahiri"
- ES subheading: "Como los textos antiguos las querían. Prueba Pro sin riesgo por 14 días."

**i18n:** All new + replaced strings in `messages/en.json` and `messages/es.json` at repo root, under the `pricing` namespace. Founder reviews ES translation per español neutro LATAM, `tú` form, before deploy.

**Stripe-side:** No code changes to webhook or subscription logic. Refunds honored manually via Stripe dashboard.

### Tests

`src/app/[locale]/(marketing)/pricing/__tests__/PricingPage.test.tsx` (new):

- Renders new guarantee block (heading + subcopy in EN + ES) when locale is `en` / `es`.
- Renders refreshed trust footer items (Lahiri ±0.01° + astrologers + cancel).
- Renders refined heading + subheading copy.
- `axe-core` audit on rendered page — WCAG 2.1 AA compliant (no new violations vs current baseline).

`src/app/[locale]/(marketing)/pricing/__tests__/PricingToggle.test.tsx` (extend existing `PricingUpgradeButton.utm.test.tsx` patterns or add new):

- Annual mode displays the new long-form savings text (`saveBadgeLong`) below the price.
- Existing chip `saveBadge` still renders on Annual button.

Use `vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))` per existing pattern in `PricingUpgradeButton.utm.test.tsx:6`.

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

**2. Three new email templates (`src/emails/`):**

Mirror existing lead-email patterns (`LeadChartEmail.tsx`, `LeadMoonAscEmail.tsx`, `LeadPaywallTeaserEmail.tsx`): React-email components using `<EmailLayout>` + `<Button>` from `src/emails/components/`. Bilingual via `STRINGS = { en: {...}, es: {...} }`. Include unsubscribe footer.

- **`SaturnWeeklyEmail.tsx`** (T+7d):
  - Static template, founder-written content.
  - Body: weekly astrology angle (Saturn / Saturn return / Saturn-in-X). No personalization beyond locale.
  - Subject EN: "Your Saturn this week"
  - Subject ES: "Tu Saturno esta semana"
  - Props: `{ locale, unsubscribeUrl, chartUrl }`.

- **`MiniReadingEmail.tsx`** (T+14d):
  - Templated. Receives sign data as props from send function (which uses the existing `pickKeySigns(chart)` helper in `src/shared/lib/email.ts:296` to extract `sunSign` / `moonSign` / `ascSign` from a `ChartResult`).
  - Fills 3 keyword slots via `getSignKeywords(locale, sign, placement)` lookup against the static `SIGN_KEYWORDS` map.
  - Body template EN: "Your Sun in {sign} suggests {sunKeyword}. Your Moon in {sign} reveals {moonKeyword}. Your Ascendant in {sign} shapes how others see you: {ascKeyword}."
  - Body template ES: equivalent, español neutro LATAM, `tú` form.
  - Soft CTA at end: "See your full chart →" linking to user's chart page (`chartId` route, same pattern as `LeadChartEmail`).
  - Subject EN: "Your sidereal mini-reading"
  - Subject ES: "Tu mini-lectura sideral"
  - Props: `{ locale, sunSign, moonSign, ascSign, chartUrl, unsubscribeUrl }`.

- **`SynastryTeaserEmail.tsx`** (T+21d):
  - Static template, founder-written content.
  - Body: invites adding partner's birth data for free synastry reading.
  - Subject EN: "Want to see your compatibility?"
  - Subject ES: "¿Quieres ver tu compatibilidad?"
  - Props: `{ locale, unsubscribeUrl, synastryUrl }`.

**3. Email send functions in `src/shared/lib/email.ts`:**

Mirror existing lead-email functions (`sendLeadChartEmail`, `sendLeadMoonAscEmail`, `sendLeadPaywallTeaserEmail`):

- `sendLeadSaturnWeeklyEmail(params)` — uses `tryInsertOneShotLead(leadId, 'lead_saturn_weekly')`, `signLeadUnsubscribeToken`, builds chart URL with `utm_campaign=t7d`, throws on `result.error`, calls `recordSentLead`.
- `sendLeadMiniReadingEmail(params)` — same pattern + extracts signs via `pickKeySigns(chart)`, looks up keywords via `getSignKeywords`. `utm_campaign=t14d`.
- `sendLeadSynastryTeaserEmail(params)` — same pattern + synastry URL `utm_campaign=t21d`.

All three: `params: { leadId, email, locale, chart, chartId }`. Return `{ sent: boolean; reason?: string }`. Add new entries to `SUBJECTS` constant.

**4. Schema extension (`src/shared/lib/schema.ts`):**

Extend `sentLeadEmails.emailType` enum (TypeScript-only, no DB constraint) from `['lead_chart', 'lead_moon_asc', 'lead_paywall_teaser']` to add `'lead_saturn_weekly', 'lead_mini_reading', 'lead_synastry_teaser'`.

**5. Migration (`drizzle/0012_<descriptor>.sql`):**

Drop and recreate the partial index `email_leads_nurture_due_idx` to allow `nurture_step < 6` (currently `< 3`):
```sql
DROP INDEX "email_leads_nurture_due_idx";
CREATE INDEX "email_leads_nurture_due_idx" ON "email_leads" USING btree ("nurture_next_at") WHERE nurture_step < 6 AND converted_to_user_id IS NULL AND unsubscribed_at IS NULL AND email_undeliverable = false;
```
Also update the matching `where()` clause in `src/shared/lib/schema.ts:530-532`.

**6. Cron extension (`src/app/api/cron/lead-nurture/route.ts`):**

Existing cron is **hourly** (per file comment: "Vercel Cron — runs hourly at minute 0"). Extend state machine:
- Current: `nurture_step` 0 → 1 (T+24h queued) → 2 (T+72h queued) → 3 (done).
- New: 0 → 1 → 2 → 3 (T+7d queued, `+96h` after T+72h) → 4 (T+14d queued, `+168h`) → 5 (T+21d queued, `+168h`) → 6 (done).
- Add `T96_AFTER_T72_MS`, `T168_MS` constants (or compute inline).
- Add 3 new branches inside per-lead loop: `lead.nurtureStep === 3` → `sendLeadSaturnWeeklyEmail`; `=== 4` → `sendLeadMiniReadingEmail`; `=== 5` → `sendLeadSynastryTeaserEmail`.
- Final stage `=== 6` falls through to skipped.
- Update `lt(emailLeads.nurtureStep, 3)` filter to `lt(emailLeads.nurtureStep, 6)`.
- Idempotency, retry semantics, pacing, error isolation — unchanged (Sev1 fix `c94316f` already in place).

**7. Edge cases (must handle in `MiniReadingEmail` send-path):**

- **Birth time unknown (Asc is null):** T+14d falls back to 2-line template: "Your Sun in {sign}... Your Moon in {sign}..." Skip Asc line. Subject unchanged.
- **`fetchTempChart(chartId)` returns `null` (chart purged):** Skip T+14d for this lead (advance `nurture_step` to next, log warning). Lead still receives T+7d and T+21d (these don't depend on chart signs).
- **Unknown sign value (`pickKeySigns` returns invalid sign):** Skip T+14d as above. Sentry alert via existing `catch` in cron.

### Tests

- **`src/shared/lib/__tests__/chart-keywords.test.ts`** (unit): `getSignKeywords()` returns expected keyword for each sign+placement+locale combination.
- **`src/emails/__tests__/MiniReadingEmail.test.tsx`** (component): renders full 3-line template with Sun+Moon+Asc supplied; renders 2-line fallback when Asc is null.
- **`src/app/api/cron/lead-nurture/__tests__/route.test.ts`** (integration, extend existing test file):
  - Stage transitions: `nurture_step` advances `2 → 3` after T+72h teaser send with `nurture_next_at = +96h`; `3 → 4` after T+7d send with `+168h`; `4 → 5` after T+14d send with `+168h`; `5 → 6` final (`nurture_next_at = null`).
  - T+14d skips and advances stage when `fetchTempChart` returns null.
  - Failed Resend `result.error` triggers retry path (claim returns `'retry'`), step is NOT advanced (Sev1 regression).
- Mock Resend per existing pattern in `src/app/api/cron/lead-nurture/__tests__/route.test.ts`.

### Acceptance

- 72 keyword strings supplied by founder before deploy (T+14 won't render correctly without them; tests use synthetic placeholders to pass without founder content).
- T+7 + T+14 + T+21 verified rendering in Resend preview (`?preview` route in dev).
- T+14 renders user's actual chart signs for a test lead (uses `pickKeySigns` against a synthetic `ChartResult` fixture).
- T+14 fallback verified for Asc-null lead (no `houses` array in `ChartResult`).
- Cron stage transitions verified via integration tests.
- PII safety: chart data accessed only via `fetchTempChart(chartId)` inside send-job, never logged. The existing `console.error` and `Sentry.captureException` calls in the cron loop log only `leadId` (per existing pattern, verified at `src/app/api/cron/lead-nurture/route.ts:184-194`).

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

One new migration `drizzle/0012_<descriptor>.sql` — drop and recreate the partial index `email_leads_nurture_due_idx` to change `nurture_step < 3` to `nurture_step < 6`. Schema column `nurture_step` (integer, currently 0-3) does not need extension; integer column already supports values 0-6. No new columns added. `email_type` enum extension on `sent_lead_emails` is TypeScript-only (no DB constraint).

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
