import { describe, it, expect, vi } from 'vitest';
import { runSetup } from '../setup-meta-campaign';

describe('runSetup', () => {
  it('creates campaign + 2 adsets and returns IDs', async () => {
    const adClient = {
      createCampaign: vi.fn(async () => ({ campaign_id: 'cmp_X' })),
      createAdSet: vi.fn(async (opts) => ({ adset_id: opts.locale === 'en' ? 'as_en_X' : 'as_es_X' })),
      pauseAd: vi.fn(),
      updateAdSetBudget: vi.fn(),
      duplicateAd: vi.fn(),
    };
    const result = await runSetup({ adClient, dailyBudgetCentsEn: 500, dailyBudgetCentsEs: 500 });
    expect(result).toEqual({ campaign_id: 'cmp_X', adset_id_en: 'as_en_X', adset_id_es: 'as_es_X' });
    expect(adClient.createCampaign).toHaveBeenCalledOnce();
    expect(adClient.createAdSet).toHaveBeenCalledTimes(2);
    const enCall = adClient.createAdSet.mock.calls.find((c) => c[0].locale === 'en')![0];
    expect(enCall.targeting.countries).toContain('US');
    const esCall = adClient.createAdSet.mock.calls.find((c) => c[0].locale === 'es')![0];
    expect(esCall.targeting.countries).toContain('MX');
    // AR explicitly excluded — Stripe is USD-only and AR's foreign-currency
    // tax stack (~1.85× checkout multiplier) kills conversion economics.
    expect(esCall.targeting.countries).not.toContain('AR');
  });

  it('reuses existing campaign when reuseCampaignId is set (recovery mode)', async () => {
    const adClient = {
      createCampaign: vi.fn(),
      createAdSet: vi.fn(async (opts) => ({ adset_id: opts.locale === 'en' ? 'as_en_R' : 'as_es_R' })),
      pauseAd: vi.fn(),
      updateAdSetBudget: vi.fn(),
      duplicateAd: vi.fn(),
    };
    const result = await runSetup({
      adClient,
      dailyBudgetCentsEn: 1400,
      dailyBudgetCentsEs: 600,
      reuseCampaignId: 'cmp_existing',
    });
    expect(result.campaign_id).toBe('cmp_existing');
    expect(adClient.createCampaign).not.toHaveBeenCalled();
    expect(adClient.createAdSet).toHaveBeenCalledTimes(2);
    const enCall = adClient.createAdSet.mock.calls.find((c) => c[0].locale === 'en')![0];
    expect(enCall.campaignId).toBe('cmp_existing');
  });
});
