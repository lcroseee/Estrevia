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
  conversions_7d?: number | null;
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
  /**
   * ISO-8601 timestamp of the first click that drove this subscription.
   * Captured at checkout-session creation when UTM cookies are present.
   * Used by `fetchStripeAttribution` to enforce the 14-day attribution
   * window (Q4 hybrid: Meta=7d_click, PostHog=14d, Stripe=14d). Optional
   * because legacy subs created before this metadata was captured do not
   * have it; those fall back to `created_at` timing already inside the
   * Stripe-side window.
   */
  utm_click_timestamp?: string;
}

export interface ReconciliationResult {
  meta_clicks: number;
  posthog_landings: number;
  delta_pct: number;
  status: 'match' | 'minor_drift' | 'critical_drift';
  threshold_minor: 0.10;
  threshold_critical: 0.25;
}
