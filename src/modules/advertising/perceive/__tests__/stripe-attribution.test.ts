import { describe, it, expect } from 'vitest';
import { fetchStripeAttribution } from '../stripe-attribution';
import { mockStripe } from '../../__tests__/mocks/stripe';
import { mockStripeAttribution } from '../../__tests__/fixtures';

describe('fetchStripeAttribution', () => {
  it('returns StripeAttribution[] for subscriptions created in window', async () => {
    const stripe = mockStripe();
    stripe.listSubscriptionsCreatedBetween.mockResolvedValue([
      mockStripeAttribution({ subscription_id: 'sub_001' }),
      mockStripeAttribution({ subscription_id: 'sub_002', utm_content: 'ad_test_002' }),
    ]);

    const result = await fetchStripeAttribution({
      apiClient: stripe,
      windowStart: new Date('2026-04-25T00:00:00Z'),
      windowEnd: new Date('2026-04-26T00:00:00Z'),
    });

    expect(result).toHaveLength(2);
    expect(result[0].subscription_id).toBe('sub_001');
    expect(result[1].utm_content).toBe('ad_test_002');
    expect(stripe.listSubscriptionsCreatedBetween).toHaveBeenCalledWith({
      created_gte: new Date('2026-04-25T00:00:00Z'),
      created_lt: new Date('2026-04-26T00:00:00Z'),
    });
  });

  it('joins utm_content (ad_id) from subscription metadata', async () => {
    const stripe = mockStripe();
    stripe.listSubscriptionsCreatedBetween.mockResolvedValue([
      mockStripeAttribution({ utm_content: 'ad_test_001', utm_source: 'meta' }),
    ]);

    const result = await fetchStripeAttribution({
      apiClient: stripe,
      windowStart: new Date('2026-04-25T00:00:00Z'),
      windowEnd: new Date('2026-04-26T00:00:00Z'),
    });

    expect(result[0].utm_content).toBe('ad_test_001');
    expect(result[0].utm_source).toBe('meta');
  });

  it('preserves first_touch_source from attribution data', async () => {
    const stripe = mockStripe();
    stripe.listSubscriptionsCreatedBetween.mockResolvedValue([
      mockStripeAttribution({ first_touch_source: 'meta', utm_campaign: 'estrevia_launch_en' }),
    ]);

    const result = await fetchStripeAttribution({
      apiClient: stripe,
      windowStart: new Date('2026-04-25T00:00:00Z'),
      windowEnd: new Date('2026-04-26T00:00:00Z'),
    });

    expect(result[0].first_touch_source).toBe('meta');
    expect(result[0].utm_campaign).toBe('estrevia_launch_en');
  });

  it('returns empty array when no subscriptions in window', async () => {
    const stripe = mockStripe();
    stripe.listSubscriptionsCreatedBetween.mockResolvedValue([]);

    const result = await fetchStripeAttribution({
      apiClient: stripe,
      windowStart: new Date('2026-04-25T00:00:00Z'),
      windowEnd: new Date('2026-04-26T00:00:00Z'),
    });

    expect(result).toHaveLength(0);
  });

  it('filters by ad_id when provided', async () => {
    const stripe = mockStripe();
    stripe.listSubscriptionsCreatedBetween.mockResolvedValue([
      mockStripeAttribution({ utm_content: 'ad_test_001' }),
      mockStripeAttribution({ utm_content: 'ad_test_002', subscription_id: 'sub_other' }),
    ]);

    const result = await fetchStripeAttribution({
      apiClient: stripe,
      windowStart: new Date('2026-04-25T00:00:00Z'),
      windowEnd: new Date('2026-04-26T00:00:00Z'),
      adId: 'ad_test_001',
    });

    expect(result).toHaveLength(1);
    expect(result[0].utm_content).toBe('ad_test_001');
  });
});
