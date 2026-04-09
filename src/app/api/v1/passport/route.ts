import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { ZodError } from 'zod';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { generatePassport } from '@/modules/astro-engine/passport';
import { getRateLimiter } from '@/shared/lib/rate-limit';
import { getDb } from '@/shared/lib/db';
import { natalCharts, cosmicPassports } from '@/shared/lib/schema';
import { trackServerEvent, AnalyticsEvent } from '@/shared/lib/analytics';
import type { ApiResponse, PassportResponse } from '@/shared/types';

// ---------------------------------------------------------------------------
// Request schema — only chartId, no PII
// ---------------------------------------------------------------------------
const createPassportRequestSchema = z.object({
  chartId: z.string().min(1).max(64),
});

export async function POST(request: Request): Promise<NextResponse<ApiResponse<PassportResponse>>> {
  // -------------------------------------------------------------------------
  // 1. Rate limiting — keyed by IP
  // -------------------------------------------------------------------------
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anonymous';

  const limiter = getRateLimiter('passport/create');
  const { success: rateLimitOk } = await limiter.limit(ip);

  if (!rateLimitOk) {
    return NextResponse.json(
      { success: false, data: null, error: 'RATE_LIMITED' },
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
      { success: false, data: null, error: 'INVALID_JSON' },
      { status: 400 },
    );
  }

  let validated: z.infer<typeof createPassportRequestSchema>;
  try {
    validated = createPassportRequestSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { success: false, data: null, error: 'VALIDATION_ERROR' },
        { status: 400 },
      );
    }
    throw err;
  }

  // -------------------------------------------------------------------------
  // 3. Look up chart from DB
  // -------------------------------------------------------------------------
  const db = getDb();

  let chartRow: typeof natalCharts.$inferSelect | undefined;
  try {
    const rows = await db
      .select()
      .from(natalCharts)
      .where(eq(natalCharts.id, validated.chartId))
      .limit(1);
    chartRow = rows[0];
  } catch (err) {
    try {
      const { captureException } = await import('@sentry/nextjs');
      captureException(err);
    } catch {
      console.error('[passport/create] db select error:', err);
    }
    return NextResponse.json(
      { success: false, data: null, error: 'DATABASE_ERROR' },
      { status: 500 },
    );
  }

  if (!chartRow) {
    return NextResponse.json(
      { success: false, data: null, error: 'CHART_NOT_FOUND' },
      { status: 404 },
    );
  }

  // -------------------------------------------------------------------------
  // 4. Generate passport data from chart
  //    chartData is stored as ChartResult (no PII — only sign positions)
  // -------------------------------------------------------------------------
  let passportData: ReturnType<typeof generatePassport>;
  try {
    passportData = generatePassport(chartRow.chartData);
  } catch (err) {
    try {
      const { captureException } = await import('@sentry/nextjs');
      captureException(err);
    } catch {
      console.error('[passport/create] generatePassport error:', err);
    }
    return NextResponse.json(
      { success: false, data: null, error: 'PASSPORT_GENERATION_ERROR' },
      { status: 500 },
    );
  }

  // -------------------------------------------------------------------------
  // 5. Persist passport to DB — short nanoid(8) for pretty share URLs
  // -------------------------------------------------------------------------
  const passportId = nanoid(8);

  try {
    await db.insert(cosmicPassports).values({
      id: passportId,
      chartId: validated.chartId,
      sunSign: passportData.sunSign,
      moonSign: passportData.moonSign,
      ascendantSign: passportData.ascendantSign,
      element: passportData.element,
      rulingPlanet: passportData.rulingPlanet,
      rarityPercent: passportData.rarityPercent,
    });
  } catch (err) {
    try {
      const { captureException } = await import('@sentry/nextjs');
      captureException(err);
    } catch {
      console.error('[passport/create] db insert error:', err);
    }
    return NextResponse.json(
      { success: false, data: null, error: 'DATABASE_ERROR' },
      { status: 500 },
    );
  }

  // -------------------------------------------------------------------------
  // 5b. Track passport creation event
  // -------------------------------------------------------------------------
  trackServerEvent(
    chartRow.userId ?? 'anonymous',
    AnalyticsEvent.PASSPORT_CREATED,
    {
      passport_id: passportId,
      sun_sign: passportData.sunSign,
      moon_sign: passportData.moonSign,
      element: passportData.element,
    },
  );

  // -------------------------------------------------------------------------
  // 6. Return passport response — no PII
  // -------------------------------------------------------------------------
  return NextResponse.json(
    {
      success: true,
      data: {
        id: passportId,
        sunSign: passportData.sunSign,
        moonSign: passportData.moonSign,
        ascendantSign: passportData.ascendantSign,
        element: passportData.element,
        rulingPlanet: passportData.rulingPlanet,
        rarityPercent: passportData.rarityPercent,
      },
      error: null,
    },
    { status: 201 },
  );
}
