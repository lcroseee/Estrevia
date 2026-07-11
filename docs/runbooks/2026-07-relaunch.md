# Meta Relaunch Runbook — July 2026

**Source:** CRO audit 2026-07-10 (`outputs/cro-audit-2026-07-10/REPORT.md`, "Relaunch (week 1)" + expectation-setting) · roadmap `docs/superpowers/specs/2026-07-10-cro-audit-roadmap.md`.
**Owner:** founder (spend decisions are yours; scripts assist). This document has no code — it sequences the ops.

## 0. Preconditions (hard gates)

- [ ] Phase 0 deploy gate FULLY done (plan `2026-07-10-cro-phase0-relaunch-blockers.md` Task 17, all 8 steps): env vars, migration 0018, push, smoke, backfills applied, Meta scripts applied, Stripe dashboard checklist ticked, CAPI 422 outcome executed.
- [ ] Strongly recommended before first dollar: SP-E (ads buy the landing — blank-first-paint + message match) and SP-F pixel consent gating (compliance risk scales with traffic). SP-A/SP-C/SP-D can land during week 1.
- [ ] Attribution readiness verified in Events Manager: browser PageView flowing post-CAPI-fix, EMQ visible, pixel = `NEXT_PUBLIC_META_PIXEL_ID` (live pixel 1945750759636135).
- [ ] Watchdogs alive: server `landing_view` events arriving ($lib=posthog-node), drip cron sending (Vercel cron logs), Stripe webhook deliveries 2xx.

## 1. Week 1 — EN only, $25/day

**Campaign:** existing OUTCOME_LEADS structure; EN ad set `120243116854610527` (Tier-1 no-EU, targeting cleaned 05-23). ES stays PAUSED (gate in §3).

**Creatives — the two proven hooks only:**
1. "OFF by 24°" (Angle A, $1.19-1.79 CPL history).
2. "NASA's actual sky" — **recut before activating**: the live `en_ref_nasa` headline "NASA-verified chart" is an overclaim (policy: never imply NASA endorsement — `hooks-en.ts:191-201`). New headline direction: "The actual sky. ±0.01°." / body keeps "same math NASA uses" (factual). While recutting, apply audit M-6: `utm_content` → prefixed slugs (`en_ref_off24_v2`, `en_ref_sky_v2`) instead of bare nanoids, and retire the `estrevia_launch_*` utm_campaign namespace.
3. Do NOT add new angles in week 1 — two proven hooks, clean read.

**Page sanity:** manual ad creation inherits the last-used Page across businesses (4 Pages on the account). Estrevia Page = `1087394517790815`. Script-created ads are safe (META_PAGE_ID); manual ones — check the Page selector every time.

**Expectations (set BEFORE looking at data):** at lifetime CPL $1.19-1.79 → ~100-150 leads/week at $175/wk → at pre-pause EN lead→user 13.3% → ~13-20 users → 1-3 trials. **Trial→paid is THE number to watch** — was ~8% with Link bank-funding failures; the P0-4 dashboard fixes should lift it. n will be tiny; judge mechanisms (does each funnel stage fire), not rates.

## 2. Monitoring cadence (week 1: daily, ~10 min)

| Check | Where | Healthy | Red flag → action |
|---|---|---|---|
| Spend + CPL | Ads Manager | ≤$2.5 CPL | >$3.5 avg over 3 days → pause worst ad, keep set |
| Leads flowing | `email_leads` count / PostHog | ~15-20/day | 48h of spend with 0 leads → STOP, funnel break — check gate + `/api/v1/leads` |
| Server landing_view vs Meta clicks | PostHog ($lib=posthog-node) vs Ads Manager | ratio stable | landing_view ≪ clicks → landing/CSP/bot problem |
| Drip sending | Vercel cron logs + `sent_lead_emails` | new rows daily | cron errors → check Resend/env |
| Checkout sessions | Stripe dashboard | sessions appear as trials start | sessions created, 0 completed → screenshot + compare vs audit signatures |
| Webhooks | Stripe → Webhooks | all 2xx | 4xx/5xx → check Vercel logs immediately |
| EMQ / pixel events | Events Manager | Lead events registering | 0 browser events → consent rate? pixel gating regression? (server landing_view is the denominator — SP-F decision D3) |
| New payer emails | `users.email` of new payers | real addresses | any `stripe-pending-%` row → P0-1 regression, fix before continuing |

**Learning-phase discipline (memory `feedback_meta_learning_phase`):** no pause/scale/edit decisions on ads with <7 days running or <50 conversions. Week 1 = observation, not optimization.

## 3. ES re-spend gate

Enable the ES ad set ONLY when ALL of:
- [ ] SP-B deployed (US$ framing, trust row, ES banner/calendar/aria).
- [ ] Phase 0 ES batch verified live: ads point to `/es/`, targeting has no SV + no audience_network, 'gratis' CTA strings live.
- [ ] EN week-1 shows the funnel mechanically works end-to-end (≥1 completed checkout through the new rails, real email on the user row, lifecycle email delivered).

Then: ES at $15-25/day, same two hooks (ES variants exist), **watch metric: Stripe session created→completed for ES-locale sessions — target >10% (was 4.5%, 1/22)**. If after ~20 ES sessions it's still <10%, trigger SP-B's currency-decision revisit (`outputs/sp-b/currency-decision.md`) before spending more.

## 4. Kill / rollback criteria

- Any P0-class regression (placeholder emails, checkout 500s, webhook failures) → pause ALL ads first, debug second.
- CPL >2× lifetime norm for 3 consecutive days on both hooks → pause campaign, re-audit landing match.
- Spend without leads ≥$50 cumulative → stop; the funnel, not the ads, is broken.

## 5. Week 2 checkpoint (build the break-even model — audit exclusion, now unblocked)

Collect: actual CPL, lead→user, user→trial, trial→paid, first-cycle churn, ARPU (monthly-first mix post-flip). Model: CAC = CPL / (lead→paid); compare vs LTV proxy = ARPU × expected cycles (use 3 as placeholder until churn data exists). Decision: scale to $50/day / hold / fix-first. Also revisit: drip refuel (new sequences for fresh leads), SP-B currency decision, testimonial trigger (≥10 retained payers), session-recording findings on payer day-one silence (SP-D).

## 6. Standing references

- Ad account `act_1435842067150024` · Business: USA AUTOMOTO EXPORT · Estrevia Page `1087394517790815` · IG `17841424342702333`.
- EN ad set `120243116854610527` · ES ad set `120243116822500527` (paused; new `_v2` ads PAUSED pending review after Phase 0 T13).
- Proven hooks + CPLs: `outputs/cro-audit-2026-07-10/05-meta.md`; creative scripts: `scripts/advertising/_create_creatives_2026_05_23.mjs` (house pattern).
- Auto-iteration in the advertising agent stays OFF (CLAUDE.md: gated until winning patterns exist).
