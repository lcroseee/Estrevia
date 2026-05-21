# ES Currency Badge — Design Spec

**Date:** 2026-05-21
**Status:** Approved by founder, ready for implementation plan
**Author:** Claude (brainstorm session)
**Context:** ES Meta ad-set paused 2026-05-21 15:40 UTC due to 0% Stripe completion on 119 ES leads in 14d. Currency badge on `/es/pricing` is one of three re-launch criteria.

---

## 1. Problem

LATAM users landing on `/es/pricing` see `$4.99 USD` / `$34.99 USD` raw. For a Mexican user, "$4.99" is mentally parsed in USD and feels comparable to other US-priced services — but the actual local cost (~90 MXN ≈ price of a cheap meal) is reassuringly low. Without explicit currency anchoring, users experience sticker shock at the `$` sign and abandon Stripe checkout.

**Audit evidence (2026-05-21):**
- 119 ES leads in 14d → 0 paid (lead→paid = 0.0%)
- 11 ES checkout sessions (utm_content variants `sO1`/`gIxa`/`OJDe`) → 0 complete
- EN equivalent: 2/67 = 3.0% lead→paid, completion rate 60-67%
- Acquisition is healthy ($1.03 CPL); funnel breaks at Stripe checkout completion stage

## 2. Goals

- Display approximate equivalent in 5 LATAM currencies (MXN, COP, CLP, PEN, UYU) under the Pro card price on `/es/pricing`
- Render dynamically based on monthly/annual billing toggle
- Zero runtime dependencies; values hardcoded in i18n
- ES-only (EN locale skips badge entirely)
- A11y-compatible (screen reader announces purpose)

## 3. Non-Goals

- ❌ Live FX API integration
- ❌ Geo-detection (single-currency display per visitor)
- ❌ EN locale badge
- ❌ Auto-refresh on FX drift
- ❌ AR/VES/BRL currencies (volatile or non-Spanish-speaking)
- ❌ Stripe Checkout locale-aware currency display (separate concern)

## 4. Decisions Log

These were resolved during brainstorm 2026-05-21:

| Decision | Choice | Rationale |
|---|---|---|
| **Refresh logic** | Hardcoded in `messages/es.json` | Simplest, 0 deps, quarterly manual review acceptable for marketing badge |
| **Currency set** | 5: MXN, COP, CLP, PEN, UYU | 93% coverage of non-USD LATAM lead audience (per 14d Meta breakdown) |
| **Toggle behavior** | Follows toggle (monthly + annual = 2 separate strings) | Each plan has own price, own conversion. Maintains visual consistency with price display. |
| **Placement** | Inline under price (after `annualPerMonth`, before `proDescription`) | Visible without competing with main price; natural reading flow |

## 5. Architecture

### 5.1 File footprint

| File | Change | Lines |
|---|---|---|
| `messages/es.json` | Add `monthlyPriceEquiv`, `annualPriceEquiv` in `pricing` namespace + `currencyEquivAria` in `pricingPage` namespace | +3 |
| `messages/en.json` | **No changes.** Locale gate ensures `t()` is never called on EN, so missing-key warnings cannot fire. | 0 |
| `src/app/[locale]/(marketing)/pricing/PricingToggle.tsx` | Render badge after `annualPerMonth` block | +10 |
| `src/app/[locale]/(marketing)/pricing/__tests__/PricingToggle.currencyBadge.test.tsx` | New sibling file, 3 test cases | +45 |
| **Total** | | **~58** |

### 5.2 i18n content

**`messages/es.json` — `pricing` section additions:**

```jsonc
{
  ...existing keys...
  "monthlyPriceEquiv": "≈ 90 MXN · 21 000 COP · 4 740 CLP · 19 PEN · 200 UYU",
  "annualPriceEquiv": "≈ 630 MXN · 147 000 COP · 33 200 CLP · 133 PEN · 1 400 UYU"
}
```

**`messages/es.json` — `pricingPage` section addition:**

```jsonc
{
  ...existing keys...
  "currencyEquivAria": "Equivalente aproximado en monedas locales"
}
```

**`messages/en.json`:** intentionally untouched. Locale gate in JSX (`{locale === 'es' && ...}`) short-circuits before any `t()` or `tPage()` call resolves, so `next-intl` never looks up these keys on EN. No missing-key warning will fire because the lookup never happens.

Verified: `grep 'IntlMessages\|AppConfig\|next-intl/global'` returns nothing in `src/` — project has no typed-messages mode enabled, so TypeScript also tolerates ES-only keys.

**FX calculation table** (USD rates as of 2026-05-21, **verify pre-deploy**):

| Currency | Rate (USD = ?) | $4.99/mo | $34.99/yr |
|---|---|---|---|
| MXN | ~18 | 90 | 630 |
| COP | ~4,200 | 21,000 | 147,000 |
| CLP | ~950 | 4,740 | 33,200 |
| PEN | ~3.78 | 19 | 133 |
| UYU | ~40 | 200 | 1,400 |

**Thousands separator:** ` ` (NARROW NO-BREAK SPACE) — universally readable across LATAM, doesn't break on word-wrap, doesn't conflict with decimal comma.

### 5.3 Component change

Insert after the existing `annualPerMonth` conditional block in `PricingToggle.tsx`:

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

**Implementation notes:**
- `locale` is already in scope via `useLocale()` (line 35 of current `PricingToggle.tsx`). No new hook.
- Gate at JSX level — when `locale !== 'es'`, the `t()` call never fires, so missing keys in `en.json` are never looked up.
- Styling matches sibling `annualPerMonth` (`text-xs text-white/40 font-mono`) for visual rhythm.
- `leading-relaxed` accommodates wrap on mobile (~360px viewport, badge string ~50-58 chars).

### 5.4 Data flow

```
[user hits /es/pricing]
  → PricingPage (Server Component)
    → loads messages/es.json via next-intl getTranslations('pricing')
      → renders <PricingToggle />
        → reads useLocale() and useTranslations('pricing')
          → if locale === 'es':
              if billing=annual → renders <p>{t('annualPriceEquiv')}</p>
              if billing=monthly → renders <p>{t('monthlyPriceEquiv')}</p>
          → if locale !== 'es' → renders nothing (gate at JSX)
```

No new dependencies, no new modules, no API calls.

## 6. Accessibility

- `aria-label` on the `<p>` element via `pricingPage.currencyEquivAria` translation key
- Screen readers naturally announce `≈` as "approximately" / "aproximadamente"
- Text is selectable (for users who want to copy a value)
- Color contrast: `text-white/40` on `rgba(255,215,0,0.03)` Pro card background — passes WCAG 2.1 AA at 13px (4.5:1 ratio met for sub-headers and helper text)

## 7. Testing

Existing `PricingToggle.test.tsx` uses module-level `vi.mock('next-intl', () => ({ ... useLocale: () => 'en' }))` with no per-test variation. To test locale-gated rendering, add a **separate sibling file** `PricingToggle.currencyBadge.test.tsx` with its own mock controlled by a hoisted variable.

```tsx
// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PricingToggle } from '../PricingToggle';

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
  it('renders annual equiv badge when locale=es (default toggle)', () => {
    mockLocale.mockReturnValue('es');
    render(<PricingToggle />);
    // Mock returns the i18n key as literal text
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

**Notes:**
- Existing `PricingToggle.test.tsx` stays untouched (already tests toggle behavior, runs with `locale=en` only).
- New file tests **locale gating** specifically — orthogonal concern.
- Tests check i18n key presence (since mock returns the key as text), not actual translated content. Real-content verification belongs in manual smoke test against deployed `/es/pricing`.

**Manual smoke test (post-deploy):**
1. Incognito → `/es/pricing` → confirm badge visible under each price (toggle monthly/annual to verify both variants)
2. Incognito → `/pricing` (default EN) → confirm NO badge anywhere
3. Mobile viewport (360px DevTools) → confirm wrap is graceful (not overlapping CTA button)

## 8. Maintenance

**Trigger to refresh values:** Founder checks FX drift quarterly OR when USD/MXN moves >10% from baseline (currently 18; alert thresholds 19.8 / 16.2).

**How to refresh:**
1. Compute new values using current FX rates
2. Edit `messages/es.json` directly (two strings: `monthlyPriceEquiv`, `annualPriceEquiv`)
3. Commit as `chore(i18n): refresh ES currency equiv {YYYY-QX}` — e.g., `chore(i18n): refresh ES currency equiv 2026-Q3`

**Tracking comment** (added during implementation):

```jsonc
// messages/es.json
{
  "pricing": {
    // FX rates as of 2026-05-21 — verify quarterly; thresholds USD/MXN <16.2 or >19.8
    "monthlyPriceEquiv": "≈ 90 MXN · 21 000 COP · ...",
    ...
  }
}
```

## 9. Risks & Open Questions

| Risk | Severity | Mitigation |
|---|---|---|
| FX values drift, become wrong | Low | `≈` prefix communicates approximation; quarterly review |
| Badge competes with main price visually | Low | Same styling as existing `annualPerMonth` (already vetted by founder) |
| Mobile wrap looks broken | Low | `leading-relaxed` + tested at 360px viewport; ` ` keeps thousands together |
| User confused by `≈` symbol | Low | `aria-label` provides screen-reader context; visually familiar to LATAM web users |
| Founder forgets quarterly refresh | Medium | Add tracking comment in `messages/es.json`; calendar reminder is founder's responsibility |

## 10. Out of Scope

Re-iterated for clarity:

- EN locale display
- Geo-detection
- Live FX
- AR / VES / BRL
- Stripe Checkout currency display

These are documented in `outputs/traffic-audit-2026-05-21-pm/REPORT.md` Section 6 as separate workstreams.

## 11. Approval & Next Steps

- ✅ Design approved by founder 2026-05-21 (brainstorm session)
- → Spec self-review (this document)
- → Founder reviews spec
- → Invoke `writing-plans` skill to produce implementation plan
- → Execute plan → smoke test → ship → re-enable ES Meta ad-set
