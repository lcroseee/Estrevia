import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runDailyAudienceRefresh } from '../refresh-cycle';
import type { RefreshCycleDeps } from '../refresh-cycle';
import type { ExclusionsDeps } from '../exclusions';
import type { RetargetingDeps } from '../retargeting';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeEmails = (count: number, suffix = ''): string[] =>
  Array.from({ length: count }, (_, i) => `user${i}${suffix}@example.com`);

const now = new Date('2026-04-26T12:00:00Z');

/** Returns ExclusionsDeps that will succeed with the given audience size. */
function makeExclusionDeps(size: number): ExclusionsDeps {
  return {
    stripe: {
      listActiveCustomers: vi.fn().mockResolvedValue(
        makeEmails(size).map((e, i) => ({ email_hash: `hash_${i}`, user_id: `u_${i}` })),
      ),
    },
    posthog: {
      getRecentlyRegisteredEmails: vi.fn().mockResolvedValue([]),
    },
    metaApi: {
      upsertCustomAudience: vi.fn().mockResolvedValue({ audience_id: 'aud_excl_001' }),
    },
    db: {
      upsertAudienceRow: vi.fn().mockResolvedValue({
        id: 'row_excl',
        kind: 'exclusion' as const,
        metaAudienceId: 'aud_excl_001',
        size,
        lastRefreshedAt: now,
        sourceQuery: '',
        activeInCampaigns: [],
      }),
    },
    now,
  };
}

/** Returns RetargetingDeps that will succeed (no activation). */
function makeRetargetingDeps(cnrSize: number, rnpSize: number): RetargetingDeps {
  return {
    posthog: {
      getCalcNoRegisterEmails: vi.fn().mockResolvedValue(makeEmails(cnrSize)),
      getRegisterNoPaidEmails: vi.fn().mockResolvedValue(makeEmails(rnpSize, '+rnp')),
    },
    metaApi: {
      upsertCustomAudience: vi
        .fn()
        .mockResolvedValueOnce({ audience_id: 'aud_cnr_001' })
        .mockResolvedValueOnce({ audience_id: 'aud_rnp_001' }),
    },
    db: {
      upsertAudienceRow: vi.fn().mockResolvedValue({
        id: 'row_ret',
        kind: 'retargeting_calc_no_register' as const,
        metaAudienceId: null,
        size: 0,
        lastRefreshedAt: now,
        sourceQuery: '',
        activeInCampaigns: [],
      }),
      getFeatureGateMode: vi.fn().mockResolvedValue(null),
      activateFeatureGate: vi.fn().mockResolvedValue(undefined),
    },
    now,
  };
}

function makeDeps(opts: {
  exclusionSize?: number;
  retargetCnrSize?: number;
  retargetRnpSize?: number;
} = {}): RefreshCycleDeps {
  return {
    exclusions: makeExclusionDeps(opts.exclusionSize ?? 150),
    retargeting: makeRetargetingDeps(
      opts.retargetCnrSize ?? 10,
      opts.retargetRnpSize ?? 10,
    ),
    now,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runDailyAudienceRefresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a report with 2 outcomes on full success', async () => {
    const deps = makeDeps({ exclusionSize: 150 });

    const report = await runDailyAudienceRefresh(deps);

    expect(report.total_audiences).toBe(2);
    expect(report.failed_audiences).toBe(0);
    expect(report.outcomes).toHaveLength(2);
    expect(report.ran_at).toEqual(now);
  });

  it('captures exclusion outcome correctly when it skips (size=0)', async () => {
    const deps = makeDeps({ exclusionSize: 0 });

    const report = await runDailyAudienceRefresh(deps);

    const exclOutcome = report.outcomes.find((o) => o.kind === 'exclusion');
    expect(exclOutcome).toBeDefined();
    expect(exclOutcome?.error).toBeUndefined();
    if (exclOutcome && !exclOutcome.error) {
      expect(exclOutcome.result?.skipped).toBe(true);
    }
    expect(report.failed_audiences).toBe(0);
  });

  it('continues retargeting even when exclusions fail (partial failure)', async () => {
    const deps = makeDeps();
    deps.exclusions.stripe.listActiveCustomers = vi
      .fn()
      .mockRejectedValue(new Error('Stripe API unreachable'));

    const report = await runDailyAudienceRefresh(deps);

    expect(report.total_audiences).toBe(2);
    expect(report.failed_audiences).toBe(1);

    const exclOutcome = report.outcomes.find((o) => o.kind === 'exclusion');
    expect(exclOutcome?.error).toBe('Stripe API unreachable');

    const retOutcome = report.outcomes.find((o) => o.kind === 'retargeting');
    expect(retOutcome?.error).toBeUndefined();
    expect(retOutcome?.result).toBeDefined();
  });

  it('captures retargeting failure without aborting exclusions', async () => {
    const deps = makeDeps({ exclusionSize: 120 });
    deps.retargeting.posthog.getCalcNoRegisterEmails = vi
      .fn()
      .mockRejectedValue(new Error('PostHog timeout'));

    const report = await runDailyAudienceRefresh(deps);

    expect(report.failed_audiences).toBe(1);

    const retOutcome = report.outcomes.find((o) => o.kind === 'retargeting');
    expect(retOutcome?.error).toBe('PostHog timeout');

    const exclOutcome = report.outcomes.find((o) => o.kind === 'exclusion');
    expect(exclOutcome?.error).toBeUndefined();
  });

  it('returns failed_audiences=2 when both streams fail', async () => {
    const deps = makeDeps();
    deps.exclusions.stripe.listActiveCustomers = vi
      .fn()
      .mockRejectedValue(new Error('stripe down'));
    deps.retargeting.posthog.getCalcNoRegisterEmails = vi
      .fn()
      .mockRejectedValue(new Error('posthog down'));

    const report = await runDailyAudienceRefresh(deps);

    expect(report.failed_audiences).toBe(2);
    report.outcomes.forEach((o) => expect(o.error).toBeDefined());
  });

  it('uses provided now timestamp in ran_at', async () => {
    const customNow = new Date('2026-01-15T08:30:00Z');
    const deps = { ...makeDeps(), now: customNow };

    const report = await runDailyAudienceRefresh(deps);

    expect(report.ran_at).toEqual(customNow);
  });

  it('propagates non-Error exceptions as string in error field', async () => {
    const deps = makeDeps();
    deps.exclusions.stripe.listActiveCustomers = vi.fn().mockRejectedValue('raw string error');

    const report = await runDailyAudienceRefresh(deps);

    const exclOutcome = report.outcomes.find((o) => o.kind === 'exclusion');
    expect(exclOutcome?.error).toBe('raw string error');
  });
});
