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
  pauseAd(adId: string): Promise<void>;

  /**
   * Sets the absolute daily budget (in cents) for an ad set.
   * Replaces the legacy `scaleBudget(delta)` — callers must compute the new
   * absolute value before calling (current_budget + delta). Phase 2 will add
   * budget-fetch helpers so act-stream functions can do this automatically.
   */
  updateAdSetBudget(adSetId: string, dailyBudgetCents: number): Promise<void>;

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

  /** Creates a new campaign and returns its ID. */
  createCampaign(opts: CreateCampaignOpts): Promise<{ campaign_id: string }>;

  /** Creates a new ad set inside a campaign and returns its ID. */
  createAdSet(opts: CreateAdSetOpts): Promise<{ adset_id: string }>;

  /**
   * Phase D — replaces the creative on an existing ad without touching budget,
   * audience, or optimization. LEARNING_RESET semantic for approval-router.
   */
  replaceAdCreative(
    adId: string,
    creativeId: string,
  ): Promise<{ ad_id: string; new_creative_id: string }>;

  /**
   * Phase D — duplicates an ad set with overrides for budget / audience.
   * HIGH_RISK; gated by approval-router (Telegram approval blocks).
   */
  duplicateAdSetWithChanges(opts: {
    sourceAdSetId: string;
    newAudience?: string;
    newBudgetCents: number;
  }): Promise<{ ad_set_id: string }>;
}

export interface CreateCampaignOpts {
  name: string;
  objective: 'OUTCOME_TRAFFIC' | 'OUTCOME_AWARENESS';
  status: 'PAUSED';
}

export interface CreateAdSetOpts {
  campaignId: string;
  name: string;
  locale: 'en' | 'es';
  dailyBudgetCents: number;
  targeting: {
    countries: string[];
    ageMin: number;
    ageMax: number;
    interests?: string[];
  };
  optimizationGoal: 'LINK_CLICKS' | 'LANDING_PAGE_VIEWS';
  billingEvent: 'IMPRESSIONS' | 'LINK_CLICKS';
  status: 'PAUSED';
  /**
   * Per-user impression cap enforced by Meta auction (not post-fact agent pause).
   * MVP value: { event: 'IMPRESSIONS', interval_days: 7, max_frequency: 10 }.
   * Maps to Meta's `frequency_control_specs` array on POST /{adAccountId}/adsets.
   * Tier-1's aggregate frequency check still runs on top as a safety net.
   */
  frequencyControlSpecs?: Array<{
    event: 'IMPRESSIONS' | 'REACH';
    interval_days: number;
    max_frequency: number;
  }>;
}
