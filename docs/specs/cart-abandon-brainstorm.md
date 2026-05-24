# Cart-Abandon Email — Brainstorm
Date: 2026-05-24

## Problem Statement

~14 high-intent users in the last 14 days reached the paywall (fired `paywall_opened`) and
some clicked Stripe checkout (fired `checkout_stripe_redirected`), but did NOT convert
(`subscription_started` absent). They are the warmest possible non-converting cohort.
No re-engagement mechanism exists today for this segment.

## Audience Cardinality

- Current: ~14 users/14d → ~1/day average
- Source: PostHog HogQL — `paywall_opened` events, filtered to distinct_ids where
  `subscription_started` has NOT fired in any session
- These are leads (email_leads rows), not registered users — they have an email address
  from the gate but no Clerk account
- Mix of EN (~60%) and ES (~40%) per audit data
- Some may have fired `checkout_stripe_redirected` (even hotter — saw Stripe page but
  abandoned before payment)

## Why Cart Abandon Fits Here (Not Drip)

The 6-step lead-nurture drip is time-gated (T+0/1h/24h/72h/7d/14d/21d from signup).
Cart abandon is **event-triggered** — the user must have hit the paywall AFTER signup,
which can happen days/weeks into the drip. These two concepts are orthogonal:
- A lead could be on drip step 4 (T+7d) and hit the paywall today — cart-abandon fires once
- The drip continues independently; cart-abandon is a side channel
- Implementation: separate table `sent_cart_abandon_emails`, separate cron, no interference
  with `nurture_step` logic

## Discount Strategy Rationale (paywall-upgrade-cro + pricing-strategy skills)

Estrevia Pro annual = $34.99/year. Monthly = $4.99/month × 12 = $59.88/year.
Annual is already 41.5% cheaper than monthly×12 — that anchor is already strong.

Skill recommendation: 20-30% off is the sweet spot. Stacking 50% on top of the annual
anchor would:
1. Train users to wait for deals (discount-seeking behavior)
2. Destroy the anchor value of the annual plan

Decision: **20% off first year only = $27.99 first year** (saves $7.00 on annual).
Communicate as "$7 off" not "20% off" — concrete $ feel more tangible per pricing-strategy.
Coupon: `ABANDON20` — redeemable once per customer (Stripe `max_redemptions` per customer
= 1, duration = `once`).

The offer is 48h scarcity: "expires Sunday at midnight" (computed as NOW + 48h in cron).
After 48h the link still works (Stripe coupon doesn't auto-expire unless founder sets
`redeem_by`), but the email copy creates perceived urgency.

## What They're Missing (Show Don't Tell)

Wrong: "Unlock premium features"
Right, specific:
- Saturn-dasha analysis: which phase of your Saturn return you're in (if applicable)
- Jupiter transit timing: when your next expansion window opens
- Synastry compatibility: AI reading of how you match with any birth chart
- Full chart interpretation: Sun + Moon + Asc + 8 planets + houses + aspects woven into
  one personal narrative

The email must name at least 2 concrete features, not generic "premium access".

## Trigger Window Decision

- Fire within 24-48h of the `paywall_opened` event
- After 7 days: cohort is cold, skip (they've already seen drip step 3 = paywall teaser)
- Cron runs daily at 07:00 UTC → catches yesterday's paywall views that are ≥1h old
  (prevents sending if they literally just viewed and are still on the page)
- Minimum age: 1 hour (they might still be browsing)

## Frequency Cap Decision

- Max 1 cart-abandon email per lead per 90 days (quarter)
- Rationale: cart-abandon is a one-shot conversion play. Re-sending after 90 days is
  fine if they hit the paywall again (e.g. they came back but still didn't subscribe)
- Implementation: `sent_cart_abandon_emails` table with `sent_at`, query by
  `lead_id AND sent_at > NOW() - 90d`

## Failure Modes

### 1. Cohort Drift
PostHog `paywall_opened` events may have `distinct_id` that doesn't join to `email_leads`.
- Anonymous users who never gave email: excluded (no email to send to)
- Users who registered (Clerk): excluded — they're in `users` table, not leads
- Mitigation: HogQL query joins on `properties.email` to find the email, then DB join on
  `email_leads.email` to get leadId + locale. No match = skip silently.

### 2. ES Locale Handling
ES leads: locale is stored in `email_leads.locale`. Template renders full ES copy.
ES coupon link: `/${locale}/pricing?coupon=ABANDON20` = `/es/pricing?coupon=ABANDON20`.
ES pricing page already shows the LATAM currency badge (shipped 2026-05-21).

### 3. Coupon Redemption Tracking
Stripe coupon `ABANDON20` is tracked at Stripe level (redemption count).
We do NOT need to track coupon usage in our DB — Stripe handles it.
After redemption: subscription is created, `subscription_started` fires,
lead converts. The next cron run sees `converted_to_user_id IS NOT NULL` and skips them.

### 4. PostHog → DB Email Mismatch
PostHog may have email in properties; DB has email in `email_leads.email`.
Both must match for a successful cohort join. Users who:
- Changed email between PostHog event and DB insert: extremely rare, acceptable skip
- Used different casing: HogQL returns lowercase; DB email is stored as-captured
  Mitigation: LOWER() comparison in DB query

### 5. Race Condition: Lead Converts During Cron Run
Lead hits paywall → cron starts → lead converts → cron tries to send → `converted_to_user_id`
is now NOT NULL → send is blocked.
But: cron queries DB for converted_to_user_id BEFORE calling PostHog. If conversion
happens AFTER DB query, cron proceeds. The email still sends.
Impact: user gets cart-abandon email after converting. Low probability, acceptable — they
just converted and the email won't confuse them.

### 6. DRY_RUN Mode
Initially DRY_RUN=true. Cron logs would-be sends without calling Resend.
Founder flips to false after smoke testing PostHog cohort count.

## Non-Goals (Explicit)

- This is NOT a win-back email for lapsed subscribers — that's the existing re-engagement cron
- This is NOT a drip step — it does NOT advance `nurture_step`
- This is NOT a second cart-abandon email — lifetime cap = 1 per 90 days
- This is NOT sent to registered users (Clerk accounts) — only leads
- This does NOT create or expire Stripe coupons programmatically — founder does in Dashboard
- This does NOT modify checkout flow — coupon is applied at Stripe Checkout via URL param

## Architecture Decision: Separate Table vs. sentLeadEmails

Option A: Add `'cart_abandon'` to `sentLeadEmails.emailType` enum.
Option B: Separate `sent_cart_abandon_emails` table.

Decision: **Option B** — separate table.
Rationale:
1. `sentLeadEmails` has a UNIQUE INDEX on (lead_id, email_type) — this enforces one-shot
   per type, which IS correct for cart-abandon. But the frequency cap logic (90-day window
   not unique-forever) requires checking `sent_at`, not just existence.
2. Separation keeps schemas clean — the nurture drip and the cart-abandon are different
   data products with different retention/frequency semantics.
3. Adding to the enum would require an ALTER TABLE for the SQL CHECK (though technically
   Drizzle text columns don't have SQL CHECK — only TS-level validation). Still cleaner to
   separate.
4. The separate table can hold `posthog_event_timestamp` for audit/analytics.
