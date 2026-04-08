import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { ZodError } from 'zod';
import { requireAuth } from '@/modules/auth/lib/helpers';
import { getRateLimiter } from '@/shared/lib/rate-limit';
import { getDb } from '@/shared/lib/db';
import { natalCharts } from '@/shared/lib/schema';
import { encryptBirthData } from '@/shared/encryption/pii';
import { chartSaveSchema } from '@/shared/validation';
import type { ApiResponse, ChartSaveResponse } from '@/shared/types';

export async function POST(request: Request): Promise<NextResponse<ApiResponse<ChartSaveResponse>>> {
  // -------------------------------------------------------------------------
  // 1. Auth — JWT verification via Clerk, no DB round-trip
  // -------------------------------------------------------------------------
  let userId: string;
  try {
    const user = await requireAuth();
    userId = user.userId;
  } catch (err) {
    if (err instanceof Response) return err as never;
    throw err;
  }

  // -------------------------------------------------------------------------
  // 2. Rate limiting — keyed by userId (authenticated, no IP spoofing risk)
  // -------------------------------------------------------------------------
  const limiter = getRateLimiter('chart/save');
  const { success: rateLimitOk } = await limiter.limit(userId);

  if (!rateLimitOk) {
    return NextResponse.json(
      { success: false, data: null, error: 'RATE_LIMITED' },
      { status: 429 },
    );
  }

  // -------------------------------------------------------------------------
  // 3. Parse and validate request body
  // -------------------------------------------------------------------------
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, data: null, error: 'INVALID_JSON' },
      { status: 400 },
    );
  }

  let validated: ReturnType<typeof chartSaveSchema.parse>;
  try {
    validated = chartSaveSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          error: 'VALIDATION_ERROR',
          details: err.flatten().fieldErrors,
        } as ApiResponse<ChartSaveResponse> & { details?: unknown },
        { status: 400 },
      );
    }
    throw err;
  }

  // -------------------------------------------------------------------------
  // 4. Encrypt PII before touching the DB — never store plaintext birth data
  // -------------------------------------------------------------------------
  const encryptedBirthData = encryptBirthData({
    date: validated.date,
    time: validated.time,
    lat: validated.latitude,
    lon: validated.longitude,
    timezone: validated.timezone,
  });

  const now = new Date();

  // -------------------------------------------------------------------------
  // 5. Upsert: if chart exists update it, otherwise insert new record
  //    Owner check: if a chart with this ID already exists and belongs to a
  //    different user, return 403 to prevent hijacking another user's chart.
  // -------------------------------------------------------------------------
  const db = getDb();

  try {
    const existing = await db
      .select({
        id: natalCharts.id,
        userId: natalCharts.userId,
        houseSystem: natalCharts.houseSystem,
        ayanamsa: natalCharts.ayanamsa,
        chartData: natalCharts.chartData,
        createdAt: natalCharts.createdAt,
      })
      .from(natalCharts)
      .where(eq(natalCharts.id, validated.chartId))
      .limit(1);

    if (existing.length > 0) {
      const row = existing[0];

      // Ownership guard: a temp chart has userId=null until the first save.
      // After that, only the owner can update it.
      if (row.userId !== null && row.userId !== userId) {
        return NextResponse.json(
          { success: false, data: null, error: 'FORBIDDEN' },
          { status: 403 },
        );
      }

      // Update existing record
      await db
        .update(natalCharts)
        .set({
          userId,
          name: validated.name ?? null,
          status: 'saved',
          encryptedBirthData,
          updatedAt: now,
        })
        .where(eq(natalCharts.id, validated.chartId));

      return NextResponse.json(
        {
          success: true,
          data: {
            id: row.id,
            name: validated.name ?? null,
            status: 'saved',
            createdAt: row.createdAt.toISOString(),
            updatedAt: now.toISOString(),
          },
          error: null,
        },
        { status: 200 },
      );
    }

    // No existing record — this chart was never stored in the DB.
    // Should not happen normally (calculate always creates a temp record),
    // but we handle it gracefully: return 404 so the client knows to
    // call /api/v1/chart/calculate first.
    return NextResponse.json(
      { success: false, data: null, error: 'CHART_NOT_FOUND' },
      { status: 404 },
    );
  } catch (err) {
    try {
      const { captureException } = await import('@sentry/nextjs');
      captureException(err);
    } catch {
      console.error('[chart/save] db error:', err);
    }

    return NextResponse.json(
      { success: false, data: null, error: 'DATABASE_ERROR' },
      { status: 500 },
    );
  }
}
