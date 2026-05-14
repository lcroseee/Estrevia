/**
 * High-level Meta Conversions API helper.
 *
 * Composes the lower-level primitives (`types`, `dedupe`, `event-mapper`,
 * `client`) into a single fire-and-forget call site that:
 *   1. Lazily constructs a process-wide `CapiClient` from env vars.
 *   2. Hashes PII (email + external_id) at the boundary so plaintext never
 *      leaves this module.
 *   3. Generates a deterministic dedupe `event_id` when the caller hasn't
 *      provided one (matches the fbq `eventID` for client/server dedupe).
 *   4. Swallows network/Meta errors so webhook handlers (Stripe, Clerk) do
 *      NOT 500 just because CAPI is down. Errors surface in console + Sentry.
 *
 * Used by `src/shared/lib/analytics.ts` (parallel-fire alongside PostHog) and
 * by webhook handlers that need to attribute conversions server-side.
 */
import crypto from 'crypto';
import { CapiClient } from './client';
import { generateEventId } from './dedupe';
import type {
  CapiCustomData,
  CapiEventPayload,
} from './types';

let cachedClient: CapiClient | null = null;

function getClient(): CapiClient | null {
  if (cachedClient) return cachedClient;
  const pixelId = process.env.META_PIXEL_ID;
  const capiToken = process.env.META_CAPI_TOKEN;
  if (!pixelId || !capiToken) return null;
  cachedClient = new CapiClient({
    pixelId,
    capiToken,
    graphApiVersion: process.env.META_CAPI_GRAPH_VERSION ?? 'v22.0',
    testEventCode: process.env.META_CAPI_TEST_EVENT_CODE || undefined,
  });
  return cachedClient;
}

/** TEST-ONLY — resets cached client so env-var changes take effect in tests. */
export function _resetClientForTests(): void {
  cachedClient = null;
}

/**
 * SHA-256 hash a PII value the way Meta expects it for `user_data` fields:
 * lowercase + trim, then hex-encoded SHA-256.
 */
export function hashPII(input: string): string {
  return crypto.createHash('sha256').update(input.toLowerCase().trim()).digest('hex');
}

export interface SendCapiInput {
  /** Plaintext email — hashed before send. */
  email?: string;
  /** Plaintext Clerk userId — hashed before send. */
  external_id_raw?: string;
  /** Already-hashed values (e.g. when caller has them pre-hashed). */
  em?: string;
  external_id?: string;
  client_ip_address?: string;
  client_user_agent?: string;
  /** Plain `_fbc` cookie value verbatim. NOT hashed — Meta API spec. */
  fbc?: string;
  /** Plain `_fbp` cookie value verbatim. NOT hashed — Meta API spec. */
  fbp?: string;
}

export interface SendCapiOptions {
  /** When provided, skip dedupe id generation and use this value (must match fbq eventID on client). */
  event_id?: string;
  event_source_url?: string;
}

/**
 * Fire-and-forget CAPI event. Hashes PII, generates a dedupe `event_id` when
 * not provided, and never throws to the caller — webhook handlers must not
 * 500 just because CAPI is down.
 */
export async function sendCapiEvent(
  event_name: string,
  user: SendCapiInput,
  custom_data?: CapiCustomData,
  opts: SendCapiOptions = {},
): Promise<void> {
  const client = getClient();
  if (!client) {
    console.warn('[meta-capi] not configured (META_PIXEL_ID / META_CAPI_TOKEN missing) — event dropped');
    return;
  }

  const event_time = Math.floor(Date.now() / 1000);

  const distinctId = user.external_id_raw ?? user.external_id ?? user.email ?? user.em ?? 'anonymous';
  const event_id = opts.event_id ?? generateEventId(distinctId, event_name, event_time);

  const payload: CapiEventPayload = {
    event_name,
    event_time,
    event_id,
    action_source: 'website',
    user_data: {
      em: user.em ?? (user.email ? hashPII(user.email) : undefined),
      external_id: user.external_id ?? (user.external_id_raw ? hashPII(user.external_id_raw) : undefined),
      client_ip_address: user.client_ip_address,
      client_user_agent: user.client_user_agent,
      fbc: user.fbc,
      fbp: user.fbp,
    },
    custom_data,
    event_source_url: opts.event_source_url,
  };

  try {
    await client.sendEvent(payload);
  } catch (err) {
    console.warn('[meta-capi] sendEvent failed — event dropped:', err instanceof Error ? err.message : err);
    try {
      const { captureException } = await import('@sentry/nextjs');
      captureException(err, { tags: { subsystem: 'meta-capi', event: event_name } });
    } catch {
      // Sentry capture is best-effort.
    }
  }
}
