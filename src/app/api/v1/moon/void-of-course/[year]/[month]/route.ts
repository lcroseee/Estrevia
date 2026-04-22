/**
 * GET /api/v1/moon/void-of-course/:year/:month
 *
 * Returns all Void-of-Course Moon periods for a given month.
 * Each period: start, end, lastAspect, fromSign, toSign.
 *
 * Performance strategy to prevent Vercel 10s cold-start timeout:
 *   - Results are cached in Upstash Redis under key voc:YYYY-MM (25h TTL).
 *   - A daily Vercel Cron at /api/cron/prewarm-voc pre-warms current month
 *     and the next 3 days of the following month.
 *   - On cache miss for near-present months (±7 days), compute synchronously.
 *   - On cache miss for distant future months, return 503 "computing".
 *
 * Rate limited. Cached for 24 hours via Cache-Control.
 */

import { NextResponse } from 'next/server';
import { getRateLimiter } from '@/shared/lib/rate-limit';
import type { ApiResponse, VocMonthResponse } from '@/shared/types';
import {
  readVocCache,
  writeVocCache,
  computeVocMonth,
  isNearPresentMonth,
} from '@/modules/astro-engine/voc-cache';

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
  // 3. Cache lookup → compute → cache write
  // ---------------------------------------------------------------------------
  try {
    // Check Redis cache first
    const cached = await readVocCache(year, month);

    if (cached !== null) {
      const response: VocMonthResponse = { year, month, periods: cached };
      return NextResponse.json(
        { success: true, data: response, error: null },
        {
          status: 200,
          headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=86400' },
        },
      );
    }

    // Cache miss: decide whether to compute synchronously or return 503
    if (!isNearPresentMonth(year, month)) {
      // Distant future month — the cron hasn't pre-warmed it yet.
      // Return 503 so the client can retry after the cron runs.
      return NextResponse.json(
        {
          success: false,
          data: null,
          error: 'CACHE_MISS_COMPUTING',
          // Non-standard message field for debugging; not in the ApiResponse type
        } as ApiResponse<VocMonthResponse>,
        {
          status: 503,
          headers: {
            'Retry-After': '3600',
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    // Near-present month: compute synchronously and cache the result
    // ~132 000 sweph calls — acceptable on warm functions, marginal on cold start
    const periods = computeVocMonth(year, month);

    // Fire-and-forget cache write — do not block the response
    writeVocCache(year, month, periods).catch((err) => {
      console.error('[moon/voc] Redis write failed (non-fatal):', err);
    });

    const response: VocMonthResponse = { year, month, periods };
    return NextResponse.json(
      { success: true, data: response, error: null },
      {
        status: 200,
        headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=86400' },
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
