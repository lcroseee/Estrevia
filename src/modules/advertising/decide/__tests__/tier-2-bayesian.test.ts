import { describe, it, expect } from 'vitest';
import {
  computePosterior,
  computePAbove,
  decideBayesian,
  PRIOR_ALPHA,
  PRIOR_BETA,
  MIN_IMPRESSIONS,
  SCALE_UP_CTR_THRESHOLD,
  PAUSE_CTR_THRESHOLD,
} from '../tier-2-bayesian';
import { mockAdMetric } from '../../__tests__/fixtures';

describe('computePosterior', () => {
  it('updates alpha and beta correctly from prior', () => {
    const result = computePosterior({
      ad_id: 'ad_001',
      metric: 'ctr',
      successes: 100,   // 100 clicks
      trials: 5000,     // 5000 impressions
      prior_alpha: PRIOR_ALPHA,  // 20
      prior_beta: PRIOR_BETA,    // 1980
    });

    // alpha = 20 + 100 = 120
    expect(result.alpha).toBe(120);
    // beta = 1980 + (5000 - 100) = 1980 + 4900 = 6880
    expect(result.beta).toBe(6880);
    // mean = 120 / (120 + 6880) = 120 / 7000 ≈ 0.01714
    expect(result.mean).toBeCloseTo(120 / 7000, 5);
  });

  it('produces CI that contains the mean', () => {
    const result = computePosterior({
      ad_id: 'ad_001',
      metric: 'ctr',
      successes: 50,
      trials: 2000,
      prior_alpha: PRIOR_ALPHA,
      prior_beta: PRIOR_BETA,
    });

    expect(result.ci_95_lower).toBeLessThan(result.mean);
    expect(result.ci_95_upper).toBeGreaterThan(result.mean);
  });

  it('narrows CI with more data', () => {
    const small = computePosterior({
      ad_id: 'ad_001',
      metric: 'ctr',
      successes: 10,
      trials: 500,
      prior_alpha: PRIOR_ALPHA,
      prior_beta: PRIOR_BETA,
    });
    const large = computePosterior({
      ad_id: 'ad_001',
      metric: 'ctr',
      successes: 100,
      trials: 5000,
      prior_alpha: PRIOR_ALPHA,
      prior_beta: PRIOR_BETA,
    });

    const smallWidth = small.ci_95_upper - small.ci_95_lower;
    const largeWidth = large.ci_95_upper - large.ci_95_lower;
    expect(largeWidth).toBeLessThan(smallWidth);
  });

  it('sets sample_size to trials', () => {
    const result = computePosterior({
      ad_id: 'ad_001',
      metric: 'ctr',
      successes: 20,
      trials: 1200,
      prior_alpha: PRIOR_ALPHA,
      prior_beta: PRIOR_BETA,
    });
    expect(result.sample_size).toBe(1200);
  });

  it('returns p_above_threshold as 0 placeholder', () => {
    const result = computePosterior({
      ad_id: 'ad_001',
      metric: 'ctr',
      successes: 50,
      trials: 2000,
      prior_alpha: PRIOR_ALPHA,
      prior_beta: PRIOR_BETA,
    });
    expect(result.p_above_threshold).toBe(0);
  });
});

describe('computePAbove', () => {
  it('returns near 1 when threshold is far below the distribution mean', () => {
    // Beta(200, 800): mean = 0.2, P(X > 0.001) should be ~1
    const p = computePAbove(200, 800, 0.001);
    expect(p).toBeGreaterThan(0.999);
  });

  it('returns near 0 when threshold is far above the distribution mean', () => {
    // Beta(20, 1980): mean ≈ 0.01, P(X > 0.5) should be ~0
    const p = computePAbove(20, 1980, 0.5);
    expect(p).toBeLessThan(0.001);
  });

  it('returns ~0.5 near the mean', () => {
    // Beta(100, 900): mean = 0.1, P(X > 0.1) ≈ 0.5
    const p = computePAbove(100, 900, 0.1);
    expect(p).toBeGreaterThan(0.4);
    expect(p).toBeLessThan(0.6);
  });
});

describe('decideBayesian', () => {
  it('returns hold with confidence=0 when impressions < 1000', () => {
    const metric = mockAdMetric({ impressions: 500, clicks: 15, ctr: 0.03 });
    const decision = decideBayesian(metric);

    expect(decision.action).toBe('hold');
    expect(decision.confidence).toBe(0);
    expect(decision.reasoning_tier).toBe('tier_2_bayesian');
    expect(decision.reason).toMatch(/insufficient_sample/);
  });

  it('returns hold when impressions exactly equals MIN_IMPRESSIONS - 1', () => {
    const metric = mockAdMetric({ impressions: MIN_IMPRESSIONS - 1, clicks: 30 });
    const decision = decideBayesian(metric);
    expect(decision.action).toBe('hold');
    expect(decision.confidence).toBe(0);
  });

  it('returns scale_up with delta_budget_usd when CTR clearly > 2%', () => {
    // 200 clicks / 2000 impressions = 10% CTR → P(CTR > 0.02) should be >> 0.95
    const metric = mockAdMetric({ impressions: 2000, clicks: 200, ctr: 0.10 });
    const decision = decideBayesian(metric);

    expect(decision.action).toBe('scale_up');
    expect(decision.delta_budget_usd).toBe(5);
    expect(decision.confidence).toBeGreaterThan(0.95);
    expect(decision.reasoning_tier).toBe('tier_2_bayesian');
  });

  it('returns pause when CTR is clearly < 1%', () => {
    // 2 clicks / 3000 impressions = 0.067% CTR → P(CTR < 0.01) should be >> 0.95
    const metric = mockAdMetric({ impressions: 3000, clicks: 2, ctr: 0.00067 });
    const decision = decideBayesian(metric);

    expect(decision.action).toBe('pause');
    expect(decision.confidence).toBeGreaterThan(0.95);
    expect(decision.reasoning_tier).toBe('tier_2_bayesian');
  });

  it('returns hold when CTR is in the uncertain band (≈ 1.5%)', () => {
    // 23 clicks / 1500 impressions ≈ 1.53% — too close to either threshold
    const metric = mockAdMetric({ impressions: 1500, clicks: 23, ctr: 0.0153 });
    const decision = decideBayesian(metric);

    expect(decision.action).toBe('hold');
    expect(decision.reasoning_tier).toBe('tier_2_bayesian');
  });

  it('always sets reasoning_tier = tier_2_bayesian', () => {
    const cases = [
      mockAdMetric({ impressions: 100 }),            // too small
      mockAdMetric({ impressions: 5000, clicks: 3 }), // low CTR
      mockAdMetric({ impressions: 5000, clicks: 200 }), // high CTR
    ];
    for (const m of cases) {
      expect(decideBayesian(m).reasoning_tier).toBe('tier_2_bayesian');
    }
  });

  it('includes metrics_snapshot in every decision', () => {
    const metric = mockAdMetric({ impressions: 1000, clicks: 10 });
    const decision = decideBayesian(metric);
    expect(decision.metrics_snapshot).toBe(metric);
  });

  it('verifies posterior math: known example', () => {
    // 50 clicks / 2000 impressions → observed CTR = 2.5%
    // alpha = 20 + 50 = 70, beta = 1980 + 1950 = 3930
    // mean = 70 / 4000 = 0.0175
    const metric = mockAdMetric({ impressions: 2000, clicks: 50, ctr: 0.025 });
    const decision = decideBayesian(metric);

    // Mean ≈ 1.75% — below SCALE_UP_CTR_THRESHOLD (2%) with the prior pulling it down
    // P(CTR > 2%) should not cross 0.95, but P(CTR < 1%) also should not
    // → hold is expected
    expect(decision.action).toBe('hold');
    expect(decision.confidence).toBeGreaterThanOrEqual(0);
    expect(decision.confidence).toBeLessThanOrEqual(1);
  });

  it('scale_up confidence is the actual P(CTR > threshold)', () => {
    const metric = mockAdMetric({ impressions: 5000, clicks: 500, ctr: 0.10 });
    const decision = decideBayesian(metric);

    expect(decision.action).toBe('scale_up');
    // Confidence must be > 0.95 (the action threshold) and ≤ 1
    expect(decision.confidence).toBeGreaterThan(0.95);
    expect(decision.confidence).toBeLessThanOrEqual(1);
  });

  it('pause confidence is the actual P(CTR < threshold)', () => {
    const metric = mockAdMetric({ impressions: 5000, clicks: 10, ctr: 0.002 });
    const decision = decideBayesian(metric);

    expect(decision.action).toBe('pause');
    expect(decision.confidence).toBeGreaterThan(0.95);
    expect(decision.confidence).toBeLessThanOrEqual(1);
  });
});

describe('decideBayesian — boundary: exactly 1000 impressions', () => {
  it('does NOT return insufficient_sample at exactly 1000 impressions', () => {
    const metric = mockAdMetric({ impressions: MIN_IMPRESSIONS, clicks: 5 });
    const decision = decideBayesian(metric);
    // Should not be confidence=0 insufficient_sample path
    expect(decision.reason).not.toMatch(/insufficient_sample/);
  });
});

describe('prior hyperparameters', () => {
  it('prior Beta(20, 1980) has mean ≈ 1%', () => {
    const mean = PRIOR_ALPHA / (PRIOR_ALPHA + PRIOR_BETA);
    expect(mean).toBeCloseTo(0.01, 3);
  });

  it('scale_up threshold is 2% and pause threshold is 1%', () => {
    expect(SCALE_UP_CTR_THRESHOLD).toBe(0.02);
    expect(PAUSE_CTR_THRESHOLD).toBe(0.01);
  });
});
