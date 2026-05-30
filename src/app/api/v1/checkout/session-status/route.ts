/**
 * GET /api/v1/checkout/session-status?id=<stripe_session_id>
 *
 * Public (no auth) — used by /checkout/complete client polling fallback when
 * the server-side ticket wait times out. Returns:
 *   { ready: true,  ticket: '...' } when the webhook has stored a signInTicket
 *   { ready: false }                when it has not arrived yet
 *
 * The ticket lives in Redis (keyed by session_id), written by the Stripe webhook
 * (and /recover). A Clerk sign-in token is ~552 chars — too long for Stripe's
 * 500-char metadata cap — so it is never stored on the session itself.
 *
 * Rate-limited by IP (30 req/min — enough for 15 polls per legitimate session).
 */

import { NextResponse } from 'next/server';
import { getCheckoutTicket } from '@/shared/lib/checkout-ticket';
import { getRateLimiter } from '@/shared/lib/rate-limit';
import type { ApiResponse } from '@/shared/types';

interface StatusResponse {
  ready: boolean;
  ticket?: string;
}

export async function GET(request: Request): Promise<NextResponse<ApiResponse<StatusResponse>>> {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) {
    return NextResponse.json(
      { success: false, data: null, error: 'BAD_REQUEST' },
      { status: 400 },
    );
  }

  const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
  const limiter = getRateLimiter('checkout/session-status');
  const { success: rateLimitOk } = await limiter.limit(ip);
  if (!rateLimitOk) {
    return NextResponse.json(
      { success: false, data: null, error: 'RATE_LIMITED' },
      { status: 429 },
    );
  }

  const ticket = await getCheckoutTicket(id);
  if (ticket) {
    return NextResponse.json(
      { success: true, data: { ready: true, ticket }, error: null },
      { status: 200 },
    );
  }
  return NextResponse.json(
    { success: true, data: { ready: false }, error: null },
    { status: 200 },
  );
}
