import type { MetaAdActOps } from '@/modules/advertising/meta-graph-api';
import { createMetaAdClient } from '@/modules/advertising/meta-graph-api';

export { pause } from './pause';
export type { PauseDeps } from './pause';

export { scale } from './scale';
export type { ScaleDeps } from './scale';

export { duplicate } from './duplicate';
export type { DuplicateDeps } from './duplicate';

export { refreshCreative } from './refresh-creative';
export type { RefreshCreativeDeps } from './refresh-creative';

export { proposeNewAdSet } from './propose-new-ad-set';
export type {
  ProposeNewAdSetDeps,
  ProposeNewAdSetDecision,
  ApprovalSender,
} from './propose-new-ad-set';

export type { MetaAdClient } from './meta-marketing';

// ---------------------------------------------------------------------------
// Act-layer factory
// ---------------------------------------------------------------------------

/**
 * No-op stub used in all non-production contexts (test / dev / dry-run).
 *
 * Every method logs its intent and resolves safely — no network calls are made.
 * This is intentional: the safety gate that prevents accidental spend lives at
 * the factory boundary, not inside each act function.
 */
const noOpActClient: MetaAdActOps = {
  async pauseAd(adId) {
    console.info('[act/getMetaAdClient][no-op] pauseAd', adId);
  },
  async updateAdSetBudget(adSetId, dailyBudgetCents) {
    console.info('[act/getMetaAdClient][no-op] updateAdSetBudget', adSetId, dailyBudgetCents);
  },
  async duplicateAd(adId) {
    console.info('[act/getMetaAdClient][no-op] duplicateAd', adId);
    return { ad_id: `no-op-copy-of-${adId}` };
  },
  async createCampaign(opts) {
    console.info('[act/getMetaAdClient][no-op] createCampaign', opts.name);
    return { campaign_id: 'no-op-campaign' };
  },
  async createAdSet(opts) {
    console.info('[act/getMetaAdClient][no-op] createAdSet', opts.name);
    return { adset_id: 'no-op-adset' };
  },
  async replaceAdCreative(adId, creativeId) {
    console.info('[act/getMetaAdClient][no-op] replaceAdCreative', adId, creativeId);
    return { ad_id: adId, new_creative_id: creativeId };
  },
  async duplicateAdSetWithChanges(opts) {
    console.info('[act/getMetaAdClient][no-op] duplicateAdSetWithChanges', opts.sourceAdSetId);
    return { ad_set_id: `no-op-copy-of-${opts.sourceAdSetId}` };
  },
};

/**
 * Returns the Meta ad management client for the act layer.
 *
 * **Gating logic (evaluated at call time, not at module load):**
 * - Non-production `NODE_ENV` → no-op stub (logs intent, no API calls)
 * - `ADVERTISING_AGENT_DRY_RUN=true` → no-op stub
 * - Test runner (VITEST=true / NODE_ENV=test) → no-op stub
 * - Otherwise → real `MetaAdManagementClient` via `createMetaAdClient()`
 *
 * Tests MUST inject mocks via dependency injection rather than calling this
 * factory — the real `createMetaAdClient()` throws inside Vitest.
 */
export function getMetaAdClient(): MetaAdActOps {
  const isTest = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';
  const isDryRun = process.env.ADVERTISING_AGENT_DRY_RUN === 'true';
  const isProduction = process.env.NODE_ENV === 'production';

  if (isTest || isDryRun || !isProduction) {
    return noOpActClient;
  }

  // guardTestEnv() inside createMetaAdClient() only runs on function call,
  // so the static import above is safe even in test files.
  return createMetaAdClient();
}
