/**
 * DELETE /api/v1/user/account
 *
 * GDPR Article 17 — Right to Erasure ("Right to be Forgotten").
 * Permanently deletes all user data:
 *   - natal_charts (CASCADE deletes linked cosmic_passports automatically)
 *   - users record
 *
 * Auth: required (Clerk JWT). Owner-only.
 * Note: Clerk user record deletion is handled via Clerk dashboard / webhook;
 * this endpoint removes application data only.
 */

import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireAuth } from '@/modules/auth/lib/helpers';
import { getDb } from '@/shared/lib/db';
import { natalCharts, users } from '@/shared/lib/schema';
import { trackServerEvent, AnalyticsEvent } from '@/shared/lib/analytics';
import type { ApiResponse } from '@/shared/types';

interface AccountDeleteResponse {
  deletedAt: string;
  message: string;
}

export async function DELETE(): Promise<
  NextResponse<ApiResponse<AccountDeleteResponse>>
> {
  // ---------------------------------------------------------------------------
  // 1. Auth — JWT verification, no DB round-trip
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
  // 2. Delete all user data
  //
  // Deletion order matters for foreign key constraints:
  //   cosmic_passports → natal_charts (ON DELETE CASCADE handles this)
  //   natal_charts → users (ON DELETE CASCADE handles this)
  //
  // So deleting the users row cascades everything. However, we explicitly
  // delete charts first to be safe with databases that don't enforce FK cascade
  // at the row level in all scenarios, and to have granular error handling.
  // ---------------------------------------------------------------------------
  try {
    const db = getDb();
    const deletedAt = new Date().toISOString();

    // Step 1: delete all charts (CASCADE removes linked passports)
    await db.delete(natalCharts).where(eq(natalCharts.userId, userId));

    // Step 2: delete user record
    await db.delete(users).where(eq(users.id, userId));

    // ---------------------------------------------------------------------------
    // 3. Analytics — track before returning (fire-and-forget, non-blocking)
    // ---------------------------------------------------------------------------
    trackServerEvent(userId, AnalyticsEvent.ACCOUNT_DELETED);

    // ---------------------------------------------------------------------------
    // 4. Confirm deletion
    // ---------------------------------------------------------------------------
    return NextResponse.json(
      {
        success: true,
        data: {
          deletedAt,
          message:
            'All Estrevia application data has been permanently deleted. ' +
            'Your authentication account (Clerk) remains active — delete it separately via account settings.',
        },
        error: null,
      },
      { status: 200 },
    );
  } catch (err) {
    try {
      const { captureException } = await import('@sentry/nextjs');
      captureException(err);
    } catch {
      console.error('[account/delete] unexpected error:', err);
    }

    return NextResponse.json(
      { success: false, data: null, error: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}
