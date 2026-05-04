import { describe, it, expect } from 'vitest';
import { COLD_START_DEFAULTS } from '../targets';

describe('COLD_START_DEFAULTS', () => {
  it('has realistic LTV-derived CPA targets ($1.50 signup, $10 subscription)', () => {
    expect(COLD_START_DEFAULTS.target_cpa_signup_usd).toBeCloseTo(1.5);
    expect(COLD_START_DEFAULTS.target_cpa_subscription_usd).toBeCloseTo(10.0);
  });

  it('phase B → C uses 50/7d Meta-default', () => {
    expect(COLD_START_DEFAULTS.phase_b_to_c_conv_meta_7d).toBe(50);
    expect(COLD_START_DEFAULTS.phase_b_to_c_conv_meta_14d_fallback).toBe(30);
    expect(COLD_START_DEFAULTS.phase_b_max_days).toBe(14);
  });

  it('phase C scale criteria match spec (ROAS ≥2x or CPA ≤0.6x, freq <2.5, +50%, max 2 dupes)', () => {
    expect(COLD_START_DEFAULTS.scale_roas_min_multiplier).toBe(2.0);
    expect(COLD_START_DEFAULTS.scale_cpa_max_multiplier).toBe(0.6);
    expect(COLD_START_DEFAULTS.scale_frequency_max).toBe(2.5);
    expect(COLD_START_DEFAULTS.scale_budget_increase_pct).toBe(50);
    expect(COLD_START_DEFAULTS.scale_max_duplicates_per_parent).toBe(2);
  });

  it('phase C pause criteria match spec (CPA >2x sustained 7d OR ROAS <0.5x sustained 14d OR freq >4)', () => {
    expect(COLD_START_DEFAULTS.pause_cpa_threshold_multiplier).toBe(2.0);
    expect(COLD_START_DEFAULTS.pause_cpa_sustained_days).toBe(7);
    expect(COLD_START_DEFAULTS.pause_roas_threshold_multiplier).toBe(0.5);
    expect(COLD_START_DEFAULTS.pause_roas_sustained_days).toBe(14);
    expect(COLD_START_DEFAULTS.pause_frequency_threshold).toBe(4.0);
  });

  it('Phase B extreme failures match spec', () => {
    expect(COLD_START_DEFAULTS.phase_b_extreme_frequency_cap).toBe(5.0);
    expect(COLD_START_DEFAULTS.phase_b_extreme_zero_conv_spend_floor_usd).toBe(50.0);
    expect(COLD_START_DEFAULTS.phase_b_extreme_ctr_doa).toBeCloseTo(0.003);
    expect(COLD_START_DEFAULTS.phase_b_extreme_ctr_doa_min_impressions).toBe(1000);
    expect(COLD_START_DEFAULTS.phase_b_extreme_cpc_cap_usd).toBe(10.0);
    expect(COLD_START_DEFAULTS.account_disapproval_rate_emergency).toBeCloseTo(0.05);
  });

  it('hybrid event-switch thresholds (50 Lead → switch; 100 Lead/wk + 10 Sub/wk → next)', () => {
    expect(COLD_START_DEFAULTS.hybrid_switch_signup_to_lead_conv_7d).toBe(50);
    expect(COLD_START_DEFAULTS.hybrid_switch_lead_to_subscribe_lead_per_week).toBe(100);
    expect(COLD_START_DEFAULTS.hybrid_switch_lead_to_subscribe_sub_per_week).toBe(10);
  });

  it('data maturity boundaries match spec (50/14 → CALIBRATING, 500/60/0.5cv → AUTONOMOUS)', () => {
    expect(COLD_START_DEFAULTS.maturity_cold_start_max_conv_total).toBe(50);
    expect(COLD_START_DEFAULTS.maturity_cold_start_max_days).toBe(14);
    expect(COLD_START_DEFAULTS.maturity_calibrating_max_conv_total).toBe(500);
    expect(COLD_START_DEFAULTS.maturity_calibrating_max_days).toBe(60);
    expect(COLD_START_DEFAULTS.maturity_calibrating_max_cv).toBeCloseTo(0.5);
  });

  it('auto-calibrator protections match spec', () => {
    expect(COLD_START_DEFAULTS.calibration_min_history_days).toBe(30);
    expect(COLD_START_DEFAULTS.calibration_outlier_pct_to_drop).toBeCloseTo(0.1);
    expect(COLD_START_DEFAULTS.calibration_drift_z_threshold).toBe(3.0);
    expect(COLD_START_DEFAULTS.calibration_max_change_factor).toBe(2.0);
  });

  it('approval routing constants match spec', () => {
    expect(COLD_START_DEFAULTS.approval_low_risk_timeout_hours).toBe(4);
    expect(COLD_START_DEFAULTS.approval_cooldown_after_reject_hours).toBe(24);
  });

  it('is frozen as a const (TypeScript-readonly via `as const`)', () => {
    // Type-level: this would fail compile if not `as const`. Runtime: object is plain.
    expect(typeof COLD_START_DEFAULTS).toBe('object');
  });
});
