/**
 * POST /api/webhooks/stripe
 *
 * Stripe webhook handler. Signature is verified with STRIPE_WEBHOOK_SECRET
 * before any DB writes. Raw body MUST be read before parsing — do not call
 * request.json() before constructEvent().
 *
 * Subscription lifecycle handled:
 *
 *   checkout.session.completed
 *     → User completed checkout: set tier='premium', save stripeCustomerId,
 *       set subscriptionExpiresAt from the subscription's current_period_end.
 *
 *   customer.subscription.updated
 *     → Plan change, renewal, or cancel_at_period_end toggle:
 *       update subscriptionExpiresAt. If status is 'canceled' or 'unpaid',
 *       downgrade to 'free'. If cancel_at_period_end=true, keep 'premium'
 *       until the period ends (Stripe fires subscription.deleted at that point).
 *
 *   customer.subscription.deleted
 *     → Subscription ended (either user canceled or payment failed after grace):
 *       set tier='free', clear subscriptionExpiresAt.
 *
 *   invoice.payment_failed
 *     → Log the failure. Do NOT immediately downgrade — Stripe retries for 3 days
 *       by default (configured in Stripe Dashboard → Subscriptions → Retry schedule).
 *       The subscription enters 'past_due'; we surface a warning in the UI.
 *       Downgrade only happens when customer.subscription.deleted fires.
 *
 * Security: every request with an invalid or missing signature returns 401.
 * Idempotency: all DB writes use upsert or check-then-set to survive retries.
 */

import { headers } from 'next/headers';
import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';
import { getStripe } from '@/shared/lib/stripe';
import { getDb } from '@/shared/lib/db';
import { users } from '@/shared/lib/schema';

// ---------------------------------------------------------------------------
// Helper: resolve clerkUserId from a Stripe object
// ---------------------------------------------------------------------------
function extractClerkUserId(
  obj: { metadata?: Stripe.Metadata | null; client_reference_id?: string | null } | null,
): string | null {
  if (!obj) return null;
  return (
    (obj.metadata?.clerkUserId ?? null) ||
    (obj.client_reference_id ?? null) ||
    null
  );
}

// ---------------------------------------------------------------------------
// Helper: get subscription expiry from period end (Unix timestamp → Date)
// ---------------------------------------------------------------------------
function periodEndToDate(periodEnd: number | null | undefined): Date | null {
  if (!periodEnd) return null;
  return new Date(periodEnd * 1000);
}

// ---------------------------------------------------------------------------
// Helper: derive plan from subscription price ID
// ---------------------------------------------------------------------------
function derivePlan(sub: Stripe.Subscription): 'free' | 'pro_monthly' | 'pro_annual' {
  const priceId = sub.items?.data?.[0]?.price?.id;
  if (priceId === process.env.STRIPE_PRICE_ID_PRO_MONTHLY) return 'pro_monthly';
  if (priceId === process.env.STRIPE_PRICE_ID_PRO_ANNUAL) return 'pro_annual';
  // Fallback: check old STRIPE_PRICE_ID for backward compat
  if (priceId === process.env.STRIPE_PRICE_ID) return 'pro_monthly';
  return 'free';
}

// ---------------------------------------------------------------------------
// Helper: get current_period_end from a Subscription object.
// Stripe SDK v22 moved current_period_end from Subscription to SubscriptionItem.
// ---------------------------------------------------------------------------
function getSubscriptionPeriodEnd(sub: Stripe.Subscription): number | null {
  return sub.items?.data?.[0]?.current_period_end ?? null;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------
export async function POST(request: Request): Promise<Response> {
  const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET is not configured');
    return Response.json(
      { error: 'INTERNAL_ERROR', message: 'Webhook not configured' },
      { status: 500 },
    );
  }

  // Read signature header
  const headerPayload = await headers();
  const signature = headerPayload.get('stripe-signature');

  if (!signature) {
    return Response.json(
      { error: 'BAD_REQUEST', message: 'Missing stripe-signature header' },
      { status: 400 },
    );
  }

  // Raw body — must not parse as JSON before constructEvent
  const body = await request.text();

  // Verify signature
  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(body, signature, WEBHOOK_SECRET);
  } catch (err) {
    console.error('[stripe-webhook] Signature verification failed', err);
    return Response.json(
      { error: 'UNAUTHORIZED', message: 'Webhook signature verification failed' },
      { status: 401 },
    );
  }

  const db = getDb();

  try {
    switch (event.type) {
      // -----------------------------------------------------------------------
      // checkout.session.completed
      // User paid for the first time → activate premium
      // -----------------------------------------------------------------------
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;

        // Only handle subscription checkouts
        if (session.mode !== 'subscription') break;

        const clerkUserId = extractClerkUserId(session);
        if (!clerkUserId) {
          console.warn('[stripe-webhook] checkout.session.completed: no clerkUserId in metadata', {
            sessionId: session.id,
          });
          break;
        }

        const stripeCustomerId =
          typeof session.customer === 'string'
            ? session.customer
            : (session.customer?.id ?? null);

        // Fetch subscription to get current_period_end and plan details
        let expiresAt: Date | null = null;
        let plan: 'free' | 'pro_monthly' | 'pro_annual' = 'free';
        let subscriptionStatus: string = 'active';
        let trialEnd: Date | null = null;
        let stripeSubscriptionId: string | null = null;

        if (session.subscription) {
          const stripe = getStripe();
          const subId =
            typeof session.subscription === 'string'
              ? session.subscription
              : session.subscription.id;
          const sub = await stripe.subscriptions.retrieve(subId, {
            expand: ['items'],
          });
          expiresAt = periodEndToDate(getSubscriptionPeriodEnd(sub));
          plan = derivePlan(sub);
          subscriptionStatus = sub.status;
          trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000) : null;
          stripeSubscriptionId = sub.id;
        }

        await db
          .update(users)
          .set({
            stripeCustomerId,
            stripeSubscriptionId,
            subscriptionTier: 'premium',
            subscriptionExpiresAt: expiresAt,
            plan,
            subscriptionStatus: subscriptionStatus as 'trialing' | 'active' | 'canceled' | 'past_due',
            trialEnd,
            currentPeriodEnd: expiresAt,
            updatedAt: new Date(),
          })
          .where(eq(users.id, clerkUserId));

        console.info('[stripe-webhook] checkout.session.completed → premium activated', {
          clerkUserId,
          stripeCustomerId,
          plan,
          subscriptionStatus,
          expiresAt,
        });
        break;
      }

      // -----------------------------------------------------------------------
      // customer.subscription.updated
      // Renewal, plan change, cancel_at_period_end toggle, payment failure
      // -----------------------------------------------------------------------
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;

        const clerkUserId = extractClerkUserId(sub);
        if (!clerkUserId) {
          // Fall back to stripeCustomerId lookup in DB
          const customerId =
            typeof sub.customer === 'string' ? sub.customer : sub.customer.id;

          const rows = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.stripeCustomerId, customerId))
            .limit(1);

          if (rows.length === 0) {
            console.warn('[stripe-webhook] subscription.updated: user not found for customer', {
              customerId,
            });
            break;
          }

          const userId = rows[0].id;
          await handleSubscriptionUpdate(db, userId, sub);
          break;
        }

        await handleSubscriptionUpdate(db, clerkUserId, sub);
        break;
      }

      // -----------------------------------------------------------------------
      // customer.subscription.deleted
      // Subscription fully ended → downgrade to free
      // -----------------------------------------------------------------------
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;

        let userId: string | null = extractClerkUserId(sub);
        if (!userId) {
          const customerId =
            typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
          const rows = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.stripeCustomerId, customerId))
            .limit(1);
          userId = rows[0]?.id ?? null;
        }

        if (!userId) {
          console.warn('[stripe-webhook] subscription.deleted: user not found', {
            subscriptionId: sub.id,
          });
          break;
        }

        await db
          .update(users)
          .set({
            subscriptionTier: 'free',
            subscriptionExpiresAt: null,
            stripeSubscriptionId: null,
            plan: 'free',
            subscriptionStatus: 'canceled',
            trialEnd: null,
            currentPeriodEnd: null,
            updatedAt: new Date(),
          })
          .where(eq(users.id, userId));

        console.info('[stripe-webhook] subscription.deleted → downgraded to free', { userId });
        break;
      }

      // -----------------------------------------------------------------------
      // invoice.payment_failed
      // Log only — Stripe retries for 3 days. We don't downgrade immediately.
      // The UI should surface a warning by checking subscription status.
      // -----------------------------------------------------------------------
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId =
          typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;

        console.warn('[stripe-webhook] invoice.payment_failed — grace period active', {
          customerId,
          invoiceId: invoice.id,
          attemptCount: invoice.attempt_count,
        });

        // Optionally send a transactional email (Phase 2 — Resend integration).
        // For MVP: Stripe Dashboard handles dunning emails automatically.
        break;
      }

      // -----------------------------------------------------------------------
      // customer.subscription.trial_will_end
      // Trial ending in ~3 days → send reminder email
      // -----------------------------------------------------------------------
      case 'customer.subscription.trial_will_end': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId =
          typeof sub.customer === 'string' ? sub.customer : sub.customer.id;

        const rows = await db
          .select({ email: users.email })
          .from(users)
          .where(eq(users.stripeCustomerId, customerId))
          .limit(1);

        if (rows[0]?.email) {
          const trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000) : new Date();
          const { sendTrialEndingEmail } = await import('@/shared/lib/email');
          await sendTrialEndingEmail(rows[0].email, trialEnd);
        }

        console.info('[stripe-webhook] trial_will_end → email sent', { customerId });
        break;
      }

      // -----------------------------------------------------------------------
      // invoice.payment_succeeded
      // Successful payment → update period end dates
      // -----------------------------------------------------------------------
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId =
          typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
        if (!customerId) break;

        // Stripe SDK v22+: subscription is under parent.subscription_details
        const subRef = invoice.parent?.subscription_details?.subscription;
        const subscriptionId =
          typeof subRef === 'string' ? subRef : subRef?.id;
        if (!subscriptionId) break;

        const stripe = getStripe();
        const sub = await stripe.subscriptions.retrieve(subscriptionId, {
          expand: ['items'],
        });
        const expiresAt = periodEndToDate(getSubscriptionPeriodEnd(sub));

        await db
          .update(users)
          .set({
            currentPeriodEnd: expiresAt,
            subscriptionExpiresAt: expiresAt,
            updatedAt: new Date(),
          })
          .where(eq(users.stripeCustomerId, customerId));

        console.info('[stripe-webhook] invoice.payment_succeeded → period updated', {
          customerId,
          expiresAt,
        });
        break;
      }

      default:
        // Unhandled events are acknowledged with 200 — prevents Stripe retries
        console.info('[stripe-webhook] unhandled event type', { type: event.type });
    }
  } catch (err) {
    try {
      const { captureException } = await import('@sentry/nextjs');
      captureException(err);
    } catch {
      console.error('[stripe-webhook] event processing error', { eventType: event.type, err });
    }

    // Return 500 so Stripe retries the event (idempotent handlers are safe to retry)
    return Response.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to process webhook event' },
      { status: 500 },
    );
  }

  return Response.json({ received: true }, { status: 200 });
}

// ---------------------------------------------------------------------------
// Shared helper: update subscription tier + expiresAt from a subscription object
// ---------------------------------------------------------------------------
async function handleSubscriptionUpdate(
  db: ReturnType<typeof import('@/shared/lib/db').getDb>,
  userId: string,
  sub: Stripe.Subscription,
): Promise<void> {
  const isActive = sub.status === 'active' || sub.status === 'trialing';
  const isPastDue = sub.status === 'past_due'; // grace period — keep premium
  const expiresAt = periodEndToDate(getSubscriptionPeriodEnd(sub));

  // Keep premium during grace period (past_due) so users aren't locked out mid-retry
  const tier = isActive || isPastDue ? 'premium' : 'free';
  const plan = tier === 'free' ? 'free' : derivePlan(sub);
  const trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000) : null;

  await db
    .update(users)
    .set({
      subscriptionTier: tier,
      subscriptionExpiresAt: tier === 'free' ? null : expiresAt,
      stripeSubscriptionId: sub.id,
      plan,
      subscriptionStatus: sub.status as 'trialing' | 'active' | 'canceled' | 'past_due',
      trialEnd,
      currentPeriodEnd: expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  console.info('[stripe-webhook] subscription.updated', {
    userId,
    status: sub.status,
    tier,
    plan,
    expiresAt,
  });
}
