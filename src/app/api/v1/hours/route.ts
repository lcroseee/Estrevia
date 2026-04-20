import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { toZonedTime } from 'date-fns-tz';
import { auth } from '@clerk/nextjs/server';
import { planetaryHoursQuerySchema } from '@/shared/validation/hours';
import { calculatePlanetaryHours } from '@/modules/astro-engine/planetary-hours';
import { getRateLimiter } from '@/shared/lib/rate-limit';
import { isPremium } from '@/modules/auth/lib/premium';
import type { PlanetaryHoursResponse, ApiResponse } from '@/shared/types/api';

// Route Handlers are dynamic by default in Next.js 16 — no `dynamic` export needed.
export const runtime = 'nodejs';

/**
 * GET /api/v1/hours
 *
 * Calculate planetary hours for a location and date.
 *
 * Query parameters:
 *   latitude  (number)  — geographic latitude -90..+90
 *   longitude (number)  — geographic longitude -180..+180
 *   timezone  (string)  — IANA timezone identifier (e.g. "Europe/Moscow")
 *   date      (string)  — optional ISO date YYYY-MM-DD (defaults to today in timezone)
 */
export async function GET(request: NextRequest): Promise<NextResponse<ApiResponse<PlanetaryHoursResponse>>> {
  // Rate limiting by IP
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('x-real-ip')
    ?? '127.0.0.1';

  const limiter = getRateLimiter('hours');
  const { success: rateLimitOk } = await limiter.limit(ip);

  if (!rateLimitOk) {
    return NextResponse.json(
      { success: false, data: null, error: 'Too many requests. Please slow down.' },
      { status: 429 },
    );
  }

  const { searchParams } = request.nextUrl;

  // Parse numeric query parameters (URLSearchParams always returns strings)
  const rawLatitude = searchParams.get('latitude');
  const rawLongitude = searchParams.get('longitude');

  const parseResult = planetaryHoursQuerySchema.safeParse({
    latitude: rawLatitude !== null ? parseFloat(rawLatitude) : undefined,
    longitude: rawLongitude !== null ? parseFloat(rawLongitude) : undefined,
    timezone: searchParams.get('timezone') ?? undefined,
    date: searchParams.get('date') ?? undefined,
  });

  if (!parseResult.success) {
    const message = parseResult.error.issues[0]?.message ?? 'Invalid query parameters';
    return NextResponse.json(
      { success: false, data: null, error: message },
      { status: 400 },
    );
  }

  const { latitude, longitude, timezone, date: dateParam } = parseResult.data;

  // Determine target date in the requested timezone.
  // If no date provided, use today in the given timezone.
  let targetDate: Date;

  if (dateParam) {
    // Parse YYYY-MM-DD as UTC midnight; the weekday is determined by UTC date
    // which matches the local date when we use timezone-aware "today" logic
    const [year, month, day] = dateParam.split('-').map(Number);
    targetDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
  } else {
    // Get the current date in the requested timezone and construct UTC noon for it
    const nowInTz = toZonedTime(new Date(), timezone);
    targetDate = new Date(Date.UTC(
      nowInTz.getFullYear(),
      nowInTz.getMonth(),
      nowInTz.getDate(),
      12, 0, 0, 0,
    ));
  }

  // Pro gate: free users can only request "today" (in their tz). Non-today requests
  // require a Pro subscription. We compare the requested date in the same timezone
  // as the resolved target.
  if (dateParam) {
    const todayInTz = toZonedTime(new Date(), timezone);
    const todayStr = `${todayInTz.getFullYear()}-${String(todayInTz.getMonth() + 1).padStart(2, '0')}-${String(todayInTz.getDate()).padStart(2, '0')}`;
    if (dateParam !== todayStr) {
      const { userId } = await auth();
      const userIsPremium = userId ? await isPremium(userId) : false;
      if (!userIsPremium) {
        return NextResponse.json(
          {
            success: false,
            data: null,
            error: 'PREMIUM_REQUIRED',
            meta: { feature: 'hours_history' },
          },
          { status: 403 },
        );
      }
    }
  }

  try {
    const result = calculatePlanetaryHours(latitude, longitude, targetDate);

    const response: PlanetaryHoursResponse = {
      hours: result.hours,
      currentHour: result.currentHour,
      sunrise: result.sunrise,
      sunset: result.sunset,
    };

    return NextResponse.json({ success: true, data: response, error: null });
  } catch (error) {
    Sentry.captureException(error);
    console.error('[api/v1/hours] calculatePlanetaryHours failed:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Planetary hours calculation temporarily unavailable' },
      { status: 503 },
    );
  }
}
