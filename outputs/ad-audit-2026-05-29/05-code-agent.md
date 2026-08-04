# Sector 05 — Code & Ad-Agent-State Investigation (2026-05-29)

Read-only. No Meta/Stripe/DB mutations. Working dir: /Users/kirillkovalenko/Documents/Projects/Estrevia

## Headline
The account is dark by **deliberate founder action**, NOT by any agent/cron. The autonomous ad
agent is fully gated off (`ADVERTISING_AGENT_ENABLED=false` + `DRY_RUN=true` + `seniorBuyerMode=off`)
and **no code path anywhere can pause an account, campaign, or ad set wholesale** — the only pause
is per-`ad_id` and it is itself blocked by the engaged kill switch. The 4 fixes shipped since 5/23
(ES Stripe locale, checkout-recover, idempotency, ES currency badge) are correctly implemented, with
two residual gaps: (1) the ES **/pricing + PaywallModal** CTAs are still the weak formal
"Comenzar prueba de 3 días" (only the in-flow PaywallCta got the urgent "Comienza tu prueba gratis"),
and (2) drip emails never set `utm_content`, so drip→Stripe conversions are unattributable and the
recover endpoint never links the `email_leads` row.

---

## 1. AD AGENT STATE — fully gated off

Env (`.env`, boolean operational flags, not secrets):
- `ADVERTISING_AGENT_ENABLED=false`  → kill switch ENGAGED
- `ADVERTISING_AGENT_DRY_RUN=true`   → even if enabled, no Meta mutations
- `ADVERTISING_DAILY_SPEND_CAP_USD=80`

`seniorBuyerMode` feature gate: `initial_mode: 'off'` (`decide/feature-gates.ts:111-114`), no
auto-activation criteria — flip is founder-manual only. Orchestrator (`decide/orchestrator.ts:151-155`)
routes to legacy Tier-1 path while gate=off; moot anyway because the kill switch precedes it.

Kill-switch semantics (`safety/kill-switch.ts:27-28`): `isKillSwitchEngaged()` returns true whenever
`ADVERTISING_AGENT_ENABLED !== 'true'`. With the value `false`, the agent is OFF.

**Operational mode = OFF (shadow/no-op).** The agent is not acting on the account. This matches the
project memory: "autonomous loop intentionally gated until ~month 3+."

## 2. CRON JOBS — none can darken the account

`vercel.json` advertising crons: triage-hourly (`0 * * * *`), triage-daily (`0 9 * * *`),
retro-weekly (`0 9 * * 1`), audience-refresh (`0 6 * * *`), account-health-weekly (`0 10 * * 1`),
auto-calibrate (`0 3 * * 0`).

EVERY advertising cron has, as its second statement, the kill-switch guard:
```
if (process.env.ADVERTISING_AGENT_ENABLED !== 'true') {
  return NextResponse.json({ success: false, reason: 'kill_switch' });
}
```
(triage-daily:61-63, triage-hourly:42-44, account-health-weekly:27-29). With ENABLED=false, all of
them return `kill_switch` and do nothing. They are **no-ops while paused**.

- `account-health-weekly` only sends a Telegram reminder asking the founder to manually review Account
  Quality — no API write, no pause (route.ts:31-37).
- `triage-hourly` is pause-only Tier-1, and even when enabled `pause()` acts on a single
  `decision.ad_id` (`act/pause.ts:52` → `metaApi.pauseAd(decision.ad_id)`).
- `triage-daily` applies pause/scale/duplicate, all per-`ad_id`/`ad_set`.
- `spend-cap.ts` and `kill-switch.ts` only **block** new spend (return `allowed:false`); they NEVER
  call pause on the account.

Grep for `pauseAccount|pauseCampaign|account.*PAUSED|disableAccount|ACCOUNT_PAUSED|adaccount.*status`
across `src/` (excluding tests): **zero matches.** There is no account-level or campaign-level pause
primitive in the codebase.

**Conclusion: the account going dark was a deliberate founder action (manual pause in Ads Manager),
not an automated agent/cron action.** Tier-1 worst case is one ad paused (freq≥4.0 / cpc≥$5 /
spend≥$25/day), never the whole account — and that path is dead while ENABLED=false.

## 3. CHECKOUT-RECOVERY (76dffc2..1c2c64a) — correct, with one attribution gap

`POST /api/v1/checkout/recover` (`src/app/api/v1/checkout/recover/route.ts`):
- **No double-charge risk.** It only `stripe.checkout.sessions.retrieve()` + `subscriptions.retrieve()`
  — read-only against Stripe. Payment already happened at Checkout; it never creates a PaymentIntent
  or subscription.
- **Auth model sound.** Public + IP rate-limited (slot `checkout/recover` exists,
  `rate-limit.ts:79`); the `cs_...` session_id IS the authorization (only the payer has it from the
  redirect). Body validated `startsWith('cs_')`.
- **Idempotent.** Clerk find-or-create with race recovery (route.ts:196-219), DB `onConflictDoUpdate`
  preserving real email via ``sql`${users.email}` `` (264-289), fast-path ticket reuse (156-170),
  `recovery:<session_id>` marker row.
- Guards: only proceeds if `payment_status==='paid' || status==='complete'` AND
  `mode==='subscription'` (147-153); returns `ready:false` otherwise.
- Client trigger (`CheckoutCompleteClient.tsx:54-78`): on 30s poll timeout, fires
  `CHECKOUT_TICKET_TIMEOUT`, POSTs `/recover`, redirects to `/sign-in?__clerk_ticket=...` on
  `ready:true`, else falls back to "check your email" UI. Correct.
- 3 PostHog events exist: `CHECKOUT_RECOVERY_{ATTEMPTED,SUCCEEDED,FAILED}` (`analytics.ts:243-245`).

**Gap (P2):** the recover endpoint intentionally skips webhook side effects, including the
`email_leads` lead-linking (`convertedToUserId`/`convertedAt`) and the `utm_content` fallback
unsubscribe that the webhook does (`webhooks/stripe/route.ts:240-275`). The docstring says these
"fire when (if) the webhook eventually arrives" — but recover runs precisely when the webhook is
delayed/**dropped**. If the webhook never arrives, a recovered conversion's lead row stays
`convertedToUserId=NULL` forever → not counted as converted in the lead funnel AND the drip keeps
emailing the now-paying user (no suppression). Low-frequency, but a real attribution/suppression hole.

## 4. ES STRIPE FIX (5849f22) — correct

`src/app/api/v1/stripe/checkout/route.ts`:
- `stripeLocale = localeFromBody==='es' ? 'es-419' : 'auto'` — LATAM Spanish, matches content style
  guide. EN/missing → `'auto'` (browser language). Correct.
- `custom_text.submit.message` carries LATAM currency equivalents, plan-aware:
  - annual: `≈ 630 MXN · 147 000 COP · 33 200 CLP · 133 PEN · 1 400 UYU`
  - monthly: `≈ 90 MXN · 21 000 COP · 4 740 CLP · 19 PEN · 200 UYU`
- Applied to **both** auth (line ~219) and anon (line ~339) branches; omitted for EN (`custom_text`
  undefined). Mirrors `messages/es.json` pricing.{monthlyPriceEquiv,annualPriceEquiv}.
- Locale detection keys off `localeFromBody` (request body), not browser — deterministic. No bug
  found. Currency strings are server-side hardcoded with a sync note (refresh quarterly with FX) —
  acceptable; the only risk is FX drift if rates are never refreshed.

This directly targets the baseline "ES 0% Stripe completion" break; the code is correct, so any
residual ES completion problem is downstream (page UX / payment-method) or simply unobservable while
the account is dark (no ES traffic since 5/21).

## 5. ES /pricing COPY PARITY (baseline CSI-1) — STILL WEAK on 2 of 3 surfaces

Three ES CTA surfaces, three different consumers:
| Surface | i18n key | ES value | Verdict |
|---|---|---|---|
| `/pricing` button (`PricingUpgradeButton.tsx:88` → `t('startTrial')`) | `pricing.startTrial` | **"Comenzar prueba de 3 días"** | WEAK — formal infinitive, no "gratis" |
| `PaywallModal` (`PaywallModal.tsx:279` → `t('trialCta')`) | `paywall.trialCta` | **"Comenzar prueba de 3 días"** | WEAK — same |
| in-flow `PaywallCta` (`PaywallCta.tsx:62` → `t('cta.ctaLabel')`) | `paywall.cta.ctaLabel` | "Comienza tu prueba gratis de 3 días" | STRONG/urgent |

EN equivalents are all the SAME strong copy: `pricing.startTrial` / `paywall.trialCta` /
`paywall.cta.ctaLabel` = **"Start 3-Day Free Trial"** (all include "Free"). So the ES /pricing button
and the ES PaywallModal both drop "gratis/free" and use the neutral infinitive "Comenzar" — the exact
weak/formal pattern flagged in baseline CSI-1. Only the contextual in-flow CTA was upgraded. The
two highest-intent surfaces (the pricing page and the upgrade modal) still carry the weak ES copy.

Recommendation: change `pricing.startTrial` and `paywall.trialCta` in `messages/es.json` to the
urgent imperative + "gratis", e.g. **"Comienza tu prueba gratis de 3 días"** to match the in-flow CTA
and EN parity.

## 6. DRIP UTM in code — present on ALL 7 steps, but missing utm_content (attribution gap)

All 7 drip steps in `src/shared/lib/email.ts` append UTM to their CTA URL:
- t0 (397/398), t1h (471/472), t24h (561/562), t72 trial link (635), t7d (697/698), t14d (761/762),
  t21d synastry (837).
- Each sets `utm_source=lead-nurture` + a step-specific `utm_campaign` (t0/t1h/t24h/t72/t7d/t14d/t21d).

**But none set `utm_content` (or `utm_medium`).** The Stripe attribution module keys/filters on
`utm_content` (`perceive/stripe-attribution.ts:62` — "ad_id by convention") and the webhook lead
fallback reads `session.metadata?.utm_content` (`webhooks/stripe/route.ts:256`). A drip-driven
conversion therefore lands in Stripe with `utm_content=null` → never matches an ad-id and is treated
as unattributed by the agent's ROAS/Stripe-attribution path. This is the code-level confirmation of
the baseline "drip→Stripe attribution=0" symptom — confirms the Resend investigator's runtime
finding from the template source.

Recommendation: add a stable `utm_content` (e.g. `utm_content=lead_<leadId>` or `=drip_<step>`) to
all drip CTA URLs so Stripe sessions started from a drip click carry a matchable token, and teach the
webhook/attribution to recognize the drip namespace distinctly from ad ids.

---

## Machinery health verdict
Healthy and safe. Kill switch + DRY_RUN + gate=off are mutually reinforcing; no autonomous mutation
is possible. Recover endpoint and ES Stripe fix are correctly built. Residual debt is two CTA copy
strings and the missing `utm_content` in drip links — both fixable in `messages/es.json` /
`email.ts`, neither blocking. The account is dark by founder choice; turning acquisition back on is a
manual Ads-Manager un-pause, not a code change.
