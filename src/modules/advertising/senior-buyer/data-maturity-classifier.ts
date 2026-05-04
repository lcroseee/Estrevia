import { COLD_START_DEFAULTS } from './targets';

export type DataMaturityMode = 'COLD_START' | 'CALIBRATING' | 'AUTONOMOUS';

export interface ClassifyMaturityInput {
  conversions_total_meta: number;
  days_with_pixel_data: number;
  /** baseline_stddev / baseline_mean (computed by caller). */
  baseline_cv: number;
}

/**
 * Per-ad-set data maturity classifier (spec lines 148-158).
 *
 * COLD_START: insufficient data for any decisioning beyond Phase B exceptions.
 * CALIBRATING: has data but agent decisions still routed through founder approval.
 * AUTONOMOUS: full Q12 reversibility-based routing.
 */
export function classifyMaturity(input: ClassifyMaturityInput): DataMaturityMode {
  const {
    maturity_cold_start_max_conv_total: coldConv,
    maturity_cold_start_max_days: coldDays,
    maturity_calibrating_max_conv_total: calConv,
    maturity_calibrating_max_days: calDays,
    maturity_calibrating_max_cv: calCv,
  } = COLD_START_DEFAULTS;

  if (
    input.conversions_total_meta < coldConv ||
    input.days_with_pixel_data < coldDays
  ) {
    return 'COLD_START';
  }
  if (
    input.conversions_total_meta < calConv ||
    input.days_with_pixel_data < calDays ||
    input.baseline_cv > calCv
  ) {
    return 'CALIBRATING';
  }
  return 'AUTONOMOUS';
}
