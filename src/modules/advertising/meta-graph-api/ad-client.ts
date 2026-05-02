// src/modules/advertising/meta-graph-api/ad-client.ts
import type { MetaIdResponse, MetaCopyResponse } from './types';
import type { CreateCampaignOpts, CreateAdSetOpts } from '@/modules/advertising/act/meta-marketing';
import { MetaGraphApiBase } from './base';

/**
 * MetaAdManagementClient — ad management operations via Meta Graph API v22.0.
 *
 * Implements: pauseAd, updateAdSetBudget, duplicateAd, createCampaign, createAdSet.
 * Wired into MetaAdClient interface via factory (Task 4).
 */
export class MetaAdManagementClient extends MetaGraphApiBase {
  async pauseAd(adId: string): Promise<void> {
    await this.request('POST', `/${adId}`, { status: 'PAUSED' });
  }

  async updateAdSetBudget(adSetId: string, dailyBudgetCents: number): Promise<void> {
    await this.request('POST', `/${adSetId}`, { daily_budget: dailyBudgetCents });
  }

  async duplicateAd(adId: string, overrides?: Record<string, unknown>): Promise<{ ad_id: string }> {
    const res = await this.request<MetaCopyResponse>(
      'POST',
      `/${adId}/copies`,
      { deep_copy: false, status_option: 'PAUSED', ...overrides },
    );
    const newId = res.ad_object_ids?.[0]?.ad_id ?? res.copied_ad_id;
    return { ad_id: newId };
  }

  async createCampaign(opts: CreateCampaignOpts): Promise<{ campaign_id: string }> {
    const res = await this.request<MetaIdResponse>(
      'POST',
      `/${this.adAccountId}/campaigns`,
      {
        name: opts.name,
        objective: opts.objective,
        status: opts.status,
        special_ad_categories: [], // required by Meta even when empty
        // Required by Meta API since 2024 when not using campaign budget (CBO).
        // false = strict ABO: each ad set keeps its own budget, no cross-sharing.
        // We rely on this for the documented 70/30 EN/ES split holding firm.
        is_adset_budget_sharing_enabled: false,
      },
    );
    return { campaign_id: res.id };
  }

  async createAdSet(opts: CreateAdSetOpts): Promise<{ adset_id: string }> {
    const targeting = {
      geo_locations: { countries: opts.targeting.countries },
      age_min: opts.targeting.ageMin,
      age_max: opts.targeting.ageMax,
      ...(opts.targeting.interests
        ? { flexible_spec: [{ interests: opts.targeting.interests.map((i) => ({ id: i, name: i })) }] }
        : {}),
    };
    const res = await this.request<MetaIdResponse>(
      'POST',
      `/${this.adAccountId}/adsets`,
      {
        name: opts.name,
        campaign_id: opts.campaignId,
        daily_budget: opts.dailyBudgetCents,
        optimization_goal: opts.optimizationGoal,
        billing_event: opts.billingEvent,
        // LOWEST_COST_WITHOUT_CAP = auto-bid, no upper cost cap.
        // Optimal for cold start: Meta seeks cheapest events for learning.
        // Upgrade to COST_CAP/BID_CAP after 30-50 conversions establish baseline.
        bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
        targeting,
        status: opts.status,
      },
    );
    return { adset_id: res.id };
  }
}
