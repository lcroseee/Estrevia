/**
 * PostHog analytics wrapper.
 *
 * Client-side: uses posthog-js (lazy, respects cookie consent).
 * Server-side: uses posthog-node for server events (API routes, Server Actions).
 *
 * Server-side events ALSO fire to Meta Conversions API in parallel when the
 * event maps to a Meta standard event (see `meta-capi/event-mapper.ts`). The
 * `$insert_id` property — when present — is used as both the PostHog dedupe id
 * and the CAPI `event_id`, ensuring client/server CAPI dedupe matches the
 * Pixel `eventID` set on the same browser session.
 *
 * Guard every client call with `typeof window !== 'undefined'` — this module
 * is imported in both RSC and Client Component contexts.
 */
import { waitUntil } from '@vercel/functions';

import { sendCapiEvent } from '@/modules/advertising/meta-capi';
import { mapEstreviaToMeta } from '@/modules/advertising/meta-capi/event-mapper';
import type {
  CapiCustomData,
  EstreviaEvent,
} from '@/modules/advertising/meta-capi/types';

// ---------------------------------------------------------------------------
// Client-side helpers
// ---------------------------------------------------------------------------

/**
 * Track an analytics event. Safe to call from both Client Components and
 * Server Components (no-ops on the server in the browser-targeted path).
 *
 * For server-side events, use `trackServerEvent()` instead.
 */
export function trackEvent(
  name: string,
  properties?: Record<string, unknown>,
): void {
  if (typeof window === 'undefined') return;

  // posthog-js is loaded lazily by PostHogProvider. Access through window.__ph.
  const ph = (window as unknown as { posthog?: PostHogClient }).posthog;
  if (!ph) return;

  ph.capture(name, properties);
}

/**
 * Identify the current user. Call after sign-in to attach traits.
 */
export function identifyUser(
  userId: string,
  traits?: Record<string, unknown>,
): void {
  if (typeof window === 'undefined') return;

  const ph = (window as unknown as { posthog?: PostHogClient }).posthog;
  if (!ph) return;

  ph.identify(userId, traits);
}

/**
 * Reset the current user identity (call on sign-out).
 */
export function resetUser(): void {
  if (typeof window === 'undefined') return;

  const ph = (window as unknown as { posthog?: PostHogClient }).posthog;
  if (!ph) return;

  ph.reset();
}

// ---------------------------------------------------------------------------
// Server-side helpers (posthog-node + Meta CAPI)
// ---------------------------------------------------------------------------

type PostHogNodeClient = {
  capture: (params: {
    distinctId: string;
    event: string;
    properties?: Record<string, unknown>;
  }) => void;
  shutdown: () => Promise<void>;
};

let _serverClient: PostHogNodeClient | null = null;

function getServerClient(): PostHogNodeClient | null {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com';

  if (!key) return null;

  if (!_serverClient) {
    // Dynamically import to keep posthog-node out of the browser bundle.
    // Synchronous access is safe here — this code path runs server-only.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PostHog } = require('posthog-node') as { PostHog: new (key: string, opts?: { host: string }) => PostHogNodeClient };
    _serverClient = new PostHog(key, { host });
  }

  return _serverClient;
}

const ESTREVIA_EVENT_NAMES = new Set<EstreviaEvent>([
  'landing_view',
  'chart_calculated',
  'passport_reshared',
  'user_registered',
  'email_lead_submitted',
  'paywall_opened',
  'subscription_started',
]);

function isEstreviaEvent(name: string): name is EstreviaEvent {
  return ESTREVIA_EVENT_NAMES.has(name as EstreviaEvent);
}

/**
 * Distil the optional CAPI `custom_data` fields out of an arbitrary PostHog
 * properties bag. Only well-typed Meta-known fields pass through; everything
 * else is dropped to avoid leaking unexpected payloads.
 */
function propertiesToCustomData(props?: Record<string, unknown>): CapiCustomData | undefined {
  if (!props) return undefined;
  const cd: CapiCustomData = {};
  if (typeof props.value === 'number') cd.value = props.value;
  if (typeof props.currency === 'string') cd.currency = props.currency;
  if (typeof props.predicted_ltv === 'number') cd.predicted_ltv = props.predicted_ltv;
  if (Array.isArray(props.content_ids)) cd.content_ids = props.content_ids as string[];
  if (typeof props.content_type === 'string') cd.content_type = props.content_type;
  return Object.keys(cd).length > 0 ? cd : undefined;
}

/**
 * Track an event server-side. Use in Route Handlers and Server Actions.
 * `distinctId` is the Clerk user ID or a temporary anonymous ID.
 *
 * Uses waitUntil() from @vercel/functions so the Vercel Function stays alive
 * until posthog-node flushes, preventing event loss on cold starts.
 *
 * Also fires to Meta CAPI (fire-and-forget) when the event maps to a Meta
 * standard event. The `$insert_id` PostHog property — when present — is used
 * as the CAPI `event_id` for client/server dedupe.
 */
export function trackServerEvent(
  distinctId: string,
  name: string,
  properties?: Record<string, unknown>,
): void {
  const client = getServerClient();
  if (client) {
    client.capture({ distinctId, event: name, properties });

    // Keep the serverless function alive until posthog flushes the event.
    // Without this, Vercel may terminate the function before the batch is sent.
    const flushPromise = Promise.resolve().then(() => client.shutdown());
    waitUntil(flushPromise);
  }

  // Also fire to Meta CAPI when the event maps to a CAPI conversion. CAPI
  // failures are silent (sendCapiEvent never throws) so PostHog success is
  // never blocked on CAPI availability.
  if (isEstreviaEvent(name)) {
    const mapped = mapEstreviaToMeta(name);
    if (mapped.capi) {
      const email = typeof properties?.email === 'string' ? properties.email : undefined;
      const event_id = typeof properties?.$insert_id === 'string' ? properties.$insert_id : undefined;
      const fbc = typeof properties?.fbc === 'string' ? properties.fbc : undefined;
      const fbp = typeof properties?.fbp === 'string' ? properties.fbp : undefined;
      const client_ip_address = typeof properties?.client_ip_address === 'string'
        ? properties.client_ip_address : undefined;
      const client_user_agent = typeof properties?.client_user_agent === 'string'
        ? properties.client_user_agent : undefined;
      const event_source_url = typeof properties?.event_source_url === 'string'
        ? properties.event_source_url : undefined;
      const capiPromise = sendCapiEvent(
        mapped.capi,
        { external_id_raw: distinctId, email, fbc, fbp, client_ip_address, client_user_agent },
        propertiesToCustomData(properties),
        {
          ...(event_id ? { event_id } : {}),
          ...(event_source_url ? { event_source_url } : {}),
        },
      );
      // Keep the function alive for CAPI flush, same pattern as PostHog above.
      waitUntil(capiPromise);
    }
  }
}

// ---------------------------------------------------------------------------
// Minimal interface stub — keeps this module free of posthog-js imports
// so it can be safely imported in Server Components.
// ---------------------------------------------------------------------------

interface PostHogClient {
  capture: (event: string, properties?: Record<string, unknown>) => void;
  identify: (userId: string, traits?: Record<string, unknown>) => void;
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Canonical event names — avoids typos across the codebase
// ---------------------------------------------------------------------------

export const AnalyticsEvent = {
  // Funnel — viral acquisition path (matches advertising agent's expected events)
  LANDING_VIEW: 'landing_view',
  // Chart
  CHART_CALCULATED: 'chart_calculated',
  CHART_SAVED: 'chart_saved',
  CHART_TOGGLE_SIDEREAL: 'chart_toggle_sidereal',
  // Passport / viral
  PASSPORT_CREATED: 'passport_created',
  PASSPORT_VIEWED: 'passport_viewed',
  PASSPORT_CONVERTED: 'passport_converted',
  PASSPORT_RESHARED: 'passport_reshared',
  PASSPORT_DOWNLOADED: 'passport_downloaded',
  // Auth
  USER_SIGNED_UP: 'user_signed_up',
  USER_SIGNED_IN: 'user_signed_in',
  USER_REGISTERED: 'user_registered',
  // Email gate — anonymous email-capture funnel
  EMAIL_LEAD_SUBMITTED: 'email_lead_submitted',
  EMAIL_LEAD_RESUBMITTED: 'email_lead_resubmitted', // PostHog only — no CAPI
  EMAIL_GATE_DISMISSED: 'email_gate_dismissed',     // PostHog only — no CAPI
  // Conversion funnel — paywall → sign-up → checkout → Stripe
  PAYWALL_CTA_VIEWED: 'paywall_cta_viewed',
  CHART_READING_GENERATED: 'chart_reading_generated',
  PAYWALL_OPENED: 'paywall_opened',
  PAYWALL_TRIAL_CLICKED: 'paywall_trial_clicked',
  CHECKOUT_AUTH_REDIRECT: 'checkout_auth_redirect',
  CHECKOUT_AUTO_STARTED: 'checkout_auto_started',
  CHECKOUT_STRIPE_REDIRECTED: 'checkout_stripe_redirected',
  CHECKOUT_ERROR: 'checkout_error',
  SUBSCRIPTION_STARTED: 'subscription_started',
  // GDPR
  COOKIE_CONSENT_ACCEPTED: 'cookie_consent_accepted',
  COOKIE_CONSENT_DECLINED: 'cookie_consent_declined',
  DATA_EXPORT_REQUESTED: 'data_export_requested',
  ACCOUNT_DELETED: 'account_deleted',
  // Avatar
  AVATAR_GENERATED: 'avatar_generated',
  AVATAR_GENERATION_FAILED: 'avatar_generation_failed',
  AVATAR_QUOTA_EXHAUSTED: 'avatar_quota_exhausted',
  AVATAR_STYLE_LOCKED_CLICKED: 'avatar_style_locked_clicked',
} as const;

export type AnalyticsEventName = (typeof AnalyticsEvent)[keyof typeof AnalyticsEvent];
