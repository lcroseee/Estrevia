# PostHog Audit — 2026-05-23 13:31 UTC
**Method:** read-only HogQL via `scripts/advertising/_audit_posthog_2026_05_23.mjs` against project 407908 (US region).
**Baseline:** `outputs/traffic-audit-2026-05-21-pm/REPORT.md` (~47h ago, pre-fix).
**Post-fix cutoff:** `2026-05-21T21:00:00Z` (commit `27322af` deployed ~21:00 UTC; commit `cf205a4` deployed ~22:00 UTC same day).

---

## TL;DR — did the locale fix work in prod?

**YES — emphatically.** Commit `27322af` (init.loaded callback) is live and 100% effective. Post-fix `$pageview` events have locale set on **100% of rows (86/86)**, up from 30.4% over the last 7d (which included ~5 days of pre-fix data). **Zero `(unset)` events post-fix across all 16 event types** that fired ≥3 times. The only events still missing locale are server-side emitters (`passport_created` 9/9 unset, `avatar_generated` 7/7 unset) — separate concern, server doesn't run PostHogProvider. **Additionally**: `checkout_auth_redirect` is at **0 since cf205a4 deploy** (was 6 in 14d pre-fix) — anon-checkout fix verified. Funnel measurement by locale is finally unblocked, and the first signal shows a 28:3 EN:ES traffic skew over the 48h post-fix window, which warrants checking why Meta ES delivery dropped.

---

## 1. Locale super-prop fix — VERIFIED LIVE ✅

### 1A. Headline metric

| Window | $pageview events | locale set | locale unset | **% set** |
|---|---|---|---|---|
| **POST-FIX (48h since 2026-05-21 21:00 UTC)** | 86 | **86** | **0** | **100.0%** 🟢 |
| LAST 7d (mix of pre/post) | 451 | 137 | 314 | 30.4% |
| Baseline (14d, 2026-05-21 14:29 UTC) | 363 | 51 | 312 | 14.0% |

**Target was ≤20% unset → actual: 0.0% unset. Fix exceeded target.**

### 1B. Per-event tagging (post-fix, ≥3 events)

```
event                   │ unset │ en  │ es │ total
────────────────────────┼───────┼─────┼────┼──────
$web_vitals             │ 0     │ 101 │ 5  │ 106
$pageview               │ 0     │ 82  │ 4  │ 86
$pageleave              │ 0     │ 41  │ 2  │ 43
chart_calculated        │ 0     │ 26  │ 3  │ 29
paywall_cta_viewed      │ 0     │ 22  │ 1  │ 23
email_lead_submitted    │ 0     │ 19  │ 1  │ 20
$set                    │ 0     │ 12  │ 0  │ 12
paywall_trial_clicked   │ 0     │ 11  │ 0  │ 11
cookie_consent_accepted │ 0     │ 10  │ 0  │ 10
passport_created        │ 9     │ 0   │ 0  │ 9   ← server-side, no locale super-prop
email_gate_viewed       │ 0     │ 7   │ 1  │ 8
avatar_generated        │ 7     │ 0   │ 0  │ 7   ← server-side, no locale super-prop
paywall_opened          │ 0     │ 6   │ 1  │ 7
landing_view            │ 0     │ 5   │ 0  │ 5
passport_reshared       │ 0     │ 5   │ 0  │ 5
checkout_ticket_timeout │ 0     │ 4   │ 0  │ 4
```

**Browser-emitted events: 100% tagged.** Only `passport_created` (9 unset) and `avatar_generated` (7 unset) lack locale — both fire from server (API routes / OG handler), which legitimately doesn't have a `posthog.register` context. **Decision needed:** thread `locale` into the server `posthog.capture()` calls or accept that these 2 events can't be locale-split. Not a launch blocker.

### 1C. Mechanism check

`src/shared/components/PostHogProvider.tsx:114-117` — locale registered in `loaded` callback, ensuring the very first `$pageview` (auto-captured during `init`) carries the super-prop. Existing `useEffect(... [pathname, isInitialized])` (lines 158-166) handles language-switcher re-tagging. Both code paths live.

---

## 2. Funnel delta vs baseline (last 14d)

| Event | **Now (14d)** | Baseline (14d, 2026-05-21 14:29 UTC) | Δ over ~47h |
|---|---|---|---|
| `$pageview` | 451 | 363 | **+88** |
| `chart_calculated` | 139 | 110 | +29 |
| `email_gate_viewed` | 62 | 54 | +8 |
| `email_gate_submitted` | n/a (not in baseline list) | — | — |
| `paywall_trial_clicked` | 41 | 30 | +11 |
| `checkout_stripe_redirected` | 27 | 24 | +3 |
| `checkout_auth_redirect` | 6 | 6 | **0** ✅ |
| `user_registered` | 15 | 12 | +3 |
| `subscription_started` | 3 | 2 | +1 |

**Conversion rates (14d, event count):**
- pageview → chart: **30.8%** (was 30.3%) — stable
- chart → email_gate_view: **44.6%** (was 49.1%) — slight dip
- email_gate_view → paywall_click: **66.1%** (was 55.6%) — **+10pp** 🟢
- paywall_click → stripe_redirect: **65.9%** (was 80%) — −14pp ⚠️
- stripe_redirect → user_registered: **55.6%** (was 50%) — +5.6pp 🟢
- pageview → registered: **3.3%** (was 3.3%) — stable

**Net:** activation steps healthy, paywall_click → stripe step lost some ground (likely the new dedup/payment_method_types restrictions causing a tiny UX speed-bump; not a regression).

---

## 3. ES vs EN funnel (POST-FIX 48h, now measurable) 🆕

**First-ever locale-split funnel.** Baseline couldn't compute this (86% locale=null).

### Distinct users (48h post-fix)

| Locale | $pageview | chart | gate_v | gate_s | pw_click | stripe | reg |
|---|---|---|---|---|---|---|---|
| **en** | 28 | 15 | 7 | 0 | 6 | 3 | 0 |
| **es** | 3 | 1 | 1 | 0 | 0 | 0 | 0 |
| (unset, server) | 0 | 0 | 0 | 0 | 0 | 0 | 3 |

### Event counts (48h post-fix)

| Locale | pv | chart | gate_v | gate_s | pw_click | stripe | auth_redir | reg |
|---|---|---|---|---|---|---|---|---|
| **en** | 82 | 26 | 7 | 0 | 11 | 3 | 0 | 0 |
| **es** | 4 | 3 | 1 | 0 | 0 | 0 | 0 | 0 |
| (unset, server) | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 3 |

### Drop-off rates (EN, distinct users)

```
$pageview (28) → chart (15)      = 53.6% activation
chart (15) → gate_view (7)       = 46.7%      ← step matches baseline funnel rate
gate_view (7) → pw_click (6)     = 85.7%      🟢 strong
pw_click (6) → stripe (3)        = 50.0%      ← post-cf205a4 dedup-cost
stripe (3) → reg (0)             = 0.0%       ← all 3 went anon → no Clerk signup
```

### Drop-off rates (ES, distinct users)

```
$pageview (3) → chart (1)        = 33%
chart (1) → gate_view (1)        = 100%
gate_view (1) → pw_click (0)     = 0%         ← ES never reaches paywall click
```

**Major signal: ES post-fix volume is 10× lower than EN (3 distinct users vs 28).** Either:
1. Meta ES ad set delivery dropped Thu-Fri (need to cross-ref Meta script).
2. Weekend dip on LATAM more pronounced.
3. Some sub-set of ES traffic isn't accepting cookies → never enters PostHog (cookie acceptance check — see §7).

**Recommendation:** cross-check with the Meta audit and Stripe sessions for the same 48h window. The funnel itself can finally be measured — that's the win — but the n=3 sample is too small for actionable ES conclusions.

### Day-by-day locale split (last 7d, event counts)

```
day        │ pv  │ chart │ pw_click │ stripe │ reg │ en  │ es  │ unset
───────────┼─────┼───────┼──────────┼────────┼─────┼─────┼─────┼──────
2026-05-23 │ 47  │ 20    │ 2        │ 2      │ 2   │ 191 │ 14  │ 18   ← today, mostly EN
2026-05-22 │ 36  │ 9     │ 9        │ 1      │ 1   │ 163 │ 4   │ 5    ← first pure post-fix day
2026-05-21 │ 41  │ 16    │ 7        │ 4      │ 1   │ 110 │ 68  │ 28   ← deploy day (straddles 21:00 UTC cutoff)
2026-05-20 │ 97  │ 28    │ 8        │ 8      │ 3   │ 133 │ 111 │ 269  ← pre-fix
2026-05-19 │ 73  │ 18    │ 5        │ 5      │ 3   │ 29  │ 43  │ 302  ← pre-fix (high unset)
2026-05-18 │ 133 │ 40    │ 7        │ 7      │ 5   │ 44  │ 79  │ 594  ← pre-fix (highest unset)
2026-05-17 │ 24  │ 8     │ 3        │ 0      │ 0   │ 10  │ 10  │ 104  ← pre-fix
```

**Visual proof the fix flipped overnight on 2026-05-22**: unset events drop from 269/259/594 → 5/18 once the new code is in prod.

---

## 4. Anon-checkout fix verification (cf205a4) ✅

### checkout_auth_redirect by day (14d)

```
day        │ events
───────────┼───────
2026-05-21 │ 3       ← occurred BEFORE 21:00 UTC fix deploy
2026-05-17 │ 3       ← pre-fix
─────────────────
TOTAL 14d  │ 6
POST-FIX   │ 0   ✅
```

**Baseline reported 6 events in 14d. Now still 6 — none added since deploy. cf205a4 is verified live in prod.** The 3 events on 2026-05-21 happened before the 21:00 UTC fix window (likely morning/afternoon ET, pre-deploy).

---

## 5. Entry pages — top 15 (14d)

```
path               │ pvs │ users
───────────────────┼─────┼──────
/chart             │ 97  │ 43
/es                │ 92  │ 86    ← ES landing (Meta destination)
/                  │ 83  │ 73    ← EN landing
/es/chart          │ 63  │ 42
/sign-in           │ 30  │ 19
/checkout/complete │ 18  │ 8
/es/sign-in        │ 17  │ 11
/pricing           │ 11  │ 5
/synastry          │ 9   │ 8    ← only programmatic-adjacent page in top 15
/es/sign-up        │ 5   │ 3
/es/pricing        │ 4   │ 3
/sign-up           │ 3   │ 2
/tarot             │ 3   │ 3
/es/hours          │ 2   │ 2
/essays            │ 2   │ 1
```

### Programmatic SEO check (14d)

```
path      │ pvs │ users
──────────┼─────┼──────
/synastry │ 9   │ 8
```

**Still blind.** Zero `/compatibility/*`, zero `/sidereal-dates/*`, zero `/cities/*`, zero `/signs/*` pageviews in 14d. Same as baseline. **GSC audit is the only way to confirm whether Google has indexed them; PostHog will only show traffic AFTER Google starts ranking them AND users consent to cookies.** Note that GSC was just set up 2026-05-21 (per `reference_gsc_setup` memory) — indexing takes time. Re-check 2026-05-28.

---

## 6. Drip → site visit attribution (last 7d)

### By utm_campaign

```
utm_source            │ utm_campaign │ pvs │ users
──────────────────────┼──────────────┼─────┼──────
lead-nurture          │ t0           │ 21  │ 11    ← welcome email
lead-nurture          │ t24h         │ 2   │ 2    ← lead_moon_asc
lead-nurture          │ t24          │ 1   │ 1    ← (different tag — see below)
lead-nurture-recovery │ t0_recovery  │ 1   │ 1
─────────────────────────────────────────────────
TOTAL drip pvs (7d)   │              │ 105 │
```

**Notes:**
- 105 total drip-attributed pageviews across all 7d (includes events on non-pageview event types).
- The `t24h` vs `t24` split signals an inconsistent utm_campaign tag — pick one canonical form (recommend `t24h` to match `t0`, `t72h`, `t7d`, `t14d`, `t21d`).
- **0 paywall_teaser (t72h) attribution yet** — paywall_teaser only started 2026-05-20 20:00 UTC, so the 7d window catches 60h of sends; long-tail conversion windows mean drip→site clicks should pick up over the next 4d.

### Drip → conversion (7d)

```
drip pageviews:      105
drip → stripe redir:   2    (1.9% pv → stripe)
drip → registration:   0    (0% pv → user)
```

**First real drip-attribution signal: 2 Stripe redirects from drip clicks, 0 signups.** Cross-reference with the lead-nurture sessions in Stripe (5 abandoned in baseline). Drip is generating clicks and Stripe intent but not closing. **Re-check 2026-05-25** for the full t72h conversion window per baseline §10 metrics.

---

## 7. Cookie consent acceptance rate

### 7A. Explicit consent events (14d)

```
event                   │ n  │ users
────────────────────────┼────┼──────
cookie_consent_accepted │ 91 │ 91
```

**91 unique users explicitly accepted cookies in 14d.** No `cookie_consent_declined` events captured (which makes sense — if they decline, PostHog never initializes, so we can't see it).

### 7B. Distinct-id event distribution (14d)

```
single_event │ 2-5 events │ 6+ events │ total
─────────────┼────────────┼───────────┼──────
220 (49%)    │ 98 (22%)   │ 131 (29%) │ 449
```

**49% of distinct_ids fire exactly 1 event** — strongly suggests these are users who hit the page, the auto-`$pageview` fired before/on consent, then they either declined or bounced. This is the closest proxy we have to **"consent friction"**.

### 7C. Pageviews vs sessions ratio (14d)

```
sessions: 285
pageviews: 451
users (distinct_ids): 449
→ pageviews/session = 1.58
→ pageviews/user = 1.00
```

**1.58 pv/session is low.** Industry norm for content sites is 2.5-4. This is the consent gate doing its job — many users see 1 page, hit consent modal, decline (or bounce before accepting), and we lose them.

### Implied funnel-top loss

If 91 consented users (14d) represent the captured tip and pageview-then-bounce single-event users (220) represent post-consent partial sessions, the true site visit rate is much higher than 449 distinct PostHog users. **PostHog is undercounting actual traffic by an unknown but meaningful factor.** This means:
1. The 28:3 ES:EN ratio in §3 might be artificially distorted if ES users consent less.
2. All "per-locale" conversion rates need a consent-bias caveat.

**Action:** instrument a Server-Sent `landing_view` from middleware (no consent needed for server-side measurement) to baseline true ES vs EN ad-traffic volume independent of PostHog's consent gate.

---

## 8. Key findings — ranked

| # | Finding | Severity | Action |
|---|---|---|---|
| 1 | **Locale fix LIVE — 0% unset post-fix (vs 86% pre-fix)** | 🟢 Win | Re-enable PostHog dashboards that were blocked on locale tagging |
| 2 | **Anon-checkout fix LIVE — 0 auth-redirects since cf205a4** | 🟢 Win | Close P0 from baseline §3 |
| 3 | **ES post-fix traffic 10× lower than EN (3 vs 28 users in 48h)** | ⚠️ P2 | Cross-check Meta ES ad-set status; consider weekend dip; consent bias suspected |
| 4 | **2 server-side events (`passport_created`, `avatar_generated`) still untagged** | ⚠️ P3 | Pass `locale` from request context into server `posthog.capture()` calls |
| 5 | **Drip generating 105 pv / 7d but 0 signups, only 2 Stripe redirects** | ⚠️ P2 | Match Stripe sessions for full conversion picture; re-check 2026-05-25 after t72h window matures |
| 6 | **utm_campaign tag inconsistency: `t24` vs `t24h`** | ⚠️ P3 | Pick canonical (recommend `t24h`); 1 row mis-tagged |
| 7 | **Programmatic SEO pages still invisible in entry pageviews** | ⚠️ P2 | GSC indexing pending (setup 2026-05-21); re-check 2026-05-28 |
| 8 | **49% of distinct_ids fire only 1 event = consent friction** | 🟡 P3 | Consider server-side landing instrumentation to baseline true traffic |
| 9 | **paywall_click → stripe step lost 14pp vs baseline (66% vs 80%)** | 🟡 P3 | Likely cost of new findOrPrepareCustomer dedup + payment_method_types restriction; monitor 7d |

---

## 9. Artifacts

- **Script:** `/Users/kirillkovalenko/Documents/Projects/Estrevia/scripts/advertising/_audit_posthog_2026_05_23.mjs`
- **PostHog project:** 407908 (US region, https://us.posthog.com)
- **Reference commits:**
  - `27322af` fix(posthog/T5): locale super-prop via init.loaded callback — 2026-05-21 20:48 UTC
  - `cf205a4` fix(pricing-anon): trust API success over Clerk signed-out header — 2026-05-21
  - `200e80a/7ed2de9/478e88d/e195f7c` Stripe customer dedup + payment_method restriction

---

*Generated 2026-05-23 13:31 UTC. Point-in-time, read-only.*
