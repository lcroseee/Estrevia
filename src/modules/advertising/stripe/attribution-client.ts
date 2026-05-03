import type Stripe from 'stripe';
import type { StripeAttribution } from '@/shared/types/advertising';
import type { StripeAttributionApi } from '@/modules/advertising/perceive/stripe-attribution';

/**
 * Stripe attribution client for the advertising agent.
 *
 * Lists subscriptions created in a time window and projects them into
 * `StripeAttribution` records for the perceive layer. UTM data is read from
 * `subscription.metadata.utm_*` — the checkout flow MUST attach UTM to the
 * subscription metadata for attribution to work end-to-end.
 *
 * Required `subscription.metadata` keys (set at checkout):
 *   user_id            — our internal user id (REQUIRED)
 *   utm_source         — e.g. "meta"
 *   utm_campaign       — e.g. "estrevia_launch_en"
 *   utm_content        — the ad_id we use for attribution joins
 *   first_touch_source — first-touch source captured at registration
 *
 * If `user_id` is absent the row is skipped (we cannot attribute it).
 *
 * Env var (validated at construction):
 *   STRIPE_SECRET_KEY  — server-side secret (sk_live_* or sk_test_*)
 */

/** Narrow shape we use from Stripe.Subscription so the SDK isn't a hard dependency in tests. */
export interface StripeListClient {
  subscriptions: {
    list(opts: Stripe.SubscriptionListParams): AsyncIterable<Stripe.Subscription>;
  };
}

export interface StripeAttributionClientConfig {
  stripe: StripeListClient;
}

export class StripeAttributionClient implements StripeAttributionApi {
  private readonly stripe: StripeListClient;

  constructor(config: StripeAttributionClientConfig) {
    this.stripe = config.stripe;
  }

  async listSubscriptionsCreatedBetween(opts: {
    created_gte: Date;
    created_lt: Date;
  }): Promise<StripeAttribution[]> {
    // Stripe expects unix seconds, not millis.
    const gte = Math.floor(opts.created_gte.getTime() / 1000);
    const lt = Math.floor(opts.created_lt.getTime() / 1000);

    const out: StripeAttribution[] = [];
    for await (const sub of this.stripe.subscriptions.list({
      created: { gte, lt },
      limit: 100,
    })) {
      const attribution = this.toAttribution(sub);
      if (attribution !== null) out.push(attribution);
    }
    return out;
  }

  /**
   * Builds an attribution row from a Stripe.Subscription. Returns null when
   * `user_id` is missing from metadata — without it we cannot join back to
   * an Estrevia user, so the row is unattributable.
   */
  private toAttribution(sub: Stripe.Subscription): StripeAttribution | null {
    const metadata = sub.metadata ?? {};
    const userId = metadata.user_id;
    if (!userId) return null;

    const firstItem = sub.items?.data?.[0];
    const unitAmountCents = firstItem?.price?.unit_amount ?? 0;
    const currency = firstItem?.price?.currency?.toLowerCase() ?? 'usd';

    // We only attribute USD subscriptions for now. Non-USD would need an FX
    // conversion; flag rather than guess.
    const amountUsd = currency === 'usd' ? unitAmountCents / 100 : 0;

    return {
      subscription_id: sub.id,
      user_id: userId,
      amount_usd: amountUsd,
      created_at: new Date(sub.created * 1000),
      utm_source: metadata.utm_source,
      utm_campaign: metadata.utm_campaign,
      utm_content: metadata.utm_content,
      first_touch_source: metadata.first_touch_source,
    };
  }
}

function readEnv(): { secretKey: string } {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error('STRIPE_SECRET_KEY is not set');
  return { secretKey };
}

function guardTestEnv(): void {
  if (process.env.VITEST === 'true' || process.env.NODE_ENV === 'test') {
    throw new Error('createStripeAttributionClient: Use mock in tests');
  }
}

export async function createStripeAttributionClient(): Promise<StripeAttributionClient> {
  guardTestEnv();
  const { secretKey } = readEnv();
  // Dynamic import keeps Stripe out of the test bundle and avoids loading
  // it when crons run with the kill switch on.
  const { default: Stripe } = await import('stripe');
  const stripe = new Stripe(secretKey);
  return new StripeAttributionClient({ stripe });
}
