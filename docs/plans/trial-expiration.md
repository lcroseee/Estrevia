# Trial Expiration Email Sequence — Implementation Plan

_2026-05-24 | T2 | Backend agent_

---

## Task list

### T2.1 — DB migration: `sent_trial_emails` table
**File:** `drizzle/0014_trial_expiration_emails.sql`  
**Schema:** Add `sentTrialEmails` table to `src/shared/lib/schema.ts`

```sql
CREATE TABLE "sent_trial_emails" (
  "id" serial PRIMARY KEY,
  "subscription_id" text NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "step" text NOT NULL,
  "resend_message_id" text,
  "sent_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "sent_trial_emails_unique_idx" ON "sent_trial_emails" ("subscription_id", "step");
CREATE INDEX "sent_trial_emails_user_id_idx" ON "sent_trial_emails" ("user_id");
```

Tests: migration file lints (SQL); schema type inference test.

---

### T2.2 — `src/shared/lib/sent-trial-emails.ts`
Mirrors `sent-lead-emails.ts`:
- `tryInsertOneShotTrial(subscriptionId, step): Promise<TrialEmailClaim>`
- `recordSentTrial(subscriptionId, step, resendMessageId): Promise<void>`

Tests: mock DB, verify `new`/`retry`/`delivered` returns; verify `recordSentTrial` updates row.

---

### T2.3 — Email templates
**Files:**
- `src/emails/TrialReminder3dEmail.tsx`
- `src/emails/TrialReminder1dEmail.tsx`
- `src/emails/TrialEndedEmail.tsx`

Each template:
- Props typed
- EN copy (full)
- ES copy (structural stub, all strings marked `// TODO i18n`)
- Uses `EmailLayout` + `Button` components
- Renders `billingPortalUrl` as secondary text link

Tests: render to HTML without throwing; subject line resolves correctly for en/es.

---

### T2.4 — `src/shared/lib/trial-expiration-email.ts`
Single public function `sendTrialExpirationEmail(params)`:
1. DRY_RUN gate
2. `tryInsertOneShotTrial` → skip if 'delivered'
3. Route to correct template by `step`
4. Build URLs (proUrl, billingPortalUrl)
5. Resend send with idempotency key
6. `recordSentTrial`
7. Throw on `result.error`

Tests:
- DRY_RUN=true → returns `{sent: false, reason:'dry_run'}`, no Resend call
- 'delivered' claim → returns `{sent: false, reason:'already_sent'}`, no Resend call
- reminder_3d renders TrialReminder3dEmail subject
- trial_ended renders TrialEndedEmail subject + coupon code from env
- Resend error → throws (for Sentry capture)

---

### T2.5 — Webhook handler update
**File:** `src/app/api/webhooks/stripe/route.ts`

Replace the body of `customer.subscription.trial_will_end` case:
- Remove old `sendTrialEndingEmail` call
- Import + call `sendTrialExpirationEmail(..., step: 'reminder_3d', ...)`
- Wrap in try/catch (same pattern as other email calls in this handler)

Tests: `src/app/api/webhooks/stripe/__tests__/route.test.ts`
- `customer.subscription.trial_will_end` event → `sendTrialExpirationEmail` called once with step='reminder_3d'
- Invalid signature still returns 401
- Duplicate event (already in processedStripeEvents) returns 200 without calling email

---

### T2.6 — Cron endpoint: `/api/cron/trial-expiration`
**File:** `src/app/api/cron/trial-expiration/route.ts`

Logic:
1. Auth: `validateCronAuth(request)` (same helper as other crons)
2. Query users in `trialing` status with `trial_end IS NOT NULL`:
   - `reminder_1d` candidate: `trial_end` between `NOW()` and `NOW() + 26h`
   - `trial_ended` candidate: `trial_end` between `NOW() - 48h` and `NOW()`
3. For each candidate, LEFT JOIN `sent_trial_emails` to check which steps are already sent
4. Skip if `subscription_status` is `active` (user converted)
5. Call `sendTrialExpirationEmail` for each missing step
6. Return summary: `{ processed: N, sent: M, skipped: K }`

Add to `vercel.json`: `{ "path": "/api/cron/trial-expiration", "schedule": "0 * * * *" }`

Tests:
- Auth failure → 401
- User with trialing status, trial_end in 20h, no reminder_1d row → sends reminder_1d
- User with trialing status, trial_end 2h ago, no trial_ended row → sends trial_ended
- User with active status → skipped
- User already has both rows (delivered) → skipped (idempotent)

---

### T2.7 — Backfill script: `scripts/qa/_send_trial_expiration_backfill.mjs`

Handles current cohort (2 users due 2026-05-26):
- Reads `DATABASE_URL` from env
- Queries `users` WHERE `email IN ('durand.lisaanne@gmail.com', 'haileyanda8399@icloud.com')`
- Calls `sendTrialExpirationEmail` for step `reminder_3d` (idempotent — skips if already sent)
- Default: `DRY_RUN=true` (prints what would be sent)
- `--live` flag: sets DRY_RUN=false for this run
- Prints: user found / step claim result / sent or skipped

Usage:
```
# Dry run (safe):
node scripts/qa/_send_trial_expiration_backfill.mjs

# Live send (after smoke):
node scripts/qa/_send_trial_expiration_backfill.mjs --live
```

---

### T2.8 — Tests: full suite
**File:** `src/shared/lib/__tests__/trial-expiration.test.ts`

At minimum:
1. Webhook event parsing: `customer.subscription.trial_will_end` data shape
2. Idempotency: `tryInsertOneShotTrial` returns 'delivered' on second call → no Resend
3. DRY_RUN gate: `DRY_RUN=true` env → sendTrialExpirationEmail returns dry_run
4. Template selection: step='reminder_3d' → TrialReminder3dEmail rendered; step='trial_ended' → TrialEndedEmail rendered
5. Cron: user converted (status='active') → skipped
6. Cron: user already has both reminder steps → sends only trial_ended when due

---

## File change summary

| File | Action |
|------|--------|
| `drizzle/0014_trial_expiration_emails.sql` | CREATE |
| `src/shared/lib/schema.ts` | EDIT — add sentTrialEmails table |
| `src/shared/lib/sent-trial-emails.ts` | CREATE |
| `src/emails/TrialReminder3dEmail.tsx` | CREATE |
| `src/emails/TrialReminder1dEmail.tsx` | CREATE |
| `src/emails/TrialEndedEmail.tsx` | CREATE |
| `src/shared/lib/trial-expiration-email.ts` | CREATE |
| `src/app/api/webhooks/stripe/route.ts` | EDIT — replace trial_will_end case body |
| `src/app/api/cron/trial-expiration/route.ts` | CREATE |
| `vercel.json` | EDIT — add cron schedule |
| `scripts/qa/_send_trial_expiration_backfill.mjs` | CREATE |
| `src/shared/lib/__tests__/trial-expiration.test.ts` | CREATE |

---

## Commit sequence

```
test(trial-expire/T2): write failing tests for T2.2+T2.4 (TDD red)
feat(trial-expire/T2): T2.1+T2.2 — sent_trial_emails migration + library
feat(trial-expire/T2): T2.3 — TrialReminder3d/1d + TrialEnded email templates
feat(trial-expire/T2): T2.4 — sendTrialExpirationEmail function
feat(trial-expire/T2): T2.5 — wire webhook handler to new sequence
feat(trial-expire/T2): T2.6 — /api/cron/trial-expiration + vercel.json
chore(trial-expire/T2): T2.7 — backfill script for durand+hailey cohort
```

---

## Founder actions after implementation

1. Run `npm run db:migrate` on prod (migration 0014)
2. Verify `TRIAL_WINBACK_COUPON_CODE` env var set in Vercel (optional, for T-0 discount)
3. Smoke test: `node scripts/qa/_send_trial_expiration_backfill.mjs` (dry run)
4. Live send for durand+hailey: `node scripts/qa/_send_trial_expiration_backfill.mjs --live`
5. Flip `DRY_RUN=false` in Vercel env vars for production
6. Monitor `sent_trial_emails` table after 2026-05-26 for coverage
