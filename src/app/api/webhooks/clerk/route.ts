import { Webhook } from 'svix';
import { headers } from 'next/headers';
import type { WebhookEvent } from '@clerk/nextjs/server';
import { getDb } from '@/shared/lib/db';
import { users } from '@/shared/lib/schema';
import { eq } from 'drizzle-orm';

/**
 * POST /api/webhooks/clerk
 *
 * Receives and verifies Clerk webhook events using svix signature verification.
 * Raw body must be used for verification — do NOT call req.json() before verify().
 *
 * Events handled:
 *   user.created  → insert row into `users` table
 *   user.updated  → update email in `users` table
 *   user.deleted  → delete row from `users` table (cascade removes charts etc.)
 *
 * Security: rejects any request that fails svix signature verification with 401.
 * NEVER log decrypted PII — only user IDs and event types are logged.
 */
export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    console.error('[clerk-webhook] CLERK_WEBHOOK_SECRET is not configured');
    return Response.json(
      { error: 'INTERNAL_ERROR', message: 'Webhook not configured' },
      { status: 500 },
    );
  }

  // Read svix signature headers
  const headerPayload = await headers();
  const svixId = headerPayload.get('svix-id');
  const svixTimestamp = headerPayload.get('svix-timestamp');
  const svixSignature = headerPayload.get('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    return Response.json(
      { error: 'BAD_REQUEST', message: 'Missing svix headers' },
      { status: 400 },
    );
  }

  // Read raw body as text for svix verification (must not parse as JSON first)
  const body = await req.text();

  // Verify webhook signature
  const wh = new Webhook(WEBHOOK_SECRET);
  let evt: WebhookEvent;

  try {
    evt = wh.verify(body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as WebhookEvent;
  } catch (err) {
    console.error('[clerk-webhook] Signature verification failed', err);
    return Response.json(
      { error: 'UNAUTHORIZED', message: 'Webhook verification failed' },
      { status: 401 },
    );
  }

  const db = getDb();
  const { type: eventType, data } = evt;

  try {
    if (eventType === 'user.created') {
      const email = data.email_addresses[0]?.email_address ?? '';
      await db
        .insert(users)
        .values({
          id: data.id,
          email,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoNothing(); // idempotent — safe to retry

      console.info('[clerk-webhook] user.created', { userId: data.id });
    }

    if (eventType === 'user.updated') {
      const email = data.email_addresses[0]?.email_address ?? '';
      await db
        .update(users)
        .set({ email, updatedAt: new Date() })
        .where(eq(users.id, data.id));

      console.info('[clerk-webhook] user.updated', { userId: data.id });
    }

    if (eventType === 'user.deleted') {
      if (data.id) {
        await db.delete(users).where(eq(users.id, data.id));
        console.info('[clerk-webhook] user.deleted', { userId: data.id });
      }
    }
  } catch (err) {
    console.error('[clerk-webhook] DB operation failed', { eventType, err });
    return Response.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to process webhook' },
      { status: 500 },
    );
  }

  return Response.json({ received: true }, { status: 200 });
}
