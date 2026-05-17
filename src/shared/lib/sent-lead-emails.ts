import 'server-only';
import { and, eq } from 'drizzle-orm';
import { getDb } from './db';
import { sentLeadEmails } from './schema';

type LeadEmailType = typeof sentLeadEmails.$inferInsert['emailType'];

/**
 * Result of claiming a one-shot lead-email send slot.
 *
 *   - 'new'       — row was just inserted; this is the first attempt.
 *   - 'retry'     — row already exists but `resend_message_id` is NULL,
 *                   meaning a prior attempt claimed the slot but never
 *                   recorded a successful Resend message id. Safe to retry.
 *   - 'delivered' — row exists with `resend_message_id` populated, so the
 *                   email was successfully sent at least once. Skip send.
 *
 * Without the 'retry' classification, a Resend rejection after the initial
 * dedup-row insert would cement the lead at "already sent" forever, even
 * though no email reached the recipient.
 */
export type LeadEmailClaim = 'new' | 'retry' | 'delivered';

/**
 * Claims a one-shot send slot for a lead-nurture email.
 *
 * Mirrors sent-emails.ts:tryInsertOneShot but for anonymous leads (no userId FK).
 * All three lead email types are one-shot per lead — there is no repeatable
 * nurture send (drip terminates at step=3).
 *
 * On UNIQUE conflict we cross-check `resend_message_id`: if it's NULL the
 * caller should retry the actual Resend send (`recordSentLead` will populate
 * the id on success); if it's set the caller should treat as already-sent.
 */
export async function tryInsertOneShotLead(
  leadId: string,
  emailType: LeadEmailType,
): Promise<LeadEmailClaim> {
  const db = getDb();
  const inserted = await db
    .insert(sentLeadEmails)
    .values({ leadId, emailType })
    .onConflictDoNothing()
    .returning();
  if (inserted.length > 0) return 'new';

  // Conflict — distinguish "delivered" (msgid present) vs "retry" (msgid null,
  // prior send claimed the slot but never completed successfully).
  const existing = await db
    .select({ resendMessageId: sentLeadEmails.resendMessageId })
    .from(sentLeadEmails)
    .where(and(eq(sentLeadEmails.leadId, leadId), eq(sentLeadEmails.emailType, emailType)))
    .limit(1);
  return existing[0]?.resendMessageId ? 'delivered' : 'retry';
}

/**
 * Best-effort recording of the Resend message ID after a successful send.
 * Failures are intentionally swallowed — the dedup row from tryInsertOneShotLead
 * is already present; this is just metadata for audit/debugging.
 */
export async function recordSentLead(
  leadId: string,
  emailType: LeadEmailType,
  resendMessageId: string | null,
): Promise<void> {
  if (!resendMessageId) return;
  const db = getDb();
  await db
    .update(sentLeadEmails)
    .set({ resendMessageId })
    .where(
      and(
        eq(sentLeadEmails.leadId, leadId),
        eq(sentLeadEmails.emailType, emailType),
      ),
    );
}
