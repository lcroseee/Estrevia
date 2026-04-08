import Stripe from 'stripe';

/**
 * Singleton Stripe client.
 * Uses lazy initialization — safe for build time when STRIPE_SECRET_KEY may be absent.
 * API version pinned to a stable release; update when Stripe announces breaking changes.
 */

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY environment variable is not configured');
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-03-31.basil',
    });
  }
  return _stripe;
}

// Named export for direct use in route handlers
export const stripe = {
  get instance(): Stripe {
    return getStripe();
  },
};
