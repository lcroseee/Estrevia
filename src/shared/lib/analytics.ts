/**
 * PostHog analytics wrapper.
 *
 * Client-side: uses posthog-js (lazy, respects cookie consent).
 * Server-side: uses posthog-node for server events (API routes, Server Actions).
 *
 * Guard every client call with `typeof window !== 'undefined'` — this module
 * is imported in both RSC and Client Component contexts.
 */

import { waitUntil } from '@vercel/functions';

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
// Server-side helpers (posthog-node)
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

/**
 * Track an event server-side. Use in Route Handlers and Server Actions.
 * `distinctId` is the Clerk user ID or a temporary anonymous ID.
 *
 * Uses waitUntil() from @vercel/functions so the Vercel Function stays alive
 * until posthog-node flushes, preventing event loss on cold starts.
 */
export function trackServerEvent(
  distinctId: string,
  name: string,
  properties?: Record<string, unknown>,
): void {
  const client = getServerClient();
  if (!client) return;

  client.capture({ distinctId, event: name, properties });

  // Keep the serverless function alive until posthog flushes the event.
  // Without this, Vercel may terminate the function before the batch is sent.
  const flushPromise = Promise.resolve().then(() => client.shutdown());
  waitUntil(flushPromise);
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
  // Conversion funnel — paywall → sign-up → checkout → Stripe
  PAYWALL_OPENED: 'paywall_opened',
  PAYWALL_TRIAL_CLICKED: 'paywall_trial_clicked',
  CHECKOUT_AUTH_REDIRECT: 'checkout_auth_redirect',
  CHECKOUT_AUTO_STARTED: 'checkout_auto_started',
  CHECKOUT_STRIPE_REDIRECTED: 'checkout_stripe_redirected',
  CHECKOUT_ERROR: 'checkout_error',
  // GDPR
  COOKIE_CONSENT_ACCEPTED: 'cookie_consent_accepted',
  COOKIE_CONSENT_DECLINED: 'cookie_consent_declined',
  DATA_EXPORT_REQUESTED: 'data_export_requested',
  ACCOUNT_DELETED: 'account_deleted',
} as const;

export type AnalyticsEventName = (typeof AnalyticsEvent)[keyof typeof AnalyticsEvent];
