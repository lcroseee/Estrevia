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
}

/**
 * Fetches Stripe subscriptions created in the given time window and returns
 * them as StripeAttribution records including UTM/first-touch metadata.
 *
 * The stripe client is expected to join utm data from the users table server-side
 * before returning records (the mock fixture already includes utm_content).
 * Optionally filters by adId (utm_content).
 */
export async function fetchStripeAttribution(
  opts: FetchStripeAttributionOptions,
): Promise<StripeAttribution[]> {
  const { apiClient, windowStart, windowEnd, adId } = opts;

  const records: StripeAttribution[] = await apiClient.listSubscriptionsCreatedBetween({
    created_gte: windowStart,
    created_lt: windowEnd,
  });

  if (adId !== undefined) {
    return records.filter((r) => r.utm_content === adId);
  }

  return records;
}
