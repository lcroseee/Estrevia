export interface AdMetric {
  ad_id: string;
  adset_id: string;
  campaign_id: string;
  date: string; // YYYY-MM-DD UTC
  impressions: number;
  clicks: number;
  spend_usd: number;
  ctr: number;
  cpc: number;
  cpm: number;
  frequency: number;
  reach: number;
  days_running: number;
  status: 'ACTIVE' | 'PAUSED' | 'DELETED' | 'DISAPPROVED';
}

export interface FunnelEvent {
  event_name: 'landing_view' | 'chart_calculated' | 'passport_shared'
    | 'user_registered' | 'paywall_view' | 'subscription_started';
  count: number;
  unique_users: number;
  conversion_from_previous: number; // 0..1
}

export interface FunnelSnapshot {
  window_start: Date;
  window_end: Date;
  source_filter?: { utm_source?: string; ad_id?: string };
  steps: FunnelEvent[];
}

export interface StripeAttribution {
  subscription_id: string;
  user_id: string;
  amount_usd: number;
  created_at: Date;
  utm_source?: string;
  utm_campaign?: string;
  utm_content?: string; // ad_id
  first_touch_source?: string;
}

export interface ReconciliationResult {
  meta_clicks: number;
  posthog_landings: number;
  delta_pct: number;
  status: 'match' | 'minor_drift' | 'critical_drift';
  threshold_minor: 0.10;
  threshold_critical: 0.25;
}
