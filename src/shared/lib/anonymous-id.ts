import type { NextRequest, NextResponse } from 'next/server';

/**
 * Cookie holding a stable, per-browser anonymous identifier.
 *
 * Read by `POST /api/v1/stripe/checkout` to (a) give anonymous Stripe Checkout
 * a unique idempotency-key identity — without it the key collapsed to a shared
 * `checkout:noanon:<plan>:<day>` and every later anonymous checkout failed with
 * StripeIdempotencyError → INTERNAL_ERROR — and (b) key the per-endpoint rate
 * limiter by browser instead of a shared NAT IP.
 * See docs/superpowers/plans/2026-05-23-checkout-idempotency-collision.md.
 */
export const ANONYMOUS_ID_COOKIE = 'anonymous_id';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Mint `anonymous_id` on `res` when the request carries none, returning `res`.
 *
 * `httpOnly` — no client code reads this id (the browser-side distinct id comes
 * from PostHog), so keep it off the JS surface. It is a random opaque id, not PII.
 */
export function ensureAnonymousIdCookie(req: NextRequest, res: NextResponse): NextResponse {
  if (req.cookies.get(ANONYMOUS_ID_COOKIE)) return res;
  res.cookies.set(ANONYMOUS_ID_COOKIE, crypto.randomUUID(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: ONE_YEAR_SECONDS,
  });
  return res;
}
