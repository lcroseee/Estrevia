/**
 * POST /api/webhooks/resend
 *
 * Receives Resend bounce and complaint events via svix-signed webhooks.
 * On Permanent bounce or complaint → sets email_undeliverable = true on
 * BOTH users and email_leads for every address in data.to[]. Transient /
 * Undetermined bounces are log-only (transient failure, do not suppress).
 *
 * Security: rejects any request that fails svix signature verification with 401.
 * NEVER log email addresses to server logs — only userId / event type.
 */

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { headers } from 'next/headers';
import { eq, sql } from 'drizzle-orm';
import { getDb } from '@/shared/lib/db';
import { users, emailLeads } from '@/shared/lib/schema';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Resend webhook event types (only the ones we handle).
// Shape matches the installed SDK — resend@6.10.0, node_modules/resend/dist/
// index.d.mts: BaseEmailEventData carries `to: string[]` (there is NO
// `data.email` field) and EmailBouncedEvent adds `bounce: { message, subType,
// type }`. Live bounce.type values: Permanent | Transient | Undetermined —
// NOT the 'hard'/'soft' shape this file assumed before 2026-07-10, which made
// suppression a permanent no-op (CRO audit 04-resend.md R-2).
// ---------------------------------------------------------------------------
interface ResendEmailEventData {
  created_at: string;
  email_id: string;
  from: string;
  to: string[];
  subject: string;
}

interface ResendBouncedEvent {
  type: 'email.bounced';
  created_at: string;
  data: ResendEmailEventData & {
    bounce: { message: string; subType: string; type: string };
  };
}

interface ResendComplainedEvent {
  type: 'email.complained';
  created_at: string;
  data: ResendEmailEventData;
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
      // Defensive: verify() output is only cast, never validated — treat every
      // field as possibly absent (legacy/foreign payloads must not 500-loop).
      const data = (evt as ResendBouncedEvent).data as
        | Partial<ResendBouncedEvent['data']>
        | undefined;
      const bounceType = data?.bounce?.type;
      const recipients = Array.isArray(data?.to) ? data.to : [];

      if (bounceType === 'Permanent') {
        // Hard (permanent) bounce → suppress every recipient on BOTH tables.
        // lower() match on users so stored-case never misses; leads are stored
        // normalized lowercase in /api/v1/leads. Per-address failures are
        // isolated so one bad row doesn't block the rest; if ALL addresses
        // fail we rethrow → 500 → Resend retries the whole event.
        let failedCount = 0;
        let firstErr: unknown = null;
        for (const recipient of recipients) {
          const email = recipient.toLowerCase();
          try {
            await db
              .update(users)
              .set({ emailUndeliverable: true })
              .where(sql`lower(${users.email}) = ${email}`);
            await db
              .update(emailLeads)
              .set({ emailUndeliverable: true })
              .where(eq(emailLeads.email, email));
          } catch (addrErr) {
            failedCount += 1;
            firstErr ??= addrErr;
            // Log message only — never the email address (PII)
            console.error('[resend-webhook] bounce suppression failed for one recipient (isolated)', {
              message: addrErr instanceof Error ? addrErr.message : 'unknown',
            });
          }
        }
        if (recipients.length > 0 && failedCount === recipients.length) throw firstErr;
        console.info('[resend-webhook] permanent bounce → emailUndeliverable=true', {
          recipients: recipients.length,
          failed: failedCount,
        });
      } else {
        // Transient / Undetermined (or malformed payload): log only, no DB
        // write. Revisit the Undetermined policy if volume shows up in logs.
        console.info('[resend-webhook] non-permanent bounce ignored', {
          bounceType: bounceType ?? 'missing',
        });
      }
    } else if (evt.type === 'email.complained') {
      const data = (evt as ResendComplainedEvent).data as
        | Partial<ResendComplainedEvent['data']>
        | undefined;
      const recipients = Array.isArray(data?.to) ? data.to : [];

      // Complaint is stronger than a bounce: the recipient marked us as spam.
      // Flag undeliverable on users AND both flag + unsubscribe the lead so a
      // re-submitted email stays out of the drip. Same per-address isolation
      // as the bounce path.
      let failedCount = 0;
      let firstErr: unknown = null;
      for (const recipient of recipients) {
        const email = recipient.toLowerCase();
        try {
          await db
            .update(users)
            .set({ emailUndeliverable: true })
            .where(sql`lower(${users.email}) = ${email}`);
          await db
            .update(emailLeads)
            .set({ emailUndeliverable: true, unsubscribedAt: new Date() })
            .where(eq(emailLeads.email, email));
        } catch (addrErr) {
          failedCount += 1;
          firstErr ??= addrErr;
          console.error('[resend-webhook] complaint suppression failed for one recipient (isolated)', {
            message: addrErr instanceof Error ? addrErr.message : 'unknown',
          });
        }
      }
      if (recipients.length > 0 && failedCount === recipients.length) throw firstErr;
      console.info('[resend-webhook] complaint → unsubscribed + emailUndeliverable=true', {
        recipients: recipients.length,
        failed: failedCount,
      });
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
