import { vi } from 'vitest';
import { mockAdMetric } from '../fixtures';

export const mockMetaApi = () => ({
  // InsightsProvider
  getInsights: vi.fn().mockResolvedValue([mockAdMetric()]),
  // MetaAdActOps
  pauseAd: vi.fn().mockResolvedValue(undefined),
  updateAdSetBudget: vi.fn().mockResolvedValue(undefined),
  duplicateAd: vi.fn().mockResolvedValue({ ad_id: 'ad_new_001' }),
  createCampaign: vi.fn().mockResolvedValue({ campaign_id: 'mock_campaign_1' }),
  createAdSet: vi.fn().mockResolvedValue({ adset_id: 'mock_adset_1' }),
  // MetaAdActOps — Phase D additions
  replaceAdCreative: vi
    .fn()
    .mockResolvedValue({ ad_id: 'ad_001', new_creative_id: 'cr_new_001' }),
  duplicateAdSetWithChanges: vi
    .fn()
    .mockResolvedValue({ ad_set_id: 'adset_new_001' }),
  // MetaAdClient extras
  getAccountStatus: vi.fn().mockResolvedValue({ status: 'ACTIVE', disapproval_rate: 0.02 }),
  // MetaApiClient upload methods
  uploadCreative: vi.fn().mockResolvedValue({ creative_id: 'cr_001', ad_id: 'ad_001' }),
  upsertCustomAudience: vi.fn().mockResolvedValue({ audience_id: 'aud_001' }),
});

export type MockMetaApi = ReturnType<typeof mockMetaApi>;
