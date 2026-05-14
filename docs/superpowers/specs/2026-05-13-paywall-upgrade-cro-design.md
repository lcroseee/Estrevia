# Paywall Upgrade CRO — Top-3 trigger coverage

**Date:** 2026-05-13
**Owner:** Kirill
**Status:** Design — pending implementation plan

## Problem

`PaywallModal` is a well-built component (focus trap, 3-day trial CTA, UTM-passthrough Stripe checkout, Clerk-aware sign-up bounce). It ships with **one call site** today — `EssayPageClient.tsx` for non-Sun/Moon/Asc essays.

Eight other gated features dead-end into one of three CRO leakage patterns:

| Feature | Current dead-end |
|---|---|
| Tarot Celtic Cross | Early return → `<Link href="/settings">` (wrong page) |
| Tarot 3-card spread | Early return → "Pro required" with no preview |
| Synastry AI analysis | `<a href="/pricing">` full-page navigation |
| Moon Calendar nav | Disabled buttons, no upgrade affordance |
| Planetary Hours date picker | Disabled, no affordance |
| Tree of Life personalization | Locked state, no affordance |
| Table 777 row cap | Silent truncation |
| Avatar Generator quota | `/pricing` full-page nav |

Result: every locked feature is a missed in-context upgrade moment. The components already capable of delivering conversion (PaywallModal + Stripe redirect chain) are under-deployed.

## Scope

**In:** value-then-block paywall on 3 top-leverage trigger sites:
1. Tarot Celtic Cross (`src/modules/esoteric/components/CelticCross.tsx`)
2. Tarot 3-card spread (`src/modules/esoteric/components/ThreeCardSpread.tsx`)
3. Synastry AI analysis (`src/modules/astro-engine/components/SynastryClient.tsx`)

**Out:**
- Remaining 5 gated features (Moon Calendar, Planetary Hours, Tree of Life, Table 777, Avatar) — follow-up after baseline funnel data.
- Multi-chart save paywall — requires building the multi-chart limit server-side first (not implemented; `/api/v1/chart/save` does not currently enforce tier limit despite settings UI text).
- A/B framework (PostHog feature flags for `$5.99 vs $9.99`, trial-vs-no-trial copy variants).
- JSON-LD pricing mismatch fix (`/pricing/page.tsx:69-79` shows `$4.99/$34.99`; business.md states `$9.99/$79.99` — separate spec).
- Cooldown / dismissal frequency rules — deferred until impression data shows annoyance signal.

## Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | **Approach A — inline state, shared `PaywallCta`** | 3 sites do not justify a `usePaywall()` hook or a `<PaywallGate>` HOC. YAGNI. |
| D2 | **Value-then-block** pattern (let user complete the free action first) | Aligns with paywall-upgrade-cro skill principle "value before ask"; matches existing EssayPageClient flow. |
| D3 | **Contextual headline + generic feature list** in PaywallModal | Contextual headline cheap to localize; full-context modals quadruple i18n surface for marginal lift. |
| D4 | **Server-side defence stays mandatory** | Client-side gate is CRO/UX only; business model integrity requires every paid endpoint to return 402 for free users. |
| D5 | **No feature flag** | Backwards-compatible, per-commit revertable. CLAUDE.md direct-to-main workflow. |
| D6 | **Trigger naming: kebab-case in code, camelCase in i18n keys** | Matches existing UTM/event conventions; i18n requires dot-safe segments. |

## Architecture

### File map

**New:**
```
src/shared/components/PaywallCta.tsx
src/shared/components/__tests__/PaywallCta.test.tsx
src/shared/types/paywall.ts
```

**Modified:**
```
src/shared/components/PaywallModal.tsx              # +triggerContext prop, contextual title
src/shared/lib/analytics.ts                         # +PAYWALL_CTA_VIEWED event, +trigger payload type
src/modules/esoteric/components/CelticCross.tsx     # lift draw logic out of !isPro
src/modules/esoteric/components/ThreeCardSpread.tsx # lift draw logic out of !isPro
src/modules/astro-engine/components/SynastryClient.tsx  # replace <a href="/pricing"> with PaywallCta
messages/en.json                                    # +paywall.contextualTitles.* + paywall.cta.*
messages/es.json                                    # same (LATAM neutro, tú form)
src/modules/esoteric/components/__tests__/CelticCross.test.tsx    # extend or add
src/modules/esoteric/components/__tests__/ThreeCardSpread.test.tsx # extend or add
src/modules/astro-engine/components/__tests__/SynastryClient.test.tsx # extend
```

### Module boundary

`PaywallCta` lives in `src/shared/components/`. Each module imports from `shared/` only — no `esoteric/` ↔ `astro-engine/` deps (per CLAUDE.md "no cross-module deps").

`PaywallTrigger` type lives in `src/shared/types/paywall.ts` (matches existing pattern of types in `src/shared/types/`).

## Components

### `PaywallTrigger` type

```ts
// src/shared/types/paywall.ts
export type PaywallTrigger =
  | 'essay'           // existing — EssayPageClient
  | 'celtic-cross'    // new
  | 'three-card'      // new
  | 'synastry-ai'     // new
  | 'generic';        // fallback (no trigger known)
```

### `PaywallCta` (new shared component)

**API:**
```tsx
interface PaywallCtaProps {
  trigger: PaywallTrigger;
  onClick: () => void;        // parent owns paywallOpen state
  variant?: 'card' | 'inline'; // default 'card'
}
```

**Why parent owns state:** Approach A (D1). Parent's `useState(false)` is cheap, and parent visibility into close events allows future re-engagement logic (e.g. trial-started toast) without component coupling.

**Variant `card` visual** (used for Celtic Cross, 3-card):
- Bordered card matching app's existing locked-state visuals (white/8 border, white/2.5 bg)
- Eyebrow: gold/60 micro-uppercase "Locked behind Star" (or localized equivalent)
- Title: serif (Crimson Pro), contextual per trigger
- Subline: 1-2 sentences explaining what's behind the gate
- CTA: gold-gradient button "Start 3-Day Free Trial" (reuses existing `paywall.trialCta`)
- Fine print: "Cancel anytime · No charge until {trialEndDate}" (reuses existing `paywall.noCharge` with date formatting from PaywallModal helper)

**Variant `inline`** (used for Synastry AI section):
- Compact horizontal layout fitting inside the existing `<section aria-labelledby="ai-analysis-heading">` slot
- Single-line title + short subline + button (no eyebrow, no fine print — already in modal)

**A11y:**
- `<button type="button">` with `aria-haspopup="dialog"`
- Focus styles match other CTAs in the app (white/30 ring on focus-visible)
- Existing PaywallModal already provides focus-trap + Escape-close (inherited)

**Tracking:**
- Fires `PAYWALL_CTA_VIEWED` event on mount via `IntersectionObserver`, fire-once-per-mount
- Event payload: `{ trigger, variant }`

### `PaywallModal` extension

**API change** (additive, backwards-compatible):
```tsx
interface PaywallModalProps {
  open: boolean;
  onClose: () => void;
  returnUrl?: string;
  triggerContext?: PaywallTrigger;  // NEW — optional, defaults to 'generic'
}
```

**Headline resolution:**
```tsx
const t = useTranslations('paywall');
const key = triggerContext && triggerContext !== 'generic'
  ? `contextualTitles.${toCamelCase(triggerContext)}`
  : 'title';
// next-intl 4.x supports t.has() — confirmed in package.json
const headline = t.has(key) ? t(key) : t('title');
```

Util `toCamelCase('celtic-cross')` → `'celticCross'`. Implement inline (no shared util needed for 4 conversions).

**Event extension:**
```tsx
useEffect(() => {
  if (open) {
    trackEvent(AnalyticsEvent.PAYWALL_OPENED, {
      trigger: triggerContext ?? 'generic',
      returnUrl: returnUrl ?? null,
    });
  }
}, [open, returnUrl, triggerContext]);

// In handleCheckout:
trackEvent(AnalyticsEvent.PAYWALL_TRIAL_CLICKED, {
  plan,
  trigger: triggerContext ?? 'generic',
  returnUrl: returnUrl ?? null,
});
trackEvent(AnalyticsEvent.CHECKOUT_AUTH_REDIRECT, {
  plan, returnUrl: target,
  trigger: triggerContext ?? 'generic',
});
trackEvent(AnalyticsEvent.CHECKOUT_STRIPE_REDIRECTED, {
  plan,
  trigger: triggerContext ?? 'generic',
});
```

What does NOT change: subtitle, feature list, plan toggle, pricing display, trial fine print, focus trap, Stripe redirect chain, Clerk auth-failure detection, sign-up bounce. The modal's CRO mechanics are sound.

## Per-trigger UX

### Celtic Cross

**Current state:** `CelticCross.tsx:111` — `if (!isPro) return <pro-required + /settings link>`. Zero value preview, wrong destination (`/settings` is not the upgrade page). Note: Pro user today has **no LLM interpretation step** — the value-add is purely "access to draw the spread". To make value-then-block work, we add the LLM interpretation step (cheap — see below).

**Target state:**
- Free user sees the full 10-card grid with sequential reveal animation (cards drawn, position labels visible)
- Free user can click any card → bottom-sheet shows card name, suit symbol, keywords (already in `cardData.keywords` and `cardData.description`)
- After all 10 cards reveal: if Pro → fire `postJson('/api/v1/tarot/interpret', { spreadType: 'celtic_cross', cards })` → render `interpretation` block (parallel to `ThreeCardSpread.tsx:235-249`)
- After all 10 cards reveal: if free → render `<PaywallCta trigger="celtic-cross" variant="card" onClick={openPaywall} />` in the same slot
- `<PaywallModal triggerContext="celtic-cross" />` in JSX

**Refactor:**
- Existing draw/shuffle/reveal logic lifts out of the `!isPro` early-return
- New: post-reveal Pro-only `useEffect` that fires the interpret call (mirror `ThreeCardSpread.tsx:86-130`)
- New: interpretation UI block (parallel to 3-card; reuse Crimson Pro serif body style)
- New i18n keys under `tarot.celticCross.*` for interpretation heading, error messages — pattern mirrored from existing 3-card keys

**Server-side reuse:**
- `/api/v1/tarot/interpret/route.ts` is already `spreadType`-agnostic — accepts any string + up to 15 cards (validated at line 13-18 in route.ts)
- Existing `requirePremium()` guard returns 402 for free users — server-side defence covered
- Existing rate-limit bucket `tarot/interpret` covers Celtic too (no new bucket needed)

**Optional polish (out of scope for this spec, candidate for follow-up):**
- Tailor the prompt for Celtic Cross specifically — the 10 positions (present, challenge, foundation, recent past, crown, near future, self, environment, hopes/fears, outcome) have classical Thoth meanings that a Celtic-Cross-aware prompt would handle better than the generic spreadType-based template. Add as a branch in `buildPrompt()` if quality of the generic prompt proves underwhelming during smoke test.

### Three-card Spread

**Current state:** `ThreeCardSpread.tsx:86` — `if (!isPro || drawnCards.length === 0) return` blocks API call. `ThreeCardSpread.tsx:134` — early return for whole component.

**Target state:**
- Free user draws 3 cards with position labels from `t('positions.*')` (Past/Present/Future)
- Card click → name + keywords (cardData already loaded)
- Under spread: `<PaywallCta trigger="three-card" variant="card" />`
- Pro flow unchanged: `setInterpretation(...)` API call runs only when `isPro`
- Guard change: `if (!isPro || drawnCards.length === 0) return` → `if (drawnCards.length === 0) return` (server still enforces 402)

### Synastry AI

**Current state:** Free user sees full synastry result (scores + aspects). AI Analysis section shows `<a href="/pricing">` full-page nav.

**Target state:**
- Free user sees synastry result unchanged
- AI Analysis section: `<PaywallCta trigger="synastry-ai" variant="inline" onClick={openPaywall} />`
- New `useState(false)` for `paywallOpen` in `SynastryClient`
- `<PaywallModal triggerContext="synastry-ai" />` mounted in component

### Server-side defence (verification, not new code)

The two paid endpoints already enforce premium server-side. Implementation plan must include a verification step:
- `/api/v1/tarot/interpret` returns 402 for free users (used by both Celtic Cross and 3-card spread; `requirePremium()` at route.ts:57)
- `/api/v1/synastry/[id]/analyze` returns 402 for free users

Defence-in-depth: client-side gate = UX/CRO; server-side gate = business model integrity. Never one without the other.

## Tracking

### Events

| Event | Status | Payload change |
|---|---|---|
| `PAYWALL_OPENED` | existing | +`trigger` dimension |
| `PAYWALL_TRIAL_CLICKED` | existing | +`trigger` dimension |
| `CHECKOUT_AUTH_REDIRECT` | existing | +`trigger` dimension |
| `CHECKOUT_STRIPE_REDIRECTED` | existing | +`trigger` dimension |
| `PAYWALL_CTA_VIEWED` | **new** | `{ trigger, variant }` |

### Funnel view (PostHog)

```
PAYWALL_CTA_VIEWED   (trigger=celtic-cross)
     ↓ impression → click rate
PAYWALL_OPENED       (trigger=celtic-cross)
     ↓ open → trial-click rate
PAYWALL_TRIAL_CLICKED (trigger=celtic-cross, plan=pro_annual)
     ↓ Stripe redirect rate
CHECKOUT_STRIPE_REDIRECTED → Stripe success → Pro user
```

Per-trigger view replaces today's flat `PAYWALL_OPENED` view that cannot distinguish call sites.

### Deferred

- `PAYWALL_DISMISSED` — add when impression data suggests dismissal is informative (currently no signal).
- `PAYWALL_FREQUENCY_CAPPED` — no cooldown logic in scope.

### PII guard

Per CLAUDE.md `PII = birth date/time/location`. Event payloads contain only `trigger`, `plan`, `variant`, `returnUrl` (pathname only). No birth data, no query params. Audit each `trackEvent` call as part of implementation review.

## i18n

### EN catalog (`messages/en.json`, `paywall` namespace)

```json
{
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
        "threeCard": "Get the LLM reading that ties past, present, and future together.",
        "synastryAi": "Get a detailed analysis of how your charts interact."
      },
      "ctaLabel": "Start 3-Day Free Trial"
    }
  }
}
```

### ES catalog (`messages/es.json`, LATAM neutro, `tú` form)

```json
{
  "paywall": {
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
}
```

### Constraints

- Sign names (Aries / Taurus / ...) untranslated — not used in this copy
- Planet names translated — not used in this copy
- LATAM diction: `tú` form (`desbloquea`, `obtén`), not Spain `vosotros` or formal `usted`

## Testing

### Unit (Vitest)

`src/shared/components/__tests__/PaywallCta.test.tsx`:
- Renders contextual headline per `trigger` prop (all 4 values)
- Calls `onClick` handler on button click
- Fires `PAYWALL_CTA_VIEWED` event on mount (mocked `IntersectionObserver`)
- Renders `variant='inline'` differently from `variant='card'` (asserts class / structure delta)
- i18n fallback: missing locale key → uses generic `paywall.title`

`src/shared/components/__tests__/PaywallModal.test.tsx` (extend existing):
- `triggerContext='celtic-cross'` → renders contextual headline
- Omitting `triggerContext` → renders generic `title` (backwards-compat for EssayPageClient)
- `PAYWALL_OPENED` event fires with `trigger` dimension
- `PAYWALL_TRIAL_CLICKED` event fires with `trigger` dimension

### Integration (Vitest + Testing Library)

- `CelticCross.test.tsx` — (a) free user: 10 cards visible + PaywallCta visible after reveal, no interpret call fired; (b) Pro user: 10 cards visible + interpret call fires, interpretation renders, no PaywallCta; (c) CTA click → modal open
- `ThreeCardSpread.test.tsx` — same pattern: free user 3 cards + PaywallCta, no interpret call; Pro user gets interpret call + result
- `SynastryClient.test.tsx` — free user: synastry result + inline PaywallCta in AI section; legacy `/pricing` link absent

### E2E (Playwright)

One spec covering the canonical conversion path:
- Sign in as test free account → `/tarot/celtic-cross` → draw cards (free) → assert CTA visible → click CTA → assert modal headline = "Unlock your Celtic Cross reading" → click "Start Trial" → assert redirect to Stripe Checkout (or Clerk sign-up if anon-test mode).

### Manual smoke

- EN + ES visual check of both `card` and `inline` variants
- Mobile viewport (Safari iOS) — modal bottom-sheet pattern already works in EssayPageClient
- Lighthouse a11y on `/tarot/celtic-cross` (target ≥95, no new violations)

## Rollout

Direct-to-main per CLAUDE.md workflow. Per-feature commits (matches repo conventions):

1. `feat(paywall/types): add PaywallTrigger union type`
2. `feat(paywall/cta): add PaywallCta shared component`
3. `feat(paywall/modal): support contextual triggerContext with i18n fallback`
4. `feat(analytics): add trigger dimension to paywall events + PAYWALL_CTA_VIEWED`
5. `feat(i18n/paywall): contextual titles + CTA copy en+es`
6. `feat(tarot/celtic): value-then-block paywall + LLM interpretation` (lift draw logic, add post-reveal interpret call for Pro users using existing `/api/v1/tarot/interpret` endpoint, PaywallCta for free users)
7. `feat(tarot/three-card): value-then-block paywall trigger`
8. `feat(synastry/ai): replace /pricing link with PaywallCta inline`

Each commit ships independent — bisectable if regression, independently revertable. No env flag (changes are backwards-compatible and trivially revertable per commit).

### Verification before "done"

- `npm test` — all unit + integration green
- `npm run typecheck` — zero errors
- `npm run lint` — zero errors
- Manual: load prod build → free account → each of 3 trigger sites → CTA → modal → trial click → checkout → Stripe → success → return → trigger sites show Pro state (no CTA, full interpretation/AI visible)

## Open implementation questions (for plan phase)

- Confirm `IntersectionObserver` polyfill not needed for jsdom test env (modern browsers support natively; check existing test setup in `vitest.setup.ts` / similar).
- Confirm next-intl `t.has()` semantics on partial namespace match (`contextualTitles.unknown` should return false, fall back to `title`). Verified next-intl version 4.x in `package.json`, but precise behavior on nested key lookup may need a small probe.
- Decide on exact card-keyword surface for free preview (full `keywords.upright` array vs single representative keyword) — driven by visual density on mobile. Current 3-card / Celtic per-card detail modal already shows full array, so the same UX is the default.
- Confirm `ThreeCardSpread.tsx:86` `if (!isPro || drawnCards.length === 0) return` rewrite preserves the "don't auto-fire interpret on empty draw" guard — the new condition should be `if (drawnCards.length === 0) return` with the Pro check moved into the outer effect's trigger condition.
- Smoke-test the generic Celtic Cross interpretation quality (using existing `spreadType`-agnostic prompt) before deciding whether to add the Celtic-Cross-specific prompt branch as a follow-up.
