import type { StripeAttribution } from '@/shared/types/advertising';
import type { MockStripe } from '../__tests__/mocks/stripe';

export interface StripeAttributionApi {
  listSubscriptionsCreatedBetween(opts: {
    created_gte: Date;
    created_lt: Date;
  }): Promise<StripeAttribution[]>;
}

export interface FetchStripeAttributionOptions {
  apiClient: MockStripe | StripeAttributionApi;
  windowStart: Date;
  windowEnd: Date;
  /** Optional ad_id filter — only return attributions matching utm_content */
  adId?: string;
  /**
   * Q4 hybrid: Stripe revenue uses a 14-day window from `utm_click_timestamp`.
   * Defaults to 14 if unspecified. Reconciler may override to align with Meta
   * (7-day) when comparing reported revenue against ad-level conversions.
   */
  attributionWindowDays?: number;
}

/**
 * Fetches Stripe subscriptions created in the given time window and returns
 * them as StripeAttribution records including UTM/first-touch metadata.
 *
 * The stripe client is expected to join utm data from the users table server-side
 * before returning records (the mock fixture already includes utm_content).
 * Records whose `created_at - utm_click_timestamp` exceeds
 * `attributionWindowDays` (default 14) are dropped — these subs were created
 * outside the click-attribution window and should not be credited to the ad.
 * Legacy subs without `utm_click_timestamp` pass through unchanged (they're
 * already constrained to `[windowStart, windowEnd)` by the Stripe-side filter).
 * Optionally filters by adId (utm_content).
 */
export async function fetchStripeAttribution(
  opts: FetchStripeAttributionOptions,
): Promise<StripeAttribution[]> {
  const { apiClient, windowStart, windowEnd, adId, attributionWindowDays = 14 } = opts;

  const records: StripeAttribution[] = await apiClient.listSubscriptionsCreatedBetween({
    created_gte: windowStart,
    created_lt: windowEnd,
  });

  const windowMs = attributionWindowDays * 24 * 60 * 60 * 1000;

  const inAttributionWindow = records.filter((r) => {
    if (!r.utm_click_timestamp) {
      // Legacy sub without click timestamp metadata — accept on created_at
      // timing (already within [windowStart, windowEnd) by Stripe's filter).
      return true;
    }
    const clickTs = new Date(r.utm_click_timestamp).getTime();
    const subTs = new Date(r.created_at).getTime();
    return subTs >= clickTs && subTs - clickTs <= windowMs;
  });

  if (adId !== undefined) {
    return inAttributionWindow.filter((r) => r.utm_content === adId);
  }

  return inAttributionWindow;
}
