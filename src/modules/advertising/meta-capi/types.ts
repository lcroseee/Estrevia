/**
 * Shared types for Meta Conversions API (CAPI) integration.
 *
 * PII discipline: `external_id` and `em` MUST be SHA-256-hashed before being
 * placed in CapiUserData. Callers are responsible. The `meta-capi/index.ts`
 * `sendCapiEvent` wrapper does this on behalf of typical callers.
 */

export interface CapiUserData {
  /** SHA-256 hash of normalized Clerk userId. */
  external_id?: string;
  /** SHA-256 hash of lowercase + trimmed email. */
  em?: string;
  /** Request IP, plain (Meta hashes server-side). */
  client_ip_address?: string;
  /** Request User-Agent, plain. */
  client_user_agent?: string;
  /** Optional: hashed first/last name + DOB if collected. */
  fn?: string;
  ln?: string;
  db?: string;
}

export interface CapiCustomData {
  /** Monetary value for value-tracking events (Subscribe, Purchase). */
  value?: number;
  /** ISO 4217 currency code. */
  currency?: string;
  content_ids?: string[];
  content_type?: string;
  predicted_ltv?: number;
  /** Catch-all for additional custom params (Meta accepts arbitrary JSON-serialisable values). */
  [key: string]: unknown;
}

export type CapiActionSource =
  | 'website'
  | 'email'
  | 'app'
  | 'phone_call'
  | 'chat'
  | 'physical_store'
  | 'system_generated'
  | 'other';

export interface CapiEventPayload {
  event_name: string;          // 'Lead' | 'Subscribe' | 'ViewContent' | 'PageView' | custom 'Share' etc.
  event_time: number;          // Unix seconds
  event_id: string;            // Dedupe key — same as fbq event_id
  action_source: CapiActionSource;
  user_data: CapiUserData;
  custom_data?: CapiCustomData;
  event_source_url?: string;
  /** Optional: only when running through Test Events page in Meta Events Manager. */
  test_event_code?: string;
}

export interface CapiBatchResponse {
  events_received: number;
  messages?: string[];
  fbtrace_id?: string;
}

/** Internal Estrevia events surfaced via `src/shared/lib/analytics.ts:AnalyticsEvent`. */
export type EstreviaEvent =
  | 'landing_view'
  | 'chart_calculated'
  | 'passport_reshared'
  | 'user_registered'
  | 'paywall_opened'
  | 'subscription_started';
