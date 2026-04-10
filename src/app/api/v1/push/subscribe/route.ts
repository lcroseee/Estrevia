/**
 * POST /api/v1/push/subscribe — Save a push subscription for the current user.
 * DELETE /api/v1/push/subscribe — Remove all push subscriptions for the current user.
 *
 * Auth required.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '@/modules/auth/lib/helpers';
import { getRateLimiter } from '@/shared/lib/rate-limit';
import { getDb } from '@/shared/lib/db';
import { pushSubscriptions } from '@/shared/lib/schema';
import type { ApiResponse } from '@/shared/types';

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export async function POST(
  request: Request,
): Promise<NextResponse<ApiResponse<{ subscribed: boolean }>>> {
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
  const limiter = getRateLimiter('push/subscribe');
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
  let parsed: z.infer<typeof subscribeSchema>;
  try {
    const body = await request.json();
    const result = subscribeSchema.safeParse(body);
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
  // 3. Save subscription
  // ---------------------------------------------------------------------------
  try {
    const db = getDb();
    // Delete any existing subscription for this endpoint, then insert fresh.
    // This deduplicates re-subscribes (page reload, permission re-grant).
    await db.delete(pushSubscriptions).where(
      and(
        eq(pushSubscriptions.userId, userId),
        eq(pushSubscriptions.endpoint, parsed.endpoint),
      ),
    );
    await db.insert(pushSubscriptions).values({
      userId,
      endpoint: parsed.endpoint,
      p256dh: parsed.keys.p256dh,
      auth: parsed.keys.auth,
    });

    return NextResponse.json(
      { success: true, data: { subscribed: true }, error: null },
      { status: 200 },
    );
  } catch (err) {
    console.error('[push/subscribe] db error:', err);
    return NextResponse.json(
      { success: false, data: null, error: 'DATABASE_ERROR' },
      { status: 500 },
    );
  }
}

export async function DELETE(): Promise<
  NextResponse<ApiResponse<{ unsubscribed: boolean }>>
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
  const limiter = getRateLimiter('push/subscribe');
  const { success: rateLimitOk } = await limiter.limit(userId);
  if (!rateLimitOk) {
    return NextResponse.json(
      { success: false, data: null, error: 'RATE_LIMITED' },
      { status: 429 },
    );
  }

  // ---------------------------------------------------------------------------
  // 3. Delete all subscriptions for user
  // ---------------------------------------------------------------------------
  try {
    const db = getDb();
    await db
      .delete(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId));

    return NextResponse.json(
      { success: true, data: { unsubscribed: true }, error: null },
      { status: 200 },
    );
  } catch (err) {
    console.error('[push/subscribe] delete error:', err);
    return NextResponse.json(
      { success: false, data: null, error: 'DATABASE_ERROR' },
      { status: 500 },
    );
  }
}
