/**
 * Tier-2 Bayesian decision engine.
 *
 * Uses a Beta-Binomial conjugate model for CTR estimation.
 * Prior: Beta(20, 1980) ≈ 1% baseline CTR with weak confidence (~2000 pseudo-impressions).
 *
 * Decision thresholds:
 *   - P(CTR > 0.02) > 0.95 → scale_up (+$5)
 *   - P(CTR < 0.01) > 0.95 → pause
 *   - insufficient sample (impressions < 1000) → hold
 *   - otherwise → hold (uncertain)
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const jstat = require('jstat') as {
  beta: {
    inv(p: number, alpha: number, beta: number): number;
    cdf(x: number, alpha: number, beta: number): number;
  };
};

import type { AdMetric, AdDecision, BayesianPosterior } from '@/shared/types/advertising';

// ---- constants ---------------------------------------------------------------

/** Minimum sample before Bayesian engine acts. Below this: return 'hold'. */
const MIN_IMPRESSIONS = 1_000;

/** CTR performance threshold to trigger scale_up. */
const SCALE_UP_CTR_THRESHOLD = 0.02;

/** CTR underperformance threshold to trigger pause. */
const PAUSE_CTR_THRESHOLD = 0.01;

/** Probability mass required to take a directional action. */
const ACTION_PROBABILITY_THRESHOLD = 0.95;

/** Scale-up budget delta (USD). */
const SCALE_UP_DELTA_USD = 5;

/** Prior hyperparameters: Beta(20, 1980) → 1% mean, ~2000 pseudo-impressions. */
const PRIOR_ALPHA = 20;
const PRIOR_BETA = 1980;

// ---- public API --------------------------------------------------------------

export interface PosteriorInput {
  ad_id: string;
  metric: 'ctr' | 'cpc' | 'conversion_rate';
  successes: number;   // e.g. clicks
  trials: number;      // e.g. impressions
  prior_alpha: number;
  prior_beta: number;
}

/**
 * Compute a Beta-Binomial posterior given observed successes/trials and a prior.
 * Returns alpha, beta, mean, 95% CI, and P(metric > some threshold) via the
 * caller's subsequent use of `jstat.beta.cdf`.
 *
 * `p_above_threshold` is not computed here — call computePAbove() separately
 * or use decideBayesian() which wires everything together.
 */
export function computePosterior(input: PosteriorInput): BayesianPosterior {
  const alpha = input.prior_alpha + input.successes;
  const beta = input.prior_beta + (input.trials - input.successes);
  const mean = alpha / (alpha + beta);
  const ci_95_lower = jstat.beta.inv(0.025, alpha, beta);
  const ci_95_upper = jstat.beta.inv(0.975, alpha, beta);

  return {
    ad_id: input.ad_id,
    metric: input.metric,
    alpha,
    beta,
    mean,
    ci_95_lower,
    ci_95_upper,
    // P(metric > threshold) — caller computes or uses 0 as placeholder
    p_above_threshold: 0,
    sample_size: input.trials,
  };
}

/**
 * Compute P(X > threshold) under a Beta(alpha, beta) distribution.
 * P(X > t) = 1 - CDF(t).
 */
export function computePAbove(alpha: number, beta: number, threshold: number): number {
  return 1 - jstat.beta.cdf(threshold, alpha, beta);
}

/**
 * Main Tier-2 entry point.
 *
 * Accepts an AdMetric and returns an AdDecision using Bayesian CTR inference.
 * Always tags reasoning_tier = 'tier_2_bayesian'.
 */
export function decideBayesian(m: AdMetric): AdDecision {
  const base = {
    ad_id: m.ad_id,
    metrics_snapshot: m,
    reasoning_tier: 'tier_2_bayesian' as const,
  };

  // Insufficient sample — cannot make a reliable inference
  if (m.impressions < MIN_IMPRESSIONS) {
    return {
      ...base,
      action: 'hold',
      reason: `insufficient_sample: impressions=${m.impressions} < ${MIN_IMPRESSIONS}`,
      confidence: 0,
    };
  }

  // Compute CTR posterior
  const successes = m.clicks;
  const trials = m.impressions;

  const posterior = computePosterior({
    ad_id: m.ad_id,
    metric: 'ctr',
    successes,
    trials,
    prior_alpha: PRIOR_ALPHA,
    prior_beta: PRIOR_BETA,
  });

  const p_scale = computePAbove(posterior.alpha, posterior.beta, SCALE_UP_CTR_THRESHOLD);
  // P(CTR < 0.01) = CDF(0.01)
  const p_pause = jstat.beta.cdf(PAUSE_CTR_THRESHOLD, posterior.alpha, posterior.beta);

  if (p_scale > ACTION_PROBABILITY_THRESHOLD) {
    return {
      ...base,
      action: 'scale_up',
      delta_budget_usd: SCALE_UP_DELTA_USD,
      reason: `bayesian_ctr_high: P(CTR>${SCALE_UP_CTR_THRESHOLD})=${p_scale.toFixed(3)}, mean=${posterior.mean.toFixed(4)}`,
      confidence: p_scale,
    };
  }

  if (p_pause > ACTION_PROBABILITY_THRESHOLD) {
    return {
      ...base,
      action: 'pause',
      reason: `bayesian_ctr_low: P(CTR<${PAUSE_CTR_THRESHOLD})=${p_pause.toFixed(3)}, mean=${posterior.mean.toFixed(4)}`,
      confidence: p_pause,
    };
  }

  // Uncertain — hold
  const confidence = Math.max(p_scale, p_pause);
  return {
    ...base,
    action: 'hold',
    reason: `bayesian_uncertain: P(scale)=${p_scale.toFixed(3)}, P(pause)=${p_pause.toFixed(3)}, mean=${posterior.mean.toFixed(4)}`,
    confidence,
  };
}

export {
  MIN_IMPRESSIONS,
  SCALE_UP_CTR_THRESHOLD,
  PAUSE_CTR_THRESHOLD,
  ACTION_PROBABILITY_THRESHOLD,
  SCALE_UP_DELTA_USD,
  PRIOR_ALPHA,
  PRIOR_BETA,
};
