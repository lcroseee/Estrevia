/**
 * POST /api/v1/checkout/recover
 *
 * Last-resort safety net for /checkout/complete. When the client-side 30s poll
 * for a Clerk sign-in ticket times out (Stripe webhook delayed or dropped),
 * this endpoint asks Stripe directly whether the session is paid and
 * synchronously provisions the user.
 *
 * Mirrors the webhook handler's `checkout.session.completed` essentials —
 * Clerk find-or-create, sign-in ticket, DB upsert — but skips webhook-only
 * side effects (PostHog subscription_started, Meta CAPI Subscribe, Resend
 * purchase email). Those fire when (if) the webhook eventually arrives.
 *
 * Idempotent via:
 *   - Clerk find-or-create with race recovery
 *   - DB upsert (onConflictDoUpdate)
 *   - Fast-path step skipping if signInTicket already in session metadata
 *   - `recovery:<session_id>` marker row in processed_stripe_events
 *
 * Public endpoint, rate-limited by IP. The Stripe session_id IS the
 * authorization (only the paying user has it from the redirect).
 *
 * IMPORTANT: if you change the users upsert in webhooks/stripe/route.ts
 * `case 'checkout.session.completed'`, mirror the change here OR explicitly
 * decide the divergence is intentional.
 */

import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type Stripe from 'stripe';
import { clerkClient } from '@clerk/nextjs/server';
import { getStripe } from '@/shared/lib/stripe';
import { getDb } from '@/shared/lib/db';
import { users, processedStripeEvents } from '@/shared/lib/schema';
import { getRateLimiter } from '@/shared/lib/rate-limit';
import { trackServerEvent, AnalyticsEvent } from '@/shared/lib/analytics';
import type { ApiResponse } from '@/shared/types';

const bodySchema = z.object({
  session_id: z.string().min(1).startsWith('cs_'),
});

interface RecoverResponse {
  ready: boolean;
  ticket?: string;
}

type DbSubscriptionStatus =
  | 'free'
  | 'trialing'
  | 'active'
  | 'canceled'
  | 'past_due'
  | 'incomplete'
  | 'unpaid';

function periodEndToDate(p: number | null | undefined): Date | null {
  if (!p) return null;
  return new Date(p * 1000);
}

function derivePlan(sub: Stripe.Subscription): 'free' | 'pro_monthly' | 'pro_annual' {
  const priceId = sub.items?.data?.[0]?.price?.id;
  if (priceId === process.env.STRIPE_PRICE_ID_PRO_MONTHLY) return 'pro_monthly';
  if (priceId === process.env.STRIPE_PRICE_ID_PRO_ANNUAL) return 'pro_annual';
  if (priceId === process.env.STRIPE_PRICE_ID) return 'pro_monthly';
  return 'free';
}

function getSubPeriodEnd(sub: Stripe.Subscription): number | null {
  return sub.items?.data?.[0]?.current_period_end ?? null;
}

function toDbStatus(s: string): DbSubscriptionStatus {
  const allowed: DbSubscriptionStatus[] = [
    'free',
    'trialing',
    'active',
    'canceled',
    'past_due',
    'incomplete',
    'unpaid',
  ];
  if ((allowed as string[]).includes(s)) return s as DbSubscriptionStatus;
  return 'canceled';
}

export async function POST(
  request: Request,
): Promise<NextResponse<ApiResponse<RecoverResponse>>> {
  // 1. Rate limit by IP
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
  const limiter = getRateLimiter('checkout/recover');
  const { success: rateLimitOk } = await limiter.limit(ip);
  if (!rateLimitOk) {
    return NextResponse.json(
      { success: false, data: null, error: 'RATE_LIMITED' },
      { status: 429 },
    );
  }

  // 2. Parse body
  let sessionId: string;
  try {
    const body = await request.json();
    sessionId = bodySchema.parse(body).session_id;
  } catch {
    return NextResponse.json(
      { success: false, data: null, error: 'BAD_REQUEST' },
      { status: 400 },
    );
  }

  // 3. Retrieve Stripe session
  let session: Stripe.Checkout.Session;
  const stripe = getStripe();
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === 'resource_missing') {
      return NextResponse.json(
        { success: false, data: null, error: 'NOT_FOUND' },
        { status: 404 },
      );
    }
    console.error(
      '[checkout/recover] stripe retrieve failed',
      err instanceof Error ? err.message : 'unknown',
    );
    try {
      const { captureException } = await import('@sentry/nextjs');
      captureException(err, {
        tags: { route: 'checkout/recover', stage: 'stripe-retrieve' },
      });
    } catch {
      // Sentry best-effort
    }
    return NextResponse.json(
      { success: false, data: null, error: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }

  // 4. Guards: must be paid + subscription mode
  const isPaid = session.payment_status === 'paid' || session.status === 'complete';
  if (!isPaid || session.mode !== 'subscription') {
    return NextResponse.json(
      { success: true, data: { ready: false }, error: null },
      { status: 200 },
    );
  }

  // 5. Fast path: ticket already cached on session
  const existingTicket = session.metadata?.signInTicket;
  if (existingTicket) {
    try {
      trackServerEvent(`cs:${sessionId}`, AnalyticsEvent.CHECKOUT_RECOVERY_SUCCEEDED, {
        session_id: sessionId,
        cached: true,
      });
    } catch {
      // PostHog best-effort
    }
    return NextResponse.json(
      { success: true, data: { ready: true, ticket: existingTicket }, error: null },
      { status: 200 },
    );
  }

  // 6. Need to provision — emit attempt event
  try {
    trackServerEvent(`cs:${sessionId}`, AnalyticsEvent.CHECKOUT_RECOVERY_ATTEMPTED, {
      session_id: sessionId,
    });
  } catch {
    // PostHog best-effort
  }

  // 7. Extract email
  const email = session.customer_details?.email;
  if (!email) {
    console.warn('[checkout/recover] no email on paid session', { sessionId });
    return NextResponse.json(
      { success: false, data: null, error: 'BAD_REQUEST' },
      { status: 400 },
    );
  }

  // 8-12. Provisioning block
  const db = getDb();
  try {
    const clerk = await clerkClient();

    // 8. Clerk find-or-create with race recovery
    let clerkUserId: string;
    const existing = await clerk.users.getUserList({ emailAddress: [email] });
    if (existing.totalCount > 0) {
      clerkUserId = existing.data[0].id;
    } else {
      try {
        const newUser = await clerk.users.createUser({
          emailAddress: [email],
          skipPasswordChecks: true,
          skipPasswordRequirement: true,
          externalId: `stripe:${session.id}`,
        });
        clerkUserId = newUser.id;
      } catch (createErr) {
        // Race: webhook (or another recovery call) created the user concurrently.
        const retry = await clerk.users.getUserList({ emailAddress: [email] });
        if (retry.totalCount > 0) {
          clerkUserId = retry.data[0].id;
        } else {
          throw createErr;
        }
      }
    }

    // 9. Generate sign-in token + write to Stripe metadata
    const token = await clerk.signInTokens.createSignInToken({
      userId: clerkUserId,
      expiresInSeconds: 600,
    });
    const ticket = token.token;
    const existingMetadata = session.metadata ?? {};
    await stripe.checkout.sessions.update(session.id, {
      metadata: { ...existingMetadata, signInTicket: ticket },
    });

    // 10. Fetch subscription for accurate plan + expiry
    let expiresAt: Date | null = null;
    let plan: 'free' | 'pro_monthly' | 'pro_annual' = 'free';
    let subscriptionStatus: DbSubscriptionStatus = 'active';
    let trialEnd: Date | null = null;
    let stripeSubscriptionId: string | null = null;

    if (session.subscription) {
      const subId =
        typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription.id;
      const sub = await stripe.subscriptions.retrieve(subId, { expand: ['items'] });
      expiresAt = periodEndToDate(getSubPeriodEnd(sub));
      plan = derivePlan(sub);
      subscriptionStatus = toDbStatus(sub.status);
      trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000) : null;
      stripeSubscriptionId = sub.id;
    }

    const stripeCustomerId =
      typeof session.customer === 'string'
        ? session.customer
        : (session.customer?.id ?? null);

    // 11. DB upsert — mirrors webhook checkout.session.completed branch.
    // Email column: insert uses placeholder; on conflict preserves existing
    // real email via `sql\`${users.email}\``.
    await db
      .insert(users)
      .values({
        id: clerkUserId,
        email: `stripe-pending-${clerkUserId}@placeholder.invalid`,
        stripeCustomerId,
        stripeSubscriptionId,
        subscriptionTier: 'premium',
        subscriptionExpiresAt: expiresAt,
        plan,
        subscriptionStatus,
        trialEnd,
        currentPeriodEnd: expiresAt,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          stripeCustomerId,
          stripeSubscriptionId,
          subscriptionTier: 'premium',
          subscriptionExpiresAt: expiresAt,
          plan,
          subscriptionStatus,
          trialEnd,
          currentPeriodEnd: expiresAt,
          updatedAt: new Date(),
          email: sql`${users.email}`,
        },
      });

    // 12. Marker row for observability. `recovery:` prefix cannot collide with
    // real Stripe event IDs (which start with `evt_`).
    try {
      await db
        .insert(processedStripeEvents)
        .values({
          eventId: `recovery:${session.id}`,
          eventType: 'checkout.session.completed.recovery',
        })
        .onConflictDoNothing();
    } catch (markerErr) {
      console.warn(
        '[checkout/recover] marker row insert failed (non-fatal)',
        markerErr instanceof Error ? markerErr.message : 'unknown',
      );
    }

    try {
      trackServerEvent(clerkUserId, AnalyticsEvent.CHECKOUT_RECOVERY_SUCCEEDED, {
        session_id: sessionId,
        cached: false,
      });
    } catch {
      // PostHog best-effort
    }

    console.info('[checkout/recover] provisioned premium via recovery', {
      clerkUserId,
      sessionId,
      plan,
      subscriptionStatus,
    });

    return NextResponse.json(
      { success: true, data: { ready: true, ticket }, error: null },
      { status: 200 },
    );
  } catch (err) {
    console.error(
      '[checkout/recover] provisioning failed',
      err instanceof Error ? err.message : 'unknown',
    );
    try {
      const { captureException } = await import('@sentry/nextjs');
      captureException(err, {
        tags: { route: 'checkout/recover', stage: 'provision' },
      });
    } catch {
      // Sentry best-effort
    }
    try {
      trackServerEvent(`cs:${sessionId}`, AnalyticsEvent.CHECKOUT_RECOVERY_FAILED, {
        session_id: sessionId,
        reason: err instanceof Error ? err.message : 'unknown',
      });
    } catch {
      // PostHog best-effort
    }
    return NextResponse.json(
      { success: false, data: null, error: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}
