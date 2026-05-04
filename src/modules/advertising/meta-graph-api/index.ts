// src/modules/advertising/meta-graph-api/index.ts
import type { MetaApiClient } from '@/modules/advertising/creative-gen/upload/meta-upload';
import type { MetaAdClient, CreateCampaignOpts, CreateAdSetOpts } from '@/modules/advertising/act/meta-marketing';
import { MetaUploadClient } from './upload-client';
import { MetaAdManagementClient } from './ad-client';

export { MetaUploadClient } from './upload-client';
export { MetaAdManagementClient } from './ad-client';
export {
  MetaApiError,
  MetaAuthError,
  MetaPermissionError,
  MetaRateLimitError,
  MetaValidationError,
  MetaServerError,
  MetaNetworkError,
} from './errors';
export type { MetaGraphConfig } from './types';

/**
 * Narrowed interface for act-stream + campaign-setup operations only.
 * Used by act/scale.ts, act/pause.ts, etc. when they don't need
 * insights or account-status reads.
 *
 * For cron handlers that need both reads and writes, use
 * `createMetaAdClient()` which returns the broader `MetaAdClient`
 * (implemented by MetaAdManagementClient).
 */
export interface MetaAdActOps {
  pauseAd(adId: string): Promise<void>;
  updateAdSetBudget(adSetId: string, dailyBudgetCents: number): Promise<void>;
  duplicateAd(adId: string, overrides?: Record<string, unknown>): Promise<{ ad_id: string }>;
  createCampaign(opts: CreateCampaignOpts): Promise<{ campaign_id: string }>;
  createAdSet(opts: CreateAdSetOpts): Promise<{ adset_id: string }>;
  /** Phase D — replace creative on existing ad. LEARNING_RESET semantic. */
  replaceAdCreative(
    adId: string,
    creativeId: string,
  ): Promise<{ ad_id: string; new_creative_id: string }>;
  /** Phase D — duplicate an ad set with new params. HIGH_RISK; gated by approval-router. */
  duplicateAdSetWithChanges(opts: {
    sourceAdSetId: string;
    newAudience?: string;
    newBudgetCents: number;
  }): Promise<{ ad_set_id: string }>;
}

function readEnv(): { accessToken: string; adAccountId: string } {
  const accessToken = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;
  if (!accessToken) throw new Error('META_ACCESS_TOKEN is not set');
  if (!adAccountId) throw new Error('META_AD_ACCOUNT_ID is not set');
  return { accessToken, adAccountId };
}

/**
 * Guard that prevents the real Meta API clients from being instantiated
 * inside tests. Callers in tests MUST inject a mock — never the real client.
 */
function guardTestEnv(): void {
  if (process.env.VITEST === 'true' || process.env.NODE_ENV === 'test') {
    throw new Error('createMetaUploadClient/createMetaAdClient: Use mock in tests');
  }
}

export function createMetaUploadClient(): MetaApiClient {
  guardTestEnv();
  const env = readEnv();
  return new MetaUploadClient(env);
}

export function createMetaAdClient(): MetaAdClient {
  guardTestEnv();
  const env = readEnv();
  return new MetaAdManagementClient(env);
}
