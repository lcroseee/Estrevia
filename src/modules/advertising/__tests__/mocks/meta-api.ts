import { vi } from 'vitest';
import { mockAdMetric } from '../fixtures';

export const mockMetaApi = () => ({
  getInsights: vi.fn().mockResolvedValue([mockAdMetric()]),
  pauseAd: vi.fn().mockResolvedValue({ success: true }),
  scaleBudget: vi.fn().mockResolvedValue({ success: true }),
  duplicateAd: vi.fn().mockResolvedValue({ ad_id: 'ad_new_001' }),
  uploadCreative: vi.fn().mockResolvedValue({ creative_id: 'cr_001', ad_id: 'ad_001' }),
  getAccountStatus: vi.fn().mockResolvedValue({ status: 'ACTIVE', disapproval_rate: 0.02 }),
  upsertCustomAudience: vi.fn().mockResolvedValue({ audience_id: 'aud_001' }),
  createCampaign: vi.fn().mockResolvedValue({ campaign_id: 'mock_campaign_1' }),
  createAdSet: vi.fn().mockResolvedValue({ adset_id: 'mock_adset_1' }),
});

export type MockMetaApi = ReturnType<typeof mockMetaApi>;
