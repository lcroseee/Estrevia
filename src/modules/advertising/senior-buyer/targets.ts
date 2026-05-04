/**
 * Cold-start defaults for the senior-buyer agent.
 *
 * LTV math: Premium $4.99/mo or $34.99/yr ($2.92/mo eff). With 10-15% monthly
 * churn the realistic LTV is $25-40; we use $30 as the conservative median.
 * Payback window: 12 months → CPA target ≤ LTV/3 = $10. Signup CPA assumes
 * 20% signup→subscription conversion (will auto-calibrate to actual rate
 * once measured): $10 × 20% = $2 → use $1.50 to stay conservative.
 *
 * **Every value here is overridable via `advertising_thresholds` table.**
 * `threshold-resolver.ts` consults DB first; this file is the last-resort
 * fallback (and the value tests use deterministically).
 */

export const COLD_START_DEFAULTS = {
  // ─── Conversion-economics targets ──────────────────────
  target_cpa_signup_usd: 1.5, // = $10 sub_cpa × 20% conversion
  target_cpa_subscription_usd: 10.0, // = $30 LTV / 3 (12mo payback)
  target_roas_signup: 1.0, // breakeven for signup-optimization phase
  target_roas_subscription: 2.0, // 2x payback target for subscription phase

  // ─── Phase B → C transition (Q5) ────────────────────────
  phase_b_to_c_conv_meta_7d: 50,
  phase_b_to_c_conv_meta_14d_fallback: 30,
  phase_b_max_days: 14,

  // ─── Phase B extreme failures (Q6) ──────────────────────
  phase_b_extreme_frequency_cap: 5.0,
  phase_b_extreme_zero_conv_spend_floor_usd: 50.0,
  phase_b_extreme_ctr_doa: 0.003,
  phase_b_extreme_ctr_doa_min_impressions: 1000,
  phase_b_extreme_cpc_cap_usd: 10.0,
  account_disapproval_rate_emergency: 0.05,

  // ─── Phase C scale (Q8) ─────────────────────────────────
  scale_roas_min_multiplier: 2.0,
  scale_cpa_max_multiplier: 0.6,
  scale_frequency_max: 2.5,
  scale_sustained_days: 7,
  scale_budget_increase_pct: 50,
  scale_max_duplicates_per_parent: 2,

  // ─── Phase C pause (Q9) ─────────────────────────────────
  pause_cpa_threshold_multiplier: 2.0,
  pause_cpa_sustained_days: 7,
  pause_roas_threshold_multiplier: 0.5,
  pause_roas_sustained_days: 14,
  pause_frequency_threshold: 4.0,

  // ─── Phase D detection (Q10) ────────────────────────────
  decline_frequency_trigger: 3.0,
  decline_frequency_sustained_days: 3,
  decline_z_score_trigger: -2.0,
  decline_plateau_days: 30,

  // ─── Q11 hybrid event switch ────────────────────────────
  hybrid_switch_signup_to_lead_conv_7d: 50,
  hybrid_switch_lead_to_subscribe_lead_per_week: 100,
  hybrid_switch_lead_to_subscribe_sub_per_week: 10,

  // ─── Data maturity classification ───────────────────────
  maturity_cold_start_max_conv_total: 50,
  maturity_cold_start_max_days: 14,
  maturity_calibrating_max_conv_total: 500,
  maturity_calibrating_max_days: 60,
  maturity_calibrating_max_cv: 0.5, // baseline_stddev / baseline_mean

  // ─── Auto-calibrator ────────────────────────────────────
  calibration_min_history_days: 30,
  calibration_outlier_pct_to_drop: 0.1,
  calibration_drift_z_threshold: 3.0,
  calibration_max_change_factor: 2.0, // changes > 2x require founder approval

  // ─── Approval routing (Q12) ─────────────────────────────
  approval_low_risk_timeout_hours: 4,
  approval_cooldown_after_reject_hours: 24,
} as const;

export type ThresholdName = keyof typeof COLD_START_DEFAULTS;
