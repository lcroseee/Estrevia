import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { getCurrentUser } from '@/modules/auth/lib/helpers';
import { getDb } from '@/shared/lib/db';
import { dailyCards } from '@/shared/lib/schema';
import { getRateLimiter } from '@/shared/lib/rate-limit';

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * GET /api/v1/tarot/daily
 * Returns today's daily card for the current user, or null if not drawn yet.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { success: true, data: null, error: null },
      { status: 200 },
    );
  }

  try {
    const db = getDb();
    const today = todayDate();
    const rows = await db
      .select({
        cardId: dailyCards.cardId,
        reversed: dailyCards.reversed,
        date: dailyCards.date,
      })
      .from(dailyCards)
      .where(and(eq(dailyCards.userId, user.userId), eq(dailyCards.date, today)))
      .limit(1);

    const row = rows[0];
    if (!row) {
      return NextResponse.json(
        { success: true, data: null, error: null },
        { status: 200 },
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: { cardId: row.cardId, reversed: row.reversed, date: row.date },
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

/**
 * POST /api/v1/tarot/daily
 * Save the daily card draw. Enforces one card per user per day.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { success: false, data: null, error: 'UNAUTHORIZED' },
      { status: 401 },
    );
  }

  // Rate limiting
  const limiter = getRateLimiter('tarot/daily');
  const { success: rateLimitOk } = await limiter.limit(user.userId);
  if (!rateLimitOk) {
    return NextResponse.json(
      { success: false, data: null, error: 'RATE_LIMITED' },
      { status: 429 },
    );
  }

  let body: { cardId: string; reversed: boolean };
  try {
    const raw = await request.json();
    if (typeof raw.cardId !== 'string' || typeof raw.reversed !== 'boolean') {
      throw new Error('Invalid body');
    }
    body = { cardId: raw.cardId, reversed: raw.reversed };
  } catch {
    return NextResponse.json(
      { success: false, data: null, error: 'INVALID_REQUEST' },
      { status: 400 },
    );
  }

  try {
    const db = getDb();
    const today = todayDate();

    // Atomic insert — use onConflictDoNothing to handle race conditions
    const inserted = await db.insert(dailyCards).values({
      userId: user.userId,
      date: today,
      cardId: body.cardId,
      reversed: body.reversed,
    }).onConflictDoNothing().returning();

    if (inserted.length === 0) {
      return NextResponse.json(
        { success: false, data: null, error: 'ALREADY_DRAWN' },
        { status: 409 },
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: { cardId: body.cardId, reversed: body.reversed, date: today },
        error: null,
      },
      { status: 201 },
    );
  } catch {
    return NextResponse.json(
      { success: false, data: null, error: 'DATABASE_ERROR' },
      { status: 500 },
    );
  }
}
