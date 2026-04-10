import { NextRequest, NextResponse } from 'next/server';
import { calcPlanet, SWEPH_BODY_IDS } from '@/modules/astro-engine';
import { getRateLimiter } from '@/shared/lib/rate-limit';

// Route Handlers are dynamic by default in Next.js 16 — no `dynamic` export needed.

const J2000_JULIAN_DAY = 2451545.0;

/**
 * GET /api/health/sweph
 *
 * Smoke-test for the sweph native addon. Calculates Sun tropical longitude
 * at J2000 epoch (2000-01-01T12:00:00Z, JD 2451545.0).
 * Expected value: ~280.37° (Capricorn ~10°, tropical).
 *
 * Returns 200 on success, 500 if the addon fails to load or calculate.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  // Rate limiting — keyed by IP
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anonymous';

  const limiter = getRateLimiter('health');
  const { success } = await limiter.limit(ip);

  if (!success) {
    return NextResponse.json(
      { status: 'error', message: 'Too many requests' },
      { status: 429 },
    );
  }

  try {
    const sun = calcPlanet(J2000_JULIAN_DAY, SWEPH_BODY_IDS.SE_SUN);

    return NextResponse.json(
      {
        status: 'ok',
        sun: {
          longitude: sun.longitude,
          latitude: sun.latitude,
          speed: sun.speed,
        },
        julianDay: J2000_JULIAN_DAY,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error('[health/sweph] sweph native addon check failed:', error);

    return NextResponse.json(
      {
        status: 'error',
        message: 'Swiss Ephemeris check failed',
      },
      { status: 500 },
    );
  }
}
