import { eq } from 'drizzle-orm';
import { getDb } from '@/shared/lib/db';
import { users } from '@/shared/lib/schema';
import { requireAuth } from './helpers';

/**
 * Pure eligibility logic — separated for unit testing without DB.
 *
 * A user is considered premium when ANY of the following is true:
 * 1. subscriptionStatus is 'past_due' — Stripe is retrying payment; user stays
 *    active during the grace period (aligned with the Stripe webhook handler
 *    which keeps subscriptionTier = 'premium' on past_due events).
 * 2. subscriptionTier is 'premium' AND (expiresAt is null OR expiresAt > now).
 */
export function computeIsPremium(
  subscriptionTier: string | null,
  subscriptionStatus: string | null,
  subscriptionExpiresAt: Date | null,
  now = new Date(),
): boolean {
  // Grace period: past_due means Stripe is retrying; honor the subscription.
  if (subscriptionStatus === 'past_due') return true;

  if (subscriptionTier !== 'premium') return false;

  // If expiresAt is null, subscription is active indefinitely.
  if (subscriptionExpiresAt === null) return true;

  return subscriptionExpiresAt > now;
}

/**
 * Returns true if the user has an active premium subscription.
 * Checks subscription tier, status (including past_due grace period), and expiry.
 */
export async function isPremium(userId: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({
      subscriptionTier: users.subscriptionTier,
      subscriptionStatus: users.subscriptionStatus,
      subscriptionExpiresAt: users.subscriptionExpiresAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (rows.length === 0) return false;

  const { subscriptionTier, subscriptionStatus, subscriptionExpiresAt } = rows[0];

  return computeIsPremium(subscriptionTier, subscriptionStatus, subscriptionExpiresAt);
}

/**
 * Verifies the current request is authenticated AND has an active premium
 * subscription. Throws 401 if unauthenticated, 403 if not premium.
 * Returns the resolved AuthUser so callers do not need a second requireAuth() call.
 * Use inside Route Handlers that gate premium features.
 */
export async function requirePremium(): Promise<import('./helpers').AuthUser> {
  // requireAuth() throws 401 Response if not authenticated
  const user = await requireAuth();

  const premium = await isPremium(user.userId);
  if (!premium) {
    throw Response.json(
      {
        error: 'FORBIDDEN',
        message: 'Premium subscription required',
      },
      { status: 403 },
    );
  }

  return user;
}

/**
 * Richer subscription shape returned by getSubscriptionDetails().
 * Consumed by src/app/(app)/settings/page.tsx.
 *
 * - tier: 'premium' when user has active access (including past_due grace period)
 * - status: raw Stripe subscription status
 * - needsPaymentUpdate: true when user is in past_due grace period — settings
 *   page renders a "Update payment method" banner with Stripe Customer Portal CTA
 * - gracePeriodEndsAt: currentPeriodEnd when past_due, otherwise null
 */
export interface SubscriptionDetails {
  isPremium: boolean;
  tier: 'premium' | 'free';
  plan: string | null;
  status: string | null;
  trialEnd: Date | null;
  currentPeriodEnd: Date | null;
  expiresAt: Date | null;
  needsPaymentUpdate: boolean;
  gracePeriodEndsAt: Date | null;
}

/** Raw DB row shape used by deriveSubscriptionDetails and getSubscriptionDetails. */
interface SubscriptionRow {
  subscriptionTier: string | null;
  subscriptionStatus: string | null;
  subscriptionExpiresAt: Date | null;
  plan: string | null;
  trialEnd: Date | null;
  currentPeriodEnd: Date | null;
}

/**
 * Pure function: derives the full SubscriptionDetails shape from a DB row.
 * Exported for unit testing without a DB dependency.
 */
export function deriveSubscriptionDetails(row: SubscriptionRow): SubscriptionDetails {
  // Use the same logic as computeIsPremium() / isPremium() so the Settings page
  // is always consistent with API route guards.
  const premium = computeIsPremium(row.subscriptionTier, row.subscriptionStatus, row.subscriptionExpiresAt);
  const isPastDue = row.subscriptionStatus === 'past_due';

  return {
    isPremium: premium,
    tier: premium ? 'premium' : 'free',
    plan: row.plan,
    status: row.subscriptionStatus,
    trialEnd: row.trialEnd,
    currentPeriodEnd: row.currentPeriodEnd,
    expiresAt: row.subscriptionExpiresAt,
    // Signal to the UI that a payment action is required but access is still active.
    needsPaymentUpdate: isPastDue && premium,
    // When past_due, currentPeriodEnd is the end of the grace window Stripe uses
    // for dunning retries. Show this to the user so they know when access expires.
    gracePeriodEndsAt: isPastDue && premium ? row.currentPeriodEnd : null,
  };
}

/**
 * Returns detailed subscription information for a user.
 * Used by subscription API and server-side components that need
 * more than just a boolean premium check.
 *
 * IMPORTANT: isPremium and tier are computed via computeIsPremium() — the same
 * logic used by isPremium() and all API route guards. This ensures the Settings
 * page (src/app/(app)/settings/page.tsx) always reflects the same access state
 * as the API, including the past_due grace period.
 */
export async function getSubscriptionDetails(userId: string): Promise<SubscriptionDetails> {
  const db = getDb();
  const rows = await db
    .select({
      subscriptionTier: users.subscriptionTier,
      subscriptionExpiresAt: users.subscriptionExpiresAt,
      plan: users.plan,
      subscriptionStatus: users.subscriptionStatus,
      trialEnd: users.trialEnd,
      currentPeriodEnd: users.currentPeriodEnd,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (rows.length === 0) {
    return {
      isPremium: false,
      tier: 'free',
      plan: 'free',
      status: null,
      trialEnd: null,
      currentPeriodEnd: null,
      expiresAt: null,
      needsPaymentUpdate: false,
      gracePeriodEndsAt: null,
    };
  }

  return deriveSubscriptionDetails(rows[0]);
}
