import { beforeEach, describe, expect, it, vi } from 'vitest';

import { COLD_START_DEFAULTS } from '../../targets';

vi.mock('../../threshold-resolver', () => ({
  resolveThreshold: vi.fn(async (name: keyof typeof COLD_START_DEFAULTS) => {
    return COLD_START_DEFAULTS[name];
  }),
}));

import { evaluateAccountEmergency } from '../account-emergency';

const baseInput = {
  ad_set_id: 'as_001',
  campaign_id: 'camp_001',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('evaluateAccountEmergency — cross-phase pause-all triggers', () => {
  it('returns null when account is healthy (no triggers)', async () => {
    const result = await evaluateAccountEmergency({
      ...baseInput,
      account: {
        disapproval_rate: 0.01,
        quality_rating: 'AVERAGE',
        status: 'ACTIVE',
      },
    });

    expect(result).toBeNull();
  });

  it('triggers pause-all when account.status === DISABLED', async () => {
    const result = await evaluateAccountEmergency({
      ...baseInput,
      account: {
        disapproval_rate: 0.0,
        quality_rating: 'ABOVE_AVERAGE',
        status: 'DISABLED',
      },
    });

    expect(result).not.toBeNull();
    expect(result!.ad_id).toBe('*');
    expect(result!.action).toBe('pause');
    expect(result!.reason).toBe('account_emergency_status_disabled');
  });

  it('triggers pause-all when quality_rating === BELOW_AVERAGE', async () => {
    const result = await evaluateAccountEmergency({
      ...baseInput,
      account: {
        disapproval_rate: 0.0,
        quality_rating: 'BELOW_AVERAGE',
        status: 'ACTIVE',
      },
    });

    expect(result).not.toBeNull();
    expect(result!.ad_id).toBe('*');
    expect(result!.action).toBe('pause');
    expect(result!.reason).toBe('account_emergency_quality_below_avg');
  });

  it('triggers pause-all when disapproval_rate exceeds the 5% limit', async () => {
    const result = await evaluateAccountEmergency({
      ...baseInput,
      account: {
        disapproval_rate: 0.07, // 7% > 5% default
        quality_rating: 'AVERAGE',
        status: 'ACTIVE',
      },
    });

    expect(result).not.toBeNull();
    expect(result!.ad_id).toBe('*');
    expect(result!.action).toBe('pause');
    expect(result!.reason).toBe('account_emergency_disapproval_rate=7.0%');
  });

  it('does not trigger when disapproval_rate is exactly at the limit (strict >)', async () => {
    // COLD_START_DEFAULTS.account_disapproval_rate_emergency === 0.05
    const result = await evaluateAccountEmergency({
      ...baseInput,
      account: {
        disapproval_rate: 0.05,
        quality_rating: 'AVERAGE',
        status: 'ACTIVE',
      },
    });

    expect(result).toBeNull();
  });

  it('priority: DISABLED status outranks BELOW_AVERAGE quality + high disapproval', async () => {
    const result = await evaluateAccountEmergency({
      ...baseInput,
      account: {
        disapproval_rate: 0.5,
        quality_rating: 'BELOW_AVERAGE',
        status: 'DISABLED',
      },
    });

    expect(result!.reason).toBe('account_emergency_status_disabled');
  });

  it('priority: BELOW_AVERAGE quality outranks high disapproval', async () => {
    const result = await evaluateAccountEmergency({
      ...baseInput,
      account: {
        disapproval_rate: 0.5,
        quality_rating: 'BELOW_AVERAGE',
        status: 'ACTIVE',
      },
    });

    expect(result!.reason).toBe('account_emergency_quality_below_avg');
  });
});
