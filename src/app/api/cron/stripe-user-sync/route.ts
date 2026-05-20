/**
 * GET /api/cron/stripe-user-sync
 *
 * Watchdog: hourly diff between Stripe subscriptions (last 7d customers)
 * and users.subscription_tier / users.subscription_status. Auto-fixes drift
 * caused by webhook failures (root cause for destinig7996 was a missed
 * checkout.session.completed event).
 *
 * Per-customer try/catch — one failure does not abort the run.
 * Returns 200 with summary even on Stripe API errors.
 * CRON_SECRET-protected via assertCronAuth.
 */

import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import { inArray } from 'drizzle-orm';
import { getDb } from '@/shared/lib/db';
import { getStripe } from '@/shared/lib/stripe';
import { users } from '@/shared/lib/schema';
import { assertCronAuth } from '@/shared/lib/cron-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

type MismatchKind = 'missing-user' | 'tier-mismatch' | 'status-mismatch';

interface Mismatch {
  customerId: string;
  subscriptionId: string;
  expectedTier: 'free' | 'premium';
  expectedStatus: string;
  expectedPlan: 'free' | 'pro_monthly' | 'pro_annual';
  actualTier: string | null;
  actualStatus: string | null;
  kind: MismatchKind;
  userId?: string;
}

/** derivePlan mirrors webhook handler's derivePlan in src/shared/lib/stripe.ts */
function derivePlanFromInterval(interval: string | null | undefined): 'pro_monthly' | 'pro_annual' {
  return interval === 'year' ? 'pro_annual' : 'pro_monthly';
}

export async function GET(request: Request) {
  const authError = assertCronAuth(request);
  if (authError) return authError;

  const startMs = Date.now();
  let checked = 0;
  let fixed = 0;
  let failed = 0;

  try {
    const db = getDb();
    const stripe = getStripe();
    const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;

    // 1. Pull Stripe customers from last 7 days with their subscriptions
    const customers = await stripe.customers.list({
      created: { gte: sevenDaysAgo },
      limit: 100,
      expand: ['data.subscriptions'],
    });

    // 2. Pull matching users from DB (by stripe_customer_id), plus all users
    //    whose email matches customer.email (for missing-user detection).
    const customerIds = customers.data.map((c) => c.id);
    const matchedUsers = customerIds.length > 0
      ? await db.select().from(users).where(inArray(users.stripeCustomerId, customerIds))
      : [];
    const byStripeId = new Map(matchedUsers.map((u) => [u.stripeCustomerId, u]));

    // 3. Per-customer diff
    for (const customer of customers.data) {
      checked++;
      try {
        const sub = customer.subscriptions?.data?.[0];
        if (!sub) continue;  // no active sub, nothing to sync
        const dbUser = byStripeId.get(customer.id);
        const expectedPlan = derivePlanFromInterval(sub.items?.data[0]?.price?.recurring?.interval);
        const expectedTier: 'premium' = 'premium';
        const expectedStatus = sub.status;

        let kind: MismatchKind | null = null;
        if (!dbUser) kind = 'missing-user';
        else if (dbUser.subscriptionTier !== expectedTier) kind = 'tier-mismatch';
        else if (dbUser.subscriptionStatus !== expectedStatus) kind = 'status-mismatch';

        if (!kind) continue;

        const mismatch: Mismatch = {
          customerId: customer.id,
          subscriptionId: sub.id,
          expectedTier,
          expectedStatus,
          expectedPlan,
          actualTier: dbUser?.subscriptionTier ?? null,
          actualStatus: dbUser?.subscriptionStatus ?? null,
          kind,
          userId: dbUser?.id,
        };

        console.warn('[cron/stripe-user-sync] mismatch found', mismatch);
        Sentry.captureMessage('Stripe sync drift detected', {
          level: 'warning',
          tags: { cron: 'stripe-user-sync', kind },
          extra: mismatch as unknown as Record<string, unknown>,
        });

        if (dbUser) {
          // Stripe SDK v22 moved current_period_end off Subscription onto
          // SubscriptionItem — mirror the webhook handler's helper.
          const periodEndUnix = sub.items?.data?.[0]?.current_period_end ?? null;
          const periodEndDate = periodEndUnix ? new Date(periodEndUnix * 1000) : null;
          await db
            .update(users)
            .set({
              stripeCustomerId: customer.id,
              stripeSubscriptionId: sub.id,
              subscriptionTier: 'premium',
              subscriptionStatus: expectedStatus as 'trialing' | 'active' | 'canceled' | 'past_due' | 'incomplete' | 'unpaid' | 'free',
              plan: expectedPlan,
              trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
              currentPeriodEnd: periodEndDate,
              subscriptionExpiresAt: periodEndDate,
              updatedAt: new Date(),
            })
            .where(inArray(users.id, [dbUser.id]));
          fixed++;
        }
      } catch (err) {
        failed++;
        console.error('[cron/stripe-user-sync] per-customer error', {
          customerId: customer.id,
          err: err instanceof Error ? err.message : 'unknown',
        });
        Sentry.captureException(err, {
          tags: { cron: 'stripe-user-sync', stage: 'per-customer' },
          extra: { customerId: customer.id },
        });
      }
    }
  } catch (err) {
    console.error('[cron/stripe-user-sync] catastrophic', err);
    Sentry.captureException(err, {
      tags: { cron: 'stripe-user-sync', stage: 'catastrophic' },
    });
  }

  return NextResponse.json({
    checked,
    fixed,
    failed,
    durationMs: Date.now() - startMs,
  });
}
