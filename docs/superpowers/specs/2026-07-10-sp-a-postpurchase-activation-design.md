# SP-A — Post-purchase Activation & Checkout Routing (Design)

**Date:** 2026-07-10 · **Status:** Approved (recommended-option authorization) · **Depends on:** Phase 0 shipped (P0-1 email fix in particular)
**Audit anchors:** `07-paywall.md` STR-3 (returnUrl discarded), `08-pricing-checkout.md` STR-2 (dead 8s poll), `07` STR-5 (raw i18n keys), REPORT.md "paying users don't use the product" (0 AI readings since 06-07; sole payer inactive since purchase day).

## Problem

A payer's post-purchase minute is wasted end-to-end: the `returnUrl` clients send is silently stripped by `checkoutBodySchema` (`src/app/api/v1/stripe/checkout/route.ts:35-46`); success/cancel URLs carry no locale (`route.ts:294-295`, `:408-409` — ES cancels land on EN `/pricing`); `/checkout/complete` burns up to 16 Stripe GETs polling `session.metadata.signInTicket` that nothing has written since `de39cee` (tickets live in Redis via `src/shared/lib/checkout-ticket.ts`); its fallback page renders raw i18n keys (`getTranslations('checkout.complete')` vs actual `pricingPage.checkout.complete`); and everyone finally lands on `/settings` — not the product. No onboarding email exists for new payers.

## Goals

1. Payer returns to the page that made them pay (returnUrl end-to-end), defaulting to the localized `/chart` — never `/settings`.
2. ES payers stay in Spanish through success AND cancel.
3. `/checkout/complete` reads the ticket from Redis (single source of truth), renders real strings in both locales.
4. New payers get a paid-onboarding email ~24h after subscribing (activation nudge toward the AI reading).
5. Stripe Product naming founder checklist (dashboard-only strings).

## Non-goals

- Plan-name copy consistency ("Locked behind Star") — SP-E.
- Backfilling `natal_charts.userId` for converted leads — the returnUrl mechanism carries chart context without ownership changes; revisit only if activation data demands it.
- In-app cancel/churn UX (audit exclusion).

## Decisions

- **D1. returnUrl transport = Stripe session metadata.** Add `returnUrl` to `checkoutBodySchema` with a same-origin validator (must match `/^\/(?!\/)/` — a single-slash-rooted path; reject absolute URLs and `//`), cap length (≤512), store as `metadata.return_url` in BOTH create branches. Alternative (cookie) rejected: metadata survives the Stripe round-trip and the anonymous flow with zero client state.
- **D2. Redirect priority:** `metadata.return_url` → else localized `/chart`. Applied in the two hardcoded `redirect_url=('/settings')` sites: `checkout/complete/page.tsx:69` and `CheckoutCompleteClient.tsx:28-31` (server passes the resolved target to the client component as a prop; the client never re-derives it).
- **D3. Kill the metadata poll, reuse Redis.** Replace `waitForTicket` (page.tsx:41-55) with a short `getCheckoutTicket(sessionId)` poll (same 500ms cadence, max ~5s — webhook writes the ticket within seconds; Redis GETs are cheap and local). The existing client poller (`/api/v1/checkout/session-status` → Redis) stays as the fallback layer. Also delete the stale `metadata.signInTicket` comments in `recover/route.ts:17` and `session-status/route.ts:6`.
- **D4. i18n:** both call sites switch to `useTranslations('pricingPage.checkout.complete')` / `getTranslations('pricingPage.checkout.complete')`. No message-file changes (keys exist: `title, description, redirecting, checkEmail, contactSupport` — en.json:1024-1030, es.json:1027-…).
- **D5. Locale-prefixed URLs:** `const localePath = localeFromBody === 'es' ? '/es' : '';` → `success_url: ${appUrl}${localePath}/checkout/complete?...`, `cancel_url: ${appUrl}${localePath}/pricing`. `localeFromBody` is already validated and in scope (route.ts:134).
- **D6. Paid-onboarding email = new transactional template + new hourly cron.** `PaidOnboardingEmail.tsx` (house pattern: inline `STRINGS = {en, es}`, `EmailLayout` WITHOUT `unsubscribeUrl` — transactional, exempt from the postal-address gate per `EmailLayout.tsx:28-38`). Content: what Pro unlocked + one CTA → localized `/chart` (generate the AI reading). New cron `src/app/api/cron/paid-onboarding/route.ts` modeled on `trial-expiration`: window = `subscription_status IN ('trialing','active')` AND `users.updatedAt`… no — window keyed on subscription start: select users whose `stripeSubscriptionId IS NOT NULL` and first `sent_emails` row of type `purchase_confirmation` is 20–44h old, dedup via `sent_emails` type `'paid_onboarding'` using the `wasSentWithin()` pattern (`sent-emails.ts:42-61`) — NOT the one-shot partial index (avoids a migration; the enum in `schema.ts:466-490` is TypeScript-only, no DB constraint). Skip `emailUndeliverable`. Registered in `vercel.json` crons.
- **D7. Founder checklist (dashboard):** Stripe Product display name → **Estrevia Pro** (payers currently see "Estrevia Premium" — not in repo; verify via `stripe products list` first), product description rewritten to match actual features (chart + AI readings + tarot + synastry). One consistent name from paywall to invoice.

## Error handling

- returnUrl validation failures are non-fatal: invalid value → treated as absent (default `/chart`), never a 4xx (checkout must not break over a redirect hint).
- Redis unavailability in `/checkout/complete` → same behavior as ticket-absent today (client poller + checkEmail fallback).
- Cron: per-user try/catch; Resend `result.error` MUST be checked (the welcome-email lesson, audit R-1) with the claim/update dedup pattern from `sent-lead-emails.ts`.

## Testing

- checkout route: returnUrl accepted/validated/stored in metadata (both branches); locale-prefixed URLs for es; EN unchanged. Rejection cases: absolute URL, `//evil`, >512 chars → metadata omitted.
- `/checkout/complete` page test (existing `__tests__/page.test.tsx` currently encodes the DEAD metadata behavior — rewrite): Redis ticket found → redirect carries `redirect_url=<return_url|/chart>`; not found → fallback renders `pricingPage.checkout.complete` strings (no raw keys).
- Cron: window selection, dedup (second run sends nothing), undeliverable skip, error isolation.
- E2E smoke stays manual (Stripe test-mode checkout → land on chart) — deploy-gate step.

## Success criteria

- Test-mode payer starting from a tarot page returns to that tarot page; payer from pricing lands on localized `/chart`.
- ES test-mode cancel lands on `/es/pricing`.
- `/checkout/complete` makes ≤1 Stripe GET (session fetch for validation) and 0 metadata polls.
- Fallback page shows real copy in ES.
- `paid_onboarding` rows appear in `sent_emails` exactly once per payer; email delivers (post P0-1).
