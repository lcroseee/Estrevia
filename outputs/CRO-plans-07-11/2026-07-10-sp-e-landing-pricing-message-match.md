# SP-E — Landing & Pricing Message-Match CRO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Landing first paint shows content (kill the above-fold `opacity:0` hydration gate), hero/pricing copy echoes the proven ad hooks without overclaiming, phantom "Star" tier is gone everywhere, the two dead paywall surfaces are reworked, and the proof section stops faking social proof — all before Meta re-spend.

**Architecture:** Copy + order + render-state surgery over existing code: `LandingAnimations.tsx` (base-state inversion), `(marketing)/page.tsx` hero, `PricingToggle.tsx`, `SynastryClient.tsx`, `EssayPageClient.tsx`, 3 teaser email templates, and both message files. One new docs note (`TESTIMONIALS.md`). No new services, no schema changes, no API changes. Spec: `docs/superpowers/specs/2026-07-10-sp-e-landing-pricing-message-match-design.md`.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript strict, next-intl (flat JSON messages at repo root), Tailwind 4, Vitest + Testing Library (jsdom), Playwright, @react-email/render.

## Global Constraints

- i18n message files live at `messages/en.json` and `messages/es.json` (repo root). Every new or changed key lands in BOTH files in the same task. ES copy = español neutro LATAM, `tú` form; sign names untranslated; planet names translated.
- **D1 invariant (fail-visible):** after Task 1, no CSS rule anywhere may set `opacity: 0` on `[data-animate]` elements outside a selector scoped under `[data-anims-armed]`. The failure mode of any animation bug must be "no animation", never "no content".
- **No NASA claims** in any page copy — never imply NASA endorsement (policy constraint `src/modules/advertising/creative-gen/templates/hooks-en.ts:201`). The "actual sky" echo lives in `heroSubtext`; the proof line cites Swiss Ephemeris only.
- JSON edits are surgical: change/add/remove only the named keys; do not reorder or reformat neighboring keys.
- `messages/*.json` line anchors within this plan shift after T2 inserts `landing.heroProof` (~line 788, both files) — later tasks (pricing :984-985, eyebrow :1048/:1051, essays :937) must locate keys by NAME.
- Tests: `npx vitest run <path>` for single files — **quote paths** containing `[locale]` / `(marketing)` (zsh globs them otherwise). Full gate = `npx vitest run` + `npm run typecheck` + `npm run lint` (lint: ignore `.claude/worktrees/**` noise). E2E: `npx playwright test tests/e2e/landing.spec.ts` (webServer auto-starts dev on :3000).
- Component tests need the `// @vitest-environment jsdom` pragma (vitest default env is node).
- Commit style: `fix(sp-e/T<n>): <what>` / `feat(...)` / `test(...)` / `chore(...)`.
- Out of scope, do NOT touch: `PaywallModal.tsx` (default-plan flip + portal are owned by the cro-phase0 plan), `pricing.trialEndNote` client-date quirk, ThreeCardSpread's silent no-op AI button, the `en_ref_nasa` Meta creative recut (relaunch runbook owns Meta-side work), `content/`.

---

### Task 1: LandingAnimations — render visible, animate on top (D1)

**Files:**
- Modify: `src/app/[locale]/(marketing)/LandingAnimations.tsx` (whole file — effect at lines 18–45, inline `<style>` at 50–106)
- Modify: `src/app/[locale]/(marketing)/page.tsx` (hero section lines 122–186: remove all 5 hero `data-animate` attributes)
- Test: `src/app/[locale]/(marketing)/__tests__/LandingAnimations.test.tsx` (new; dir exists — `LandingViewTracker.test.tsx` lives there)

**Interfaces:**
- Produces: `LandingAnimations({ children }: { children: ReactNode })` — signature unchanged. New behavior contract: base CSS state of `[data-animate]` is VISIBLE; the hidden pre-animation state applies only under `[data-anims-armed]`, which the effect sets on the wrapper `<div>` in the same synchronous block that calls `observer.observe()` (no paint in between). No `IntersectionObserver` ⇒ never armed ⇒ page fully visible.
- Consumes: nothing new. `NewFeatureCards.tsx:41,57` and page.tsx below-fold sections (`how`, `features`, `stats`, `faq`, `final-cta`) keep their `data-section`/`data-animate` attributes and keep animating as today. `HeroCalculator` uses its own `hc-*` keyframe classes (HeroCalculator.tsx:88–91) — unaffected by these selectors.

**Design (settled):** the hero exemption is done by REMOVING the hero elements' `data-animate` attributes (spec D1 allows "removed or excluded by selector"; removal is fail-visible by construction and needs no hero-specific CSS). The hero's staggered-delay CSS block (old lines 77–96) dies with it. `prefers-reduced-motion` and `<noscript>` escapes stay (noscript is now redundant belt-and-braces — kept per spec).

- [ ] **Step 1: Write the failing test**

```tsx
// src/app/[locale]/(marketing)/__tests__/LandingAnimations.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { LandingAnimations } from '../LandingAnimations';

function Fixture() {
  return (
    <section data-section="stats">
      <p data-animate="fade-up-0">stat copy</p>
    </section>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LandingAnimations — render-visible, animate-on-top (LAND-2)', () => {
  it('arms the hidden state only when IntersectionObserver exists, then reveals sections', () => {
    const observed: Element[] = [];
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        private cb: IntersectionObserverCallback;
        constructor(cb: IntersectionObserverCallback) {
          this.cb = cb;
        }
        observe(target: Element) {
          observed.push(target);
          this.cb(
            [{ isIntersecting: true, target } as IntersectionObserverEntry],
            this as unknown as IntersectionObserver,
          );
        }
        unobserve() {}
        disconnect() {}
      },
    );
    const { container } = render(
      <LandingAnimations>
        <Fixture />
      </LandingAnimations>,
    );
    expect(container.querySelector('[data-anims-armed]')).not.toBeNull();
    const section = container.querySelector('[data-section="stats"]');
    expect(section?.getAttribute('data-visible')).toBe('true');
    expect(observed).toHaveLength(1);
  });

  it('never arms when IntersectionObserver is unavailable — page stays in visible base state', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const { container } = render(
      <LandingAnimations>
        <Fixture />
      </LandingAnimations>,
    );
    expect(container.querySelector('[data-anims-armed]')).toBeNull();
  });

  it('injected CSS hides content ONLY under [data-anims-armed] (base state is visible)', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const { container } = render(
      <LandingAnimations>
        <Fixture />
      </LandingAnimations>,
    );
    const css = Array.from(container.querySelectorAll('style'))
      .map((s) => s.textContent ?? '')
      .join('\n');
    // The old base-hidden rule must be gone… (match a HIDDEN value only:
    // the new base block declares `transition-property: opacity, transform`
    // and the reduced-motion/noscript blocks set `opacity: 1 !important` —
    // none of those may trip this assertion.)
    expect(css).not.toMatch(/\[data-section\] \[data-animate\]\s*\{[^}]*opacity:\s*0/);
    // …and every rule block that sets opacity: 0 must be armed-scoped.
    const hiddenRules = css
      .split('}')
      .filter((rule) => /opacity:\s*0[;\s]/.test(rule));
    expect(hiddenRules.length).toBeGreaterThan(0);
    for (const rule of hiddenRules) {
      expect(rule).toContain('[data-anims-armed]');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/app/[locale]/(marketing)/__tests__/LandingAnimations.test.tsx"`
Expected: FAIL — no `[data-anims-armed]` element exists; the CSS assertion finds the old `[data-section] [data-animate] { opacity: 0 … }` base rule.

- [ ] **Step 3: Rewrite `LandingAnimations.tsx`**

Replace the whole file with:

```tsx
'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * LandingAnimations — scroll-triggered entrance animations.
 *
 * Render-visible, animate-on-top (CRO audit LAND-2): the base state of every
 * `[data-animate]` element is VISIBLE. The hidden pre-animation state applies
 * only under `[data-anims-armed]`, which this component sets on its wrapper in
 * the same synchronous block that starts observing — so slow or failed JS
 * (Meta in-app browsers) always paints a fully readable page. The failure
 * mode is "no animation", never "no content".
 *
 * The hero section is exempt entirely: its elements carry no `[data-animate]`
 * (removed in page.tsx), so the above-fold is content at first paint, always.
 *
 * All animation CSS lives in the inline <style> below — globals.css has no
 * `[data-animate]` rules. No JS animation library needed; framer-motion is
 * used only inside HeroCalculator where interactivity demands it.
 */
export function LandingAnimations({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    if (typeof IntersectionObserver === 'undefined') {
      // No observer — leave everything in the visible base state.
      return;
    }

    const sections = root.querySelectorAll<HTMLElement>('[data-section]');

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.setAttribute('data-visible', 'true');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: '0px 0px -48px 0px' }
    );

    // Arm the hidden state and observe in the same synchronous block — no
    // paint happens between these lines, and anything throwing BEFORE the
    // setAttribute leaves the page fully visible.
    root.setAttribute('data-anims-armed', 'true');
    sections.forEach((section) => observer.observe(section));

    return () => observer.disconnect();
  }, []);

  return (
    <>
      {/* Animation styles injected via a <style> tag so they live near the usage */}
      <style>{`
        /* Transition is always declared; the hidden state is opt-in via JS */
        [data-section] [data-animate] {
          transition-property: opacity, transform;
          transition-timing-function: cubic-bezier(0.22, 1, 0.36, 1);
          transition-duration: 0.6s;
        }

        /* Hidden pre-animation state — ONLY when armed and not yet revealed.
           Never widen this beyond [data-anims-armed]: base state must stay
           visible so slow-JS browsers get content, not a blank fold. */
        [data-anims-armed] [data-section]:not([data-visible="true"]) [data-animate] {
          opacity: 0;
          transform: translateY(20px);
        }
        [data-anims-armed] [data-section]:not([data-visible="true"]) [data-animate="fade-down"] {
          transform: translateY(-12px);
        }

        /* Staggered delays by animate index */
        [data-section] [data-animate="fade-down"] { transition-delay: 0ms; }
        [data-section] [data-animate="fade-up-0"] { transition-delay: 0ms;   }
        [data-section] [data-animate="fade-up-1"] { transition-delay: 80ms;  }
        [data-section] [data-animate="fade-up-2"] { transition-delay: 160ms; }
        [data-section] [data-animate="fade-up-3"] { transition-delay: 240ms; }
        [data-section] [data-animate="fade-up-4"] { transition-delay: 340ms; }

        /* Respect prefers-reduced-motion — show content instantly, no animation */
        @media (prefers-reduced-motion: reduce) {
          [data-section] [data-animate] {
            transition-duration: 0.01ms !important;
            transform: none !important;
            opacity: 1 !important;
          }
        }
      `}</style>

      {/* Belt-and-braces: with JS disabled the armed attribute is never set,
          so the base state is already visible — kept as an explicit escape. */}
      <noscript>
        <style>{`
          [data-section] [data-animate] {
            opacity: 1 !important;
            transform: none !important;
          }
        `}</style>
      </noscript>

      <div ref={ref}>{children}</div>
    </>
  );
}
```

- [ ] **Step 4: Remove the 5 hero `data-animate` attributes in `page.tsx`**

In `src/app/[locale]/(marketing)/page.tsx`, inside the hero section (lines 122–186), delete the `data-animate` line from each of these 5 elements (nothing else changes — classNames, styles, children stay):

1. Eyebrow div (line 141): delete `data-animate="fade-down"` — the div keeps only its className.
2. `<h1 id="hero-heading">` (line 152): delete `data-animate="fade-up-1"`.
3. Subtext `<p>` (line 162): delete `data-animate="fade-up-2"`.
4. Calculator card div (line 171): delete `data-animate="fade-up-3"`.
5. Trust line `<p>` (line 181): delete `data-animate="fade-up-4"`.

After the edit the eyebrow, subtext, and trust-line elements have a single-attribute JSX tag — collapse each to one line per file style, e.g. the trust line becomes:

```tsx
            {/* Trust line */}
            <p className="mt-5 text-xs text-white/60 tracking-wide">
              {t('heroTrust')}
            </p>
```

Keep `data-section="hero"` on the `<section>` itself (harmless — it merely gets `data-visible` stamped; no descendant matches the hidden selector anymore).

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run "src/app/[locale]/(marketing)/__tests__/LandingAnimations.test.tsx"`
Expected: PASS (3 tests)

- [ ] **Step 6: Grep guard — no hero `data-animate` and no unscoped hidden rule remain**

Run: `grep -n 'data-animate' "src/app/[locale]/(marketing)/page.tsx" | head -20`
Expected: matches only in the `how`/`features`/`stats`/`faq`/`final-cta` sections (first match at the `how` section, ~line 195); NONE between lines 122–186.

- [ ] **Step 7: Commit**

```bash
git add "src/app/[locale]/(marketing)/LandingAnimations.tsx" "src/app/[locale]/(marketing)/page.tsx" "src/app/[locale]/(marketing)/__tests__/LandingAnimations.test.tsx"
git commit -m "fix(sp-e/T1): LAND-2 — landing renders visible, animations armed on top; hero never hidden"
```

---

### Task 2: Hero message-match copy + proof line (D2)

**Files:**
- Modify: `messages/en.json` (landing block: `heroSubtext` line 787, `heroTrust` line 788, insert `heroProof` after `heroSubtext`)
- Modify: `messages/es.json` (same keys, same lines — landing block is line-parallel)
- Modify: `src/app/[locale]/(marketing)/page.tsx` (insert proof line between calculator card and trust line, ~line 177 after Task 1)
- Test: `src/i18n/__tests__/sp-e-message-match.test.ts` (new — grows across Tasks 3, 5, 7, 8, 9, 10)

**Interfaces:**
- Produces: i18n keys `landing.heroSubtext` (rewritten), `landing.heroTrust` (rewritten), `landing.heroProof` (new) in both locales; page renders `t('heroProof')` under the calculator card. The test file exports nothing; its `get(tree, path)` helper is local and repeated nowhere else.
- Consumes: `t = await getTranslations('landing')` already in scope (page.tsx:35).

- [ ] **Step 1: Write the failing test (creates the shared i18n test file)**

```ts
// src/i18n/__tests__/sp-e-message-match.test.ts
import { describe, it, expect } from 'vitest';
import enMessages from '../../../messages/en.json';
import esMessages from '../../../messages/es.json';

// Loose typing on purpose: this test asserts runtime JSON content, including
// keys that may not exist yet (TDD red phase) or must be ABSENT (retired keys).
type Tree = { [k: string]: Tree | string };
const en = enMessages as unknown as Tree;
const es = esMessages as unknown as Tree;

function get(tree: Tree, path: string): string | undefined {
  let node: Tree | string | undefined = tree;
  for (const part of path.split('.')) {
    if (typeof node !== 'object' || node === undefined) return undefined;
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
}

describe('SP-E hero copy (D2)', () => {
  it('heroSubtext leads with the 24° hook in both locales', () => {
    expect(get(en, 'landing.heroSubtext')?.startsWith('Western horoscopes are off by 24°')).toBe(true);
    expect(get(es, 'landing.heroSubtext')?.startsWith('Los horóscopos occidentales están desviados 24°')).toBe(true);
  });

  it('heroProof exists in both locales, cites Swiss Ephemeris, never NASA', () => {
    expect(get(en, 'landing.heroProof')).toContain('Swiss Ephemeris');
    expect(get(es, 'landing.heroProof')).toContain('Swiss Ephemeris');
    expect(get(en, 'landing.heroProof')).not.toMatch(/NASA/i);
    expect(get(es, 'landing.heroProof')).not.toMatch(/NASA/i);
  });

  it('heroTrust no longer contradicts the email gate ("no account needed" is gone)', () => {
    expect(get(en, 'landing.heroTrust')).not.toMatch(/account/i);
    expect(get(es, 'landing.heroTrust')).not.toMatch(/cuenta/i);
    expect(get(en, 'landing.heroTrust')).toContain('No credit card');
    expect(get(es, 'landing.heroTrust')).toContain('Sin tarjeta de crédito');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/i18n/__tests__/sp-e-message-match.test.ts`
Expected: FAIL — `heroSubtext` starts with "Western astrology froze…"; `heroProof` is `undefined`; `heroTrust` contains "No account needed".

- [ ] **Step 3: Edit `messages/en.json` (landing block, lines 787–788)**

Replace the two values and insert `heroProof` between them:

```json
    "heroSubtext": "Western horoscopes are off by 24°. The sky has drifted since the zodiac was frozen in 100 AD — sidereal astrology reads the constellations as they actually are tonight. Most people's real Sun sign is different.",
    "heroProof": "Positions computed from Swiss Ephemeris — the professional standard, accurate to ±0.01°.",
    "heroTrust": "Free · No credit card · Under 60 seconds",
```

- [ ] **Step 4: Edit `messages/es.json` (same keys, same position)**

```json
    "heroSubtext": "Los horóscopos occidentales están desviados 24°. El cielo se ha desplazado desde que el zodíaco se congeló en el año 100 d.C. — la astrología sideral lee las constelaciones tal como están esta noche. El verdadero signo solar de la mayoría de las personas es otro.",
    "heroProof": "Posiciones calculadas con Swiss Ephemeris — el estándar profesional, con precisión de ±0,01°.",
    "heroTrust": "Gratis · Sin tarjeta de crédito · En menos de 60 segundos",
```

- [ ] **Step 5: Render the proof line in `page.tsx`**

After Task 1, the calculator card + trust line block reads (roughly lines 167–182). Replace the trust-line block so proof sits between calculator and trust:

```tsx
            {/* Proof line — echoes the "actual sky" hook with the honest claim
                (Swiss Ephemeris, not NASA — see hooks-en.ts policy). */}
            <p className="mt-5 text-xs text-white/45 tracking-wide">
              {t('heroProof')}
            </p>

            {/* Trust line */}
            <p className="mt-3 text-xs text-white/60 tracking-wide">
              {t('heroTrust')}
            </p>
```

(The trust line's `mt-5` becomes `mt-3` because the proof line now carries the gap from the calculator card.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/i18n/__tests__/sp-e-message-match.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 7: Commit**

```bash
git add messages/en.json messages/es.json "src/app/[locale]/(marketing)/page.tsx" src/i18n/__tests__/sp-e-message-match.test.ts
git commit -m "feat(sp-e/T2): hero echoes 24°/actual-sky hooks + Swiss Ephemeris proof line; trust line stops contradicting the gate"
```

---

### Task 3: Proof-section reframe + testimonials trigger note (D7)

**Files:**
- Modify: `messages/en.json` (`landing.statsHeading` line 809)
- Modify: `messages/es.json` (`landing.statsHeading` line 809)
- Create: `docs/superpowers/specs/TESTIMONIALS.md`
- Test: `src/i18n/__tests__/sp-e-message-match.test.ts` (extend)

**Interfaces:**
- Produces: honest method-trust heading over the (unchanged) spec-number stat tiles; a written unlock trigger for real testimonials. `statsSubtitle` and `stat1..3*` keys stay exactly as they are.

- [ ] **Step 1: Write the failing test**

Append to `src/i18n/__tests__/sp-e-message-match.test.ts`:

```ts
describe('SP-E proof reframe (D7)', () => {
  it('statsHeading drops the unearned "Join astrologers" social frame in both locales', () => {
    expect(get(en, 'landing.statsHeading')).toBe('Built on the ephemeris professional astrologers trust');
    expect(get(es, 'landing.statsHeading')).toBe('Construido sobre las efemérides en las que confían los astrólogos profesionales');
    expect(get(en, 'landing.statsHeading')).not.toMatch(/join/i);
    expect(get(es, 'landing.statsHeading')).not.toMatch(/únete/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/i18n/__tests__/sp-e-message-match.test.ts`
Expected: FAIL — both headings still say "Join astrologers…" / "Únete a astrólogos…".

- [ ] **Step 3: Edit both message files**

`messages/en.json` line 809:

```json
    "statsHeading": "Built on the ephemeris professional astrologers trust",
```

`messages/es.json` line 809:

```json
    "statsHeading": "Construido sobre las efemérides en las que confían los astrólogos profesionales",
```

- [ ] **Step 4: Create the testimonials trigger note**

```md
<!-- docs/superpowers/specs/TESTIMONIALS.md -->
# Testimonials — trigger for real social proof (SP-E D7)

**Status:** deferred — do not build yet.

**Decision (CRO audit 2026-07-10, SP-E design D7 / roadmap D1):** Estrevia has
~1 retained payer. All landing "social proof" was spec numbers restyled; the
"Join astrologers…" frame was removed in SP-E T3 and replaced with a
method-trust heading. No testimonials may be fabricated, paraphrased, or
implied until real ones exist.

**Unlock trigger:** ≥10 retained payers (past their first renewal, not refunded).

**Then build:**
1. In-app ask: post-reading toast + settings prompt for a 1–2 sentence quote (both locales).
2. Founder curates quotes with explicit permission — first name + sign only, no PII.
3. A curated-quotes component on landing + pricing augments the stats strip.

**Until then:** the stats section stays honest spec numbers under
"Built on the ephemeris professional astrologers trust".
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/i18n/__tests__/sp-e-message-match.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add messages/en.json messages/es.json docs/superpowers/specs/TESTIMONIALS.md src/i18n/__tests__/sp-e-message-match.test.ts
git commit -m "fix(sp-e/T3): D7 — method-trust stats heading replaces fake social frame; testimonials trigger documented"
```

---

### Task 4: Landing E2E — first paint + message match

**Files:**
- Modify: `tests/e2e/landing.spec.ts` (append a new describe; existing describes untouched)

**Interfaces:**
- Consumes: hero DOM contract — `#hero-heading` (page.tsx:149), subtext copy from Task 2, `data-section="hero"`. Playwright config: baseURL `http://localhost:3000`, webServer auto-start, workers=1.
- Produces: regression proof that (a) the hero is content at first paint even with zero JS, and (b) the ad hooks are echoed on `/`.

- [ ] **Step 1: Append the tests**

Add to the end of `tests/e2e/landing.spec.ts`:

```ts
test.describe('Landing first paint + message match (SP-E)', () => {
  // Worst-case proxy for slow-JS Meta in-app browsers: with JS disabled the
  // arming attribute is never set, so the base (visible) state must show
  // everything. LAND-2 regression: this used to render the whole fold at
  // opacity: 0 until hydration.
  test.describe('with JavaScript disabled', () => {
    test.use({ javaScriptEnabled: false });

    test('hero H1 and subtext are fully visible — no animation gate', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');
      const h1 = page.locator('#hero-heading');
      await expect(h1).toBeVisible();
      expect(await h1.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
      const subtext = page.getByText(/off by 24°/);
      await expect(subtext).toBeVisible();
      expect(await subtext.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
    });
  });

  test('hero paints visible at domcontentloaded with JS enabled', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const h1 = page.locator('#hero-heading');
    await expect(h1).toBeVisible();
    // Hero elements carry no data-animate — computed opacity must be 1
    // regardless of hydration timing (no race in this assertion).
    expect(await h1.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
  });

  test('hero echoes the proven hooks and the honest trust line', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByText(/off by 24°/)).toBeVisible();
    await expect(page.getByText(/professional standard/)).toBeVisible();
    await expect(page.getByText(/No credit card/)).toBeVisible();
    await expect(page.getByText(/No account needed/)).toHaveCount(0);
  });
});
```

- [ ] **Step 2: Run the spec**

Run: `npx playwright test tests/e2e/landing.spec.ts`
Expected: PASS (existing tests + 3 new). Sanity-check the regression detection by reconstructing the pre-T1 failure mode — all three edits are needed because after T1 the hero carries no `data-animate` and the `<noscript>` escape would mask the breakage under `javaScriptEnabled: false`:

1. Temporarily re-add `data-animate="fade-up-2"` to the hero subtext `<p>` in `page.tsx`.
2. Temporarily change the armed hidden selector in `LandingAnimations.tsx` to the unarmed form `[data-section]:not([data-visible="true"]) [data-animate]` (drop the `[data-anims-armed]` prefix).
3. Temporarily delete the `<noscript>` style block in `LandingAnimations.tsx`.

Re-run the spec; expect the JS-disabled test to FAIL on the subtext opacity assertion. Then restore all three edits and confirm the spec is green again. Note: T1's armed-scope CSS unit test (LandingAnimations.test.tsx test 3) is the primary regression guard for this invariant; this e2e is a smoke layer on top of it.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/landing.spec.ts
git commit -m "test(sp-e/T4): e2e — hero visible pre-hydration/no-JS + hook message-match on /"
```

---

### Task 5: Pricing H1 + subheading copy (D3 copy)

**Files:**
- Modify: `messages/en.json` (`pricing.heading` line 984, `pricing.subheading` line 985)
- Modify: `messages/es.json` (same keys — `"Cartas védicas siderales — precisión Lahiri"` / `"Como los textos antiguos las querían. Prueba Pro sin riesgo por 14 días."`)
- Test: `src/i18n/__tests__/sp-e-message-match.test.ts` (extend)

**Interfaces:**
- Produces: benefit-led H1 (rendered at `pricing/page.tsx:116-121` via `t('heading')`) and a subheading that makes the 3-day-trial vs 14-day-guarantee relationship explicit. `guaranteeHeading`/`guaranteeSubcopy` (en.json:987–988) keep their wording — the guarantee block stays as-is. The Lahiri jargon already lives in `pricing.trustLahiri` — nothing to add there; the "move" is deletion from the H1.

- [ ] **Step 1: Write the failing test**

Append to `src/i18n/__tests__/sp-e-message-match.test.ts`:

```ts
describe('SP-E pricing message-match (D3 copy)', () => {
  it('H1 is benefit-led and jargon-free in both locales', () => {
    expect(get(en, 'pricing.heading')).toBe('See your true sidereal chart');
    expect(get(es, 'pricing.heading')).toBe('Mira tu verdadera carta sideral');
    expect(get(en, 'pricing.heading')).not.toMatch(/Lahiri|Vedic/i);
    expect(get(es, 'pricing.heading')).not.toMatch(/Lahiri|védic/i);
  });

  it('subheading resolves the 14-day vs 3-day collision explicitly', () => {
    expect(get(en, 'pricing.subheading')).toBe('Three days free, cancel anytime. 14-day money-back guarantee if you stay.');
    expect(get(es, 'pricing.subheading')).toBe('Tres días gratis, cancela cuando quieras. Garantía de devolución de 14 días si te quedas.');
  });

  it('guarantee block wording is untouched', () => {
    expect(get(en, 'pricing.guaranteeHeading')).toBe('14-day money-back guarantee, no questions asked');
    expect(get(es, 'pricing.guaranteeHeading')).toBe('Garantía de devolución de 14 días, sin preguntas');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/i18n/__tests__/sp-e-message-match.test.ts`
Expected: FAIL — heading is still "Sidereal Vedic charts — Lahiri-accurate" (the guarantee assertion passes; it's a pin, not a change).

- [ ] **Step 3: Edit both message files**

`messages/en.json` lines 984–985:

```json
    "heading": "See your true sidereal chart",
    "subheading": "Three days free, cancel anytime. 14-day money-back guarantee if you stay.",
```

`messages/es.json` (same two keys in the pricing block):

```json
    "heading": "Mira tu verdadera carta sideral",
    "subheading": "Tres días gratis, cancela cuando quieras. Garantía de devolución de 14 días si te quedas.",
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/i18n/__tests__/sp-e-message-match.test.ts`
Expected: PASS. Also run the pricing page component test (it asserts keys, not values — must stay green):
`npx vitest run "src/app/[locale]/(marketing)/pricing/__tests__/PricingPage.test.tsx"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add messages/en.json messages/es.json src/i18n/__tests__/sp-e-message-match.test.ts
git commit -m "fix(sp-e/T5): D3 — benefit-led pricing H1 + trial/guarantee relationship made explicit, both locales"
```

---

### Task 6: PricingToggle — monthly default + Pro-first on mobile (D3 behavior)

**Files:**
- Modify: `src/app/[locale]/(marketing)/pricing/PricingToggle.tsx` (state line 36; Free card div lines 105–108; Pro card div lines 147–150)
- Test: `src/app/[locale]/(marketing)/pricing/__tests__/PricingToggle.test.tsx` (rewrite — its first test encodes the annual default)
- Test: `src/app/[locale]/(marketing)/pricing/__tests__/PricingToggle.currencyBadge.test.tsx` (first two tests encode the annual default — update)

**Interfaces:**
- Consumes: `PricingUpgradeButton({ plan })` (mocked in tests); `plan = billing === 'monthly' ? 'pro_monthly' : 'pro_annual'` derivation (line 38) is untouched.
- Produces: default `billing = 'monthly'` (audit: annual trials 0/6 converted vs monthly 4/9); source order unchanged (Free JSX first) but `order-*` utilities put Pro first in the mobile single column and keep Free-left/Pro-right on `md:`.

- [ ] **Step 1: Rewrite `PricingToggle.test.tsx`**

```tsx
// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PricingToggle } from '../PricingToggle';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, vars?: Record<string, unknown>) =>
    vars ? `${key}:${JSON.stringify(vars)}` : key,
  useLocale: () => 'en',
}));

// Capture the plan prop — the monthly default must reach the checkout button.
const upgradeProps = vi.hoisted(() => ({ plan: undefined as string | undefined }));
vi.mock('../PricingUpgradeButton', () => ({
  PricingUpgradeButton: ({ plan }: { plan: string }) => {
    upgradeProps.plan = plan;
    return <button>upgrade-stub</button>;
  },
}));

beforeEach(() => {
  upgradeProps.plan = undefined;
});

describe('PricingToggle', () => {
  it('defaults to Monthly billing (SP-E D3: annual trials 0/6 converted vs monthly 4/9)', () => {
    render(<PricingToggle />);
    expect(screen.getByRole('radio', { name: 'monthly' }).getAttribute('aria-checked')).toBe('true');
    expect(upgradeProps.plan).toBe('pro_monthly');
    expect(screen.queryByText('saveBadgeLong')).toBeNull();
  });

  it('shows the long-form savings text when Annual is selected', () => {
    render(<PricingToggle />);
    fireEvent.click(screen.getByRole('radio', { name: /annual/ }));
    expect(screen.getByText('saveBadgeLong')).not.toBeNull();
    expect(upgradeProps.plan).toBe('pro_annual');
  });

  it('hides the long-form savings text when Monthly is re-selected', () => {
    render(<PricingToggle />);
    fireEvent.click(screen.getByRole('radio', { name: /annual/ }));
    fireEvent.click(screen.getByRole('radio', { name: 'monthly' }));
    expect(screen.queryByText('saveBadgeLong')).toBeNull();
  });

  it('still renders the existing saveBadge chip on the Annual button', () => {
    render(<PricingToggle />);
    expect(screen.getByText('saveBadge')).not.toBeNull();
  });

  it('orders Pro before Free on mobile, Free-left on desktop (order utilities)', () => {
    render(<PricingToggle />);
    const freeCard = screen.getByText('freeTitle').closest('.rounded-2xl');
    const proCard = screen.getByText('proTitle').closest('.rounded-2xl');
    expect(freeCard?.className).toContain('order-2 md:order-1');
    expect(proCard?.className).toContain('order-1 md:order-2');
  });
});
```

- [ ] **Step 2: Update `PricingToggle.currencyBadge.test.tsx`**

Replace its first two tests (which assume the annual default; the third `locale=en` test stays as-is):

```tsx
  it('renders monthly equiv badge when locale=es (default toggle is monthly)', () => {
    mockLocale.mockReturnValue('es');
    render(<PricingToggle />);
    // Mock returns the i18n key as literal text — assert the key, not the resolved value.
    expect(screen.getByText('monthlyPriceEquiv')).not.toBeNull();
  });

  it('switches to annual equiv badge when toggle=annual', () => {
    mockLocale.mockReturnValue('es');
    render(<PricingToggle />);
    fireEvent.click(screen.getByRole('radio', { name: /annual/ }));
    expect(screen.getByText('annualPriceEquiv')).not.toBeNull();
    expect(screen.queryByText('monthlyPriceEquiv')).toBeNull();
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run "src/app/[locale]/(marketing)/pricing/__tests__/PricingToggle.test.tsx" "src/app/[locale]/(marketing)/pricing/__tests__/PricingToggle.currencyBadge.test.tsx"`
Expected: FAIL — monthly radio is not `aria-checked=true` (annual is), `upgradeProps.plan` is `pro_annual`, order classes missing, monthly equiv badge absent by default.

- [ ] **Step 4: Implement in `PricingToggle.tsx`**

1. Line 36 — default billing:

```tsx
  // Monthly preselected: annual-first trials converted 0/6 vs 4/9 monthly
  // (CRO audit 2026-07-10, P2 pricing batch). Matches Phase 0's modal flip.
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly');
```

2. Free card wrapper div (lines 105–108) — append order utilities:

```tsx
        {/* Free tier — second in the mobile column (Pro CTA must be in viewport 1),
            left on desktop */}
        <div
          className="flex flex-col rounded-2xl border border-white/8 p-8 order-2 md:order-1"
          style={{ background: 'rgba(255,255,255,0.02)' }}
        >
```

3. Pro card wrapper div (lines 147–150) — append order utilities:

```tsx
        {/* Pro tier — first in the mobile column, right on desktop */}
        <div
          className="flex flex-col rounded-2xl border border-[#FFD700]/25 p-8 relative overflow-hidden order-1 md:order-2"
          style={{ background: 'rgba(255,215,0,0.03)' }}
        >
```

(The existing `{/* Free tier */}` / `{/* Pro tier */}` comments are replaced by the ones above. Source order stays Free-then-Pro; only CSS order changes.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run "src/app/[locale]/(marketing)/pricing/__tests__/"`
Expected: PASS (all pricing test files — including `PricingPage.test.tsx`, `PricingUpgradeButton.anon.test.tsx`, `PricingUpgradeButton.utm.test.tsx` unaffected)

- [ ] **Step 6: Commit**

```bash
git add "src/app/[locale]/(marketing)/pricing/PricingToggle.tsx" "src/app/[locale]/(marketing)/pricing/__tests__/PricingToggle.test.tsx" "src/app/[locale]/(marketing)/pricing/__tests__/PricingToggle.currencyBadge.test.tsx"
git commit -m "fix(sp-e/T6): D3 — monthly billing default + Pro card first on mobile (order utilities)"
```

---

### Task 7: Phantom "Star" tier → "Included in Pro" everywhere (D4)

**Files:**
- Modify: `messages/en.json` (`paywall.cta.eyebrow` line 1048)
- Modify: `messages/es.json` (`paywall.cta.eyebrow` line 1051)
- Modify: `src/emails/LeadPaywallTeaserEmail.tsx` (lines 16, 29)
- Modify: `src/emails/LeadPaywallTeaserBEmail.tsx` (lines 32, 50)
- Modify: `src/emails/LeadPaywallTeaserCEmail.tsx` (lines 36, 55)
- Modify: `src/emails/DiscountLaunchEmail.tsx` (lines 30, 41 — offer line names "Star")
- Test: `src/emails/__tests__/LeadPaywallTeaserEyebrow.test.tsx` (new)
- Test: `src/i18n/__tests__/sp-e-message-match.test.ts` (extend)

**Interfaces:**
- Consumes: `PaywallCta.tsx:63` reads `t('cta.eyebrow')` and renders it ONLY in the card variant (lines 105–107) — shown on `ChartReadingSection`, `ThreeCardSpread`, `CelticCross` (and synastry after Task 8). Email templates use inline `STRINGS = { en: {...}, es: {...} }` (house pattern) — no i18n runtime.
- Produces: "Star" appears nowhere user-visible; eyebrow = EN "Included in Pro" / ES "Incluido en Pro" in web + all 3 teaser emails; `DiscountLaunchEmail` offer line says "…first month of Pro." / "…tu primer mes de Pro."

- [ ] **Step 1: Write the failing tests**

Email test (all three templates render without env vars — `EmailLayout` only throws when `unsubscribeUrl` is passed, and these templates don't pass it):

```tsx
// src/emails/__tests__/LeadPaywallTeaserEyebrow.test.tsx
import { describe, it, expect } from 'vitest';
import { render } from '@react-email/render';
import LeadPaywallTeaserEmail from '../LeadPaywallTeaserEmail';
import LeadPaywallTeaserBEmail from '../LeadPaywallTeaserBEmail';
import LeadPaywallTeaserCEmail from '../LeadPaywallTeaserCEmail';

const base = {
  sunSign: 'Aries',
  moonSign: 'Taurus',
  ascSign: null,
  trialUrl: 'https://estrevia.app/pricing?utm_source=email',
};
const personalized = {
  ...base,
  dominantPlanet: 'Saturn',
  dominantSign: 'Capricorn',
  dominantHouse: 10,
  dominantPlanetEs: 'Saturno',
};

const CASES = [
  ['en', 'Included in Pro'],
  ['es', 'Incluido en Pro'],
] as const;

describe('paywall teaser emails — phantom "Star" tier removed (SP-E D4)', () => {
  it.each(CASES)('variant A (%s) eyebrow says "%s", never Star', async (locale, eyebrow) => {
    const html = await render(LeadPaywallTeaserEmail({ locale, ...base }));
    expect(html).toContain(eyebrow);
    // \bStar\b: "Start …" must not trip this, the tier name must.
    expect(html).not.toMatch(/\bStar\b/);
  });

  it.each(CASES)('variant B (%s) eyebrow says "%s", never Star', async (locale, eyebrow) => {
    const html = await render(LeadPaywallTeaserBEmail({ locale, ...personalized }));
    expect(html).toContain(eyebrow);
    expect(html).not.toMatch(/\bStar\b/);
  });

  it.each(CASES)('variant C (%s) eyebrow says "%s", never Star', async (locale, eyebrow) => {
    const html = await render(LeadPaywallTeaserCEmail({ locale, ...personalized }));
    expect(html).toContain(eyebrow);
    expect(html).not.toMatch(/\bStar\b/);
  });
});
```

Append to `src/i18n/__tests__/sp-e-message-match.test.ts`:

```ts
describe('SP-E phantom tier removal (D4)', () => {
  it('paywall eyebrow says Included in Pro in both locales', () => {
    expect(get(en, 'paywall.cta.eyebrow')).toBe('Included in Pro');
    expect(get(es, 'paywall.cta.eyebrow')).toBe('Incluido en Pro');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/emails/__tests__/LeadPaywallTeaserEyebrow.test.tsx src/i18n/__tests__/sp-e-message-match.test.ts`
Expected: FAIL — html contains "Locked behind Star"/"Bloqueado por Star"; eyebrow keys still name Star.

- [ ] **Step 3: Implement**

1. `messages/en.json` line 1048: `"eyebrow": "Locked behind Star",` → `"eyebrow": "Included in Pro",`
2. `messages/es.json` line 1051: `"eyebrow": "Bloqueado tras Star",` → `"eyebrow": "Incluido en Pro",`
3. `src/emails/LeadPaywallTeaserEmail.tsx`: line 16 `eyebrow: 'Locked behind Star',` → `eyebrow: 'Included in Pro',`; line 29 `eyebrow: 'Bloqueado por Star',` → `eyebrow: 'Incluido en Pro',`
4. `src/emails/LeadPaywallTeaserBEmail.tsx`: same two swaps at lines 32 and 50.
5. `src/emails/LeadPaywallTeaserCEmail.tsx`: same two swaps at lines 36 and 55.
6. `src/emails/DiscountLaunchEmail.tsx`: line 30 `offer: 'For the next 7 days, claim 50% off your first month of Star.',` → `offer: 'For the next 7 days, claim 50% off your first month of Pro.',`; line 41 `offer: 'Por los próximos 7 días, reclama 50% de descuento en tu primer mes de Star.',` → `offer: 'Por los próximos 7 días, reclama 50% de descuento en tu primer mes de Pro.',`. (Verified: `src/emails/__tests__/DiscountLaunchEmail.test.tsx` asserts only `50%` / `coupon=HALF50` / trial phrasing, never the "Star" offer string — no test update needed.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/emails/__tests__/LeadPaywallTeaserEyebrow.test.tsx src/emails/__tests__/DiscountLaunchEmail.test.tsx src/i18n/__tests__/sp-e-message-match.test.ts src/shared/components/__tests__/PaywallCta.test.tsx`
Expected: PASS (PaywallCta tests mock the translator with key-echo — unaffected by the value change; DiscountLaunchEmail tests never asserted the "Star" offer string, so they stay green as a regression check).

- [ ] **Step 5: Grep guard — no phantom tier left in prod code**

Run: `grep -rnw "Star" src/ messages/ | grep -v __tests__ | grep -v "The Star (XVII)" | grep -v "Star-field"`
Expected: zero matches. (Whole-word `Star` catches every tier phrasing — "behind Star", "tras Star", "por Star", "month of Star", "mes de Star". The two exclusions are the only legit whole-word uses in the tree: the tarot card name in `signs/[sign]/page.tsx:114` and a "Star-field" CSS comment in `(marketing)/page.tsx:127`.)

- [ ] **Step 6: Commit**

```bash
git add messages/en.json messages/es.json src/emails/LeadPaywallTeaserEmail.tsx src/emails/LeadPaywallTeaserBEmail.tsx src/emails/LeadPaywallTeaserCEmail.tsx src/emails/DiscountLaunchEmail.tsx src/emails/__tests__/LeadPaywallTeaserEyebrow.test.tsx src/i18n/__tests__/sp-e-message-match.test.ts
git commit -m "fix(sp-e/T7): D4 — phantom Star tier gone: 'Included in Pro' in web copy + 3 teaser emails, 'Pro' in discount blast offer"
```

---

### Task 8: Synastry paywall — inline (0/9 opens) → card variant + sharper subline (D5)

**Files:**
- Modify: `src/modules/astro-engine/components/SynastryClient.tsx` (line 236: `variant="inline"` → `variant="card"`)
- Modify: `messages/en.json` (`paywall.cta.subline.synastryAi`)
- Modify: `messages/es.json` (`paywall.cta.subline.synastryAi`)
- Test: `src/modules/astro-engine/components/__tests__/SynastryClient.test.tsx` (rewrite — drives a calculated result through the mocked API)
- Test: `src/i18n/__tests__/sp-e-message-match.test.ts` (extend)

**Interfaces:**
- Consumes: `PaywallCta({ trigger, onClick, variant })` — the card branch renders eyebrow ("Included in Pro" after Task 7) + `contextualTitles.synastryAi` + `cta.subline.synastryAi` + full-width CTA. The card variant has measured opens on 3 other surfaces; `synastry-ai` PostHog trigger starts registering.
- Produces: card-variant CTA at `SynastryClient.tsx:233-239`; subline EN "See how your two charts actually interact — full AI reading with Pro." / ES "Mira cómo interactúan realmente sus dos cartas — lectura completa con IA, incluida en Pro."

- [ ] **Step 1: Rewrite the failing test**

Replace `src/modules/astro-engine/components/__tests__/SynastryClient.test.tsx` entirely:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React, { useEffect } from 'react';

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

// Capture PaywallCta props — SP-E D5 asserts the CARD variant is used
// (the inline variant had 0/9 lifetime opens).
vi.mock('@/shared/components/PaywallCta', () => ({
  PaywallCta: ({ trigger, variant }: { trigger: string; variant?: string }) => (
    <div data-testid="paywall-cta-stub" data-trigger={trigger} data-variant={variant} />
  ),
}));

vi.mock('@/shared/components/PaywallModal', () => ({
  PaywallModal: () => null,
}));

vi.mock('../SynastryResult', () => ({
  SynastryResult: () => <div data-testid="synastry-result-stub" />,
}));

// Auto-fill both birth-data forms on mount so handleCalculate passes validation.
vi.mock('../BirthDataFormStandalone', () => ({
  BirthDataFormStandalone: ({ onChange }: { onChange: (v: unknown) => void }) => {
    useEffect(() => {
      onChange({
        name: 'Test',
        date: '1990-06-15',
        time: '12:00',
        knowsBirthTime: false,
        latitude: 40.7128,
        longitude: -74.006,
        timezone: 'America/New_York',
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return <div data-testid="form-stub" />;
  },
}));

const mockPostJson = vi.hoisted(() => vi.fn());
vi.mock('@/shared/lib/apiFetch', () => ({
  postJson: mockPostJson,
}));

// IntersectionObserver polyfill (PaywallCta is stubbed; kept for safety).
beforeEach(() => {
  vi.clearAllMocks();
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

const RESULT_FIXTURE = {
  id: 'syn_test1',
  aspects: [],
  scores: { overall: 50, emotional: 50, intellectual: 50, physical: 50, karmic: 50 },
  chart1Summary: { sunSign: 'Aries', moonSign: 'Taurus', ascendant: null, name: null },
  chart2Summary: { sunSign: 'Leo', moonSign: null, ascendant: null, name: null },
};

describe('SynastryClient — paywall surface', () => {
  it('renders no /pricing link for a free user in the initial tree', () => {
    mockUseSubscription.mockReturnValue({ isPro: false, isLoading: false });
    const { container } = render(<SynastryClient />);
    expect(container.querySelector('a[href="/pricing"]')).toBeNull();
  });

  it('free user with a calculated result sees the CARD paywall variant (D5 — inline had 0/9 opens)', async () => {
    mockUseSubscription.mockReturnValue({ isPro: false, isLoading: false });
    mockPostJson.mockResolvedValue({
      kind: 'ok',
      data: { success: true, data: RESULT_FIXTURE },
    });
    render(<SynastryClient />);
    fireEvent.click(screen.getByRole('button', { name: 'calculateButton' }));
    const cta = await screen.findByTestId('paywall-cta-stub');
    expect(cta.getAttribute('data-variant')).toBe('card');
    expect(cta.getAttribute('data-trigger')).toBe('synastry-ai');
  });
});
```

Append to `src/i18n/__tests__/sp-e-message-match.test.ts`:

```ts
describe('SP-E synastry subline (D5)', () => {
  it('subline sells the card CTA in both locales', () => {
    expect(get(en, 'paywall.cta.subline.synastryAi')).toBe('See how your two charts actually interact — full AI reading with Pro.');
    expect(get(es, 'paywall.cta.subline.synastryAi')).toBe('Mira cómo interactúan realmente sus dos cartas — lectura completa con IA, incluida en Pro.');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/modules/astro-engine/components/__tests__/SynastryClient.test.tsx src/i18n/__tests__/sp-e-message-match.test.ts`
Expected: FAIL — `data-variant` is `"inline"`; sublines still say "Get a detailed analysis…" / "Obtén un análisis detallado…".

- [ ] **Step 3: Implement**

1. `src/modules/astro-engine/components/SynastryClient.tsx` lines 233–239 — one-word change with a why-comment:

```tsx
            {!isPro && (
              // Card variant: the inline strip logged 0/9 lifetime opens
              // (CRO audit 07-paywall STR-6); card has measured opens on
              // chart-reading, three-card, and celtic-cross.
              <PaywallCta
                trigger="synastry-ai"
                variant="card"
                onClick={() => setPaywallOpen(true)}
              />
            )}
```

2. `messages/en.json` — in `paywall.cta.subline`:

```json
        "synastryAi": "See how your two charts actually interact — full AI reading with Pro.",
```

3. `messages/es.json` — same key:

```json
        "synastryAi": "Mira cómo interactúan realmente sus dos cartas — lectura completa con IA, incluida en Pro.",
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/modules/astro-engine/components/__tests__/SynastryClient.test.tsx src/i18n/__tests__/sp-e-message-match.test.ts src/shared/components/__tests__/PaywallCta.test.tsx`
Expected: PASS. (PaywallCta's own inline-variant test still passes — the variant continues to exist as a component option; it just has no remaining call sites.)

- [ ] **Step 5: Grep guard — no inline call sites remain**

Run: `grep -rn 'variant="inline"' src/ | grep -v __tests__`
Expected: zero matches.

- [ ] **Step 6: Commit**

```bash
git add src/modules/astro-engine/components/SynastryClient.tsx messages/en.json messages/es.json src/modules/astro-engine/components/__tests__/SynastryClient.test.tsx src/i18n/__tests__/sp-e-message-match.test.ts
git commit -m "fix(sp-e/T8): D5 — synastry paywall switches to card variant; sharper subline both locales"
```

---

### Task 9: Essay CTA honest — "Unlock the full essay" replaces "Read more" (D6)

**Files:**
- Modify: `messages/en.json` (essays block line 937: replace `readMore` with `unlockFull`)
- Modify: `messages/es.json` (essays block line 937: same)
- Modify: `src/modules/esoteric/components/EssayPageClient.tsx` (line 53)
- Test: `src/modules/esoteric/components/__tests__/EssayPageClient.test.tsx` (new)
- Test: `src/i18n/__tests__/sp-e-message-match.test.ts` (extend)

**Interfaces:**
- Produces: button label `essays.unlockFull` = EN "Unlock the full essay" / ES "Desbloquea el ensayo completo" — matches what the click does (opens `PaywallModal` with `triggerContext="essay"`). `essays.readMore` is retired in the same commit: grep-verified sole consumer is this button (`grep -rn "readMore" src/ messages/` → EssayPageClient.tsx:53 + the two JSON lines; `moon.unlockFullCalendar` is a different key, untouched).

- [ ] **Step 1: Write the failing tests**

```tsx
// src/modules/esoteric/components/__tests__/EssayPageClient.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const mockUseSubscription = vi.fn();
vi.mock('@/shared/hooks/useSubscription', () => ({
  useSubscription: () => mockUseSubscription(),
}));

vi.mock('@/shared/components/PaywallModal', () => ({
  PaywallModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="paywall-modal-open" /> : null,
}));

import { EssayPageClient } from '../EssayPageClient';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('EssayPageClient — honest unlock CTA (SP-E D6)', () => {
  it('free users see the unlockFull label (not readMore) and it opens the paywall', () => {
    mockUseSubscription.mockReturnValue({ isPro: false, isLoading: false });
    render(
      <EssayPageClient>
        <p>essay body</p>
      </EssayPageClient>,
    );
    expect(screen.queryByRole('button', { name: 'readMore' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'unlockFull' }));
    expect(screen.getByTestId('paywall-modal-open')).toBeTruthy();
  });

  it('pro users get full content with no unlock button', () => {
    mockUseSubscription.mockReturnValue({ isPro: true, isLoading: false });
    render(
      <EssayPageClient>
        <p>essay body</p>
      </EssayPageClient>,
    );
    expect(screen.queryByRole('button', { name: 'unlockFull' })).toBeNull();
    expect(screen.getByText('essay body')).toBeTruthy();
  });
});
```

Append to `src/i18n/__tests__/sp-e-message-match.test.ts`:

```ts
describe('SP-E essay CTA (D6)', () => {
  it('unlockFull exists in both locales with honest copy', () => {
    expect(get(en, 'essays.unlockFull')).toBe('Unlock the full essay');
    expect(get(es, 'essays.unlockFull')).toBe('Desbloquea el ensayo completo');
  });

  it('readMore is retired from both locales (sole consumer was the paywall button)', () => {
    expect(get(en, 'essays.readMore')).toBeUndefined();
    expect(get(es, 'essays.readMore')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/modules/esoteric/components/__tests__/EssayPageClient.test.tsx src/i18n/__tests__/sp-e-message-match.test.ts`
Expected: FAIL — button accessible name is `readMore`; `unlockFull` undefined; `readMore` still present.

- [ ] **Step 3: Implement**

1. `messages/en.json` line 937: `"readMore": "Read more",` → `"unlockFull": "Unlock the full essay",`
2. `messages/es.json` line 937: `"readMore": "Leer más",` → `"unlockFull": "Desbloquea el ensayo completo",`
3. `src/modules/esoteric/components/EssayPageClient.tsx` line 53: `{t('readMore')}` → `{t('unlockFull')}` — and update the comment on line 43 from `{/* Read more button positioned over the fade */}` to `{/* Unlock button positioned over the fade — label matches the paywall it opens */}`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/modules/esoteric/components/__tests__/EssayPageClient.test.tsx src/i18n/__tests__/sp-e-message-match.test.ts`
Expected: PASS.

- [ ] **Step 5: Grep guard — retired key has zero references**

Run: `grep -rn "'readMore'\|\"readMore\"" src/ messages/`
Expected: zero matches.

- [ ] **Step 6: Commit**

```bash
git add messages/en.json messages/es.json src/modules/esoteric/components/EssayPageClient.tsx src/modules/esoteric/components/__tests__/EssayPageClient.test.tsx src/i18n/__tests__/sp-e-message-match.test.ts
git commit -m "fix(sp-e/T9): D6 — essay CTA says 'Unlock the full essay'; readMore key retired"
```

---

### Task 10: i18n parity sweep — every SP-E key in BOTH locales + phantom-phrase sweep

**Files:**
- Test: `src/i18n/__tests__/sp-e-message-match.test.ts` (extend — final describe)

**Interfaces:**
- Produces: a single iterated check that every SP-E key pair exists non-empty in both message files (spec Testing bullet: "test iterates the pairs"), plus a whole-file sweep that the phantom-tier phrases are gone.

- [ ] **Step 1: Write the test (should pass immediately if Tasks 2–9 are correct — it is the completeness gate, not a red-phase test)**

Append to `src/i18n/__tests__/sp-e-message-match.test.ts`:

```ts
describe('SP-E i18n completeness', () => {
  const SP_E_KEY_PATHS = [
    'landing.heroSubtext',
    'landing.heroProof',
    'landing.heroTrust',
    'landing.statsHeading',
    'pricing.heading',
    'pricing.subheading',
    'paywall.cta.eyebrow',
    'paywall.cta.subline.synastryAi',
    'essays.unlockFull',
  ] as const;

  it.each(SP_E_KEY_PATHS)('%s exists non-empty in BOTH locales', (path) => {
    const enValue = get(en, path);
    const esValue = get(es, path);
    expect(enValue, `en.json missing ${path}`).toBeTypeOf('string');
    expect(esValue, `es.json missing ${path}`).toBeTypeOf('string');
    expect((enValue ?? '').length).toBeGreaterThan(0);
    expect((esValue ?? '').length).toBeGreaterThan(0);
  });

  it('phantom "Star" tier phrases appear nowhere in either message file', () => {
    const enFlat = JSON.stringify(enMessages);
    const esFlat = JSON.stringify(esMessages);
    for (const phrase of ['behind Star', 'tras Star', 'por Star']) {
      expect(enFlat).not.toContain(phrase);
      expect(esFlat).not.toContain(phrase);
    }
  });
});
```

- [ ] **Step 2: Run the full i18n test file**

Run: `npx vitest run src/i18n/__tests__/sp-e-message-match.test.ts`
Expected: PASS (all describes from Tasks 2, 3, 5, 7, 8, 9 + this one; 9 parameterized parity cases). If any parity case fails, a copy task above was applied to only one locale — fix THAT task's JSON edit, not this test.

- [ ] **Step 3: Commit**

```bash
git add src/i18n/__tests__/sp-e-message-match.test.ts
git commit -m "test(sp-e/T10): i18n parity sweep — all SP-E keys in both locales, phantom phrases banned"
```

---

### Task 11: Full verification gate

**Files:**
- None expected (fix-forward only if the gate finds regressions).

- [ ] **Step 1: Full unit suite**

Run: `npx vitest run`
Expected: 0 failures (baseline was 2276+ green; this plan adds ~25 tests).

- [ ] **Step 2: Types + lint**

Run: `npm run typecheck`
Expected: 0 errors.
Run: `npm run lint`
Expected: no NEW issues in files this plan touched (ignore the known `.claude/worktrees/**` noise — compare against `git stash`-free main if unsure).

- [ ] **Step 3: E2E landing spec**

Run: `npx playwright test tests/e2e/landing.spec.ts`
Expected: PASS (including the three SP-E tests from Task 4).

- [ ] **Step 4: Manual spot-check list for the founder (report, do not gate)**

- `/` and `/es`: hero readable instantly on a throttled reload (DevTools → Performance → CPU 6× + Slow 3G); below-fold sections still animate in on scroll.
- `/pricing` at 390×844: Pro card + trial CTA in the first viewport, Monthly preselected; desktop still Free-left/Pro-right.
- `/es/pricing`: H1 "Mira tu verdadera carta sideral"; currency badge still on the Pro card.
- Any chart reading / tarot spread paywall card: eyebrow "Included in Pro" / "Incluido en Pro".

- [ ] **Step 5: Commit (only if fixes were needed)**

```bash
git add -A && git commit -m "chore(sp-e/T11): post-gate fixes"
```

---

## Self-review notes

**Spec coverage → tasks:**

| Spec item | Task(s) |
|---|---|
| Goal 1 / D1 — first paint shows content, animations enhancement | T1 (inversion + hero exemption), T4 (e2e proof) |
| Goal 2 / D2 — hero echoes 24°/actual-sky, proof line, honest trust | T2, T4 |
| Goal 3 / D3 — benefit H1, Pro-first mobile, monthly default, guarantee collision | T5 (copy), T6 (behavior) |
| Goal 4 / D4 — phantom tier gone (web + 3 teaser emails + discount blast) | T7 |
| Goal 5 / D5 — synastry inline→card + subline | T8 |
| Goal 5 / D6 — essay button honest, readMore retired | T9 |
| Goal 6 / D7 — proof reframe + TESTIMONIALS.md deferral note | T3 |
| Error handling (D1 fails visible) | T1 Step 3 CSS-scope test + T4 JS-disabled e2e |
| Testing — e2e first paint, unit toggles/variants/labels, i18n pair iteration, full suite | T4, T6, T8, T9, T10, T11 |
| Success criteria — FCP contains H1; message match; Pro CTA viewport 1; no "Star"; synastry trigger registers; essay label honest | T4, T6 Step 5, T7 Step 5, T8, T9; PostHog `synastry-ai` opens verify post-deploy (ops, not code) |

**Deviations from spec:**
- D1 hero exemption implemented by REMOVING hero `data-animate` attributes (spec offered "removed or excluded by selector") — removal is fail-visible by construction and deletes the hero-specific CSS block instead of special-casing it. Consequence: the hero no longer has an entrance animation at all (spec's intent — content first — is strictly met).
- The `<noscript>` escape is kept per spec even though the visible base state makes it redundant (commented as belt-and-braces).
- D6's "retire the key in the same commit if truly unused" — grep confirmed the button is the sole consumer, so `readMore` is removed in T9 (the conditional branch resolved to "retire").
- `TESTIMONIALS.md` is placed at `docs/superpowers/specs/TESTIMONIALS.md` (spec said "in the spec dir" without a date prefix; undated because it's a standing policy note, not a dated spec).

**Deliberately untouched hazards (owned elsewhere):**
- `PaywallModal.tsx` default plan (`pro_annual` at line 52) + portal/z-index + its hardcoded English — cro-phase0 plan Tasks 6/9. This plan's monthly-default change covers PricingToggle only, per SP-E D3 ("consistent with Phase 0's modal flip").
- `pricing.trialEndNote` client-computed date hydration quirk (PricingToggle.tsx:40–48) — spec non-goal; the fine-print block was not reworded.
- ThreeCardSpread's silent no-op AI button for free users — flagged by the audit, owned by another sub-project.
- `en_ref_nasa` Meta creative "NASA-verified" overclaim — ad-side recut, owned by the relaunch runbook (`_create_creatives_2026_05_23.mjs:37` untouched).
- `landing.spec.ts` stale header comment about the `/` placeholder — left as-is (comment-only, separate hygiene).
