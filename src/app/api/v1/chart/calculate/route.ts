import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { ZodError } from 'zod';
import { calculateChart } from '@/modules/astro-engine';
import { chartCalculateSchema } from '@/shared/validation';
import { getRateLimiter } from '@/shared/lib/rate-limit';
import { getDb } from '@/shared/lib/db';
import { natalCharts } from '@/shared/lib/schema';
import type { ApiResponse, ChartCalculateResponse } from '@/shared/types';

// Placeholder for temp charts where birth data has not yet been encrypted and saved.
// Replaced with real encrypted data when the user calls POST /api/v1/chart/save.
const TEMP_BIRTH_DATA_PLACEHOLDER = 'PENDING';

export async function POST(request: Request): Promise<NextResponse<ApiResponse<ChartCalculateResponse>>> {
  // -------------------------------------------------------------------------
  // 1. Rate limiting — keyed by IP
  // -------------------------------------------------------------------------
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anonymous';

  const limiter = getRateLimiter('chart/calculate');
  const { success: rateLimitOk } = await limiter.limit(ip);

  if (!rateLimitOk) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: 'RATE_LIMITED',
      },
      { status: 429 },
    );
  }

  // -------------------------------------------------------------------------
  // 2. Parse and validate request body
  // -------------------------------------------------------------------------
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: 'INVALID_JSON',
      },
      { status: 400 },
    );
  }

  let validatedInput: ReturnType<typeof chartCalculateSchema.parse>;
  try {
    validatedInput = chartCalculateSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          error: 'VALIDATION_ERROR',
        },
        { status: 400 },
      );
    }
    throw err;
  }

  // -------------------------------------------------------------------------
  // 3. Calculate chart via Swiss Ephemeris
  // -------------------------------------------------------------------------
  let chart: ReturnType<typeof calculateChart>;
  try {
    chart = calculateChart({
      date: validatedInput.date,
      time: validatedInput.time,
      latitude: validatedInput.latitude,
      longitude: validatedInput.longitude,
      timezone: validatedInput.timezone,
      houseSystem: validatedInput.houseSystem,
    });
  } catch (err) {
    // Log to Sentry if available, without leaking internal details to the client
    try {
      const { captureException } = await import('@sentry/nextjs');
      captureException(err);
    } catch {
      // Sentry not available — log to stderr only
      console.error('[chart/calculate] calculation error:', err);
    }

    return NextResponse.json(
      {
        success: false,
        data: null,
        error: 'CALCULATION_ERROR',
      },
      { status: 500 },
    );
  }

  // -------------------------------------------------------------------------
  // 4. Persist temp record to DB
  //
  // encryptedBirthData is NOT stored here — it will be encrypted and saved
  // when the user explicitly calls POST /api/v1/chart/save.
  // The placeholder 'PENDING' satisfies the NOT NULL constraint; the save
  // endpoint overwrites it with real AES-256-GCM ciphertext.
  // -------------------------------------------------------------------------
  const chartId = nanoid();

  try {
    const db = getDb();
    await db.insert(natalCharts).values({
      id: chartId,
      userId: null,
      status: 'temp',
      encryptedBirthData: TEMP_BIRTH_DATA_PLACEHOLDER,
      houseSystem: validatedInput.houseSystem,
      ayanamsa: 'lahiri',
      chartData: chart,
    });
  } catch (err) {
    try {
      const { captureException } = await import('@sentry/nextjs');
      captureException(err);
    } catch {
      console.error('[chart/calculate] db insert error:', err);
    }

    return NextResponse.json(
      {
        success: false,
        data: null,
        error: 'DATABASE_ERROR',
      },
      { status: 500 },
    );
  }

  // -------------------------------------------------------------------------
  // 5. Return result
  // -------------------------------------------------------------------------
  return NextResponse.json(
    {
      success: true,
      data: {
        chartId,
        chart,
      },
      error: null,
    },
    { status: 200 },
  );
}
