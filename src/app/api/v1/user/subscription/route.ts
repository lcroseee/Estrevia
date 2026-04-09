/**
 * GET /api/v1/user/subscription
 *
 * Returns the current user's subscription details (plan, status, trial info).
 * Auth required.
 */

import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireAuth } from '@/modules/auth/lib/helpers';
import { getDb } from '@/shared/lib/db';
import { users } from '@/shared/lib/schema';

export async function GET() {
  let userId: string;
  try {
    const user = await requireAuth();
    userId = user.userId;
  } catch (err) {
    if (err instanceof Response) return err as never;
    throw err;
  }

  const db = getDb();
  const rows = await db
    .select({
      plan: users.plan,
      subscriptionTier: users.subscriptionTier,
      subscriptionStatus: users.subscriptionStatus,
      trialEnd: users.trialEnd,
      currentPeriodEnd: users.currentPeriodEnd,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (rows.length === 0) {
    return NextResponse.json({
      plan: 'free',
      status: 'active',
      trialEnd: null,
      currentPeriodEnd: null,
      isPro: false,
      isTrialing: false,
    });
  }

  const row = rows[0];
  // Double-check with subscriptionTier to prevent isPro bypass from partial webhook writes
  const isPro = row.subscriptionTier === 'premium' &&
    row.plan !== 'free' &&
    (row.subscriptionStatus === 'active' || row.subscriptionStatus === 'trialing' || row.subscriptionStatus === 'past_due');
  const isTrialing = row.subscriptionStatus === 'trialing';

  return NextResponse.json({
    plan: row.plan,
    status: row.subscriptionStatus,
    trialEnd: row.trialEnd?.toISOString() ?? null,
    currentPeriodEnd: row.currentPeriodEnd?.toISOString() ?? null,
    isPro,
    isTrialing,
  });
}
