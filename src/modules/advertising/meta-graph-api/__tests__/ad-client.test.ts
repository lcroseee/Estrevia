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
    });
  });
});
