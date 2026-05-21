import type Stripe from 'stripe';

/**
 * Outcome of looking up a Stripe customer by email before creating a Checkout session.
 *
 *   block  — caller must NOT create a new session; redirect to /settings.
 *   reuse  — caller must pass `customer: customerId` (not `customer_email`) to Checkout.
 *   create — no existing customer found; caller proceeds with the normal create-path.
 */
export type FindOrPrepareCustomerResult =
  | { kind: 'block'; reason: 'already_subscribed' }
  | { kind: 'reuse'; customerId: string }
  | { kind: 'create' };

const BLOCKING_STATUSES = new Set<Stripe.Subscription.Status>([
  'active',
  'trialing',
  'past_due',
]);

/**
 * Look up the most-recent Stripe customer matching this email and decide
 * whether to block (existing active/trialing/past_due sub), reuse (existing
 * customer w/ no live sub), or create (no match).
 *
 * Fail-open on customers.list (analytics-style errors must not block checkout).
 * Fail-closed on subscriptions.list (safer to deny than risk a duplicate sub).
 */
export async function findOrPrepareCustomer(
  stripe: Stripe,
  email: string,
): Promise<FindOrPrepareCustomerResult> {
  let existing: Stripe.Customer | undefined;
  try {
    const list = await stripe.customers.list({ email, limit: 1 });
    existing = list.data[0];
  } catch {
    return { kind: 'create' };
  }
  if (!existing) return { kind: 'create' };

  let subs: Stripe.ApiList<Stripe.Subscription>;
  try {
    subs = await stripe.subscriptions.list({
      customer: existing.id,
      status: 'all',
      limit: 5,
    });
  } catch {
    return { kind: 'block', reason: 'already_subscribed' };
  }

  const blocking = subs.data.find((s) => BLOCKING_STATUSES.has(s.status));
  if (blocking) return { kind: 'block', reason: 'already_subscribed' };

  return { kind: 'reuse', customerId: existing.id };
}

/**
 * UTC calendar date as YYYY-MM-DD. Used as the day-bucket portion of the
 * checkout idempotency-key so the same anonymous_id (or user_id) + plan
 * combination resolves to the same Stripe Checkout session for 24h.
 *
 * Accepts an optional `now` parameter for testability; defaults to current time.
 */
export function utcDayBucket(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}
