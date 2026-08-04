# CRO Audit — estrevia.app — 2026-07-10

**Method:** 10 parallel read-only sector investigators (Stripe, Neon DB, PostHog, Resend, Meta, landing, paywalls, pricing/checkout, ES/LATAM, live Playwright walkthrough) → adversarial verification of every top P0/P1 (independent re-derivation by a different method) → completeness critic → 6 reconciliation agents settling every cross-sector contradiction. 52 agents / ~4M tokens total. A first attempt on 2026-07-06 died to a session limit before persisting anything; this is the full re-run.
**Window:** 2026-05-29 (last full audit, `outputs/ad-audit-2026-05-29/REPORT.md`) → 2026-07-10. Deployed code unchanged since 2026-05-30 (`de39cee`, verified via Vercel `dpl_BUttqr1LDtUCstfsQeo2h5VxgBqr`); 6 local HALF50 commits still unpushed — so every change in the numbers is data/ops, not code.
**Verification integrity:** 24 P0/P1 findings adversarially verified — 19 CONFIRMED, 5 CORRECTED, **0 refuted**. 9 cross-sector contradictions found by the critic; all 9 settled by independent re-derivation (`reconcile/*.md`). Scope: 100% read-only against production; no code changed, no emails sent.
**Sector evidence:** `01-stripe.md` … `10-live.md`, screenshots in `screenshots/`, contradiction resolutions in `reconcile/`.

---

## HEADLINE

**The funnel is starved, not broken — but four silent defects are waiting to burn the relaunch traffic.** Meta has been dark 47 consecutive days ($0 since 05-25) while the P0 that justified the pause (anonymous payers locked out after paying) is **verifiably fixed in production**: both anonymous paid checkouts in the window completed the ticket → sign-in chain in ~70 seconds, 0 failures, 0 timeouts (vs 8/8 failures pre-fix). Traffic is down 95% (261 → 12 unique visitors per 14 days), 9 checkout sessions in 42 days, $9.98 collected, real MRR still $4.99.

Meanwhile four verified defects sit directly on the money path:

1. **Every lifecycle email to anonymous payers bounces.** The Stripe webhook writes `users.email = stripe-pending-…@placeholder.invalid` and the Clerk `user.created` webhook (`onConflictDoNothing`) never overwrites it. 16 lifecycle dispatches to placeholder addresses since 05-29; 14/14 Resend-accepted ones bounced (100%). The June annual trialer ($34.99) churned 07-03 having received **0 of 10** billing/recovery emails — while her real, drip-engaged address sat in `email_leads`. The sole active payer has never received any account email and hasn't opened the product since purchase day. 100% of completed checkouts are anonymous — the entire dunning/trial-reminder stack built for baseline P0 #3 is functionally dead for the only cohort that pays.
2. **On mobile, the cookie banner physically covers the paywall trial CTA.** Pre-consent, `elementFromPoint` at the "Start 3-Day Free Trial" button center returns the cookie banner (z-50, rendered after the non-portaled modal; tappable sliver ~1.5px at 390×844). Paywalls originate 77% of all trial clicks and 86% of opens are mobile — this is the funnel's single most valuable button, silently untappable for every new visitor until they answer the consent prompt.
3. **The post-calculation CTA dead-ends.** "See your full natal chart" → `/chart?chartId=…` — a param no code reads. Every landing lead AND all 6 drip-email CTAs land on an empty birth-data re-entry form; 4 of 10 hero calculators never re-enter their data. Present since MVP; 14 of 16 such pageviews in the window came from drip emails (the funnel's best-clicking asset).
4. **Trial-end collection fails on bank-funded Link payments.** 43 failed charge attempts since 05-30 ($694.57 failed volume, $0 recovered; lifetime dunning recovery 0%, open pool 8 invoices/$159.92). 17 of the last 20 failures are `link` bank-funding payments (`partner_insufficient_funds`); 5 of 15 subs ever have a Link default PM. The "Bank app" tile on the live checkout is Link Instant Bank Payments rendering *inside* the allowed `card+link` config — `payment_method_types` cannot block it; it's a Stripe dashboard toggle.

**Bottom line:** fix the four blockers above (≈1 focused day + two dashboard toggles), push the deploy, then re-enable acquisition — EN-first at modest budget, ES only after the ES-specific Stripe-page work below. Every week of continued darkness costs ~70-100 leads at the proven $1.19-1.79 CPL while the drip pool (250/279 leads exhausted) goes colder.

---

## Scoreboard vs 2026-05-29 baseline

| Metric | 2026-05-29 baseline | 2026-07-10 | Verdict |
|---|---|---|---|
| Real MRR (will-renew) | $4.99 (divinelyguided2626) | $4.99 (lainiekayg — different customer; baseline payer past_due, 8 declines) | flat, fragile |
| Lifetime gross revenue | $14.97 | $24.95 (+$9.98 in window) | ~flat |
| Unique visitors / 14d | 261 | 12 | **−95%** |
| Checkout sessions / day | ~2.2 | ~0.21 (9 in 42d; 2 complete) | **−90%** |
| New leads / day | 10-13 (ads on) | ~0.5 (24 in 46d; 50% from chatgpt.com) | starved |
| Lead→user, post-05-30 cohort | EN 13.3% pre-pause | **0/22 (0%)** | drip can't convert cold organic alone |
| Meta spend | paused 5d | paused 47d; ~479 foregone leads / ~$820 unspent | decision overdue |
| Drip open / click | 24.7% / 4.0% | 23.1% / 4.6% (650 sends) | stable |
| Drip fuel | mid-flight | 250/279 leads at terminal step 7 (89.6% exhausted) | running dry |
| Bounce rate (Resend) | 2.2% | 6.5% (30/32 drip bounces are ES) | 3× worse, suppression still broken |
| Failed charge recovery | dunning just shipped | 43 attempts → $0 recovered (lifetime 0%) | collection is the leak, not checkout |
| Anon sign-in after paying | 8/8 failed (P0) | 2/2 succeeded ~70s | **FIXED, verified live** |
| Duplicate customers / wallet PMT leak | fixed 5/23-5/24 | 0 new / 0 leaks (9/9 card+link) | holding |
| HALF50 campaign | built, not sent | coupon expired 06-06, 0 redemptions, 6 commits unpushed, migration 0018 unapplied | dead on the shelf |
| AI chart readings generated | 45 all-time | **0 since 06-07** | paying users don't use the product |

Statistical honesty: every bottom-funnel rate this window rests on n≤2. The structural findings below are code/config facts, not rate estimates — they don't need n.

---

## P0 — actively losing money / blocking conversion (all verified)

### P0-1 · Anonymous payers are permanently email-unreachable (placeholder address never replaced)
**Evidence:** `08-pricing-checkout.md` STR-1, `02-db.md` DB-1, `04-resend.md` R-1; canonical count in `reconcile/bounce-count.md`.
Stripe webhook writes `stripe-pending-<clerkId>@placeholder.invalid` into `users.email`; Clerk `user.created` webhook uses `onConflictDoNothing` so the real email never lands. Since 05-29: 16 lifecycle dispatches to placeholder addresses, 14/14 accepted ones bounced, 2 `welcome` sends failed pre-send (NULL `resend_message_id`). mpidarling90 ($34.99 annual): 0/10 billing emails delivered → churned 07-03 unreached, though her real address clicked 2 drip emails. lainiekayg (sole active payer): zero account/billing emails ever; her real email sits in `email_leads` (lead `p4-9KWBf1wRma…`, `converted_to_user_id=NULL` — so the drip also cross-sold her `lead_paywall_teaser` *after* she paid).
**Fix (one PR + one script):** (a) on `checkout.session.completed`, backfill `users.email` from the session's `customer_details.email`; (b) Clerk webhook → `onConflictDoUpdate` on email; (c) one-time backfill of the 2 affected rows from Clerk/Stripe; (d) backfill `email_leads.converted_to_user_id` for anon payers by Stripe customer email match (extend `scripts/advertising/_repair_orphan_anon_payers_2026_05_30.mjs` pattern); (e) suppress drip sales emails to converted leads.

### P0-2 · Cookie banner covers the paywall trial CTA on mobile (pre-consent)
**Evidence:** `10-live.md` LIVE-1 (CONFIRMED; `elementFromPoint` = "Cookie consent" at CTA center, 390×844; modal doesn't scroll). `07-paywall.md`'s "no dead-ends" missed it — resolved in the critic pass.
Paywalls = 77% of all trial clicks (54/70 since 05-13); 86% of modal opens are mobile. Every pre-consent mobile visitor who taps the trial button gets nothing, silently.
**Fix:** portal the PaywallModal above the banner or drop the banner's z-index below modals; make the modal scrollable at small viewports; add a Playwright regression at 390×844.

### P0-3 · `/chart?chartId=` handoff is dead — hero CTA and all 6 drip CTAs land on an empty form
**Evidence:** `06-landing.md` LAND-1 + `10-live.md` LIVE-2 (both CONFIRMED). `ChartDisplay.tsx:156-167` reads `bd/bt/lat/lon/place/tz`, never `chartId`. 16 pageviews / 12 uniques hit the dead link in-window, 14 from drip emails; 4 of 10 hero calculators never re-enter data.
**Fix direction (settled):** fetch the temp chart server-side by `chartId` — do **NOT** switch CTAs to `bd/lat/lon/tz` params as `06-landing.md` suggested: birth data in URLs violates the CLAUDE.md PII rule. `10-live.md`'s fix is the compliant one.

### P0-4 · Trial-end collection: Link bank funding is the dominant failure mode; dunning recovers $0
**Evidence:** `01-stripe.md` STR-1 (CORRECTED: 43 failed attempts, $694.57 failed volume, $0 recovered in-window; open pool 8 invoices/$159.92, lifetime recovery 0%); mechanism settled in `reconcile/checkout-pmt.md`.
No config leak — 9/9 sessions are `card+link`, standalone bank rails are OFF account-wide. But Link renders **Instant Bank Payments** inside the `link` method ("Bank app" tile, screenshot 12): 17/20 recent failed charges are `py_`-prefixed link `partner_insufficient_funds`; 5/15 subs ever have a Link default PM. Trials started via bank funding become off-session defaults that fail at trial end — economically identical to the wallet PMTs the 05-21 rule banned. Secondary: 3/43 failures were Stripe Radar blocking our own dunning retries (`highest_risk_level`); 27/43 are pure no-funds codes → audience-quality signal for Meta targeting, not a billing bug.
**Fix:** Stripe Dashboard → Payment methods → Link → disable Instant Bank Payments (keeps Link card autofill). Also turn off cashapp/klarna/amazon_pay in the default payment-method configuration (foot-gun if a future code path omits the explicit list), exempt recurring MITs from the Radar high-risk rule, and enable Stripe's auto-cancel on the 44-day past_due zombie (50 `invoice.payment_failed` webhooks and counting — baseline #10's "let it auto-cancel" was never configured).

---

## P1 — material conversion drag

**Money path**
- **PaywallModal defaults to the $34.99 annual plan — the plan with 0/6 lifetime trial→paid vs 4/9 monthly** (`07-paywall.md` STR-1, CONFIRMED via Stripe all-time). For an audience whose declines are affordability-driven, defaulting to 7× the price is self-harm. Default to monthly; keep annual as the explicit upsell.
- **Post-payment routing discards context** (`07-paywall.md` STR-3, CORRECTED — applies to deployed code too): `checkoutBodySchema` silently strips the `returnUrl` the clients send; payers land on `/settings` (not the product, not the chart they were reading); Stripe cancel dumps ES users on EN `/pricing`. Compounded by `/checkout/complete` blocking every payer ~8s polling `metadata.signInTicket` that nothing writes since `de39cee` (`08` STR-2, CONFIRMED — dead code, 16 wasted Stripe GETs per payer) and a fallback page that renders raw i18n keys (`useTranslations('checkout.complete')` vs actual `pricingPage.checkout.complete` namespace, `07` STR-5).
- **Stripe checkout page is off-brand** (`10-live.md` LIVE-3, CORRECTED): public business name shows **"Kirill Kovalenko"** (statement descriptor is already ESTREVIA.APP — only the dashboard public business name needs changing); product "Estrevia Premium" description promises features that match nothing in-app; the plan wears 4 names between paywall click and card entry (Pro → "Locked behind Star" → Premium → Estrevia Premium). This is the exact page where 23/24 ES sessions abandoned at baseline.
- **Trial-recovery email stack: shipped and live** (`05-meta.md`'s "NOT shipped" is wrong — settled by 3-source corroboration) **but dead for the paying cohort** via P0-1. After P0-1 lands, add the pre-trial-end save offer (a re-cut HALF50 fits here better than a cold blast).

**ES / LATAM** (full ranking in `reconcile/es-paywall-leak.md`)
- **The ES leak is TWO leaks, and the big one is the Stripe payment page:** canonical funnel (uniques, 05-13→07-10, pathname locale) — modal open→click ES 54.2% vs EN 66.7% (0.81×, real but secondary); Stripe session created→complete **ES 4.5% (1/22) vs EN 24.1% (13/54) — 0.19×**; 21/22 ES sessions expired before card entry. ES reaches Stripe redirect at near-EN parity. Never cite `09-es.md`'s "49% vs 100%" (bucketing artifacts). Fix the LATAM Stripe-page experience *alongside* modal copy, not after: USD price framing ("$34.99" bare reads as pesos — LIVE-14; add explicit USD + the MXN/COP equivalence at the decision point), trust elements inside the modal, and evaluate local-currency card billing (pix/OXXO are NOT implementable for subscriptions — `09-es.md` ES-3 settled that).
- **The 05-29 one-line 'gratis' fix is still ⅔ unshipped 42 days later:** `paywall.trialCta` + `pricing.startTrial` remain "Comenzar prueba de 3 días" (only `paywall.cta.ctaLabel` was fixed). The ES modal also renders an en-US date and 4 hardcoded English strings at the card-decision moment (`07` STR-2 / `09` ES-1/ES-2, all CONFIRMED; translations exist, unused).
- **ES ads land on `/` instead of `/es/`** (all 6, `05-meta.md` M-4) and the ES ad set still carries the uncleaned targeting flagged 05-29 (SV in geo, audience_network ON, M-2) — both must precede any ES re-spend.

**Instrumentation (relaunch guardrails)**
- **NEW (found during reconciliation): the locale super-prop mislabels every EN `/essays/*` event as `es`** — `PostHogProvider.tsx:89,164` uses `pathname?.startsWith('/es')`, and `/essays/…` matches. 41 of 162 "es" browser events in the window are mislabeled EN essay readers (~25%); every PostHog EN/ES split since 05-20 is contaminated (this is what fooled `03-posthog.md` into calling the 06-07 payer an ES conversion — settled EN in `reconcile/es-payer.md`). Fix: `pathname === '/es' || pathname.startsWith('/es/')`. Until deployed, derive locale from `$pathname` prefix in queries.
- **Client-side funnel sees only ~41% of converting visitors** (consent-gated; 9 client gate-views vs 22 server leads) and server-side `landing_view` — the 05-29 relaunch guardrail — is still unshipped (`LAND-4`/`PH-3`/`M-7`, CONFIRMED). With ads on, the reconciler would false-suspend on phantom drops. Ship before re-spend.
- **Meta CAPI gateway rejects 100% of observed page views** (capig.datah04.com HTTP 422, LIVE-8) — attribution readiness for relaunch is unverified; no sector owned pixel/EMQ health (critic gap). Check Events Manager before spending. Also LIVE-7: `_fbp` set pre-consent and after Decline while the banner claims "no third-party tracking" — compliance + trust issue.

**Product / retention**
- **Time-unknown charts render a fabricated noon Ascendant + 12 Placidus houses** (`10-live.md` LIVE-6, CONFIRMED — mechanism in `reconcile/timeunknown-houses.md`; `06-landing.md`'s "path is good" was wrong). The engine is compliant (`chart.ts:122` gates houses on `time !== null`) but all three client callsites send the literal `'12:00'` when the toggle is OFF (`HeroCalculator.tsx:238`, `BirthDataForm.tsx:99`, `ChartDisplay.tsx:204`) and `chartCalculateSchema` transforms `houseSystem null→Placidus`. The paywalled reading teaser *leads* with the fake Ascendant — a correctness/trust defect under a ±0.01° accuracy claim, and a violation of the project's own MVP rule. Fix: send `time: null` at the 3 callsites; the existing `noHouses` UI paths are currently dead code and will just work.
- **Paying users don't use the product:** 0 AI chart readings generated anywhere since 06-07 (45 all-time); the sole payer last active on purchase day across 2 paid cycles. Post-purchase lands on `/settings` — activation moment wasted. No product-side investigation exists yet (critic question #3): ship post-purchase → chart redirect + a paid-onboarding email (deliverable once P0-1 lands), then decide if the reading itself disappoints.
- **Email gate: dismissal is permanent** (localStorage flag disables the gate forever on that device; 3/9 recorded views dismissed) **and initial focus lands on the close button** (`LAND-3`, CONFIRMED). Plus the gate teases zero concrete value — "Skip for now" yields the identical result (LIVE-4), so the email buys nothing visible. Re-arm the gate per chart or per session; focus the email input; show the locked-content delta at the gate.
- **Above-fold renders `opacity:0` until React hydrates** (IO-gated entrance animations, `LAND-2`, CONFIRMED) — blank first paint for slow-JS Meta in-app browsers, the exact browsers ads buy. Render visible, animate on top.
- **Drip is out of fuel and its engine has known dead spots:** 250/279 leads terminal; bounce suppression still writes 0 flags — root cause found: handler checks `data.bounce_type`/`data.email`, Resend sends `data.bounce.type`/`data.to[]` (`R-2`) — one-line-ish fix; T+21d `synastry_teaser` drives 6/10 lifetime unsubscribes; `re_engagement_28d` winback is the bright spot (50% open / 16.7% click on 18 sends). ThreeCardSpread shows free users an "AI interpretation" button that silently does nothing (`07` STR-4) — wire it to the paywall.

---

## P2/P3 — worth batching (selected)

- Pricing page: jargon-first H1 ("Sidereal Vedic charts — Lahiri-accurate" breaks message-match with every ad hook), Free card above Pro on mobile (primary CTA 2.2 viewports deep), annual pre-selected, "risk-free for 14 days" colliding with "3-Day Free Trial" in one viewport, "Locked behind Star" phantom tier on the highest-intent paywall (both locales).
- Message match: the winning creative hook (NASA, $1.14 CPL) has zero echo on the landing (and "NASA-verified" overclaims); ads promise "Free… 60 seconds" and landing says "No account needed", then the email gate interposes. Align hero subtext with the two proven hooks (24° / NASA's actual sky).
- No human social proof anywhere near a CTA — all "proof" is product specs restyled as "Join astrologers…".
- Dead paywall surfaces: synastry inline variant 0/9 opens all-time; essay modal 1/15 ("Read more" promises free continuation, modal asks for money).
- chatgpt.com referrals = 50% of post-pause leads, ≈ Google organic (`DB-6`/`PH-7`) — an unowned channel; the sibling SEO audit (`outputs/seo-audit-2026-07-06/REPORT.md`) owns the fix list (tarot SSR crash + 112 orphan URLs, `/es/` title, AI-crawlability) and should ship in the same push.
- HALF50 wrap-up (settled in `reconcile/half50-stale-link.md`): the stale-link hazard is unreachable — no HALF50 link was ever sent (0 in 1,809 Resend records), and even a clicked link would silently check out at full price with plan/locale/UTM intact (only a handcrafted API POST hits the plan-reset quirk). If reviving: cut a NEW coupon (old one's `redeem_by` is immutable and past), push the 6 commits, apply migration 0018, set `STRIPE_COUPON_HALF50` + `COMPANY_POSTAL_ADDRESS` in Vercel prod **before** any send — and repurpose as the pre-trial-end save offer, not a cold blast to a stale pool.
- Hygiene batch: ES cookie banner fully English (first interactive element an ES visitor sees); EN aria-labels + English calendar popover on `/es/`; anon `/chart` fires a 401 console error on every view; drip UTMs still lack `utm_content` (05-29 #7, unshipped); `sent_lead_emails` welcome rows with NULL `resend_message_id`; Drizzle journal drift (0014-0017 out-of-band, 0018 local-only).

---

## Action plan

**Phase 0 — before any Meta re-spend (≈1-2 days of code + 3 dashboard actions):**
1. P0-1 placeholder-email fix + backfills (unblocks ALL lifecycle email, incl. dunning and trial reminders).
2. P0-2 cookie-banner z-order / portal fix (+ 390×844 regression test).
3. P0-3 `chartId` handoff fix (server fetch; no PII in URL).
4. Dashboard: disable Link Instant Bank Payments; turn off unused PMs in the default configuration; public business name → Estrevia; Radar MIT exemption; auto-cancel setting for past_due zombies.
5. PaywallModal default → monthly.
6. Instrumentation trio: locale-prefix one-liner, server-side `landing_view`, CAPI 422 diagnosis (Events Manager check).
7. ES pre-spend batch: the two remaining 'gratis' strings + modal l10n (4 strings + date), ES ads → `/es/`, ES ad-set targeting cleanup.
8. Push (env vars first per the postal-address gate) and verify deploy.

**Relaunch (week 1):** EN-first at $25/day with the two proven hooks; ES follows once the LATAM Stripe-page work (USD framing at decision point, in-modal trust, local-currency billing evaluation) lands. Expectation-setting: at lifetime CPL $1.19-1.79 and the pre-pause EN lead→user 13.3%, $175/week buys ~100-150 leads → ~13-20 users → 1-3 trials; trial→paid is the number to watch (P0-4 fix should lift it from ~8%).

**Week 2+ (retention/product):** post-purchase → chart redirect + paid onboarding email; `time:null` fix (fabricated Ascendant); email-gate re-arm + value tease; drip refuel decision (new-coupon save offer at trial-end vs cold-pool blast); investigate why 100% of payers go silent on day one (session recordings / first-Pro-session walkthrough — nothing in this audit answers it).

**Explicitly out of scope of this audit (critic-flagged gaps):** organic/SEO page-level CRO (owned by the sibling SEO audit — unintegrated), Clerk free sign-up flow, in-app cancel/churn UX, PWA install/push, consent accept-rate optimization, Sentry server-side errors, per-page lead attribution for the ChatGPT channel, and a CAC→LTV relaunch break-even model (blocked on n; build after 2 weeks of relaunch data).

---

## Contradiction resolutions (what changed vs the sector reports)

| # | Contested claim | Settled (see `reconcile/`) |
|---|---|---|
| 1 | Trial-recovery emails shipped? | Shipped + live (3-source corroboration); `05-meta.md`'s readiness table is wrong on this row |
| 2 | 06-07 payer ES? | **EN end-to-end**; "es" super-prop = `/essays/*` startsWith bug (new P1). ES paid ever stays 1 (gatito, churned 6/28) |
| 3 | ES paywall leak location | Two leaks: modal 0.81× (secondary), **Stripe page 0.19× (dominant)**; `09-es`'s 49%-vs-100% = bucketing artifacts |
| 4 | chartId fix direction | Fetch by `chartId` (`10-live`); `06-landing`'s bd-params fix violates the PII rule |
| 5 | Time-unknown houses | Real defect (`10-live` right): clients send `'12:00'`, schema transforms null→Placidus; engine itself compliant |
| 6 | "Bank app" PMT leak | No config leak; Link Instant Bank Payments inside `link` — dashboard toggle, and it's the dominant decline source |
| 7 | Stale HALF50 link behavior | Unreachable scenario; link path checks out silently at full price (client strips coupon); only raw API POST hits the plan-reset quirk |
| 8 | Bounce count (9 vs 13 vs 15) | Nested subsets; canonical: **16 dispatched / 14 bounced (100% of accepted) / 2 failed pre-send** since 05-29; June cohort 15/13 |
| 9 | Paywall "no dead-ends" | `07-paywall` missed the cookie-banner overlay; LIVE-1 stands |
