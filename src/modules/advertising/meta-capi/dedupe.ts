import crypto from 'crypto';

/**
 * Generate a stable event_id used by BOTH client (fbq eventID) and server (CAPI event_id)
 * for Meta to dedupe same-event-from-two-sources. Determinism is critical.
 *
 * Format: SHA-256(distinctId | event_name | minuteBucket).slice(0, 32)
 *
 * The minute bucket means duplicate calls within the same 60-second window collapse to
 * one event_id. This is appropriate for high-level conversion events; do not use for
 * sub-minute repetition tracking.
 */
export function generateEventId(
  distinctId: string,
  event_name: string,
  timestamp_seconds: number,
): string {
  const minute = minuteBucket(timestamp_seconds);
  const input = `${distinctId}|${event_name}|${minute}`;
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 32);
}

export function minuteBucket(timestamp_seconds: number): number {
  return Math.floor(timestamp_seconds / 60);
}
