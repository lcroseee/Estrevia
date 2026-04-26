import type {
  AdMetric,
  FunnelSnapshot,
  StripeAttribution,
} from '@/shared/types/advertising';

export const mockAdMetric = (overrides?: Partial<AdMetric>): AdMetric => ({
  ad_id: 'ad_test_001',
  adset_id: 'adset_test_001',
  campaign_id: 'campaign_test_001',
  date: '2026-04-26',
  impressions: 5247,
  clicks: 87,
  spend_usd: 18.40,
  ctr: 0.0166,
  cpc: 0.21,
  cpm: 3.51,
  frequency: 1.4,
  reach: 3748,
  days_running: 7,
  status: 'ACTIVE',
  ...overrides,
});

export const mockFunnelSnapshot = (overrides?: Partial<FunnelSnapshot>): FunnelSnapshot => ({
  window_start: new Date('2026-04-25T00:00:00Z'),
  window_end: new Date('2026-04-26T00:00:00Z'),
  steps: [
    { event_name: 'landing_view', count: 87, unique_users: 87, conversion_from_previous: 1.0 },
    { event_name: 'chart_calculated', count: 39, unique_users: 39, conversion_from_previous: 0.45 },
    { event_name: 'passport_shared', count: 5, unique_users: 5, conversion_from_previous: 0.13 },
    { event_name: 'user_registered', count: 7, unique_users: 7, conversion_from_previous: 0.18 },
    { event_name: 'paywall_view', count: 6, unique_users: 6, conversion_from_previous: 0.86 },
    { event_name: 'subscription_started', count: 1, unique_users: 1, conversion_from_previous: 0.17 },
  ],
  ...overrides,
});

export const mockStripeAttribution = (overrides?: Partial<StripeAttribution>): StripeAttribution => ({
  subscription_id: 'sub_test_001',
  user_id: 'user_test_001',
  amount_usd: 9.99,
  created_at: new Date('2026-04-25T15:30:00Z'),
  utm_source: 'meta',
  utm_campaign: 'estrevia_launch_en',
  utm_content: 'ad_test_001',
  first_touch_source: 'meta',
  ...overrides,
});
