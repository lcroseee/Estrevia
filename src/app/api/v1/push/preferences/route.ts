/**
 * GET /api/v1/push/preferences — Fetch notification preferences for the current user.
 * PUT /api/v1/push/preferences — Update notification preferences (upsert).
 *
 * Auth required.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { requireAuth } from '@/modules/auth/lib/helpers';
import { getRateLimiter } from '@/shared/lib/rate-limit';
import { getDb } from '@/shared/lib/db';
import { notificationPreferences } from '@/shared/lib/schema';
import type { ApiResponse } from '@/shared/types';

interface PreferencesData {
  dailyMoonPhase: boolean;
  fullNewMoon: boolean;
  planetaryHourChange: boolean;
  weeklyDigest: boolean;
  preferredTime: string;
}

const DEFAULT_PREFS: PreferencesData = {
  dailyMoonPhase: false,
  fullNewMoon: false,
  planetaryHourChange: false,
  weeklyDigest: false,
  preferredTime: '08:00',
};

const prefsSchema = z.object({
  dailyMoonPhase: z.boolean().optional(),
  fullNewMoon: z.boolean().optional(),
  planetaryHourChange: z.boolean().optional(),
  weeklyDigest: z.boolean().optional(),
  preferredTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
});

export async function GET(): Promise<
  NextResponse<ApiResponse<PreferencesData>>
> {
  // ---------------------------------------------------------------------------
  // 1. Auth
  // ---------------------------------------------------------------------------
  let userId: string;
  try {
    const user = await requireAuth();
    userId = user.userId;
  } catch (err) {
    if (err instanceof Response) return err as never;
    throw err;
  }

  // ---------------------------------------------------------------------------
  // 2. Rate limiting
  // ---------------------------------------------------------------------------
  const limiter = getRateLimiter('push/preferences');
  const { success: rateLimitOk } = await limiter.limit(userId);
  if (!rateLimitOk) {
    return NextResponse.json(
      { success: false, data: null, error: 'RATE_LIMITED' },
      { status: 429 },
    );
  }

  // ---------------------------------------------------------------------------
  // 3. Fetch preferences (return defaults if none exist)
  // ---------------------------------------------------------------------------
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, userId))
      .limit(1);

    if (rows.length === 0) {
      return NextResponse.json(
        { success: true, data: DEFAULT_PREFS, error: null },
        { status: 200 },
      );
    }

    const row = rows[0];
    return NextResponse.json(
      {
        success: true,
        data: {
          dailyMoonPhase: row.dailyMoonPhase,
          fullNewMoon: row.fullNewMoon,
          planetaryHourChange: row.planetaryHourChange,
          weeklyDigest: row.weeklyDigest,
          preferredTime: row.preferredTime,
        },
        error: null,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error('[push/preferences] db error:', err);
    return NextResponse.json(
      { success: false, data: null, error: 'DATABASE_ERROR' },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: Request,
): Promise<NextResponse<ApiResponse<{ updated: boolean }>>> {
  // ---------------------------------------------------------------------------
  // 1. Auth
  // ---------------------------------------------------------------------------
  let userId: string;
  try {
    const user = await requireAuth();
    userId = user.userId;
  } catch (err) {
    if (err instanceof Response) return err as never;
    throw err;
  }

  // ---------------------------------------------------------------------------
  // 2. Rate limiting
  // ---------------------------------------------------------------------------
  const limiter = getRateLimiter('push/preferences');
  const { success: rateLimitOk } = await limiter.limit(userId);
  if (!rateLimitOk) {
    return NextResponse.json(
      { success: false, data: null, error: 'RATE_LIMITED' },
      { status: 429 },
    );
  }

  // ---------------------------------------------------------------------------
  // 3. Parse & validate body
  // ---------------------------------------------------------------------------
  let parsed: z.infer<typeof prefsSchema>;
  try {
    const body = await request.json();
    const result = prefsSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { success: false, data: null, error: 'INVALID_INPUT' },
        { status: 400 },
      );
    }
    parsed = result.data;
  } catch {
    return NextResponse.json(
      { success: false, data: null, error: 'INVALID_INPUT' },
      { status: 400 },
    );
  }

  // ---------------------------------------------------------------------------
  // 3. Upsert preferences
  // ---------------------------------------------------------------------------
  try {
    const db = getDb();
    await db
      .insert(notificationPreferences)
      .values({
        userId,
        ...parsed,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: notificationPreferences.userId,
        set: { ...parsed, updatedAt: new Date() },
      });

    return NextResponse.json(
      { success: true, data: { updated: true }, error: null },
      { status: 200 },
    );
  } catch (err) {
    console.error('[push/preferences] upsert error:', err);
    return NextResponse.json(
      { success: false, data: null, error: 'DATABASE_ERROR' },
      { status: 500 },
    );
  }
}
