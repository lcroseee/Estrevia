import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '@/modules/auth/lib/helpers';
import { getRateLimiter } from '@/shared/lib/rate-limit';
import { getDb } from '@/shared/lib/db';
import { natalCharts } from '@/shared/lib/schema';
import type { ApiResponse, ChartListResponse, ChartSummary } from '@/shared/types';

export async function GET(request: Request): Promise<NextResponse<ApiResponse<ChartListResponse>>> {
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
  // 2. Rate limiting — keyed by userId
  // -------------------------------------------------------------------------
  const limiter = getRateLimiter('chart/save'); // reuse the save limiter bucket
  const { success: rateLimitOk } = await limiter.limit(`list:${userId}`);

  if (!rateLimitOk) {
    return NextResponse.json(
      { success: false, data: null, error: 'RATE_LIMITED' },
      { status: 429 },
    );
  }

  // -------------------------------------------------------------------------
  // 3. Query saved charts for the authenticated user
  //    Returns metadata only — NO decrypted birth data
  // -------------------------------------------------------------------------
  try {
    const db = getDb();
    const rows = await db
      .select({
        id: natalCharts.id,
        name: natalCharts.name,
        houseSystem: natalCharts.houseSystem,
        ayanamsa: natalCharts.ayanamsa,
        chartData: natalCharts.chartData,
        createdAt: natalCharts.createdAt,
        updatedAt: natalCharts.updatedAt,
      })
      .from(natalCharts)
      .where(
        and(
          eq(natalCharts.userId, userId),
          eq(natalCharts.status, 'saved'),
        ),
      );

    const charts: ChartSummary[] = rows.map((row) => {
      // Extract Sun and Moon sign from chartData without decrypting birth data
      const planets = row.chartData?.planets ?? [];
      const sunPlanet = planets.find((p) => p.planet === 'Sun');
      const moonPlanet = planets.find((p) => p.planet === 'Moon');

      return {
        id: row.id,
        name: row.name ?? null,
        houseSystem: row.houseSystem,
        ayanamsa: row.ayanamsa,
        sunSign: sunPlanet?.sign ?? null,
        moonSign: moonPlanet?.sign ?? null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      };
    });

    return NextResponse.json(
      { success: true, data: { charts }, error: null },
      { status: 200 },
    );
  } catch (err) {
    try {
      const { captureException } = await import('@sentry/nextjs');
      captureException(err);
    } catch {
      console.error('[chart/list] db error:', err);
    }

    return NextResponse.json(
      { success: false, data: null, error: 'DATABASE_ERROR' },
      { status: 500 },
    );
  }
}
