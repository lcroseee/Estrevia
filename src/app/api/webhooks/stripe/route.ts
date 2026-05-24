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
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import type Stripe from 'stripe';
import * as Sentry from '@sentry/nextjs';
import { clerkClient } from '@clerk/nextjs/server';
import { getStripe } from '@/shared/lib/stripe';
import { getDb } from '@/shared/lib/db';
import { users, processedStripeEvents, emailLeads } from '@/shared/lib/schema';
import { trackServerEvent, AnalyticsEvent } from '@/shared/lib/analytics';

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
    // Log only the message — never the raw err (which may contain the raw request body).
    console.error(
      '[stripe-webhook] Signature verification failed',
      err instanceof Error ? err.message : 'unknown',
    );
    try {
      const { captureException } = await import('@sentry/nextjs');
      captureException(err, { tags: { webhook: 'stripe' } });
    } catch {
      // Sentry capture is best-effort; do not mask the original 401.
    }
    return Response.json(
      { error: 'UNAUTHORIZED', message: 'Webhook signature verification failed' },
      { status: 401 },
    );
  }

  const db = getDb();

  Sentry.addBreadcrumb({
    category: 'stripe-webhook',
    message: 'event received',
    data: { eventId: event.id, eventType: event.type },
    level: 'info',
  });

  // ---------------------------------------------------------------------------
  // Idempotency: deduplicate via processed_stripe_events.
  // INSERT … ON CONFLICT DO NOTHING returns the row only when it was inserted.
  // An empty RETURNING means the event was already processed — return 200 to
  // acknowledge it and prevent Stripe from retrying.
  // ---------------------------------------------------------------------------
  const deduped = await db
    .insert(processedStripeEvents)
    .values({ eventId: event.id, eventType: event.type })
    .onConflictDoNothing()
    .returning({ eventId: processedStripeEvents.eventId });

  if (deduped.length === 0) {
    console.info('[stripe-webhook] duplicate event — already processed', {
      eventId: event.id,
      eventType: event.type,
    });
    return Response.json({ received: true, duplicate: true }, { status: 200 });
  }

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

        let clerkUserId = extractClerkUserId(session);

        // ANONYMOUS branch: materialize Clerk user + sign-in ticket
        if (!clerkUserId) {
          const email = session.customer_details?.email;
          if (!email) {
            console.warn('[stripe-webhook] anonymous checkout.session.completed: no email on session', {
              sessionId: session.id,
            });
            break;
          }

          try {
            const clerk = await clerkClient();

            // Find-or-create with race recovery
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
                // Race: concurrent webhook retry created the user. Re-query.
                const retry = await clerk.users.getUserList({ emailAddress: [email] });
                if (retry.totalCount > 0) {
                  clerkUserId = retry.data[0].id;
                } else {
                  throw createErr;
                }
              }
            }

            // Create single-use sign-in ticket and write back to Stripe metadata
            const ticket = await clerk.signInTokens.createSignInToken({
              userId: clerkUserId,
              expiresInSeconds: 600,
            });
            const existingMetadata = session.metadata ?? {};
            await getStripe().checkout.sessions.update(session.id, {
              metadata: { ...existingMetadata, signInTicket: ticket.token },
            });

            // Link the email_lead(s) to the new user — both anonymous_id and email paths.
            // Capture matched rows via .returning() so we can decide whether to run the
            // utm_content fallback below.
            const anonymousIdMeta = (session.metadata?.anonymous_id ?? null) as string | null;

            Sentry.addBreadcrumb({
              category: 'stripe-webhook',
              message: 'clerk user materialized',
              data: { eventId: event.id, clerkUserId, anonymousId: anonymousIdMeta },
              level: 'info',
            });

            try {
              const linkedRows = await db
                .update(emailLeads)
                .set({ convertedToUserId: clerkUserId, convertedAt: new Date() })
                .where(
                  anonymousIdMeta
                    ? or(
                        eq(emailLeads.anonymousId, anonymousIdMeta),
                        eq(emailLeads.email, email),
                      )
                    : eq(emailLeads.email, email),
                )
                .returning({ id: emailLeads.id });

              // utm_content fallback. Fires only when the primary link matched zero rows
              // (lead-email differs from checkout-email AND browser dropped anonymous_id).
              // Sets ONLY unsubscribed_at — we cannot prove cross-email identity match.
              const utmContent = session.metadata?.utm_content;
              const looksLikeLeadId =
                typeof utmContent === 'string' && /^[A-Za-z0-9_-]{21}$/.test(utmContent);
              if (linkedRows.length === 0 && looksLikeLeadId) {
                await db
                  .update(emailLeads)
                  .set({ unsubscribedAt: new Date() })
                  .where(
                    and(
                      eq(emailLeads.id, utmContent),
                      isNull(emailLeads.unsubscribedAt),
                      isNull(emailLeads.convertedToUserId),
                    ),
                  );
                console.info('[stripe-webhook] utm_content fallback unsubscribed lead', {
                  sessionId: session.id,
                  leadId: utmContent,
                });
              }
            } catch (linkErr) {
              console.warn(
                '[stripe-webhook] email_leads link failed (non-fatal)',
                linkErr instanceof Error ? linkErr.message : 'unknown',
              );
            }

            // Observability — non-blocking
            try {
              trackServerEvent(clerkUserId, AnalyticsEvent.ANONYMOUS_USER_MATERIALIZED, {
                created_new: existing.totalCount === 0,
                session_id: session.id,
                anonymous_id: anonymousIdMeta,
              });
              trackServerEvent(clerkUserId, AnalyticsEvent.CHECKOUT_TICKET_READY, {
                session_id: session.id,
              });
            } catch {
              // PostHog must not break the webhook.
            }
          } catch (clerkErr) {
            // Roll back dedup row so Stripe retries
            try {
              await db
                .delete(processedStripeEvents)
                .where(eq(processedStripeEvents.eventId, event.id));
            } catch (delErr) {
              console.error(
                '[stripe-webhook] dedup rollback failed',
                delErr instanceof Error ? delErr.message : 'unknown',
              );
            }
            try {
              const { captureException } = await import('@sentry/nextjs');
              captureException(clerkErr, {
                tags: { webhook: 'stripe', checkout: 'anonymous', stage: 'webhook-materialize' },
              });
            } catch {
              // Sentry best-effort
            }
            throw clerkErr;
          }
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

        // Upsert: if the Clerk user.created webhook hasn't fired yet, create the row
        // so the subscription is never silently dropped due to a missing user.
        // email is set to a placeholder and must be overwritten when the Clerk webhook arrives.
        // On conflict we update all subscription fields but do NOT overwrite email if it is
        // already set (keeps the real email from Clerk's user.created handler).
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
            subscriptionStatus: subscriptionStatus as 'trialing' | 'active' | 'canceled' | 'past_due' | 'incomplete' | 'unpaid' | 'free',
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
              subscriptionStatus: subscriptionStatus as 'trialing' | 'active' | 'canceled' | 'past_due' | 'incomplete' | 'unpaid' | 'free',
              trialEnd,
              currentPeriodEnd: expiresAt,
              updatedAt: new Date(),
              // Preserve existing email: never overwrite a real address with the
              // stripe-pending placeholder. On conflict, keep whatever is already stored.
              email: sql`${users.email}`,
            },
          });

        Sentry.addBreadcrumb({
          category: 'stripe-webhook',
          message: 'users upserted',
          data: { eventId: event.id, clerkUserId, plan, subscriptionStatus },
          level: 'info',
        });

        // Fire subscription_started to PostHog so the agent's funnel
        // reconciler can attribute conversions back to Meta UTMs. Only
        // fired here (not in customer.subscription.updated) to avoid
        // counting renewals/plan changes as new conversions.
        // Idempotency: $insert_id keyed off subscription.id ensures Stripe
        // retries collapse server-side at PostHog. Wrapped in try/catch:
        // PostHog being down must never escalate to a 500 (Stripe would
        // retry → duplicate user upserts).
        //
        // T18 (v3b): trackServerEvent ALSO fires Meta CAPI Subscribe via
        // T11's analytics extension. `value` (in `amount_usd`) + `currency`
        // + `predicted_ltv` are forwarded as CAPI custom_data for Meta's
        // value-based bidding. `email` (when present) is hashed at the CAPI
        // boundary. The `$insert_id` is reused as the CAPI event_id for
        // dedupe with browser-side fbq Subscribe.
        // predicted_ltv: hardcoded $30 LTV per spec; auto-calibrated in
        // v3b month 6+ via the agent's funnel reconciler.
        try {
          const utm = (session.metadata ?? {}) as Record<string, string | undefined>;
          const amountTotal = session.amount_total ?? 0;
          const currency = session.currency ?? 'usd';
          const customerEmail = session.customer_details?.email ?? undefined;
          trackServerEvent(clerkUserId, AnalyticsEvent.SUBSCRIPTION_STARTED, {
            plan,
            amount_usd: amountTotal / 100, // Stripe sends cents
            value: amountTotal / 100,      // CAPI custom_data.value (mirrors amount_usd)
            currency,
            predicted_ltv: 30,             // CAPI custom_data.predicted_ltv (LTV-based bidding)
            stripe_subscription_id: stripeSubscriptionId,
            utm_source: utm.utm_source ?? null,
            utm_content: utm.utm_content ?? null, // ad_id by convention
            utm_campaign: utm.utm_campaign ?? null,
            email: customerEmail,          // for CAPI hashing in T11 wrapper
            $insert_id: `${session.id}:subscription_started`,
          });
        } catch (phErr) {
          console.warn(
            '[stripe-webhook] PostHog subscription_started fire failed (non-fatal)',
            phErr instanceof Error ? phErr.message : 'unknown',
          );
          try {
            const { captureException } = await import('@sentry/nextjs');
            captureException(phErr, {
              tags: { webhook: 'stripe', posthog: 'degraded' },
            });
          } catch {
            // Sentry capture is best-effort.
          }
        }

        // Send purchase confirmation email — best-effort, idempotent via Resend key.
        // Must not throw: user has paid, email is secondary.
        try {
          const { sendPurchaseConfirmationEmail } = await import('@/shared/lib/email');
          const userRow = await db
            .select({ email: users.email, locale: users.locale })
            .from(users)
            .where(eq(users.id, clerkUserId))
            .limit(1);
          if (userRow.length > 0 && stripeSubscriptionId && expiresAt) {
            const locale = userRow[0].locale;
            // Determine plan from interval rather than price ID — more future-proof.
            // We already have the `sub` object in scope if subscription was retrieved above.
            const confirmPlan: 'pro_monthly' | 'pro_annual' = plan === 'pro_annual'
              ? 'pro_annual'
              : 'pro_monthly';
            const nextChargeDate = expiresAt.toLocaleDateString(
              locale === 'es' ? 'es' : 'en-US',
              { year: 'numeric', month: 'long', day: 'numeric' },
            );
            await sendPurchaseConfirmationEmail({
              userId: clerkUserId,
              email: userRow[0].email,
              locale,
              plan: confirmPlan,
              nextChargeDate,
              subscriptionId: stripeSubscriptionId,
            });
          }
        } catch (emailErr) {
          console.error(
            '[stripe-webhook] purchase confirmation email failed (non-fatal)',
            emailErr instanceof Error ? emailErr.message : 'unknown',
          );
          try {
            const { captureException } = await import('@sentry/nextjs');
            captureException(emailErr, { tags: { webhook: 'stripe', email_type: 'purchase_confirmation' } });
          } catch {
            // Sentry capture is best-effort.
          }
        }

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
          .insert(users)
          .values({
            id: userId,
            email: `stripe-pending-${userId}@placeholder.invalid`,
            subscriptionTier: 'free',
            subscriptionExpiresAt: null,
            stripeSubscriptionId: null,
            plan: 'free',
            subscriptionStatus: 'canceled',
            trialEnd: null,
            currentPeriodEnd: null,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: users.id,
            set: {
              subscriptionTier: 'free',
              subscriptionExpiresAt: null,
              stripeSubscriptionId: null,
              plan: 'free',
              subscriptionStatus: 'canceled',
              trialEnd: null,
              currentPeriodEnd: null,
              updatedAt: new Date(),
            },
          });

        // Send cancellation confirmation email — best-effort.
        // accessEndDate = current_period_end (access continues until then).
        try {
          const { sendSubscriptionCanceledEmail } = await import('@/shared/lib/email');
          const userRow = await db
            .select({ email: users.email, locale: users.locale })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1);
          if (userRow.length > 0) {
            const locale = userRow[0].locale;
            const periodEnd = getSubscriptionPeriodEnd(sub);
            const accessEndDate = periodEnd
              ? new Date(periodEnd * 1000).toLocaleDateString(
                  locale === 'es' ? 'es' : 'en-US',
                  { year: 'numeric', month: 'long', day: 'numeric' },
                )
              : '';
            await sendSubscriptionCanceledEmail({
              userId,
              email: userRow[0].email,
              locale,
              accessEndDate,
              subscriptionId: sub.id,
            });
          }
        } catch (emailErr) {
          console.error(
            '[stripe-webhook] subscription canceled email failed (non-fatal)',
            emailErr instanceof Error ? emailErr.message : 'unknown',
          );
          try {
            const { captureException } = await import('@sentry/nextjs');
            captureException(emailErr, { tags: { webhook: 'stripe', email_type: 'subscription_canceled' } });
          } catch {
            // Sentry capture is best-effort.
          }
        }

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
      // Trial ending in ~3 days → send T-72h reminder email (step=reminder_3d).
      // The T-24h and T-0 emails are handled by /api/cron/trial-expiration.
      // -----------------------------------------------------------------------
      case 'customer.subscription.trial_will_end': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId =
          typeof sub.customer === 'string' ? sub.customer : sub.customer.id;

        const rows = await db
          .select({ id: users.id, email: users.email, locale: users.locale })
          .from(users)
          .where(eq(users.stripeCustomerId, customerId))
          .limit(1);

        if (!rows[0]?.email) {
          console.warn('[stripe-webhook] trial_will_end: user not found for customer', {
            customerId,
          });
          break;
        }

        try {
          const { sendTrialExpirationEmail } = await import('@/shared/lib/trial-expiration-email');
          const trialEndDate = sub.trial_end ? new Date(sub.trial_end * 1000) : new Date();
          await sendTrialExpirationEmail({
            subscriptionId: sub.id,
            userId: rows[0].id,
            email: rows[0].email,
            locale: (rows[0].locale ?? 'en') as 'en' | 'es',
            step: 'reminder_3d',
            trialEndDate,
            plan: derivePlan(sub),
          });
          console.info('[stripe-webhook] trial_will_end → reminder_3d sent', {
            customerId,
            subscriptionId: sub.id,
          });
        } catch (emailErr) {
          console.error(
            '[stripe-webhook] trial_will_end reminder_3d email failed (non-fatal)',
            emailErr instanceof Error ? emailErr.message : 'unknown',
          );
          try {
            const { captureException } = await import('@sentry/nextjs');
            captureException(emailErr, {
              tags: { webhook: 'stripe', email_type: 'trial_reminder_3d' },
            });
          } catch {
            // Sentry capture is best-effort.
          }
        }
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

        // Plain update by stripeCustomerId — this event always follows a
        // checkout.session.completed that already upserted the user row.
        // A missing row here means the upsert hasn't run yet (out-of-order
        // delivery); we log a warning but do not fail so Stripe doesn't retry.
        const invoiceUpdateResult = await db
          .update(users)
          .set({
            currentPeriodEnd: expiresAt,
            subscriptionExpiresAt: expiresAt,
            updatedAt: new Date(),
          })
          .where(eq(users.stripeCustomerId, customerId));

        if ((invoiceUpdateResult as { rowCount?: number }).rowCount === 0) {
          console.warn('[stripe-webhook] invoice.payment_succeeded: no user row for customer', {
            customerId,
          });
        }

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
    // Never log the raw err — it may serialize the Stripe event payload (emails, names, card info).
    console.error('[stripe-webhook] event processing error', {
      eventType: event.type,
      message: err instanceof Error ? err.message : 'unknown',
      name: err instanceof Error ? err.name : undefined,
    });
    try {
      const { captureException } = await import('@sentry/nextjs');
      captureException(err, { tags: { webhook: 'stripe', eventType: event.type } });
    } catch {
      // Sentry capture is best-effort; do not mask the 500 we return to Stripe.
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
// Type for all subscription statuses we write to DB (widened enum)
type DbSubscriptionStatus = 'free' | 'trialing' | 'active' | 'canceled' | 'past_due' | 'incomplete' | 'unpaid';

/**
 * Map Stripe subscription status to a DB-safe value.
 * 'incomplete_expired' and any unknown statuses fall back to 'canceled'.
 */
function toDbStatus(stripeStatus: string): DbSubscriptionStatus {
  const allowed: DbSubscriptionStatus[] = ['free', 'trialing', 'active', 'canceled', 'past_due', 'incomplete', 'unpaid'];
  if ((allowed as string[]).includes(stripeStatus)) return stripeStatus as DbSubscriptionStatus;
  return 'canceled';
}

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
  const dbStatus = toDbStatus(sub.status);

  const updatePayload = {
    subscriptionTier: tier,
    subscriptionExpiresAt: tier === 'free' ? null : expiresAt,
    stripeSubscriptionId: sub.id,
    plan,
    subscriptionStatus: dbStatus,
    trialEnd,
    currentPeriodEnd: expiresAt,
    updatedAt: new Date(),
  } as const;

  // Upsert: handles the case where subscription.updated arrives before
  // checkout.session.completed or before the Clerk user.created webhook.
  await db
    .insert(users)
    .values({
      id: userId,
      email: `stripe-pending-${userId}@placeholder.invalid`,
      ...updatePayload,
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        ...updatePayload,
        // Keep existing email if already set
        email: sql`${users.email}`,
      },
    });

  console.info('[stripe-webhook] subscription.updated', {
    userId,
    status: sub.status,
    tier,
    plan,
    expiresAt,
  });
}
