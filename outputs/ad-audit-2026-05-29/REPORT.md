# Ad-Campaign Audit — 2026-05-29 (Friday)

**Claude (Opus 4.8, 1M ctx, ultracode) · scope: Meta + PostHog + Stripe + Resend + Code/Agent-state**
**Method:** 18-agent workflow — 5 parallel read-only investigators → 13 adversarial verifiers (each re-derived the load-bearing numbers independently). Sector reports: `01-meta.md`..`05-code-agent.md`.
**Baseline:** `outputs/traffic-audit-2026-05-23/REPORT.md` (6 days ago).
**Account:** `act_1435842067150024` (USA AUTOMOTO EXPORT). Currency USD.

---

## TL;DR — one paragraph

The campaign is not underperforming — **it is OFF.** A single deliberate founder pause on **2026-05-24 13:29 UTC** took the whole Meta account dark; spend has been **$0/day for 5 days** (25–29 May). That pause turns out to be *fortunate*, because the audit found a **launch-blocking funnel bug below the ad**: anonymous users who **pay** cannot sign in to access the product, and trial→ongoing-paid is **~8% (1 of 13)**. Real money ever collected = **$14.97**; real recurring MRR = **$4.99/mo (one customer)**. Turning ads back on today would pour leads into a broken funnel. The fix order is therefore: **repair the funnel first (sign-in + trial-billing + ES checkout), then re-enable acquisition ES-first** (ES is 9× cheaper CPM than EN and just produced its first paid conversion). Good news: the upper funnel is cheap and healthy (CPL $1.02–1.72), the email drip actually works (24.7% open — the prior "0%" was a measurement bug), and tracking is largely fixed.

---

## The five things that matter (verified)

### 1. 🔴 Account dark 5 days — deliberate, not automated `META-P0-DARK` ✅ holds (high conf)
- Last spend **2026-05-24** ($20.51 / 13 leads); **$0 / 0 reach** on 25–29 May. Campaign + EN Tier-1 ad-set paused 8 s apart (`updated_time` 13:29:07 / 13:29:15) = one toggle. ES LATAM separately paused 05-21.
- **Cause = manual founder action.** Code investigator confirmed: ad-agent is fully gated (`ADVERTISING_AGENT_ENABLED=false` + `DRY_RUN=true` + `seniorBuyerMode=off`); **no account/campaign-level pause path exists in code** (0 grep hits); all crons no-op under the kill switch. So re-enabling is a manual Ads-Manager un-pause — **do NOT flip `ADVERTISING_AGENT_ENABLED`** (that only re-arms the still-DRY_RUN agent).
- **Foregone:** ~49–51 EN leads / ~$85–88 over 5 days (at recent EN run-rate ~10 leads/day).
- ⚠️ **Verifier correction to the framing:** the "11.5% lead→user" cited as proof is lead→**free account** (EN 11.7%, ES 0.7%). lead→**active-paid** is effectively **~0** right now. Re-enabling EN buys leads + drip fuel, *not* proven revenue.

### 2. 🔴 Paid anonymous users cannot sign in `P0-1` ⚠️ holds, root-cause corrected — **worst bug found**
- Original framing (webhook never provisions) was **refuted**: anon checkouts *do* get provisioned to premium via the `client_reference_id` path. The **real, worse** bug:
  - The webhook never writes `signInTicket` for the typical anon case (the `if(!clerkUserId)` branch is bypassed), so `/session-status` always returns `ready:false`.
  - `/recover` *always throws*: it writes a ~552-char Clerk JWT into Stripe `metadata.signInTicket`, but Stripe caps metadata values at **500 chars** → `checkout_recovery_failed = 8/8 (100%)`, 0 succeeded; 2 of those are `cs_live_` paying sessions.
  - **Net: a user pays, gets a premium DB row keyed on raw `anonymous_id` with a placeholder email and no sign-in path. Their real Clerk account stays free.** Pays → locked out.
- **Two distinct bugs, both must be fixed:** (a) `/recover` 500-char metadata cap; (b) the anonymous sign-in handoff never delivers a ticket. The metadata-length fix **alone will not** restore anon sign-in.

### 3. 🔴 Trial→paid ~8%; failure is the trial-end charge, not the user `STR-1` ✅ holds, root-cause corrected
- 13 subs ever → **5 past_due** (all `amount_paid=$0.00`), 2 active, 6 canceled. Only **1 will renew** (`divinelyguided2626`). Lifetime gross = **$14.97**; real MRR = **$4.99/mo**.
- ⚠️ **Verifier pulled the actual decline codes** — the "wallet won't off-session bill" hypothesis is mostly wrong: jaderising44 (link) `insufficient_funds`, durand.lisaanne (link) `insufficient_funds`, 626lugo626 (card) `insufficient_funds`, millyblack9206 (card) `transaction_not_allowed` (restricted/prepaid card), destinig7996 (Cash App) stuck. **4 of 5 are genuine issuer declines** — the rail works, the customers lack funds / use restricted cards. A SetupIntent $0-auth would NOT fix that.
- **Sound fixes:** in-trial reminder email + one-click "update payment" 24–48 h before `trial_end`; keep sub `payment_method_types` = `card`+`link` only (kills the one Cash App case); **don't rescale ads until trial→paid is healthy.**

### 4. 🟠 ES checkout: first-ever paid conversion, but 23/24 abandon before card entry `STR-2`/`P0-2` ✅/⚠️
- **"ES completion = 0" is now FALSE.** The es-419 + LATAM `custom_text` fix (`5849f22`) is deployed and tagging correctly, and produced the **first-ever ES paid sub**: gatito66679 (MX, es-419) charged a real **$4.99 on 5/28**. ES completion = 1/9 es-419 (11.1%).
- But ES is still **~9× worse than auto-locale (36%)**: 24/25 ES sessions expire, **23 abandon before even entering an email/card**. The break is **Stripe-page / card-entry friction for LATAM** (USD-only `card`+`link`; the account has `pix_payments` active but unused). And gatito set `cancel_at_period_end` ~8 h after the first charge → ES **retention** is also broken.

### 5. 🟢 The email drip actually works — the "0% opens" was a measurement bug `R1` ✅ holds (P0 for observability)
- The canonical audit script read `opened_at`/`clicked_at` (always `undefined` in this Resend account); truth lives in `last_event`. **Real numbers: 24.7% open / 4.0% click** overall; **T+0 lead_chart 30.6% open / 22.2% click (CTOR 72.7%)** — the funnel's strongest asset; T+7d saturn_weekly 30.6% open.
- **First TRUE drip re-engagement conversion confirmed** (`R3`): millyblack9206 returned **145 h later** via a drip CTA and converted — proof the drip can drive return-and-convert (she's now past_due — see STR-1).

---

## Full ranked findings

| # | Finding | Source | Severity | Verdict | What to do |
|---|---|---|---|---|---|
| 1 | Account dark 5 days (deliberate pause 5/24 13:29) | Meta+Code | 🔴 P0 | holds | Manual un-pause **after** funnel fixes; ES-first |
| 2 | Paid anon users can't sign in (2 bugs: /recover JWT>500, webhook never tickets anon) | PostHog+Code | 🔴 P0 | holds, cause corrected | Store short opaque id in metadata; fix anon ticket handoff; regression test ≤500 |
| 3 | Trial→paid ~8%; trial-end charge fails (4/5 issuer declines) | Stripe | 🔴 P0 | holds, cause corrected | Pre-trial-end reminder + update-payment link; card+link only |
| 4 | ES checkout: 23/24 abandon before card entry (1st paid conv. exists) | Stripe+PostHog | 🟠 P0→P1 | holds, "0%" corrected | LATAM payment method / local currency on Stripe page; instrument drop |
| 5 | `landing_view` server-side missing → reconciler will FALSE auto-suspend agent when ads relaunch | PostHog | 🟠 P1 | holds | Server-side `landing_view` in middleware before re-enabling |
| 6 | ES `/pricing` + PaywallModal CTAs still formal ("Comenzar prueba", no "gratis") | Code | 🟠 P1 | holds | 1-line i18n: → "Comienza tu prueba gratis de 3 días" |
| 7 | Drip emails set no `utm_content` → drip revenue unattributable | Code | 🟠 P1 | holds | Add **prefixed** `utm_content=drip_<step>` (avoid 21-char unsubscribe collision) |
| 8 | Bounce suppression broken: 0/257 leads flagged despite real bounces | Resend | 🟠 P1 | holds, corrected | Fix hard/soft classify; backfill-flag 4 typo addrs; typo-validate at gate |
| 9 | ES retention: only ES payer set to cancel ~8 h after 1st charge | Stripe | 🟠 P1 | holds | ES save-offer / cancel flow + exit reason |
| 10 | destinig7996 dunning exhausted (attempt 6, $0) — confirmed churn | Stripe | 🟡 P1 | holds | Let auto-cancel; not recoverable MRR |
| 11 | Canonical Resend script reports phantom 0% | Resend | 🟡 P2 | holds | Promote `_audit_resend_lastevent` to canonical |
| 12 | ES targeting uncleaned (audience_network ON, SV in geo) | Meta | 🟡 P2 | — | Apply EN hygiene pass before ES re-enable |
| 13 | NASA creative is new EN winner ($1.14 CPL); off24+made got 0 impressions | Meta | 🟡 P2 | — | Let NASA run; isolate 2 starved angles in a test ad set |
| 14 | `pickDominantPlanet` Mercury bias (~58% of curiosity_hook subjects) | Resend+Code | 🟡 P2 | holds | Weight exaltation/detriment + Sun/Moon/Jupiter; A/B |
| 15 | paywall_teaser (T+72h) open 17.3% < 20% target, click 1.8% | Resend | 🟢 P3 | — | Rework subject + CTA; rename `t72`→`t72h` |

---

## What I would improve — prioritized plan

### Phase 0 — Fix the funnel BEFORE spending another ad dollar (P0, code)
1. **Anonymous sign-in handoff** (`P0-1`) — the highest-impact fix. People pay and get locked out. Store a short opaque id under `metadata.signInTicket`, resolve the full JWT server-side at `/checkout/complete`; fix the anon ticket write so the webhook (not just `/recover`) delivers it; extract shared provisioning into one helper so webhook & `/recover` can't diverge (`C5`/`P2-1`); add a regression test asserting `metadata` value ≤ 500 chars.
2. **Trial-end billing recovery** (`STR-1`) — pre-`trial_end` reminder email (T-48h/T-24h) with a one-click update-payment link; enforce `card`+`link` only on every checkout path (`STR-5` found one path still leaking wallet methods).
3. **ES Stripe-page friction** (`STR-2`) — enable a LATAM-appropriate payment method (account already has `pix_payments` active) and/or show local-currency on the Stripe page; instrument where ES users drop.

### Phase 1 — Pre-relaunch guardrails (P1, code, mostly small)
4. **Server-side `landing_view`** (`P1-1`) — **must ship before re-enabling**, or the reconciler auto-suspends the agent on a false ≥25% drift the moment ads go live.
5. **ES CTA copy** (`C3`) — one-line i18n edits to `pricing.startTrial` + `paywall.trialCta`.
6. **Drip `utm_content`** (`C4`) — prefixed `utm_content=drip_<step>`; teach the webhook to treat the drip namespace distinctly (avoid the 21-char `leadId` → unsubscribe collision).
7. **Bounce suppression** (`R2`) — fix hard/soft classification, backfill-flag the 4 confirmed typo addresses, add typo/MX-domain validation at the email gate.

### Phase 2 — Re-enable acquisition, ES-first (founder, Ads Manager)
8. Clean ES targeting (`META-P2`: drop SV, exclude audience_network) → re-enable **ES LATAM USD at ~$15/day** (9× cheaper CPM, now has 1 paid conversion to build on). Measure ES checkout completion + trial→paid over 48–72 h.
9. Re-enable **EN Tier-1**; let the **NASA** creative run (new winner $1.14), give off24+made impressions in a small isolated test ad set.
10. Promote corrected Resend script to canonical; diversify `pickDominantPlanet`; rework paywall_teaser.

### Sequencing rationale
The campaign's problem was never the top of the funnel — CPL is $1–1.72 and the drip works. The problem is everything turns to **$14.97 lifetime** at the bottom because (a) paying anon users can't sign in, (b) trial cards decline at renewal with no recovery nudge, (c) LATAM can't complete checkout. **Spending more on ads multiplies leads into a bucket with holes.** Fix the holes (Phase 0–1), then re-open the tap ES-first (Phase 2).

---

## Re-check metrics (when ads are live again)
| When | Metric | Target | Source |
|---|---|---|---|
| 48 h post-relaunch | anon checkout → can sign in | 100% | PostHog `checkout_recovery_succeeded`, DB convertedToUserId |
| 48 h | ES checkout completion (es-419) | ≥ 15% | Stripe sessions by locale |
| 72 h | trial→paid (next cohort) | > 40% before scaling | Stripe sub status + invoices |
| 7 d | drip re-engagement conversions (gap ≥ 1 h) | ≥ 2 | `_audit_reengagement_probe` |
| 7 d | reconciler false-suspend events | 0 | agent suspend logs |

---

## Artifacts
- Sector reports: `01-meta.md` · `02-posthog.md` · `03-resend.md` · `04-stripe.md` · `05-code-agent.md`
- New read-only probe/verify scripts (uncommitted): `scripts/advertising/_verify_*_2026_05_29.mjs`, `_audit_resend_lastevent_2026_05_29.mjs`, `_audit_undeliverable_probe_2026_05_29.mjs`, `_audit_reengagement_probe_2026_05_29.mjs`, `_audit_dominant_planet_2026_05_29.mjs`, `_probe_resend_get_vs_list_2026_05_29.mjs`

*Generated 2026-05-29. 18-agent workflow, all measurements read-only, every P0/P1 finding adversarially re-verified. Corrections from verifiers are folded into the recommendations above.*
