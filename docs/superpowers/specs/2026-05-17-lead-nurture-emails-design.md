# Lead Nurture Emails — Design Spec

**Date:** 2026-05-17
**Author:** Kirill (founder) + Claude (audit/spec)
**Status:** approved, ready for implementation plan
**Predecessor:** [Advertising audit 2026-05-17](../../../memory/project_advertising_audit_2026_05_17.md) (Sev1 finding: 21 leads / 30d → 0 nurture emails → broken email-gate promise)

## Problem

The hard email-gate on the landing page (shipped 2026-05-07) captures emails *and* promises in the consent text:

> "By submitting, you agree to receive **your chart** and occasional astrology insights. Unsubscribe anytime."

`POST /api/v1/leads` writes the row to `email_leads` and fires server CAPI Lead — but no email is ever sent. Data from the past 30 days: **21 captured leads, 0 outbound emails, 0 lead→user conversions** (`convertedToUserId` is never written). This breaks the explicit consent promise and leaks the entire above-paywall funnel.

## Goal

Implement a 3-email drip that:

1. Honors the email-gate promise (T+0 chart preview)
2. Walks the lead toward `users` table creation (T+24h sign-up nudge)
3. Walks the new user toward paid (T+72h AI reading teaser + trial CTA)

**Success criterion:** within 14 days of ship, observe ≥10% lead→user conversion (was 0% in baseline period) and ≥1 attributed paid sub from a nurtured lead.

## Non-goals

- Welcome email for users (already exists: `sendWelcomeEmail` in `src/shared/lib/email.ts`)
- Re-engagement past 72h (`re_engagement_28d` already handles dormant users)
- Embedded chart images / PNG generation (defer to follow-up spec — adds 1-2 days work; Outlook PNG rendering edge cases)
- New i18n messages beyond what's needed for the 3 emails (reuse existing `chartReading.*` and `paywall.*` keys where possible)
- Marketing platform integration (no Mailchimp/Sendgrid; stay on Resend)
- A/B testing infrastructure for email subject/body (single version per locale to start)

## Schema changes

Migration `0011_lead_nurture.sql`:

```sql
-- Extend email_leads with nurture state
ALTER TABLE email_leads ADD COLUMN nurture_step smallint NOT NULL DEFAULT 0;
ALTER TABLE email_leads ADD COLUMN nurture_next_at timestamptz;
ALTER TABLE email_leads ADD COLUMN email_undeliverable boolean NOT NULL DEFAULT false;

-- Cron-optimized partial index for "due" candidates
CREATE INDEX email_leads_nurture_due_idx
  ON email_leads(nurture_next_at)
  WHERE nurture_step < 3
    AND converted_to_user_id IS NULL
    AND unsubscribed_at IS NULL
    AND email_undeliverable = false;

-- Mirrors sent_emails but FK to email_leads (no users FK)
CREATE TABLE sent_lead_emails (
  id serial PRIMARY KEY,
  lead_id text NOT NULL REFERENCES email_leads(id) ON DELETE CASCADE,
  email_type text NOT NULL,
  resend_message_id text,
  sent_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX sent_lead_emails_oneshot_idx
  ON sent_lead_emails(lead_id, email_type);
CREATE INDEX sent_lead_emails_lead_id_idx ON sent_lead_emails(lead_id);
```

`email_leads.converted_to_user_id`, `converted_at`, `unsubscribed_at` already exist (pre-staged in `src/shared/lib/schema.ts:497-516`).

**State machine** (`nurture_step` semantics):
- `0` — lead created, T+0 send not yet completed
- `1` — T+0 sent, T+24h pending
- `2` — T+24h sent, T+72h pending
- `3` — T+72h sent, drip done

`nurture_next_at` is the timestamp the cron uses to find due leads. After T+0 success: `NOW() + 24h`. After T+24h success: `NOW() + 48h` (= T+72h from original capture). After T+72h success: `NULL` (terminal).

## Components

### React Email templates (`src/emails/`)

All follow existing pattern (see `WelcomeEmail.tsx`, `ReEngagementEmail.tsx`): import `@react-email/components`, accept `{locale, ...vars}`, return JSX, use `EmailLayout`.

1. **`LeadChartEmail.tsx`** — T+0
   - Subject EN: "Your sidereal chart is ready ✦"
   - Subject ES: "Tu carta sideral está lista ✦"
   - Body: Sun/Moon/Asc one-liners (reuses `chartReading.teaserSun/Moon/Ascendant` i18n keys + `signOneLiners.<Sign>`) + CTA button "See your full chart" → `/{locale}/chart?chartId={chartId}&utm_source=lead-nurture&utm_campaign=t0`

2. **`LeadMoonAscEmail.tsx`** — T+24h
   - Subject EN: "Your Moon in {sign} — what it means"
   - Subject ES: "Tu Luna en {sign} — qué significa"
   - Body: deeper Moon section (mood, emotional patterns) + Asc (rising, first impression) + CTA "Save your chart — create free account" → `/{locale}/sign-up?return=/chart?chartId={chartId}&utm_source=lead-nurture&utm_campaign=t24`

3. **`LeadPaywallTeaserEmail.tsx`** — T+72h
   - Subject EN: "The full reading for your {sun}-{moon}-{asc} chart"
   - Subject ES: "La lectura completa para tu carta {sun}-{moon}-{asc}"
   - Body: AI reading eyebrow + locked preview text (reuses `paywall.cta.subline.natalChart`) + CTA "Start 3-day free trial" → `/{locale}/checkout/start?plan=pro_annual&return=/chart?chartId={chartId}&utm_source=lead-nurture&utm_campaign=t72`

All emails: standard `EmailLayout` (logo, footer), `List-Unsubscribe` header, footer unsubscribe link via lead-kind token, locale-aware date formatting where applicable.

**Time-unknown chart handling:** when lead's chart was calculated with `knowsBirthTime=false` (no time → no houses → no Ascendant), templates omit Asc lines:
- T+0: Sun + Moon only (skip Asc one-liner)
- T+24h: subject becomes "Your Moon in {sign}" (drop Asc), body has Moon insight only
- T+72h: subject becomes "The full reading for your {sun}-{moon} chart" (no asc segment); body and CTA unchanged

**Missing chart handling** (when `natalCharts` row TTL'd despite cleanup-cron protection — defensive fallback): templates render generic copy without `{sign}` interpolation, CTA still links to `/{locale}/chart` (chart-less landing). Sender function passes `chart: null` to template; template branches.

### Send functions (`src/shared/lib/email.ts`)

Three new exports following existing `sendWelcomeEmail` pattern:

```ts
export async function sendLeadChartEmail(params: {
  leadId: string;
  email: string;
  locale: 'en' | 'es';
  chart: ChartResult | null;  // null = chart cleaned up → fallback copy
  chartId: string | null;
}): Promise<{ sent: boolean; reason?: string }>;

// Same signature for sendLeadMoonAscEmail and sendLeadPaywallTeaserEmail.
```

Internal flow (mirroring `sendWelcomeEmail`):
1. `tryInsertOneShotLead(leadId, emailType)` → ON CONFLICT DO NOTHING into `sent_lead_emails`. If existing → return `{sent: false, reason: 'already_sent'}`.
2. Build unsubscribe URL via new `signLeadUnsubscribeToken(leadId)`.
3. Render React Email template (both HTML + plaintext via `render(... {plainText: true})`).
4. `getResend().emails.send({from, to, subject, html, text, headers: {'List-Unsubscribe': '<...>'}}, {idempotencyKey: '${leadId}:${emailType}'})`.
5. `recordSentLead(leadId, emailType, result.data?.id)`.
6. Return `{sent: true}`.

Failure modes: any Resend error → re-thrown to caller (cron loop catches per-lead). `tryInsertOneShot` runs BEFORE Resend send to ensure even partial-failure case doesn't double-send on retry.

### Unsubscribe token generalization (`src/shared/lib/unsubscribe-token.ts`)

Current token payload: `${userId}.${exp}`. Generalize to: `${kind}.${id}.${exp}` where `kind ∈ {'user', 'lead'}`.

New exports:
- `signLeadUnsubscribeToken(leadId, ttlOverrideMs?)` — wraps existing `sign` with kind='lead'
- `verifyUnsubscribeToken(token)` returns `{ok: true, kind: 'user'|'lead', id: string}` (or current failure variants)
- Backwards-compat: tokens without `.` between kind and id default to `kind='user'` (existing tokens in the wild keep working until 30d TTL expires)

### Unsubscribe endpoint (`src/app/[locale]/(marketing)/unsubscribe/page.tsx`)

Existing route already verifies token + sets `users.marketingEmailOptIn = false`. Extend to handle `kind='lead'`:
- If kind=user → existing flow (no change)
- If kind=lead → `UPDATE email_leads SET unsubscribed_at = NOW() WHERE id = $1`
- UI: same "you have been unsubscribed" confirmation page (no behavioral difference visible to user)

### `/api/v1/leads` route change

After successful `wasNew=true` insert, queue T+0 send via Vercel `waitUntil`:

```ts
import { waitUntil } from '@vercel/functions';

// existing insert + analytics fire...

if (wasNew) {
  // existing trackServerEvent(...)

  // NEW: queue T+0 send (fire-and-forget)
  waitUntil((async () => {
    try {
      // chartId is optional on /api/v1/leads schema — handle both
      const chart = input.chartId ? await fetchTempChart(input.chartId) : null;
      const res = await sendLeadChartEmail({
        leadId, email: input.email, locale: input.locale,
        chart, chartId: input.chartId ?? null,
      });
      if (res.sent) {
        await db.update(emailLeads)
          .set({ nurtureStep: 1, nurtureNextAt: new Date(Date.now() + 24 * 3600 * 1000) })
          .where(eq(emailLeads.id, leadId));
      }
    } catch (err) {
      const { captureException } = await import('@sentry/nextjs');
      captureException(err, { tags: { component: 'lead-nurture-t0', leadId } });
      // Cron T+0 recovery branch will pick this lead up within 1h.
    }
  })());
}
```

Response goes back to client in <200ms (insert + analytics fire); send happens in background after response is sent.

### Cron `/api/cron/lead-nurture/route.ts`

Vercel Cron, hourly (`0 * * * *`), CRON_SECRET auth via `assertCronAuth` (existing helper). Pattern mirrors `re-engagement` cron.

```ts
SELECT id, email, locale, chart_id, nurture_step, created_at
FROM email_leads
WHERE nurture_step < 3
  AND converted_to_user_id IS NULL
  AND unsubscribed_at IS NULL
  AND email_undeliverable = false
  AND (
    -- T+0 recovery: stuck step=0 from waitUntil failure
    (nurture_step = 0 AND created_at < NOW() - INTERVAL '15 minutes' AND nurture_next_at IS NULL)
    -- Step 1→2 (T+24h) and 2→3 (T+72h)
    OR (nurture_next_at IS NOT NULL AND nurture_next_at <= NOW())
  )
LIMIT 100
```

Loop body:
- Fetch chart from `natal_charts` (may be null if TTL'd; templates handle)
- Switch on `nurture_step` → dispatch to `sendLeadChartEmail` / `sendLeadMoonAscEmail` / `sendLeadPaywallTeaserEmail`
- On success: `UPDATE email_leads SET nurture_step = nurture_step + 1, nurture_next_at = <next>` where `<next>` is `NOW()+24h` after step 0, `NOW()+48h` after step 1, `NULL` after step 2
- On error: per-lead try/catch, log + Sentry, continue loop; lead remains eligible next hour
- Rate limit (Resend 10 req/sec): batch of 10 with `setTimeout(1100)` gap

Returns `{candidates: N, sent: X, failed: Y, durationMs}`. Auto-bootstrap defensiveness: if `email_leads` table doesn't exist (test env without migrations) → return 200 `{skipped: 'table missing'}` instead of 500.

### Clerk `user.created` webhook extension (`src/app/api/webhooks/clerk/route.ts`)

On `user.created` event, after creating the `users` row:

```ts
await db.update(emailLeads)
  .set({ convertedToUserId: clerkUserId, convertedAt: new Date() })
  .where(and(
    eq(emailLeads.email, primaryEmail.toLowerCase()),
    isNull(emailLeads.convertedToUserId),  // never overwrite a previous conversion
  ));
```

No-op if no matching lead. Stops nurture (cron filter excludes converted leads). Enables future lead→sub attribution queries.

### Resend webhook extension (`src/app/api/webhooks/resend/route.ts`)

On hard bounce / complaint events, in addition to existing `users.email_undeliverable` update, also update `email_leads`:

```ts
await db.update(emailLeads)
  .set({ emailUndeliverable: true })
  .where(eq(emailLeads.email, bouncedEmail.toLowerCase()));

// Complaint = also unsubscribe
if (eventType === 'email.complained') {
  await db.update(emailLeads)
    .set({ unsubscribedAt: new Date() })
    .where(eq(emailLeads.email, bouncedEmail.toLowerCase()));
}
```

Existing `users` updates unchanged; both can match same email (user + still-active lead record).

### `cleanup-temp-charts` cron constraint

Existing cron `src/app/api/cron/cleanup-temp-charts/route.ts` (runs daily at 03:00 UTC per `vercel.json`) deletes temp charts after TTL. Update its DELETE WHERE to skip charts referenced by active nurture leads:

```sql
-- Add this exclusion to the existing DELETE
AND NOT EXISTS (
  SELECT 1 FROM email_leads el
  WHERE el.chart_id = natal_charts.id
    AND el.nurture_step < 3
    AND el.converted_to_user_id IS NULL
    AND el.unsubscribed_at IS NULL
    AND el.created_at > NOW() - INTERVAL '7 days'
)
```

7-day window covers full nurture cycle (T+72h + slack). After 7d, chart can be cleaned up safely (templates fall back to generic copy).

## Data flow

```
Browser submits email-gate
  ↓
POST /api/v1/leads (wasNew=true)
  ↓
INSERT email_leads (nurture_step=0, nurture_next_at=NULL)
  ↓
Response 200 → waitUntil queues T+0 send
  ↓ (in background, ~500-2000ms)
SELECT natal_charts WHERE id=chartId
sendLeadChartEmail({leadId, chart, ...})
  ↓ INSERT sent_lead_emails (lead_id, 'lead_chart')
  ↓ Resend.emails.send(...)
  ↓ UPDATE email_leads SET nurture_step=1, nurture_next_at=NOW()+24h
  
(T+24h later, hourly cron sweep)
  ↓
SELECT email_leads WHERE nurture_step=1 AND nurture_next_at <= NOW() AND <eligibility>
  ↓ for each: sendLeadMoonAscEmail(...)
  ↓ UPDATE nurture_step=2, nurture_next_at=NOW()+48h

(T+72h, hourly cron)
  ↓
SELECT email_leads WHERE nurture_step=2 AND nurture_next_at <= NOW() AND <eligibility>
  ↓ for each: sendLeadPaywallTeaserEmail(...)
  ↓ UPDATE nurture_step=3, nurture_next_at=NULL

(In parallel, possibly any time)
  Clerk user.created → UPDATE converted_to_user_id, converted_at
  → cron filter excludes this lead from next sweep
  
  Resend hard bounce → UPDATE email_undeliverable=true
  → cron filter excludes
  
  Unsubscribe click → UPDATE unsubscribed_at=NOW()
  → cron filter excludes
```

## Error handling

(Detailed in design discussion; key points captured here.)

- **T+0 inline send failure**: Sentry log + cron recovery branch (`step=0 AND createdAt > 15min AND nextAt IS NULL`)
- **Cron run failure**: state-driven, next hour resumes
- **Per-lead error**: try/catch in loop, doesn't block other leads
- **Resend rate limit**: 10-batch with 1.1s gap
- **Race conditions**: idempotency via `sent_lead_emails(lead_id, email_type)` UNIQUE INDEX; convertedToUserId double-check before send
- **Missing chart data**: graceful fallback to non-personalized copy; cleanup cron excludes active-nurture charts for 7d
- **PII**: log `leadId` only, never email plaintext or birth data

## Testing

(Detailed above.) Coverage target: ≥85% on new files. Minimum bar:

- Unit: 3 send functions (happy + dedup + locale + fallback), token round-trip, cron candidate query
- Integration: /api/v1/leads waitUntil queueing, /api/cron/lead-nurture dispatch, /api/webhooks/clerk conversion linking, /api/webhooks/resend bounce
- Manual: send T+0/T+24/T+72 to founder's inbox before deploy; verify Outlook rendering + spam folder placement

## Environment + ops

**New env vars:** none. Reuses `RESEND_API_KEY`, `EMAIL_UNSUBSCRIBE_SECRET`, `CRON_SECRET`, `DATABASE_URL`, `SENTRY_DSN`.

**New Vercel Cron:** add to `vercel.json` (confirmed location, 10 existing crons registered there):
```json
{ "path": "/api/cron/lead-nurture", "schedule": "0 * * * *" }
```
Hourly to keep T+24h / T+72h timing within ±1h precision. T+0 is sync via `waitUntil` so cron only handles delayed steps + recovery.

**Migration deploy:** `0011_lead_nurture.sql` to prod via `npm run db:migrate`. Founder owes this push (in line with current pending 0007/0008/0010 from prior shipped projects).

**Resend domain:** already `hello@estrevia.app` from existing send functions; no DNS changes needed.

## Rollout

1. PR lands on `main` (per direct-to-main workflow)
2. Migration 0011 applied to prod DB
3. Vercel deploy includes cron registration
4. Founder verifies in Resend dashboard: T+0 email sends within ~1 min of test lead capture
5. 24h later: T+24h email arrives in inbox; 72h later: T+72h
6. Founder also smoke-tests: unsubscribe link, then re-submit email — verify `nurture_step` stays at 3 (no re-send), `unsubscribed_at` set
7. Monitor for 7 days: `email_leads.converted_to_user_id` should start populating; `nurture_step` distribution should look like a healthy funnel

## Out of scope (parking lot)

- Email template A/B testing
- Embedded chart PNG via `@vercel/og`
- Different drip cadences for paid-ad leads vs organic leads
- Welcome series for free signups (overlap with existing `WelcomeEmail` — may need consolidation later)
- Re-engagement at 14d / 30d for leads who never converted but didn't unsubscribe
- "Why didn't you convert?" survey email
- Resend "smart sending time" optimization
- Localized send time (e.g., 9am in user's local TZ) — defer until we have IP→TZ infra wired

## References

- Audit findings: `~/.claude/projects/-Users-kirillkovalenko-Documents-Projects-Estrevia/memory/project_advertising_audit_2026_05_17.md`
- Email-gate spec: `docs/superpowers/specs/2026-05-07-email-gate-design.md`
- Existing email infra: `src/shared/lib/email.ts`, `src/emails/`, `src/shared/lib/unsubscribe-token.ts`
- Existing cron pattern: `src/app/api/cron/re-engagement/route.ts`
- Schema: `src/shared/lib/schema.ts` (`emailLeads` at line 503, `sentEmails` at line 469)
