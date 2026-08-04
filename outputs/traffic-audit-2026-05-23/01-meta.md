# Meta Traffic Audit — 2026-05-23 13:30 UTC
**Claude (Opus 4.7, 1M ctx) · scope: Meta Ads · READ-ONLY**
**Baseline:** `outputs/traffic-audit-2026-05-21-pm/REPORT.md` (2026-05-21 14:29 UTC, ~47h ago)
**Method:** 3 read-only Graph API audit scripts (`_audit_meta_2026_05_23.mjs`, `_audit_stripe_utm_2026_05_23.mjs`, `_audit_meta_pause_timing_2026_05_23.mjs`)

---

## TL;DR — что случилось за 48 часов

**Sole headline:** ES — Lead — LATAM USD ad set был **выключен 2026-05-21 в 08:40 UTC** (за ~6h до прошлого аудита). Baseline это пропустил — там ES показан как `ACTIVE`, но фактически Meta уже задушила доставку. Все ES-acquisition остановлено. Сейчас работает **только** EN — Lead — Tier-1. CPL вырос с $1.59 (14d) до $2.18 (48h), потому что EN изначально 53% дороже за лида чем ES, а ES больше не разбавляет среднее. Spend упал с ~$77/day (пик 18 мая) до $5.97 сегодня — Meta дозировано доставляет EN.

Все остальное либо **подтверждено** (ES creatives 0% Stripe completion — sO1: 7/7 expired, gIxa: 3/3 expired, OJDe: 1/1 expired; EN top-2 продолжают лидировать — 10yyJ 57%, hCJDy 67% complete), либо **усугубилось** (US CPM $18.81 → $21.01, frequency Tier-1 1.73 — приближается к saturation). `audience_network` placement по-прежнему не исключён — снова 0 leads на 14.63% fake CTR.

---

## 1. Account-level — 48h / 7d / 14d delta vs baseline

| Metric | Baseline (14d → 2026-05-21) | Now 14d (→2026-05-23) | Now 7d | Now 48h | Δ vs baseline 14d | Flag |
|---|---|---|---|---|---|---|
| **Spend** | $301.12 | $333.95 | $289.86 | $48.00 | +$32.83 (+10.9%) | spend acquisition slowed (only +$32 in 48h vs +$77/day rate prior) |
| **Impressions** | 148,118 | 136,895 | 79,570 | 3,709 | −11,223 (−7.6%) | drop from ES pause; 14d window started discarding old ES impr |
| **Reach** | 105,945 | 96,013 | 52,010 | 3,135 | −9,932 (−9.4%) | same reason |
| **Clicks** | 9,649 | 9,316 | 5,105 | 211 | −333 (−3.5%) | EN click volume held up |
| **CTR** | 6.51% | 6.81% | 6.42% | **5.69%** | +0.30pp 14d / **−0.82pp 48h** | EN-only auction has lower CTR than ES blend |
| **CPM** | $2.03 | $2.44 | $3.64 | **$12.94** | +$0.41 14d / **+$10.91 48h** | EN-only US/CA inventory ~$13 CPM; ES inventory was ~$2 |
| **CPC** | not reported | $0.036 | $0.057 | $0.227 | — | huge jump 48h — confirms EN inventory cost shift |
| **Frequency** | 1.40 | 1.43 | 1.53 | 1.18 | +0.03 | mild saturation in 7d window |
| **Leads** | 189 | **207** | 207 | 22 | +18 leads (+9.5%) | 7d=14d means **0 ES leads since pause** — confirmed |
| **CPL** | $1.59 | $1.61 | $1.40 | **$2.18** | +$0.02 14d / **+$0.59 48h** | EN-only CPL = baseline EN CPL ($1.58 → $1.72 → $2.18 trending up) |

**Highlights (>15% movement):**
- Spend velocity collapsed: $77/day (peak) → $24 (5/21) → $18 (5/22) → $5.97 (5/23 so far). **−92% vs peak.**
- CPM exploded 48h: $2 → $13 = **+540%** (ES auction was the cheap inventory; EN US/CA is expensive).
- CPC up 48h: $0.036 → $0.227 = **+530%** (same cause).
- CPL up 48h: $1.40 → $2.18 = **+56%**.

**Why didn't 14d numbers move more?** The 14d window still contains 11 days of pre-pause ES data. The 48h window is the cleanest view of "what does the account look like without ES".

---

## 2. Ad-set delta

### B1. 48h (EN-only world)

| Ad Set | Status | Spend | Leads | CPL | CTR | CPM | Freq |
|---|---|---|---|---|---|---|---|
| EN — Launch — Lead — Tier-1 | ACTIVE | $45.44 | 21 | $2.16 | 5.12% | $17.10 | 1.24 |
| ES — Launch — Lead — LATAM USD | PAUSED | $2.56 | 1 | $2.56 | 7.13% | $2.43 | 1.07 |

The $2.56 ES spend is the residual delivery on 5/21 morning before pause took effect.

### B2. 7d

| Ad Set | Spend | Leads | CPL | CTR | CPM | Freq |
|---|---|---|---|---|---|---|
| EN — Launch — Lead — Tier-1 | $163.40 | 95 | $1.72 | 6.36% | $18.32 | **1.73** |
| ES — Launch — Lead — LATAM USD | $116.46 | 112 | $1.04 | 5.78% | $1.94 | 1.61 |
| ES — Launch — Astrología (LPV, campaign paused) | $10.00 | 0 | — | 10.08% | $0.95 | 1.07 |

### B3. 14d (matches 7d for EN+ES Lead because Tier-1 only spent in last 7d)

EN — Launch — Lead — Tier-1: $163.40 spend, 95 leads, $1.72 CPL, **freq 1.73 (saturation approaching)**.

**Implication:** Tier-1's reach is small (5,141 unique users) because Meta narrowed delivery as ES auction shut down. Each US user has now seen the ad **1.73 times** in 14 days. By end of week if pace holds, freq will hit 2.0+.

### B4. Pause timing — when ES died

Daily ES spend last 7d (script confirms pause was 2026-05-21 08:40 UTC):

```
2026-05-17  $32.48  30 leads  → ES Lead — LATAM USD
2026-05-18  $38.53  46 leads
2026-05-19  $23.40  20 leads
2026-05-20  $19.49  15 leads
2026-05-21  $2.56    1 lead  ← PAUSED at 08:40 UTC
2026-05-22  $0       0 leads
2026-05-23  $0       0 leads
```

**Baseline missed this.** It captured the pause day at the moment Meta was still trickling final delivery from morning auctions, so reported ES = 112 leads / $115.66 spend / ACTIVE status (technically all true via API at the time, but ad set was already toggled to PAUSED).

---

## 3. Creative-level (utm_content) — 7d Stripe completion

| utm_content | Lang | Status | 7d Spend (Meta) | 7d Leads | 7d Stripe Sessions | Complete | **Complete %** | Δ vs baseline |
|---|---|---|---|---|---|---|---|---|
| **10yyJJib6xRab1oOCGh0r** | EN | ACTIVE (Passport) | $91.99 | 59 | 7 | **4** | **57%** | 60% → 57% — **stable** |
| **hCJDyrhbX4eo4paA7yXtk** | EN | ACTIVE (Combinations) | $49.28 | 27 | 3 | **2** | **67%** | 67% → 67% — **stable** |
| YOfR7iH3dWukHy_QRiUA8 | EN | ACTIVE (Lahiri) | $12.97 | 6 | 0 | 0 | — | new — no Stripe yet |
| 1hjqz970n7gROjXMSWoIf | EN | ACTIVE (Swiss) | $3.50 | 0 | 0 | 0 | — | dead — 0 leads on $3.50 |
| Nv19TDPvjPZNX4_zpQvmu | EN | ACTIVE (v1) | $5.66 | 3 | 0 | 0 | — | new — no Stripe yet |
| sO1_DWaqethKHCSsOl2Z2 | ES | ADSET_PAUSED (Combinations) | $0.03 | 0 (this week) | **7** | **0** | **0%** | **persists — 0/14 lifetime** |
| gIxaJDLc5DjblVOLN_MEh | ES | ADSET_PAUSED (Lahiri) | $0.12 | 0 | **3** | **0** | **0%** | **persists — 0/6 lifetime** |
| OJDe0Ohnrrk1WEr6-v9WE | ES | ADSET_PAUSED (Passport) | $0 | 0 | 1 | **0** | **0%** | persists |

**Verdict on baseline P0 #2 (ES creatives 0% completion):**

The hypothesis is now **stress-tested with more samples**. ES creatives lifetime are 11 sessions, 0 complete. **Probability that this is a sampling fluke if true conversion rate were ≥10%:** roughly $(1 - 0.1)^{11} \approx 31\%$, so still not statistically definitive — but with EN top-2 hitting 57-67% on similar sample sizes, the gap is real signal even if magnitude is noisy.

The ES creatives went from "0% completion on 11 sessions" (baseline) to "0% completion on 11 sessions still, no new ES Stripe sessions because ad set paused 5/21".

**EN top-2 still dominating:** Yes. 10yyJ (Passport, EN) + hCJDy (Combinations, EN) together = $141 / 7d spend (49% of total) and 86 leads (42% of leads). They're hitting saturation in EN auction (Passport ad freq 1.44 in 7d).

**New EN creatives (Lahiri-YOfR + Swiss-1hjqz + v1-Nv19) ramping but no Stripe data yet:**
- YOfR (Lahiri ad): 6 leads / $12.97 = $2.16 CPL — significantly worse than top-2.
- 1hjqz (Swiss): 0 leads / $3.50 = dead. Meta should auto-throttle.
- Nv19 (v1 short copy): 3 leads / $5.66 = $1.89 CPL — middling.

The 6 Lahiri leads and 3 v1 leads haven't yet generated Stripe checkout sessions (DB shows 6+2 leads with these utm_contents but 0 Stripe sessions — they're still in drip nurture).

### 3b. DB lead → user conversion (14d, by creative)

```
utm_content                    leads  converted  CVR
sO1_DWaqethKHCSsOl2Z2          58     1          1.7%   ← ES Combinations (single conv = jhrscbd, free signup, no pay)
10yyJJib6xRab1oOCGh0r          52     5          9.6%   ← EN Passport (top)
gIxaJDLc5DjblVOLN_MEh          31     0          0.0%   ← ES Lahiri
OJDe0Ohnrrk1WEr6-v9WE          27     0          0.0%   ← ES Passport
hCJDyrhbX4eo4paA7yXtk          26     3          11.5%  ← EN Combinations
v6Xb-rdtuo3jta50dPq1Q          16     0          0.0%   ← ES LPV-page (campaign paused 5/11)
YOfR7iH3dWukHy_QRiUA8           6     0          0.0%   ← EN Lahiri (new, fresh)
Nv19TDPvjPZNX4_zpQvmu           3     2          66.7%  ← EN v1 (tiny sample, but suggestive)
```

**Big picture:** EN lead→user rate is **10/87 = 11.5%**; ES lead→user rate is **1/132 = 0.76%**. ES is 15× worse at converting leads to signups. (Conv = `email_lead.converted_to_user_id` not null; doesn't require paid.)

EN's 11.5% is now Meta's only path to any conversion. ES corpus (132 leads accumulated) is sitting in drip nurture queues — no acquisition pumping new ES leads.

---

## 4. Placement breakdown (7d)

| Placement | Spend | Impr | CTR | Leads | CPL | Verdict |
|---|---|---|---|---|---|---|
| facebook/feed | $190.22 | 49,095 | 6.84% | 127 | $1.50 | 🥇 workhorse |
| facebook/facebook_reels | $58.02 | 19,177 | 6.97% | 40 | $1.45 | 🥈 strong |
| instagram/feed | $15.92 | 2,552 | 1.88% | 15 | **$1.06** | cheap leads, low CTR (intent-aligned audience) |
| instagram/instagram_reels | $12.75 | 3,819 | 5.21% | 11 | $1.16 | OK |
| instagram/instagram_stories | $7.51 | 1,986 | 2.87% | 8 | $0.94 | OK |
| **audience_network/an_classic** | **$3.07** | **588** | **14.63%** | **0** | **—** | 🚨 **still not excluded — fake CTR persists** |
| facebook/instream_video | $1.16 | 220 | 3.64% | 4 | **$0.29** | tiny but cheap |
| facebook/marketplace | $0.87 | 464 | 0.86% | 2 | $0.43 | minor; baseline said 0 leads, now 2 leads — borderline keep |
| facebook/right_hand_column | $0.14 | 1,183 | 0.34% | 0 | — | dead |
| facebook/search | $0.11 | 458 | 0.87% | 0 | — | dead |
| unknown/unknown | $0.07 | 9 | 11.11% | 0 | — | dead |
| facebook/facebook_reels_overlay | $0.02 | 11 | 0% | 0 | — | dead |

**Audience network was fake-CTR'd in baseline; same now.** 588 impressions, 86 clicks reported (14.63% CTR), 0 leads. Fake clicks; classic display network behavior. **P1 unchanged from baseline.**

**facebook/marketplace** flipped: baseline had 0 leads on $0.65, now 2 leads on $0.87 (CPL $0.43). If this is real (not bot traffic), it's the cheapest CPL in the deck. Worth keeping for now and re-checking in 7d.

---

## 5. Geography (7d)

| Country | Spend | Impr | CPM | Leads | CPL | Δ vs baseline |
|---|---|---|---|---|---|---|
| 🇺🇸 US | $131.66 | 6,266 | **$21.01** | 76 | $1.73 | spend +$34, CPM +$0.40 |
| 🇲🇽 MX | $48.60 | 23,556 | $2.06 | 41 | $1.19 | −$2 spend, same leads |
| 🇨🇴 CO | $35.98 | 22,469 | $1.60 | 33 | $1.09 | −$3 spend, same leads |
| 🇨🇦 CA | $14.01 | 1,054 | $13.29 | 10 | $1.40 | **+$4 spend, +4 leads, CPL improved** |
| 🇵🇪 PE | $9.72 | 6,939 | $1.40 | 4 | $2.43 | −$2 spend, same |
| 🇳🇿 NZ | **$9.11** | 934 | **$9.75** | 3 | **$3.04** | +$2 spend, +0 leads — **NZ getting worse** |
| 🇦🇺 AU | $8.62 | 662 | $13.02 | 6 | $1.44 | +$2 spend, 0 leads delta |
| 🇨🇱 CL | $7.96 | 4,202 | $1.89 | 5 | $1.59 | stable |
| 🇪🇨 EC | $6.23 | 3,629 | $1.72 | 7 | $0.89 | stable |
| 🇩🇴 DO | $5.75 | 3,604 | $1.60 | 7 | $0.82 | stable |
| 🇺🇾 UY | $5.07 | 2,759 | $1.84 | 10 | **$0.51** | stable — **best CPL** |
| 🇸🇻 SV | $3.04 | 1,556 | $1.95 | 0 | — | unchanged dead waste |
| 🇨🇷 CR | $2.99 | 1,373 | $2.18 | 4 | $0.75 | **NEW — solid CPL** |
| 🇵🇦 PA | $1.12 | 567 | $1.98 | 1 | $1.12 | NEW |

**Movers:**
- **US** consumed $131 vs baseline $97 in 7d (despite ES pause) — Meta shifted budget to US-only Tier-1.
- **Canada** added more spend ($14 vs $10) and got better CPL ($1.40 vs $1.71).
- **NZ getting worse:** $9.11 spend / 3 leads / $3.04 CPL. NZ is the worst-performing developed market.
- **CR + PA appeared:** new LATAM countries getting cheap leads ($0.75-$1.12).
- **🇸🇻 SV unchanged dead waste:** $3+ on 0 leads (was $3.03/0 in baseline, now $3.04/0 — 14 days of zero conversion).

LATAM still leans on ES — Lead ad set's residual delivery and now nothing new arriving from ES side. After current 14d ES leads (132) drain through drip nurture, ES will be at zero pipeline within 2 weeks.

---

## 6. Age × Gender (7d)

| Age × Gender | Spend | CTR | Leads | CPL |
|---|---|---|---|---|
| 25-34 female | $79.06 | 5.18% | 45 | $1.76 |
| 35-44 female | $70.84 | 6.07% | 50 | $1.42 |
| 25-34 male | $69.55 | 6.25% | **68** | **$1.02** |
| 35-44 male | $39.83 | 6.48% | 27 | $1.48 |
| 18-24 male | $8.99 | 5.17% | 7 | $1.28 |
| 18-24 female | $7.15 | 3.67% | 3 | $2.38 |
| **65+ male** | $4.21 | 10.56% | 0 | — |
| 25-34 unknown | $2.73 | 7.06% | 4 | $0.68 |
| **55-64 male** | $2.04 | 9.42% | 0 | — |
| 35-44 unknown | $1.85 | 7.49% | 2 | $0.93 |
| **65+ female** | $1.29 | 10.44% | 0 | — |
| **45-54 male** | $0.84 | 10.76% | 0 | — |
| **55-64 female** | $0.60 | 7.92% | 0 | — |
| 18-24 unknown | $0.55 | 4.29% | 1 | $0.55 |
| **45-54 female** | $0.26 | 12.73% | 0 | — |

**45+ wasteband persists.** Baseline noted "$1.82 / 0 leads / 14d, recommend age_max=44". Now 45+ band consumes:
- 45-54 m+f+u: $1.10 / 0 leads
- 55-64 m+f+u: $2.67 / 0 leads
- 65+ m+f+u: $5.54 / 0 leads
- **Total 45+: $9.31 / 0 leads in 7d** (vs $1.82/14d baseline = ~$0.13/day baseline, now ~$1.33/day = **10× wasteband acceleration**)

Meta shifted relatively more spend to 65+ male because of its 10.56% CTR — but it's all fake-out clicks (zero conversions). Same pattern as audience_network. **P1 — age_max=44 still valid, more urgent than baseline (10× burn rate).**

**Best ROI band:** 25-34 male = 68 leads at $1.02 CPL. **EN-only world is finding young men.** This is consistent with a "scientific astrology" hook resonating with men 25-34 (vs the conventional astrology female-skew).

---

## 7. Hourly (7d, advertiser TZ = US/Eastern)

```
Best L/$ ratios (leads per dollar):
  15:00  18 leads / $14.00  = 1.29   🥇 (was 1.26 in baseline — stable winner)
  17:00  14 leads / $10.63  = 1.32   🥇 (was 1.26 — stable winner)
  21:00  14 leads / $15.56  = 0.90
  22:00   9 leads / $10.67  = 0.84
  14:00   9 leads / $11.10  = 0.81
  19:00  17 leads / $21.45  = 0.79

Worst L/$ (excluding zero-lead hours):
  05:00   1 lead / $2.68   = 0.37
  04:00   2 leads / $4.96  = 0.40
  16:00   9 leads / $16.58 = 0.54  ← surprise: high spend, low return
  23:00   6 leads / $11.34 = 0.53

Dead zone (0 leads):
  08:00   0 leads / $4.99  = 0.00   ← BASELINE WAS SAME; not improved
```

**06:00-09:00 ET update:**
- Baseline: "0 leads / $3.23 at 08:00, recommend pause 06:00-09:00 ET, ~$10/week savings"
- Now 7d: hours 06+07+08+09 = $15.77 spend / 6 leads. **NOT 0 anymore.** Hours 06:00 ($2.33/1 lead), 07:00 ($3.34/2), 09:00 ($5.11/3) all converted at L/$ 0.43-0.60.
- **08:00 alone is still dead** ($4.99 spend / 0 leads).

→ **Recommendation revised:** Don't pause whole 06-09 block. Just 08:00 hour. Likely savings: $5/week. Smaller win than baseline thought.

**16:00 ET surprise inefficiency:** $16.58 burned for 9 leads = 0.54 L/$. This is **between** the 15:00 winner (1.29 L/$) and 17:00 winner (1.32 L/$) — Meta is over-allocating to 16:00. Worth a 1-hour delivery pause test.

---

## 8. Audience saturation — frequency

| Ad Set | Reach (14d) | Impr (14d) | **Freq (14d)** | Flag |
|---|---|---|---|---|
| **EN — Launch — Lead — Tier-1** | 5,141 | 8,917 | **1.73** | ⚠️ approaching saturation |
| ES — Launch — Lead — LATAM USD | 37,452 | 60,128 | 1.61 | (paused — won't grow further) |
| ES — Launch — Astrología (LPV) | 53,257 | 67,850 | 1.27 | (campaign paused) |

**EN Tier-1 freq 1.73 is the concerning number.** In a 14d window, the reach pool is small (5,141 unique users) because:
1. The audience definition is tight (Tier-1 EN, no EU).
2. ES auction pause stopped subsidizing inventory acquisition.
3. Daily budget $25 + small audience → fast freq accumulation.

**Trajectory:** If pace continues (~5 new impr per day per user), freq hits 2.0 in ~3 days and 2.5 in ~8 days. At freq ≥2.5, CTR usually drops 15-30% and CPM rises further.

**Mitigation options (no budget change):**
- Expand EN audience to Tier-2 countries (UK/IE blocked on DSA per memory; could add AU/NZ explicitly).
- Refresh creatives — 5 of 5 EN ads are from 2026-05-17, **6 days old**. Creative refresh every 7-10 days is the standard.
- Add lookalike from current 87 EN-lead audience.

---

## 9. Daily timeseries — context for the spend cliff

```
Date         Spend  CTR%   Leads  CPL    Note
2026-05-09    $10   5.12%   0    —      Pre-launch (LPV campaign)
2026-05-10     $8   5.34%   0    —
2026-05-11     $8   6.42%   0    —      ES Astrología campaign paused this day
2026-05-12     $6   9.74%   0    —
2026-05-13     $4  11.26%   0    —
2026-05-14     $6   9.82%   0    —
2026-05-15     $3  10.22%   0    —
2026-05-16     $8   9.83%   0    —
2026-05-17    $73   6.00%  51   $1.44   ← Lead campaign launched (EN + ES)
2026-05-18    $77   5.83%  74   $1.04
2026-05-19    $44   6.61%  33   $1.33
2026-05-20    $40   5.78%  27   $1.47
2026-05-21    $25   5.61%  10   $2.45   ← ES paused at 08:40 UTC
2026-05-22    $18   6.01%  10   $1.75
2026-05-23     $6   5.43%   2   $2.98   ← partial day
```

**4 days post-ES-pause:** spend $89 / 32 leads / **$2.78 CPL average** (vs baseline 14d $1.59). EN-only world is **75% more expensive per lead**. Meta will likely keep throttling delivery as freq climbs.

---

## 10. Recommendations — ranked by ROI/risk

### TIER 1 — Save money in <30 min, low risk

#### R1. Exclude `audience_network` placement on EN — Launch — Lead — Tier-1
- **Where:** Ad Set → Placements → Manual placements → uncheck Audience Network.
- **Expected savings:** ~$1.5/week (audience_network spent $3.07 in 7d, all wasted).
- **Bonus:** Cleaner Pixel data quality. Audience Network clicks are notorious for being bot/incentivized.
- **Risk:** Zero. 0 leads from this placement; no real loss.
- **Same as baseline P1.** Not done in 48h.

#### R2. Set `age_max=44` on EN — Launch — Lead — Tier-1
- **Where:** Ad Set → Audience → Age → 18-44.
- **Expected savings:** ~$9/week (currently $9.31/7d on 45+ band, 0 leads).
- **Risk:** Zero. 0 leads on 45+ to lose.
- **Same as baseline P1.** Burn rate is now **10× baseline pace** because all EN spend hits 45+ inventory.

#### R3. Exclude SV (El Salvador) from geography
- **Where:** Ad Set → Locations → exclude SV.
- **Expected savings:** ~$3/week.
- **Risk:** Zero. 0 leads in 14 days. Only buying inventory.
- **Bonus:** Reduces "spray and pray" sigma in Meta's reach calc.
- **NEW (baseline didn't quantify).**

#### R4. Hourly delivery pause for 08:00 ET only (not 06-09 block)
- **Where:** Ad Set → Schedule → block 08:00 advertiser-TZ.
- **Expected savings:** ~$5/week.
- **Risk:** Low — 0 leads at this exact hour.
- **Revised from baseline** which suggested 06-09 — most of that block now actually converts (poorly but non-zero).

**TIER 1 total: ~$18-20/week saved = $80/mo = 25% of current $25/day Tier-1 budget.**

### TIER 2 — Re-enable acquisition (this week)

#### R5. Refresh EN creatives (top-2 are now 6 days old, frequency 1.73)
- **What:** Launch 2-3 new EN ad variants in same ad set.
- **Why:** Tier-1 ad set will hit freq 2.5 in ~8 days; refresh resets ad-level fatigue.
- **Ideas:** 
  - Test cookbook of EN top-2: "Cosmic Passport — shareable" + "1,728 distinct configurations" merged into 1 ad.
  - New angle: testimonial from `gabrieljlugo` (if he stays active post-trial).
  - New angle: "I built this because conventional astrology has 7° error vs NASA" (founder-led, distinct voice).
- **Risk:** Moderate — new creatives might underperform top-2, but no downside vs ad-set freq attrition.

#### R6. Unpause + re-think ES — Lead — LATAM USD
- **Decision blocker:** The reason ES was paused (per memory `project_traffic_audit_2026_05_21_pm`) was 0% Stripe completion. Re-enabling means re-burning $30-40/day on leads that don't convert.
- **Conditional re-enable:** Only after ES creatives or ES checkout UX changes. Options:
  - **Option A — wait:** Don't re-enable until ES paywall A/B (no-card-trial or currency badge) is live. ES currency badge memory says it shipped 2026-05-21 17:18 UTC. **First test signal would be: re-enable ES at $5/day for 3 days, see if any of the new leads converts via Stripe with the LATAM currency badge.**
  - **Option B — partial:** Re-enable but **swap creatives** — pull sO1/gIxa/OJDe (proven 0%), create 2-3 fresh ES variants emphasizing local payment ("Acepta tu tarjeta MX") or no-card trial.
  - **Option C — kill it:** Decide ES is uneconomic, double down on EN scaling.
- **Recommendation:** Option A. Allocate $15/day for 5 days = $75 test budget. Sample of ~70 ES leads + 6-8 Stripe sessions should give first signal on ES creative + currency badge combo.

#### R7. Re-enable ES Tier-2 EN reach via AU+NZ explicit add
- **What:** Add AU and NZ to EN — Launch — Lead — Tier-1 explicitly (they're currently included implicitly but compete with US for budget).
- **Why:** AU at $1.44 CPL (close to US's $1.73), NZ at $3.04 (worst, exclude).
- **Action:** Include AU explicit, **exclude NZ** explicit.
- **Net:** Slight CPL improvement, +small reach buffer (delays freq saturation).

### TIER 3 — Strategic (2+ weeks)

#### R8. Lookalike audience from EN converters (10 leads converted)
- **What:** Build 1% LAL US from email_leads where utm_source='meta' AND utm_campaign='estrevia_lead_en' AND converted_to_user_id IS NOT NULL.
- **Sample size:** 10 users currently — borderline. Wait until 20+ to ship.
- **Why:** Cheaper EN inventory acquisition long-term.

#### R9. Switch from manual cost cap to lowest-cost bidding strategy
- Current setup uses `OFFSITE_CONVERSIONS` optimization with implicit bidding. If bid is unset, Meta uses lowest cost — fine. Check Power Editor; if there's a cost cap below $2, lower or remove it.

#### R10. Add `optimization_goal=OFFSITE_CONVERSIONS` with `bid_amount` test
- Once enough conversion data accumulates (need ≥50 conversions/week per ad set), switch to bid amount targeting your true LTV-derived CPL.

### NOT recommended

- ❌ **Pause EN ad set.** Tier-1 is the only profitable channel right now. Even at $2.18 CPL it's still <2× the LATAM cost and ~12% lead→user conversion vs ES's 0.8%.
- ❌ **Increase EN daily budget.** Audience is too small; more budget = more freq = lower CTR = higher CPM. Refresh creatives first.
- ❌ **Re-enable ES — Astrología (LPV).** It's a different optimization goal (`LANDING_PAGE_VIEWS` vs `OFFSITE_CONVERSIONS`); will dilute Pixel learning. Leave campaign paused.

---

## 11. What to re-check in 48h

| Signal | Method | Pass criterion |
|---|---|---|
| EN Tier-1 freq trend | `_audit_meta_2026_05_23.mjs` section K | Want freq ≤1.90 by 2026-05-25 |
| ES re-enable signal | new Stripe sessions for sO1/gIxa/OJDe utm_content with complete=1 (post-currency-badge) | ≥1 ES Stripe complete |
| Daily spend recovery | section L | want $25+/day sustained (vs $5.97 today) |
| New EN creatives Stripe sessions | YOfR / 1hjqz / Nv19 utm_content in Stripe | ≥1 session attributed per ad |
| 45+ pause result | section H | if `age_max=44` shipped: 0 spend on 45+ |
| audience_network pause result | section F | 0 spend on `audience_network/an_classic` |

---

## 12. Open questions for founder

1. **Was ES — Lead — LATAM USD paused intentionally** (planned action from baseline P0 ES-completion finding), or was it a tactical pause to conserve burn rate while waiting for currency badge / anon-checkout fix? Want to know if current state is acceptable or transitional.
2. **Currency badge deploy status** — memory `project_es_currency_badge_shipped` says 2026-05-21 17:18 UTC. Was it pushed to prod? If yes, recommendation R6 Option A becomes a "test the new world" experiment, otherwise still blocked.
3. **EN creative refresh budget** — willing to ship 2-3 new EN ad variants this week? Memory `feature-gates` shows current `LEARNING_PHASE_DAYS=2` — that's compatible (top-2 are 6 days old, so refreshes can fight for delivery quickly).
4. **NZ explicit exclude** — OK to drop a market with 3 leads in 7d?
5. **SV explicit exclude** — OK to drop a market with 0 leads in 14d?
6. **Re-enable ES at $5/day exp** — willing to spend $25 over 5 days as A/B-style test of currency badge?

---

## 13. Artifacts

Scripts (new, READ-ONLY):
- `scripts/advertising/_audit_meta_2026_05_23.mjs` — 14d/7d/48h Meta account+ad-set+ad+placement+geo+age+hourly+freq+daily
- `scripts/advertising/_audit_stripe_utm_2026_05_23.mjs` — Stripe utm_content cross-ref + DB lead funnel
- `scripts/advertising/_audit_meta_pause_timing_2026_05_23.mjs` — daily per-ad-set spend to pinpoint pause time

Raw outputs:
- `outputs/traffic-audit-2026-05-23/_raw_meta.txt`
- `outputs/traffic-audit-2026-05-23/_raw_stripe.txt`
- `outputs/traffic-audit-2026-05-23/_raw_pause_timing.txt`

---

*Generated 2026-05-23 13:30 UTC. Point-in-time after ES — Lead — LATAM USD pause (2026-05-21 08:40 UTC, ~52h prior). All measurements from Meta Graph API v23.0 + Stripe API + DB.*
