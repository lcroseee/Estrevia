import type { AdMetric } from '@/shared/types/advertising';
import type { MetaInsightsApi, FetchMetaInsightsOptions } from './meta-insights';
import type { MockMetaApi } from '../__tests__/mocks/meta-api';
import { fetchMetaInsights } from './meta-insights';

export interface ConversionWindows {
  /** Per-ad metrics with `conversions_7d` populated. `null` when the fetch threw. */
  metrics7d: AdMetric[] | null;
  /** Per-ad metrics with `conversions_total` populated. `null` when the fetch threw. */
  metrics28d: AdMetric[] | null;
}

export interface FetchConversionWindowsOptions {
  apiClient: MockMetaApi | MetaInsightsApi;
  /** Today's date as YYYY-MM-DD (UTC). The 7d window is today-6 → today, the 28d window is today-27 → today. */
  todayStr: string;
  retryBaseMs?: number;
  maxRetries?: number;
}

/**
 * Fetches Meta /insights twice — once for the 7-day rolling window and once
 * for the 28-day rolling window — with per-window error isolation.
 *
 * Both calls request `action_attribution_windows=['7d_click']` so each
 * AdMetric's `conversions_7d` / `conversions_total` reflects 7-day-click
 * lead attribution. The `windowKey` distinguishes which field gets populated
 * (see `toAdMetric` in `meta-graph-api/ad-client.ts`).
 *
 * Returning `null` for a window signals "fetch threw" — the caller MUST omit
 * the corresponding conversion field from `upsertAdSetState` so the schema's
 * `notNull().default(0)` value is preserved instead of overwritten with zeros.
 */
export async function fetchConversionWindows(
  opts: FetchConversionWindowsOptions,
): Promise<ConversionWindows> {
  const { apiClient, todayStr, retryBaseMs, maxRetries } = opts;
  const from7d = isoDateAddDays(todayStr, -6);
  const from28d = isoDateAddDays(todayStr, -27);

  const baseOpts: Omit<FetchMetaInsightsOptions, 'dateFrom' | 'dateTo' | 'windowKey'> = {
    apiClient,
    retryBaseMs,
    maxRetries,
    action_attribution_windows: ['7d_click'],
  };

  const [r7d, r28d] = await Promise.allSettled([
    fetchMetaInsights({ ...baseOpts, dateFrom: from7d, dateTo: todayStr, windowKey: 'conversions_7d' }),
    fetchMetaInsights({ ...baseOpts, dateFrom: from28d, dateTo: todayStr, windowKey: 'conversions_total' }),
  ]);

  return {
    metrics7d: r7d.status === 'fulfilled' ? r7d.value : null,
    metrics28d: r28d.status === 'fulfilled' ? r28d.value : null,
  };
}

function isoDateAddDays(yyyyMmDd: string, days: number): string {
  const d = new Date(`${yyyyMmDd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
