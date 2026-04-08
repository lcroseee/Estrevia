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
import { requireAuth } from '@/modules/auth/lib/helpers';
import { getDb } from '@/shared/lib/db';
import { users } from '@/shared/lib/schema';
import { getStripe } from '@/shared/lib/stripe';
import { getRateLimiter } from '@/shared/lib/rate-limit';
import type { ApiResponse } from '@/shared/types';

interface CheckoutResponse {
  url: string;
}

export async function POST(): Promise<NextResponse<ApiResponse<CheckoutResponse>>> {
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
  // 3. Validate required env vars
  // ---------------------------------------------------------------------------
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) {
    console.error('[stripe/checkout] STRIPE_PRICE_ID is not configured');
    return NextResponse.json(
      { success: false, data: null, error: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://estrevia.app';

  // ---------------------------------------------------------------------------
  // 4. Look up existing Stripe customer ID (idempotency guard)
  // ---------------------------------------------------------------------------
  let stripeCustomerId: string | null = null;
  try {
    const db = getDb();
    const rows = await db
      .select({ stripeCustomerId: users.stripeCustomerId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    stripeCustomerId = rows[0]?.stripeCustomerId ?? null;
  } catch (err) {
    console.error('[stripe/checkout] db lookup failed', { userId, err });
    return NextResponse.json(
      { success: false, data: null, error: 'DATABASE_ERROR' },
      { status: 500 },
    );
  }

  // ---------------------------------------------------------------------------
  // 5. Create Stripe Checkout session
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
