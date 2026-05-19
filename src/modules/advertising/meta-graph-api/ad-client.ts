// src/modules/advertising/meta-graph-api/ad-client.ts
import type { MetaIdResponse, MetaCopyResponse } from './types';
import type { CreateCampaignOpts, CreateAdSetOpts } from '@/modules/advertising/act/meta-marketing';
import type { AdMetric } from '@/shared/types/advertising';
import { MetaGraphApiBase } from './base';

/**
 * Meta /insights row — numeric fields arrive as strings from Graph API.
 * date_start and date_stop are inclusive; we collapse a range into one
 * AdMetric row per ad with days_running computed from the diff.
 */
interface MetaInsightsRow {
  ad_id?: string;
  adset_id?: string;
  campaign_id?: string;
  date_start?: string;
  date_stop?: string;
  impressions?: string;
  clicks?: string;
  spend?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  frequency?: string;
  reach?: string;
  actions?: Array<{
    action_type: string;
    value: string;
    '1d_click'?: string;
    '7d_click'?: string;
    '28d_click'?: string;
  }>;
}

interface MetaInsightsResponse {
  data: MetaInsightsRow[];
  paging?: { cursors?: { after?: string }; next?: string };
}

interface MetaAccountStatusResponse {
  id: string;
  account_status: number;
  disable_reason?: number;
}

interface MetaAdEffectiveStatusRow {
  id: string;
  effective_status: string;
}

interface MetaAdsListResponse {
  data: MetaAdEffectiveStatusRow[];
  paging?: { cursors?: { after?: string }; next?: string };
}

/**
 * MetaAdManagementClient — ad management operations via Meta Graph API v22.0.
 *
 * Implements: pauseAd, updateAdSetBudget, duplicateAd, createCampaign, createAdSet,
 * getInsights, getAccountStatus.
 *
 * Satisfies MetaAdClient (act/meta-marketing.ts) and MetaInsightsApi
 * (perceive/meta-insights.ts) so it can be injected into both layers.
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

  async getInsights(opts: {
    time_range: { since: string; until: string };
    level: string;
    fields: string[];
    action_attribution_windows?: Array<'1d_click' | '7d_click' | '1d_view' | '7d_view' | '28d_click'>;
    windowKey?: 'conversions_7d' | 'conversions_total';
  }): Promise<AdMetric[]> {
    const fields = ['ad_id', 'adset_id', 'campaign_id', 'date_start', 'date_stop', ...opts.fields];
    if (opts.windowKey) fields.push('actions');
    const params = new URLSearchParams({
      level: opts.level,
      fields: fields.join(','),
      time_range: JSON.stringify(opts.time_range),
      limit: '500',
    });
    if (opts.action_attribution_windows && opts.action_attribution_windows.length > 0) {
      params.set('action_attribution_windows', JSON.stringify(opts.action_attribution_windows));
    }
    const res = await this.request<MetaInsightsResponse>(
      'GET',
      `/${this.adAccountId}/insights?${params.toString()}`,
    );
    return (res.data ?? []).map((row) => this.toAdMetric(row, opts.time_range, opts.windowKey));
  }

  async getAccountStatus(): Promise<{ status: string; disapproval_rate: number }> {
    const accountRes = await this.request<MetaAccountStatusResponse>(
      'GET',
      `/${this.adAccountId}?fields=account_status,disable_reason`,
    );

    // Compute disapproval rate from a single page of recent ads.
    // 500 ads is enough for the per-account view; for larger accounts
    // we'd paginate, but disapproval rate is a coarse health signal.
    const adsRes = await this.request<MetaAdsListResponse>(
      'GET',
      `/${this.adAccountId}/ads?fields=effective_status&limit=500`,
    );
    const ads = adsRes.data ?? [];
    const disapproved = ads.filter((a) => a.effective_status === 'DISAPPROVED').length;
    const disapprovalRate = ads.length > 0 ? disapproved / ads.length : 0;

    return {
      status: this.mapAccountStatus(accountRes.account_status),
      disapproval_rate: disapprovalRate,
    };
  }

  /**
   * Maps Meta's numeric account_status to a string label.
   * https://developers.facebook.com/docs/marketing-api/reference/ad-account
   */
  private mapAccountStatus(status: number): string {
    const map: Record<number, string> = {
      1: 'ACTIVE',
      2: 'DISABLED',
      3: 'UNSETTLED',
      7: 'PENDING_RISK_REVIEW',
      8: 'PENDING_SETTLEMENT',
      9: 'IN_GRACE_PERIOD',
      100: 'PENDING_CLOSURE',
      101: 'CLOSED',
      102: 'ANY_ACTIVE',
      201: 'ANY_CLOSED',
    };
    return map[status] ?? `UNKNOWN_${status}`;
  }

  /**
   * Converts a Meta /insights row into our AdMetric shape.
   * Status is set to ACTIVE because /insights doesn't return it; callers
   * needing real status should fetch /<ad_id>?fields=effective_status separately.
   */
  private toAdMetric(
    row: MetaInsightsRow,
    timeRange: { since: string; until: string },
    windowKey?: 'conversions_7d' | 'conversions_total',
  ): AdMetric {
    const date = row.date_start ?? timeRange.since;
    const daysRunning = this.diffDaysInclusive(row.date_start ?? timeRange.since, row.date_stop ?? timeRange.until);
    const out: AdMetric = {
      ad_id: row.ad_id ?? '',
      adset_id: row.adset_id ?? '',
      campaign_id: row.campaign_id ?? '',
      date,
      impressions: this.parseNum(row.impressions),
      clicks: this.parseNum(row.clicks),
      spend_usd: this.parseNum(row.spend),
      ctr: this.parseNum(row.ctr),
      cpc: this.parseNum(row.cpc),
      cpm: this.parseNum(row.cpm),
      frequency: this.parseNum(row.frequency),
      reach: this.parseNum(row.reach),
      days_running: daysRunning,
      status: 'ACTIVE',
    };
    if (windowKey) {
      const leadAction = row.actions?.find((a) => a.action_type === 'lead');
      const rawValue = leadAction?.['7d_click'] ?? leadAction?.value;
      out[windowKey] = leadAction ? this.parseNum(rawValue) : 0;
    }
    return out;
  }

  private parseNum(v: string | undefined): number {
    if (v === undefined || v === '') return 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  private diffDaysInclusive(since: string, until: string): number {
    const a = Date.parse(since);
    const b = Date.parse(until);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return 1;
    const diff = Math.round((b - a) / (1000 * 60 * 60 * 24));
    return Math.max(1, diff + 1);
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

    const body: Record<string, unknown> = {
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
    };

    if (opts.frequencyControlSpecs && opts.frequencyControlSpecs.length > 0) {
      body.frequency_control_specs = opts.frequencyControlSpecs;
    }

    const res = await this.request<MetaIdResponse>(
      'POST',
      `/${this.adAccountId}/adsets`,
      body,
    );
    return { adset_id: res.id };
  }

  /**
   * Generic ad-set update — used to retrofit `frequency_control_specs` onto
   * existing ad sets (Track 11 migration), or to patch budget / status without
   * the narrower `updateAdSetBudget` / `pauseAd` helpers. Pass only the fields
   * you want changed.
   *
   * Throws on empty patch — sending an empty POST to /{adset_id} is a Meta
   * Graph API no-op that wastes a request and hides programmer error.
   */
  async updateAdSet(
    adsetId: string,
    patch: {
      frequencyControlSpecs?: CreateAdSetOpts['frequencyControlSpecs'];
      dailyBudgetCents?: number;
      status?: 'PAUSED' | 'ACTIVE';
    },
  ): Promise<{ id: string; success: true }> {
    const body: Record<string, unknown> = {};
    if (patch.frequencyControlSpecs) body.frequency_control_specs = patch.frequencyControlSpecs;
    if (patch.dailyBudgetCents !== undefined) body.daily_budget = patch.dailyBudgetCents;
    if (patch.status) body.status = patch.status;

    if (Object.keys(body).length === 0) {
      throw new Error('updateAdSet: empty patch');
    }

    await this.request<MetaIdResponse>('POST', `/${adsetId}`, body);
    return { id: adsetId, success: true };
  }

  /**
   * Replaces the creative on an existing ad WITHOUT touching budget, audience,
   * or optimization. Maps to `POST /{ad_id}` with `{creative: {creative_id}}`.
   *
   * NOTE (v3b T9): stub — body shape and response parsing are scoped for T22's
   * Meta API extension to fully validate. Match the `updateAdSet` pattern when
   * filling in: send only the fields Meta accepts, throw on empty patch.
   */
  async replaceAdCreative(
    adId: string,
    creativeId: string,
  ): Promise<{ ad_id: string; new_creative_id: string }> {
    await this.request<MetaIdResponse>('POST', `/${adId}`, {
      creative: { creative_id: creativeId },
    });
    return { ad_id: adId, new_creative_id: creativeId };
  }

  /**
   * Duplicates an ad set with optional overrides for budget / audience.
   * Used by the Phase D `propose_new_ad_set` act-type AFTER founder approval.
   *
   * Maps to `POST /{adset_id}/copies` with override fields. Real Meta semantics:
   * Meta's deep-copy of an ad set creates a new ad set in the same campaign,
   * and any field passed in the body overrides the source value on the clone.
   *
   * NOTE (v3b T9): stub — T22 should verify Meta's exact override semantics for
   * `targeting` (audience) and `daily_budget` on `/copies`. The body shape below
   * is the documented contract; double-check before going live.
   */
  async duplicateAdSetWithChanges(opts: {
    sourceAdSetId: string;
    newAudience?: string;
    newBudgetCents: number;
  }): Promise<{ ad_set_id: string }> {
    const body: Record<string, unknown> = {
      deep_copy: true,
      status_option: 'PAUSED',
      daily_budget: opts.newBudgetCents,
    };
    if (opts.newAudience) {
      // Audience override is documented as `targeting` on /copies — but the
      // exact shape (custom audience id vs full spec) needs T22 verification.
      body.targeting = { custom_audiences: [{ id: opts.newAudience }] };
    }
    const res = await this.request<MetaCopyResponse & { copied_adset_id?: string }>(
      'POST',
      `/${opts.sourceAdSetId}/copies`,
      body,
    );
    const newId = res.copied_adset_id ?? res.copied_ad_id ?? '';
    return { ad_set_id: newId };
  }
}
