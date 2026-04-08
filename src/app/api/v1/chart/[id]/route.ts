import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireAuth } from '@/modules/auth/lib/helpers';
import { getRateLimiter } from '@/shared/lib/rate-limit';
import { getDb } from '@/shared/lib/db';
import { natalCharts } from '@/shared/lib/schema';
import { decryptBirthData } from '@/shared/encryption/pii';
import type { ApiResponse, ChartDetailResponse } from '@/shared/types';

// ---------------------------------------------------------------------------
// GET /api/v1/chart/:id — fetch a single saved chart (owner only)
// Returns decrypted birth data — only served to the owner over authenticated
// channel. Never logged.
// ---------------------------------------------------------------------------
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<ApiResponse<ChartDetailResponse>>> {
  // 1. Auth
  let userId: string;
  try {
    const user = await requireAuth();
    userId = user.userId;
  } catch (err) {
    if (err instanceof Response) return err as never;
    throw err;
  }

  // 2. Rate limit — reuse default limiter
  const limiter = getRateLimiter('default');
  const { success: rateLimitOk } = await limiter.limit(userId);
  if (!rateLimitOk) {
    return NextResponse.json(
      { success: false, data: null, error: 'RATE_LIMITED' },
      { status: 429 },
    );
  }

  const { id } = await params;

  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(natalCharts)
      .where(eq(natalCharts.id, id))
      .limit(1);

    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, data: null, error: 'NOT_FOUND' },
        { status: 404 },
      );
    }

    const row = rows[0];

    // Owner check — only the authenticated user can read their own chart
    if (row.userId !== userId) {
      return NextResponse.json(
        { success: false, data: null, error: 'FORBIDDEN' },
        { status: 403 },
      );
    }

    // Decrypt PII — only after ownership is verified
    // NEVER log the decrypted result
    let birthData: ReturnType<typeof decryptBirthData>;
    try {
      birthData = decryptBirthData(row.encryptedBirthData);
    } catch {
      return NextResponse.json(
        { success: false, data: null, error: 'DECRYPTION_ERROR' },
        { status: 500 },
      );
    }

    const detail: ChartDetailResponse = {
      id: row.id,
      name: row.name ?? null,
      houseSystem: row.houseSystem,
      ayanamsa: row.ayanamsa,
      birthDate: birthData.date,
      birthTime: birthData.time,
      birthLatitude: birthData.lat,
      birthLongitude: birthData.lon,
      birthTimezone: birthData.timezone ?? '',
      chartData: row.chartData,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };

    return NextResponse.json(
      { success: true, data: detail, error: null },
      { status: 200 },
    );
  } catch (err) {
    try {
      const { captureException } = await import('@sentry/nextjs');
      captureException(err);
    } catch {
      console.error('[chart/get] db error:', err);
    }

    return NextResponse.json(
      { success: false, data: null, error: 'DATABASE_ERROR' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/v1/chart/:id — delete a saved chart (owner only)
// ---------------------------------------------------------------------------
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<ApiResponse<{ deleted: boolean }>>> {
  // 1. Auth
  let userId: string;
  try {
    const user = await requireAuth();
    userId = user.userId;
  } catch (err) {
    if (err instanceof Response) return err as never;
    throw err;
  }

  // 2. Rate limit
  const limiter = getRateLimiter('default');
  const { success: rateLimitOk } = await limiter.limit(userId);
  if (!rateLimitOk) {
    return NextResponse.json(
      { success: false, data: null, error: 'RATE_LIMITED' },
      { status: 429 },
    );
  }

  const { id } = await params;

  try {
    const db = getDb();

    // Fetch to check ownership before deleting
    const rows = await db
      .select({ id: natalCharts.id, userId: natalCharts.userId })
      .from(natalCharts)
      .where(eq(natalCharts.id, id))
      .limit(1);

    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, data: null, error: 'NOT_FOUND' },
        { status: 404 },
      );
    }

    if (rows[0].userId !== userId) {
      return NextResponse.json(
        { success: false, data: null, error: 'FORBIDDEN' },
        { status: 403 },
      );
    }

    await db.delete(natalCharts).where(eq(natalCharts.id, id));

    return NextResponse.json(
      { success: true, data: { deleted: true }, error: null },
      { status: 200 },
    );
  } catch (err) {
    try {
      const { captureException } = await import('@sentry/nextjs');
      captureException(err);
    } catch {
      console.error('[chart/delete] db error:', err);
    }

    return NextResponse.json(
      { success: false, data: null, error: 'DATABASE_ERROR' },
      { status: 500 },
    );
  }
}
