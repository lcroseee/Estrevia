/**
 * Tests for getMetaAdClient() environment gating.
 *
 * Verifies that:
 * - Non-production NODE_ENV → no-op stub (no Meta API calls)
 * - ADVERTISING_AGENT_DRY_RUN=true → no-op stub
 * - VITEST=true (test runner) → no-op stub
 * - NODE_ENV=production (without test/dry-run flags) → real client from createMetaAdClient()
 *
 * The real createMetaAdClient() is NOT called in these tests — its guardTestEnv()
 * would throw. We mock the meta-graph-api module and verify the factory routes correctly.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { MetaAdActOps } from '@/modules/advertising/meta-graph-api';

// vi.hoisted ensures the spy exists before vi.mock() hoisting runs
const { createMetaAdClientSpy } = vi.hoisted(() => {
  const mockRealClient: MetaAdActOps = {
    pauseAd: vi.fn().mockResolvedValue(undefined),
    updateAdSetBudget: vi.fn().mockResolvedValue(undefined),
    duplicateAd: vi.fn().mockResolvedValue({ ad_id: 'real_new' }),
    createCampaign: vi.fn().mockResolvedValue({ campaign_id: 'real_campaign' }),
    createAdSet: vi.fn().mockResolvedValue({ adset_id: 'real_adset' }),
    replaceAdCreative: vi
      .fn()
      .mockResolvedValue({ ad_id: 'real_ad', new_creative_id: 'real_creative' }),
    duplicateAdSetWithChanges: vi
      .fn()
      .mockResolvedValue({ ad_set_id: 'real_new_adset' }),
  };
  return { createMetaAdClientSpy: vi.fn(() => mockRealClient) };
});

vi.mock('@/modules/advertising/meta-graph-api', () => ({
  createMetaAdClient: createMetaAdClientSpy,
}));

import { getMetaAdClient } from '../index';

// ---------------------------------------------------------------------------
// Env helpers
// ---------------------------------------------------------------------------

const origNodeEnv = process.env.NODE_ENV;
const origVitest = process.env.VITEST;
const origDryRun = process.env.ADVERTISING_AGENT_DRY_RUN;

function setEnv(overrides: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

afterEach(() => {
  setEnv({ NODE_ENV: origNodeEnv, VITEST: origVitest, ADVERTISING_AGENT_DRY_RUN: origDryRun });
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getMetaAdClient — environment gating', () => {
  it('returns no-op stub when NODE_ENV is development', () => {
    setEnv({ NODE_ENV: 'development', VITEST: undefined, ADVERTISING_AGENT_DRY_RUN: undefined });

    const client = getMetaAdClient();

    expect(client).toBeDefined();
    expect(createMetaAdClientSpy).not.toHaveBeenCalled();
  });

  it('returns no-op stub when ADVERTISING_AGENT_DRY_RUN=true (even in production)', () => {
    setEnv({ NODE_ENV: 'production', VITEST: undefined, ADVERTISING_AGENT_DRY_RUN: 'true' });

    const client = getMetaAdClient();

    expect(client).toBeDefined();
    expect(createMetaAdClientSpy).not.toHaveBeenCalled();
  });

  it('returns no-op stub when VITEST=true (test runner, even if NODE_ENV=production)', () => {
    setEnv({ NODE_ENV: 'production', VITEST: 'true', ADVERTISING_AGENT_DRY_RUN: undefined });

    const client = getMetaAdClient();

    expect(client).toBeDefined();
    expect(createMetaAdClientSpy).not.toHaveBeenCalled();
  });

  it('returns no-op stub when NODE_ENV=test', () => {
    setEnv({ NODE_ENV: 'test', VITEST: undefined, ADVERTISING_AGENT_DRY_RUN: undefined });

    getMetaAdClient();

    expect(createMetaAdClientSpy).not.toHaveBeenCalled();
  });

  it('calls createMetaAdClient() in production without dry-run or test flags', () => {
    setEnv({ NODE_ENV: 'production', VITEST: undefined, ADVERTISING_AGENT_DRY_RUN: undefined });

    const client = getMetaAdClient();

    expect(createMetaAdClientSpy).toHaveBeenCalledOnce();
    // Factory returns whatever createMetaAdClient() returns (the mocked real client)
    expect(client).toBeDefined();
  });

  it('no-op stub resolves all methods without throwing', async () => {
    setEnv({ NODE_ENV: 'development', VITEST: undefined, ADVERTISING_AGENT_DRY_RUN: undefined });

    const client = getMetaAdClient();

    await expect(client.pauseAd('ad_1')).resolves.toBeUndefined();
    await expect(client.updateAdSetBudget('adset_1', 5000)).resolves.toBeUndefined();
    await expect(client.duplicateAd('ad_1')).resolves.toMatchObject({ ad_id: expect.any(String) });
    await expect(
      client.createCampaign({ name: 'test', objective: 'OUTCOME_TRAFFIC', status: 'PAUSED' }),
    ).resolves.toMatchObject({ campaign_id: expect.any(String) });
    await expect(
      client.createAdSet({
        campaignId: 'c_1',
        name: 'test',
        locale: 'en',
        dailyBudgetCents: 1000,
        targeting: { countries: ['US'], ageMin: 18, ageMax: 65 },
        optimizationGoal: 'LINK_CLICKS',
        billingEvent: 'IMPRESSIONS',
        status: 'PAUSED',
      }),
    ).resolves.toMatchObject({ adset_id: expect.any(String) });
  });
});
