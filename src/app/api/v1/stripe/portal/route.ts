/**
 * POST /api/v1/stripe/portal
 *
 * Creates a Stripe Billing Portal session for an existing subscriber.
 * Allows the user to manage their subscription: cancel, update payment method,
 * download invoices, upgrade/downgrade plan.
 *
 * Requires: user must be authenticated AND have a stripeCustomerId in the DB.
 * Returns 400 if the user has never subscribed (no Stripe customer record).
 *
 * Returns: { url: string } — redirect to the Stripe-hosted portal.
 */

import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireAuth } from '@/modules/auth/lib/helpers';
import { getDb } from '@/shared/lib/db';
import { users } from '@/shared/lib/schema';
import { getStripe } from '@/shared/lib/stripe';
import { getRateLimiter } from '@/shared/lib/rate-limit';
import type { ApiResponse } from '@/shared/types';

interface PortalResponse {
  url: string;
}

export async function POST(): Promise<NextResponse<ApiResponse<PortalResponse>>> {
  // ---------------------------------------------------------------------------
  // 1. Auth
  // ---------------------------------------------------------------------------
  let userId: string;
  try {
    const user = await requireAuth();
    userId = user.userId;
  } catch (err) {
    if (err instanceof Response) return err as never;
    throw err;
  }

  // ---------------------------------------------------------------------------
  // 2. Rate limiting
  // ---------------------------------------------------------------------------
  const limiter = getRateLimiter('stripe/portal');
  const { success: rateLimitOk } = await limiter.limit(userId);
  if (!rateLimitOk) {
    return NextResponse.json(
      { success: false, data: null, error: 'RATE_LIMITED' },
      { status: 429 },
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://estrevia.app';

  // ---------------------------------------------------------------------------
  // 3. Get stripeCustomerId from DB
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
    console.error('[stripe/portal] db lookup failed', { userId, err });
    return NextResponse.json(
      { success: false, data: null, error: 'DATABASE_ERROR' },
      { status: 500 },
    );
  }

  if (!stripeCustomerId) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: 'NO_SUBSCRIPTION',
        message: 'No active subscription found. Please upgrade first.',
      } as ApiResponse<PortalResponse> & { message: string },
      { status: 400 },
    );
  }

  // ---------------------------------------------------------------------------
  // 4. Create Billing Portal session
  // ---------------------------------------------------------------------------
  try {
    const stripe = getStripe();

    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${appUrl}/settings`,
    });

    return NextResponse.json(
      { success: true, data: { url: session.url }, error: null },
      { status: 200 },
    );
  } catch (err) {
    try {
      const { captureException } = await import('@sentry/nextjs');
      captureException(err);
    } catch {
      console.error('[stripe/portal] stripe error', { userId, err });
    }

    return NextResponse.json(
      { success: false, data: null, error: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}
