import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../threshold-resolver', () => ({
  resolveThreshold: vi.fn(async (metric: string) => {
    const defaults: Record<string, number> = {
      phase_b_extreme_frequency_cap: 5.0,
      phase_b_extreme_zero_conv_spend_floor_usd: 50.0,
      phase_b_extreme_ctr_doa: 0.003,
      phase_b_extreme_ctr_doa_min_impressions: 1000,
      phase_b_extreme_cpc_cap_usd: 10.0,
      account_disapproval_rate_emergency: 0.05,
    };
    return defaults[metric];
  }),
}));

import { evaluatePhaseB, type PhaseBInput } from '../phase-b';

const baseInput: PhaseBInput = {
  ad_id: 'ad_1',
  // The state-store row shape is enriched in T13; for these tests only
  // adSetId/campaignId/conversions7dMeta are read.
  state: { adSetId: 'as_1', campaignId: 'cmp_1', conversions7dMeta: 0 } as PhaseBInput['state'],
  current: {
    status: 'ACTIVE',
    frequency: 1.0,
    spend_usd: 1.0,
    impressions: 100,
    ctr: 0.05,
    cpc: 0.5,
  },
  account: {
    disapproval_rate: 0,
    spend_cap_hit: false,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('evaluatePhaseB — 8 extreme failures', () => {
  it('1. DISAPPROVED status → pause', async () => {
    const d = await evaluatePhaseB({
      ...baseInput,
      current: { ...baseInput.current, status: 'DISAPPROVED' },
    });
    expect(d.action).toBe('pause');
    expect(d.reason).toContain('disapproved');
  });

  it('2. frequency >= 5.0 → pause', async () => {
    const d = await evaluatePhaseB({
      ...baseInput,
      current: { ...baseInput.current, frequency: 5.0 },
    });
    expect(d.action).toBe('pause');
    expect(d.reason).toContain('frequency');
  });

  it('2a. frequency = 4.99 (just below cap) → does NOT pause', async () => {
    const d = await evaluatePhaseB({
      ...baseInput,
      current: { ...baseInput.current, frequency: 4.99 },
    });
    expect(d.action).toBe('hold');
  });

  it('3. spend ≥ 50 USD + zero conversions → pause', async () => {
    const d = await evaluatePhaseB({
      ...baseInput,
      current: { ...baseInput.current, spend_usd: 50.0 },
    });
    expect(d.action).toBe('pause');
    expect(d.reason).toContain('zero_conv_spend');
  });

  it('3a. spend ≥ 50 USD but at least 1 conversion → does NOT pause', async () => {
    const d = await evaluatePhaseB({
      ...baseInput,
      state: { ...baseInput.state, conversions7dMeta: 5 } as PhaseBInput['state'],
      current: { ...baseInput.current, spend_usd: 50.0 },
    });
    expect(d.action).toBe('hold');
  });

  it('4. CTR < 0.3% AND impressions ≥ 1000 → pause', async () => {
    const d = await evaluatePhaseB({
      ...baseInput,
      current: { ...baseInput.current, ctr: 0.002, impressions: 1000 },
    });
    expect(d.action).toBe('pause');
    expect(d.reason).toContain('ctr_doa');
  });

  it('4a. CTR < 0.3% but impressions < 1000 → does NOT pause (insufficient sample)', async () => {
    const d = await evaluatePhaseB({
      ...baseInput,
      current: { ...baseInput.current, ctr: 0.002, impressions: 500 },
    });
    expect(d.action).toBe('hold');
  });

  it('5. CPC ≥ 10 USD → pause', async () => {
    const d = await evaluatePhaseB({
      ...baseInput,
      current: { ...baseInput.current, cpc: 10.0 },
    });
    expect(d.action).toBe('pause');
    expect(d.reason).toContain('cpc');
  });

  it('6. account disapproval rate > 5% → pause', async () => {
    const d = await evaluatePhaseB({
      ...baseInput,
      account: { ...baseInput.account, disapproval_rate: 0.06 },
    });
    expect(d.action).toBe('pause');
    expect(d.reason).toContain('account_emergency');
  });

  it('6a. account disapproval rate exactly at 5% → does NOT pause (strict >)', async () => {
    const d = await evaluatePhaseB({
      ...baseInput,
      account: { ...baseInput.account, disapproval_rate: 0.05 },
    });
    expect(d.action).toBe('hold');
  });

  it('7. account quality_rating = BELOW_AVERAGE → pause', async () => {
    const d = await evaluatePhaseB({
      ...baseInput,
      account: { ...baseInput.account, quality_rating: 'BELOW_AVERAGE' },
    });
    expect(d.action).toBe('pause');
    expect(d.reason).toContain('quality_below');
  });

  it('7a. account quality_rating = AVERAGE → does NOT pause', async () => {
    const d = await evaluatePhaseB({
      ...baseInput,
      account: { ...baseInput.account, quality_rating: 'AVERAGE' },
    });
    expect(d.action).toBe('hold');
  });

  it('8. spend_cap_hit = true → pause', async () => {
    const d = await evaluatePhaseB({
      ...baseInput,
      account: { ...baseInput.account, spend_cap_hit: true },
    });
    expect(d.action).toBe('pause');
    expect(d.reason).toContain('spend_cap');
  });

  it('happy path → hold with reason learning_in_progress', async () => {
    const d = await evaluatePhaseB(baseInput);
    expect(d.action).toBe('hold');
    expect(d.reason).toBe('learning_in_progress');
  });

  it('emits ad_id verbatim on hold', async () => {
    const d = await evaluatePhaseB({ ...baseInput, ad_id: 'ad_xyz' });
    expect(d.ad_id).toBe('ad_xyz');
  });

  it('emits ad_id verbatim on pause', async () => {
    const d = await evaluatePhaseB({
      ...baseInput,
      ad_id: 'ad_xyz',
      account: { ...baseInput.account, spend_cap_hit: true },
    });
    expect(d.ad_id).toBe('ad_xyz');
  });

  it('DISAPPROVED takes priority over other extreme failures (short-circuit)', async () => {
    const d = await evaluatePhaseB({
      ...baseInput,
      current: { ...baseInput.current, status: 'DISAPPROVED', frequency: 99, cpc: 99 },
      account: { ...baseInput.account, spend_cap_hit: true },
    });
    expect(d.reason).toContain('disapproved');
  });
});
