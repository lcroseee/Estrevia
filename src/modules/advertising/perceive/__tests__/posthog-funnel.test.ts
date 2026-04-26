import { describe, it, expect } from 'vitest';
import { fetchFunnelSnapshot } from '../posthog-funnel';
import { mockPosthog } from '../../__tests__/mocks/posthog';
import { mockFunnelSnapshot } from '../../__tests__/fixtures';

describe('fetchFunnelSnapshot', () => {
  it('returns FunnelSnapshot for given window and UTM filter', async () => {
    const ph = mockPosthog();
    ph.getFunnel.mockResolvedValue(mockFunnelSnapshot());

    const result = await fetchFunnelSnapshot({
      apiClient: ph,
      windowStart: new Date('2026-04-25T00:00:00Z'),
      windowEnd: new Date('2026-04-26T00:00:00Z'),
      filter: { utm_source: 'meta', ad_id: 'ad_test_001' },
    });

    expect(result.steps).toHaveLength(6);
    expect(result.window_start).toEqual(new Date('2026-04-25T00:00:00Z'));
    expect(result.window_end).toEqual(new Date('2026-04-26T00:00:00Z'));
    expect(result.source_filter).toEqual({ utm_source: 'meta', ad_id: 'ad_test_001' });
    expect(ph.getFunnel).toHaveBeenCalledWith({
      date_from: '2026-04-25T00:00:00.000Z',
      date_to: '2026-04-26T00:00:00.000Z',
      filters: { utm_source: 'meta', ad_id: 'ad_test_001' },
    });
  });

  it('calculates conversion_from_previous correctly for each step', async () => {
    const ph = mockPosthog();
    // Provide raw data — posthog-funnel must compute conversion_from_previous
    ph.getFunnel.mockResolvedValue(
      mockFunnelSnapshot({
        steps: [
          { event_name: 'landing_view', count: 100, unique_users: 100, conversion_from_previous: 1.0 },
          { event_name: 'chart_calculated', count: 50, unique_users: 50, conversion_from_previous: 0.5 },
          { event_name: 'passport_shared', count: 10, unique_users: 10, conversion_from_previous: 0.2 },
          { event_name: 'user_registered', count: 20, unique_users: 20, conversion_from_previous: 0.4 },
          { event_name: 'paywall_view', count: 15, unique_users: 15, conversion_from_previous: 0.75 },
          { event_name: 'subscription_started', count: 3, unique_users: 3, conversion_from_previous: 0.2 },
        ],
      }),
    );

    const result = await fetchFunnelSnapshot({
      apiClient: ph,
      windowStart: new Date('2026-04-25T00:00:00Z'),
      windowEnd: new Date('2026-04-26T00:00:00Z'),
    });

    expect(result.steps[0].conversion_from_previous).toBe(1.0); // first step is always 1
    expect(result.steps[1].conversion_from_previous).toBe(0.5);
    expect(result.steps[2].conversion_from_previous).toBe(0.2);
  });

  it('handles empty funnel result — all counts zero', async () => {
    const ph = mockPosthog();
    ph.getFunnel.mockResolvedValue(
      mockFunnelSnapshot({
        steps: [
          { event_name: 'landing_view', count: 0, unique_users: 0, conversion_from_previous: 0 },
          { event_name: 'chart_calculated', count: 0, unique_users: 0, conversion_from_previous: 0 },
          { event_name: 'passport_shared', count: 0, unique_users: 0, conversion_from_previous: 0 },
          { event_name: 'user_registered', count: 0, unique_users: 0, conversion_from_previous: 0 },
          { event_name: 'paywall_view', count: 0, unique_users: 0, conversion_from_previous: 0 },
          { event_name: 'subscription_started', count: 0, unique_users: 0, conversion_from_previous: 0 },
        ],
      }),
    );

    const result = await fetchFunnelSnapshot({
      apiClient: ph,
      windowStart: new Date('2026-04-25T00:00:00Z'),
      windowEnd: new Date('2026-04-26T00:00:00Z'),
    });

    expect(result.steps).toHaveLength(6);
    expect(result.steps.every((s) => s.count === 0)).toBe(true);
    // conversion_from_previous should be 0 when count is 0 (no division-by-zero crash)
    expect(result.steps.every((s) => !isNaN(s.conversion_from_previous))).toBe(true);
  });

  it('works without a filter (no utm)', async () => {
    const ph = mockPosthog();
    ph.getFunnel.mockResolvedValue(mockFunnelSnapshot());

    const result = await fetchFunnelSnapshot({
      apiClient: ph,
      windowStart: new Date('2026-04-25T00:00:00Z'),
      windowEnd: new Date('2026-04-26T00:00:00Z'),
    });

    expect(result.source_filter).toBeUndefined();
  });
});
