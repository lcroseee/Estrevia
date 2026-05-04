# Cluster D — Email Retention Design

**Status:** Specced (not implemented)
**Date:** 2026-05-03
**Source:** May-3 audit, Cluster D (items #6, #7, #9; #8 push expansion deferred to its own spec)

## Goal

Close the Day 0 activation gap and stand up a retention email channel by shipping four production-grade emails on a shared template + idempotency + suppression infrastructure:

1. **Welcome email** (#6) — on Clerk `user.created`, onboarding-aware CTA
2. **Purchase confirmation** (#7a) — on Stripe `customer.subscription.created`
3. **Subscription canceled** (#7b) — on Stripe `customer.subscription.deleted`
4. **Account deletion confirmation** (#7c) — on Clerk `user.deleted`
5. **Re-engagement at 28d** (#9) — daily cron, single email per ~90d window

Plus existing `trial_ending` email migrated to the same template engine for consistency.

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Email format = react-email (`@react-email/components`) with HTML + auto-generated plaintext fallback | Brand impression for first paying touch; Resend's recommended path; component reuse via `EmailLayout`/`Button`. |
| 2 | i18n = single template per email with `STRINGS = { en, es }` object + `locale` prop | Templates are short; one structure guaranteed identical between locales; simple migration to next-intl JSON later if volume grows. |
| 3 | Locale capture = `unsafeMetadata.locale` passed at Clerk sign-up; webhook reads `data.unsafe_metadata.locale` and writes to `users.locale` | EN/ES launch makes correct-locale welcome critical; one-line addition to sign-up form; webhook becomes self-contained. |
| 4 | Suppression = single boolean `users.marketing_email_opt_in` (default true), HMAC-signed `/unsubscribe?token=` link | Only one marketing email in scope (#9); per-category preferences = YAGNI; one-click unsubscribe satisfies Gmail/Yahoo 2024 requirements. |
| 5 | Idempotency = `sent_emails` table with partial UNIQUE index on `(user_id, email_type)` for one-shot types; pre-query `sent_at >= now() - INTERVAL` for repeatable | DB-layer dedup for welcome / account_deletion (Clerk retries are common); query-then-send for purchase / cancellation / re-engagement (legitimately repeat per cycle). |
| 6 | `lastSeenAt` tracking = throttled middleware update (skip if last write < 24h ago) | Catches all engagement (any authed page hit, not just sign-in or specific actions); 1 DB write per 24h per user is acceptable cost. |
| 7 | Re-engagement window = 28d (one sidereal lunar cycle) | Astrology-aligned; longer than B2C standard 14d to avoid alerting users who are simply waiting for the next moon event. |
| 8 | Re-engagement = single email at 28d, no sequence | YAGNI MVP; measure open/click rate before designing 60d / 90d follow-ups. |
| 9 | Re-engagement content = generic ("we miss you, here's what's new") with `/chart` CTA — not personalized | Personalization (decrypt birthDate in cron context, compute upcoming transit) introduces PII risk + complexity; can ship as v2 once base loop validates. |
| 10 | Resend `bounce` / `complaint` webhook → `users.email_undeliverable = true` | Mandatory for marketing-volume sender reputation; without this, re-engagement at scale degrades domain quickly. |
| 11 | `List-Unsubscribe` headers on all emails (transactional → `/settings`; marketing → `/unsubscribe?token=...`) | Gmail/Yahoo 2024 deliverability rules require it; transactional links to settings (not opt-out, since transactional is contract performance). |
| 12 | Resend `idempotencyKey` field on every send call as belt-and-suspenders alongside DB dedup | Two-layer protection: DB UNIQUE catches our retries, Resend key catches Resend retries; key shape = `${userId}:${emailType}:${windowStart}`. |

## Architecture

```
Sign-up flow:
  /sign-up form → Clerk.signUp.create({ unsafeMetadata: { locale } })
    → Clerk webhook user.created hits /api/webhooks/clerk
    → Insert users row with locale from unsafe_metadata
    → INSERT into sent_emails (userId, 'welcome') ON CONFLICT DO NOTHING
    → If insert reported 1 row → render WelcomeEmail.tsx → Resend send
    → If insert reported 0 rows (conflict) → idempotent skip
    → trackServerEvent(USER_REGISTERED, EMAIL_SENT)

Stripe webhook (existing /api/webhooks/stripe extended):
  customer.subscription.created (free → Pro):
    → Render PurchaseConfirmationEmail
    → Resend send with idempotencyKey = `${userId}:purchase:${subscriptionId}`
    → INSERT sent_emails (userId, 'purchase_confirmation')
  customer.subscription.deleted:
    → Render SubscriptionCanceledEmail (with access-end date)
    → Resend send with idempotencyKey = `${userId}:cancel:${subscriptionId}`
    → INSERT sent_emails (userId, 'subscription_canceled')

Clerk webhook user.deleted (existing extended):
  Read users.email + users.locale BEFORE deletion
  → Render AccountDeletionEmail
  → Resend send (idempotencyKey = `${userId}:deletion`)
  → DB cascade deletes user (sent_emails CASCADE deletes too — that's fine; the send already happened)

Resend bounce/complaint webhook (NEW /api/webhooks/resend):
  Verify svix signature
  → On `email.bounced` (hard) / `email.complained` → UPDATE users SET email_undeliverable = true WHERE email = ?
  → Soft bounces: log only; do not suppress (transient failures)

Re-engagement cron (NEW /api/cron/re-engagement, daily 09:00 UTC):
  SELECT users where:
    - last_seen_at BETWEEN now()-56d AND now()-28d
    - marketing_email_opt_in = true
    - email_undeliverable = false
    - NOT EXISTS (sent_emails WHERE email_type='re_engagement_28d' AND sent_at > now()-90d)
  For each: render ReEngagementEmail → Resend send → INSERT sent_emails

Middleware (existing src/middleware.ts):
  On authed request — if users.last_seen_at IS NULL OR last_seen_at < now()-24h:
    UPDATE users SET last_seen_at = now() WHERE id = ?
  (Guarded by single SELECT lastSeenAt before write — keeps to 1 SELECT + 0/1 UPDATE per request)

Unsubscribe page (NEW /unsubscribe?token=...):
  Verify HMAC-signed JWT (userId + 30d expiry, signed with EMAIL_UNSUBSCRIBE_SECRET)
  → UPDATE users SET marketing_email_opt_in = false
  → Show "Unsubscribed. You can resubscribe in /settings"
  Resubscribe via /settings → existing pattern (PUT /api/v1/user/account)
```

### Trial-ending email migration

The existing `sendTrialEndingEmail` in `src/shared/lib/email.ts` is plaintext and called from the Stripe webhook. As part of this work it migrates to:
- New `TrialEndingEmail.tsx` (react-email)
- Same call site, new helper `sendTrialEndingEmail({ userId, email, locale, trialEnd })`
- `INSERT sent_emails (userId, 'trial_ending')` for audit; not deduped (allowed to repeat per trial cycle, though in practice trial happens once)

## Data model

### Users table additions (4 columns)

```typescript
// In src/shared/lib/schema.ts users table
locale: text('locale', { enum: ['en', 'es'] }).notNull().default('en'),
lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
marketingEmailOptIn: boolean('marketing_email_opt_in').notNull().default(true),
emailUndeliverable: boolean('email_undeliverable').notNull().default(false),
```

### New `sent_emails` table

```typescript
export const sentEmails = pgTable('sent_emails', {
  id: serial('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  emailType: text('email_type', {
    enum: [
      'welcome',
      'purchase_confirmation',
      'subscription_canceled',
      'account_deletion',
      'trial_ending',
      're_engagement_28d',
    ],
  }).notNull(),
  resendMessageId: text('resend_message_id'),
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('sent_emails_oneshot_idx')
    .on(table.userId, table.emailType)
    .where(sql`${table.emailType} IN ('welcome', 'account_deletion')`),
  index('sent_emails_user_type_idx')
    .on(table.userId, table.emailType, table.sentAt),
]);
```

### Migration file

```sql
-- migrations/NNNN_email_retention.sql
ALTER TABLE users
  ADD COLUMN locale text NOT NULL DEFAULT 'en',
  ADD COLUMN last_seen_at timestamp with time zone,
  ADD COLUMN marketing_email_opt_in boolean NOT NULL DEFAULT true,
  ADD COLUMN email_undeliverable boolean NOT NULL DEFAULT false;

ALTER TABLE users ADD CONSTRAINT users_locale_check
  CHECK (locale IN ('en', 'es'));

CREATE TABLE sent_emails (
  id serial PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_type text NOT NULL,
  resend_message_id text,
  sent_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX sent_emails_oneshot_idx
  ON sent_emails (user_id, email_type)
  WHERE email_type IN ('welcome', 'account_deletion');

CREATE INDEX sent_emails_user_type_idx ON sent_emails (user_id, email_type, sent_at DESC);
```

## Components / File structure

```
src/
  emails/                                          # NEW (react-email templates)
    components/
      EmailLayout.tsx                              # shared header (Estrevia wordmark) + footer
                                                   # footer includes physical address (CAN-SPAM) + unsubscribe link
      Button.tsx                                   # CTA button (gold gradient brand-aligned)
    WelcomeEmail.tsx                               # #6 — onboarding-aware
    PurchaseConfirmationEmail.tsx                  # #7a
    SubscriptionCanceledEmail.tsx                  # #7b
    AccountDeletionEmail.tsx                       # #7c
    ReEngagementEmail.tsx                          # #9
    TrialEndingEmail.tsx                           # MIGRATE existing plaintext

  shared/lib/
    email.ts                                       # MODIFIED — replace ad-hoc senders with:
                                                   #   sendWelcomeEmail({ userId, email, locale, hasSavedChart })
                                                   #   sendPurchaseConfirmation(...)
                                                   #   sendSubscriptionCanceled(...)
                                                   #   sendAccountDeletion(...)
                                                   #   sendTrialEnding(...)
                                                   #   sendReEngagement(...)
                                                   # Each: render via @react-email/render → Resend send → log
    sent-emails.ts                                 # NEW — `tryInsertOneShot(userId, type)` → boolean
                                                   #       `recordSent(userId, type, resendMessageId)`
                                                   #       `wasSentWithin(userId, type, intervalMs)` → boolean
    unsubscribe-token.ts                           # NEW — HMAC sign/verify (jose or built-in crypto.subtle)
                                                   #       payload = { sub: userId, exp: now+30d }
                                                   #       secret from process.env.EMAIL_UNSUBSCRIBE_SECRET
    schema.ts                                      # MODIFIED — add columns + sent_emails table

  app/
    api/
      webhooks/
        clerk/route.ts                             # MODIFIED — fire welcome on user.created
                                                   #            fire account_deletion on user.deleted (read email/locale FIRST)
        stripe/route.ts                            # MODIFIED — purchase + cancellation handlers
                                                   #            (extend existing trial_will_end logic)
        resend/route.ts                            # NEW — bounce/complaint handler
                                                   #       svix signature verify (Resend uses svix too)
      cron/
        re-engagement/route.ts                     # NEW — daily 09:00 UTC
                                                   #       protected by CRON_SECRET (existing pattern)

    [locale]/
      (marketing)/
        unsubscribe/
          page.tsx                                 # NEW — server component
                                                   #       reads ?token, verifies, updates DB, renders status
      (app)/
        settings/
          SettingsClientSections.tsx               # MODIFIED — new "Email preferences" section
                                                   #            single toggle: "Receive marketing emails"
                                                   #            wired to PUT /api/v1/user/account
        sign-up/
          [[...rest]]/
            page.tsx                               # MODIFIED — add `unsafeMetadata={{ locale }}` to <SignUp />

  middleware.ts                                    # MODIFIED — throttled lastSeenAt update inside Clerk middleware

vercel.json                                        # MODIFIED — add cron entry:
                                                   #   { "path": "/api/cron/re-engagement",
                                                   #     "schedule": "0 9 * * *" }
```

### Email helper signature (representative — `email.ts`)

```typescript
import { render } from '@react-email/render';
import { Resend } from 'resend';
import { tryInsertOneShot, recordSent } from './sent-emails';
import WelcomeEmail from '@/emails/WelcomeEmail';

export async function sendWelcomeEmail(params: {
  userId: string;
  email: string;
  locale: 'en' | 'es';
  hasSavedChart: boolean;
}): Promise<{ sent: boolean; reason?: string }> {
  // 1. DB-layer dedup (welcome is one-shot per user)
  const inserted = await tryInsertOneShot(params.userId, 'welcome');
  if (!inserted) return { sent: false, reason: 'already_sent' };

  // 2. Render
  const html = await render(WelcomeEmail({ locale: params.locale, hasSavedChart: params.hasSavedChart }));
  const text = await render(WelcomeEmail({ locale: params.locale, hasSavedChart: params.hasSavedChart }), {
    plainText: true,
  });

  // 3. Send (Resend idempotencyKey = belt-and-suspenders)
  const resend = getResend();
  const result = await resend.emails.send({
    from: 'Estrevia <hello@estrevia.app>',
    to: params.email,
    subject: STRINGS_SUBJECTS.welcome[params.locale],
    html,
    text,
    headers: {
      'List-Unsubscribe': `<${SITE_URL}/${params.locale === 'es' ? 'es/' : ''}settings>`,
    },
    idempotencyKey: `${params.userId}:welcome`,
  });

  // 4. Record Resend message ID (best-effort)
  if (result.data?.id) {
    await recordSent(params.userId, 'welcome', result.data.id);
  }
  return { sent: true };
}
```

## Email content specifications (i18n strings)

For each template, the `STRINGS = { en, es }` map covers:
- Subject line
- Preview text (`<Preview>` from react-email — appears next to subject in inbox)
- Heading
- Body paragraphs
- CTA button label
- Footer signature

Spanish = neutro LATAM, `tú` form (per project memory).

### Welcome (#6) — onboarding-aware variant

EN subject: `Welcome to Estrevia — your sidereal chart awaits`
ES subject: `Bienvenido a Estrevia — tu carta sideral te espera`

Body — two branches based on `hasSavedChart`:
- **If `hasSavedChart=true`:** "Your natal chart is ready. Open it to see your sidereal Sun, Moon, and rising sign with Lahiri ayanamsa interpretations." CTA: `Open your chart` → `/chart`
- **If `hasSavedChart=false`:** "Estrevia uses Lahiri sidereal — the system that aligns with the actual sky, not the calendar. Create your first chart in 30 seconds." CTA: `Create your first chart` → `/`

Both: closing line about `/essays/sidereal-vs-tropical` for the curious.

### Purchase confirmation (#7a)

EN subject: `Welcome to Estrevia Pro`
ES subject: `Bienvenido a Estrevia Pro`

Body: "You're in. Here's what unlocks: 240+ essays, full moon calendar with Void-of-Course, planetary hours table, unlimited synastry, AI tarot, personalized Tree of Life. Plan: [Pro Monthly / Pro Annual]. Next charge: [date]."

CTA: `Open your dashboard` → `/`

### Subscription canceled (#7b)

EN subject: `Your Estrevia Pro subscription has been canceled`
ES subject: `Tu suscripción a Estrevia Pro ha sido cancelada`

Body: "Cancellation confirmed. Your Pro access continues until [accessEndDate] — keep using everything until then. You'll automatically move to the free plan after that. Reactivate any time from /settings."

CTA: `Manage subscription` → `/settings`

### Account deletion confirmation (#7c)

EN subject: `Your Estrevia account has been deleted`
ES subject: `Tu cuenta de Estrevia ha sido eliminada`

Body: "Confirming your account, charts, and personal data have been deleted from our systems. This is permanent — we don't keep backups of personal data per our retention policy. Thank you for trying Estrevia."

No CTA (this is a goodbye email).

### Re-engagement at 28d (#9) — generic

EN subject: `Estrevia misses you — your chart is still here`
ES subject: `Estrevia te extraña — tu carta sigue aquí`

Body: "It's been a few weeks. Since you last visited, the Moon has moved through several signs and the planetary hour table has refreshed daily. Your chart and saved data are exactly where you left them."

CTA: `Open your chart` → `/chart`

Footer (mandatory for marketing): unsubscribe link with signed token.

### Trial-ending (existing, migrated)

Subject (existing): `Your Estrevia Pro trial ends tomorrow` / `Tu prueba gratuita de Estrevia Pro termina mañana`

Body: same content as current plaintext, formatted via react-email.

## Data flow — error handling per surface

| Surface | Failure mode | Behavior |
|---------|--------------|----------|
| Clerk webhook welcome send | Resend API error | Catch, log to Sentry with `{ userId, email_type: 'welcome' }`, return 200 to Clerk (don't retry the webhook — sent_emails is already locked, retry would skip; we just lose the email) |
| Clerk webhook welcome send | Resend rate limit | Same as above (200 to Clerk) — the welcome may not arrive but webhook flow continues; user can ask support |
| Stripe webhook purchase send | DB error before send | Stripe webhook returns 500 → Stripe retries → idempotent (Resend key prevents double send) |
| Stripe webhook purchase send | Resend error | Log to Sentry, return 200 to Stripe; user has paid, email is best-effort |
| Resend bounce webhook | Bad signature | Return 401 |
| Resend bounce webhook | DB error | Return 500 → Resend retries |
| Re-engagement cron | Resend rate limit (300/sec free tier, more on paid) | Process in chunks of 50 with 1s delay; remainder picked up next day |
| Re-engagement cron | Single user send fails | Log to Sentry, continue with next user, do NOT INSERT sent_emails for that user (so they retry next day) |
| Middleware lastSeenAt update | DB error | Catch and ignore — middleware must not block requests for analytics writes |
| Unsubscribe page | Invalid/expired token | Render "Link expired. Manage preferences in /settings" (no error stack) |

## Testing

| Surface | Test type | Coverage |
|---------|-----------|----------|
| Email templates (each .tsx) | Snapshot test | Render with `locale=en` and `locale=es`; assert HTML contains expected key strings; assert plaintext fallback generates non-empty |
| `sent-emails.ts` `tryInsertOneShot` | Unit + integration | First call → returns true; second call → returns false (UNIQUE conflict); test for both 'welcome' and 'account_deletion' (the indexed types) |
| `sent-emails.ts` `wasSentWithin` | Integration | Insert row at t-100d → `wasSentWithin(userId, 're_engagement_28d', 90d)` returns false; insert row at t-30d → returns true |
| `unsubscribe-token.ts` | Unit | sign/verify roundtrip; verify rejects expired (>30d); verify rejects bad signature; verify rejects malformed |
| Welcome flow | Integration (mock Clerk + Resend) | webhook user.created with `unsafe_metadata.locale='es'` → users row has locale='es'; Resend mock called once with `to: email`, with HTML containing "Bienvenido"; second invocation does not call Resend (dedup) |
| Welcome flow | Integration | webhook user.created without unsafe_metadata.locale → users.locale defaults to 'en'; welcome sent in EN |
| Welcome flow (onboarding-aware) | Integration | If user has saved chart row → email contains "Open your chart"; if not → email contains "Create your first chart" |
| Stripe purchase flow | Integration | subscription.created event → users.subscription_tier updated AND PurchaseConfirmation rendered with correct plan name |
| Stripe cancel flow | Integration | subscription.deleted event → SubscriptionCanceled email rendered with correct accessEndDate from currentPeriodEnd |
| Account deletion flow | Integration | user.deleted webhook → AccountDeletion email sent BEFORE DB cascade delete (test ordering with spy) |
| Resend webhook | Integration | bounce event for known email → users.email_undeliverable=true; bad signature → 401 |
| Re-engagement cron | Integration | Seed users at 30d, 50d, 60d inactivity; users at 30d and 50d should be candidates; user at 60d should be skipped (outside window); marketingEmailOptIn=false → skipped; emailUndeliverable=true → skipped; recent re_engagement send → skipped |
| Re-engagement cron auth | Integration | No CRON_SECRET → 500; bad bearer → 401; valid → 200 |
| Middleware lastSeenAt | Integration | Authed request → lastSeenAt updated; second request within 24h → no DB write (verify mock); 25h later → updated |
| Unsubscribe page | Integration | Valid token → marketing_email_opt_in=false; expired token → "expired" message rendered; bad token → same; non-existent userId → same |
| Settings page | E2E | Toggle "Receive marketing emails" off → next re-engagement cron run skips this user |

Reference: existing test patterns in `src/app/api/webhooks/clerk/__tests__/`, vitest 4.x with `vi.mock` for Resend.

## Risks

| ID | Risk | Mitigation |
|----|------|------------|
| R1 | Resend domain reputation degrades from re-engagement at scale without bounce/complaint handling | Decision #10 (Resend webhook → email_undeliverable). Block scheduled in spec; cannot ship re-engagement cron without this. |
| R2 | Welcome email arrives in wrong locale because user signed up via `/sign-up` (no locale prefix) and unsafeMetadata defaults to 'en' | Decision #3 catches `/es/sign-up` (the typical ES path). Edge case: user navigates from `/es/...` to root `/sign-up` — they get EN. Acceptable: same UX as web in general; users can switch locale post-signup. |
| R3 | Clerk retries `user.created` webhook → duplicate welcome email | Decision #5 (UNIQUE index on sent_emails for 'welcome' type). Tested in coverage row "Welcome flow / second invocation does not call Resend". |
| R4 | Stripe webhook fires `subscription.created` AND we already sent welcome (user upgrades same session as sign-up) | Welcome and purchase_confirmation are different email types — both legitimately fire. UX-acceptable: user gets two emails when they sign up + upgrade in one session. |
| R5 | Middleware lastSeenAt update creates DB hot-spot on `users` row | 24h throttle reduces to ≤1 update per user per day. Optionally store throttle state in Redis to avoid the SELECT (deferred — measure first). |
| R6 | Re-engagement cron runs slow with 100k users | Daily cron has 5-minute Vercel timeout (Fluid Compute Pro). Process in chunks; if scale becomes an issue, switch to Vercel Queues. Not relevant at MVP scale. |
| R7 | Unsubscribe token leaks via referrer header → attacker unsubscribes user | One-click POST per RFC 8058: `List-Unsubscribe-Post: List-Unsubscribe=One-Click` requires POST with body `List-Unsubscribe=One-Click`. Email clients (Gmail/Yahoo) issue POST. Direct GET click also works (lower bar). Cost of mistake = false unsubscribe; user can resubscribe via /settings. Acceptable. |
| R8 | Test fixtures could leak real emails to Resend | Mock Resend client in all tests via `vi.mock('resend', ...)`. Existing pattern in repo. |
| R9 | `sent_emails` cascade-deletes on user delete → loses audit trail | Acceptable: user.deleted means GDPR deletion; their email history must also be removed. Account-deletion email itself is sent BEFORE the cascade (Decision in account deletion flow). |
| R10 | Migration window: existing users have `locale=NULL` post-migration | DEFAULT 'en' on column ensures backfill at migration time. ES users who already exist will get future emails in EN until they update settings (acceptable for MVP). |

## Out of scope

- **Push expansion (#8)** — empty `/api/cron/notifications` body, ingress, eclipse, retrograde, void-of-course alerts. Separate spec at `2026-XX-XX-push-astrology-events-design.md`.
- **Lifecycle / engagement emails** — chart-saved, synastry-completed, avatar-generated, cosmic-passport-share, weekly-digest, birthday/solar-return. Future spec.
- **Personalized re-engagement** (Vol. 2) — decrypt birthDate, compute upcoming transits, include in email body. Requires PII handling in cron context.
- **Re-engagement sequence** — 60d / 90d follow-ups after the 28d email. Will validate single-email open/click rate first.
- **Per-category email preferences** — one master `marketing_email_opt_in` flag is enough for MVP. Granular toggles when we have ≥3 marketing email types.
- **Resend Audiences API** — we manage opt-in state in our DB rather than syncing to Resend's external audience list.
- **Soft-bounce retry policy** — only hard bounces and complaints suppress users.
- **Email A/B testing infrastructure** — no subject-line splits or template variants in MVP.
- **Localized FROM names** — `Estrevia <hello@estrevia.app>` in all locales (no `Estrevia <hola@estrevia.app>` for ES).

## Files affected

| Component | Files Created | Files Modified |
|-----------|---------------|----------------|
| Email templates | `src/emails/components/{EmailLayout,Button}.tsx`, `src/emails/{Welcome,PurchaseConfirmation,SubscriptionCanceled,AccountDeletion,ReEngagement,TrialEnding}Email.tsx` | — |
| Email lib | `src/shared/lib/sent-emails.ts`, `src/shared/lib/unsubscribe-token.ts` | `src/shared/lib/email.ts`, `src/shared/lib/schema.ts` |
| API webhooks | `src/app/api/webhooks/resend/route.ts` | `src/app/api/webhooks/clerk/route.ts`, `src/app/api/webhooks/stripe/route.ts` |
| API cron | `src/app/api/cron/re-engagement/route.ts` | — |
| Pages | `src/app/[locale]/(marketing)/unsubscribe/page.tsx` | `src/app/[locale]/(app)/settings/SettingsClientSections.tsx`, `src/app/[locale]/sign-up/[[...rest]]/page.tsx` |
| Middleware | — | `src/middleware.ts` |
| Config | — | `vercel.json` |
| Migrations | `drizzle/migrations/NNNN_email_retention.sql` (auto-generated by `npm run db:generate`) | — |
| Env | — | `.env.example` (add `EMAIL_UNSUBSCRIBE_SECRET`, `RESEND_WEBHOOK_SECRET`) |

## Parallelization safety

Tasks decompose into 5 disjoint scopes that can run in parallel:

| Task | Scope |
|------|-------|
| T1 — Schema + migration | `src/shared/lib/schema.ts`, generated migration file. Blocking for T2-T5 (they import schema). |
| T2 — Email infrastructure | `src/emails/components/`, `src/emails/*Email.tsx`, `src/shared/lib/{email,sent-emails,unsubscribe-token}.ts` |
| T3 — Welcome + account deletion + Stripe purchase/cancel webhook hooks | `src/app/api/webhooks/{clerk,stripe}/route.ts`, sign-up page locale capture |
| T4 — Re-engagement cron + middleware lastSeenAt + Resend webhook | `src/app/api/cron/re-engagement/route.ts`, `src/middleware.ts`, `src/app/api/webhooks/resend/route.ts`, `vercel.json` |
| T5 — Unsubscribe page + settings toggle | `src/app/[locale]/(marketing)/unsubscribe/page.tsx`, `src/app/[locale]/(app)/settings/SettingsClientSections.tsx`, `PUT /api/v1/user/account` extension |

T1 must complete before T2-T5. T2-T5 are mutually independent.

## Open follow-ups (not blocking)

- Add Sentry breadcrumbs to email send paths for observability
- Add a `/api/admin/emails/send-test` route for QA preview (Clerk allowlist auth)
- Track Resend `email.opened` / `email.clicked` events to PostHog for funnel analysis
- Consider Resend Audiences sync for future volume ≥10k subscribers
