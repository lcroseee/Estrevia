# ES Currency Badge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a LATAM currency-equivalent badge under the Pro price on `/es/pricing` (5 currencies: MXN, COP, CLP, PEN, UYU) — ES locale only, follows monthly/annual toggle.

**Architecture:** Hardcoded values in `messages/es.json`. `messages/en.json` untouched. JSX `{locale === 'es' && ...}` gate prevents the `t()` lookup from firing on non-ES locales. Styling matches existing `annualPerMonth` sibling. Test in new sibling file with mutable mock for `useLocale()`.

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript 6 · next-intl · Tailwind 4 · Vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-05-21-es-currency-badge-design.md`

---

## Task 1: Failing tests for locale-gated badge rendering

**Files:**
- Create: `src/app/[locale]/(marketing)/pricing/__tests__/PricingToggle.currencyBadge.test.tsx`

**Why a separate test file?** The existing `PricingToggle.test.tsx` declares its `next-intl` mock with `useLocale: () => 'en'` at the module scope (no per-test override). To test ES-vs-EN behavior we need a mutable mock; isolating it in a sibling file avoids touching tests that are already green.

- [ ] **Step 1: Verify clean working tree**

Run: `git status --short`
Expected: empty (or only unrelated files you don't intend to touch in this task)

- [ ] **Step 2: Create the test file with mutable locale mock**

Create `src/app/[locale]/(marketing)/pricing/__tests__/PricingToggle.currencyBadge.test.tsx` with this exact content:

```tsx
// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PricingToggle } from '../PricingToggle';

// Hoisted spy lets each test override the locale return value.
const mockLocale = vi.fn<() => string>(() => 'es');

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, vars?: Record<string, unknown>) =>
    vars ? `${key}:${JSON.stringify(vars)}` : key,
  useLocale: () => mockLocale(),
}));

vi.mock('../PricingUpgradeButton', () => ({
  PricingUpgradeButton: () => <button>upgrade-stub</button>,
}));

describe('PricingToggle — ES currency badge', () => {
  it('renders annual equiv badge when locale=es (default toggle is annual)', () => {
    mockLocale.mockReturnValue('es');
    render(<PricingToggle />);
    // Mock returns the i18n key as literal text — assert the key, not the resolved value.
    expect(screen.getByText('annualPriceEquiv')).not.toBeNull();
  });

  it('switches to monthly equiv badge when toggle=monthly', () => {
    mockLocale.mockReturnValue('es');
    render(<PricingToggle />);
    fireEvent.click(screen.getByRole('radio', { name: 'monthly' }));
    expect(screen.getByText('monthlyPriceEquiv')).not.toBeNull();
    expect(screen.queryByText('annualPriceEquiv')).toBeNull();
  });

  it('renders NO badge when locale=en (gate active)', () => {
    mockLocale.mockReturnValue('en');
    render(<PricingToggle />);
    expect(screen.queryByText('annualPriceEquiv')).toBeNull();
    expect(screen.queryByText('monthlyPriceEquiv')).toBeNull();
  });
});
```

- [ ] **Step 3: Run the new test file and verify all 3 tests fail**

Run:
```bash
npx vitest run src/app/\[locale\]/\(marketing\)/pricing/__tests__/PricingToggle.currencyBadge.test.tsx
```

Expected: 3 failed tests, 0 passed. Each failure should be `Unable to find an element with the text: annualPriceEquiv` (or `monthlyPriceEquiv`). The third test would pass coincidentally if the component renders nothing currency-related — that's fine; it's correct EN behavior and will keep passing after implementation.

Document the actual fail messages in your shell; if you see anything other than "element not found", stop and investigate (e.g. mock didn't apply, file path wrong).

- [ ] **Step 4: Commit the failing tests**

```bash
git add src/app/\[locale\]/\(marketing\)/pricing/__tests__/PricingToggle.currencyBadge.test.tsx
git commit -m "$(cat <<'EOF'
test(pricing): failing tests for ES currency badge locale gate

Mutable useLocale mock in sibling file (existing PricingToggle.test.tsx
hard-codes locale=en at module scope). 3 cases: es-annual renders key,
es-monthly switches key, en renders nothing.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Implement the badge in PricingToggle

**Files:**
- Modify: `src/app/[locale]/(marketing)/pricing/PricingToggle.tsx:178-182`

**Context:** Lines 178-182 currently contain:

```tsx
{billing === 'annual' && (
  <p className="text-xs text-white/40 mb-3 font-[var(--font-geist-mono)]">
    {t('annualPerMonth')}
  </p>
)}
```

We insert a new conditional block **immediately after** the closing `)}` of this `annualPerMonth` block (so the new code starts on line 183 in the modified file, pushing existing line 183 down).

- [ ] **Step 1: Insert badge JSX after annualPerMonth block**

Find the closing `)}` of the `annualPerMonth` block (line 182) and add this immediately after it, before the `<p className="text-sm text-white/45 leading-relaxed">` that renders `proDescription`:

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

After the edit, the relevant block should read:

```tsx
            {billing === 'annual' && (
              <p className="text-xs text-white/40 mb-3 font-[var(--font-geist-mono)]">
                {t('annualPerMonth')}
              </p>
            )}
            {/* LATAM currency equivalents — ES-only via locale gate */}
            {locale === 'es' && (
              <p
                className="text-xs text-white/40 mb-3 font-[var(--font-geist-mono)] leading-relaxed"
                aria-label={tPage('currencyEquivAria')}
              >
                {t(billing === 'annual' ? 'annualPriceEquiv' : 'monthlyPriceEquiv')}
              </p>
            )}
            <p className="text-sm text-white/45 leading-relaxed">
              {tPage('proDescription')}
            </p>
```

**Sanity checks before continuing:**
- `locale` is already in scope (declared on line 35: `const locale = useLocale();`). No new import.
- `t` and `tPage` are already in scope (lines 33-34). No new hook.
- Indentation matches the surrounding 12-space JSX indent.

- [ ] **Step 2: Run the new tests and verify all 3 pass**

Run:
```bash
npx vitest run src/app/\[locale\]/\(marketing\)/pricing/__tests__/PricingToggle.currencyBadge.test.tsx
```

Expected: `3 passed`. If any fail:
- "annual key not found" → check that the JSX gate uses `locale === 'es'` literally.
- "monthly key still present after click" → confirm the ternary key picks `monthlyPriceEquiv` when `billing === 'monthly'`.
- "EN renders something" → confirm the `locale === 'es' &&` short-circuits properly.

- [ ] **Step 3: Run the full PricingToggle test suite (no regressions)**

Run:
```bash
npx vitest run src/app/\[locale\]/\(marketing\)/pricing/__tests__/
```

Expected: all tests in that directory pass — old `PricingToggle.test.tsx`, new `PricingToggle.currencyBadge.test.tsx`, plus the `PricingPage` / `PricingUpgradeButton.*` suites.

- [ ] **Step 4: Run typecheck**

Run:
```bash
npm run typecheck
```

Expected: 0 errors. The new `aria-label={tPage('currencyEquivAria')}` references a key that does not yet exist in `es.json` — but `next-intl` translation calls are not statically typed in this repo (verified `grep 'IntlMessages\|AppConfig' src/` returns nothing), so this passes type-check.

- [ ] **Step 5: Run lint**

Run:
```bash
npm run lint -- src/app/\[locale\]/\(marketing\)/pricing/PricingToggle.tsx
```

Expected: 0 errors, 0 warnings on this file. If a stylistic warning appears (e.g., self-closing tag, prop order), fix it before commit.

- [ ] **Step 6: Commit the component change**

```bash
git add src/app/\[locale\]/\(marketing\)/pricing/PricingToggle.tsx
git commit -m "$(cat <<'EOF'
feat(pricing): render ES currency-equivalent badge on Pro card

JSX-gated by locale === 'es'; reads monthlyPriceEquiv / annualPriceEquiv
i18n keys based on billing toggle. EN locale path renders nothing — gate
short-circuits before t() lookup so en.json needs no new keys.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Add ES i18n strings

**Files:**
- Modify: `messages/es.json:953` (insert after the `annualPerMonth` line in `pricing` namespace)
- Modify: `messages/es.json:1007` (insert after `proPlanFeaturesAria` in `pricingPage` namespace)

**FX values used** (USD rates approximate, 2026-05-21):

| Currency | $4.99/mo | $34.99/yr |
|---|---|---|
| MXN | 90 | 630 |
| COP | 21 000 | 147 000 |
| CLP | 4 740 | 33 200 |
| PEN | 19 | 133 |
| UYU | 200 | 1 400 |

**Thousands separator:** ` ` (NARROW NO-BREAK SPACE) — copy/paste the literal character; do not write ` ` as a JSON escape (JSON does support ` ` escapes but the file currently uses literal Unicode characters for similar separators elsewhere — match prevailing style).

- [ ] **Step 1: Add `monthlyPriceEquiv` and `annualPriceEquiv` to the `pricing` namespace**

Locate `messages/es.json:953`:

```json
    "annualPerMonth": "~$2,92/mes",
```

Insert these two lines immediately after (before line 954 `"saveBadge": "Ahorra 42 %",`):

```json
    "monthlyPriceEquiv": "≈ 90 MXN · 21 000 COP · 4 740 CLP · 19 PEN · 200 UYU",
    "annualPriceEquiv": "≈ 630 MXN · 147 000 COP · 33 200 CLP · 133 PEN · 1 400 UYU",
```

After the edit, lines 953-956 should read:

```json
    "annualPerMonth": "~$2,92/mes",
    "monthlyPriceEquiv": "≈ 90 MXN · 21 000 COP · 4 740 CLP · 19 PEN · 200 UYU",
    "annualPriceEquiv": "≈ 630 MXN · 147 000 COP · 33 200 CLP · 133 PEN · 1 400 UYU",
    "saveBadge": "Ahorra 42 %",
```

- [ ] **Step 2: Add `currencyEquivAria` to the `pricingPage` namespace**

Locate `messages/es.json:1007`:

```json
    "proPlanFeaturesAria": "Funciones del plan Pro",
```

Insert this line immediately after (before line 1008 `"redirecting": "Redirigiendo al pago...",`):

```json
    "currencyEquivAria": "Equivalente aproximado en monedas locales",
```

After the edit, lines 1007-1009 should read:

```json
    "proPlanFeaturesAria": "Funciones del plan Pro",
    "currencyEquivAria": "Equivalente aproximado en monedas locales",
    "redirecting": "Redirigiendo al pago...",
```

- [ ] **Step 3: Validate JSON syntax**

Run:
```bash
node -e "JSON.parse(require('fs').readFileSync('messages/es.json','utf-8')); console.log('OK')"
```

Expected: `OK`. If a `SyntaxError` appears, fix the trailing comma or quote issue before continuing.

- [ ] **Step 4: Visual diff sanity-check**

Run:
```bash
git diff messages/es.json
```

Expected: exactly 3 lines added (`+ "monthlyPriceEquiv"...`, `+ "annualPriceEquiv"...`, `+ "currencyEquivAria"...`), 0 lines removed. Any other change is unintended — revert it.

- [ ] **Step 5: Re-run tests to confirm no regression**

Run:
```bash
npx vitest run src/app/\[locale\]/\(marketing\)/pricing/__tests__/
```

Expected: same pass count as Task 2 Step 3. The tests mock `useTranslations`, so adding real strings doesn't change their behavior — but a corrupted JSON file would break imports.

- [ ] **Step 6: Commit the i18n strings**

```bash
git add messages/es.json
git commit -m "$(cat <<'EOF'
i18n(es/pricing): add LATAM currency-equivalent strings

monthlyPriceEquiv + annualPriceEquiv in pricing namespace (5 currencies:
MXN, COP, CLP, PEN, UYU). currencyEquivAria in pricingPage namespace.

FX rates as of 2026-05-21; verify quarterly or on USD/MXN drift >10%.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Full verification suite

- [ ] **Step 1: Run the full test suite**

Run:
```bash
npm test
```

Expected: 100% pass (current baseline ~2276 tests + the 3 new ones = ~2279). If any unrelated test fails, that's pre-existing and not from this change — but flag it to the founder.

- [ ] **Step 2: Type-check the whole project**

Run:
```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Lint the whole project**

Run:
```bash
npm run lint
```

Expected: 0 errors on files touched by this work (`PricingToggle.tsx`, the new test, `es.json`). Lint may report pre-existing warnings on other files — those are not in scope for this plan (see memory `feedback_lint_worktrees_pollution`).

- [ ] **Step 4: Spot-check no other files leaked into HEAD**

Run:
```bash
git log -3 --stat
```

Expected: 3 commits, touching exactly:
1. The new test file
2. `PricingToggle.tsx`
3. `messages/es.json`

Total LOC delta should be ~58. If anything else changed, investigate.

---

## Task 5: Manual smoke test (post-deploy)

> Note: This task runs **after** the founder pushes commits and Vercel deploys the preview/production. It is not part of the local TDD loop.

- [ ] **Step 1: Open `/es/pricing` in an incognito window**

Visit `https://estrevia.app/es/pricing` (or the Vercel preview URL).

Expected:
- The Pro card shows `$34.99` (default annual toggle).
- Directly under `~$2,92/mes`, a smaller subtle line: `≈ 630 MXN · 147 000 COP · 33 200 CLP · 133 PEN · 1 400 UYU`.

- [ ] **Step 2: Click "Mensual" toggle**

Expected: the badge text updates to `≈ 90 MXN · 21 000 COP · 4 740 CLP · 19 PEN · 200 UYU`. No flash, no layout shift > a few pixels.

- [ ] **Step 3: Open `/pricing` (default EN) in the same incognito window**

Expected: **No badge anywhere** on the Pro card. The layout below `~$2.92/mo` jumps straight to `For serious practitioners…` (the `proDescription` line).

- [ ] **Step 4: Open DevTools mobile viewport (iPhone SE, 360×667)**

Visit `/es/pricing` in mobile viewport.

Expected:
- Badge wraps to 2 lines without overlapping the `proDescription` below or the CTA button.
- The ` ` thousands separator keeps `147 000` together (no break inside a number).
- Text remains legible (no truncation).

- [ ] **Step 5: A11y screen-reader spot-check** (optional but recommended)

In macOS, enable VoiceOver (⌘+F5) and tab to the badge line. It should be announced as "Equivalente aproximado en monedas locales, aproximadamente 630 MXN…" (the `aria-label` reads first, then the visible text).

- [ ] **Step 6: Document outcome**

Append to memory or to `outputs/traffic-audit-2026-05-21-pm/REPORT.md`:
- Date of smoke test
- Pass/fail per step above
- Screenshot of badge on mobile + desktop ES, and absence on EN

If all green: proceed to **re-enable ES Meta ad-set** (`scripts/advertising/_audit_meta_full_2026_05_21.mjs` showed it at ID `120243116822500527`; founder can flip status back to `ACTIVE` via Meta Ads Manager or via Graph API).

---

## Rollback procedure (in case of regression)

If the badge breaks production for any reason:

```bash
git revert <commit-3-hash> <commit-2-hash> <commit-1-hash>
git push origin main
```

Revert order: i18n strings → component → test. The component revert alone makes the badge invisible (i18n keys become orphans, no harm). The full revert removes the tests too.

ES Meta ad-set should remain paused until the issue is resolved.

---

## Self-Review

After writing the plan, fresh-eyes check against the spec:

**Spec coverage:**
- §5.1 file footprint → Task 1 (test), Task 2 (component), Task 3 (i18n). ✅
- §5.2 i18n content → Task 3 with exact JSON. ✅
- §5.3 component change → Task 2 with exact JSX. ✅
- §5.4 data flow → implicit in Task 2 (locale gate at JSX). ✅
- §6 accessibility → Task 2 inserts `aria-label`; Task 5 step 5 spot-check. ✅
- §7 testing → Task 1 + Task 4 full suite; Task 5 manual smoke. ✅
- §8 maintenance → Out of scope for implementation; documented in commit message + spec §8.
- §9 risks → Mitigated by tests + manual smoke. Mobile wrap covered in Task 5 step 4.

**Placeholder scan:** No "TBD" / "TODO" / "fill in details" / "similar to Task N". Every code block is the actual content.

**Type consistency:** `locale`, `t`, `tPage`, `billing` all match the existing component (lines 33-36). Test mock signature matches the actual hooks. i18n key names (`monthlyPriceEquiv`, `annualPriceEquiv`, `currencyEquivAria`) match across all 3 tasks.

No issues found.
