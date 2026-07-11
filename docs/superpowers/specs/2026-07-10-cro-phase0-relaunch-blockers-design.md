# CRO Phase 0 — Relaunch Blockers (Design)

**Date:** 2026-07-10
**Status:** Approved (brainstorm 2026-07-10)
**Source:** `outputs/cro-audit-2026-07-10/REPORT.md` (52-agent CRO audit; 24 P0/P1 findings adversarially verified, 0 refuted)
**Sibling:** `outputs/seo-audit-2026-07-06/REPORT.md` (only its P0 crash is pulled into this spec)

## Context

Meta has been dark 47 days. The P0 that justified the pause (anonymous payers locked out) is verified fixed in production, but four new verified defects sit on the money path and would burn relaunch traffic. This spec covers the audit's **Phase 0** — everything that must land before any Meta re-spend — plus the SEO audit's production crash, in **one spec, one deploy**.

Decisions settled during brainstorm:

1. **Scope = Phase 0 in full** (all 8 action-plan items) + SEO tarot SSR crash. Week 2+ retention/product work and the relaunch itself are separate follow-up specs.
2. **The 6 unpushed HALF50 commits ship with this push.** Prerequisites (env vars + migration 0018) are part of the deploy gate. The HALF50 blast is gated and cannot fire on its own; the expired coupon gets re-cut later as a trial-end save offer (week 2+).
3. **Ops split:** Meta actions are automated via Graph API scripts (dry-run first, founder confirms apply); Stripe dashboard toggles and Events Manager checks are a step-by-step founder checklist (no API exists for Link Instant Bank Payments).
4. **Single deploy** — with ~12 unique visitors/14d there is no benefit to a hotfix-first split; one verification cycle, one deploy risk.

## Goals

- Anonymous payers (100% of completed checkouts) become email-reachable; lifecycle/dunning/trial-reminder stack works for the paying cohort.
- The paywall trial CTA is tappable on mobile pre-consent (77% of trial clicks originate at paywalls; 86% of opens are mobile).
- The post-calculation and drip-email CTA (`/chart?chartId=`) lands on the user's chart, not an empty form.
- PaywallModal defaults to the plan that actually converts (monthly 4/9 vs annual 0/6 lifetime trial→paid).
- Relaunch instrumentation guardrails are live (correct locale prop, server-side `landing_view`, CAPI health understood).
- ES surfaces are clean enough that the ES pre-spend blockers are gone (copy, l10n, ad destinations, targeting).
- The 112 crashing tarot URLs return 200 (chatgpt.com referrals = 50% of post-pause leads).
- A single "ready to re-spend" checklist tells the founder when to turn Meta back on.

## Non-goals

- The relaunch itself (budgets, hooks, ad creation) — decision point after this ships.
- Week 2+ items: post-purchase chart redirect, paid-onboarding email, `time: null` fix (fabricated Ascendant), email-gate re-arm, drip refuel / new coupon, payer-silence investigation.
- LATAM Stripe-page work (USD framing, in-modal trust, local-currency billing evaluation) — gates ES re-spend, not EN.
- The rest of the SEO audit fix list (orphan URLs, JSON-LD, titles, logo 404).
- Post-payment routing / `returnUrl` P1s, checkout-complete polling dead code — P1 batch, not Phase 0.

## Track designs

### Track 1 — Email reachability (P0-1)

The Stripe webhook writes `stripe-pending-<clerkId>@placeholder.invalid` into `users.email`; the Clerk `user.created` webhook uses `onConflictDoNothing`, so the real email never lands. 14/14 accepted lifecycle sends since 05-29 bounced.

Code changes:

- **Stripe webhook** (`src/app/api/webhooks/stripe/route.ts`): on `checkout.session.completed`, if the user row's email matches `stripe-pending-*@placeholder.invalid`, overwrite it with `session.customer_details.email`.
- **Clerk webhook** (`src/app/api/webhooks/clerk/route.ts:101`): `onConflictDoNothing` → `onConflictDoUpdate` (conflict target: id; update email to the real Clerk address). Keep idempotency: repeated deliveries must remain safe.
- **Drip suppression:** ALL remaining drip sends skip leads with `converted_to_user_id IS NOT NULL` — converted leads are users now; the lifecycle stack owns them. (The audit found the drip cross-selling `lead_paywall_teaser` to the sole active payer after she paid.)
- Note: `src/app/api/v1/checkout/recover/route.ts` also references the placeholder pattern — verify at plan time whether it needs the same treatment.

One-time backfill scripts (run post-deploy, founder-confirmed, `scripts/advertising/` pattern):

- **Backfill A:** the 2 existing `users` rows with placeholder emails → real addresses from Clerk/Stripe.
- **Backfill B:** `email_leads.converted_to_user_id` for anonymous payers, matched by Stripe customer email (extend `scripts/advertising/_repair_orphan_anon_payers_2026_05_30.mjs`).

Error handling: if the real email already exists on another `users` row (unique violation), log and continue — webhooks must still return 200. Backfills print a dry-run diff before writing.

### Track 2 — Mobile paywall CTA under the cookie banner (P0-2)

Pre-consent at 390×844, `elementFromPoint` at the trial-CTA center returns the cookie banner (z-50, rendered after the non-portaled modal).

- Render `PaywallModal` (`src/shared/components/PaywallModal.tsx`) through a React portal to `document.body`, z-index above the banner (banner z-50 → modal z-60). The banner (`src/shared/components/CookieConsent.tsx`) is not changed.
- Make the modal scrollable at small viewports (`max-h` + `overflow-y-auto`).
- **Regression test:** Playwright at 390×844 — before answering consent, `elementFromPoint` at the trial-CTA center must resolve to the CTA, not the banner.

### Track 3 — `/chart?chartId=` handoff (P0-3)

`chartId` is a param no code reads; every hero-calculator and drip-email CTA lands on an empty birth-data form.

- The `/chart` page reads `searchParams.chartId` server-side, fetches the stored temp chart by id (storage location — Redis vs DB — verified at plan time), and hydrates `ChartDisplay` with the birth data on the server. **No PII appears in the URL** (settled fix direction; the `bd`-params alternative violates the CLAUDE.md PII rule).
- `chartId` missing/expired/not-found → current behavior (empty form), no error surfaced.
- The existing `bd/bt/lat/lon/place/tz` param path keeps working unchanged.

### Track 4 — PaywallModal default plan → monthly

Annual ($34.99) is preselected but has 0/6 lifetime trial→paid vs monthly's 4/9. Default the modal's selected plan to monthly; annual remains the explicit upsell option. Update existing PaywallModal tests.

### Track 5 — Instrumentation trio (relaunch guardrails)

- **Locale super-prop fix:** `src/shared/components/PostHogProvider.tsx:89,164` — `pathname?.startsWith('/es')` mislabels `/essays/*` as `es` (~25% of "es" events). Change to `pathname === '/es' || pathname.startsWith('/es/')`; unit test with `/essays/…` and `/es/…` paths.
- **Server-side `landing_view`:** capture a server event on landing render via `posthog-node`, flushed through `waitUntil`, fire-and-forget — an analytics failure must never block or slow the render. Closes the consent-gate blindness (client sees ~41% of converting visitors). Guardrail for the relaunch reconciler.
- **CAPI 422 diagnosis:** the Meta CAPI gateway (capig.datah04.com) rejects 100% of observed page views with HTTP 422. Task = diagnose what our code sends and why the gateway rejects it; outcome is either a code/config fix (in scope) or a documented founder action in Events Manager (checklist item). This is the one track with an unknown outcome — scoped as "diagnose + fix if it's in our code."

### Track 6 — ES pre-spend batch

- **Copy:** `es.json:959` (`pricing.startTrial`) and `es.json:1040` (`paywall.trialCta`) still read "Comenzar prueba de 3 días" — apply the 'gratis' wording, mirroring the already-fixed `paywall.cta.ctaLabel`.
- **Modal l10n:** the ES PaywallModal renders 4 hardcoded English strings and an en-US date at the card-decision moment; translations already exist unused. Wire them up + locale-aware date formatting.
- **Meta scripts** (Graph API, following the 05-23 hygiene-script pattern, `scripts/advertising/`):
  - Point all 6 ES ads to the `/es/` landing (currently `/`).
  - Clean the ES ad-set targeting flagged 05-29: remove SV from geo, turn audience_network off.
  - Both scripts default to DRY_RUN; applying is a founder-confirmed shared-state action.

### Track 7 — SEO tarot SSR crash

`src/app/[locale]/(app)/tarot/[cardId]/page.tsx:239` calls `.join` on null, crashing 112 URLs (root mechanism per the SEO audit report — verify exact null field at plan time). Guard the null path + regression test rendering one of the previously-crashing card pages. Nothing else from the SEO audit ships here.

## Deploy gate (strict order)

1. **Vercel prod env first:** `COMPANY_POSTAL_ADDRESS` + `STRIPE_COUPON_HALF50`. Without the postal address, `EmailLayout` throws on every commercial email post-deploy.
2. **Migration 0018** applied to prod via hand-run SQL with `IF NOT EXISTS` — NOT bare `db:migrate` (Drizzle journal drift: 0014-0017 were applied out-of-band).
3. `npm test` + `npm run typecheck` + `npm run lint` — zero failures (auth/payment paths are touched).
4. Push → Vercel deploy → smoke: mobile paywall at 390×844, `/chart?chartId=` with a fresh chart, a previously-crashing tarot URL, Stripe webhook health.
5. Post-deploy one-time scripts (founder-confirmed): Backfill A (2 user emails), Backfill B (`converted_to_user_id`).
6. Founder ops checklist (below).
7. All of 1–6 done → "ready to re-spend"; the re-spend decision itself is out of scope.

## Founder ops checklist (manual, step-by-step in the plan)

**Stripe Dashboard:**
- Payment methods → Link → disable **Instant Bank Payments** (keeps Link card autofill; 17/20 recent failed charges are link bank-funding `partner_insufficient_funds` — dominant decline mode, no API toggle exists).
- Default payment-method configuration → turn off cashapp / klarna / amazon_pay (foot-gun if a future code path omits the explicit `card+link` list).
- Public business name → **Estrevia** (currently "Kirill Kovalenko" on the checkout page; statement descriptor is already ESTREVIA.APP).
- Radar → exempt recurring MITs from the high-risk rule (3/43 failures were Radar blocking our own dunning retries).
- Subscriptions settings → enable auto-cancel for past_due (44-day zombie emitting `invoice.payment_failed` webhooks).

**Meta:**
- Events Manager: verify Pixel/CAPI event health + EMQ after the CAPI 422 diagnosis.
- Confirm apply of the two ES Graph-API scripts (destination URLs, targeting cleanup).

## Testing

- Unit: both webhooks (placeholder overwrite, `onConflictDoUpdate`, unique-violation path, idempotent retry), drip suppression filter, locale-prop derivation, chartId fallback, PaywallModal default plan.
- Playwright: 390×844 pre-consent CTA hit-test; tarot card page regression.
- Full suite + typecheck + lint before push (zero-failure policy — payment/auth paths).

## Success criteria

- New anonymous payer (test-mode checkout) ends with a real email in `users` — no placeholder rows created going forward.
- The 2 affected users backfilled; lifecycle emails to them deliver (Resend accepted, not bounced).
- Trial CTA tappable pre-consent at 390×844 (Playwright green).
- `/chart?chartId=` renders the calculated chart; drip CTAs stop dead-ending.
- Previously-crashing tarot URLs return 200.
- PostHog: no `/essays/*` events labeled `es`; server `landing_view` flowing.
- ES ads point to `/es/`; ES ad-set targeting clean (post founder-confirmed apply).
- Founder checklist fully ticked → Meta re-spend unblocked.

## References

- Main report: `outputs/cro-audit-2026-07-10/REPORT.md` (P0-1..P0-4, P1s, action plan Phase 0)
- Contradiction resolutions: `outputs/cro-audit-2026-07-10/reconcile/`
- SEO crash: `outputs/seo-audit-2026-07-06/REPORT.md`
- HALF50 state: commits `9c69b61..7241c3b`, migration 0018, `project_half50_discount` memory
- Prior art: `scripts/advertising/_repair_orphan_anon_payers_2026_05_30.mjs`, 05-23 Meta hygiene scripts
