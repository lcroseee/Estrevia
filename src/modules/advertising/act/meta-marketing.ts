/**
 * Meta Marketing API client interface.
 *
 * This thin wrapper defines the interface used by the act layer so that
 * dependency injection (and mocking in tests) works cleanly.
 * The concrete implementation will call `facebook-nodejs-business-sdk` or
 * the Meta Graph API directly — that lives in a separate adapter (Phase 2).
 *
 * For MVP, the `MockMetaApi` from `__tests__/mocks/meta-api.ts` satisfies
 * this interface.
 */

import type { AdMetric } from '@/shared/types/advertising';

export interface MetaAdClient {
  /** Pauses the ad identified by adId. */
  pauseAd(adId: string): Promise<{ success: boolean }>;

  /** Adjusts the ad's daily budget by deltaUsd (positive = increase). */
  scaleBudget(adId: string, deltaUsd: number): Promise<{ success: boolean }>;

  /** Duplicates the ad and returns the new ad's ID. */
  duplicateAd(adId: string): Promise<{ ad_id: string }>;

  /** Fetches performance insights for a date range. */
  getInsights(opts: {
    time_range: { since: string; until: string };
    level: string;
    fields: string[];
  }): Promise<AdMetric[]>;

  /** Returns the overall account status and disapproval rate. */
  getAccountStatus(): Promise<{ status: string; disapproval_rate: number }>;
}
