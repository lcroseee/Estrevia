# PostHog Funnel Sector — Ad Audit 2026-05-29

Run: 2026-05-29 ~23:20 UTC. PostHog project 407908 (US region). 100% read-only.
Baseline: outputs/traffic-audit-2026-05-23/REPORT.md (2026-05-23 13:35 UTC).

## HEADLINE
Checkout-recovery safety net is 100% broken — and it exposed a systemic root-cause
bug: the anonymous-checkout provisioning path (both the Stripe webhook AND the new
/recover route) tries to write a ~552-char Clerk sign-in JWT into Stripe's 500-char
metadata field, which throws every time. Every anonymous paid checkout fails to
provision, the webhook then retries forever, and `subscription_started` only fires
for already-authenticated checkouts. Meanwhile the account is dark (0 new traffic
since 05-26) so the funnel is coasting on residual sessions.

## SCRIPTS RUN
- `scripts/advertising/_audit_posthog_2026_05_23.mjs` (full funnel, locale, drip, consent)
- `scripts/advertising/_audit_es_paywall_drop_2026_05_23.mjs` (ES /es/ path funnel)
- `scripts/advertising/_audit_recovery_events_2026_05_29.mjs` (NEW probe — recovery events)
- `scripts/advertising/_audit_recovery_reason_2026_05_29.mjs` (NEW probe — failure reason)

---

## 1. FULL FUNNEL (14d, event counts unless noted)

| stage | count | uniques |
|---|---|---|
| $pageview | 661 | 262 |
| chart_calculated | 206 | 124 |
| email_gate_viewed | 66 | 66 |
| paywall_cta_viewed | 71 (post-fix 48h) | — |
| paywall_opened | 32 (post-fix 48h) | — |
| paywall_trial_clicked | 63 | 35 |
| checkout_stripe_redirected | 58 | 31 |
| user_registered | 20 | 20 |
| subscription_started | 7 | 7 |
| checkout_auth_redirect | 6 (all pre-fix) | 3 |

Funnel is intact stage-to-stage until Stripe. The cliff is checkout_stripe_redirected (58)
→ subscription_started (7) = 12% completion across BOTH locales. See Finding P0-1 for why.

Daily (7d) confirms acquisition is OFF: 05-29 had 10 pv / 0 chart / 0 stripe; 05-28 12 pv / 0 stripe;
05-27 21 pv. The only live days were 05-23..05-25 (the residual tail of the last paid push). Matches
the main-thread fact that the entire ad account is paused (0 spend 26-28 May).

---

## 2. ES /es/ PATH FUNNEL (14d) vs BASELINE

| stage | baseline 05-23 (users) | now 05-29 (users) | now (events) |
|---|---|---|---|
| $pageview | 119 | 126 | 250 |
| chart_calculated | 51 | 54 | 75 |
| email_gate_viewed | 37 | 37 | 37 |
| paywall_opened | 24 | 28 | 41 |
| paywall_trial_clicked | 12 | 15 | 22 |
| checkout_stripe_redirected | 10 | 13 | 17 |
| subscription_started / complete | 0 | **0** | 0 |

ES Stripe redirects went 10→13 users (so the ES Stripe fix did NOT regress traffic to
Stripe), but **ES completion is still 0**. DB cross-check inside the script: 127 ES leads
in 14d, only 1 became a user, 0 with a Stripe customer_id. ES funnel break is confirmed
at the Stripe page (sessions created, 0 paid) AND — newly — at provisioning (Finding P0-1).
NOTE: ES traffic post-account-pause is ~0 (post-fix 48h shows only 3 ES pv / 2 users), so the
es-419 + LATAM custom_text fix (5849f22) has had almost NO fresh ES Stripe sessions to prove
itself against. "ES completion 0%" right now = mostly "no new ES traffic," not a re-confirmed
broken Stripe page. Verdict on the ES fix: UNVERIFIABLE until ES ad set is re-enabled.

---

## 3. CHECKOUT-RECOVERY EVENTS (the new instrumentation)

Event names (src/shared/lib/analytics.ts:243-245):
`checkout_recovery_attempted` / `checkout_recovery_succeeded` / `checkout_recovery_failed`.

7d counts:
| event | count | users |
|---|---|---|
| checkout_recovery_attempted | 8 | 2 |
| checkout_recovery_succeeded | **0** | 0 |
| checkout_recovery_failed | **8** | 2 |
| checkout_ticket_timeout | 11 | 4 |
| checkout_auto_started | 11 | 2 |
| anonymous_checkout_started | 29 | 21 |

The 30s-timeout → /recover wiring DOES fire (8 attempts, both distinct_ids are
`cs:cs_live_…` Stripe sessions). But every attempt FAILS — 0 succeeded, 8 failed,
100% failure rate. Neither recovery user has subscription_started=1. See Finding P0-1
for the exact failure reason pulled from the event `reason` property.

---

## 4. LOCALE FIX — HOLDING

Post-fix 48h: 100.0% of $pageview have locale set (0.0% unset, n=296). Last 7d: 100.0% set.
Per-event (post-fix): $pageview, chart_calculated, email_gate_viewed, paywall_*, checkout_*
all show unset=0. The ONLY events with unset locale are server-side / share-flow events that
never had locale super-prop (anonymous_checkout_started=31 unset, avatar_generated=28,
passport_created=27, passport_viewed=15, checkout_recovery_attempted=8) — expected, those
fire outside the browser super-prop context. Verdict: locale super-prop fix (27322af) HOLDS.

## 4b. checkout_auth_redirect — STILL CLOSED

0 events since 2026-05-21T21:00 (cf205a4 deploy). The 6 in the 14d window are all dated
05-17 and 05-21 (pre-fix). Verdict: HOLDS.

---

## 5. LANDING_VIEW — BLIND SPOT REMAINS

`landing_view` IS instrumented but CLIENT-side only:
src/app/[locale]/(marketing)/LandingViewTracker.tsx fires `trackEvent(LANDING_VIEW)` in a
useEffect. The file's own comment: "if the user has not accepted cookies, posthog.capture()
is a no-op." So it is cookie-consent-gated — exactly the undercount the 05-23 baseline flagged.
14d count: only 24 landing_view events vs 114 pv on `/` + 97 on `/es`. The recommended
SERVER-side landing_view (middleware / route handler, bypassing consent) was NOT instrumented
(grep of src/middleware.ts shows no capture). Blind spot UNCHANGED.

---

## FINDINGS

### P0-1 — Anonymous-checkout provisioning + /recover both broken by Stripe 500-char metadata cap
Root cause. The Clerk sign-in JWT is ~552 chars; Stripe `metadata` values cap at 500.
- /recover route (src/app/api/v1/checkout/recover/route.ts:228) and the Stripe webhook
  ANONYMOUS branch (src/app/api/webhooks/stripe/route.ts:223) both do
  `stripe.checkout.sessions.update(id, { metadata: { signInTicket: ticket.token } })`.
- PostHog `checkout_recovery_failed.reason` (8/8 events): "Metadata values can have up to
  500 characters, but you passed in a value that is 552 characters."
- In the webhook this throw is caught at route.ts:295 and RETHROWN (line 315) AFTER deleting
  the dedup row (line 297-300) → DB upsert (line 353) and subscription_started (line 414)
  NEVER run, and Stripe retries the webhook forever (each retry re-throws).
- In /recover the throw aborts before the DB upsert (step 11) → no provisioning, emits failed.
- Funnel evidence: checkout_stripe_redirected=58 (14d) but subscription_started=7. The 7 are
  almost certainly AUTHENTICATED checkouts (clerkUserId already known → anon branch + ticket
  write skipped entirely). Anonymous paid checkouts systematically fail to provision.
This is a launch-blocking payment-path bug and is the likeliest mechanical cause behind the
"0 real paid / leads not converting" pattern across recent audits.

### P0-2 — ES Stripe fix unverifiable; ES completion still 0 (but no fresh ES traffic)
ES /es/ funnel reached Stripe 13 users / 17 events in 14d, 0 completions. DB: 127 ES leads,
1 user, 0 customers. The es-419 + LATAM custom_text fix (5849f22) shipped, but post-account-pause
ES traffic is ~0 (3 ES pv in 48h), so the fix has had essentially no new ES Stripe sessions to
prove against. Cannot confirm it moved ES completion >0. Compounded by P0-1 (even a paid ES anon
session would fail provisioning).

### P1-1 — landing_view server-side instrumentation still missing (consent undercount)
landing_view is client+consent-gated (LandingViewTracker.tsx). 24 events vs ~211 landing pvs in
14d implies large undercount. The reconciler (modules/advertising/perceive/reconciler.ts) compares
Meta clicks vs PostHog landing_view ≥25% divergence to suspend the agent — feeding it an
undercounted client-side number risks false "divergence" suspensions once the account is live again.

### P2-1 — recovery + webhook divergence comment is now load-bearing and violated
recover/route.ts:23-25 explicitly says "if you change the users upsert in webhooks … mirror the
change here." Both share the SAME metadata bug, so fixing one MUST fix the other. Recommend a shared
helper (write signInTicket as a short opaque id keyed to the JWT in Redis/DB, OR pass the ticket via
the Clerk redirect URL / a dedicated short metadata key) rather than the full JWT.

---

## RECHECK RESULTS
- ES completion >0?  → NO (still 0; but ~0 fresh ES traffic so fix unproven). PARTIAL.
- checkout-recovery events firing? → YES they fire, but 0 succeeded / 8 failed (100% fail). FAIL.
- locale fix holding? → YES, 0% unset on browser events. PASS.
- landing_view instrumented? → client-side only (consent-gated); server-side never added. FAIL (blind spot remains).

## BLIND SPOTS / CAVEATS
- Account dark since 05-26 → funnel numbers are residual; no fresh acquisition to test fixes against.
- Distinguishing authenticated vs anonymous subscription_started=7 is inferred from code flow, not a
  PostHog property — Stripe sector should confirm which of the 7 were anon vs authed.
- Whether the 2 recovery-failed paying customers (cs_live_b1dn… / cs_live_b1wV…) ultimately got
  provisioned by ANY path needs Stripe + DB cross-check (PostHog shows sub=0 for both).
- recovery_succeeded fast-path (cached ticket) would also be blocked since the ticket can never be
  cached (the write that caches it is the one that throws).
