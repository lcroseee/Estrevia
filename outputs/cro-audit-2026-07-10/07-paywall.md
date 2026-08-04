# CRO Audit 2026-07-10 — Sector 07: Paywalls (in-product upgrade moments)

**Scope:** PaywallModal, PaywallCta, ChartReadingSection (natal-chart), CelticCross, ThreeCardSpread, SynastryClient (AI analysis), EssayPageClient, plus the click path from paywall tap → Stripe payment page. Both locales (messages/en.json, messages/es.json).
**Windows:** (A) 2026-05-29 → 2026-07-10 (audit window, ~6wk, ads dark the whole time → tiny volume); (B) 2026-05-13 → now (since the paywall-CRO ship, the full life of these surfaces — used for per-surface rates). Every number states its source + window.
**Method:** read-only. PostHog HogQL (`scripts/advertising/_cro_audit_2026_07_10_paywall_funnel.mjs`, `_cro_audit_2026_07_10_paywall_locale_fix.mjs`), Stripe GET (`_cro_audit_2026_07_10_paywall_stripe_plans.mjs`), code reading. No email, no capture, no writes.
**Baseline:** `outputs/ad-audit-2026-05-29/REPORT.md`.

---

## TL;DR

The in-product paywalls are the funnel's **primary revenue driver** — they originate 54 of 70 `paywall_trial_clicked` events since 05-13 (77%; the rest come from /pricing, source PostHog). The natal-chart surface works well mechanically (uniques since 05-13: 141 CTA-viewed → 46 opened → 31 clicked → 28 Stripe-redirected). But four things bleed conversions: **(1) the modal defaults every user to the $34.99 annual plan, and annual trials have converted 0/6 lifetime vs 4/9 monthly (Stripe, all-time)** — for an audience whose trial-end failures are `insufficient_funds`, the default is provably the wrong plan; **(2) the 05-29 audit's ES CTA fix (finding #6) shipped only half** — the modal button that actually starts checkout still reads "Comenzar prueba de 3 días" (no "gratis"), and ES modal→click runs 60% vs EN 77%; **(3) post-payment/post-cancel routing throws away the user's context** — `returnUrl` is silently dropped by the checkout API, payers land on /settings instead of the reading they paid for (tarot spreads are unrecoverable client state), and Stripe's cancel button dumps ES users onto the EN /pricing page; **(4) two surfaces are functionally broken:** ThreeCardSpread shows free users an "AI interpretation" button that silently does nothing (`if (!isPro) return;`), and the synastry inline CTA has **0 opens from 9 unique impressions all-time**. Bonus: the post-payment fallback page references a non-existent i18n namespace and renders raw keys.

---

## 1. Surface inventory & measured funnel

### 1.1 Per-trigger funnel — uniques, 2026-05-13 → 2026-07-10 (PostHog HogQL, events `paywall_cta_viewed → paywall_opened → paywall_trial_clicked → checkout_stripe_redirected`)

| Surface (trigger) | CTA unit | cta_viewed | opened | clicked | stripe | view→open | open→click |
|---|---|---|---|---|---|---|---|
| natal-chart (chart page) | PaywallCta card | 141 | 46 | 31 | 28 | 33% | **67%** |
| three-card (/tarot/spread) | PaywallCta card | 16 | 4 | 4 | 3 | 25% | 100% |
| celtic-cross (/tarot/spread) | PaywallCta card | 11 | 5 | 4 | 4 | 45% | 80% |
| synastry-ai | PaywallCta **inline** | 9 | **0** | 0 | 0 | **0%** | — |
| essay | custom "Read more" button (no impression event) | n/a | 9 (15 opens) | 1 | 1 | unmeasurable | **11% (1/9 users; 1/15 opens)** |
| (/pricing, for comparison — `source:'pricing'`, no trigger) | — | — | — | 9 | 8 | | |

Audit window (05-29 → now) is directionally identical at ~1/10 volume (18u natal-chart cta_viewed, 2 Stripe redirects) — the account has been dark since 05-24, so all traffic is drip/organic.

### 1.2 Locale split, corrected (uniques since 05-13; locale derived from `$pathname` prefix `/es/` — the `locale` super-prop race makes the property unreliable; note 15 essay-modal opens on EN paths carry `locale='es'`)

| loc | trigger | cta_u | opened_u | clicked_u | stripe_u | open→click |
|---|---|---|---|---|---|---|
| en | natal-chart | 75 | 22 (29%) | 17 | 15 | **77%** |
| es | natal-chart | 68 | 25 (37%) | 15 | 13 | **60%** |
| en | synastry-ai | 8 | 0 | 0 | 0 | — |
| es | essay | 0 | 9 | 1 | 1 | 11% |

**Key synthesis for the known "ES breaks at paywall_click" data point:** ES users open the modal *more* than EN (37% vs 29% of CTA impressions) but click the trial button *less* once inside (60% vs 77%). The ES break is **inside the modal**, not at the CTA — consistent with the three ES-modal defects in Finding STR-2 below (no "gratis" on the button, en-US date in the trust line, English error/loading strings). The pre-Stripe path itself does not differ by locale (same components, same API).

### 1.3 Stripe reality check (Stripe API `subscriptions.list` status=all, all-time, N=15; `checkout.sessions.list` created ≥ 05-29)

- **Plan mix vs payment:** 9 monthly subs ever → **4 paid > $0**; 6 annual ($34.99) subs ever → **0 paid, ever**. All 6 annual trials ended $0.00 (canceled or charge-failed).
- Audit window: 9 checkout sessions since 05-29 → 2 completed (both $0 trial starts): 06-07 (monthly — now **active, $9.98 collected**, the only recurring customer, MRR $4.99 unchanged vs baseline) and 06-16 (annual, `utm_source=meta`, `utm_content=10yyJJib6…` = drip/lead attribution — canceled 07-03, $0). 1 ES-419 session, expired unpaid.
- 6 of 9 window sessions expired unpaid → Stripe-page abandonment is still the dominant leak *after* the paywall does its job.

---

## 2. Findings (ranked)

### STR-1 · P1 — Modal defaults to the $34.99 annual plan; annual trials have never converted: 0/6 lifetime vs 4/9 monthly
**Evidence:** `PaywallModal.tsx:52` — `useState<'pro_monthly'|'pro_annual'>('pro_annual')`; the big gold price the user sees first is **$34.99**. Stripe (all-time): monthly 9 subs → 4 paid; annual 6 subs → 0 paid, $0.00 total. PostHog plan-at-click since 05-13: pro_annual 43 events vs pro_monthly 27 — the default mostly sticks. The 05-29 audit established the failure mode of this audience: trial-end declines are 4/5 `insufficient_funds` — a $34.99 off-session charge is strictly harder to clear than $4.99. The paywall is steering the majority of trial starts into the only plan that has never produced a dollar.
**Load-bearing number:** **0/6 annual trials ever paid; 4/9 monthly did** (Stripe subscriptions.list, all-time).
**Fix (1 line + copy):** default `plan` to `pro_monthly` in PaywallModal (in-product paywalls = low-commitment entry point); keep the annual toggle + Save-42% badge as the upsell. Optionally keep annual default on /pricing only, where intent is higher. Re-evaluate after 10+ more trials.

### STR-2 · P1 — ES modal is the leaky half of "ES breaks at paywall_click": 05-29 audit fix #6 shipped only for the outer CTA, not the modal
**Evidence:** messages/es.json — `paywall.cta.ctaLabel` = "Comienza tu prueba gratis de 3 días" (fixed ✅) but `paywall.trialCta` — **the button that actually creates the checkout session** — is still "Comenzar prueba de 3 días" (no "gratis", infinitive not tú-imperative), and `pricing.startTrial` likewise. Compounding, in `PaywallModal.tsx`: `formatTrialEndDate()` (line 37-45) hardcodes `'en-US'` so the ES trust line renders "No se te cobrará hasta el **Jul 13, 2026**"; the loading label `'Redirecting...'` (line 279) and all three error strings (lines 128/133/143) are hardcoded English — while translated equivalents already exist at `pricingPage.redirecting` / `errUnexpected` / `errGeneric` / `errNetwork` and PricingToggle already formats the date locale-aware (`PricingToggle.tsx:40-48`).
**Load-bearing number:** ES modal open→click **60% vs EN 77%** (uniques since 05-13, PostHog §1.2) — ~-17pp inside the modal on the second-biggest paywall locale.
**Fix:** (a) es.json one-liners: `paywall.trialCta` + `pricing.startTrial` → "Comienza tu prueba gratis de 3 días"; (b) pass locale to `toLocaleDateString` as PricingToggle does; (c) replace 4 hardcoded strings with the existing `pricingPage.*` keys.

### STR-3 · P1 — Post-payment and post-cancel routing discards the user's context; `returnUrl` is a dead parameter end-to-end
**Evidence:** PaywallModal sends `returnUrl` in the POST body (`PaywallModal.tsx:121`), but `checkoutBodySchema` (`api/v1/stripe/checkout/route.ts:35-46`) has no `returnUrl` field — zod strips it silently. `success_url` is hardcoded to `/checkout/complete?session_id=…` (lines 294, 408) and the post-sign-in redirect is hardcoded `redirect_url='/settings'` (`checkout/complete/page.tsx:69`, `CheckoutCompleteClient.tsx:29`). So a user who pays from the Celtic-Cross paywall lands on **Settings**, and the 10-card spread that made them pay is unmounted client state — **unrecoverable**; they must re-draw. Same for three-card and synastry (result state lost); chart survives only because /chart re-derives it. Meanwhile `cancel_url` is hardcoded `${appUrl}/pricing` (lines 295, 409) with **no locale prefix**: an ES user who taps "back" on the Stripe page exits to the **English** /pricing page instead of returning to their chart/spread with the modal context.
**Load-bearing number:** 100% of paywall-originated checkouts (28 Stripe redirects from natal-chart alone since 05-13) hit this path; 6/9 window sessions expired unpaid, and the cancel path offers zero road back to the conversion context.
**Fix:** validate `returnUrl` server-side (same-origin path allowlist), store it in session `metadata.return_to`, use it for (a) `cancel_url` = `${appUrl}${localePrefix}${returnUrl}` and (b) the post-ticket `redirect_url` instead of `/settings`. For tarot, persist the last drawn spread (the three-card flow already POSTs to `/api/v1/tarot/daily` — reuse it) so the paid promise "get the full interpretation of *this* spread" is actually deliverable after redirect.

### STR-4 · P1 — ThreeCardSpread shows free users a prominent "AI interpretation" button that silently does nothing
**Evidence:** `ThreeCardSpread.tsx:199-217` renders the purple "AI interpretation" button for **all** users once 3 cards are revealed (no `isPro` condition); `handleInterpret` line 90: `if (!isPro) return;` — a free user's tap produces no modal, no navigation, no error. The real paywall CTA sits *below* it. Two competing CTAs, the more button-like one inert.
**Load-bearing number:** three-card view→open is **25% (4/16 uniques)** vs 45% on the visually identical celtic-cross card on the same page — the inert button is the only structural difference between the two flows.
**Fix (3 lines):** for `!isPro`, make the button call `setPaywallOpen(true)` (trigger `three-card`) — an inert control at a paywall moment is the single worst pattern in the framework (dead-end). Alternatively hide it and let PaywallCta be the only CTA.

### STR-5 · P1 — Post-payment fallback page renders raw i18n keys: `checkout.complete` namespace doesn't exist
**Evidence:** `checkout/complete/page.tsx:73` and `CheckoutCompleteClient.tsx:21` call `useTranslations('checkout.complete')`, but the messages live at **`pricingPage.checkout.complete`** (messages/en.json:1012-1033; verified no top-level `checkout` key in either locale). next-intl's production fallback renders the raw key path — a user whose sign-in ticket isn't ready within the 8s server poll sees "checkout.complete.title" / "checkout.complete.redirecting" as page copy, in both locales, *immediately after paying*. Tests never caught it because they `vi.mock('next-intl')` wholesale.
**Load-bearing number:** 23 `checkout_ticket_timeout` events since 05-13 (PostHog) — each one is a payer who sat ≥30s on this garbled fallback (all pre-05-25, i.e., the anon-sign-in-bug era; post-fix frequency is low but the safety net for every future webhook delay is still broken).
**Fix (1 line):** namespace → `pricingPage.checkout.complete` (or hoist the block to a real top-level `checkout` namespace in both locale files); add one render test with real messages.

### STR-6 · P2 — Synastry paywall is a dead surface: 0 opens from 9 unique impressions, all-time
**Evidence:** PostHog since 05-13: `synastry-ai` cta_viewed 9u → opened 0. It is the only surface using `variant="inline"` (`SynastryClient.tsx:234-238`) — a text-xs button in a thin strip, below the full free result (scores + aspects), with the generic subline "Get a detailed analysis of how your charts interact." Every card-variant surface converts 25-45% view→open; the inline variant converts 0%.
**Load-bearing number:** **0/9** view→open (vs 33% weighted average for the card variant).
**Fix:** switch to `variant="card"`, and make the tease concrete — synastry is the emotionally hottest surface (two real people). Rewrites in §4. Value-then-block is already generous (full scores free); the block just needs to look like a door instead of a footnote.

### STR-7 · P2 — Essay paywall: "Read more" promises free continuation, modal asks for money — 1 click from 15 opens
**Evidence:** `EssayPageClient.tsx:44-55` — essay truncated at 60vh with a gradient fade and a gold button labeled `essays.readMore` = "Read more"/"Leer más" — pure continuation language with no Pro/trial signal; tap opens the payment modal. Open→click = **1/15 opens (9 uniques)** since 05-13 vs 67% on natal-chart. This surface also bypasses PaywallCta entirely, so it fires no `paywall_cta_viewed` — view→open is unmeasurable (essay is the SEO growth surface; 466-page sitemap ships traffic here first).
**Load-bearing number:** essay modal open→click **6.7% (1/15)** — 10× worse than the natal-chart modal.
**Fix:** label honestly + add value scent (rewrites in §4); replace the bare button with the standard PaywallCta card over the fade (gets impression tracking for free and adds the contextual subline). Add `cta.subline.essay` (key currently missing — only unused because essays skip PaywallCta).

### STR-8 · P2 — "Locked behind Star": paywall eyebrow names a tier that doesn't exist, in loss-framing, on 223 impressions
**Evidence:** `paywall.cta.eyebrow` = "Locked behind Star" / ES "Bloqueado tras Star" (messages, commit de3cea5). The product's only paid tier is **Pro** — "Star" appears nowhere else in src/. This is the first line of the card-variant PaywallCta shown on natal-chart/tarot (223 `paywall_cta_viewed` events, 141u, since 05-13, PostHog). ES reads as broken output. Loss-framing ("Locked behind") where possession-framing measurably outperforms at paywalls.
**Load-bearing number:** 223 impressions of a non-existent plan name on the funnel's highest-intent unit.
**Fix:** rewrites in §4 (e.g. "Estrevia Pro · 3-day free trial").

### STR-9 · P2 — Modal: primary CTA below a 10-item feature list; no cancel-anytime or trust signal at the decision point
**Evidence:** `PaywallModal.tsx:176-292` order: header → plan toggle → price → **10 features** → CTA → fine print. 86% of modal opens are Mobile (74/86 since 05-13, PostHog device split); on a bottom sheet at `max-h-[90vh]` the CTA needs a scroll on small phones. The only objection-handler is `noCharge` ("You won't be charged until {date}") — no "cancel anytime", no "Payments by Stripe", no 14-day guarantee, although translated strings already exist (`pricing.trialEndNote` = "Cancel anytime. You won't be charged until {date}.", `pricing.trustNote`, `pricing.guaranteeHeading`) and are shown on /pricing. The 10 items also dilute relevance: a tarot-triggered user scans 6 irrelevant rows before the one they care about.
**Load-bearing number:** 74/86 modal opens are mobile; overall open→click 68% means ~1 in 3 openers still bails inside the modal.
**Fix:** show 4-5 features max, led by the trigger-relevant one (map trigger→ordering); swap `noCharge` → `trialEndNote`; add one trust microline under the CTA ("Payments by Stripe · Cancel anytime" — both strings exist in both locales).

### STR-10 · P3 — Modal subtitle "Continue reading with Estrevia Pro" is wrong for non-reading triggers; dead `alreadyPro` key
**Evidence:** `paywall.subtitle` renders under every contextual headline, including tarot/synastry where nothing is being "read". `paywall.alreadyPro` has zero references in src/. Cosmetic; fix during the STR-8 copy pass (subtitle per-trigger or neutral "Todo Estrevia, sin límites").

---

## 3. Click path — paywall tap → Stripe payment page (question e)

1. **Tap 1:** PaywallCta button (card/inline) or essay "Read more" → `PaywallModal` opens client-side, instantly. (`paywall_opened`)
2. **Tap 2:** modal "Start 3-Day Free Trial" → `POST /api/v1/stripe/checkout` (~1-2s) → `window.location` to Stripe hosted checkout. (`paywall_trial_clicked` → `checkout_stripe_redirected`)
3. Stripe page: anon users get email prefilled from `email_leads` via `anonymous_id` cookie; `card`+`link` only; ES callers get `es-419` + LATAM currency `custom_text`.

**= 2 in-app taps to the payment page. This is good** — price + trial terms are stated *at* the paywall (no /pricing detour), the offer framing question (b) passes. No double-gating (g): the email gate fires earlier at chart-calc; the paywall never re-asks email; anon users are never sent through sign-up before paying (account is auto-materialized post-payment via sign-in ticket). The path's defects are at the *edges*: entry copy (STR-2/4/6/7/8) and exit routing (STR-3/5).

---

## 4. Copy rewrites (EN + ES)

### 4.1 Weakest CTA — ES modal `paywall.trialCta` (currently "Comenzar prueba de 3 días")
| # | ES | EN equivalent | Rationale |
|---|---|---|---|
| V1 | **"Comienza tu prueba gratis de 3 días"** | Start 3-Day Free Trial (unchanged) | Parity fix: adds the missing "gratis" + tú-imperative; matches the already-shipped outer-CTA string, so the modal stops *removing* the free signal at the decision point. |
| V2 | "Prueba Pro gratis por 3 días" | Try Pro free for 3 days | Value-language ("prueba", "gratis") over action-language; shorter for the mobile sheet. |
| V3 | "Desbloquear todo — 3 días gratis" | Unlock everything — 3 days free | Outcome-first; mirrors the modal headline verb ("Desbloquea"), keeps risk-reversal in the same glance. |

### 4.2 Weakest teaser — synastry inline subline (currently "Get a detailed analysis of how your charts interact." — 0/9 opens)
| # | EN | ES | Rationale |
|---|---|---|---|
| V1 | "The scores say *what*. The AI reading says *why* — and what to watch out for." | "Los puntajes dicen qué. La lectura IA dice por qué — y qué cuidar." | Bridges from the free value they just consumed (scores) to a concrete gap it leaves open; curiosity + specificity. |
| V2 | "See why you two scored this way — strengths, friction points, and how to handle them." | "Descubre por qué obtuvieron este puntaje — fortalezas, fricciones y cómo manejarlas." | Second-person-plural possession ("you two") — synastry is about a real relationship; names 3 concrete deliverables. |
| V3 | "Your charts already answered. Get the full reading of what {Sun}×{Sun} actually means for you." | "Tus cartas ya respondieron. Obtén la lectura completa de lo que realmente significa para ustedes." | Possession-framing (reading exists, is *theirs*); if interpolating sign pairs is cheap, specificity beats everything above. |
*Plus: switch `variant="inline"` → `"card"` (STR-6) — copy alone won't fix a 0/9 unit.*

### 4.3 Essay button (currently "Read more" — 1/15 modal clicks)
| # | EN | ES | Rationale |
|---|---|---|---|
| V1 | "Continue reading — 3-day free trial" | "Sigue leyendo — prueba gratis de 3 días" | Keeps continuation intent but discloses the trial *before* the tap → modal stops feeling like a bait-and-switch; openers arrive pre-qualified. |
| V2 | "Unlock the full essay" | "Desbloquea el ensayo completo" | Expectation-consistent with the modal headline (`contextualTitles.essay`); one voice across tap → modal. |
| V3 | Keep "Read more", render the standard PaywallCta card over the fade beneath it | — | Structural: restores impression tracking + contextual subline; new key `cta.subline.essay`: EN "The remaining {n} paragraphs cover placements, dignities, and practical guidance." / ES "Los párrafos restantes cubren posiciones, dignidades y guía práctica." |

### 4.4 Eyebrow `paywall.cta.eyebrow` (currently "Locked behind Star" / "Bloqueado tras Star")
| # | EN | ES | Rationale |
|---|---|---|---|
| V1 | "Estrevia Pro · 3-day free trial" | "Estrevia Pro · 3 días gratis" | Kills the phantom "Star" tier; puts risk-reversal at first glance, before the headline. |
| V2 | "Your reading is ready" | "Tu lectura está lista" | Possession-framing — the AI reading already exists for *their* chart; strongest pattern for generated-content paywalls. |
| V3 | "Pro reading" | "Lectura Pro" | Minimal, label-honest; safe default if V2 feels overpromising for tarot surfaces. |

---

## 5. Assessment matrix (questions a-g per surface)

| Surface | (a) value-then-block | (b) offer at paywall | (c) CTA copy | (d) objections | (f) consistency |
|---|---|---|---|---|---|
| natal-chart | ✅ best-in-app: personalized Sun/Moon/Asc one-liners + blurred block + "10 more planets…" label | ✅ trial on button, price in modal | ✅ EN / ⚠️ ES (STR-2) | ⚠️ modal-only, thin (STR-9) | reference implementation |
| celtic-cross | ✅ generous: full 10-card draw + per-card meanings free | ✅ | ⚠️ eyebrow (STR-8) | ⚠️ | consistent (card) |
| three-card | ✅ 3 cards + meanings free | ✅ | 🔴 inert competing button (STR-4) | ⚠️ | consistent except dead CTA |
| synastry-ai | ✅ full scores + aspects free | ⚠️ trial only on tiny button | 🔴 0/9 (STR-6) | ⚠️ | ❌ only inline variant |
| essay | ✅ 60vh of essay | 🔴 no signal before tap (STR-7) | 🔴 "Read more" | ⚠️ | ❌ bypasses PaywallCta, no impression event |

(e) 2 taps to Stripe everywhere — good. (g) no stacked gates pre-payment; dead-ends exist post-payment (STR-3) and at the inert three-card button (STR-4).

---

## 6. Re-check metrics (after fixes, once ads are re-enabled)

| Metric | Now (since 05-13) | Target | Source |
|---|---|---|---|
| ES modal open→click | 60% | ≥ 75% (EN parity) | PostHog per-trigger × pathname-locale |
| synastry view→open | 0/9 | ≥ 20% | `paywall_cta_viewed`/`paywall_opened` trigger=synastry-ai |
| essay modal open→click | 6.7% | ≥ 30% | trigger=essay |
| monthly share of trial starts | 27/70 clicks | ≥ 70% | `paywall_trial_clicked.plan` |
| trial→paid (next 10 trials) | 4/15 lifetime | > 40% (gate for ad rescale, per 05-29 audit) | Stripe subs + invoices |
| checkout_ticket_timeout w/ raw-key UI | 23 lifetime | 0 (namespace fixed) | PostHog |

## Artifacts
- Probes (new, uncommitted, read-only): `scripts/advertising/_cro_audit_2026_07_10_paywall_funnel.mjs`, `_cro_audit_2026_07_10_paywall_locale_fix.mjs`, `_cro_audit_2026_07_10_paywall_stripe_plans.mjs`
- Known caveat honored: locale super-prop race → locale derived from `$pathname`; first-pass query had a `'/es%'`-matches-`/essays` bug, corrected in the `_locale_fix` script (both outputs preserved above).
