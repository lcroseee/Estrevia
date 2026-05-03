import { describe, it, expect, vi } from 'vitest';
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

  describe('attribution window', () => {
    it('drops subs whose subscription is older than attributionWindowDays from utm_click_timestamp', async () => {
      const apiClient = {
        listSubscriptionsCreatedBetween: vi.fn().mockResolvedValue([
          mockStripeAttribution({
            subscription_id: 'sub_in',
            user_id: 'user_1',
            created_at: new Date('2026-04-21T12:00:00Z'), // 5 days after click
            utm_content: 'AD_X',
            utm_click_timestamp: '2026-04-16T12:00:00Z',
          }),
          mockStripeAttribution({
            subscription_id: 'sub_out',
            user_id: 'user_2',
            created_at: new Date('2026-04-30T12:00:00Z'), // 30 days after click — out of 14d window
            utm_content: 'AD_X',
            utm_click_timestamp: '2026-03-31T12:00:00Z',
          }),
        ]),
      };

      const result = await fetchStripeAttribution({
        apiClient,
        windowStart: new Date('2026-04-01T00:00:00Z'),
        windowEnd: new Date('2026-05-01T00:00:00Z'),
      });

      expect(result.map((r) => r.subscription_id)).toEqual(['sub_in']);
    });

    it('keeps legacy subs without utm_click_timestamp', async () => {
      const apiClient = {
        listSubscriptionsCreatedBetween: vi.fn().mockResolvedValue([
          mockStripeAttribution({
            subscription_id: 'sub_legacy',
            user_id: 'user_3',
            created_at: new Date('2026-04-21T12:00:00Z'),
            utm_content: 'AD_Y',
            utm_click_timestamp: undefined,
          }),
        ]),
      };

      const result = await fetchStripeAttribution({
        apiClient,
        windowStart: new Date('2026-04-01T00:00:00Z'),
        windowEnd: new Date('2026-05-01T00:00:00Z'),
      });

      expect(result.map((r) => r.subscription_id)).toEqual(['sub_legacy']);
    });

    it('honours custom attributionWindowDays', async () => {
      const eightDaysAfterClick = mockStripeAttribution({
        subscription_id: 'sub_8d',
        user_id: 'user_1',
        created_at: new Date('2026-04-21T12:00:00Z'),
        utm_content: 'AD_X',
        utm_click_timestamp: '2026-04-13T12:00:00Z', // 8 days before sub
      });

      const apiClient = {
        listSubscriptionsCreatedBetween: vi.fn().mockResolvedValue([eightDaysAfterClick]),
      };

      const within14 = await fetchStripeAttribution({
        apiClient,
        windowStart: new Date('2026-04-01T00:00:00Z'),
        windowEnd: new Date('2026-05-01T00:00:00Z'),
        attributionWindowDays: 14,
      });
      expect(within14).toHaveLength(1);

      apiClient.listSubscriptionsCreatedBetween.mockResolvedValueOnce([eightDaysAfterClick]);
      const within7 = await fetchStripeAttribution({
        apiClient,
        windowStart: new Date('2026-04-01T00:00:00Z'),
        windowEnd: new Date('2026-05-01T00:00:00Z'),
        attributionWindowDays: 7,
      });
      expect(within7).toHaveLength(0);
    });
  });
});
