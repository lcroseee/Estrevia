import type { AdMetric } from './perceive';

export type DecisionAction =
  | 'pause' | 'scale_up' | 'scale_down'
  | 'maintain' | 'duplicate' | 'hold';

export type DecisionTier = 'tier_1_rules' | 'tier_2_bayesian' | 'tier_3_anomaly';

export interface AdDecision {
  ad_id: string;
  action: DecisionAction;
  delta_budget_usd?: number;
  reason: string;
  reasoning_tier: DecisionTier;
  confidence: number; // 0..1
  metrics_snapshot: AdMetric;
}

export interface BayesianPosterior {
  ad_id: string;
  metric: 'ctr' | 'cpc' | 'conversion_rate';
  alpha: number;
  beta: number;
  mean: number;
  ci_95_lower: number;
  ci_95_upper: number;
  p_above_threshold: number;
  sample_size: number;
}

export interface FeatureGate {
  feature_id: string;
  mode: 'off' | 'shadow' | 'active_proposal' | 'active_auto';
  activation_criteria: {
    min_impressions_per_creative?: number;
    min_days_running?: number;
    min_paying_customers?: number;
    min_audience_size?: number;
    shadow_agreement_threshold?: number;
  };
  current_state: Record<string, number>;
  activated_at?: Date;
}

export interface BrandVoiceScore {
  ad_id: string;
  depth: number; // 1-10
  scientific: number; // 1-10
  respectful: number; // 1-10
  no_manipulation: boolean;
  overall: number; // weighted avg
  needs_review: boolean;
  reviewed_by_claude_at: Date;
}
