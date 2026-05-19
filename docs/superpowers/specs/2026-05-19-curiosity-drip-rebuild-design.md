# Curiosity-Driven Lead Drip Rebuild (T+0 / T+1h / T+24h)

**Status:** Spec — pending writing-plans.
**Date:** 2026-05-19
**Audit basis:** [Conversion + traffic audit, 2026-05-19](../../../outputs/advertising-audit-2026-05-17-evening/00-executive-summary.md) (this conversation).
**Owner area:** Marketing / lead nurture pipeline (`src/shared/lib/email.ts`, `src/app/api/cron/lead-nurture`).
**Not in scope:** T+72h `lead_paywall_teaser` content, T+7d Saturn weekly, T+14d/T+21d, Stripe locale fix, ad-creative changes.

## Motivation

Today's funnel (2026-05-19, last 7 days):

| Stage | Volume | Conversion |
|---|---:|---|
| Meta spend | $197.86 | — |
| Leads captured | 162 | $0.70 CPL — healthy |
| `paywall_opened` (PostHog) | 22 distinct | **14% of leads** |
| `subscription_started` | 1 | **0.6% of leads** |
| EN paid | 5/62 | 8.06% |
| **ES paid** | **0/100** | **0.00%** |

Two facts collapse the funnel after email capture:

1. **All 5 conversions same-day (days_to_convert ≈ 0)** — drip emails T+0 (chart) and T+24h (moon/asc) **never drove a conversion**. The first paywall push (T+72h `lead_paywall_teaser`) has not fired for any lead yet (first lead was 2026-05-17 14:26 UTC; T+72h = 2026-05-20 14:26 UTC).
2. **The first two drip emails point to chart / signup, not paywall.** A lead who didn't return same-day has **no paywall surface for 3 full days**. By T+72h the lead has cooled.

Per Pack B decision in brainstorming, this spec rebuilds T+0/T+1h/T+24h as a curiosity-driven funnel that surfaces the paywall earlier without resorting to discounts or urgency tactics (brand-incompatible per founder direction).

## Decisions (from brainstorming, 2026-05-19)

| # | Decision | Rationale |
|---|---|---|
| 1 | Hot-lead T+1h **new** email, NOT discount-based | Discounts cannibalize LTV and clash with esoteric brand tone |
| 2 | **Curiosity teaser** angle: hint at hidden chart pattern, withhold full reveal | Esoteric audience is curiosity-driven, not deal-driven |
| 3 | Rebuild T+0/T+1h/T+24h triad as cliffhanger → payoff → deepening | Maximizes early paywall exposure without spam |
| 4 | **Sign-level personalization** (sun/moon/asc + 1 "dominant" planet) | Data already in `chart_data`; 4×12×2 = 96 micro-copies, scalable |
| 5 | CTA → `/chart?chartId=X` (not `/checkout/start`, not `/pricing`) | ChartReadingSection paywall surface lives here; continues cliffhanger |
| 6 | **Full cutover**, NOT A/B | Volume too low (~25 leads/day) for paired A/B; week-over-week comparison sufficient |
| 7 | Both **EN + ES** locales shipped together | Per CLAUDE.md i18n requirement; ES is the primary monetization gap |
| 8 | Soft trial mention in footer ("3-day free trial, cancel anytime") — NO timer, NO discount | Reassures without violating brand tone |

## Behavior model

### Email sequence (new)

| Step | Sent at | Email | Purpose | CTA destination |
|---|---|---|---|---|
| 0 → 1 | T+0 (within 15 min of opt-in) | `lead_chart` (rewrite) | Intrigue — reveal Sun + tease moon/asc + hidden-planet hook | `/chart?chartId=X&utm_source=lead-nurture&utm_campaign=t0` |
| 1 → 2 | T+1h | `lead_curiosity_hook` (**new**) | Reveal hidden planet + esoteric depth pitch + paywall preview offer | `/chart?chartId=X&utm_source=lead-nurture&utm_campaign=t1h` |
| 2 → 3 | T+24h | `lead_moon_asc` (rewrite) | Deepening — full moon/asc reveal + AI-reading teaser, second paywall push | `/chart?chartId=X&utm_source=lead-nurture&utm_campaign=t24h` |
| 3 → 4 | T+72h | `lead_paywall_teaser` (unchanged) | Third paywall attempt | `/checkout/start?plan=pro_annual&utm_campaign=t72` |
| 4 → 5 | T+7d | `lead_saturn_weekly` (unchanged) | Brand-building | (unchanged) |
| 5 → 6 | T+14d | `lead_mini_reading` (unchanged) | Brand-building | (unchanged) |
| 6 → 7 | T+21d | `lead_synastry_teaser` (unchanged) | Brand-building | (unchanged) |
| 7 | (final) | — | No further sends | — |

### What's withheld vs revealed per email

| Element | T+0 | T+1h | T+24h |
|---|---|---|---|
| Sun sign | ✅ revealed + 1 sentence interp | (reference only) | (reference only) |
| Moon sign | ❌ named only as "your Moon tells a deeper story" | ❌ same | ✅ full reveal + interp |
| Ascendant | ❌ same as Moon | ❌ same | ✅ full reveal + interp |
| Hidden dominant planet | 🟡 named, 1-word tease ("your Saturn is doing something rare") | ✅ full reveal + interp | (reference only) |
| Esoteric/Thelema depth pitch | ❌ | ✅ explicit | 🟡 implied via "Cosmic Passport" mention |
| Paywall offer | ❌ ("see your chart" CTA, paywall is incidental) | ✅ explicit ("unlock your full reading") | ✅ explicit ("read your AI analysis") |

## Code structure

### Files added

```
src/shared/lib/emails/LeadCuriosityHookEmail.tsx   ← React Email component
src/shared/lib/emails/__tests__/LeadCuriosityHookEmail.test.tsx
src/shared/lib/__tests__/email-curiosity-hook.test.ts  ← send function test
src/shared/lib/__tests__/pickDominantPlanet.test.ts    ← rule test
drizzle/0013_lead_curiosity_hook.sql                   ← step renumber + index + enum
```

### Files modified

```
src/shared/lib/email.ts
  + sendLeadCuriosityHookEmail()  (new)
  + pickDominantPlanet(chart): 'Saturn' | 'Mars' | 'Venus' | 'Mercury'  (new helper)
  ~ sendLeadChartEmail()          (rewrite body — cliffhanger structure)
  ~ sendLeadMoonAscEmail()        (rewrite body + change CTA from /sign-up to /chart)

src/shared/lib/emails/LeadChartEmail.tsx                 (rewrite — cliffhanger)
src/shared/lib/emails/LeadMoonAscEmail.tsx               (rewrite — AI-reading teaser, /chart CTA)
src/shared/lib/__tests__/email-lead.test.ts              (update existing tests for new copy)
src/shared/lib/emails/__tests__/LeadChartEmail.test.tsx  (update snapshot)
src/shared/lib/emails/__tests__/LeadMoonAscEmail.test.tsx (update snapshot)

src/shared/lib/schema.ts
  ~ sentLeadEmails.emailType enum: add 'lead_curiosity_hook'

src/app/api/cron/lead-nurture/route.ts
  + Step 1 dispatch (T+1h curiosity hook)
  ~ Renumber existing step handlers (1→2, 2→3, 3→4, 4→5, 5→6)
  ~ Update STUCK_T0 recovery to remain step=0
  ~ Sleep/pacing logic unchanged

messages/en.json + messages/es.json
  + emails.leadCuriosityHook.* (subject + body keys, per dominant planet × 12 signs)
  ~ emails.leadChart.* (revise body keys — cliffhanger copy)
  ~ emails.leadMoonAsc.* (revise body keys — AI-reading teaser copy)
```

### Step state machine (renumbered)

| OLD step | OLD meaning | NEW step | NEW meaning |
|---:|---|---:|---|
| 0 | initial / awaiting T+0 | 0 | initial / awaiting T+0 |
| 1 | T+0 sent, awaiting T+24h | 1 | T+0 sent, awaiting T+1h |
| — | — | 2 | T+1h sent, awaiting T+24h |
| 2 | T+24h sent, awaiting T+72h | 3 | T+24h sent, awaiting T+72h |
| 3 | T+72h sent, awaiting T+7d | 4 | T+72h sent, awaiting T+7d |
| 4 | T+7d sent, awaiting T+14d | 5 | T+7d sent, awaiting T+14d |
| 5 | T+14d sent, awaiting T+21d | 6 | T+14d sent, awaiting T+21d |
| 6 | final | 7 | final |

**Data migration** for existing leads (executed in migration 0013):

```sql
UPDATE email_leads
SET nurture_step = nurture_step + 1
WHERE nurture_step BETWEEN 1 AND 6;
-- Step=0 stays 0 (initial state unchanged).
-- Step=1 (T+0 sent, waiting for T+24h)  → step=2 (T+1h sent, waiting for T+24h).
--   Semantically: they've received T+0, now waiting for T+24h. We do NOT
--   back-fill T+1h to existing leads — they skip that step intentionally.
-- All other steps shift by +1 to preserve their semantic state in the new schema.
-- nurture_next_at is NOT modified — existing timestamps remain valid for the
-- "next email due" check; the new step number routes to the correct handler.
```

Idempotency: a re-run of this UPDATE is destructive (would shift again). Migration must include a guard such as a one-shot lock row in a `_migration_marker` table, or run only via `drizzle-kit` which tracks applied migrations. Verify in plan phase.

### Partial index update (critical)

Current schema (migration 0011):
```sql
CREATE INDEX "email_leads_nurture_due_idx"
  ON "email_leads" USING btree ("nurture_next_at")
  WHERE nurture_step < 3 AND converted_to_user_id IS NULL
    AND unsubscribed_at IS NULL AND email_undeliverable = false;
```

The `WHERE nurture_step < 3` covers steps 0, 1, 2 — i.e., leads in the "early high-frequency drip" window. After renumber, the equivalent active-drip window is steps 0, 1, 2, 3 (T+0, T+1h, T+24h, T+72h). Update partial index:

```sql
DROP INDEX "email_leads_nurture_due_idx";
CREATE INDEX "email_leads_nurture_due_idx"
  ON "email_leads" USING btree ("nurture_next_at")
  WHERE nurture_step < 4 AND converted_to_user_id IS NULL
    AND unsubscribed_at IS NULL AND email_undeliverable = false;
```

### Cron route refactor

Current cron has each step inlined as a separate SQL query + processing loop. After refactor, prefer **table-driven dispatch**:

```ts
interface StepHandler {
  fromStep: number;
  toStep: number;
  send: (params: LeadEmailParams) => Promise<{ sent: boolean; reason?: string }>;
  emailType: 'lead_chart' | 'lead_curiosity_hook' | 'lead_moon_asc' | 'lead_paywall_teaser' | 'lead_saturn_weekly' | 'lead_mini_reading' | 'lead_synastry_teaser';
  nextDelayMs: number | null;  // null = terminal step
}

const STEP_HANDLERS: StepHandler[] = [
  { fromStep: 0, toStep: 1, send: sendLeadChartEmail,          emailType: 'lead_chart',          nextDelayMs: 1   * 60 * 60 * 1000 },
  { fromStep: 1, toStep: 2, send: sendLeadCuriosityHookEmail,  emailType: 'lead_curiosity_hook', nextDelayMs: 23  * 60 * 60 * 1000 },
  { fromStep: 2, toStep: 3, send: sendLeadMoonAscEmail,        emailType: 'lead_moon_asc',       nextDelayMs: 48  * 60 * 60 * 1000 },
  { fromStep: 3, toStep: 4, send: sendLeadPaywallTeaserEmail,  emailType: 'lead_paywall_teaser', nextDelayMs: 96  * 60 * 60 * 1000 },
  { fromStep: 4, toStep: 5, send: sendLeadSaturnWeeklyEmail,   emailType: 'lead_saturn_weekly',  nextDelayMs: 168 * 60 * 60 * 1000 },
  { fromStep: 5, toStep: 6, send: sendLeadMiniReadingEmail,    emailType: 'lead_mini_reading',   nextDelayMs: 168 * 60 * 60 * 1000 },
  { fromStep: 6, toStep: 7, send: sendLeadSynastryTeaserEmail, emailType: 'lead_synastry_teaser', nextDelayMs: null },
];
```

The STUCK_T0 recovery branch (`nurture_step=0 AND nurture_next_at IS NULL AND created_at < NOW() - 15min`) keeps its current form — handled outside the dispatch table since it's a recovery mechanic, not a normal step.

### `pickDominantPlanet` rules

Deterministic, no LLM, executes in <1ms:

```ts
export function pickDominantPlanet(chart: ChartResult | null): {
  planet: 'Saturn' | 'Mars' | 'Venus' | 'Mercury';
  signName: string;  // sidereal sign in their chart
} {
  if (!chart) return { planet: 'Mercury', signName: 'Gemini' };  // generic fallback

  const positions = chart.positions ?? [];
  const find = (name: string) => positions.find((p) => p.body === name);

  const saturn = find('Saturn');
  const mars = find('Mars');
  const venus = find('Venus');
  const mercury = find('Mercury');

  // Rule 1: Saturn in essential dignity (Capricorn or Aquarius sidereal)
  if (saturn && (saturn.sign === 'Capricorn' || saturn.sign === 'Aquarius')) {
    return { planet: 'Saturn', signName: saturn.sign };
  }
  // Rule 2: Mars in domicile (Aries or Scorpio)
  if (mars && (mars.sign === 'Aries' || mars.sign === 'Scorpio')) {
    return { planet: 'Mars', signName: mars.sign };
  }
  // Rule 3: Venus in domicile (Taurus or Libra)
  if (venus && (venus.sign === 'Taurus' || venus.sign === 'Libra')) {
    return { planet: 'Venus', signName: venus.sign };
  }
  // Rule 4: fallback to Mercury (messenger angle works generically)
  return {
    planet: 'Mercury',
    signName: mercury?.sign ?? 'Gemini',
  };
}
```

Type signature `ChartResult.positions` to be verified during plan phase (likely `Array<{ body: string; sign: string; ... }>` from `src/shared/types`).

### Translation keys (new + revised)

New keys (`emails.leadCuriosityHook.*`):
- `subject.{Saturn|Mars|Venus|Mercury}` — 4 subject templates
- `body.intro` — generic intro
- `body.reveal.{Saturn|Mars|Venus|Mercury}.{12 signs}` — 48 sign-specific interpretation paragraphs
- `body.depthPitch` — Thelema/esoteric depth angle
- `body.cta` — "Unlock your full reading"
- `body.trialNote` — "3-day free trial. Cancel anytime."

Per locale: ~55 keys × 2 locales = **~110 new keys**. ES copy follows established style (español neutro LATAM, `tú` form, signs untranslated).

Revised keys:
- `emails.leadChart.body.*` — rewrite to cliffhanger structure (~10 keys per locale)
- `emails.leadMoonAsc.body.*` — rewrite to AI-reading teaser + new CTA copy (~10 keys per locale)

## Dependencies

| Concern | Status |
|---|---|
| Packages | None new (uses `@react-email/components`, `resend`, existing) |
| Env vars | None new |
| Migrations | One new (`0013_lead_curiosity_hook.sql`) — additive + UPDATE on `email_leads` |
| External services | Resend (existing) |
| Advertising module | Not touched |
| Auth / Clerk | Not touched |
| Stripe | Not touched (separate spec for locale fix) |
| Astro engine | Not touched (`pickDominantPlanet` reads existing `chart_data`) |

## Edge cases (from Section 4 of brainstorming)

| Case | Behavior |
|---|---|
| Lead unsubscribed between step 0 and step 1 | Cron filter `unsubscribed_at IS NULL` skips all future sends (existing) |
| Resend rejects T+0 email | `sendLeadChartEmail` throws → `nurture_step` NOT advanced → next hour retry; T+1h does not fire until T+0 succeeds |
| `email_undeliverable = true` | Skipped by cron WHERE clause (existing) |
| Lead without `chart_id` | `pickKeySigns(null)` and `pickDominantPlanet(null)` return generic fallback; email still sends |
| Corrupt `chart_data` | Both helpers fail gracefully to fallback (defensive `find()` returns undefined) |
| Manual re-trigger / repair script | `tryInsertOneShotLead` UNIQUE INDEX `sent_lead_emails_oneshot_idx` blocks duplicates |
| Old `lead-nurture-recovery` script | Only acts on `nurture_step=0` stuck leads — does not interfere with renumber |
| Existing leads at OLD step 1 at deploy time | Renumbered to NEW step 2 by migration. Will NOT retroactively receive T+1h. They proceed: T+24h → T+72h → T+7d... normally |

## Spam-rate considerations

3 emails in 24h to a single recipient approaches gmail/outlook spam thresholds. Mitigations:

- Same `from:` address `hello@estrevia.app` (Resend-warmed for past 30 days)
- `List-Unsubscribe` + One-Click headers on all three (existing pattern)
- Subject lines audited against spam-trigger word list (no "FREE", "URGENT", "LIMITED", "$$", excessive caps)
- Resend bounce-rate monitor: if > 2% over 7-day window → set `SKIP_CURIOSITY_HOOK=true` env flag (see rollback)

## Validation strategy

### Success criteria (re-audit 2026-05-26, +7 days after deploy)

| Metric | Current | Target | Source |
|---|---:|---:|---|
| Lead → `paywall_opened` | 14% | **≥30%** | PostHog distinct `paywall_opened` / DB `email_leads` count |
| Lead → paid (EN) | 8.06% | **≥12%** | DB `converted_to_user_id IS NOT NULL` |
| Lead → paid (ES) | 0% | **≥2%** | (same, filter `locale = 'es'`) |
| `lead_curiosity_hook` send rate | — | **≥90%** of step 0 advances | DB `sent_lead_emails WHERE email_type='lead_curiosity_hook'` |
| T+1h email CTR | — | **≥6%** (industry SaaS baseline 3-5%) | PostHog `$current_url` parameter `utm_campaign=t1h` |
| Resend bounce rate | < 2% | < 2% (no regression) | Resend dashboard (founder reads manually) |
| Resend complaint rate | < 0.1% | < 0.1% | Resend dashboard |

### Observability additions

1. **Sentry tag** `component:lead-nurture-curiosity-hook` on the new send function
2. **Cron summary log** includes per-step send counts: `{ step_0_sent, step_1_sent, ..., step_6_sent, failed, skipped }`
3. **Wave 1 PostHog runbook** updated with `utm_campaign IN ('t0', 't1h', 't24h', 't72')` segments for funnel comparison

### Test strategy

Per CLAUDE.md TDD discipline:

| Test | What |
|---|---|
| `email-curiosity-hook.test.ts` | `sendLeadCuriosityHookEmail` renders correctly; throws on Resend `result.error`; respects locale; uses correct subject template per planet |
| `pickDominantPlanet.test.ts` | All 4 rules + fallback; null chart → Mercury/Gemini; corrupt positions → Mercury/Gemini |
| `LeadCuriosityHookEmail.test.tsx` | Snapshot per locale × per planet sign; `text` + `html` versions render |
| `lead-nurture cron step dispatch` | Step 0 → 1 → 2 → 3 → 4 → ... advance correctly with right delays; existing step=1 leads (pre-deploy via fixture) handled via renumber-aware migration path |
| `email-lead.test.ts` | Update existing tests for new T+0 and T+24h copy |
| Translation completeness | All new EN keys present in ES (existing pattern via tests/i18n script) |
| E2E `lead-nurture-curiosity-flow.test.ts` | New lead → 4 cron passes (T+0, T+1h, T+24h, T+72h) → 4 emails sent in correct sequence → step=4 |

Test data uses synthetic chart fixtures (`tests/fixtures/`) and mocked Resend (`getResend` returns stub). No real emails or PII in tests, per CLAUDE.md.

## Rollback

**Soft rollback (< 5 min)** — feature flag:
```ts
// in src/shared/lib/email.ts or cron route
const SKIP_CURIOSITY_HOOK = process.env.SKIP_CURIOSITY_HOOK === 'true';

// In step 1 dispatch: if (SKIP_CURIOSITY_HOOK) advance to step 2 without send
```
Setting `SKIP_CURIOSITY_HOOK=true` in Vercel env reverts to old T+0 → T+24h cadence within one cron cycle.

**Full rollback (< 30 min)** — revert merge commit + SQL repair:
```sql
-- Restore old step numbering for any leads created after deploy
UPDATE email_leads
SET nurture_step = nurture_step - 1
WHERE nurture_step BETWEEN 2 AND 7
  AND created_at > '$DEPLOY_TIMESTAMP';
-- Restore partial index to WHERE nurture_step < 3
DROP INDEX email_leads_nurture_due_idx;
CREATE INDEX email_leads_nurture_due_idx ON email_leads (nurture_next_at)
  WHERE nurture_step < 3 AND converted_to_user_id IS NULL
    AND unsubscribed_at IS NULL AND email_undeliverable = false;
```

## Out of scope (separate specs)

- **Stripe locale fix** — single-line `locale: 'es'` in checkout session create. Wave A1 from audit. Independent spec.
- **Localized currency** (MXN/COP/ARS) — Stripe `currency_options` per-region. Wave B3. Larger scope; separate spec.
- **Social proof on paywall** — Wave B2. Distinct UI change; separate spec.
- **PostHog `chart_calculated` event fix** — Wave C1. Observability fix; separate spec.
- **Pause / edit Meta ads** — blocked by learning phase (< 7 days, founder feedback `feedback_meta_learning_phase`). Revisit 2026-05-24.

## Open questions for plan phase

1. **`ChartResult.positions` shape** — verify exact field names (`body` vs `planet`, `sign` vs `signName`) by reading `src/shared/types` during plan phase. `pickDominantPlanet` implementation depends on this.
2. **Migration idempotency** — confirm whether drizzle-kit's migration tracking is sufficient to prevent double-application, or if explicit guard needed.
3. **Bounce-rate monitor automation** — currently founder reads Resend dashboard manually. Defer automation of `SKIP_CURIOSITY_HOOK` toggle to separate operational spec.
4. **`utm_campaign=t1h` PostHog ingest** — verify `$current_url` UTM extraction is already wired (it is for `t0`/`t24`/`t72` per recent commits), or add to instrumentation backlog.

## Risk register

| Risk | Mitigation |
|---|---|
| 3 emails in 24h triggers spam classifier | List-Unsubscribe headers, audited subjects, Resend reputation already warmed; monitor bounce/complaint rates |
| Curiosity copy lands as gimmicky for esoteric audience | Founder reviews copy before merge; tone-test against existing essays in `content/` |
| ES content quality below EN (translation-feel) | Founder is fluent Spanish-aware; review pass before merge per CLAUDE.md i18n requirement |
| Renumber migration corrupts in-flight leads | Apply during low-traffic window; verify via dry-run query (`SELECT nurture_step, COUNT(*) FROM email_leads GROUP BY 1;`) before + after |
| `pickDominantPlanet` always picks Mercury (fallback dominates) | Acceptable for v1; if Resend opens show Mercury fatigue, expand rules to include Jupiter exaltation, etc. in v2 |
