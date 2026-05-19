import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchConversionWindows } from '../conversion-windows';
import { mockMetaApi } from '../../__tests__/mocks/meta-api';
import { mockAdMetric } from '../../__tests__/fixtures';

describe('fetchConversionWindows', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('calls getInsights twice with 7d and 28d date ranges and matching windowKeys', async () => {
    const api = mockMetaApi();
    api.getInsights
      .mockResolvedValueOnce([mockAdMetric({ ad_id: 'a7', conversions_7d: 12 })])
      .mockResolvedValueOnce([mockAdMetric({ ad_id: 'a28', conversions_total: 47 })]);

    const result = await fetchConversionWindows({
      apiClient: api,
      todayStr: '2026-05-18',
      retryBaseMs: 0,
    });

    expect(api.getInsights).toHaveBeenCalledTimes(2);
    expect(api.getInsights).toHaveBeenNthCalledWith(1, expect.objectContaining({
      time_range: { since: '2026-05-12', until: '2026-05-18' },
      windowKey: 'conversions_7d',
      action_attribution_windows: ['7d_click'],
    }));
    expect(api.getInsights).toHaveBeenNthCalledWith(2, expect.objectContaining({
      time_range: { since: '2026-04-21', until: '2026-05-18' },
      windowKey: 'conversions_total',
      action_attribution_windows: ['7d_click'],
    }));

    expect(result.metrics7d?.[0].ad_id).toBe('a7');
    expect(result.metrics28d?.[0].ad_id).toBe('a28');
  });

  it('returns metrics7d=null when 7d call rejects, but preserves successful 28d', async () => {
    const api = mockMetaApi();
    api.getInsights
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce([mockAdMetric({ ad_id: 'a28' })]);

    const result = await fetchConversionWindows({
      apiClient: api,
      todayStr: '2026-05-18',
      retryBaseMs: 0,
    });

    expect(result.metrics7d).toBeNull();
    expect(result.metrics28d?.[0].ad_id).toBe('a28');
  });

  it('returns both null when both calls reject', async () => {
    const api = mockMetaApi();
    api.getInsights
      .mockRejectedValueOnce(new Error('boom'))
      .mockRejectedValueOnce(new Error('boom'));

    const result = await fetchConversionWindows({
      apiClient: api,
      todayStr: '2026-05-18',
      retryBaseMs: 0,
    });

    expect(result.metrics7d).toBeNull();
    expect(result.metrics28d).toBeNull();
  });
});
