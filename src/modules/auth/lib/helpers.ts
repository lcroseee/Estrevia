import { auth, currentUser } from '@clerk/nextjs/server';

export interface AuthUser {
  userId: string;
  email: string;
}

/**
 * Returns the current authenticated user (userId + primary email), or null
 * if the request is unauthenticated. Uses Clerk JWT verification — no DB
 * round-trip per request (stateless, per CLAUDE.md auth rules).
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const user = await currentUser();
  if (!user) return null;

  const email = user.emailAddresses[0]?.emailAddress ?? '';
  return { userId, email };
}

/**
 * Returns the current authenticated user or throws a 401 Response.
 * Use inside Route Handlers that require authentication.
 */
export async function requireAuth(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw Response.json(
      { error: 'UNAUTHORIZED', message: 'Authentication required' },
      { status: 401 },
    );
  }
  return user;
}

/**
 * Requires the current user to be on the given subscription tier or higher.
 * 'free' — only requires authentication.
 * 'premium' — requires authentication + active premium subscription.
 *
 * Throws 401 if unauthenticated, 403 if the subscription is insufficient.
 */
export async function requireTier(tier: 'free' | 'premium'): Promise<void> {
  if (tier === 'free') {
    await requireAuth();
    return;
  }

  // Lazy import to avoid circular dependency (premium.ts imports helpers.ts)
  const { requirePremium } = await import('./premium');
  await requirePremium();
}
