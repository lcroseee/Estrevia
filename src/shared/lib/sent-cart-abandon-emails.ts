import 'server-only';
import { and, eq, gt } from 'drizzle-orm';
import { getDb } from './db';
import { sentCartAbandonEmails } from './schema';

/**
 * Checks whether this lead already received a cart-abandon email within the
 * last `windowDays` days. Default window = 90 days (quarterly frequency cap).
 *
 * Returns true  → skip send (already sent recently)
 * Returns false → eligible for send
 */
export async function hasCartAbandonSentRecently(
  leadId: string,
  windowDays = 90,
): Promise<boolean> {
  const db = getDb();
  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({ id: sentCartAbandonEmails.id })
    .from(sentCartAbandonEmails)
    .where(
      and(
        eq(sentCartAbandonEmails.leadId, leadId),
        gt(sentCartAbandonEmails.sentAt, cutoff),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

interface RecordMeta {
  posthogLastPaywallAt?: Date;
  checkoutClicks?: number;
}

/**
 * Records a cart-abandon send attempt. Called AFTER the Resend call,
 * regardless of whether we got a message ID (null = Resend rejected but
 * we still record the attempt to enforce frequency cap).
 */
export async function recordCartAbandonSent(
  leadId: string,
  resendMessageId: string | null,
  meta: RecordMeta,
): Promise<void> {
  const db = getDb();
  await db
    .insert(sentCartAbandonEmails)
    .values({
      leadId,
      resendMessageId,
      posthogLastPaywallAt: meta.posthogLastPaywallAt ?? null,
      checkoutClicks: meta.checkoutClicks ?? 0,
    })
    .returning();
  console.info('[sent-cart-abandon-emails] recorded', {
    leadId,
    resendMessageId,
    checkoutClicks: meta.checkoutClicks ?? 0,
  });
}
