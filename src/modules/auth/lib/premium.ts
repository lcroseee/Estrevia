import { eq } from 'drizzle-orm';
import { getDb } from '@/shared/lib/db';
import { users } from '@/shared/lib/schema';
import { requireAuth } from './helpers';

/**
 * Returns true if the user has an active premium subscription.
 * Checks both the subscription tier and expiry timestamp.
 */
export async function isPremium(userId: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({
      subscriptionTier: users.subscriptionTier,
      subscriptionExpiresAt: users.subscriptionExpiresAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (rows.length === 0) return false;

  const { subscriptionTier, subscriptionExpiresAt } = rows[0];

  if (subscriptionTier !== 'premium') return false;

  // If expiresAt is null, the subscription is active indefinitely (should not
  // happen in normal flow, but we treat it as active rather than blocking the user)
  if (subscriptionExpiresAt === null) return true;

  return subscriptionExpiresAt > new Date();
}

/**
 * Verifies the current request is authenticated AND has an active premium
 * subscription. Throws 401 if unauthenticated, 403 if not premium.
 * Use inside Route Handlers that gate premium features.
 */
export async function requirePremium(): Promise<void> {
  // requireAuth() throws 401 Response if not authenticated
  const { userId } = await requireAuth();

  const premium = await isPremium(userId);
  if (!premium) {
    throw Response.json(
      {
        error: 'FORBIDDEN',
        message: 'Premium subscription required',
      },
      { status: 403 },
    );
  }
}
