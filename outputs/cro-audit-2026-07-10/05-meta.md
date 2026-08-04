# Meta Ads Sector Report — CRO Audit 2026-07-10

**Scope:** Meta acquisition state + message-match input for CRO · **100% READ-ONLY** (Graph API v23.0 GETs only)
**Account:** `act_1435842067150024` (shared multi-business account, USA AUTOMOTO EXPORT) · currency USD · account TZ America/Los_Angeles
**Baseline:** `outputs/ad-audit-2026-05-29/REPORT.md` + `01-meta.md` (2026-05-29)
**Probes (new, read-only, this session):**
- `scripts/advertising/_cro_audit_2026_07_10_meta_state.mjs` — daily spend 2026-05-20..2026-07-10, all campaign/ad-set/ad statuses + `issues_info`, per-ad-set/per-ad insights
- `scripts/advertising/_cro_audit_2026_07_10_meta_creatives.mjs` — full creative specs (title/body/link/UTM/CTA/image), targeting specs, DSA fields, account status
- `scripts/advertising/_cro_audit_2026_07_10_meta_lifetime.mjs` — lifetime (`date_preset=maximum`) campaign/ad-set totals
Landing-side evidence: `messages/en.json` / `messages/es.json` (`landing`, `emailGate`, `heroCalc`, `pricing`, `paywall` keys), `src/app/[locale]/(marketing)/page.tsx`, `src/i18n/routing.ts`, `src/shared/components/EmailGateModal.tsx`, `src/app/api/webhooks/stripe/route.ts:265-310`.

---

## HEADLINE

**The account has now been dark for 47 consecutive days.** Last spend day: **2026-05-24** ($20.51). Every day from **2026-05-25 through 2026-07-10** shows **$0.00 spend / 0 impressions / 0 reach** (account-level insights, `time_range 2026-05-20..2026-07-10`, `time_increment=1` — only 7 rows returned, all pre-05-25). Nothing has changed on the Meta side since the 2026-05-29 audit: same campaigns paused at the same timestamps, no new ads, no deleted ads, no budget edits. The 05-29 audit recommended "pause until the funnel is fixed" — the top funnel blocker (anon-payer sign-in, `de39cee`) was fixed and pushed **2026-05-30**, i.e. **41 days ago**, yet acquisition was never re-enabled and the HALF50 re-activation blast was never sent. The funnel this CRO audit is examining has had **zero paid input for ~6.7 weeks**; every downstream metric (email gate, paywall, checkout) is starved of traffic, and the 256-lead pool last received a new member around 2026-05-25 (the last drip step for the youngest lead completed ~2026-06-15).

Foregone at the EN-only recent run-rate (~10.2 leads/day, 5/20–5/24 actuals): **~479 leads / ~$820 unspent**. At combined EN+ES run-rate (~16.3/day): **~766 leads**.

---

## 1. SPEND BY DAY SINCE BASELINE — account still dark

Source: `GET act_1435842067150024/insights?level=account&time_range={2026-05-20..2026-07-10}&time_increment=1` (run 2026-07-10).

| Date | Spend | Impr | Reach | Clicks | Leads |
|---|---|---|---|---|---|
| 2026-05-20 | $39.67 | 12,409 | 10,758 | 717 | 27 |
| 2026-05-21 | $24.54 | 2,443 | 2,258 | 137 | 10 |
| 2026-05-22 | $17.63 | 911 | 807 | 55 | 10 |
| 2026-05-23 | $17.43 | 1,306 | 1,152 | 61 | 7 |
| **2026-05-24** | **$20.51** | 1,197 | 1,108 | 75 | 15 ← LAST SPEND DAY |
| 2026-05-25 | $0.00 | 0 | 0 | 0 | 1 (delayed attribution) |
| 2026-05-26 → 2026-07-10 | **$0.00 every day** (no insight rows at all) | 0 | 0 | 0 | 0 |

- Total window spend $119.78, all of it 5/20–5/24. **$0.00 for 47 days straight (2026-05-25..2026-07-10).**
- Note: 05-24 leads now reads 15 (was 13 in the 05-29 report) — late Meta attribution, not new activity.
- Account `amount_spent` lifetime $4,168.78 (all businesses); Estrevia campaigns lifetime = **$442.47** (`Estrevia Launch — Leads` $340.01 + `— Sidereal Astrology` $102.46), `date_preset=maximum`.

### Current statuses (pulled 2026-07-10, unchanged vs 05-29)

| Object | ID | effective_status | updated_time |
|---|---|---|---|
| Campaign **Estrevia Launch — Leads** (OUTCOME_LEADS) | 120243116761600527 | **PAUSED** | 2026-05-24T13:29:07-0700 |
| Campaign Estrevia Launch — Sidereal Astrology (OUTCOME_TRAFFIC) | 120243025911300527 | PAUSED | 2026-05-17T08:56:43-0700 |
| Ad set EN — Lead — Tier-1 (no EU), $25/day | 120243116854610527 | PAUSED | 2026-05-24T13:29:15-0700 |
| Ad set ES — Lead — LATAM USD, $25/day | 120243116822500527 | PAUSED | 2026-05-21T08:40:54-0700 |
| Ad set ES — Astrología sidérea (LPV), $6/day | 120243025977660527 | CAMPAIGN_PAUSED (cfg ACTIVE) | 2026-05-11 |

Minor observation: two EN ads show `updated_time` **after** the pause — `ad_lead_en_off24` 2026-05-25T15:30:37 and `ad_lead_en_made` 2026-05-27T15:30:39 (both -0700, both at exactly 15:30) — with no status/creative change (`cfg=ACTIVE`, still `ADSET_PAUSED`, no `issues_info`, no `ad_review_feedback`). Consistent with Meta-side review reprocessing, not founder action. No impact.

---

## 2. CPL / CTR / LEADS — no new data; baseline holds

Zero spend since 05-24 means there is **no new CPL/CTR signal**. For the record, the tail window (2026-05-20..2026-07-10 = effectively 5/20–5/24) per ad set (`level=adset` insights):

| Ad set | Spend | Impr | CTR | CPM | Leads | CPL |
|---|---|---|---|---|---|---|
| EN — Lead — Tier-1 | $97.73 | 6,179 | 5.50% | $15.82 | 52 | **$1.88** |
| ES — Lead — LATAM USD | $22.05 | 12,087 | 5.83% | $1.82 | 18 | **$1.23** |

Lifetime (`date_preset=maximum`, level=adset):

| Ad set | Spend | Impr | CTR | CPM | Leads | CPL |
|---|---|---|---|---|---|---|
| EN — Lead — Tier-1 | $204.00 | 11,522 | 6.16% | $17.71 | 114 | **$1.79** |
| ES — Lead — LATAM USD | $136.01 | 71,591 | 5.49% | $1.90 | 114 | **$1.19** |
| Campaign total (Leads) | $340.01 | 83,113 | 5.58% | — | 228 | **$1.49** |

All consistent with the $1.02–1.72 CPL baseline (small drift = late-attribution + the extra 5/24 tail day). **ES remains ~9.3× cheaper per CPM ($1.90 vs $17.71) and ~1.5× cheaper per lead lifetime** — the ES-first relaunch case from 05-29 is intact.

Per-ad in-window highlights (level=ad, 2026-05-20..2026-07-10): `ad_lead_en_nasa` $11.35 / 10 leads / **$1.14 CPL** (still the newest-winner read, frozen mid-test); `ad_lead_en_passport` $70.99 / 34 leads / $2.09; `ad_lead_es_combinations` $20.25 / 17 leads / $1.19. `off24` and `made` still have **$0.00 lifetime delivery** — starved, never tested.

---

## 3. MESSAGE-MATCH AUDIT — ad promise vs landing reality

Landing hero actually rendered (`page.tsx` lines 144–183, keys from `messages/*.json → landing`):
- Eyebrow: *"Sidereal · Lahiri · Swiss Ephemeris"*
- H1: *"Your True **Zodiac Sign**"* / ES *"Tu signo **zodiacal verdadero**"*
- Subtext: *"Western astrology froze the zodiac to the seasons in 100 AD. The sky has shifted 24° since then… most people discover their Sun is in a different sign entirely."*
- Trust line: *"No account needed · Calculation takes under 2 seconds"*
- Calculator CTA: *"Discover My Sun Sign"*; then after calc → **EmailGateModal**: *"Enter your email to reveal the chart we just calculated for you"* — **dismissible** (`dismissCta` "Skip for now" is rendered, `EmailGateModal.tsx:276`), so the gate is soft, not hard.

Scores (10 = ad promise fully honored above the fold; ads assessed are the 14 in the two Lead ad sets — the units that would resume delivery on un-pause):

| Ad (EN / ES twin) | Ad promise | Landing reality | Score | Gap |
|---|---|---|---|---|
| `off24` (EN only) | "Western astrology hasn't updated since Ptolemy… sky shifted… **your TRUE chart in 60 seconds**" + desc "**Free** sidereal chart · Lahiri · ±0.01°" | Hero H1 "Your True Zodiac Sign" + 24°-shift subtext is a near-verbatim echo | **9/10** | Best-matched creative in the account; "Free" holds (chart is free; AI reading paywalled, email gate skippable) |
| `v1` ("positions from where the planets actually appear tonight") | actual-sky framing | Hero subtext = same argument | 8/10 | none material; ad cfg=PAUSED (EN) since 05-24 |
| `swiss` | "Swiss Ephemeris — same data set as professional astronomers" | Eyebrow + calculator footer name Swiss Ephemeris | 8/10 | Feature-led, weak consumer promise (was a CPL laggard, cfg=PAUSED since 05-23 hygiene) |
| `lahiri` | "Lahiri ayanamsa — Indian Government standard 1957" | Eyebrow names Lahiri | 8/10 | Same — trivia angle, weak promise |
| `passport` | "Cosmic Passport is shareable. Calculate, get the **rarity score**, post it." | "Share your Passport" = step 3 of How-it-works; passport itself (and rarity) only visible **after** calc + email gate | 7/10 | No passport/rarity preview above the fold; the promised artifact is 3 steps deep |
| `combinations` | "1,728 distinct configurations… 0.06% of natal charts" (rarity/uniqueness) | Landing hero says nothing about rarity or 1,728; rarity only on the post-gate passport | **6/10** | Scent gap: uniqueness promise not visible pre-gate |
| `nasa` (EN only) — **best performer, $1.14 CPL** | "**NASA-verified chart**… same math NASA uses… based on tonight's sky" + desc "Free · 60 seconds" | **"NASA" appears nowhere on the landing** (grep of `messages/en.json`: only a legal clause about NASA imagery, key `s7P3`) | **6/10** | The winning hook has zero echo on the page. Also a claim-accuracy risk: "NASA-verified" overstates (Swiss Ephemeris ≠ NASA verification) — softer "NASA-grade sky data" both safer and honest |
| `made` (EN only, founder POV) | "Most astrology apps run on guesses… **I built** Estrevia… no 'horoscope today' garbage" | No founder note, no anti-horoscope positioning anywhere on the landing | **4/10** | Weakest match; if this angle ever gets delivery the personal-story scent dies on arrival |

**ES twins** (`v1/swiss/lahiri/combinations/passport`): same copy translated (verified in creative pull — español neutro, tú form held), same scores **minus the routing caveat in §4** (a Spanish ad can land on an English page).

**Cross-cutting mismatch (all 14 ads):** every ad's CTA is LEARN_MORE/SEE_DETAILS to `/` — none mention email. The flow interposes an email ask *before* delivering the promised chart. Because the gate is dismissible, this is friction rather than a broken promise, but two 05-23 creatives explicitly say "Free" + "60 seconds", and the trust line says "No account needed", so the email ask is the first moment the experience deviates from the ad's script. CRO input for the landing sector: the gate's subtitle ("to reveal the chart **we just calculated**") at least acknowledges the value exchange — keep; but "No account needed" + email gate copy read as a contradiction to an ad-primed visitor.

---

## 4. DESTINATION URLs + UTM HYGIENE

All 14 lead-ad links (and all 23 legacy LPV-campaign ads) point at the **bare root** `https://estrevia.app/` with query-string UTMs; none deep-link. Examples (creative pull 2026-07-10):

- EN: `https://estrevia.app/?utm_source=meta&utm_medium=image&utm_campaign=estrevia_lead_en&utm_content=en_ref_nasa&utm_term=en`
- ES: `https://estrevia.app/?utm_source=meta&utm_medium=image&utm_campaign=estrevia_lead_es&utm_content=sO1_DWaqethKHCSsOl2Z2&utm_term=es`

Issues, worst first:

1. **ES ads do not link to `/es/`** — 6/6 ES lead ads (and 12/12 legacy ES LPV ads) land on `/`. `src/i18n/routing.ts` uses `localePrefix: 'as-needed'` with next-intl default locale detection, so a LATAM visitor gets `/es/` only if their **browser Accept-Language is Spanish** and no `NEXT_LOCALE` cookie says otherwise. Any LATAM user on an English-configured device gets the **English** landing + English email gate off a Spanish ad — a hard message-match break for exactly the segment the ES relaunch targets. Fix is zero-risk: set ES ad links to `https://estrevia.app/es/?utm...`. (Query params survive the next-intl redirect when detection does fire, so attribution is not being lost — this is a language-consistency issue, not a tracking one.)
2. **Two utm_campaign namespaces for the same channel:** the 05-04 `v1` ads carry `utm_campaign=estrevia_launch_en|es` while the 05-17/05-23 ads carry `estrevia_lead_en|es`. Any downstream grouping by campaign splits one acquisition stream into two buckets. Standardize on `estrevia_lead_*` when relaunching (edit the two `v1` creatives or retire them — EN `v1` is already cfg=PAUSED).
3. **21-char nanoid `utm_content` collides with the Stripe webhook's leadId pattern.** 10 of 14 lead ads use raw creative nanoids (e.g. `Nv19TDPvjPZNX4_zpQvmu`, `sO1_DWaqethKHCSsOl2Z2` — exactly 21 chars of `[A-Za-z0-9_-]`), which match the webhook's leadId fallback regex `/^[A-Za-z0-9_-]{21}$/` (`src/app/api/webhooks/stripe/route.ts:291`). Verified consequence today: **benign no-op** — the fallback only fires when the primary lead link matched zero rows, and it looks up `emailLeads.id = utm_content`, so an ad nanoid finds no lead (id spaces are disjoint; accidental equality is ~2^-126). But the pattern ambiguity is a standing foot-gun the 05-29 audit already flagged from the drip side; the 05-23 creatives show the correct convention (`en_ref_off24`, `en_ref_nasa`, `en_ref_made`). On relaunch, re-cut the eight 05-17 ads' `utm_content` to prefixed slugs (`en_ref_passport`, `es_ref_combinations`, …).
4. Cosmetic: `utm_medium=image` on everything (no differentiation), `utm_term=en|es` duplicates what the landing locale already tells you. Harmless.
5. `url_tags` unset everywhere — UTMs are baked into `link_data.link`/CTA link consistently (both copies match on every ad). No drift found.

---

## 5. ACCOUNT HEALTH

Source: `GET act_…?fields=account_status,disable_reason,…` + `issues_info`/`ad_review_feedback` on every campaign/ad-set/ad (2026-07-10).

- **Account:** `account_status=1` (ACTIVE), `disable_reason=0`, `spend_cap=0` (none), balance $0. The account itself is healthy — darkness is purely the founder's pause.
- **Disapprovals:** zero. No `issues_info` and no `ad_review_feedback` on any of the 5 campaigns / 7 ad sets / 48 ads.
- **Learning phase:** `learning_stage_info` returns nothing on paused ad sets. Practical read: after 47 dark days both lead ad sets will **restart learning from scratch** on un-pause; with 8 ads in EN Tier-1 and a $25/day budget, Meta will again concentrate delivery on `passport`/`nasa` and starve `off24`/`made` (that is what happened 5/23–5/24). If those angles matter, isolate them in a separate small test ad set at relaunch (unchanged 05-29 recommendation).
- **DSA / UK-IE:** unchanged since 05-04 — `dsa_payor`/`dsa_beneficiary` empty on all ad sets; EN Tier-1 geo is US/CA/AU with NZ+SV excluded ("no EU" by construction), so nothing currently requires DSA. The **old EN LPV ad set (120243025977120527) still contains GB** in geo; it's paused, but if it (or UK/IE targeting generally) is ever revived, the DSA/beneficiary setup must be completed first.
- **ES ad-set hygiene — still NOT cleaned** (verified live targeting spec today, identical to 05-29): geo includes **SV** (El Salvador — historically $3+/0 leads; excluded on EN for that reason), `publisher_platforms` unset (**audience_network still ON**), no `excluded_geo_locations`, age 22-38, `targeting_automation={}`. Since the standing recommendation is **ES-first relaunch**, this uncleaned spec is the first thing that will burn money on day one of re-enable.
- **Shared-account risk (context):** the ad account hosts ~18 unrelated business campaigns (auto export, cleaning, fitness). All paused, none spent in the window; but Estrevia's delivery history/pixel lives in a mixed account — a future migration consideration, not a today problem.

---

## 6. RELAUNCH READINESS CROSS-CHECK (Meta-adjacent, verified in repo)

| 05-29 pre-relaunch item | State 2026-07-10 | Evidence |
|---|---|---|
| P0-1 anon payer sign-in | **FIXED + pushed** 2026-05-30 | `de39cee` = `origin/main` HEAD |
| STR-1 pre-trial-end reminder email | **NOT shipped** | no commits after 05-30 except local HALF50 series |
| HALF50 re-activation blast | built, **NOT pushed / NOT sent** | 6 local commits `a7fd213..7241c3b`; gated on postal-address env |
| P1-1 server-side `landing_view` (reconciler false-suspend guard) | **NOT shipped** — still client-only | `LandingViewTracker.tsx:7` is the only emitter; `reconciler.ts:19` still compares Meta clicks vs PostHog `landing_view` ≥25% |
| C3 ES CTA "gratis" copy | **Half-shipped** | `paywall.cta.ctaLabel` = "Comienza tu prueba gratis de 3 días" ✓, but `pricing.startTrial` + `paywall.trialCta` still "Comenzar prueba de 3 días" (no "gratis") — `messages/es.json` |
| META-P2 ES targeting hygiene | **NOT done** | §5 above |

(Agent kill-switch note from 05-29 still applies: re-enabling = manual Ads-Manager un-pause; `ADVERTISING_AGENT_ENABLED` stays off.)

---

## FINDINGS (ranked)

| # | Sev | Finding | Load-bearing number |
|---|---|---|---|
| M-1 | **P0** | Acquisition fully dark 47 days with the pause's justifying blocker fixed 41 days ago; zero funnel input, drip pool exhausted since ~06-15 | $0.00 spend / 0 impressions on all 47 days 2026-05-25..2026-07-10 (account insights, time_increment=1); ~479 foregone EN-run-rate leads |
| M-2 | **P1** | ES ad set (the recommended relaunch vehicle) still has uncleaned targeting: SV in geo, audience_network ON, no exclusions | live targeting pull 2026-07-10: `geo_locations.countries` includes `"SV"`, `publisher_platforms` unset |
| M-3 | **P2** | Winning creative's hook ("NASA", $1.14 CPL) has zero echo on the landing; "NASA-verified" also overclaims | grep `messages/en.json` for NASA → only legal key `s7P3`; ad `en_ref_nasa` CPL $1.14 (5/23–5/24, $11.35/10 leads) |
| M-4 | **P2** | All 6 ES ads land on `/` not `/es/` — Spanish ad → English page whenever Accept-Language ≠ es | 6/6 ES lead-ad `link_data.link` = `https://estrevia.app/?…utm_term=es`; `routing.ts` `localePrefix:'as-needed'` |
| M-5 | **P2** | Ads promise "Free … 60 seconds" / landing says "No account needed", then an email gate interposes before the promised chart (dismissible, so friction not fraud) | 2/14 ads carry explicit "Free"+"60 seconds" descriptions; `emailGate.dismissCta` rendered at `EmailGateModal.tsx:276` |
| M-6 | **P3** | UTM hygiene: dual `utm_campaign` namespaces (`estrevia_launch_*` vs `estrevia_lead_*`) + 10/14 ads use 21-char nanoid `utm_content` matching the webhook leadId regex (verified benign no-op today) | regex `/^[A-Za-z0-9_-]{21}$/` at `webhooks/stripe/route.ts:291`; e.g. `utm_content=Nv19TDPvjPZNX4_zpQvmu` (21 chars) |
| M-7 | **P3** | Relaunch guardrail unshipped: `landing_view` still client-only → reconciler false-suspend risk if the agent is ever enabled with live ads | ≥25% divergence threshold in `perceive/reconciler.ts`; sole emitter `LandingViewTracker.tsx` |
| M-8 | **P3** | Account health clean (no disapprovals, account_status=1) but DSA still unset; old EN LPV ad set contains GB — UK/IE stay blocked until DSA payor/beneficiary set | `dsa_payor`/`dsa_beneficiary` = none on 4/4 ad sets checked |

## RECOMMENDED SEQUENCE (Meta side only)

1. **Decide the relaunch this week** (M-1). Minimum viable: clean ES targeting (drop SV, set `publisher_platforms=["facebook","instagram"]`) → un-pause `Estrevia Launch — Leads` with ES LATAM at ~$15/day; keep EN Tier-1 paused 48h if trial→paid reminder email still isn't shipped, or accept the known ~8% trial→paid and relaunch both.
2. Before/at un-pause: fix ES links to `/es/` (M-4), unify `utm_campaign` + prefixed `utm_content` slugs (M-6) — 10 minutes in Ads Manager while editing.
3. Landing sector hand-off (M-3, M-5): add one NASA/actual-sky proof line near the hero calculator ("Sky positions from NASA-grade Swiss Ephemeris data — ±0.01°") and soften future creative copy from "NASA-verified" → "NASA-grade data"; reconcile "No account needed" with the email-gate ask (e.g. "No account needed — we'll email your chart").
4. At relaunch, isolate `off24` (best message-match, 9/10) + `made` in a $5–8/day test ad set so they finally get delivery instead of being starved by `passport`/`nasa` learning history.

*All numbers from Meta Graph API v23.0 GETs run 2026-07-10; repo evidence from working tree at `7241c3b` (origin/main `de39cee`). No writes performed anywhere.*
