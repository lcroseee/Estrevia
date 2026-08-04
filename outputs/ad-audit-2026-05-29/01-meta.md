# Meta Ads Sector Report — 2026-05-29

**Investigator:** Claude (Opus 4.8, 1M ctx) · scope: Meta Ads only · **100% READ-ONLY**
**Run at:** 2026-05-29 ~23:20 UTC
**Account:** `act_1435842067150024` (USA AUTOMOTO EXPORT business) · currency USD
**Baseline:** `outputs/traffic-audit-2026-05-23/01-meta.md` (2026-05-23 13:30 UTC)
**Method:** 3 read-only Graph API scripts (`_audit_meta_2026_05_23.mjs`, `_audit_meta_creative_2026_05_21.mjs`, `_audit_meta_dark_date_2026_05_29.mjs` + `_audit_meta_creatives_targeting_2026_05_29.mjs` — both new, READ-ONLY, dotenv+fetch pattern).

---

## HEADLINE

**The entire Estrevia ad account is DARK and has been for 5 full days.** Last day with any spend was **2026-05-24 ($20.51, 13 leads)**. The campaign `Estrevia Launch — Leads` was paused at **2026-05-24T13:29:07 UTC** (EN Tier-1 ad-set toggled 2026-05-24T13:29:15). Days **2026-05-25, -26, -27, -28, -29** show $0.00 spend / 0 reach across every ad set. Acquisition is 100% OFF. Estimated foregone: **~51 EN leads (~$88 acquisition) over the 5 dark days at EN run-rate, or ~81 leads if both EN+ES had been live.** Nothing else in this audit matters until the account is turned back on.

---

## 1. PIN THE DARK DATE

The `_audit_meta_pause_timing_2026_05_23.mjs` script uses a relative `last 7d` window, so re-run today it returns all-zero (the 7d window is 5/22–5/29, mostly dark). I wrote `_audit_meta_dark_date_2026_05_29.mjs` with an **explicit** range `2026-05-15..2026-05-28` to get a stable view.

### Account-level daily spend (explicit range)

| Date | Spend | Impr | Reach | Leads |
|---|---|---|---|---|
| 2026-05-15 | $2.68 | 2,807 | 2,555 | 0 |
| 2026-05-16 | $7.94 | 8,278 | 7,743 | 0 |
| 2026-05-17 | $73.28 | 19,985 | 15,902 | 51 |
| 2026-05-18 | $77.12 | 20,921 | 16,121 | 74 |
| 2026-05-19 | $43.85 | 14,268 | 11,743 | 33 |
| 2026-05-20 | $39.67 | 12,409 | 10,758 | 27 |
| 2026-05-21 | $24.54 | 2,443 | 2,258 | 10 ← ES paused 08:40 UTC |
| 2026-05-22 | $17.63 | 911 | 807 | 10 |
| 2026-05-23 | $17.43 | 1,306 | 1,152 | 7 |
| **2026-05-24** | **$20.51** | **1,197** | **1,108** | **13** ← LAST SPEND DAY |
| 2026-05-25 | **$0.00** | 0 | 0 | 1 (drip/delayed attr) |
| 2026-05-26 | **$0.00** | 0 | 0 | 0 |

(5/27–5/29 confirmed $0 — they fall in the relative `last_7d` window which now totals only $55.57 with all of it landing on 5/22–5/24.)

### Per-ad-set last-spend day

| Ad set | ID | Last day with spend > $0 | Current effective_status | updated_time |
|---|---|---|---|---|
| **EN — Lead — Tier-1 (no EU)** | 120243116854610527 | **2026-05-24** | PAUSED | 2026-05-24T13:29:15 |
| ES — Lead — LATAM USD | 120243116822500527 | 2026-05-21 | PAUSED | 2026-05-21T08:40:54 |
| ES — Astrología sidérea (LPV) | 120243025977660527 | 2026-05-17 | CAMPAIGN_PAUSED | 2026-05-11T07:53:32 |

### Campaign-level

| Campaign | effective_status | updated_time |
|---|---|---|
| **Estrevia Launch — Leads** | **PAUSED** | **2026-05-24T13:29:07** |
| Estrevia Launch — Sidereal Astrology | PAUSED | 2026-05-17T08:56:43 |

**Conclusion:** The kill happened at the **campaign** level. `Estrevia Launch — Leads` (parent of both EN Tier-1 and ES LATAM) was paused 2026-05-24 13:29:07 UTC. EN Tier-1 had been the only live spender after the 5/21 ES pause; when the campaign was paused 5/24, the account went fully dark.

**Days dark (no acquisition):** 2026-05-25, 26, 27, 28, 29 = **5 full days** as of this audit (>120 hours).

---

## 2. ACCOUNT-LEVEL SNAPSHOT — 14d / 7d / 48h vs baseline

Today's `_audit_meta_2026_05_23.mjs` windows (relative to 2026-05-29):

| Metric | Baseline 14d (→05-23) | Now 14d (→05-29) | Now 7d | Now 48h | Δ vs baseline 14d |
|---|---|---|---|---|---|
| Spend | $333.95 | **$324.65** | $55.57 | (no data) | −$9.30 |
| Impressions | 136,895 | 84,525 | 3,414 | 0 | −52,370 (−38%) |
| Reach | 96,013 | 55,515 | 2,755 | 0 | −40,498 (−42%) |
| Clicks | 9,316 | 5,509 | 191 | 0 | −3,807 |
| CTR | 6.81% | 6.52% | 5.59% | — | −0.29pp |
| CPM | $2.44 | $3.84 | $16.28 | — | +$1.40 |
| CPC | $0.036 | $0.059 | $0.291 | — | +$0.023 |
| Frequency | 1.43 | 1.52 | 1.24 | — | +0.09 |
| Leads | 207 | 228 | 33 | 0 | +21 |
| CPL | $1.61 | $1.42 | $1.68 | — | −$0.19 |

**Reading:** the 14d numbers *look* stable-to-improved (CPL down to $1.42) only because the window still contains 9 days of pre-dark spend (5/15–5/24). The **48h window has literally no data** — the cleanest possible signal that the account is off. The 7d window ($55.57 / 33 leads) is the dying tail: all of it lands on 5/22–5/24, none after.

### Daily series (the truth)
Spend collapsed from a peak of **$77.12/day (5/18)** to **$0.00/day (5/25 onward)** — a **−100% cliff**, not a gradual decline. This is a hard stop, not creative fatigue throttling.

### Per-ad-set 14d (from main script)

| Ad set | Spend | Impr | CTR | CPM | Freq | Leads | CPL |
|---|---|---|---|---|---|---|---|
| EN — Lead — Tier-1 | $195.51 | 11,065 | 6.18% | $17.67 | 1.74 | 114 | $1.72 |
| ES — Lead — LATAM USD | $116.46 | 60,128 | 5.78% | $1.94 | 1.61 | 114 | $1.02 |
| ES — Astrología (LPV) | $12.68 | 13,332 | 10.11% | $0.95 | 1.13 | 0 | — |

These match the live state confirmed by the main thread exactly (EN $195.51/114/$1.72/$17.67/1.74; ES $116.46/114/$1.02/$1.94/1.61; ES LPV $12.68). No contradiction.

---

## 3. CREATIVE FATIGUE + NEW-CANVA-CREATIVE STATUS

### Were the 3 new EN Canva creatives (5/23) ever uploaded as live ads? YES — all 3.

Ad-level `created_time` inside EN Tier-1 ad set:

| Ad name | created_time | Angle | creative title | eff_status | Got delivery? |
|---|---|---|---|---|---|
| `ad_lead_en_off24_2026-05-23` | 2026-05-23T15:01:35 | **A "OFF by 24°"** | "See your real sign" | ADSET_PAUSED | **NO — $0, 0 impr** |
| `ad_lead_en_nasa_2026-05-23` | 2026-05-23T15:01:37 | **B "NASA actual sky"** | "NASA-verified chart" | ADSET_PAUSED | **YES — $11.35 / 904 impr / 10 leads / $1.14 CPL / 5.09% CTR** |
| `ad_lead_en_made_2026-05-23` | 2026-05-23T15:01:39 | **C founder POV** | "Built differently" | ADSET_PAUSED | **NO — $0, 0 impr** |

**So the founder DID upload all 3** (created 2026-05-23 15:01 UTC, ~90 min after the 5/23 audit ran). But Meta only delivered impressions to **NASA (Angle B)** before the campaign was paused 5/24. Angle A (off24) and Angle C (made) have **zero lifetime spend/impressions** — Meta concentrated the tiny remaining budget on its existing learned winners (passport + nasa). off24 and made are starved, not failed; they need the account re-enabled to get a real read.

### Creative performance — 14d (sorted by spend)

| Ad | Lang | Spend | CTR | CPM | Freq | LPV | Leads | CPL |
|---|---|---|---|---|---|---|---|---|
| ad_lead_en_passport | EN | $112.02 | 5.59% | $17.35 | **1.44** | 145 | 67 | $1.67 |
| ad_lead_es_combinations | ES | $62.95 | 5.74% | $1.85 | 1.37 | 378 | 49 | $1.28 |
| ad_lead_en_combinations | EN | $49.28 | 7.38% | $21.65 | 1.35 | 56 | 27 | $1.83 |
| ad_lead_es_lahiri | ES | $28.82 | 6.66% | $1.92 | 1.31 | 244 | 32 | **$0.90** |
| ad_lead_es_passport | ES | $16.82 | 3.74% | $2.31 | 1.22 | 100 | 28 | **$0.60** |
| ad_lead_en_lahiri | EN | $13.05 | 6.29% | $14.15 | 1.21 | 17 | 6 | $2.18 |
| **ad_lead_en_nasa (new B)** | EN | $11.35 | 5.09% | $12.56 | 1.14 | 19 | 10 | **$1.14** |
| ad_en_lead_v1 | EN | $6.15 | 12.62% | $19.90 | 1.24 | 10 | 4 | $1.54 |

**Fatigue read:** the EN workhorse `ad_lead_en_passport` was at **freq 1.44** and ad-set EN Tier-1 hit **freq 1.74** (14d) — "approaching saturation" but not catastrophic. CTR held at 5.59%. **Fatigue is NOT why the account is dark** — it was a manual campaign pause. But the new NASA creative ($1.14 CPL) was *outperforming* the aging passport ($1.67) and combinations ($1.83) on its tiny sample — exactly the creative refresh the 5/23 audit recommended, now stalled mid-test.

---

## 4. HYGIENE FIXES FROM 5/23 — VERIFICATION

Read live targeting spec of both ad sets via Graph API.

### EN — Lead — Tier-1 (120243116854610527) — ALL 3 FIXES APPLIED ✓

```json
{"age_max":44,"age_min":22,
 "excluded_geo_locations":{"countries":["NZ","SV"],"location_types":["home","recent"]},
 "geo_locations":{"countries":["US","CA","AU"],"location_types":["home","recent"]},
 "publisher_platforms":["facebook","instagram"]}
```

| Recheck item | Expected | Actual | Status |
|---|---|---|---|
| age_max = 44 | 44 | **age_max=44** | ✓ PASS |
| audience_network excluded | not in publisher_platforms | `publisher_platforms=["facebook","instagram"]` (AN absent) | ✓ PASS |
| SV (El Salvador) excluded | in excluded_geo | `excluded_geo.countries=["NZ","SV"]` | ✓ PASS |
| NZ excluded | in excluded_geo | `excluded_geo.countries=["NZ","SV"]` | ✓ PASS |

All four 5/23 hygiene recommendations are LIVE on EN Tier-1. (Note: `targeting_relaxation_types` lookalike=0 / custom_audience=0 — Advantage+ Audience expansion is also pinned off.)

### ES — Lead — LATAM USD (120243116822500527) — NOT cleaned

```json
{"age_max":38,"age_min":22,
 "geo_locations":{"countries":["MX","DO","PA","CL","PE","CO","EC","CR","SV","UY"]}}
```

- `publisher_platforms` **not set** → audience_network still ON.
- `age_max=38` (tighter than EN's 44 — intentional for LATAM).
- **SV (El Salvador) still INCLUDED** in geo_locations (it was excluded on EN but ES still targets it; SV had $3+ / 0 leads historically — dead waste if ES is re-enabled).
- No `excluded_geo_locations` at all.

This is expected — the 5/23 hygiene pass was applied to EN only (ES was already paused). If ES is re-enabled, it needs the same cleanup: drop SV, exclude audience_network.

---

## 5. ECONOMICS — ES vs EN re-enable case

14d numbers (both at $25/day budget, both ran 5/17–5/20/21):

| | EN Tier-1 | ES LATAM USD | ES advantage |
|---|---|---|---|
| CPL | $1.72 | **$1.02** | ES 1.68× cheaper per lead |
| CPM | $17.67 | **$1.94** | ES **9.1× cheaper** per 1000 impr |
| Reach / $ | 32.6 users/$ | **321.6 users/$** | ES **9.9× more reach per dollar** |
| Leads at $25/day | ~15/day | **~24/day** | +60% lead volume |
| Cost for identical 114 leads | $195.51 | **$116.46** | ES saved **$79.05** for the same lead count |

**The pure-acquisition argument strongly favors ES.** ES delivered the *same* 114 leads as EN for $79 less, with ~10× the reach efficiency. The ONLY reason ES was paused (5/21) was the **downstream Stripe 0% completion** (ES creatives: 11 lifetime Stripe sessions, 0 paid).

**That downstream break is exactly what shipped since 5/23:**
- `5849f22 feat(stripe-checkout): es-419 locale + custom_text LATAM currency for ES sessions` — directly targets the ES Stripe-page completion break.
- `284274f feat(paywall): render ES currency badge on Pro card`.

**Cost-efficiency verdict:** Re-enabling ES is the single cheapest lever the founder has. A controlled ES re-enable test at **$15/day for 5 days = $75** would buy **~73 ES leads** (at $1.02 CPL) → ~7–8 Stripe sessions, enough to get a *first read on whether 5849f22 fixed the 0% ES completion*. If even 1–2 of those complete, ES becomes the dominant acquisition channel on cost. If still 0%, kill ES creatives and double-down EN. Either way the test is cheap because ES leads are cheap. EN should be re-enabled regardless (it's the only channel with proven 11.5% lead→user).

---

## DARK-COST MATH (foregone since 2026-05-24)

| Scenario | Daily lead rate | 5 dark days | At CPL → $ deferred |
|---|---|---|---|
| EN-only 14d run-rate | 8.1 leads/day | ~41 leads | ~$70 (@ $1.72) |
| EN recent actual (5/20–24 avg) | 10.2 leads/day | **~51 leads** | **~$88 (@ $1.72)** |
| Both EN+ES live | 16.3 leads/day | ~81 leads | ~$110 |

Plus: 5 days of zero new fuel into the drip funnel (Resend tracking only just went live 5/23 — the dark window means no fresh ad-sourced leads to measure drip open/click on), and the new NASA creative's promising $1.14 CPL test is frozen mid-flight.

---

## RECHECK RESULTS vs 5/23 follow-up list

| Item | Expected | Actual | Status |
|---|---|---|---|
| EN Tier-1 freq ≤1.90 by 5/25 | ≤1.90 | 1.74 (14d) — but moot, paused | partial |
| ES re-enable signal (≥1 ES Stripe complete) | tested | ES never re-enabled; 5849f22 untested in prod ads | unknown |
| Daily spend recovery to $25+/day | $25+/day | **$0.00/day since 5/25** | **FAIL** |
| New EN creatives Stripe sessions | ≥1 per ad | only NASA got 10 leads; off24+made $0 delivery | partial |
| age_max=44 shipped (0 spend on 45+) | applied | **age_max=44 LIVE** | PASS |
| audience_network excluded | 0 spend on AN | **AN excluded from publisher_platforms** | PASS |

---

## ARTIFACTS

New READ-ONLY scripts (this session):
- `scripts/advertising/_audit_meta_dark_date_2026_05_29.mjs` — explicit-range daily account + ad-set series, last-spend-day detection, ad-set/campaign status + updated_time.
- `scripts/advertising/_audit_meta_creatives_targeting_2026_05_29.mjs` — ad created_time decode + full targeting-spec dump for hygiene verification.

Re-run existing: `_audit_meta_2026_05_23.mjs`, `_audit_meta_creative_2026_05_21.mjs` (relative windows now mostly dark — use the dark-date script for stable numbers).

---

*Generated 2026-05-29 ~23:20 UTC. Account fully dark since 2026-05-24 13:29 UTC. All numbers from Meta Graph API v23.0, READ-ONLY.*
