# SP-D — Product Trust & Retention Mechanics (Design)

**Date:** 2026-07-10 · **Status:** Approved (recommended-option authorization) · **Depends on:** nothing (independent of Phase 0 tracks; coordinate merge order on ChartDisplay.tsx with Phase 0 T8)
**Audit anchors:** LIVE-6 (fabricated noon Ascendant — violates the ±0.01° trust claim AND the project's own MVP rule "houses null when birth time unknown"), LAND-3/LIVE-4 (email gate: permanent dismissal, focus on close button, zero value tease), `07-paywall.md` STR-4 (ThreeCardSpread dead AI button), anon `/chart` 401 console error, "payers go silent on day one" (no investigation instrumentation exists).

## Problem

Verified mechanisms: (1) all three chart clients send literal `'12:00'` + `houseSystem: null` when birth time is unknown (`HeroCalculator.tsx:238,243`, `BirthDataForm.tsx:99,103`, `ChartDisplay.tsx:204,208`), the zod transform coerces `houseSystem null→Placidus` (`validation/chart.ts:18-20`), and since `time` arrives non-null the engine gate (`chart.ts:122`) computes a fabricated Ascendant + 12 houses — the paywalled reading teaser leads with it; the schema ALREADY accepts `time: null` and every null-houses UI path is verified present and dormant (ChartWheel:298, ChartDisplay:337/395, PositionTable:75, passport.ts:39, interpretation prompt no-houses branch). (2) The email gate writes a permanent `email_gate_passed` localStorage flag on BOTH submit and dismiss (`EmailGateModal.tsx:38,51-57,67-71`), focuses the X button (`:113`), and "Skip for now" yields the identical outcome to submitting (`HeroCalculator.tsx:328-329`) with copy that states no value delta. (3) ThreeCardSpread renders the AI-interpretation button for everyone but `handleInterpret` starts with `if (!isPro) return;` (`ThreeCardSpread.tsx:89-90,199-208`) — silent no-op; `paywallOpen` state + modal already exist in the component. (4) `SubscriptionProvider` fetches `/api/v1/user/subscription` on every mount (`SubscriptionProvider.tsx:63-68`); middleware 401s it for anon visitors on public `/chart` — console error on every anonymous chart view. (5) `disable_session_recording: true` (`PostHogProvider.tsx:98`) — no way to investigate why 100% of payers go silent.

## Goals

1. Unknown birth time → honest chart: no Ascendant, no houses, UI says so (MVP-rule compliance).
2. Email gate re-arms across sessions on dismissal, focuses the input, and states what the email buys.
3. ThreeCardSpread free-user click opens the paywall.
4. Anonymous `/chart` renders with zero console errors.
5. Session recordings on (masked), so the payer-silence question becomes answerable.

## Non-goals

- Recalculating existing stored charts (temp charts expire in 7d; the handful of saved rows keep stale data — accepted, documented).
- SynastryClient's `'12:00'` form DEFAULTS (`SynastryClient.tsx:48,58`) — user-editable initial state, different semantics.
- Gate copy A/B testing (needs traffic first).

## Decisions

- **D1. time:null at the 3 callsites.** Send `time: values.knowsBirthTime ? values.time : null` (and stop sending the schema-stripped `knowsBirthTime`/`ayanamsa` extras from HeroCalculator while touching it). `houseSystem` keeps its current `null`-when-unknown value (the schema transform to Placidus becomes irrelevant once houses aren't computed). Zero schema/engine changes — verified accepting today. Cosmetic companion: suppress the `chart.houseSystem` label when `houses === null` (`ChartDisplay.tsx:336` renders "Placidus · no houses" today).
- **D2. Gate re-arm = sessionStorage on dismiss, localStorage on submit.** Dismissal writes a `sessionStorage` flag (gate re-arms next browser session); successful email submit keeps the permanent `localStorage` flag (we have the email — never gate again). Alternative (per-chartId) rejected: same-session repeat calculations would re-gate immediately and feel hostile. `shouldShowGate()` (`HeroCalculator.tsx:208-219`) checks both stores; `EmailGateModal` gets `safeSetFlag(storage)` split accordingly (`onSubmitted` vs `onDismiss` already distinct callbacks at the call site).
- **D3. Gate focus + value tease.** Initial focus → the email input (`#email-gate-input`, ref swap at `EmailGateModal.tsx:113`); X button stays reachable via Tab/Escape (a11y unchanged otherwise). Copy (both locales): title "Your chart is ready — where do we send the details?"; subtitle names the concrete delta: "We'll email your full placements breakdown (Moon, rising & aspects) plus what they mean." Skip button stays (dark-pattern-free) but the value is now stated. ES: español neutro, tú form.
- **D4. ThreeCardSpread: keep the button visible, route free clicks to the paywall.** `handleInterpret` free branch → `setPaywallOpen(true)` (state + modal already wired at `:322-324`); Pro path unchanged. Chosen over CelticCross-parity (hiding the button) because a clicked button is the strongest paywall trigger and `PaywallCta trigger="three-card"` analytics already exist for the card below — add the same `trigger` context to the modal open.
- **D5. Anon 401: gate the fetch on Clerk.** `SubscriptionProvider` uses `useAuth()` (it mounts inside ClerkProvider in the `(app)` layout — verified; consistent with `feedback_clerk_provider_scope` since (app) is Clerk-wrapped): `isLoaded && !isSignedIn` → set free tier locally, no fetch; signed-in → fetch as today (focus revalidation same gate). Alternative (public endpoint returning free) rejected: an extra network round-trip per anon view for a constant answer.
- **D6. Session recordings ON, masked.** `disable_session_recording: false` + `session_recording: { maskAllInputs: true, maskTextSelector: '[data-ph-mask]' }`, and add `data-ph-mask` to the birth-data display surfaces that echo PII back (birth date/time/place text in ChartDisplay header + settings). Recording remains consent-gated by the existing init gate (accepted-only) — payers who declined stay invisible; that residual blindness is documented in the runbook. Verify recording quota on the PostHog free tier before enabling in prod (founder note).

## Error handling

- time:null path renders the dormant no-houses UI — regression-tested, not assumed.
- sessionStorage unavailable (private mode) → fall through to showing the gate (current localStorage catch pattern reused).
- useAuth not loaded → provider stays in loading state (no fetch, no flash of wrong tier).

## Testing

- Unit per callsite: fetch body asserts `time: null` when knowsBirthTime=false (HeroCalculator, BirthDataForm, ChartDisplay param path) and real time when true.
- ChartDisplay: `houses: null` chart → header shows noHouses without "Placidus"; houses checkbox absent; PositionTable rows lack Ascendant.
- EmailGateModal: dismiss → sessionStorage flag only; submit → localStorage; focus lands on input (jsdom focus assertion); new copy keys render both locales.
- ThreeCardSpread: free user click → modal opens (trigger three-card), NO fetch fired; Pro click → interpret fetch as today.
- SubscriptionProvider: signed-out → no fetch + free tier; signed-in → fetch (mock useAuth both ways).
- PostHogProvider: init options assert recording enabled + maskAllInputs (extend existing init test).

## Success criteria

- Time-unknown chart on prod shows no Ascendant/houses anywhere (chart, table, passport, AI teaser) — the ±0.01° claim stops being contradicted.
- Anon `/chart` console: zero 401s.
- Gate dismissal in one session shows the gate again next session; email input focused on open.
- Free-user tarot interpret click opens the paywall (PostHog `PAYWALL_OPENED` with three-card trigger appears).
- First payer session after ship has a masked recording in PostHog (consent permitting) — the day-one-silence investigation can start.
