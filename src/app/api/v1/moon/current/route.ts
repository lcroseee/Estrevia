import { NextResponse } from 'next/server';
import { getCurrentMoonPhase, getMoonSign, getMoonTransitTimes, getMoonRiseSet } from '@/modules/astro-engine/moon-phase';
import { dateToJulianDay } from '@/modules/astro-engine/julian-day';
import { getRateLimiter } from '@/shared/lib/rate-limit';
import type { ApiResponse, MoonPhaseResponse } from '@/shared/types';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<NextResponse<ApiResponse<MoonPhaseResponse>>> {
  // ---------------------------------------------------------------------------
  // 1. Rate limiting — keyed by IP
  // ---------------------------------------------------------------------------
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anonymous';

  const limiter = getRateLimiter('moon');
  const { success: rateLimitOk } = await limiter.limit(ip);

  if (!rateLimitOk) {
    return NextResponse.json(
      { success: false, data: null, error: 'RATE_LIMITED' },
      { status: 429 },
    );
  }

  // ---------------------------------------------------------------------------
  // 2. Parse query params
  // ---------------------------------------------------------------------------
  const { searchParams } = new URL(request.url);
  const dateParam = searchParams.get('date');
  const latParam = searchParams.get('lat');
  const lonParam = searchParams.get('lon');

  let targetDate: Date;

  if (dateParam) {
    const parsed = new Date(dateParam);
    if (isNaN(parsed.getTime())) {
      return NextResponse.json(
        { success: false, data: null, error: 'INVALID_DATE' },
        { status: 400 },
      );
    }
    // Normalise to UTC midnight so a plain YYYY-MM-DD string works correctly
    targetDate = new Date(
      Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()),
    );
  } else {
    // Default to current UTC moment
    const now = new Date();
    targetDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
  }

  // Parse optional lat/lon for moonrise/moonset
  let latitude: number | null = null;
  let longitude: number | null = null;

  if (latParam !== null && lonParam !== null) {
    const lat = parseFloat(latParam);
    const lon = parseFloat(lonParam);
    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return NextResponse.json(
        { success: false, data: null, error: 'INVALID_COORDINATES' },
        { status: 400 },
      );
    }
    latitude = lat;
    longitude = lon;
  }

  // ---------------------------------------------------------------------------
  // 3. Calculate moon phase + sign + rise/set
  // ---------------------------------------------------------------------------
  try {
    const phaseData = getCurrentMoonPhase(targetDate);
    const jd = dateToJulianDay(targetDate);

    // Moon sign calculation
    const moonSignData = getMoonSign(jd);
    const transitData = getMoonTransitTimes(jd);

    // Moon rise/set (only when coordinates provided)
    let moonrise: string | null = null;
    let moonset: string | null = null;

    if (latitude !== null && longitude !== null) {
      const riseSet = getMoonRiseSet(jd, latitude, longitude);
      moonrise = riseSet.moonrise?.toISOString() ?? null;
      moonset = riseSet.moonset?.toISOString() ?? null;
    }

    // ---------------------------------------------------------------------------
    // 4. Return response
    // ---------------------------------------------------------------------------
    const response: MoonPhaseResponse = {
      phase: phaseData.phase,
      illumination: phaseData.illumination,
      angle: phaseData.angle,
      emoji: phaseData.emoji,
      nextNewMoon: phaseData.nextNewMoon.toISOString(),
      nextFullMoon: phaseData.nextFullMoon.toISOString(),
      moonSign: moonSignData.siderealSign,
      moonDegree: Math.round(moonSignData.siderealDegree * 100) / 100,
      signEntryTime: transitData.signEntryTime.toISOString(),
      signExitTime: transitData.signExitTime.toISOString(),
      moonrise,
      moonset,
    };

    return NextResponse.json(
      { success: true, data: response, error: null },
      {
        status: 200,
        headers: {
          // Cache for 10 minutes on CDN — moon phase changes slowly
          'Cache-Control': 's-maxage=600, stale-while-revalidate=3600',
        },
      },
    );
  } catch (err) {
    try {
      const { captureException } = await import('@sentry/nextjs');
      captureException(err);
    } catch {
      console.error('[moon/current] calculation error:', err);
    }

    return NextResponse.json(
      { success: false, data: null, error: 'CALCULATION_ERROR' },
      { status: 500 },
    );
  }
}
