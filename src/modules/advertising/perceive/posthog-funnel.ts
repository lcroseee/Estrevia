import type { FunnelSnapshot, FunnelEvent } from '@/shared/types/advertising';
import type { MockPosthog } from '../__tests__/mocks/posthog';

export interface PosthogFunnelApi {
  getFunnel(opts: {
    date_from: string;
    date_to: string;
    filters?: { utm_source?: string; ad_id?: string };
  }): Promise<FunnelSnapshot>;
}

export interface FetchFunnelSnapshotOptions {
  apiClient: MockPosthog | PosthogFunnelApi;
  windowStart: Date;
  windowEnd: Date;
  filter?: { utm_source?: string; ad_id?: string };
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
  const { apiClient, windowStart, windowEnd, filter } = opts;

  const raw = await apiClient.getFunnel({
    date_from: windowStart.toISOString(),
    date_to: windowEnd.toISOString(),
    ...(filter ? { filters: filter } : {}),
  });

  return {
    window_start: windowStart,
    window_end: windowEnd,
    source_filter: filter,
    steps: normalizeConversions(raw.steps),
  };
}
