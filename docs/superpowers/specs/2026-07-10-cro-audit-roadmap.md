# CRO Audit 2026-07-10 — Full Roadmap (every audit item → a sub-project)

**Source:** `outputs/cro-audit-2026-07-10/REPORT.md` (52-agent audit, 24 findings verified, 0 refuted).
**Companion:** `outputs/seo-audit-2026-07-06/REPORT.md` (only its P0 crash is absorbed here; the rest stays its own project).
**Method note:** decisions below are the recommended options from brainstorm 2026-07-10; founder pre-authorized recommended choices ("то что ты рекомендуешь то и делай"). Every sub-project gets its own spec + implementation plan; research for all of them was verified against the working tree by 17 parallel investigator agents on 2026-07-10.

## Sub-projects

| ID | Name | Spec | Gates |
|---|---|---|---|
| **Phase 0** | Relaunch blockers (4 P0 + instrumentation + ES pre-spend + tarot crash) | `2026-07-10-cro-phase0-relaunch-blockers-design.md` (plan exists) | gates ANY Meta re-spend |
| **SP-A** | Post-purchase activation & checkout routing | `2026-07-10-sp-a-postpurchase-activation-design.md` | after Phase 0; money-path P1s |
| **SP-B** | ES/LATAM conversion pack (Stripe-page + ES hygiene) | `2026-07-10-sp-b-es-latam-conversion-design.md` | gates ES re-spend |
| **SP-C** | Drip engine repair & trial-end save offer | `2026-07-10-sp-c-drip-repair-save-offer-design.md` | save offer needs Phase 0's P0-1 |
| **SP-D** | Product trust & retention mechanics | `2026-07-10-sp-d-product-trust-retention-design.md` | independent |
| **SP-E** | Landing & pricing message-match CRO | `2026-07-10-sp-e-landing-pricing-message-match-design.md` | ideally before re-spend (ads buy the landing) |
| **SP-F** | Consent compliance & repo hygiene | `2026-07-10-sp-f-consent-compliance-hygiene-design.md` | pixel gating ideally before re-spend |
| **Runbook** | Relaunch runbook (ops doc, no code) | `docs/runbooks/2026-07-relaunch.md` | after Phase 0 ships |

**Recommended execution order:** Phase 0 → SP-A → {SP-C, SP-D, SP-E, SP-F in parallel} → SP-B → ES re-spend. The runbook is written now, executed after Phase 0's deploy gate.

## Coverage matrix (audit item → owner)

**P0 (all → Phase 0):** P0-1 placeholder emails + backfills; P0-2 cookie-banner-over-CTA; P0-3 `chartId` dead handoff; P0-4 Link Instant Bank Payments + Stripe dashboard batch (founder checklist in Phase 0 plan Task 17).

**P1 money path:**
- PaywallModal annual default → Phase 0 (T6).
- `returnUrl` stripped by `checkoutBodySchema`; payers land on `/settings`; ES cancel → EN `/pricing`; `/checkout/complete` dead 8s poll (16 Stripe GETs); `useTranslations('checkout.complete')` namespace bug → **SP-A**.
- Stripe checkout page off-brand: public business name → Phase 0 founder checklist; Stripe **Product** display name/description ("Estrevia Premium" is dashboard-only, not in repo) → SP-A founder checklist; plan-name consistency in copy ("Locked behind Star" phantom tier, i18n + 3 hardcoded email templates) → **SP-E**.
- Trial-recovery stack dead for payers → unblocked by Phase 0 P0-1; pre-trial-end save offer → **SP-C**.

**P1 ES/LATAM:**
- Stripe-page leak 0.19× (USD framing, in-modal trust, local-currency evaluation) → **SP-B**.
- Two 'gratis' strings + modal l10n (5 strings + date) → Phase 0 (T9).
- ES ads → `/es/`, ES ad-set targeting → Phase 0 (T13).

**P1 instrumentation:**
- Locale super-prop `/essays/*` bug → Phase 0 (T10). Server `landing_view` → Phase 0 (T11). CAPI 422 → Phase 0 (T15).
- `_fbp` pre-consent / after Decline + "no third-party tracking" claim (LIVE-7) → **SP-F** (mechanism) + **SP-B** (banner copy i18n).

**P1 product/retention:**
- Fabricated noon Ascendant (`time:'12:00'` at 3 callsites) → **SP-D**.
- Payers don't use the product: post-purchase → chart redirect + paid-onboarding email → **SP-A**; session-recording instrumentation for the silence investigation → **SP-D**.
- Email gate permanent dismissal / close-button focus / zero value tease → **SP-D**.
- Above-fold `opacity:0` until hydration (LAND-2) → **SP-E**.
- Drip: bounce-suppression field mismatch (R-2), welcome NULL `resend_message_id` mechanism, `utm_content` missing, synastry_teaser unsub driver, ThreeCardSpread dead AI button → **SP-C** (drip/email items) + **SP-D** (ThreeCardSpread button — product surface).

**P2/P3 batch:**
- Pricing page (jargon H1, Free-above-Pro on mobile, annual preselect, 14-day vs 3-day copy collision) → **SP-E**.
- Message match (hero subtext vs proven hooks, "NASA-verified" overclaim in ad creative, heroTrust vs email gate) → **SP-E** (landing copy) + **Runbook** (ad creative recut).
- No human social proof → **SP-E** (decision: no fabricated testimonials at n≈1 payers; method-trust reframe now, real testimonials deferred).
- Dead paywall surfaces (synastry inline 0/9, essay "Read more" promise mismatch) → **SP-E**.
- chatgpt.com channel → SEO audit project (out of scope here); tarot crash absorbed into Phase 0 (T12).
- HALF50 wrap-up → commits ship in Phase 0 deploy; coupon re-cut as save offer → **SP-C**.
- Hygiene: ES cookie banner English + EN aria-labels + English calendar on /es/ → **SP-B**; anon `/chart` 401 console error → **SP-D**; drip `utm_content` → **SP-C**; welcome NULL msgid → **SP-C**; Drizzle journal drift + `.env.example` gaps → **SP-F**.

**Relaunch (week 1) plan of the audit** → **Runbook** (budgets, hooks, expectations, ES gate, monitoring cadence, break-even checkpoint after 2 weeks).

**Explicitly out of scope (audit's own exclusions, unchanged):** organic/SEO page-level CRO (sibling SEO audit), Clerk free sign-up flow, in-app cancel/churn UX, PWA install/push, consent accept-rate optimization, Sentry server errors, per-page ChatGPT-channel attribution, CAC→LTV model (build after 2 weeks of relaunch data).

## Key cross-cutting decisions (settled)

1. **No fabricated social proof.** With one active payer, testimonials would be fiction. Method-trust copy now; testimonial infrastructure when there are ≥10 happy payers to ask.
2. **USD stays the billing currency.** Local-currency `currency_options` would contradict every hardcoded price string and the AR-exclusion constraint; SP-B ships USD *framing* (US$ prefix + billed-in-USD note + refreshed FX equivalents); true multi-currency re-evaluated after 2 weeks of ES relaunch data.
3. **Pixel becomes consent-gated (SP-F).** Costs some measurable attribution below 100% consent-rate, buys an honest banner and GDPR/LIVE-7 compliance before scaled spend. Server CAPI unaffected.
4. **Save offer replaces cold blast.** The 250-lead exhausted pool gets NO new cold blast; the re-cut 50% coupon goes to trial-enders (reminder_1d) where purchase intent is proven. Drip T+21d synastry_teaser (6/10 lifetime unsubs) is retired.
5. **Monthly-first everywhere.** Phase 0 flips the modal; SP-E flips the pricing page toggle. Annual stays as the explicit upsell.
6. **Migration discipline unchanged:** hand-applied idempotent SQL via Pool+ws; journal reconciled (SP-F) but `db:migrate` stays non-authoritative.
