import type { AdMetric } from '@/shared/types/advertising';
import type { MockMetaApi } from '../__tests__/mocks/meta-api';

export interface MetaInsightsApi {
  getInsights(opts: {
    time_range: { since: string; until: string };
    level: string;
    fields: string[];
  }): Promise<AdMetric[]>;
}

export interface FetchMetaInsightsOptions {
  apiClient: MockMetaApi | MetaInsightsApi;
  dateFrom: string;
  dateTo: string;
  /** Base delay in ms for exponential backoff. Defaults to 1000ms; override in tests. */
  retryBaseMs?: number;
  maxRetries?: number;
}

const META_RATE_LIMIT_CODE = 17;

const META_FIELDS = [
  'impressions',
  'clicks',
  'spend',
  'ctr',
  'cpc',
  'cpm',
  'frequency',
  'reach',
] as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetches ad-level insights from Meta Marketing API for the given date range.
 * Retries up to maxRetries times on rate-limit errors (code 17) with
 * exponential backoff.
 */
export async function fetchMetaInsights(opts: FetchMetaInsightsOptions): Promise<AdMetric[]> {
  const { apiClient, dateFrom, dateTo, retryBaseMs = 1000, maxRetries = 3 } = opts;

  const query = {
    time_range: { since: dateFrom, until: dateTo },
    level: 'ad' as const,
    fields: [...META_FIELDS],
  };

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await apiClient.getInsights(query);
    } catch (err: unknown) {
      const isRateLimit =
        typeof err === 'object' &&
        err !== null &&
        (err as Record<string, unknown>).code === META_RATE_LIMIT_CODE;

      if (isRateLimit && attempt < maxRetries - 1) {
        await sleep(retryBaseMs * 2 ** attempt);
        continue;
      }

      throw err;
    }
  }

  // unreachable — loop always returns or throws
  throw new Error('fetchMetaInsights: exceeded max retries');
}
