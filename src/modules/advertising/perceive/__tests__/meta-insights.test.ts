import { describe, it, expect } from 'vitest';
import { fetchMetaInsights } from '../meta-insights';
import { mockMetaApi } from '../../__tests__/mocks/meta-api';
import { mockAdMetric } from '../../__tests__/fixtures';

describe('fetchMetaInsights', () => {
  it('returns AdMetric[] for active ads in date range', async () => {
    const api = mockMetaApi();
    api.getInsights.mockResolvedValue([
      mockAdMetric({ ad_id: 'a1' }),
      mockAdMetric({ ad_id: 'a2' }),
    ]);

    const result = await fetchMetaInsights({
      apiClient: api,
      dateFrom: '2026-04-25',
      dateTo: '2026-04-26',
    });

    expect(result).toHaveLength(2);
    expect(result[0].ad_id).toBe('a1');
    expect(api.getInsights).toHaveBeenCalledWith({
      time_range: { since: '2026-04-25', until: '2026-04-26' },
      level: 'ad',
      fields: expect.arrayContaining(['impressions', 'clicks', 'spend', 'ctr', 'cpc', 'frequency']),
    });
  });

  it('handles rate-limit errors with exponential backoff', async () => {
    const api = mockMetaApi();
    api.getInsights
      .mockRejectedValueOnce({ code: 17, message: 'rate limit' })
      .mockResolvedValueOnce([mockAdMetric()]);

    const result = await fetchMetaInsights({
      apiClient: api,
      dateFrom: '2026-04-25',
      dateTo: '2026-04-26',
      retryBaseMs: 0, // no sleep in tests
    });
    expect(result).toHaveLength(1);
    expect(api.getInsights).toHaveBeenCalledTimes(2);
  });

  it('re-throws non-rate-limit errors immediately', async () => {
    const api = mockMetaApi();
    api.getInsights.mockRejectedValue({ code: 100, message: 'invalid param' });

    await expect(fetchMetaInsights({ apiClient: api, dateFrom: '2026-04-25', dateTo: '2026-04-26', retryBaseMs: 0 }))
      .rejects.toMatchObject({ code: 100 });
    expect(api.getInsights).toHaveBeenCalledTimes(1);
  });

  it('exhausts retries and throws after 3 rate-limit failures', async () => {
    const api = mockMetaApi();
    api.getInsights
      .mockRejectedValueOnce({ code: 17, message: 'rate limit' })
      .mockRejectedValueOnce({ code: 17, message: 'rate limit' })
      .mockRejectedValueOnce({ code: 17, message: 'rate limit' });

    await expect(fetchMetaInsights({ apiClient: api, dateFrom: '2026-04-25', dateTo: '2026-04-26', retryBaseMs: 0 }))
      .rejects.toMatchObject({ code: 17 });
    expect(api.getInsights).toHaveBeenCalledTimes(3);
  });
});
