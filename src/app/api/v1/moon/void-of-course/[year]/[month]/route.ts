/**
 * GET /api/v1/moon/void-of-course/:year/:month
 *
 * Returns all Void-of-Course Moon periods for a given month.
 * Each period: start, end, lastAspect, fromSign, toSign.
 * Rate limited. Cached for 24 hours.
 */

import { NextResponse } from 'next/server';
import { getMoonSign } from '@/modules/astro-engine/moon-phase';
import { calculateVoidOfCourse } from '@/modules/astro-engine/void-of-course';
import { dateToJulianDay } from '@/modules/astro-engine/julian-day';
import { getRateLimiter } from '@/shared/lib/rate-limit';
import type { ApiResponse, VocMonthResponse, VocPeriod } from '@/shared/types';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ year: string; month: string }> },
): Promise<NextResponse<ApiResponse<VocMonthResponse>>> {
  // ---------------------------------------------------------------------------
  // 1. Rate limiting
  // ---------------------------------------------------------------------------
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anonymous';

  const limiter = getRateLimiter('moon/voc');
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
  // 3. Find all VOC periods in the month
  // ---------------------------------------------------------------------------
  try {
    const monthStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
    const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59)); // last day of month

    const monthStartJd = dateToJulianDay(monthStart);
    const monthEndJd = dateToJulianDay(monthEnd);

    const periods: VocPeriod[] = [];
    const seen = new Set<string>(); // dedup by vocStart ISO string

    // Step through the month in 12-hour increments.
    // The Moon changes sign roughly every 2.3 days, so 12-hour steps
    // ensure we sample every sign transit at least once.
    const STEP = 0.5; // 12 hours in JD
    let jd = monthStartJd;

    while (jd <= monthEndJd) {
      const vocData = calculateVoidOfCourse(jd);

      if (vocData.vocStart && vocData.vocEnd) {
        const key = vocData.vocStart.toISOString();

        // Only include VOC periods that overlap with the target month
        const vocStartJd = dateToJulianDay(vocData.vocStart);
        const vocEndJd = dateToJulianDay(vocData.vocEnd);
        const overlapsMonth = vocEndJd >= monthStartJd && vocStartJd <= monthEndJd;

        if (overlapsMonth && !seen.has(key)) {
          seen.add(key);

          // Determine fromSign (current sign at VOC start) and toSign (next sign after VOC end)
          const fromSignData = getMoonSign(dateToJulianDay(vocData.vocStart));
          const toSignJd = dateToJulianDay(vocData.vocEnd);
          const toSignData = getMoonSign(toSignJd);

          periods.push({
            start: vocData.vocStart.toISOString(),
            end: vocData.vocEnd.toISOString(),
            lastAspect: vocData.lastAspect,
            fromSign: fromSignData.siderealSign,
            toSign: toSignData.siderealSign,
          });
        }
      }

      jd += STEP;
    }

    // Sort by start time
    periods.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

    const response: VocMonthResponse = { year, month, periods };

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
      console.error('[moon/void-of-course] calculation error:', err);
    }

    return NextResponse.json(
      { success: false, data: null, error: 'CALCULATION_ERROR' },
      { status: 500 },
    );
  }
}
