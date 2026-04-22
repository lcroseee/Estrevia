import * as Sentry from '@sentry/nextjs';

/**
 * Sentry PII scrubber — strips sensitive fields from every outbound event.
 * Apply via the `beforeSend` hook in all three Sentry config files.
 */

/**
 * PII field names to redact from Sentry events.
 * Matched case-insensitively as a substring of the object key.
 */
const SENSITIVE_KEYS = [
  'birthDate',
  'birth_date',
  'birthTime',
  'birth_time',
  'latitude',
  'longitude',
  'lat',
  'lon',
  'location',
  'email',
  'phone',
  'encrypted_birth_data',
];

function scrub(obj: unknown): unknown {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(scrub);

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEYS.some(s =>
      k.toLowerCase().includes(s.toLowerCase()),
    )
      ? '[REDACTED]'
      : scrub(v);
  }
  return out;
}

// Derive the `beforeSend` callback type from Sentry.init's options parameter
// so we stay in sync with whatever version of the SDK is installed.
type SentryInitOptions = NonNullable<Parameters<typeof Sentry.init>[0]>;
type BeforeSendParams = Parameters<NonNullable<SentryInitOptions['beforeSend']>>;

/**
 * Scrub PII from request/extra/contexts/breadcrumbs before the event is sent.
 * Use as the `beforeSend` callback in all three Sentry init configs:
 *
 *   beforeSend: scrubSentryEvent,
 */
export function scrubSentryEvent(
  event: BeforeSendParams[0],
  _hint: BeforeSendParams[1],
): BeforeSendParams[0] | null {
  if (event.request) {
    event.request = scrub(event.request) as typeof event.request;
  }
  if (event.extra) {
    event.extra = scrub(event.extra) as typeof event.extra;
  }
  if (event.contexts) {
    event.contexts = scrub(event.contexts) as typeof event.contexts;
  }
  if (Array.isArray(event.breadcrumbs)) {
    event.breadcrumbs = (event.breadcrumbs as Array<{ data?: unknown; [k: string]: unknown }>).map(
      b => ({ ...b, data: scrub(b.data) }),
    ) as typeof event.breadcrumbs;
  }
  return event;
}
