/**
 * GET /api/v1/checkout/session-status?id=<stripe_session_id>
 *
 * Public (no auth) — used by /checkout/complete client polling fallback when
 * the server-side ticket wait times out. Returns:
 *   { ready: true,  ticket: '...' } when webhook has written signInTicket
 *   { ready: false }                when webhook has not arrived yet
 *
 * Rate-limited by IP (30 req/min — enough for 15 polls per legitimate session).
 */

import { NextResponse } from 'next/server';
import { getStripe } from '@/shared/lib/stripe';
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

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(id);
    const ticket = session.metadata?.signInTicket;
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
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === 'resource_missing') {
      return NextResponse.json(
        { success: false, data: null, error: 'NOT_FOUND' },
        { status: 404 },
      );
    }
    console.error(
      '[checkout/session-status] retrieve failed',
      err instanceof Error ? err.message : 'unknown',
    );
    return NextResponse.json(
      { success: false, data: null, error: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}
