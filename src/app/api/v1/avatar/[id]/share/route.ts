/**
 * PATCH /api/v1/avatar/[id]/share
 *
 * Owner-only toggle for whether a Cosmic Portrait is publicly reachable via
 * its share page (`/s/avatar/[id]`) and the anonymous branch of
 * `GET /api/v1/avatar/[id]/image`.
 *
 * Non-owners (including anonymous callers) get 404, never 403 — matching
 * the image route's non-disclosure rule: a 403 would confirm the id exists
 * to a caller who isn't allowed to touch it.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { requireAuth } from '@/modules/auth/lib/helpers';
import { getDb } from '@/shared/lib/db';
import { avatars } from '@/shared/lib/schema';
import { trackServerEvent, AnalyticsEvent } from '@/shared/lib/analytics';
import type { ApiResponse } from '@/shared/types';

const shareSchema = z.object({
  isShared: z.boolean(),
});

function notFound(): NextResponse<ApiResponse<null>> {
  return NextResponse.json({ success: false, data: null, error: 'NOT_FOUND' }, { status: 404 });
}

function invalidInput(): NextResponse<ApiResponse<null>> {
  return NextResponse.json({ success: false, data: null, error: 'INVALID_INPUT' }, { status: 400 });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<ApiResponse<{ isShared: boolean } | null>>> {
  const { id } = await params;

  // ---------------------------------------------------------------------------
  // 1. Auth — JWT verification via Clerk, no DB round-trip
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
  // 2. Load the row, 404 unless the caller owns it
  // ---------------------------------------------------------------------------
  const db = getDb();
  const rows = await db.select().from(avatars).where(eq(avatars.id, id)).limit(1);
  if (rows.length === 0) return notFound();

  const row = rows[0];
  if (row.userId !== userId) return notFound();

  // ---------------------------------------------------------------------------
  // 3. Parse & validate body
  // ---------------------------------------------------------------------------
  let parsed: z.infer<typeof shareSchema>;
  try {
    const body = await request.json();
    const result = shareSchema.safeParse(body);
    if (!result.success) return invalidInput();
    parsed = result.data;
  } catch {
    return invalidInput();
  }

  // ---------------------------------------------------------------------------
  // 4. Update
  // ---------------------------------------------------------------------------
  await db.update(avatars).set({ isShared: parsed.isShared }).where(eq(avatars.id, id));

  // Only the transition to shared is a growth-relevant event.
  if (parsed.isShared) {
    trackServerEvent(userId, AnalyticsEvent.AVATAR_PORTRAIT_SHARED, { avatar_id: id });
  }

  return NextResponse.json(
    { success: true, data: { isShared: parsed.isShared }, error: null },
    { status: 200 },
  );
}
