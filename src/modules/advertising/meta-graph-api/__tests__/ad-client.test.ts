// src/modules/advertising/meta-graph-api/__tests__/ad-client.test.ts
import { describe, it, expect, vi } from 'vitest';
import { MetaAdManagementClient } from '../ad-client';

function ok(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200 });
}
function chainedFetch(...resps: Response[]) {
  const q = [...resps];
  return vi.fn(async () => q.shift() ?? new Response('', { status: 500 }));
}

describe('MetaAdManagementClient', () => {
  describe('pauseAd', () => {
    it('POSTs status=PAUSED to /<ad_id>', async () => {
      const fetchImpl = chainedFetch(ok({ success: true }));
      const client = new MetaAdManagementClient({ accessToken: 'T', adAccountId: 'act_1', fetchImpl });
      await client.pauseAd('ad_99');
      const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toContain('/v22.0/ad_99');
      const body = JSON.parse(init.body as string);
      expect(body).toEqual({ status: 'PAUSED' });
    });
  });

  describe('updateAdSetBudget', () => {
    it('POSTs daily_budget in cents to /<adset_id>', async () => {
      const fetchImpl = chainedFetch(ok({ success: true }));
      const client = new MetaAdManagementClient({ accessToken: 'T', adAccountId: 'act_1', fetchImpl });
      await client.updateAdSetBudget('as_5', 1500);
      const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body).toEqual({ daily_budget: 1500 });
    });
  });

  describe('duplicateAd', () => {
    it('POSTs to /<ad_id>/copies and returns new ad_id', async () => {
      const fetchImpl = chainedFetch(ok({ copied_ad_id: 'ad_new', ad_object_ids: [{ ad_id: 'ad_new' }] }));
      const client = new MetaAdManagementClient({ accessToken: 'T', adAccountId: 'act_1', fetchImpl });
      const res = await client.duplicateAd('ad_orig');
      expect(res).toEqual({ ad_id: 'ad_new' });
      const [url] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toContain('/ad_orig/copies');
    });
  });

  describe('createCampaign', () => {
    it('POSTs to /act_X/campaigns with required fields and returns campaign_id', async () => {
      const fetchImpl = chainedFetch(ok({ id: 'cmp_42' }));
      const client = new MetaAdManagementClient({ accessToken: 'T', adAccountId: 'act_1', fetchImpl });
      const res = await client.createCampaign({
        name: 'Estrevia Launch',
        objective: 'OUTCOME_TRAFFIC',
        status: 'PAUSED',
      });
      expect(res).toEqual({ campaign_id: 'cmp_42' });
      const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.special_ad_categories).toEqual([]);
      expect(body.objective).toBe('OUTCOME_TRAFFIC');
      // Locks 2024+ ABO requirement: false = strict per-adset budget,
      // preserves the documented 70/30 EN/ES split
      expect(body.is_adset_budget_sharing_enabled).toBe(false);
    });
  });

  describe('createAdSet', () => {
    it('POSTs to /act_X/adsets with targeting JSON-encoded and budget in cents', async () => {
      const fetchImpl = chainedFetch(ok({ id: 'as_77' }));
      const client = new MetaAdManagementClient({ accessToken: 'T', adAccountId: 'act_1', fetchImpl });
      const res = await client.createAdSet({
        campaignId: 'cmp_1',
        name: 'EN — Launch',
        locale: 'en',
        dailyBudgetCents: 500,
        targeting: { countries: ['US', 'CA'], ageMin: 18, ageMax: 45 },
        optimizationGoal: 'LINK_CLICKS',
        billingEvent: 'LINK_CLICKS',
        status: 'PAUSED',
      });
      expect(res).toEqual({ adset_id: 'as_77' });
      const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.daily_budget).toBe(500);
      expect(body.targeting.geo_locations.countries).toEqual(['US', 'CA']);
      expect(body.targeting.age_min).toBe(18);
      expect(body.targeting.age_max).toBe(45);
      expect(body.optimization_goal).toBe('LINK_CLICKS');
      // Auto-bidding for cold-start: required since 2024 to avoid "bid amount
      // required" error when bid_strategy field is omitted (Meta defaults to
      // a strategy that needs an explicit bid_amount).
      expect(body.bid_strategy).toBe('LOWEST_COST_WITHOUT_CAP');
    });

    it('omits frequency_control_specs when not provided', async () => {
      const fetchImpl = chainedFetch(ok({ id: 'as_001' }));
      const client = new MetaAdManagementClient({ accessToken: 'T', adAccountId: 'act_1', fetchImpl });
      await client.createAdSet({
        campaignId: 'cmp_1',
        name: 'no-cap',
        locale: 'en',
        dailyBudgetCents: 1400,
        targeting: { countries: ['US'], ageMin: 18, ageMax: 65 },
        optimizationGoal: 'LANDING_PAGE_VIEWS',
        billingEvent: 'IMPRESSIONS',
        status: 'PAUSED',
      });
      const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body).not.toHaveProperty('frequency_control_specs');
    });

    it('passes frequency_control_specs to the API when provided', async () => {
      const fetchImpl = chainedFetch(ok({ id: 'as_002' }));
      const client = new MetaAdManagementClient({ accessToken: 'T', adAccountId: 'act_1', fetchImpl });
      await client.createAdSet({
        campaignId: 'cmp_1',
        name: 'capped',
        locale: 'en',
        dailyBudgetCents: 1400,
        targeting: { countries: ['US'], ageMin: 18, ageMax: 65 },
        optimizationGoal: 'LANDING_PAGE_VIEWS',
        billingEvent: 'IMPRESSIONS',
        status: 'PAUSED',
        frequencyControlSpecs: [{ event: 'IMPRESSIONS', interval_days: 7, max_frequency: 10 }],
      });
      const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body.frequency_control_specs).toEqual([
        { event: 'IMPRESSIONS', interval_days: 7, max_frequency: 10 },
      ]);
    });
  });

  describe('updateAdSet', () => {
    it('throws on empty patch', async () => {
      const fetchImpl = chainedFetch(ok({ success: true }));
      const client = new MetaAdManagementClient({ accessToken: 'T', adAccountId: 'act_1', fetchImpl });
      await expect(client.updateAdSet('as_x', {})).rejects.toThrow(/empty patch/);
    });

    it('sends frequency_control_specs in POST body when patching cap', async () => {
      const fetchImpl = chainedFetch(ok({ id: 'as_001' }));
      const client = new MetaAdManagementClient({ accessToken: 'T', adAccountId: 'act_1', fetchImpl });
      const result = await client.updateAdSet('as_001', {
        frequencyControlSpecs: [{ event: 'IMPRESSIONS', interval_days: 7, max_frequency: 10 }],
      });
      expect(result).toEqual({ id: 'as_001', success: true });
      const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toMatch(/\/as_001(\?|$)/);
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body.frequency_control_specs).toEqual([
        { event: 'IMPRESSIONS', interval_days: 7, max_frequency: 10 },
      ]);
    });

    it('sends daily_budget and status when patching budget + state', async () => {
      const fetchImpl = chainedFetch(ok({ success: true }));
      const client = new MetaAdManagementClient({ accessToken: 'T', adAccountId: 'act_1', fetchImpl });
      await client.updateAdSet('as_002', {
        dailyBudgetCents: 2000,
        status: 'ACTIVE',
      });
      const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body).toEqual({ daily_budget: 2000, status: 'ACTIVE' });
    });
  });

  describe('getInsights', () => {
    it('GETs /act_X/insights with time_range JSON-encoded and parses string numbers', async () => {
      const fetchImpl = chainedFetch(
        ok({
          data: [
            {
              ad_id: 'ad_1',
              adset_id: 'as_1',
              campaign_id: 'cmp_1',
              date_start: '2026-04-25',
              date_stop: '2026-04-26',
              impressions: '5247',
              clicks: '87',
              spend: '18.40',
              ctr: '0.0166',
              cpc: '0.21',
              cpm: '3.51',
              frequency: '1.4',
              reach: '3748',
            },
          ],
        }),
      );
      const client = new MetaAdManagementClient({ accessToken: 'T', adAccountId: 'act_1', fetchImpl });
      const res = await client.getInsights({
        time_range: { since: '2026-04-25', until: '2026-04-26' },
        level: 'ad',
        fields: ['impressions', 'clicks', 'spend', 'ctr', 'cpc', 'cpm', 'frequency', 'reach'],
      });

      const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
      expect(init.method).toBe('GET');
      expect(url).toContain('/act_1/insights');
      expect(url).toContain('level=ad');
      expect(url).toContain(encodeURIComponent('{"since":"2026-04-25","until":"2026-04-26"}'));

      expect(res).toHaveLength(1);
      expect(res[0]).toMatchObject({
        ad_id: 'ad_1',
        adset_id: 'as_1',
        campaign_id: 'cmp_1',
        date: '2026-04-25',
        impressions: 5247,
        clicks: 87,
        spend_usd: 18.40,
        ctr: 0.0166,
        days_running: 2,
        status: 'ACTIVE',
      });
    });

    it('returns empty array when /insights returns empty data', async () => {
      const fetchImpl = chainedFetch(ok({ data: [] }));
      const client = new MetaAdManagementClient({ accessToken: 'T', adAccountId: 'act_1', fetchImpl });
      const res = await client.getInsights({
        time_range: { since: '2026-04-25', until: '2026-04-26' },
        level: 'ad',
        fields: ['impressions'],
      });
      expect(res).toEqual([]);
    });

    it('coerces missing or invalid numeric fields to 0', async () => {
      const fetchImpl = chainedFetch(
        ok({ data: [{ ad_id: 'ad_x', impressions: undefined, clicks: 'NaN', spend: '' }] }),
      );
      const client = new MetaAdManagementClient({ accessToken: 'T', adAccountId: 'act_1', fetchImpl });
      const res = await client.getInsights({
        time_range: { since: '2026-04-25', until: '2026-04-26' },
        level: 'ad',
        fields: ['impressions'],
      });
      expect(res[0]).toMatchObject({ impressions: 0, clicks: 0, spend_usd: 0 });
    });
  });

  describe('getAccountStatus', () => {
    it('combines account_status with computed disapproval_rate from ads list', async () => {
      const fetchImpl = chainedFetch(
        ok({ id: 'act_1', account_status: 1, disable_reason: 0 }),
        ok({
          data: [
            { id: 'ad_1', effective_status: 'ACTIVE' },
            { id: 'ad_2', effective_status: 'ACTIVE' },
            { id: 'ad_3', effective_status: 'DISAPPROVED' },
            { id: 'ad_4', effective_status: 'PAUSED' },
          ],
        }),
      );
      const client = new MetaAdManagementClient({ accessToken: 'T', adAccountId: 'act_1', fetchImpl });
      const res = await client.getAccountStatus();
      expect(res.status).toBe('ACTIVE');
      expect(res.disapproval_rate).toBeCloseTo(0.25, 4);
    });

    it('maps disabled accounts to DISABLED label', async () => {
      const fetchImpl = chainedFetch(
        ok({ id: 'act_1', account_status: 2 }),
        ok({ data: [] }),
      );
      const client = new MetaAdManagementClient({ accessToken: 'T', adAccountId: 'act_1', fetchImpl });
      const res = await client.getAccountStatus();
      expect(res.status).toBe('DISABLED');
      expect(res.disapproval_rate).toBe(0);
    });
  });
});
