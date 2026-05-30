/**
 * Ephemeral transport for the Clerk sign-in ticket handed to anonymous payers.
 *
 * The ticket is a ~552-char Clerk sign-in token — too long for Stripe's 500-char
 * metadata value cap. It is single-use and short-lived (Clerk token TTL 600 s),
 * so Upstash Redis with a 900 s TTL is the right home: no migration, not persisted
 * in the primary DB, not visible in the Stripe dashboard.
 *
 * Keyed by Stripe Checkout session_id, which the client already holds from the
 * success-url redirect. Written by the webhook (and /recover); read by
 * /session-status (and the /recover fast path).
 */
import { redis } from '@/shared/lib/redis';

const KEY_PREFIX = 'checkout_ticket:';
const TTL_SECONDS = 900;

export async function storeCheckoutTicket(sessionId: string, token: string): Promise<void> {
  await redis.set(`${KEY_PREFIX}${sessionId}`, token, { ex: TTL_SECONDS });
}

export async function getCheckoutTicket(sessionId: string): Promise<string | null> {
  return redis.get<string>(`${KEY_PREFIX}${sessionId}`);
}
