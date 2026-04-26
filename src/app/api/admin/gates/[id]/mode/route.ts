/**
 * POST /api/admin/gates/[id]/mode
 *
 * Manual override for a feature gate's mode.
 *
 * Auth: Clerk JWT + ADMIN_ALLOWED_EMAILS allowlist.
 *
 * Body: { mode: GateMode }
 */

import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '@/app/admin/lib/admin-auth';
import { getDb } from '@/shared/lib/db';
import { advertisingFeatureGates } from '@/shared/lib/schema';

const VALID_MODES = ['off', 'stub', 'shadow', 'active_proposal', 'active_auto'] as const;
type GateMode = (typeof VALID_MODES)[number];

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  // 1. Auth
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof Response) return err as never;
    throw err;
  }

  const { id } = await params;

  // 2. Parse mode from body
  let mode: GateMode;
  try {
    const body = (await request.json()) as { mode?: unknown };
    if (!body.mode || !VALID_MODES.includes(body.mode as GateMode)) {
      return NextResponse.json(
        {
          success: false,
          error: 'INVALID_MODE',
          message: `mode must be one of: ${VALID_MODES.join(', ')}`,
        },
        { status: 400 },
      );
    }
    mode = body.mode as GateMode;
  } catch {
    return NextResponse.json(
      { success: false, error: 'INVALID_BODY' },
      { status: 400 },
    );
  }

  try {
    const db = getDb();

    const rows = await db
      .select({ featureId: advertisingFeatureGates.featureId })
      .from(advertisingFeatureGates)
      .where(eq(advertisingFeatureGates.featureId, id))
      .limit(1);

    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'NOT_FOUND' },
        { status: 404 },
      );
    }

    await db
      .update(advertisingFeatureGates)
      .set({
        mode,
        updatedAt: new Date(),
        // Set activatedAt when transitioning to an active mode
        ...(mode.startsWith('active_') ? { activatedAt: new Date() } : {}),
      })
      .where(eq(advertisingFeatureGates.featureId, id));

    return NextResponse.json(
      { success: true, data: { featureId: id, mode }, error: null },
      { status: 200 },
    );
  } catch (err) {
    try {
      const { captureException } = await import('@sentry/nextjs');
      captureException(err);
    } catch {
      console.error('[admin/gates/mode] db error:', err);
    }

    return NextResponse.json(
      { success: false, error: 'DATABASE_ERROR' },
      { status: 500 },
    );
  }
}
