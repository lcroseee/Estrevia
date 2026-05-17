import 'server-only';
import { getDb } from './db';
import { sentLeadEmails } from './schema';

type LeadEmailType = typeof sentLeadEmails.$inferInsert['emailType'];

/**
 * Inserts a one-shot dedup row for lead nurture emails.
 * Returns true if inserted, false on UNIQUE conflict (caller must skip send).
 *
 * Mirrors sent-emails.ts:tryInsertOneShot but for anonymous leads (no userId FK).
 * All three lead email types are one-shot per lead — there is no repeatable
 * nurture send (drip terminates at step=3).
 */
export async function tryInsertOneShotLead(
  leadId: string,
  emailType: LeadEmailType,
): Promise<boolean> {
  const db = getDb();
  const inserted = await db
    .insert(sentLeadEmails)
    .values({ leadId, emailType })
    .onConflictDoNothing()
    .returning();
  return inserted.length > 0;
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
  // Update the row inserted by tryInsertOneShotLead.
  await db
    .update(sentLeadEmails)
    .set({ resendMessageId })
    .where(
      // Inline import to avoid circular dep with drizzle-orm at module level
      (await import('drizzle-orm')).and(
        (await import('drizzle-orm')).eq(sentLeadEmails.leadId, leadId),
        (await import('drizzle-orm')).eq(sentLeadEmails.emailType, emailType),
      ),
    );
}
