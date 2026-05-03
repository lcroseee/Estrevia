import type { FunnelSnapshot, FunnelEvent } from '@/shared/types/advertising';
import type { MockPosthog } from '../__tests__/mocks/posthog';

export interface PosthogFunnelApi {
  getFunnel(opts: {
    date_from: string;
    date_to: string;
    filters?: { utm_source?: string; ad_id?: string };
    /**
     * Q4 hybrid attribution window. Default 14 (PostHog ROAS/CPA window).
     * Reconciler callsite passes 7 to align with Meta `7d_click`.
     * Only meaningful when `filters.ad_id` is set; otherwise ignored.
     */
    attribution_window_days?: number;
  }): Promise<FunnelSnapshot>;
}

export interface FetchFunnelSnapshotOptions {
  apiClient: MockPosthog | PosthogFunnelApi;
  windowStart: Date;
  windowEnd: Date;
  filter?: { utm_source?: string; ad_id?: string };
  /**
   * Forwarded to `getFunnel.attribution_window_days`. Default 14 days.
   * Reconciler use case (apples-to-apples vs Meta `7d_click`): pass 7.
   * Only takes effect when `filter.ad_id` is set.
   */
  attributionWindowDays?: number;
}

/**
 * Recalculates conversion_from_previous for each step to ensure consistency.
 * First step is always 1.0. Steps after a zero-count previous step are set to 0.
 */
function normalizeConversions(steps: FunnelEvent[]): FunnelEvent[] {
  return steps.map((step, i) => {
    if (i === 0) {
      return { ...step, conversion_from_previous: step.count === 0 ? 0 : 1.0 };
    }
    const prevCount = steps[i - 1].count;
    return {
      ...step,
      conversion_from_previous: prevCount === 0 ? 0 : step.count / prevCount,
    };
  });
}

/**
 * Fetches a funnel snapshot from PostHog for the given time window and optional
 * UTM/ad_id filter. Returns a FunnelSnapshot with recalculated conversion rates.
 */
export async function fetchFunnelSnapshot(opts: FetchFunnelSnapshotOptions): Promise<FunnelSnapshot> {
  const { apiClient, windowStart, windowEnd, filter, attributionWindowDays } = opts;

  const raw = await apiClient.getFunnel({
    date_from: windowStart.toISOString(),
    date_to: windowEnd.toISOString(),
    ...(filter ? { filters: filter } : {}),
    ...(attributionWindowDays !== undefined ? { attribution_window_days: attributionWindowDays } : {}),
  });

  return {
    window_start: windowStart,
    window_end: windowEnd,
    source_filter: filter,
    steps: normalizeConversions(raw.steps),
  };
}
