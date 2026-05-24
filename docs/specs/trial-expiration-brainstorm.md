# Trial Expiration Email Sequence — Brainstorm

_2026-05-24 | T2 | Backend agent_

---

## Target audience

Warm trial users who:
- Signed up via email-gate funnel (utm_source=lead-nurture)
- Have chart_calculated (they've seen their chart — they have a tangible artifact to protect)
- Are 3 days from losing Pro access they've been actively using
- Mostly EN (current cohort), but ES locale must be handled

Psychology: these are NOT cold leads. They chose to start a trial. The framing is "you have something to lose" (loss aversion), not "try this thing."

---

## Email sequence design

### Why 3 emails, not 1

Stripe's `customer.subscription.trial_will_end` fires exactly once, approximately 3 days before trial end. This is T-72h. But a single reminder at T-72h has low urgency — "I have 3 days" → forget about it.

The marketing-psychology skill mandates: 7, 3, 1 day before expiry (we're compressing to 3d/1d/0d given MVP). Each email has **one primary CTA** (One Email, One Job).

### Step mapping

| Step | Timing | Trigger | Subject angle | Primary CTA |
|------|--------|---------|---------------|-------------|
| `reminder_3d` | T-72h | Stripe webhook | "Your trial ends in 3 days — here's what you've built" | Continue with Pro |
| `reminder_1d` | T-24h | Cron poll | "Last day to keep your chart readings" | Continue with Pro |
| `trial_ended` | T-0 (at/after trial_end) | Cron poll | "Your trial ended — but your chart is still here" | Restart trial (or Pro at discount) |

**Note on T-0 ("win-back"):** Marketing skill says discount is only acceptable at trial_ended framing. We include a 10% discount coupon mention at T-0 (founder must create coupon in Stripe — we pass the coupon code via env var `TRIAL_WINBACK_COUPON_CODE`).

---

## Tone principles

- **Loss aversion framing:** "Here's what you calculated / what you'll lose" — not generic features list
- **Specifics over generics:** "Your Saturn Return window analysis" > "All Pro features"
- **Respectful close:** "Pause your subscription" link (Stripe Billing Portal) so they don't feel trapped
- **No guilt at T-0:** Acknowledge they let it lapse, celebrate what they did, offer easy restart
- **Length:** 200-280 words per email

---

## Failure modes and mitigations

### 1. Stripe→Resend race on T-72h
Webhook fires, Resend call fails. Without `sent_trial_emails` table, retry would re-fire.  
**Mitigation:** `sent_trial_emails` table with UNIQUE(subscription_id, step). Same `new/retry/delivered` pattern as `sent_lead_emails`.

### 2. Double-fire
Stripe occasionally retries webhooks. Without idempotency, T-72h fires twice.  
**Mitigation:** `processed_stripe_events` deduplication (already exists in webhook handler) + `sent_trial_emails` UNIQUE constraint.

### 3. Cron for T-24h / T-0 fires before trial_will_end webhook
If cron runs before the webhook processes (out-of-order), `sent_trial_emails` has no `reminder_3d` row → cron would fire `reminder_1d` as first email. Acceptable: T-24h as first contact is still better than nothing.

### 4. Locale mismatch
User row has `locale` column. Webhook reads from users table by stripeCustomerId. Safe.

### 5. Trial extended manually
Stripe can extend a trial. The webhook refires. `sent_trial_emails` UNIQUE on `(subscription_id, step)` prevents re-send on same subscription — but if the founder extends trial, the user gets no new reminder.  
**Decision (MVP):** accept this. Extended-trial reminder is a follow-up.

### 6. User already canceled (cancel_at_period_end=true)
Trial ends and they've manually canceled. T-0 "win-back" is irrelevant, slightly awkward.  
**Mitigation:** check `cancel_at_period_end` on subscription before sending T-0. Skip if true.

### 7. User converted before cron fires
User subscribes on Day 2 of trial. T-24h and T-0 cron would send "your trial ends" to a paying user.  
**Mitigation:** cron checks `subscription_status != 'active'` before sending. Skip if already converted.

---

## Unique vs. existing behaviors

This is **new behavior**, not a modification of the lead nurture drip:
- Lead nurture: anonymous leads → pre-conversion
- Trial expiration: authenticated users → post-trial-start, pre-conversion
- Different table (`sent_trial_emails` vs `sent_lead_emails`)
- Different trigger (Stripe webhook + cron vs lead-cron)
- Different idempotency key (subscription_id, not lead_id)

The existing `sendTrialEndingEmail` / `TrialEndingEmail.tsx` is the OLD single-email implementation from before T2. We keep `TrialEndingEmail.tsx` as-is (it's still used by the old webhook path during transition) and ADD 3 new templates: `TrialReminderEmail.tsx` (shared for 3d/1d), `TrialEndedEmail.tsx` (T-0 win-back).

Actually — cleaner to **replace** the old `trial_ending` webhook behavior with the new multi-step sequence. The old `sendTrialEndingEmail` becomes `sendTrialReminder3d`. The `trial_ending` type in `sent_emails` is superseded by `sent_trial_emails`.

---

## DRY_RUN gate

All three send functions check `process.env.DRY_RUN === 'true'` before calling Resend. Logs `[DRY_RUN]` and returns `{ sent: false, reason: 'dry_run' }`. Founder flips `DRY_RUN` → `false` after smoke test.
