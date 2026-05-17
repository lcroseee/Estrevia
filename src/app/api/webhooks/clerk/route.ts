import { Webhook } from 'svix';
import { headers } from 'next/headers';
import type { WebhookEvent } from '@clerk/nextjs/server';
import { getDb } from '@/shared/lib/db';
import { users, natalCharts, emailLeads } from '@/shared/lib/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { trackServerEvent, AnalyticsEvent } from '@/shared/lib/analytics';

/**
 * POST /api/webhooks/clerk
 *
 * Receives and verifies Clerk webhook events using svix signature verification.
 * Raw body must be used for verification — do NOT call req.json() before verify().
 *
 * Events handled:
 *   user.created  → insert row into `users` table (with locale from unsafe_metadata),
 *                   then send welcome email (best-effort, idempotent via sent_emails)
 *   user.updated  → update email in `users` table
 *   user.deleted  → send account deletion email BEFORE cascade delete
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
    // Log only the error message — never the raw err (which may include headers / body).
    console.error(
      '[clerk-webhook] Signature verification failed',
      err instanceof Error ? err.message : 'unknown',
    );
    try {
      const { captureException } = await import('@sentry/nextjs');
      captureException(err, { tags: { webhook: 'clerk' } });
    } catch {
      // Sentry capture is best-effort; do not mask the original 401.
    }
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
      const emailDomain = email.includes('@') ? email.split('@')[1] : null;
      // Defensive cast — unsafe_metadata is typed as unknown by Clerk
      const locale =
        (data.unsafe_metadata as Record<string, unknown> | null)?.locale === 'es'
          ? 'es' as const
          : 'en' as const;

      await db
        .insert(users)
        .values({
          id: data.id,
          email,
          locale,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoNothing(); // idempotent — safe to retry

      console.info('[clerk-webhook] user.created', { userId: data.id });

      // T10: Lead conversion linking. If this Clerk email matches an existing
      // email_leads row, mark it converted so the lead-nurture cron sweep stops
      // sending further drip emails to a now-registered user. Also enables
      // lead→sub attribution via email_leads → users → subscriptions join.
      // Match is lowercase (leads are stored normalized). Only touch rows that
      // are not yet converted (idempotent on Clerk webhook retries).
      // Non-blocking: failure must not 500 the webhook — Clerk would retry
      // and duplicate the user insert. Skip when email is empty (can't match).
      if (email) {
        try {
          await db
            .update(emailLeads)
            .set({
              convertedToUserId: data.id,
              convertedAt: new Date(),
            })
            .where(
              and(
                eq(emailLeads.email, email.toLowerCase()),
                isNull(emailLeads.convertedToUserId),
              ),
            );
        } catch (leadErr) {
          // PII-safe log — never include the email address.
          console.error('[clerk-webhook] lead conversion link failed (non-fatal)', {
            userId: data.id,
            message: leadErr instanceof Error ? leadErr.message : 'unknown',
          });
          try {
            const { captureException } = await import('@sentry/nextjs');
            captureException(leadErr, {
              tags: { webhook: 'clerk', op: 'lead_conversion_link' },
            });
          } catch {
            // Sentry capture is best-effort.
          }
        }
      }

      // Fire user_registered to PostHog so the advertising agent's funnel
      // reconciler can compare this against Meta clicks. Idempotency comes
      // from PostHog's $insert_id dedup — same event from a Clerk retry
      // collapses server-side. Wrapped in try/catch: PostHog being down must
      // never escalate to a 500 (Clerk would retry → duplicate users).
      //
      // T18 (v3b): trackServerEvent ALSO fires Meta CAPI Lead via T11's
      // analytics extension. The `email` is hashed at the CAPI boundary
      // (meta-capi/index.ts:hashPII) — never leaves this process plaintext.
      // The `$insert_id` is reused as the CAPI event_id, deduping with the
      // browser-side fbq Lead event using the same id.
      try {
        trackServerEvent(data.id, AnalyticsEvent.USER_REGISTERED, {
          source: 'clerk_webhook',
          email_domain: emailDomain,
          email: email || undefined, // for CAPI hashing in T11 wrapper (Custom Audience match)
          $insert_id: `${data.id}:user_registered`,
        });
      } catch (phErr) {
        console.warn(
          '[clerk-webhook] PostHog user_registered fire failed (non-fatal)',
          phErr instanceof Error ? phErr.message : 'unknown',
        );
        try {
          const { captureException } = await import('@sentry/nextjs');
          captureException(phErr, {
            tags: { webhook: 'clerk', posthog: 'degraded' },
          });
        } catch {
          // Sentry capture is best-effort.
        }
      }

      // Welcome email — best-effort; idempotent via sent_emails UNIQUE index.
      // Dynamic import keeps cold-start path minimal. Email failure must not
      // fail the webhook — Clerk would retry and create a duplicate user.
      try {
        const { sendWelcomeEmail } = await import('@/shared/lib/email');
        // Check if the user already has a saved natal chart (edge case:
        // chart was created before account, e.g. via anonymous flow).
        const charts = await db
          .select({ id: natalCharts.id })
          .from(natalCharts)
          .where(and(eq(natalCharts.userId, data.id), eq(natalCharts.status, 'saved')))
          .limit(1);
        await sendWelcomeEmail({
          userId: data.id,
          email,
          locale,
          hasSavedChart: charts.length > 0,
        });
      } catch (emailErr) {
        console.error(
          '[clerk-webhook] welcome email failed (non-fatal)',
          emailErr instanceof Error ? emailErr.message : 'unknown',
        );
        try {
          const { captureException } = await import('@sentry/nextjs');
          captureException(emailErr, {
            tags: { webhook: 'clerk', email_type: 'welcome' },
          });
        } catch {
          // Sentry capture is best-effort.
        }
      }
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
        // Read email + locale BEFORE cascade delete — once the row is gone
        // we cannot send the goodbye email.
        const userRows = await db
          .select({ email: users.email, locale: users.locale })
          .from(users)
          .where(eq(users.id, data.id))
          .limit(1);

        if (userRows.length > 0) {
          const { email, locale } = userRows[0];
          try {
            const { sendAccountDeletionEmail } = await import('@/shared/lib/email');
            await sendAccountDeletionEmail({ userId: data.id, email, locale });
          } catch (emailErr) {
            // Best-effort — do not block the deletion if email fails.
            console.error(
              '[clerk-webhook] account_deletion email failed (non-fatal)',
              emailErr instanceof Error ? emailErr.message : 'unknown',
            );
            try {
              const { captureException } = await import('@sentry/nextjs');
              captureException(emailErr, {
                tags: { webhook: 'clerk', email_type: 'account_deletion' },
              });
            } catch {
              // Sentry capture is best-effort.
            }
          }
        }

        await db.delete(users).where(eq(users.id, data.id));
        console.info('[clerk-webhook] user.deleted', { userId: data.id });
      }
    }
  } catch (err) {
    // Never log the raw err — it may serialize the Clerk event payload (emails, names).
    console.error('[clerk-webhook] DB operation failed', {
      eventType,
      message: err instanceof Error ? err.message : 'unknown',
      name: err instanceof Error ? err.name : undefined,
    });
    try {
      const { captureException } = await import('@sentry/nextjs');
      captureException(err, { tags: { webhook: 'clerk', eventType } });
    } catch {
      // Sentry capture is best-effort; do not mask the 500 we return to Clerk.
    }
    return Response.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to process webhook' },
      { status: 500 },
    );
  }

  return Response.json({ received: true }, { status: 200 });
}
