/**
 * POST /api/chart/sun-sign
 *
 * Lightweight endpoint for the MiniCalculator widget on essay pages.
 * Accepts a birth date only (no time or location) and returns the
 * sidereal Sun sign using noon UTC as the birth time.
 *
 * No DB writes. No auth required. Rate limited by IP.
 * Purpose: quick "Is your Sun in [sign]?" check, not a full chart.
 */

import { NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { calcPlanet, getAyanamsa, dateToJulianDay } from '@/modules/astro-engine';
import { absoluteToSignPosition } from '@/modules/astro-engine';
import { PLANET_TO_SWEPH_ID } from '@/modules/astro-engine';
import { getRateLimiter } from '@/shared/lib/rate-limit';
import { Planet } from '@/shared/types/astrology';

// ---------------------------------------------------------------------------
// Request schema
// ---------------------------------------------------------------------------

const sunSignSchema = z.object({
  /** ISO 8601 date string, e.g. "1990-04-15" */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
});

// ---------------------------------------------------------------------------
// Response type
// ---------------------------------------------------------------------------

interface SunSignResponse {
  sign: string;
  degree: number;
  minutes: number;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: Request): Promise<NextResponse> {
  // 1. Rate limit — keyed by IP
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anonymous';

  const limiter = getRateLimiter('chart/sun-sign');
  const { success: rateLimitOk } = await limiter.limit(ip);

  if (!rateLimitOk) {
    return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });
  }

  // 2. Parse body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }

  let input: z.infer<typeof sunSignSchema>;
  try {
    input = sunSignSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: 'VALIDATION_ERROR' }, { status: 400 });
    }
    throw err;
  }

  // 3. Validate date is a real calendar date
  const parsed = new Date(`${input.date}T12:00:00Z`);
  if (isNaN(parsed.getTime())) {
    return NextResponse.json({ error: 'INVALID_DATE' }, { status: 400 });
  }

  // 4. Calculate Sun position
  try {
    // Use noon UTC — avoids edge cases where Sun sign changes at a given time
    const noonUtc = new Date(
      Date.UTC(
        parsed.getUTCFullYear(),
        parsed.getUTCMonth(),
        parsed.getUTCDate(),
        12, 0, 0,
      ),
    );

    const jd = dateToJulianDay(noonUtc);

    // Ensure ayanamsa is loaded for this Julian Day
    getAyanamsa(jd);

    const sunId = PLANET_TO_SWEPH_ID[Planet.Sun];
    // calcPlanet returns tropical longitude; subtract ayanamsa for sidereal
    const sunData = calcPlanet(jd, sunId);
    const ayanamsa = getAyanamsa(jd);
    sunData.longitude = ((sunData.longitude - ayanamsa) % 360 + 360) % 360;

    const position = absoluteToSignPosition(sunData.longitude);

    const response: SunSignResponse = {
      sign: position.sign,
      degree: position.signDegree,
      minutes: position.minutes,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (err) {
    try {
      const { captureException } = await import('@sentry/nextjs');
      captureException(err);
    } catch {
      console.error('[api/chart/sun-sign] calculation error:', err);
    }

    return NextResponse.json({ error: 'CALCULATION_ERROR' }, { status: 500 });
  }
}
