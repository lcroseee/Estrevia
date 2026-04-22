import { auth } from '@clerk/nextjs/server';
import { redis } from '@/shared/lib/redis';

/**
 * POST /api/v1/user/attribution
 *
 * Records which Cosmic Passport drove a new sign-up.
 * Called client-side by ReferralTracker after the user is authenticated.
 *
 * Stores: Redis key `referral:{userId}` → passportId, TTL 90 days.
 * No PII — passportId is a server-generated nanoid(8), never user input.
 *
 * Idempotent — safe to call multiple times (only writes if key not set).
 */
export async function POST(req: Request) {
  const { userId } = await auth();

  if (!userId) {
    return Response.json(
      { error: 'UNAUTHORIZED', message: 'Authentication required' },
      { status: 401 },
    );
  }

  let passportId: string | undefined;
  try {
    const body = await req.json() as { passportId?: unknown };
    if (typeof body.passportId === 'string') {
      passportId = body.passportId;
    }
  } catch {
    return Response.json(
      { error: 'BAD_REQUEST', message: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  if (!passportId || passportId.length < 1 || passportId.length > 64) {
    return Response.json(
      { error: 'BAD_REQUEST', message: 'passportId is required (1–64 chars)' },
      { status: 400 },
    );
  }

  // Only record the first referral — do not overwrite if already attributed.
  const redisKey = `referral:${userId}`;
  const TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days

  try {
    // NX = only set if key does not already exist (idempotent first-touch)
    await redis.set(redisKey, passportId, { ex: TTL_SECONDS, nx: true });
  } catch (err) {
    console.error('[attribution] Redis write failed', { userId, err });
    // Non-fatal — attribution is a best-effort signal, not a critical path
    return Response.json({ recorded: false }, { status: 200 });
  }

  return Response.json({ recorded: true }, { status: 200 });
}
