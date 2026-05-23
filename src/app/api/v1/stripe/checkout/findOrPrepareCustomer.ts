import { createHash } from 'node:crypto';
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

/**
 * Build a Stripe idempotency key that is BOTH unique-per-intent and stable for
 * identical retries.
 *
 * Stripe rejects reuse of an idempotency key with *different* parameters
 * (`StripeIdempotencyError`). The previous key (`checkout:${anonId ?? 'noanon'}:
 * ${plan}:${day}`) was param-blind AND collapsed every cookieless anonymous
 * visitor onto the shared `'noanon'` bucket — so the day's first anonymous
 * checkout claimed the key and every later request with different params
 * (locale / utm / customer) hard-failed. See
 * docs/superpowers/plans/2026-05-23-checkout-idempotency-collision.md.
 *
 * The key now folds the request-defining params into a hash:
 *   - identical body (a genuine double-click) → identical key → Stripe dedups
 *     (the duplicate-customer protection this key was added for), and
 *   - any genuine difference → a different key → a fresh session, never a
 *     false `StripeIdempotencyError`.
 *
 * `identity` (userId / per-browser anonymous_id / random fallback) keeps
 * distinct users from ever sharing a key.
 */
export function buildCheckoutIdempotencyKey(input: {
  identity: string;
  plan: string;
  day: string;
  stripeLocale: string;
  localeFromBody?: string | null;
  utm: Record<string, string>;
  /** Resolved Stripe target: customer id, customer_email, or 'new'. */
  customer: string;
}): string {
  const sortedUtm = Object.keys(input.utm)
    .sort()
    .reduce<Record<string, string>>((acc, k) => {
      acc[k] = input.utm[k];
      return acc;
    }, {});
  const canonical = JSON.stringify({
    stripeLocale: input.stripeLocale,
    localeFromBody: input.localeFromBody ?? null,
    utm: sortedUtm,
    customer: input.customer,
  });
  const hash = createHash('sha256').update(canonical).digest('hex').slice(0, 32);
  return `checkout:${input.identity}:${input.plan}:${input.day}:${hash}`;
}
