/**
 * POST /api/admin/creatives/[id]/approve
 *
 * Sets creative status to 'approved', records approver + timestamp.
 *
 * Auth: Clerk JWT + ADMIN_ALLOWED_EMAILS allowlist.
 *
 * Meta upload (uploadApprovedCreative) is intentionally deferred — the full
 * S4 (act stream) integration requires a live Meta API client. The DB status
 * is updated here so the admin UI reflects the approval immediately.
 * TODO (S4 integration): call uploadApprovedCreative after DB update.
 */

import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '@/app/admin/lib/admin-auth';
import { getDb } from '@/shared/lib/db';
import { advertisingCreatives } from '@/shared/lib/schema';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  // 1. Auth — must be an allowlisted admin
  let approverEmail: string;
  try {
    const admin = await requireAdmin();
    approverEmail = admin.email;
  } catch (err) {
    if (err instanceof Response) return err as never;
    throw err;
  }

  const { id } = await params;

  try {
    const db = getDb();

    // Verify the creative exists and is in pending_review state
    const rows = await db
      .select({ id: advertisingCreatives.id, status: advertisingCreatives.status })
      .from(advertisingCreatives)
      .where(eq(advertisingCreatives.id, id))
      .limit(1);

    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'NOT_FOUND' },
        { status: 404 },
      );
    }

    if (rows[0].status !== 'pending_review') {
      return NextResponse.json(
        { success: false, error: 'INVALID_STATUS', message: `Creative is ${rows[0].status}, not pending_review` },
        { status: 409 },
      );
    }

    // Update status + audit fields
    await db
      .update(advertisingCreatives)
      .set({
        status: 'approved',
        approvedBy: approverEmail,
        approvedAt: new Date(),
      })
      .where(eq(advertisingCreatives.id, id));

    // TODO (S4 integration): trigger uploadApprovedCreative from
    // @/modules/advertising/creative-gen/upload/meta-upload when Meta API client is wired up.

    return NextResponse.json(
      { success: true, data: { id, status: 'approved' }, error: null },
      { status: 200 },
    );
  } catch (err) {
    try {
      const { captureException } = await import('@sentry/nextjs');
      captureException(err);
    } catch {
      console.error('[admin/creatives/approve] db error:', err);
    }

    return NextResponse.json(
      { success: false, error: 'DATABASE_ERROR' },
      { status: 500 },
    );
  }
}
