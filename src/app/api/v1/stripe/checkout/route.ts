/**
 * POST /api/v1/stripe/checkout
 *
 * Creates a Stripe Checkout session for upgrading to Premium.
 * Auth required — the session is tied to the current user's email.
 *
 * If the user already has a stripeCustomerId, it is passed to Checkout so that
 * Stripe reuses the existing customer record (prevents duplicates on retries).
 *
 * Returns: { url: string } — the hosted Checkout URL to redirect the user to.
 */

import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { requireAuth } from '@/modules/auth/lib/helpers';
import { computeIsPremium } from '@/modules/auth/lib/premium';
import { getDb } from '@/shared/lib/db';
import { users } from '@/shared/lib/schema';
import { getStripe } from '@/shared/lib/stripe';
import { getRateLimiter } from '@/shared/lib/rate-limit';
import type { ApiResponse } from '@/shared/types';

const checkoutBodySchema = z.object({
  plan: z.enum(['pro_monthly', 'pro_annual']).default('pro_annual'),
});

interface CheckoutResponse {
  url: string;
}

export async function POST(request: Request): Promise<NextResponse<ApiResponse<CheckoutResponse>>> {
  // ---------------------------------------------------------------------------
  // 1. Auth
  // ---------------------------------------------------------------------------
  let userId: string;
  let email: string;
  try {
    const user = await requireAuth();
    userId = user.userId;
    email = user.email;
  } catch (err) {
    if (err instanceof Response) return err as never;
    throw err;
  }

  // ---------------------------------------------------------------------------
  // 2. Rate limiting (keyed by userId to prevent session spam)
  // ---------------------------------------------------------------------------
  const limiter = getRateLimiter('stripe/checkout');
  const { success: rateLimitOk } = await limiter.limit(userId);
  if (!rateLimitOk) {
    return NextResponse.json(
      { success: false, data: null, error: 'RATE_LIMITED' },
      { status: 429 },
    );
  }

  // ---------------------------------------------------------------------------
  // 3. Parse plan from request body
  // ---------------------------------------------------------------------------
  let plan: 'pro_monthly' | 'pro_annual' = 'pro_annual';
  try {
    const body = await request.json();
    const parsed = checkoutBodySchema.parse(body);
    plan = parsed.plan;
  } catch {
    // Default to pro_annual if body is empty or invalid
    plan = 'pro_annual';
  }

  // ---------------------------------------------------------------------------
  // 4. Resolve price ID from plan
  // ---------------------------------------------------------------------------
  const priceIdMap: Record<string, string | undefined> = {
    pro_monthly: process.env.STRIPE_PRICE_ID_PRO_MONTHLY,
    pro_annual: process.env.STRIPE_PRICE_ID_PRO_ANNUAL,
  };
  // Fall back to old STRIPE_PRICE_ID for backward compat
  const priceId = priceIdMap[plan] ?? process.env.STRIPE_PRICE_ID;
  if (!priceId) {
    console.error('[stripe/checkout] No price ID configured for plan', { plan });
    return NextResponse.json(
      { success: false, data: null, error: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://estrevia.app';

  // ---------------------------------------------------------------------------
  // 5. Look up existing Stripe customer + subscription state.
  //
  // Two purposes:
  //   a) idempotency guard — reuse stripeCustomerId so Stripe doesn't create
  //      a duplicate customer on retries.
  //   b) already-subscribed short-circuit — if the caller is already premium,
  //      creating a new Checkout Session would produce a duplicate subscription
  //      (and charge them again, since returning customers skip the trial).
  //      Instead, bounce them to /settings where Customer Portal manages billing.
  // ---------------------------------------------------------------------------
  let stripeCustomerId: string | null = null;
  let isAlreadyPremium = false;
  try {
    const db = getDb();
    const rows = await db
      .select({
        stripeCustomerId: users.stripeCustomerId,
        subscriptionTier: users.subscriptionTier,
        subscriptionStatus: users.subscriptionStatus,
        subscriptionExpiresAt: users.subscriptionExpiresAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const row = rows[0];
    stripeCustomerId = row?.stripeCustomerId ?? null;
    if (row) {
      isAlreadyPremium = computeIsPremium(
        row.subscriptionTier,
        row.subscriptionStatus,
        row.subscriptionExpiresAt,
      );
    }
  } catch (err) {
    console.error('[stripe/checkout] db lookup failed', { userId, err });
    return NextResponse.json(
      { success: false, data: null, error: 'DATABASE_ERROR' },
      { status: 500 },
    );
  }

  if (isAlreadyPremium) {
    // Paying user clicked the trial CTA (usually because the paywall wrongly
    // flashed for them). Redirect to /settings so the Customer Portal can
    // handle any plan changes; never create a duplicate subscription.
    return NextResponse.json(
      {
        success: true,
        data: { url: `${appUrl}/settings?already_subscribed=1` },
        error: null,
      },
      { status: 200 },
    );
  }

  // ---------------------------------------------------------------------------
  // 6. Create Stripe Checkout session
  // ---------------------------------------------------------------------------
  try {
    const stripe = getStripe();

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      // Reuse existing customer if we have one, otherwise let Stripe create one
      ...(stripeCustomerId
        ? { customer: stripeCustomerId }
        : { customer_email: email }),
      // Attach Clerk userId to the Stripe customer for webhook reconciliation
      client_reference_id: userId,
      metadata: { clerkUserId: userId },
      // 3-day free trial only for first-time subscribers (no stripeCustomerId yet).
      // Returning subscribers skip the trial to prevent revenue leak.
      subscription_data: {
        ...(stripeCustomerId ? {} : { trial_period_days: 3 }),
        metadata: { clerkUserId: userId },
      },
      success_url: `${appUrl}/settings?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/pricing`,
      // Allow user to change their email at checkout if needed
      allow_promotion_codes: true,
      // Collect billing address for tax purposes
      billing_address_collection: 'auto',
    });

    if (!session.url) {
      console.error('[stripe/checkout] session has no URL', { sessionId: session.id });
      return NextResponse.json(
        { success: false, data: null, error: 'INTERNAL_ERROR' },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { success: true, data: { url: session.url }, error: null },
      { status: 200 },
    );
  } catch (err) {
    try {
      const { captureException } = await import('@sentry/nextjs');
      captureException(err);
    } catch {
      console.error('[stripe/checkout] stripe error', { userId, err });
    }

    return NextResponse.json(
      { success: false, data: null, error: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}
