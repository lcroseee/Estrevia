# Advertising / marketing audit — improvements roadmap

**Date:** 2026-05-17
**Author:** Kirill (founder) + Claude (audit pass)
**Status:** Spec (approved 2026-05-17). Wave 1 detailed design lives in a separate spec.

---

## 1. Context

### 1.1. What is shipped / GREEN (2026-05-17)

- **Meta Lead campaign** `OUTCOME_LEADS` is ACTIVE: $50/day total (EN+ES adsets at $25 each), 22 leads/day, CPL $0.60 ES / $1.44 EN.
- **Meta LPV campaign** PAUSED (0 spend).
- **Pixel + CSP + CAPI** healed end-to-end (commit `9318183`, 2026-05-13). 22 `fb_pixel_lead` events today.
- **Lead capture** working: 33 leads/day in `email_leads`.
- **Lead nurture drip** T+0 (chart) / T+24h (Moon+Asc) / T+72h (paywall teaser) shipped (commits `0ab4f89`, `30a1811`, `7c9e30f`, 2026-05-17).
- **Sev1 fix** for nurture send pipeline shipped (`c94316f`, 2026-05-17): `sendLead*Email` now throws on `result.error`; `tryInsertOneShotLead` distinguishes `new` / `retry` / `delivered`.
- **PostHog** US region + reverse proxy `/ingest` + heatmaps + web vitals (commit `de2ae9c`).
- **Paywall CRO** for Celtic / 3-card / Synastry shipped (2026-05-13). Chart Reading paywall + `/api/v1/chart/interpret` shipped (`99a536b`, 2026-05-17).
- **Advertising agent** OFF: `ENABLED=false`, `DRY_RUN=true` per v3b plan. Manual ops.

### 1.2. Current pains (after morning + evening audit)

| Pain | Severity | Layer |
|---|---|---|
| 4 EN ad creatives at 0 leads; only `en_combinations` works | Med | Top |
| EN CPL $1.44 vs ES $0.60 = 2.4× gap | Med | Top |
| ES `Swiss Ephemeris` creative 14% LPV→Lead vs 30-40% peers | S | Top |
| 3 organic referrals/day from `chatgpt.com` — not instrumented | Med (blind) | Top |
| ES adset may not target MX (largest LATAM market) | Med | Top |
| Email gate `chart_calc → email_leads` ratio unknown | Med (blind) | Mid |
| No drip after T+72h paywall teaser | High (long-term) | Mid |
| No EN/ES or hot/cold segmentation in nurture | Med | Mid |
| `chart_readings = 0` — Pro upgrade unknown (technical or UX block?) | Critical | Bottom |
| Per-paywall conversion not instrumented (Celtic/3-card/Synastry/Reading) | Critical (blind) | Bottom |
| Pricing page has no anchoring / guarantee / social proof | Med | Bottom |
| No read-only Resend key → delivery rate unmeasurable | Med (blind) | Obs |
| No CAC + LTV dashboard → scaling decisions un-grounded | High | Obs |
| No A/B test infra → improvements can't be measured | High | Obs |
| Cosmic Passport viral mechanic uninstrumented | High (long-term) | Strategy |
| Advertising agent built but not running | Med (long-term) | Strategy |

### 1.3. Constraints (immutable for this roadmap)

- Solo founder, Russian-speaking; code/commits English.
- Customer-conversion path = #1 priority (per memory).
- MVP feature-complete; do not add new astrology features.
- AGPL code / proprietary `content/` license split.
- PII (birth date/time/location) AES-256-GCM encrypted; not in URLs/logs/state.
- Lahiri ayanamsa + Placidus + 12 bodies only.
- ES = español neutro LATAM, tú form; sign names untranslated.
- Telegram approval flow exists for tier-2 ad actions; founder retains kill switch.
- Spend cap $80/day (per `ADVERTISING_DAILY_SPEND_CAP_USD`).

---

## 2. Approach

- **Layer-first** structure: L1 (Top) → L2 (Mid) → L3 (Bottom) → L4 (Observability) → L5 (Strategy).
- Each item tagged with:
  - `[Wave N]` — when (Wave 1 = this sprint, Wave 2 = 2-4 weeks, Wave 3 = quarter)
  - `[lever]` — what business metric it moves (CPL / lead-volume / conversion / LTV / viral / observability / operating-leverage)
  - `[skill]` — which `marketing-skills:*` lens applies
- Items are designed to be **independently spec-able**: each Wave 1 item should fit in its own implementation plan; Wave 2/3 items are roadmap-level and will be re-spec'd later.

---

## 3. L1. Top of funnel — acquisition

**Position:** OUTCOME_LEADS active $50/day, 22 leads/day. Pixel/CAPI healed. 7 organic + 3 chatgpt.com referrals/day (uninstrumented). Advertising agent OFF — manual optimization.

### L1-A. EN creative refresh (reciprocity / accuracy_gap) — `[Wave 1]` `[paid-ads + ad-creative + marketing-psychology]`

- **Diagnosis:** 4 EN creatives (`en_passport`, `en_lahiri`, `en_swiss`, `en_lead_v1`) at 0 leads with non-zero impressions. Only `en_combinations` works. CPL EN $1.44 vs ES $0.60 = 2.4× gap.
- **Hypothesis:** "passport"-angle too abstract for US; "Lahiri" = jargon; "Swiss Ephemeris" = proof point not hook. `en_combinations` works because it promises outcome.
- **Action:** Launch 3-4 new EN hooks via `reciprocity` and `accuracy_gap` archetypes (already shipped 2026-05-11). Use `getEligibleHooks` for batch.
- **Impact:** lever=CPL. If EN CPL → ES level ($0.60) at same $25/day: 41 leads/day EN vs 17 (+24/day, $0 extra spend).
- **Effort:** S (1-2 days).

### L1-B. Pause / replace ES `Swiss Ephemeris` ad — `[Wave 1]` `[paid-ads]`

- **Diagnosis:** `ad_lead_es_swiss_2026-05-17`: 14 LPV → 2 Lead = 14% vs ES peers 30-40%.
- **Action:** Pause after 7d learning window (per `feedback_meta_learning_phase` — don't kill ads with <7d days_running or <50 conversions). Replace with ES Identity-Reveal or Peer-Discovery hook.
- **Impact:** lever=CPL. Small, frees spend for working ads.
- **Effort:** XS (5 min Ads Manager + new creative).

### L1-C. Geo expansion ES (MX / CO / PE / CL) — `[Wave 2]` `[paid-ads + customer-research]`

- **Diagnosis:** ES adset may not target MX (largest LATAM market). AR is correctly excluded (Stripe-USD broken).
- **Action:** Run `_audit_double_check.mjs` to confirm. If MX absent, add MX/CO/PE/CL. Test: MX-only adset $10/day 7d → if CPL ≤ $1, scale.
- **Impact:** lever=lead-volume. Potentially +50-80% ES lead-volume at same CPL.
- **Effort:** S (1d verify + launch).

### L1-D. Subscribe upgrade event (Pixel + CAPI) — `[Wave 2]` `[paid-ads + analytics-tracking + launch-strategy]`

- **Diagnosis:** Campaign optimizes on Lead (cheap but cold). Meta doesn't learn from Subscribe/Purchase. Memory says "deferred until events accumulate" — at 22 leads/day × ~5% Lead→Pro = 1 Subscribe/day. Need ≥150 Subscribe events/week for stable Meta learning.
- **Action:** Wave 2 prep (CAPI Subscribe event hook in Stripe webhook + Pixel browser-fire). Launch Subscribe-optimized campaign when ≥150 events/week (post-Wave 2).
- **Impact:** lever=CAC. Subscribe-optimized: fewer leads, but qualified. Long-term CAC drops.
- **Effort:** M (3-5d).

### L1-E. AEO inbound instrumentation — `[Wave 2]` `[ai-seo + analytics-tracking]`

- **Diagnosis:** 3 referrals/day from chatgpt.com — blind spot. AI-search inbound growing 20-30%/mo globally.
- **Action:** PostHog dashboard with referrer breakdown (`chatgpt.com` / `perplexity.ai` / `gemini.google.com` / `claude.ai`). Cross-reference with landed page. Optimize cited pages.
- **Impact:** lever=lead-volume + free. Potential free channel if cited pages converge.
- **Effort:** S (1d dashboard + initial analysis).

### L1-F. Cosmic Passport viral loop instrumentation — `[Wave 3]` `[referral-program + community-marketing]`

- **Diagnosis:** Cosmic Passport is main viral hook per MVP positioning. No data on share rate, downstream inbound, or referral conversion.
- **Action:** PostHog `share_clicked`, `utm_source=passport` on shared cards. After 2 weeks of data, A/B test card variants.
- **Impact:** lever=viral. If viral coefficient > 0.5, organic compounds CAC toward zero.
- **Effort:** M (3-5d instrumentation; iteration L spread).

### L1-G. Advertising agent boot mode — `[Wave 3]` `[paid-ads + revops]`

- **Diagnosis:** Senior buyer agent ready (`v3b shipped`) but `ENABLED=false, DRY_RUN=true`. Needs real data + 14 days history per learning-phase memory.
- **Action:** Phased rollout — read-only insight mode → tier-3 actions auto → tier-2 with Telegram approval. After 4 weeks no false positives, tier-2 autonomous.
- **Impact:** lever=operating-leverage. Frees founder from 5-10h/week manual ops.
- **Effort:** L (1-2 weeks ramp, code mostly ready).

---

## 4. L2. Mid-funnel — email gate + nurture

**Position:** Hard email gate after chart calc (commit `3cb15f3`). Nurture T+0 / T+24h / T+72h shipped + Sev1 fixed (`c94316f`). Lead→User 5.9% (pre-nurture baseline). No read API key for Resend.

### L2-A. Email gate form CRO — `[Wave 1]` `[form-cro + marketing-psychology + copywriting]`

- **Diagnosis:** Hard gate after chart calc; `chart_calc → email_leads` ratio is the largest unknown drop-off. If < 60%, we hemorrhage volume before lead capture.
- **Action:** PostHog query `(EmailGateModal opened) / (EmailGateModal submitted)`. If < 60%, test:
  - Softer CTA copy ("Send my chart to my email" vs "Continue").
  - Blurred preview chart behind modal (proof of value).
  - Reciprocity microcopy ("free, no spam, unsubscribe in 1 click").
- **Impact:** lever=lead-volume. Each +5% gate conversion at 22 leads/day = +1.5 leads/day at $0 extra spend.
- **Effort:** S (1-2d).

### L2-B. Nurture re-engagement (T+7d / T+14d / T+21d) — `[Wave 2]` `[email-sequence + copywriting + marketing-psychology]`

- **Diagnosis:** After T+72h teaser → silence. Leads who didn't convert = dead list. SaaS standard is 5-9 emails in first month.
- **Action:** Add:
  - T+7d: "What your Saturn says this week" — astrology angle, not sales (cred + retention)
  - T+14d: free mini-reading from chart (proof of value before Pro CTA)
  - T+21d (if open rate > 0): synastry teaser → viral lead magnet
- **Impact:** lever=Lead→User. 5-9 email drip vs 3-email: typically 2-3× uplift. 5.9% → 10-15%.
- **Effort:** M (4-6d) + founder content review.

### L2-C. Nurture segmentation EN/ES + cold/hot — `[Wave 2]` `[email-sequence + analytics-tracking]`

- **Diagnosis:** Drip identical for all. EN vs ES differ; "hot" (T+0 opened) vs "cold" (not opened) differ.
- **Action:** Cold-track: skip T+24h heavy content, jump to T+7d simpler. Hot-track: standard drip. Requires `email.opened` event from Resend webhook (T11 already propagates bounces).
- **Impact:** lever=Lead→User. +20-40% cold-track open rate.
- **Effort:** M (3-5d).

### L2-D. Lead magnet diversification — `[Wave 2]` `[lead-magnets + page-cro]`

- **Diagnosis:** Single lead magnet = chart calc. Audience who already knows sidereal sign or doesn't care about sidereal vs tropical drops off.
- **Action:** Add 2-3 magnets:
  - Moon Sign PDF report (email-gated)
  - Mini-synastry (2 birth dates)
  - Today's planetary hours (location-based, evergreen)
- **Impact:** lever=lead-volume + audience-expansion. +30-50% potential.
- **Effort:** L (1-2 weeks per magnet).

### L2-E. Resend read-only API key + delivery audit — `[Wave 1]` `[analytics-tracking]`

- **Diagnosis:** Cannot programmatically verify bounce/delivery. Evening audit Sev2.
- **Action:** Create Resend key with `Sending + Reading` permission → `RESEND_AUDIT_API_KEY`. Extend `_audit_resend_verify.mjs` to pull per-message status.
- **Impact:** lever=observability. Without it we fly blind on email channel.
- **Effort:** XS (30 min setup + 1h script).

---

## 5. L3. Bottom-funnel — paywall + pricing + Pro upgrade

**Position:** Paywall CRO for Celtic / 3-card / Synastry shipped (2026-05-13). Chart Reading paywall + `/api/v1/chart/interpret` shipped (2026-05-17). `chart_readings = 0`. Pricing page has monthly/annual toggle.

### L3-A. Paywall conversion instrumentation — `[Wave 1]` `[analytics-tracking + paywall-upgrade-cro]`

- **Diagnosis:** 4 paywall flows shipped; per-flow drop-off unknown. Without funnel `feature_clicked → paywall_shown → checkout_started → checkout_completed`, L3-B/C are spec'd on speculation.
- **Action:** PostHog funnel reports per paywall flow. Identify which step is the leak.
- **Impact:** lever=diagnostic for entire L3.
- **Effort:** XS (1-2h).

### L3-B. Pricing page CRO — `[Wave 2]` `[page-cro + pricing-strategy + marketing-psychology]`

- **Diagnosis:** Pricing page shows monthly/annual without anchoring, social proof, or guarantee.
- **Action:**
  - Annual savings explicit ("Save 33%").
  - 14-day money-back guarantee (low risk at 0 paying users).
  - Trust signals: "Lahiri ayanamsa ±0.01°", "Built by working astrologers".
  - Clear value prop above-the-fold.
- **Impact:** lever=conversion. Industry lift 15-30%.
- **Effort:** S-M (2-4d).

### L3-C. Per-feature paywall variant test — `[Wave 2]` `[ab-test-setup + paywall-upgrade-cro]`

- **Diagnosis:** Chart Reading / Celtic / Synastry have different intent → different copy.
- **Action:** Per-flow paywall copy A/B via PostHog feature flags. E.g.:
  - Chart Reading: "Unlock the full reading: 7+ houses interpretation"
  - Synastry: "Reveal the compatibility patterns"
  - Celtic: "Get the full 10-card spread guidance"
- **Impact:** lever=conversion. +20-40% per flow.
- **Effort:** M (1 week).

### L3-D. Founder smoke test first-purchase — `[Wave 1]` `[paywall-upgrade-cro + form-cro]`

- **Diagnosis:** `chart_readings = 0` — unclear if technical block or UX block. Founder hasn't done end-to-end paid checkout with test card.
- **Action:**
  - Founder runs full Pro checkout with Stripe test card, documents each click.
  - Verify Stripe price IDs (M/A) active (`_audit_funnel_baseline.mjs` already checks).
  - Verify post-purchase Welcome email triggers.
- **Impact:** lever=conversion. Technical block = 100% loss recovery.
- **Effort:** XS (1h founder time).

### L3-E. Free → Pro trial window — `[Wave 3]` `[pricing-strategy + paywall-upgrade-cro + launch-strategy]`

- **Diagnosis:** Currently hard gate (no trial). Esoterica = low-frequency use; trial may be critical.
- **Action:** 7-day Pro trial (card required, auto-charge). Cancel-anytime. `TrialEndingEmail.tsx` already exists.
- **Impact:** lever=conversion. Potentially 2-3× Lead→Pro at cost of trial abuse.
- **Effort:** L (1-2 weeks).
- **Note:** Defer until L3-A/L3-B/L3-D land first ~5-10 full-price conversions to validate base funnel.

---

## 6. L4. Observability + instrumentation

**Position:** PostHog US + reverse proxy + heatmaps + web vitals. Sentry tags. Metrics fragmented across Meta / Stripe / DB / PostHog.

### L4-A. Full-funnel PostHog dashboard — `[Wave 1]` `[analytics-tracking]`

- **Diagnosis:** No single picture of `impressions → click → land → email-gate → lead → user → Pro`.
- **Action:** PostHog dashboard:
  - North-star: weekly Pro conversions
  - Funnel: `landing_pageview → chart_calc → email_gate_submit → email_open → email_click → checkout_start → checkout_complete`
  - Cohort retention: weeks since signup
  - Per-channel: `utm_source` breakdown (meta / organic / chatgpt.com / ...)
- **Impact:** lever=strategic. Without it, Wave 2 prioritization is speculation.
- **Effort:** S (1-2d).

### L4-B. A/B test infra (PostHog feature flags) — `[Wave 2]` `[ab-test-setup]`

- **Diagnosis:** Need feature flags for L2-A, L3-B, L3-C tests.
- **Action:** Setup `useFeatureFlag` hook + server-side `getFeatureFlag`. Document usage. Run 2+ experiments at any time.
- **Impact:** lever=velocity. Each winning variant typically +10-25% conversion.
- **Effort:** S (2-3d initial + ongoing).

### L4-C. CAC + LTV tracking — `[Wave 2]` `[revops + analytics-tracking]`

- **Diagnosis:** No CAC (with organic) or LTV view. Can't decide scale-vs-fix-funnel.
- **Action:** Dashboard / script:
  - CAC = `ad_spend_30d / new_paid_subs_30d` cohort-correct
  - LTV: avg MRR × proxy lifetime (10× monthly until churn data)
  - LTV/CAC ≥ 3 = healthy.
- **Impact:** lever=strategic.
- **Effort:** S (1-2d).

### L4-D. Per-creative ROI script — `[Wave 2]` `[paid-ads + analytics-tracking]`

- **Diagnosis:** Meta gives CPL per creative; not `creative → lead → paid`. UTM `utm_content` already wired.
- **Action:** `_audit_creative_roi.mjs`: per `utm_content` → leads → subs → revenue. Top-3 worst pause; top-3 best scale.
- **Impact:** lever=CPL. Frees ~20-30% spend from bad creatives.
- **Effort:** S (1-2d).

---

## 7. L5. Strategy / cross-cutting

### L5-A. Customer research via nurture replies — `[Wave 2]` `[customer-research]`

- **Diagnosis:** 33+ leads/day, no qualitative input.
- **Action:**
  - Reply-to in lead emails ("Reply directly — I read everything"). Founder replies first 10-20 personally.
  - T+72h teaser email: "What's most valuable about astrology for you?" — 1 question.
  - PostHog survey widget post-first-calc.
- **Impact:** lever=insight + retention. Direct input for L1-A copy, L3-B pricing.
- **Effort:** XS (Resend reply config + email copy edit).

### L5-B. Cosmic Passport viral A/B + incentive — `[Wave 3]` `[referral-program + community-marketing]`

- **Diagnosis:** Extension of L1-F. After 2 weeks of instrumentation data, iterate.
- **Action:**
  - A/B card variants (proof-points: sun-moon-asc vs precession vs personality keyword).
  - Incentive: "Friend who signs up gets free reading; you get free reading" — referral loop.
- **Impact:** lever=viral.
- **Effort:** L (2-3 weeks spread).

### L5-C. SEO Phase 3 + AEO push — `[Wave 3]` `[seo-optimizer + ai-seo + content-strategy + schema-markup]`

- **Diagnosis:** Phase 2 shipped (sitemap 466, /sidereal-dates, schema). 7 organic + 3 chatgpt referrals — base.
- **Action:**
  - Programmatic SEO: more long-tail pages (compatibility tables, sign-by-sign deep ES, planetary hours by city).
  - AEO: FAQ schema on key pages, entity markup for "Lahiri ayanamsa", "sidereal vs tropical", "Vedic vs Western".
  - Content schedule: 1 essay/week low-competition keywords.
- **Impact:** lever=lead-volume + free + brand-authority. 3-6mo lag, compounds forever.
- **Effort:** L (ongoing).

### L5-D. Pricing test cycle — `[Wave 3]` `[pricing-strategy + ab-test-setup + revops]`

- **Diagnosis:** Esoteric category — "too cheap = not serious" signal possible.
- **Action (after L4-B infra + L3-A funnel data):** 3-variant pricing test (current / -33% / +50%) × 4 weeks × ≥50 conversions per variant.
- **Impact:** lever=LTV/CAC. Right price = 2-5× revenue.
- **Effort:** M (1w setup + 4w run + analysis).

### L5-E. Advertising agent real-mode rollout — `[Wave 3]` `[paid-ads + revops]`

- **Diagnosis:** Same as L1-G. Phased rollout details.
- **Action:**
  - Phase 1: `ENABLED=true, DRY_RUN=true` — agent observes, decision log to `audit_actions`. Founder weekly review.
  - Phase 2: tier-3 actions (alerts/reports) auto; tier-2 (pause/budget) via Telegram approval.
  - Phase 3: tier-2 autonomous after 4 weeks zero false positives.
- **Impact:** lever=operating-leverage.
- **Effort:** L (1-2w + 4-6w ramp).

---

## 8. Wave roadmap

### Wave 1 — this sprint (~1-2 weeks)
Goal: tactical wins + observability foundation.

| # | Item | Layer | Lever | Effort |
|---|---|---|---|---|
| 1 | L1-A: EN creative refresh | Top | CPL | S |
| 2 | L1-B: pause/replace ES Swiss | Top | CPL | XS |
| 3 | L2-A: Email gate form CRO | Mid | lead-volume | S |
| 4 | L2-E: Resend read API key + delivery audit | Mid | observability | XS |
| 5 | L3-A: Paywall conversion instrumentation | Bottom | diagnostic | XS |
| 6 | L3-D: Founder smoke test first-purchase | Bottom | conversion | XS |
| 7 | L4-A: Full-funnel PostHog dashboard | Obs | strategic | S |

**Wave 1 total:** ~8-10 working days (sequential; less if parallelized).

### Wave 2 — 2-4 weeks
Goal: systematic growth foundation + first qualitative data.

| # | Item | Layer | Lever | Effort |
|---|---|---|---|---|
| 8 | L1-C: Geo expansion ES (MX/CO/PE/CL) | Top | lead-volume | S |
| 9 | L1-D: Subscribe upgrade event (Pixel+CAPI) | Top | CAC | M |
| 10 | L1-E: AEO inbound instrumentation | Top | free | S |
| 11 | L2-B: Nurture re-engagement T+7/14/21d | Mid | conversion | M |
| 12 | L2-C: Nurture segmentation EN/ES + cold/hot | Mid | conversion | M |
| 13 | L2-D: Lead magnet diversification | Mid | lead-volume | L |
| 14 | L3-B: Pricing page CRO | Bottom | conversion | S-M |
| 15 | L3-C: Per-feature paywall variant test | Bottom | conversion | M |
| 16 | L4-B: A/B test infra (PostHog feature flags) | Obs | velocity | S |
| 17 | L4-C: CAC + LTV tracking | Obs | strategic | S |
| 18 | L4-D: Per-creative ROI script | Obs | CPL | S |
| 19 | L5-A: Customer research via nurture replies | Strategy | insight | XS |

**Wave 2 total:** ~4-5 working weeks.

### Wave 3 — quarter (1-3 months)
Goal: viral, AEO, advertising agent, pricing strategy → compound growth.

| # | Item | Layer | Lever | Effort |
|---|---|---|---|---|
| 20 | L1-F: Cosmic Passport viral instrumentation | Top/Strategy | viral | M-L |
| 21 | L1-G + L5-E: Advertising agent rollout | Top/Strategy | operating-leverage | L |
| 22 | L3-E: Free → Pro trial window | Bottom | conversion | L |
| 23 | L5-B: Cosmic Passport A/B + incentive | Strategy | viral | L |
| 24 | L5-C: SEO Phase 3 + AEO push | Strategy | free | L |
| 25 | L5-D: Pricing test cycle | Strategy | LTV/CAC | M |

**Wave 3 total:** quarter-long, parallelizable.

---

## 9. Out of scope

- New astrology features (chart engine, additional spreads, new houses systems). MVP feature-complete.
- AGPL re-licensing or content reorganization.
- Brand identity / logo / visual rebrand.
- Third-party MCP integrations for PII / payments / deployment.
- Manual ad operations replacement before Wave 3 (advertising agent stays OFF for Waves 1-2).

---

## 10. Open questions (for founder)

- Does Wave 1 effort budget (~8-10 days) fit upcoming calendar?
- Any preferred A/B test platform other than PostHog feature flags?
- Pricing experimentation tolerance — is founder willing to test ±50% pricing variants?
- Personal reply commitment in L5-A — how many lead-reply emails per day is sustainable?

---

## 11. Success criteria (for the roadmap itself)

Roadmap succeeds if, after Wave 1:

- Full-funnel dashboard exists and is monitored daily.
- EN CPL trends toward ES levels OR clear evidence of audience-fit gap.
- Email gate conversion measurable and ≥ 60%.
- At least one paying customer through end-to-end flow.
- Per-paywall drop-off measurable.

After Wave 2:

- Lead→User conversion measurable, with at least one A/B improvement landed.
- CAC + LTV trackable.
- At least one new lead magnet contributing 10%+ of leads.

After Wave 3:

- Viral coefficient measurable.
- Advertising agent at least in `DRY_RUN=true ENABLED=true` mode with founder reviewing decisions weekly.
- Pricing tested with statistical significance on ≥150 conversions per variant.

---

## 12. References

- Evening audit: `outputs/advertising-audit-2026-05-17-evening/00-executive-summary.md`
- Marketing psychology archetypes: `docs/superpowers/specs/2026-05-11-marketing-psychology-archetypes-design.md`
- Pixel/CAPI fix: `docs/superpowers/specs/2026-05-11-pixel-capi-attribution-fix-design.md`
- Paywall CRO: `docs/superpowers/specs/2026-05-13-paywall-upgrade-cro-design.md`
- Chart paywall: `docs/superpowers/specs/2026-05-15-chart-ai-reading-paywall-design.md`
- Lead nurture: `docs/superpowers/specs/2026-05-17-lead-nurture-emails-design.md`
