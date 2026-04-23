/**
 * GET /api/v1/user/subscription
 *
 * Returns the current user's subscription details (plan, status, trial info).
 * Auth required.
 *
 * isPro MUST be computed via computeIsPremium() — the same function used by
 * requirePremium() guards and the /settings server page. Reimplementing the
 * check here has caused drift bugs where paying users saw the paywall because
 * one field (plan, status) was out of sync with the others.
 */

import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireAuth } from '@/modules/auth/lib/helpers';
import { computeIsPremium } from '@/modules/auth/lib/premium';
import { getRateLimiter } from '@/shared/lib/rate-limit';
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

  // Rate limiting
  const limiter = getRateLimiter('user/subscription');
  const { success: rateLimitOk } = await limiter.limit(userId);
  if (!rateLimitOk) {
    return NextResponse.json(
      { plan: 'free', status: 'active', trialEnd: null, currentPeriodEnd: null, isPro: false, isTrialing: false, error: 'RATE_LIMITED' },
      { status: 429 },
    );
  }

  const db = getDb();
  const rows = await db
    .select({
      plan: users.plan,
      subscriptionTier: users.subscriptionTier,
      subscriptionStatus: users.subscriptionStatus,
      subscriptionExpiresAt: users.subscriptionExpiresAt,
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
  const isPro = computeIsPremium(
    row.subscriptionTier,
    row.subscriptionStatus,
    row.subscriptionExpiresAt,
  );
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
