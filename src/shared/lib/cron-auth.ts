import { NextResponse } from 'next/server';

/**
 * Validates the CRON_SECRET Authorization header for Vercel Cron endpoints.
 *
 * Call this FIRST in every /api/cron/** route handler.
 * Returns null if auth is valid; returns a NextResponse with status 500 or 401
 * that the caller should return immediately.
 *
 * Guard order:
 * 1. CRON_SECRET not set in env → 500 (misconfigured, not a client error)
 * 2. Authorization header missing or wrong → 401
 */
export function assertCronAuth(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[cron] CRON_SECRET is not configured');
    return NextResponse.json(
      { error: 'NOT_CONFIGURED', message: 'Cron secret not set' },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', message: 'Invalid or missing cron secret' },
      { status: 401 },
    );
  }

  return null;
}
