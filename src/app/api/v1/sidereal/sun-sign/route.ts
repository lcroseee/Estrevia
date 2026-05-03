import { NextRequest, NextResponse } from 'next/server';
import { getSunSignForDate } from '@/modules/astro-engine';
import { getRateLimiter } from '@/shared/lib/rate-limit';
import type { ApiResponse } from '@/shared/types/api';

export const runtime = 'nodejs';

export interface SiderealSunSignResponse {
  sign: string;
  startDate: string;  // ISO 8601 UTC
  endDate: string;    // ISO 8601 UTC
  ayanamsa: string;
  year: number;
}

/**
 * GET /api/v1/sidereal/sun-sign
 *
 * Returns the sidereal sun sign for a given date (Lahiri ayanamsa).
 * Used by the sun-sign mini-widget on /sidereal-{sign}-dates pages.
 *
 * Query parameters:
 *   date      (string, required) — YYYY-MM-DD
 *   ayanamsa  (string, optional) — only "lahiri" is supported (MVP)
 *
 * Responses:
 *   200 { sign, startDate, endDate, ayanamsa, year }
 *   400 { error: 'invalid_date' | 'invalid_ayanamsa' }
 *   429 rate limited (10 req/min/IP, sliding window)
 *   500 computation error (sweph failure)
 */
export async function GET(
  request: NextRequest,
): Promise<NextResponse<ApiResponse<SiderealSunSignResponse>>> {
  // ---------------------------------------------------------------------------
  // 1. Rate limiting — keyed by IP
  // ---------------------------------------------------------------------------
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    '127.0.0.1';

  const limiter = getRateLimiter('sidereal/sun-sign');
  const { success: rateLimitOk } = await limiter.limit(ip);

  if (!rateLimitOk) {
    return NextResponse.json(
      { success: false, data: null, error: 'Too many requests. Please slow down.' },
      { status: 429 },
    );
  }

  // ---------------------------------------------------------------------------
  // 2. Validate query parameters
  // ---------------------------------------------------------------------------
  const { searchParams } = request.nextUrl;
  const dateParam = searchParams.get('date');
  const ayanamsaParam = searchParams.get('ayanamsa') ?? 'lahiri';

  if (!dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: 'invalid_date',
      },
      { status: 400 },
    );
  }

  if (ayanamsaParam !== 'lahiri') {
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: 'invalid_ayanamsa',
      },
      { status: 400 },
    );
  }

  // Parse date at noon UTC to avoid timezone edge effects near sign boundaries.
  // (The widget accepts a date like "1990-03-15", not a timestamp — noon is safe.)
  const date = new Date(`${dateParam}T12:00:00Z`);

  if (Number.isNaN(date.getTime())) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: 'invalid_date',
      },
      { status: 400 },
    );
  }

  // ---------------------------------------------------------------------------
  // 3. Calculate sidereal sun sign
  // ---------------------------------------------------------------------------
  try {
    const { sign, range } = getSunSignForDate(date, 'lahiri');

    return NextResponse.json({
      success: true,
      data: {
        sign,
        startDate: range.start.toISOString(),
        endDate: range.end.toISOString(),
        ayanamsa: range.ayanamsa,
        year: range.year,
      },
      error: null,
    });
  } catch (e) {
    console.error('[api/v1/sidereal/sun-sign] computation error', e);
    return NextResponse.json(
      { success: false, data: null, error: 'Calculation temporarily unavailable.' },
      { status: 500 },
    );
  }
}
