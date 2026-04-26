import { describe, it, expect } from 'vitest';
import { reconcile } from '../reconciler';
import { fetchMetaInsights } from '../meta-insights';
import { fetchFunnelSnapshot } from '../posthog-funnel';
import { fetchStripeAttribution } from '../stripe-attribution';
import { mockMetaApi } from '../../__tests__/mocks/meta-api';
import { mockPosthog } from '../../__tests__/mocks/posthog';
import { mockStripe } from '../../__tests__/mocks/stripe';
import { mockTelegramBot } from '../../__tests__/mocks/telegram';
import { mockAdMetric, mockFunnelSnapshot, mockStripeAttribution } from '../../__tests__/fixtures';

// ─── Unit tests for reconcile() ──────────────────────────────────────────────

describe('reconcile', () => {
  it('returns match status when delta < 10%', async () => {
    const meta = [mockAdMetric({ clicks: 100 })];
    const funnel = mockFunnelSnapshot({
      steps: [
        { event_name: 'landing_view', count: 95, unique_users: 95, conversion_from_previous: 1.0 },
        { event_name: 'chart_calculated', count: 40, unique_users: 40, conversion_from_previous: 0.42 },
        { event_name: 'passport_shared', count: 5, unique_users: 5, conversion_from_previous: 0.13 },
        { event_name: 'user_registered', count: 7, unique_users: 7, conversion_from_previous: 0.18 },
        { event_name: 'paywall_view', count: 6, unique_users: 6, conversion_from_previous: 0.86 },
        { event_name: 'subscription_started', count: 1, unique_users: 1, conversion_from_previous: 0.17 },
      ],
    });

    const result = await reconcile(meta, funnel);

    expect(result.status).toBe('match');
    expect(result.meta_clicks).toBe(100);
    expect(result.posthog_landings).toBe(95);
    expect(result.delta_pct).toBeCloseTo(0.0526, 3); // |100-95|/95
    expect(result.threshold_minor).toBe(0.10);
    expect(result.threshold_critical).toBe(0.25);
  });

  it('returns minor_drift when delta >= 10% and < 25%', async () => {
    // 100 clicks vs 85 landings: |100-85|/85 ≈ 0.176 → minor_drift
    const meta = [mockAdMetric({ clicks: 100 })];
    const funnel = mockFunnelSnapshot({
      steps: [
        { event_name: 'landing_view', count: 85, unique_users: 85, conversion_from_previous: 1.0 },
        { event_name: 'chart_calculated', count: 38, unique_users: 38, conversion_from_previous: 0.45 },
        { event_name: 'passport_shared', count: 5, unique_users: 5, conversion_from_previous: 0.13 },
        { event_name: 'user_registered', count: 7, unique_users: 7, conversion_from_previous: 0.18 },
        { event_name: 'paywall_view', count: 6, unique_users: 6, conversion_from_previous: 0.86 },
        { event_name: 'subscription_started', count: 1, unique_users: 1, conversion_from_previous: 0.17 },
      ],
    });

    const result = await reconcile(meta, funnel);

    // |100-85|/85 ≈ 0.176 → minor_drift (>= 0.10 and < 0.25)
    expect(result.status).toBe('minor_drift');
    expect(result.delta_pct).toBeGreaterThanOrEqual(0.10);
    expect(result.delta_pct).toBeLessThan(0.25);
  });

  it('returns critical_drift when delta >= 25%', async () => {
    const meta = [mockAdMetric({ clicks: 200 })];
    const funnel = mockFunnelSnapshot({
      steps: [
        { event_name: 'landing_view', count: 100, unique_users: 100, conversion_from_previous: 1.0 },
        { event_name: 'chart_calculated', count: 45, unique_users: 45, conversion_from_previous: 0.45 },
        { event_name: 'passport_shared', count: 6, unique_users: 6, conversion_from_previous: 0.13 },
        { event_name: 'user_registered', count: 8, unique_users: 8, conversion_from_previous: 0.18 },
        { event_name: 'paywall_view', count: 7, unique_users: 7, conversion_from_previous: 0.88 },
        { event_name: 'subscription_started', count: 1, unique_users: 1, conversion_from_previous: 0.14 },
      ],
    });

    const result = await reconcile(meta, funnel);

    expect(result.status).toBe('critical_drift');
    expect(result.delta_pct).toBe(1.0); // |200-100|/100 = 1.0
  });

  it('handles zero posthog_landings without NaN — returns 1.0 delta', async () => {
    const meta = [mockAdMetric({ clicks: 50 })];
    const funnel = mockFunnelSnapshot({
      steps: [
        { event_name: 'landing_view', count: 0, unique_users: 0, conversion_from_previous: 0 },
        { event_name: 'chart_calculated', count: 0, unique_users: 0, conversion_from_previous: 0 },
        { event_name: 'passport_shared', count: 0, unique_users: 0, conversion_from_previous: 0 },
        { event_name: 'user_registered', count: 0, unique_users: 0, conversion_from_previous: 0 },
        { event_name: 'paywall_view', count: 0, unique_users: 0, conversion_from_previous: 0 },
        { event_name: 'subscription_started', count: 0, unique_users: 0, conversion_from_previous: 0 },
      ],
    });

    const result = await reconcile(meta, funnel);

    expect(result.delta_pct).toBe(1.0);
    expect(result.status).toBe('critical_drift');
    expect(isNaN(result.delta_pct)).toBe(false);
  });

  it('sums clicks across multiple ad metrics', async () => {
    const meta = [
      mockAdMetric({ ad_id: 'a1', clicks: 60 }),
      mockAdMetric({ ad_id: 'a2', clicks: 40 }),
    ];
    const funnel = mockFunnelSnapshot({
      steps: [
        { event_name: 'landing_view', count: 98, unique_users: 98, conversion_from_previous: 1.0 },
        { event_name: 'chart_calculated', count: 44, unique_users: 44, conversion_from_previous: 0.45 },
        { event_name: 'passport_shared', count: 5, unique_users: 5, conversion_from_previous: 0.11 },
        { event_name: 'user_registered', count: 8, unique_users: 8, conversion_from_previous: 0.18 },
        { event_name: 'paywall_view', count: 7, unique_users: 7, conversion_from_previous: 0.88 },
        { event_name: 'subscription_started', count: 1, unique_users: 1, conversion_from_previous: 0.14 },
      ],
    });

    const result = await reconcile(meta, funnel);

    expect(result.meta_clicks).toBe(100); // 60 + 40
    expect(result.posthog_landings).toBe(98);
  });

  it('triggers Telegram alert on critical drift when bot is provided', async () => {
    const meta = [mockAdMetric({ clicks: 200 })];
    const funnel = mockFunnelSnapshot({
      steps: [
        { event_name: 'landing_view', count: 100, unique_users: 100, conversion_from_previous: 1.0 },
        { event_name: 'chart_calculated', count: 45, unique_users: 45, conversion_from_previous: 0.45 },
        { event_name: 'passport_shared', count: 6, unique_users: 6, conversion_from_previous: 0.13 },
        { event_name: 'user_registered', count: 8, unique_users: 8, conversion_from_previous: 0.18 },
        { event_name: 'paywall_view', count: 7, unique_users: 7, conversion_from_previous: 0.88 },
        { event_name: 'subscription_started', count: 1, unique_users: 1, conversion_from_previous: 0.14 },
      ],
    });
    const telegram = mockTelegramBot();

    await reconcile(meta, funnel, { alertBot: telegram });

    expect(telegram.sendMessage).toHaveBeenCalledTimes(1);
    expect(telegram.sendMessage).toHaveBeenCalledWith(
      expect.stringContaining('critical_drift'),
    );
  });

  it('does not trigger alert on minor_drift or match', async () => {
    const meta = [mockAdMetric({ clicks: 100 })];
    const funnel = mockFunnelSnapshot({
      steps: [
        { event_name: 'landing_view', count: 95, unique_users: 95, conversion_from_previous: 1.0 },
        { event_name: 'chart_calculated', count: 43, unique_users: 43, conversion_from_previous: 0.45 },
        { event_name: 'passport_shared', count: 6, unique_users: 6, conversion_from_previous: 0.14 },
        { event_name: 'user_registered', count: 8, unique_users: 8, conversion_from_previous: 0.18 },
        { event_name: 'paywall_view', count: 7, unique_users: 7, conversion_from_previous: 0.88 },
        { event_name: 'subscription_started', count: 1, unique_users: 1, conversion_from_previous: 0.14 },
      ],
    });
    const telegram = mockTelegramBot();

    await reconcile(meta, funnel, { alertBot: telegram });

    expect(telegram.sendMessage).not.toHaveBeenCalled();
  });
});

// ─── Integration test: full perceive layer with mocks ─────────────────────────

describe('perceive layer integration', () => {
  it('wires meta → posthog → stripe → reconciler end-to-end', async () => {
    // Arrange all three API mocks
    const metaApi = mockMetaApi();
    const phApi = mockPosthog();
    const stripeApi = mockStripe();
    const telegramApi = mockTelegramBot();

    metaApi.getInsights.mockResolvedValue([
      mockAdMetric({ ad_id: 'a1', clicks: 87 }),
    ]);
    phApi.getFunnel.mockResolvedValue(mockFunnelSnapshot()); // landing_view count=87 → exact match
    stripeApi.listSubscriptionsCreatedBetween.mockResolvedValue([
      mockStripeAttribution({ utm_content: 'a1' }),
    ]);

    // Act — call each perceive function in sequence
    const windowStart = new Date('2026-04-25T00:00:00Z');
    const windowEnd = new Date('2026-04-26T00:00:00Z');

    const metrics = await fetchMetaInsights({
      apiClient: metaApi,
      dateFrom: '2026-04-25',
      dateTo: '2026-04-26',
    });

    const snapshot = await fetchFunnelSnapshot({
      apiClient: phApi,
      windowStart,
      windowEnd,
      filter: { utm_source: 'meta', ad_id: 'a1' },
    });

    const attributions = await fetchStripeAttribution({
      apiClient: stripeApi,
      windowStart,
      windowEnd,
    });

    const result = await reconcile(metrics, snapshot, { alertBot: telegramApi });

    // Assert shape and values
    expect(metrics).toHaveLength(1);
    expect(snapshot.steps).toHaveLength(6);
    expect(attributions).toHaveLength(1);
    expect(attributions[0].utm_content).toBe('a1');

    expect(result.meta_clicks).toBe(87);
    expect(result.posthog_landings).toBe(87); // fixture landing_view count=87
    expect(result.delta_pct).toBe(0); // perfect match
    expect(result.status).toBe('match');
    expect(telegramApi.sendMessage).not.toHaveBeenCalled();
  });
});
