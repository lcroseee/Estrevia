import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/shared/lib/db';
import { synastryResults } from '@/shared/lib/schema';
import { getRateLimiter } from '@/shared/lib/rate-limit';

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: Props) {
  const { id } = await params;

  // Rate limiting
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anonymous';
  const limiter = getRateLimiter('synastry/view');
  const { success: rateLimitOk } = await limiter.limit(ip);

  if (!rateLimitOk) {
    return NextResponse.json(
      { success: false, data: null, error: 'RATE_LIMITED' },
      { status: 429 },
    );
  }

  try {
    const db = getDb();
    const rows = await db
      .select({
        id: synastryResults.id,
        overallScore: synastryResults.overallScore,
        categoryScores: synastryResults.categoryScores,
        createdAt: synastryResults.createdAt,
      })
      .from(synastryResults)
      .where(eq(synastryResults.id, id))
      .limit(1);

    const row = rows[0];
    if (!row) {
      return NextResponse.json(
        { success: false, data: null, error: 'NOT_FOUND' },
        { status: 404 },
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          id: row.id,
          overallScore: row.overallScore,
          categoryScores: row.categoryScores,
          createdAt: row.createdAt,
        },
        error: null,
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      { success: false, data: null, error: 'DATABASE_ERROR' },
      { status: 500 },
    );
  }
}
