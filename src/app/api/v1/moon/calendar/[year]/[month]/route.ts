/**
 * GET /api/v1/moon/calendar/:year/:month
 *
 * Returns per-day moon data for an entire month.
 * Each day: phase, illumination, emoji, moonSign, isVoidOfCourse, vocStart, vocEnd.
 * Uses sweph calculation per day (not linear approximation).
 * Rate limited. Cached for 24 hours.
 */

import { NextResponse } from 'next/server';
import { getCurrentMoonPhase, getMoonSign } from '@/modules/astro-engine/moon-phase';
import { calculateVoidOfCourse } from '@/modules/astro-engine/void-of-course';
import { dateToJulianDay } from '@/modules/astro-engine/julian-day';
import { getRateLimiter } from '@/shared/lib/rate-limit';
import type { ApiResponse, MoonCalendarResponse, MoonCalendarDay } from '@/shared/types';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ year: string; month: string }> },
): Promise<NextResponse<ApiResponse<MoonCalendarResponse>>> {
  // ---------------------------------------------------------------------------
  // 1. Rate limiting
  // ---------------------------------------------------------------------------
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anonymous';

  const limiter = getRateLimiter('moon/calendar');
  const { success: rateLimitOk } = await limiter.limit(ip);

  if (!rateLimitOk) {
    return NextResponse.json(
      { success: false, data: null, error: 'RATE_LIMITED' },
      { status: 429 },
    );
  }

  // ---------------------------------------------------------------------------
  // 2. Validate params
  // ---------------------------------------------------------------------------
  const { year: yearStr, month: monthStr } = await params;

  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  if (isNaN(year) || year < 2000 || year > 2100) {
    return NextResponse.json(
      { success: false, data: null, error: 'INVALID_YEAR' },
      { status: 400 },
    );
  }

  if (isNaN(month) || month < 1 || month > 12) {
    return NextResponse.json(
      { success: false, data: null, error: 'INVALID_MONTH' },
      { status: 400 },
    );
  }

  // ---------------------------------------------------------------------------
  // 3. Calculate per-day moon data
  // ---------------------------------------------------------------------------
  try {
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const days: MoonCalendarDay[] = [];

    for (let day = 1; day <= daysInMonth; day++) {
      // Calculate at 12:00 UTC for each day (middle of day)
      const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
      const jd = dateToJulianDay(date);

      const phaseData = getCurrentMoonPhase(date);
      const moonSignData = getMoonSign(jd);
      const vocData = calculateVoidOfCourse(jd);

      days.push({
        date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        phase: phaseData.phase,
        illumination: phaseData.illumination,
        emoji: phaseData.emoji,
        moonSign: moonSignData.siderealSign,
        moonDegree: Math.round(moonSignData.siderealDegree * 100) / 100,
        isVoidOfCourse: vocData.isVoidOfCourse,
        vocStart: vocData.vocStart?.toISOString() ?? null,
        vocEnd: vocData.vocEnd?.toISOString() ?? null,
      });
    }

    const response: MoonCalendarResponse = { year, month, days };

    return NextResponse.json(
      { success: true, data: response, error: null },
      {
        status: 200,
        headers: {
          'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        },
      },
    );
  } catch (err) {
    try {
      const { captureException } = await import('@sentry/nextjs');
      captureException(err);
    } catch {
      console.error('[moon/calendar] calculation error:', err);
    }

    return NextResponse.json(
      { success: false, data: null, error: 'CALCULATION_ERROR' },
      { status: 500 },
    );
  }
}
