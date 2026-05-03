/**
 * Stripe-backed source for the exclusion Custom Audience.
 *
 * Returns the deduplicated list of currently-active subscribers as
 * `{ email_hash, user_id }` records. Emails are SHA-256-hashed at the
 * boundary here so no plain-text PII flows downstream — this is the
 * contract enforced by `ExclusionsStripeClient` in `exclusions.ts`.
 *
 * Used by `audience-refresh` cron (daily) to build the exclusion list
 * for paid subscribers (don't retarget existing customers with
 * acquisition ads).
 */

import { createHash } from 'crypto';
import type Stripe from 'stripe';
import { getStripe } from '@/shared/lib/stripe';

interface StripeSubscriptionLike {
  id: string;
  customer: Stripe.Customer | string | null;
}

interface StripeListPage {
  data: StripeSubscriptionLike[];
  has_more: boolean;
}

export interface ActiveCustomerRecord {
  email_hash: string;
  user_id: string;
}

/**
 * Returns the deduplicated, lowercased + SHA-256-hashed email list of
 * all currently-active Stripe subscriptions.
 *
 * Subscriptions whose customer has been deleted, expanded only as a string
 * id, or whose email field is null/empty, are silently skipped.
 *
 * Pagination follows the standard Stripe `has_more` + `starting_after` cursor.
 */
export async function listActiveCustomers(): Promise<ActiveCustomerRecord[]> {
  const stripe = getStripe();

  // Map keyed by hashed email for deduplication; first-seen user_id wins.
  const byHash = new Map<string, ActiveCustomerRecord>();
  let starting_after: string | undefined;

  for (;;) {
    const page = (await stripe.subscriptions.list({
      status: 'active',
      limit: 100,
      expand: ['data.customer'],
      ...(starting_after ? { starting_after } : {}),
    })) as unknown as StripeListPage;

    for (const sub of page.data) {
      const cust = sub.customer;
      if (!cust || typeof cust === 'string') continue;
      const email = cust.email;
      if (!email || typeof email !== 'string') continue;
      const hash = sha256NormalisedEmail(email);
      if (byHash.has(hash)) continue;
      byHash.set(hash, { email_hash: hash, user_id: cust.id });
    }

    if (!page.has_more) break;
    const last = page.data[page.data.length - 1];
    if (!last) break;
    starting_after = last.id;
  }

  return Array.from(byHash.values());
}

function sha256NormalisedEmail(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}
