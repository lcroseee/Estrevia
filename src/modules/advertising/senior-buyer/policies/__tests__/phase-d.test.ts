import { beforeEach, describe, expect, it, vi } from 'vitest';

import { COLD_START_DEFAULTS } from '../../targets';

vi.mock('../../threshold-resolver', () => ({
  resolveThreshold: vi.fn(async (name: keyof typeof COLD_START_DEFAULTS) => {
    return COLD_START_DEFAULTS[name];
  }),
}));

vi.mock('../../comparable-window', () => ({
  comparable: vi.fn(),
}));

import { comparable } from '../../comparable-window';
import type { AdSetState } from '../../state-store';
import { evaluatePhaseD } from '../phase-d';

const mockComparable = vi.mocked(comparable);

const mkState = (overrides: Partial<AdSetState> = {}): AdSetState => ({
  adSetId: 'as_001',
  campaignId: 'camp_001',
  locale: 'en',
  currentPhase: 'C',
  phaseEnteredAt: new Date(),
  dataMaturityMode: 'AUTONOMOUS',
  maturityEnteredAt: new Date(),
  optimizationEvent: 'subscribe',
  conversions7dMeta: 100,
  conversions14dMeta: 200,
  conversionsTotalMeta: 800,
  daysWithPixelData: 60,
  conversions7dPosthog: 80,
  roas7d: 2.5,
  cpa7d: 8.0,
  frequencyCurrent: 2.0,
  parentAdSetId: null,
  duplicatesCount: 0,
  lastActionTakenAt: null,
  flaggedForReview: false,
  flagReason: null,
  updatedAt: new Date(),
  ...overrides,
} as AdSetState);

const mkMetric = (overrides: Partial<{
  frequency_current: number;
  sustained_days_above_decline_freq: number;
  days_in_phase_c: number;
}> = {}) => ({
  frequency_current: 2.0,
  sustained_days_above_decline_freq: 0,
  days_in_phase_c: 10,
  ...overrides,
});

beforeEach(() => {
  mockComparable.mockReset();
  // Default: no comparable signal — both metrics return null
  mockComparable.mockResolvedValue(null);
});

describe('evaluatePhaseD — Q10 decline triggers', () => {
  it('triggers refresh_creative when frequency saturates (>3 sustained 3d)', async () => {
    const decision = await evaluatePhaseD({
      ad_id: 'ad_001',
      state: mkState(),
      metric: mkMetric({
        frequency_current: 3.5,
        sustained_days_above_decline_freq: 3,
      }),
    });

    expect(decision.action).toBe('refresh_creative');
    expect(decision.reason).toContain('frequency_saturation');
    expect(decision.reason).toContain('3.50');
  });

  it('does not trigger frequency saturation when sustained < required days', async () => {
    const decision = await evaluatePhaseD({
      ad_id: 'ad_001',
      state: mkState(),
      metric: mkMetric({
        frequency_current: 4.0,
        sustained_days_above_decline_freq: 2, // below 3-day threshold
      }),
    });

    expect(decision.action).not.toBe('refresh_creative');
  });

  it('triggers refresh_creative when CTR z-score < -2 (CTR fade)', async () => {
    mockComparable.mockImplementation(async (_id, metric) => {
      if (metric === 'ctr') {
        return {
          current_value: 0.005,
          baseline_mean: 0.02,
          baseline_stddev: 0.005,
          delta_pct: -0.75,
          z_score: -3.0,
          is_significant: true,
          sample_size: 4,
        };
      }
      return null;
    });

    const decision = await evaluatePhaseD({
      ad_id: 'ad_001',
      state: mkState(),
      metric: mkMetric(),
    });

    expect(decision.action).toBe('refresh_creative');
    expect(decision.reason).toContain('ctr_fade_z=-3.00');
  });

  it('triggers propose_new_ad_set when conversion-velocity z-score < -2', async () => {
    mockComparable.mockImplementation(async (_id, metric) => {
      if (metric === 'ctr') return null; // CTR healthy
      if (metric === 'conversions_meta') {
        return {
          current_value: 5,
          baseline_mean: 30,
          baseline_stddev: 8,
          delta_pct: -0.83,
          z_score: -3.125,
          is_significant: true,
          sample_size: 4,
        };
      }
      return null;
    });

    const decision = await evaluatePhaseD({
      ad_id: 'ad_001',
      state: mkState(),
      metric: mkMetric(),
    });

    expect(decision.action).toBe('propose_new_ad_set');
    expect(decision.reason).toContain('conv_velocity_drop_z=');
  });

  it('triggers pause_for_rest when plateau ≥30d AND zero duplicates', async () => {
    const decision = await evaluatePhaseD({
      ad_id: 'ad_001',
      state: mkState({ duplicatesCount: 0 }),
      metric: mkMetric({ days_in_phase_c: 30 }),
    });

    expect(decision.action).toBe('pause_for_rest');
    expect(decision.reason).toBe('plateau_30d_no_duplicates');
  });

  it('skips pause_for_rest when ad set already has duplicates', async () => {
    const decision = await evaluatePhaseD({
      ad_id: 'ad_001',
      state: mkState({ duplicatesCount: 1 }),
      metric: mkMetric({ days_in_phase_c: 45 }),
    });

    expect(decision.action).toBe('maintain');
  });

  it('returns maintain when no triggers match', async () => {
    const decision = await evaluatePhaseD({
      ad_id: 'ad_001',
      state: mkState(),
      metric: mkMetric({
        frequency_current: 2.0,
        sustained_days_above_decline_freq: 0,
        days_in_phase_c: 10,
      }),
    });

    expect(decision.action).toBe('maintain');
    expect(decision.reason).toBe('phase_d_no_action_yet');
  });

  it('priority: frequency saturation outranks CTR fade', async () => {
    // Both triggers fire; frequency must win (priority order)
    mockComparable.mockImplementation(async (_id, metric) => {
      if (metric === 'ctr') {
        return {
          current_value: 0.005,
          baseline_mean: 0.02,
          baseline_stddev: 0.005,
          delta_pct: -0.75,
          z_score: -4.0,
          is_significant: true,
          sample_size: 4,
        };
      }
      return null;
    });

    const decision = await evaluatePhaseD({
      ad_id: 'ad_001',
      state: mkState(),
      metric: mkMetric({
        frequency_current: 4.0,
        sustained_days_above_decline_freq: 5,
      }),
    });

    expect(decision.action).toBe('refresh_creative');
    expect(decision.reason).toContain('frequency_saturation');
  });

  it('priority: CTR fade outranks conversion-velocity drop', async () => {
    // Both CTR and conversion z-scores fire; CTR wins
    mockComparable.mockImplementation(async (_id, metric) => {
      if (metric === 'ctr') {
        return {
          current_value: 0.005,
          baseline_mean: 0.02,
          baseline_stddev: 0.005,
          delta_pct: -0.75,
          z_score: -2.5,
          is_significant: true,
          sample_size: 4,
        };
      }
      if (metric === 'conversions_meta') {
        return {
          current_value: 5,
          baseline_mean: 30,
          baseline_stddev: 8,
          delta_pct: -0.83,
          z_score: -3.0,
          is_significant: true,
          sample_size: 4,
        };
      }
      return null;
    });

    const decision = await evaluatePhaseD({
      ad_id: 'ad_001',
      state: mkState(),
      metric: mkMetric(),
    });

    expect(decision.action).toBe('refresh_creative');
    expect(decision.reason).toContain('ctr_fade_z=');
  });
});
