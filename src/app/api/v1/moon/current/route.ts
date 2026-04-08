import { NextResponse } from 'next/server';
import { getCurrentMoonPhase } from '@/modules/astro-engine/moon-phase';
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
  // 2. Parse optional `date` query param (ISO date string, e.g. "2024-01-25")
  // ---------------------------------------------------------------------------
  const { searchParams } = new URL(request.url);
  const dateParam = searchParams.get('date');

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

  // ---------------------------------------------------------------------------
  // 3. Calculate moon phase
  // ---------------------------------------------------------------------------
  let phaseData: ReturnType<typeof getCurrentMoonPhase>;

  try {
    phaseData = getCurrentMoonPhase(targetDate);
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
}
