# AI Avatar Mount Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mount the existing `AvatarGenerator` on the `/chart` page below the Cosmic Passport section, fix six missing translation keys that would otherwise crash the component at runtime, and pass through chart-derived sun/moon/asc/element via a small `AvatarSection` wrapper.

**Architecture:** Render `<AvatarSection passport={passport} />` inside `ChartDisplay`'s post-chart section, where `passport` is `useMemo(() => generatePassport(chart), [chart])` (same derivation already used by `PassportSection`). The new wrapper component supplies the `<h2>` heading and ARIA, then delegates to the unchanged `AvatarGenerator`. Translation defects in `AvatarGenerator` are fixed in the same change so the mount is functional on first render.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 6 (strict), next-intl, vitest (node-only, no jsdom — tests inspect React element trees, no `render()`).

---

## Execution Strategy

Tasks 1 & 2 (en.json and es.json edits) run in **parallel via two background agents** because they touch different files. Tasks 3–7 are serial in the main session because each depends on the previous step's output (component → wrapper → mount → tests → verify).

---

## Task 1: Add 5 missing translation keys to en.json

**Files:**
- Modify: `messages/en.json` (insert into existing `avatar` block, currently at lines 1176–1193)

**Context for the agent:** The `AvatarGenerator` component calls `t('regenerateFree')`, `t('errorRateLimit')`, `t('errorGeneration')`, `t('proHint')`, `t('download')`. None of these keys exist. `t('styleLabel')` is being renamed to `t('style')` in a separate step — `style` already exists, do NOT add `styleLabel`.

- [ ] **Step 1: Read the existing avatar block to confirm current shape**

Read `messages/en.json` lines 1176–1193. Confirm `title`, `generate`, `generating`, `regenerate`, `style`, `styles.*`, `saveToProfile`, `freeGeneration`, `proUnlimited`, `freeRemaining`, `freeLimitReached` already exist.

- [ ] **Step 2: Add the 5 missing keys**

Insert these keys at the end of the `avatar` block (after `freeLimitReached`, before the closing `}`):

```json
    "regenerateFree": "Regenerate (uses 1 of {limit})",
    "errorRateLimit": "Too many requests. Please wait a moment and try again.",
    "errorGeneration": "Couldn't generate avatar. Please try again.",
    "proHint": "Upgrade to Pro for unlimited regenerations and 4 styles.",
    "download": "Download"
```

Note: `freeLimitReached` already takes `{limit}` — keep the same pattern for `regenerateFree`.

- [ ] **Step 3: Verify JSON validity**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/en.json', 'utf8'))"`
Expected: no output (success).

- [ ] **Step 4: Commit**

```bash
git add messages/en.json
git commit -m "fix(i18n/avatar): add 5 missing en keys (regenerateFree, errorRateLimit, errorGeneration, proHint, download)"
```

---

## Task 2: Add 5 missing translation keys to es.json (parallel with Task 1)

**Files:**
- Modify: `messages/es.json` (insert into existing `avatar` block, currently at lines 1176–1193)

**Context for the agent:** Spanish must be **español neutro LATAM, tú-form** (per project convention). Sign names stay untranslated (Aries/Taurus...), planet names get translated. Match the formality and tone of existing strings in the same block (`generate: "Generar avatar"`, `freeRemaining: "{used} de {limit} avatares gratuitos usados este mes"`).

- [ ] **Step 1: Read the existing avatar block in es.json**

Read `messages/es.json` lines 1176–1193 to lock in the prevailing tone.

- [ ] **Step 2: Add the 5 missing keys**

Insert at the end of the `avatar` block:

```json
    "regenerateFree": "Regenerar (usa 1 de {limit})",
    "errorRateLimit": "Demasiadas solicitudes. Espera un momento e inténtalo de nuevo.",
    "errorGeneration": "No se pudo generar el avatar. Inténtalo de nuevo.",
    "proHint": "Mejora a Pro para regeneraciones ilimitadas y 4 estilos.",
    "download": "Descargar"
```

- [ ] **Step 3: Verify JSON validity**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/es.json', 'utf8'))"`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add messages/es.json
git commit -m "fix(i18n/avatar): add 5 missing es keys (regenerateFree, errorRateLimit, errorGeneration, proHint, download)"
```

---

## Task 3: Rename `t('styleLabel')` → `t('style')` in AvatarGenerator

**Files:**
- Modify: `src/modules/astro-engine/components/AvatarGenerator.tsx`

There is exactly one occurrence at line 141: `{t('styleLabel')}`.

- [ ] **Step 1: Apply the rename**

Replace the single line:

```tsx
          {t('styleLabel')}
```

with:

```tsx
          {t('style')}
```

- [ ] **Step 2: Verify no other references to `styleLabel` remain**

Run: `grep -rn "styleLabel" src/ messages/`
Expected: no output (the key never existed in JSON, so this confirms cleanup).

- [ ] **Step 3: Commit**

```bash
git add src/modules/astro-engine/components/AvatarGenerator.tsx
git commit -m "fix(astro-engine/avatar): use existing 'style' i18n key instead of unset 'styleLabel'"
```

---

## Task 4: Create the AvatarSection wrapper

**Files:**
- Create: `src/modules/astro-engine/components/AvatarSection.tsx`
- Test: `tests/components/AvatarSection.test.tsx`

**Test environment note:** This repo's vitest is **node-only, no jsdom** (`tests/components/ZodiacGlyph.test.tsx:1–6`). Tests inspect React `createElement` output as plain objects — never call `render()` or use `@testing-library/react`. Stub child components by mocking the import.

- [ ] **Step 1: Write the failing test**

Create `tests/components/AvatarSection.test.tsx`:

```tsx
/**
 * AvatarSection unit tests.
 *
 * Environment: Vitest (node, no jsdom). We inspect the React element tree
 * directly — no DOM renderer.
 */
import { describe, it, expect, vi } from 'vitest';
import React from 'react';

// next-intl in tests: stub useTranslations to return the key path.
vi.mock('next-intl', () => ({
  useTranslations: (ns: string) => (key: string) => `${ns}.${key}`,
}));

// Stub AvatarGenerator so the test only verifies the wrapper's contract.
vi.mock('@/modules/astro-engine/components/AvatarGenerator', () => ({
  AvatarGenerator: (props: Record<string, unknown>) =>
    React.createElement('div', { 'data-testid': 'avatar-generator-stub', ...props }),
}));

import { AvatarSection } from '@/modules/astro-engine/components/AvatarSection';
import type { PassportData } from '@/modules/astro-engine/passport';

const fixture: PassportData = {
  sunSign: 'Leo',
  moonSign: 'Cancer',
  ascendantSign: 'Scorpio',
  element: 'Fire',
  rulingPlanet: 'Sun',
  rarityPercent: 4.2,
};

function findByTestId(
  el: React.ReactElement | null,
  testId: string,
): React.ReactElement | null {
  if (!el || typeof el !== 'object') return null;
  const props = (el as React.ReactElement<Record<string, unknown>>).props ?? {};
  if (props['data-testid'] === testId) return el;
  const children = props['children'];
  if (!children) return null;
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    const found = findByTestId(child as React.ReactElement, testId);
    if (found) return found;
  }
  return null;
}

describe('AvatarSection', () => {
  it('renders a section with the avatar.title heading', () => {
    const tree = AvatarSection({ passport: fixture }) as React.ReactElement;
    expect(tree.type).toBe('section');
    // First child should be the heading
    const props = tree.props as Record<string, unknown>;
    const children = Array.isArray(props.children) ? props.children : [props.children];
    const heading = children.find(
      (c: unknown) =>
        typeof c === 'object' && c !== null && (c as React.ReactElement).type === 'h2',
    ) as React.ReactElement | undefined;
    expect(heading).toBeDefined();
    expect(heading!.props.children).toBe('avatar.title');
  });

  it('passes sunSign, moonSign, element through to AvatarGenerator', () => {
    const tree = AvatarSection({ passport: fixture }) as React.ReactElement;
    const stub = findByTestId(tree, 'avatar-generator-stub');
    expect(stub).not.toBeNull();
    const stubProps = stub!.props as Record<string, unknown>;
    expect(stubProps.sunSign).toBe('Leo');
    expect(stubProps.moonSign).toBe('Cancer');
    expect(stubProps.element).toBe('Fire');
  });

  it('coerces null ascendantSign to undefined for AvatarGenerator', () => {
    const noAsc: PassportData = { ...fixture, ascendantSign: null };
    const tree = AvatarSection({ passport: noAsc }) as React.ReactElement;
    const stub = findByTestId(tree, 'avatar-generator-stub');
    expect(stub).not.toBeNull();
    expect((stub!.props as Record<string, unknown>).ascendantSign).toBeUndefined();
  });

  it('forwards a non-null ascendantSign as a string', () => {
    const tree = AvatarSection({ passport: fixture }) as React.ReactElement;
    const stub = findByTestId(tree, 'avatar-generator-stub');
    expect((stub!.props as Record<string, unknown>).ascendantSign).toBe('Scorpio');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/components/AvatarSection.test.tsx`
Expected: FAIL — module `@/modules/astro-engine/components/AvatarSection` not found.

- [ ] **Step 3: Create AvatarSection.tsx**

Create `src/modules/astro-engine/components/AvatarSection.tsx`:

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { AvatarGenerator } from '@/modules/astro-engine/components/AvatarGenerator';
import type { PassportData } from '@/modules/astro-engine/passport';

interface AvatarSectionProps {
  passport: PassportData;
}

export function AvatarSection({ passport }: AvatarSectionProps) {
  const t = useTranslations('avatar');
  const { sunSign, moonSign, ascendantSign, element } = passport;

  return (
    <section
      aria-labelledby="avatar-section-heading"
      className="space-y-4"
    >
      <h2
        id="avatar-section-heading"
        className="text-lg font-semibold text-white/90"
      >
        {t('title')}
      </h2>
      <AvatarGenerator
        sunSign={sunSign}
        moonSign={moonSign}
        ascendantSign={ascendantSign ?? undefined}
        element={element}
      />
    </section>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/components/AvatarSection.test.tsx`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/modules/astro-engine/components/AvatarSection.tsx tests/components/AvatarSection.test.tsx
git commit -m "feat(astro-engine/avatar): add AvatarSection wrapper with heading and PassportData adapter"
```

---

## Task 5: Mount AvatarSection in ChartDisplay

**Files:**
- Modify: `src/modules/astro-engine/components/ChartDisplay.tsx` — add import (after line 30), add `useMemo` import (line 3), insert the section + divider (around line 426 after `<PassportSection />`)

**Why useMemo:** `chart` is a non-primitive object. `generatePassport()` does iteration + lookups; without memoization it runs on every parent re-render (toggling tabs, resizing the wheel, etc.). The component is in `'use client'` mode, so re-renders are real.

- [ ] **Step 1: Add `useMemo` to the React import**

In `src/modules/astro-engine/components/ChartDisplay.tsx` line 3, change:

```tsx
import { useState, useCallback, useEffect, useRef } from 'react';
```

to:

```tsx
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
```

- [ ] **Step 2: Add the new imports near the other component imports (around line 30)**

After:

```tsx
import { ShareButton } from './ShareButton';
```

add:

```tsx
import { AvatarSection } from './AvatarSection';
import { generatePassport } from '@/modules/astro-engine/passport';
```

- [ ] **Step 3: Compute passport once with useMemo inside the main `ChartDisplay` function**

Inside `export function ChartDisplay()` (line 149), after the early `if (!chart) return …` block (currently around line 308) and before the `tabs` declaration at line 310, insert:

```tsx
  const passport = useMemo(() => generatePassport(chart), [chart]);
```

This is safe because the early return guarantees `chart !== null` from this point onward.

- [ ] **Step 4: Render `<AvatarSection />` after `<PassportSection />`**

In the return block, locate the existing fragment (lines 416–426):

```tsx
      {/* Passport section — shown after chart calculation */}
      {chartId && (
        <>
          <div
            className="h-px"
            style={{ background: 'rgba(255,255,255,0.06)' }}
            aria-hidden="true"
          />
          <PassportSection chartId={chartId} />
        </>
      )}
```

Replace with:

```tsx
      {/* Passport section — shown after chart calculation */}
      {chartId && (
        <>
          <div
            className="h-px"
            style={{ background: 'rgba(255,255,255,0.06)' }}
            aria-hidden="true"
          />
          <PassportSection chartId={chartId} />
        </>
      )}

      {/* Avatar section — also requires a calculated chart */}
      <div
        className="h-px"
        style={{ background: 'rgba(255,255,255,0.06)' }}
        aria-hidden="true"
      />
      <AvatarSection passport={passport} />
```

Note: the avatar section divider + render are NOT gated on `chartId` because `generatePassport()` works from `chart` directly. An anonymous user (no DB row, no `chartId`) still gets sun/moon/element and can use avatar generation.

- [ ] **Step 5: Run typecheck and existing tests**

Run: `npm run typecheck`
Expected: no errors.

Run: `npx vitest run tests/components/AvatarSection.test.tsx`
Expected: still 4 passing.

- [ ] **Step 6: Commit**

```bash
git add src/modules/astro-engine/components/ChartDisplay.tsx
git commit -m "feat(astro-engine/chart): mount AvatarSection below PassportSection on chart page"
```

---

## Task 6: Manual smoke test in dev

Per CLAUDE.md, UI changes must be verified in the browser before claiming done.

- [ ] **Step 1: Start dev server**

Run: `npm run dev`
Expected: server listens on http://localhost:3000.

- [ ] **Step 2: Verify EN — chart with birth time**

Navigate to http://localhost:3000/en/chart. Submit the form with a known birth time (e.g., 1990-01-15, 14:30, New York). After chart renders:
- Scroll to the bottom — confirm "AI Avatar" heading appears below the Cosmic Passport block
- Confirm the divider line above the heading
- Confirm 4 style buttons (Cosmic active, Tarot/Geometric/Nebula locked with PRO badge — assuming a free account)
- Click "Generate Avatar" — confirm either a generated image (if `GEMINI_API_KEY` is configured locally and quota allows) or a clear error message in red ("Couldn't generate avatar...")
- Open browser DevTools console — there must be **zero** `MISSING_MESSAGE` warnings from next-intl

- [ ] **Step 3: Verify EN — chart without birth time**

Submit the form with "I don't know my birth time" toggled. After chart renders:
- AvatarSection still appears (does not require ascendant)
- Click Generate — same outcomes as above

- [ ] **Step 4: Verify ES**

Navigate to http://localhost:3000/es/chart. Repeat Step 2:
- Heading reads "Avatar IA"
- Style label reads "Estilo"
- Generate button reads "Generar avatar"
- Trigger an error path (rate-limit by clicking 4× rapidly) — confirm error string is in Spanish

- [ ] **Step 5: Stop dev server, document findings**

If any check fails, fix in place and re-test before proceeding to Task 7. Capture in the eventual commit message what was verified.

---

## Task 7: Final verification gate (typecheck + lint + tests)

Per CLAUDE.md "Test before 'done'": zero failing tests / type errors policy.

- [ ] **Step 1: Run typecheck**

Run: `npm run typecheck`
Expected: exit 0, no output.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: exit 0, no errors. Warnings on lines this PR did not touch are acceptable.

- [ ] **Step 3: Run full test suite**

Run: `npm test -- --run`
Expected: all suites pass. The new `AvatarSection.test.tsx` runs alongside.

- [ ] **Step 4: Confirm git tree is clean and report**

Run: `git status`
Expected: `nothing to commit, working tree clean` (all 5 commits already made: 2× i18n, 1× rename, 1× wrapper+test, 1× mount).

If clean and all gates pass, the feature is shippable. Direct-to-main per repo workflow — no PR needed unless the founder explicitly asks.

---

## Self-Review Notes

Spec coverage check:
- Goal 1 (render on /chart) → Task 5 ✅
- Goal 2 (fix translation defects) → Tasks 1, 2, 3 ✅
- Goal 3 (reuse generatePassport) → Task 5 Step 2 ✅
- Goal 4 (locale, AGPL split) → no `content/` touched; both locales in Tasks 1, 2 ✅
- Decisions table — placement, wrapper, data source, key gap, ascendant null handling, lazy mount — all map to Task 4 or 5 ✅
- Error handling section — paths exist in route.ts and component; Task 6 Step 4 spot-checks one path (rate-limit) ✅
- Testing section — manual + unit covered; integration test for ChartDisplay omitted intentionally (no existing harness to extend, called out in spec) ✅

No placeholders, no "TODO" steps, every step has either exact code or an exact command with expected output.

Type consistency: `PassportData.ascendantSign` is `Sign | null`; `AvatarGenerator.ascendantSign` is `string | undefined`. The wrapper does the `null → undefined` coercion at line `ascendantSign={ascendantSign ?? undefined}` (Task 4 Step 3). Test in Task 4 Step 1 verifies both branches.
