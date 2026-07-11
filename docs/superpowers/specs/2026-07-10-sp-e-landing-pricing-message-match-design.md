# SP-E — Landing & Pricing Message-Match CRO (Design)

**Date:** 2026-07-10 · **Status:** Approved (recommended-option authorization) · **Timing:** ship before Meta re-spend if possible — ads buy this landing
**Audit anchors:** REPORT.md P2 batch (pricing jargon H1, Free-above-Pro mobile, annual preselect, 14-day/3-day collision, "Locked behind Star"), message match (winning hooks unechoed; heroTrust contradicts the email gate), LAND-2 (above-fold `opacity:0` until hydration — blank first paint in slow-JS Meta in-app browsers, the exact browsers ads buy), dead paywall surfaces (synastry inline 0/9 opens, essay "Read more" promise mismatch), no human social proof.

## Problem

Verified in code: the entire above-fold renders `opacity:0` until an IntersectionObserver fires post-hydration (`LandingAnimations.tsx:50-106` inline `<style>`: `[data-section] [data-animate] { opacity: 0 }`; hero re-declared hidden at :78-81). Hero subtext buries the proven 24° hook in sentence two (`en.json:787`); the $1.14-CPL NASA hook has zero landing echo (the ONLY "NASA-verified" instance is the ad creative itself — `_create_creatives_2026_05_23.mjs:37`, an overclaim to fix at recut, owned by the runbook); `heroTrust` says "No account needed" while the email gate interposes. Pricing: H1 "Sidereal Vedic charts — Lahiri-accurate" (`en.json:984`) breaks message-match with every hook; Free card precedes Pro in a single mobile column (`PricingToggle.tsx:103-146`); annual preselected (`:36` — 0/6 lifetime conversions vs monthly 4/9); "risk-free for 14 days" (subheading) collides with "Start 3-Day Free Trial" in one viewport. "Locked behind Star" is a phantom tier (`paywall.cta.eyebrow`, en:1048/es:1051, + hardcoded in 3 teaser email templates). Synastry's inline paywall variant has 0/9 lifetime opens (`SynastryClient.tsx:233-239` — the only inline usage); essay "Read more" (`essays.readMore`) opens a paywall while promising free continuation. All "social proof" is spec numbers restyled ("Join astrologers…", `en.json:809-819`); zero testimonial components exist.

## Goals

1. First paint shows content (no opacity:0 above the fold); animations become enhancement, not gate.
2. Landing hero echoes the two proven hooks (24° / actual sky) without overclaiming; trust line stops contradicting the gate.
3. Pricing page: benefit-led H1, Pro-first on mobile, monthly default, guarantee copy that doesn't collide with the trial.
4. Phantom tier gone everywhere ("Included in Pro").
5. Dead paywall surfaces reworked (synastry → card variant; essay button honest).
6. Proof section honest: method-trust reframe now, real testimonials deferred (roadmap decision D1 — no fabrication at n≈1 payers).

## Non-goals

- Ad creative changes (NASA-verified headline recut) — relaunch runbook owns Meta-side work.
- New landing sections/redesign; this is copy + order + render-state surgery.
- `pricing.trialEndNote` client-date hydration quirk (noted, separate hygiene).

## Decisions

- **D1. Render-visible, animate-on-top.** Invert the base state in `LandingAnimations.tsx`: elements are visible by default; the hidden+transition state applies ONLY under a `[data-anims-armed]` attribute that the client component sets on the container synchronously on mount BEFORE observing (below-fold sections then animate in as today). Slow/failed JS = fully visible page, no animation. `prefers-reduced-motion` and `<noscript>` escapes stay. The hero section additionally NEVER enters the hidden state (above-fold exemption: its `data-animate` attrs are removed or excluded by selector) — first paint is content, always.
- **D2. Hero copy (both locales).** `heroSubtext` rewritten to lead with the hook: EN "Western horoscopes are off by 24°. The sky has drifted since the zodiac was frozen in 100 AD — sidereal astrology reads the constellations as they actually are tonight. Most people's real Sun sign is different." New proof line under the calculator (`landing.heroProof`): "Positions computed from Swiss Ephemeris — the professional standard, accurate to ±0.01°." (Deliberately NOT "NASA-verified"; policy line in `hooks-en.ts:201` — never imply NASA endorsement. "Actual sky" echo comes from the subtext.) `heroTrust` → "Free · No credit card · Under 60 seconds" (drops the gate-contradicting "No account needed"). ES: español neutro equivalents; sign names untranslated per style guide.
- **D3. Pricing.** H1 → EN "See your true sidereal chart" / subheading "Three days free, cancel anytime. 14-day money-back guarantee if you stay." (resolves the 14-vs-3 collision by making their relationship explicit — guarantee block at `pricing.guaranteeHeading/Subcopy` keeps its wording). Mobile order: Pro card first (`order-1 md:order-2`-style utility swap in `PricingToggle.tsx:103-222`, desktop order unchanged: Free left, Pro right). Default billing → `useState<'monthly' | 'annual'>('monthly')` (`:36`), consistent with Phase 0's modal flip. Jargon ("Lahiri-accurate") moves to the trust row where it belongs (`trustLahiri` already exists).
- **D4. Phantom tier:** `paywall.cta.eyebrow` → EN "Included in Pro" / ES "Incluido en Pro"; the 3 hardcoded email eyebrows (`LeadPaywallTeaser{,B,C}Email.tsx`) same string.
- **D5. Synastry paywall:** `variant="inline"` → `variant="card"` at `SynastryClient.tsx:233-239` (the 0/9 variant dies; card variant has measured opens on 3 other surfaces); subline copy sharpened: "See how your two charts actually interact — full AI reading with Pro."
- **D6. Essay button honest:** new key `essays.unlockFull` = EN "Unlock the full essay" / ES "Desbloquea el ensayo completo"; `EssayPageClient.tsx:44-55` uses it (leave `readMore` key in place for any other consumers; grep says the button is the only one — then retire the key in the same commit if truly unused).
- **D7. Proof reframe:** `statsHeading` → EN "Built on the ephemeris professional astrologers trust" (drops the unearned "Join astrologers…" social frame); stat tiles stay (they're honest specs). A `TESTIMONIALS.md` note in the spec dir records the trigger for real proof: ≥10 retained payers → in-app ask + curated quotes component (deferred).

## Error handling

- D1 is the risk item: a broken `data-anims-armed` selector must fail VISIBLE (base state visible by construction — the failure mode is "no animation", never "no content"). E2E asserts hero text is visible with JS disabled-equivalent (before hydration).

## Testing

- E2E (extends `tests/e2e/landing.spec.ts`): hero H1/subtext visible at `domcontentloaded` (no waiting for hydration); no `opacity: 0` computed style on hero nodes at first paint.
- Unit: PricingToggle default billing = monthly; DOM order assertion for mobile card order (Pro before Free in source order given the order-utility approach — assert computed classes); PaywallCta card variant renders "Included in Pro".
- Unit: SynastryClient renders card-variant CTA for free users; EssayPageClient button label = unlockFull key.
- i18n completeness: new/changed keys exist in BOTH `messages/en.json` and `messages/es.json` (test iterates the pairs).
- Full suite + typecheck + lint.

## Success criteria

- Landing first contentful paint contains the H1 text (verify via Lighthouse/e2e, esp. throttled).
- Ad hook → landing message match: 24° in sentence one; ephemeris proof line near the calculator; no gate-contradicting trust copy.
- Pricing mobile shows Pro CTA in viewport 1; monthly preselected everywhere.
- "Star" appears nowhere user-visible; synastry paywall opens start registering (trigger `synastry-ai` in PostHog); essay CTA label matches what happens.
