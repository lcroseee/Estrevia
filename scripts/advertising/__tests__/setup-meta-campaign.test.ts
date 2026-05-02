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
  });
});
