# SP-B — ES/LATAM Conversion Pack (Design)

**Date:** 2026-07-10 · **Status:** Approved (recommended-option authorization) · **Gates:** ES Meta re-spend (do NOT re-enable ES ads before this ships)
**Audit anchors:** `reconcile/es-paywall-leak.md` (Stripe page created→complete ES 4.5% vs EN 24.1% — 0.19×, the DOMINANT ES leak; modal 0.81× secondary), LIVE-14 (bare "$34.99" reads as pesos), `09-es.md` ES-1/2/3, CookieConsent fully English, DateInput English calendar on /es/.

## Problem

21/22 ES Stripe sessions expired before card entry. The audit settled that ES users reach the Stripe redirect at near-EN parity — they abandon at the payment decision. Contributing surfaces verified in code: prices render bare `$4.99`/`$34.99` in ES (`messages/es.json:949,951` — identical to EN; in LATAM `$` reads as local pesos); the FX-equivalence line exists (modal `PaywallModal.tsx:235-243`, pricing `PricingToggle.tsx:183-191`, Stripe `custom_text.submit` route.ts:161-168) but never says the base is **USD** and the rates are 7 weeks stale, duplicated in 3 places; the first interactive element every ES visitor sees (cookie banner, `CookieConsent.tsx`) is 100% English and links to unlocalized `/privacy`; the birth-date calendar popover is hardcoded English (`DateInput.tsx:37-45,497,512,540`); ~25 EN aria-labels sit on /es/ conversion-path components.

## Goals

1. Every price an ES user sees says **US$** and states billing is in USD, with fresh local-currency equivalents from one source of truth.
2. Trust elements at the card-decision moment (modal): cancel-anytime + money-back + secure-payment row.
3. Cookie banner speaks Spanish on /es/ (and honest copy — coordinated with SP-F).
4. Spanish calendar + Spanish aria-labels on the conversion path.
5. A written local-currency-billing decision (evaluate, do NOT implement).

## Non-goals

- True multi-currency billing (see D5). pix/OXXO — settled NOT implementable for subscriptions (`09-es.md` ES-3).
- Full a11y aria-label sweep beyond the conversion path (later batch).
- Pixel consent mechanics — SP-F (only banner STRINGS live here).
- The two 'gratis' CTA strings + modal l10n — already in Phase 0 (T9).

## Decisions

- **D1. US$ framing (ES only):** `messages/es.json` `pricing.monthlyPrice` → `"US$4.99"`, `annualPrice` → `"US$34.99"`, `annualPerMonth` → `"~US$2,92/mes"`. EN untouched. Plus a new ES-only note key `pricing.billedInUsd` = `"Se factura en dólares (USD)"` rendered under the equivalence line in both modal and pricing card.
- **D2. Single source for FX equivalents.** New `src/shared/lib/currency-equiv.ts` exporting the equivalence strings (typed per plan), consumed by: a new shared component `src/shared/components/CurrencyEquivNote.tsx` (replaces the duplicated inline JSX in `PricingToggle.tsx:183-191` and `PaywallModal.tsx:235-243`) AND the checkout route's `custom_text.submit` (replacing the hardcode at route.ts:161-168). Refresh the FX numbers at implementation time (rates are 2026-05-23 vintage); keep the quarterly-refresh comment pointing at the ONE file. i18n note: the visible strings stay in `messages/*` (`pricing.monthlyPriceEquiv`/`annualPriceEquiv`) for the UI; `currency-equiv.ts` holds the server-side copy and is the sync anchor referenced by both.
- **D3. In-modal trust row.** Below the CTA in `PaywallModal.tsx`: one muted line, both locales — "Cancel anytime · 14-day money-back · Secured by Stripe" (`paywall.trustRow` new key; ES: "Cancela cuando quieras · Garantía de 14 días · Pago seguro con Stripe"). Alternative (badges/logos) rejected: no legal review for card-network logos; text is enough at this stage.
- **D4. CookieConsent i18n via props from RootLayout.** The component mounts OUTSIDE `NextIntlClientProvider` (`src/app/layout.tsx:85`) so `useTranslations` would throw; RootLayout already resolves `getLocale()`/`getTranslations` server-side (layout.tsx:55-56 — the appShell pattern). Add a `cookieConsent` namespace (both locales), resolve strings in RootLayout, pass as a `strings` prop. Copy is the SP-F-coordinated honest version: EN "We use cookies for analytics and ad measurement — only after you accept." / mobile "Analytics & ad cookies."; buttons Accept/Decline → "Aceptar"/"Rechazar" etc. Fix `/privacy` links → locale-prefixed (`/${locale === 'es' ? 'es/' : ''}privacy`). Do NOT move the component under `[locale]` (Phase 0's portal z-fix and mount order depend on current topology).
- **D5. Local-currency billing: DECISION = stay USD now.** `currency_options` on the two Prices would make Stripe charge real MXN/COP while every UI string, FX note, webhook amount assumption, and the Stripe-USD AR-exclusion constraint (`setup-meta-campaign.ts`) assume USD. The evaluation doc (`outputs/sp-b/currency-decision.md`, written as a plan task) records: what `currency_options` would take end-to-end, expected uplift hypothesis, and the trigger to revisit (ES Stripe-page completion still <10% after 2 weeks of post-SP-B ES traffic).
- **D6. Calendar localization inside DateInput** (no library): `MONTH_NAMES`/`MONTH_ABBR`/weekday headers become locale-keyed (`es` arrays added: enero…, ene…, `['Do','Lu','Ma','Mi','Ju','Vi','Sá']`), selected via the existing `useLocale()` (`DateInput.tsx:90`); day-cell aria-labels use the localized abbreviation. Aria-labels in `DateInput.tsx`/`TimeInput.tsx`/`CityAutocomplete.tsx` (conversion path only) move to next-intl keys (components already render under NextIntlClientProvider). ChartWheel/PositionTable/etc. deferred to the a11y batch.

## Error handling

- `CurrencyEquivNote` renders nothing for EN locale (same gate as today); missing i18n keys must fail loudly in dev (next-intl default) — no silent EN fallback in ES UI.
- CookieConsent with missing `strings` prop → TypeScript-required prop (compile-time guarantee, no runtime fallback English).

## Testing

- Unit: CurrencyEquivNote (es renders equiv + billedInUsd; en renders null); checkout route sends the shared `custom_text` string for es and none for en; PaywallModal shows trust row both locales.
- Unit: DateInput popover renders "enero 1990"-style header + Spanish weekdays under `useLocale()='es'` (extend `BirthDataForm.test.tsx` NextIntlClientProvider pattern); existing `PricingToggle.currencyBadge.test.tsx` updated for the shared component.
- Unit: CookieConsent renders the Spanish strings when passed the es prop set; privacy link carries `/es/`.
- E2E (existing responsive/paywall specs unaffected — verify green).

## Success criteria

- On `/es/pricing` and in the ES modal: `US$` prefix + "Se factura en dólares (USD)" + fresh equivalents; Stripe checkout `custom_text` shows the same numbers (one source).
- ES visitor's banner, calendar, and conversion-path aria-labels are Spanish.
- Currency decision doc committed with an explicit revisit trigger.
- Post-ES-relaunch watch metric (runbook): Stripe session created→completed for ES — target >10% (from 4.5%).
