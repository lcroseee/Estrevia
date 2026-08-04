# PostHog Sector — CRO Audit 2026-07-10

Run: 2026-07-10 ~21:46–21:55 UTC. PostHog project 407908 (US region, us.posthog.com), 100% read-only HogQL via Query API.
Primary window: **2026-05-29T00:00:00 → 2026-07-10 (~6 weeks, 42 days)**. Trailing 30d / 14d labeled where used.
Baseline: `outputs/ad-audit-2026-05-29/REPORT.md` + `02-posthog.md` (14d window ≈ 2026-05-15 → 05-29).

Scripts (new, read-only, in `scripts/advertising/`):
- `_cro_audit_2026_07_10_posthog_funnel.mjs` — full funnel, locale, device, sources, errors
- `_cro_audit_2026_07_10_posthog_drilldown.mjs` — checkout chain raw, consent, trial-expiration UTM, paywall triggers, baseline compare
- `_cro_audit_2026_07_10_posthog_verify.mjs` — freshness, paywall×device, discount-UTM check, winback user trail

Event names verified as actually fired in `src/` (grep excluding `__tests__`): `email_gate_viewed`/`email_gate_dismissed`/`email_lead_resubmitted` (EmailGateModal.tsx), `paywall_opened`/`paywall_trial_clicked`/`checkout_stripe_redirected` (PaywallModal.tsx), `paywall_cta_viewed` (PaywallCta.tsx), server-side `email_lead_submitted`, `subscription_started`, `checkout_ticket_*`, `anonymous_checkout_started`. `user_signed_up` / `user_signed_in` remain **ghost-defined** (0 call sites outside `analytics.ts`, 0 events) — do not use in dashboards.

---

## HEADLINE

**The site is behaviorally dead — and the funnel plumbing underneath it is now verifiably fixed.** Unique visitors are down **95%** (261 → 12 uniques per 14d; source: HogQL `$pageview` uniques, 2026-05-15→05-29 vs trailing 14d) after 47 days of the deliberate Meta pause. Meanwhile the P0 that justified the pause — paid anonymous users locked out — is **confirmed fixed in production**: both anonymous paid checkouts in the window completed the full `anonymous_checkout_started → checkout_ticket_ready → subscription_started → user_registered` chain in ~70 s, with **0** `checkout_recovery_failed` and **0** `checkout_ticket_timeout` in 42 days (vs 8/8 failures + 11 timeouts pre-fix). From the behavioral-analytics side, the stated precondition for relaunch is met; every additional dark day forgoes ~10 leads/day at the last-known $1.0–1.7 CPL.

---

## 1. Full funnel — window 2026-05-29 → 2026-07-10 (HogQL, events + distinct users)

| stage | events | users | source event |
|---|---|---|---|
| Landing/page view | 127 | 50 | `$pageview` |
| Chart calculated | 44 | 22 | `chart_calculated` |
| Email gate viewed (client) | 9 | 9 | `email_gate_viewed` |
| **Lead captured (server)** | **22** | **22** | `email_lead_submitted` |
| Paywall CTA viewed | 39 | 19 | `paywall_cta_viewed` |
| Paywall opened | 18 | 10 | `paywall_opened` |
| Trial clicked | 7 | 5 | `paywall_trial_clicked` |
| Stripe redirect | 8 | 6 | `checkout_stripe_redirected` |
| Anonymous checkout (server) | 9 | 7 | `anonymous_checkout_started` |
| Sign-in ticket ready | 2 | 2 | `checkout_ticket_ready` |
| **Subscription started** | **2** | **2** | `subscription_started` |
| User registered | 7 | 7 | `user_registered` |

Trailing 30d subset: 66 pv / 29 users, 13 leads, 4 stripe redirects, **1** subscription.

**Step-to-step (distinct users, window):** pv 50 → chart 22 (**44%**) → paywall CTA 19 (86% of chart) → paywall open 10 (**53%**) → trial click 5 (50%) → Stripe redirect 6 → subscription 2 (33% of redirects). The single biggest *user* loss is pv→chart (−56%), but most residual traffic is drip clickers/content readers; the biggest *in-product* drop is **paywall CTA → open: natal-chart trigger 31 CTA views → 6 opens (19%)** (query: events grouped by `properties.trigger`).

Caveat on every percentage: **n is single-digit at the bottom of the funnel.** No step below `chart_calculated` has ≥25 users. This window cannot support statistically meaningful CRO conclusions; it can only support plumbing verification (which it does, well).

## 2. Traffic collapse vs baseline (the P0)

| metric | 14d ending 05-29 | trailing 14d (06-26→07-10) | delta |
|---|---|---|---|
| `$pageview` events | 651 | 17 | **−97.4%** |
| `$pageview` uniques | 261 | 12 | **−95.4%** |

(Source: single HogQL query over both windows, `_posthog_drilldown.mjs` §7.)

Daily trend: last full day with any browser event was 2026-07-06; **07-07, 07-08, 07-09 have 0 browser events** (only 1–2 server-side events/day — ingestion itself is alive, so this is genuinely zero consenting visitors, not a pipeline failure; verified via `$lib` split, `_posthog_verify.mjs` §A). Weekly uniques decay: 15 → 11 → 7 → 12 → 7 → **2** (weeks of 05-31 → 07-05).

Leads still trickle in at ~0.5/day (22 leads/42d, server-side) from organic + drip — for comparison, the pre-pause machine did ~10–13 leads/day.

## 3. Anonymous-payer fix — VERIFIED WORKING in production (was P0-1 on 05-29)

Chronological checkout-chain trace (window, `_posthog_drilldown.mjs` §2):

- **2026-06-07 02:37 UTC** — `anonymous_checkout_started` (uuid distinct_id) → `checkout_stripe_redirected` (ES locale, from `/essays/sun-in-gemini`) → 76 s later `checkout_ticket_ready` → `subscription_started` (**pro_monthly**) → `user_registered`, all under new `user_3En2Ff5…` id.
- **2026-06-16 14:25 UTC** — `anonymous_checkout_started` → redirect from `/pricing` (EN) → 65 s later `checkout_ticket_ready` → `subscription_started` (**pro_annual** — first annual sub visible in PostHog) → `user_registered` (`user_3FDqWz…`).

Scorecard vs 05-29: `checkout_recovery_failed` **8/8 → 0**, `checkout_ticket_timeout` **11 → 0**, ticket delivery **0% → 2/2**. The fix (de39cee, pushed 2026-05-30) holds on every anonymous paid checkout since. n=2 — small, but it is 100% of the post-fix paid anon volume, and the failure mode that used to fire on *every* attempt now fires on none.

Also verified: `checkout_auth_redirect` = 0 in window (stays closed since cf205a4).

## 4. Locale super-prop — fix HOLDS; EN vs ES

**0 of 303 browser events have unset locale** in the 42d window (per-event breakdown: `$pageview` 0/127 unset, `chart_calculated` 0/44, all paywall/checkout client events 0 unset). The only unset-locale events are server-side (`anonymous_checkout_started` 9, `user_registered` 7, `subscription_started` 2, `checkout_ticket_ready` 2) — expected, they fire from `posthog-node` outside the super-prop context. The 05-21 "89% null" race is fully resolved and stable (was already 100% on 05-29; still 100%).

EN vs ES funnel (distinct users, window; locale-tagged client events only):

| locale | pv | chart | gate_v | lead | cta_v | pw_open | pw_click | stripe |
|---|---|---|---|---|---|---|---|---|
| en | 27 | 17 | 8 | 14 | 12 | 4 | 3 | 4 |
| es | 24 | 5 | 1 | 8 | 7 | 7 | 2 | 2 |

ES quirks at this n: ES users calculate charts far less (5/24 vs 17/27) but open paywalls *more* (7 users, almost all on `/essays/*` pages — ES traffic is essay-readers hitting the essay paywall, not chart users). Both subscriptions are server-side (locale unset), but the 06-07 pro_monthly checkout chain was **es-locale** — plausibly the second-ever ES paid conversion (Stripe sector should confirm). Numbers are too small to re-litigate the "ES converts 11× worse" finding either way.

## 5. Device split

| device | pv | chart | pw_open | pw_click | stripe | sub |
|---|---|---|---|---|---|---|
| Mobile | 38 | 19 | 10 | 5 | 6 | — |
| Desktop | 12 | 3 | **0** | **0** | **0** | — |

(users, window; subs are server-side/deviceless.) For the biggest in-product drop (paywall CTA → open): Mobile 14 natal-chart CTA viewers → 10 openers; **Desktop 4 CTA viewers → 0 openers, and 0 desktop users ever reached Stripe in 42 days.** 24% of visitors are desktop and produce zero money-path events. At n=12 this is a watch-item, not a verdict — re-measure at relaunch.

## 6. Traffic sources with Meta dark (window, `$pageview`)

| source | users | note |
|---|---|---|
| $direct / (none) | 23 | includes untagged email + bookmark |
| Drip emails (`utm_source=lead-nurture` + gmail referrer) | ~10–13 | campaigns t0/t24h/t72/t14d/t21d; **t21d 9 pvs from 2 users** |
| Google search | 9 | www.google.com organic |
| **chatgpt.com** | ~7 | 6 via `utm_source=chatgpt.com` + 2 referrer — AI referrals now ≈ Google-organic scale |
| trial-expiration email | 1 | 7 clicks from a single user (see §7) |
| DuckDuckGo/Bing/Ecosia/Yahoo | ~7 | long-tail organic |

Drip attribution works (`utm_campaign` per step present); **`utm_content` is still empty on all drip pageviews** — the 05-29 P1 "drip revenue unattributable at ad-level" remains at campaign granularity only.
No `utm` matching discount/half/blast exists in the window → **HALF50 blast confirmed never sent** (consistent with known state).

## 7. Trial-expiration email — live and clicked, but the winback path dead-ends

`utm_source=trial-expiration&utm_campaign=trial_ended` pageviews exist (7 clicks, 1 user: `user_3ECza74…`, 05-29→05-30) → the T-24h/T-0 trial-email cron (`src/app/api/cron/trial-expiration/route.ts`) is deployed and driving return visits.

But the trail shows the dead-end: 05-30 04:27 the user hits `/checkout/start` → `checkout_auto_started` → `checkout_stripe_redirected` fires → **0.8 s later they land on `/settings`** — that's the `already_subscribed=1` redirect from `src/app/api/v1/stripe/checkout/route.ts:229`. A trial-ended user who clicks the email's CTA to fix payment gets bounced to settings instead of a payment-update flow. Two sub-issues:
1. **UX**: winback CTA → "already subscribed" bounce (Stripe sector: what state was this sub in? likely past_due).
2. **Instrumentation**: `checkout_stripe_redirected` fires *before* checking whether the returned URL is Stripe or the `/settings?already_subscribed=1` bounce (PaywallModal/CheckoutStart fire on API success) — the "reached Stripe" step is inflated by every bounced attempt.

## 8. Consent blind spot — 59% of converting visitors are invisible client-side

Window: **22 server-side `email_lead_submitted` users vs only 9 client-side `email_gate_viewed` users** — i.e. at most **41%** of visitors who actually became leads had accepted cookies (12 `cookie_consent_accepted` events in 42 days). Days like 07-04 show 1 lead with 0 pageviews. Consequences:
- Every client-side funnel number above understates reality by ~2.4×.
- `landing_view` is still client-only + consent-gated (15 events vs 127 `$pageview` in window; `LandingViewTracker.tsx` unchanged — no server-side capture in `src/middleware.ts`). The 05-29 P1 stands: **the ad-agent reconciler compares Meta clicks vs `landing_view` and will false-suspend on relaunch** if this isn't shipped first.

## 9. Error-ish events since 2026-05-29

Zero. No `checkout_recovery_failed`, `checkout_error`, `checkout_ticket_timeout`, `checkout_auth_redirect`, `avatar_generation_failed`, or `$exception` events in the window (query across all six names returned no rows). Clean bill — though partly because there is almost no traffic to generate errors.

---

## FINDINGS (ranked)

### PH-1 · P0 — Acquisition dark 47 days; behavioral traffic down 95% and the stated relaunch blocker is now verifiably fixed
Load-bearing number: **261 → 12 unique visitors per 14d (−95.4%)**; 0 browser events on 3 of the last 6 days.
The 05-29 plan said "fix the funnel, then relaunch." PostHog now shows the funnel's worst plumbing bug (anon payer lockout) fixed in prod (see PH-2) — but no relaunch happened, and no code has shipped since 05-30. The account is not "paused pending fixes" anymore; it is paused past its reason. At the pre-pause run-rate (~10 leads/day, $1.0–1.7 CPL) the dark period has foregone roughly 400–470 leads.
**Recommendation:** treat relaunch as the #1 CRO action. Precondition from this sector: ship server-side `landing_view` first (PH-3), or the reconciler will false-suspend the agent.

### PH-2 · P1 (verification, positive) — Anonymous-payer sign-in handoff works end-to-end in production
Load-bearing number: **2/2 anon paid checkouts → `checkout_ticket_ready` → `subscription_started` → `user_registered` in ~70 s; 0 recovery failures / 0 ticket timeouts in 42d** (was 8/8 failed + 11 timeouts).
**Recommendation:** un-gate the relaunch decision on this item; add the chain (`anonymous_checkout_started` → `checkout_ticket_ready` ratio) to the relaunch watch-dashboard to confirm at volume.

### PH-3 · P1 — Client-side funnel blind spot: only ~41% of converting visitors visible; `landing_view` still consent-gated client-only
Load-bearing number: **9 client `email_gate_viewed` users vs 22 server `email_lead_submitted` users (41% visibility)**; 12 consent-accepts in 42d.
All client funnel metrics understate ~2.4×, and the reconciler's Meta-clicks-vs-`landing_view` divergence check will false-trip on relaunch (unchanged since 05-29 P1-1).
**Recommendation:** ship server-side `landing_view` (middleware or route handler) before re-enabling ads; consider a consent-exempt, cookieless server counter for gate-view/lead steps.

### PH-4 · P2 — Winback checkout dead-ends at `/settings?already_subscribed=1` and inflates the Stripe-redirect step
Load-bearing number: the **only** trial-expiration email clicker (7 clicks) attempted checkout and was bounced to `/settings` in **0.8 s**; `checkout_stripe_redirected` fired anyway (`stripe/checkout/route.ts:229` returns the bounce URL as success).
**Recommendation:** route already-subscribed/past_due users from the trial-ended email straight to the billing portal / payment-update; fire a distinct `checkout_already_subscribed` event instead of `checkout_stripe_redirected`.

### PH-5 · P2 — Biggest in-product drop: natal-chart paywall CTA → open = 19%; desktop money-path is zero
Load-bearing numbers: natal-chart trigger **31 `paywall_cta_viewed` → 6 `paywall_opened` (19%)**; desktop: 12 pv users → **0** paywall opens / **0** Stripe redirects in 42d (all 6 Stripe-redirect users mobile).
n is tiny; treat as the top re-measure candidates at relaunch, not as proven defects.
**Recommendation:** instrument CTA visibility vs click separately, and re-run this exact query 7 days after ads resume.

### PH-6 · P3 — Locale super-prop fix holds (0% unset on browser events); drip UTM still lacks `utm_content`
Load-bearing number: **0/303 browser events with unset locale** in 42d.
Drip pageviews carry `utm_campaign=t0/t24h/t72/t14d/t21d` but empty `utm_content` — the 05-29 recommendation (prefixed `utm_content=drip_<step>`) remains unshipped; also `t72` vs `t72h` naming inconsistency persists.
**Recommendation:** keep; add `utm_content` when the next email change ships.

### PH-7 · P3 — ChatGPT referrals now rival Google organic
Load-bearing number: ~7 users from chatgpt.com vs 9 from www.google.com in 42d.
**Recommendation:** nothing to fix; worth an AI-SEO glance (the site is being cited by ChatGPT) and worth keeping `/essays/*` fast + indexable — ES essay pages are also where ES paywall opens happen.

---

## Cross-sector handoffs
- **Stripe sector:** confirm the two `subscription_started` (06-07 pro_monthly es-flow; 06-16 pro_annual) statuses incl. `cancel_at_period_end`/`ended_at`; state of `user_3ECza74…`'s sub at 05-30 (already_subscribed bounce); whether repeat-abandoner `f4800984-…` (3 Stripe redirects: 05-30, 06-16, 06-24, no sub) has expired sessions.
- **Resend sector:** drip t21d generated 9 pvs/2 users — deepest-step drip still pulls returns; trial-expiration email click-through confirmed live.
- **Meta sector:** account presumed still dark — PostHog shows zero `utm_source=meta/facebook/ig` traffic in the window (0 rows in source table).

## Caveats
- Everything below `chart_calculated` has n < 25 users; percentages are directional only.
- Client/server distinct_id spaces differ (uuid vs `user_*` vs anon-uuid), so cross-step user ratios mixing server events (leads, subs) with client events are approximate.
- 0 browser events on 07-07/08/09 was verified as real absence-of-consenting-traffic (server events still ingesting), not a pipeline outage — but a same-day PostHog ingestion lag of a few hours for 07-10 cannot be excluded.
