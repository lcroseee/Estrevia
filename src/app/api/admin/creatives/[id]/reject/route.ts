/**
 * POST /api/admin/creatives/[id]/reject
 *
 * Sets creative status to 'rejected', logs the rejection reason.
 *
 * Auth: Clerk JWT + ADMIN_ALLOWED_EMAILS allowlist.
 *
 * Body: { reason?: string }
 */

import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '@/app/admin/lib/admin-auth';
import { getDb } from '@/shared/lib/db';
import { advertisingCreatives } from '@/shared/lib/schema';

export async function POST(
  request: Request,
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

  // 2. Parse body for rejection reason
  let reason = 'No reason provided';
  try {
    const body = (await request.json()) as { reason?: string };
    if (typeof body.reason === 'string' && body.reason.trim()) {
      reason = body.reason.trim().slice(0, 1000); // cap at 1000 chars
    }
  } catch {
    // Body is optional — proceed with default reason
  }

  try {
    const db = getDb();

    // Verify the creative exists
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

    // Allow rejection from pending_review or approved states (undo approve)
    const allowedFromStates: string[] = ['pending_review', 'approved'];
    if (!allowedFromStates.includes(rows[0].status)) {
      return NextResponse.json(
        {
          success: false,
          error: 'INVALID_STATUS',
          message: `Cannot reject a creative with status "${rows[0].status}"`,
        },
        { status: 409 },
      );
    }

    // Update status; store reason in approvedBy field as the rejection actor,
    // and log in applyError-style column. Schema has no separate reject_reason
    // column — we encode it as: approvedBy = "rejected by <email>: <reason>"
    // This keeps the schema stable while capturing the audit trail.
    await db
      .update(advertisingCreatives)
      .set({
        status: 'rejected',
        // Re-purpose approvedBy to record who rejected and why
        approvedBy: `rejected:${approverEmail}|${reason}`,
        approvedAt: new Date(),
      })
      .where(eq(advertisingCreatives.id, id));

    return NextResponse.json(
      { success: true, data: { id, status: 'rejected', reason }, error: null },
      { status: 200 },
    );
  } catch (err) {
    try {
      const { captureException } = await import('@sentry/nextjs');
      captureException(err);
    } catch {
      console.error('[admin/creatives/reject] db error:', err);
    }

    return NextResponse.json(
      { success: false, error: 'DATABASE_ERROR' },
      { status: 500 },
    );
  }
}
