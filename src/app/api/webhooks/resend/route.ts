/**
 * POST /api/webhooks/resend
 *
 * Receives Resend bounce and complaint events via svix-signed webhooks.
 * On hard bounce or complaint → sets users.email_undeliverable = true.
 * Soft bounces are ignored (transient failure, do not suppress).
 *
 * Security: rejects any request that fails svix signature verification with 401.
 * NEVER log email addresses to server logs — only userId / event type.
 */

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { headers } from 'next/headers';
import { eq } from 'drizzle-orm';
import { getDb } from '@/shared/lib/db';
import { users } from '@/shared/lib/schema';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Resend webhook event types (only the ones we handle)
// ---------------------------------------------------------------------------
interface ResendBouncedEvent {
  type: 'email.bounced';
  data: {
    email: string;
    bounce_type?: 'hard' | 'soft';
  };
}

interface ResendComplainedEvent {
  type: 'email.complained';
  data: {
    email: string;
  };
}

type ResendEvent = ResendBouncedEvent | ResendComplainedEvent | { type: string; data: unknown };

export async function POST(req: Request) {
  // ---------------------------------------------------------------------------
  // 1. Guard: RESEND_WEBHOOK_SECRET must be configured
  // ---------------------------------------------------------------------------
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[resend-webhook] RESEND_WEBHOOK_SECRET is not configured');
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Webhook not configured' },
      { status: 500 },
    );
  }

  // ---------------------------------------------------------------------------
  // 2. Read svix signature headers
  // ---------------------------------------------------------------------------
  const h = await headers();
  const svixId = h.get('svix-id');
  const svixTs = h.get('svix-timestamp');
  const svixSig = h.get('svix-signature');

  if (!svixId || !svixTs || !svixSig) {
    return NextResponse.json(
      { error: 'BAD_REQUEST', message: 'Missing svix headers' },
      { status: 400 },
    );
  }

  // ---------------------------------------------------------------------------
  // 3. Read raw body + verify signature
  //    Must read text() before verification — do NOT call req.json() first
  // ---------------------------------------------------------------------------
  const body = await req.text();
  let evt: ResendEvent;

  try {
    evt = new Webhook(secret).verify(body, {
      'svix-id': svixId,
      'svix-timestamp': svixTs,
      'svix-signature': svixSig,
    }) as ResendEvent;
  } catch (err) {
    console.error(
      '[resend-webhook] Signature verification failed',
      err instanceof Error ? err.message : 'unknown',
    );
    return NextResponse.json(
      { error: 'UNAUTHORIZED', message: 'Webhook verification failed' },
      { status: 401 },
    );
  }

  // ---------------------------------------------------------------------------
  // 4. Handle events — update DB on hard bounce or complaint
  // ---------------------------------------------------------------------------
  try {
    const db = getDb();

    if (evt.type === 'email.bounced') {
      const bounceEvt = evt as ResendBouncedEvent;
      if (bounceEvt.data.bounce_type === 'hard') {
        await db
          .update(users)
          .set({ emailUndeliverable: true })
          .where(eq(users.email, bounceEvt.data.email));
        // Log event type only — never the email address (PII)
        console.info('[resend-webhook] hard bounce → emailUndeliverable=true');
      } else {
        // Soft bounce: transient failure, log only, no DB write
        console.info('[resend-webhook] soft bounce ignored');
      }
    } else if (evt.type === 'email.complained') {
      const complainEvt = evt as ResendComplainedEvent;
      await db
        .update(users)
        .set({ emailUndeliverable: true })
        .where(eq(users.email, complainEvt.data.email));
      console.info('[resend-webhook] complaint → emailUndeliverable=true');
    }
    // Unknown event types are silently accepted (forward-compatible)
  } catch (err) {
    console.error('[resend-webhook] DB operation failed', {
      eventType: evt.type,
      message: err instanceof Error ? err.message : 'unknown',
    });
    // Return 500 → Resend will retry (DB errors should be retried)
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to process webhook' },
      { status: 500 },
    );
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
