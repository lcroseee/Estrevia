import 'server-only';
import { and, eq, gte } from 'drizzle-orm';
import { getDb } from './db';
import { sentEmails } from './schema';

type EmailType = typeof sentEmails.$inferInsert['emailType'];

/**
 * Inserts a one-shot dedup row. Returns true if inserted, false on UNIQUE conflict
 * (caller should skip sending in that case).
 *
 * account_deletion ONLY: that flow intentionally never records a message id
 * (the user row cascade-deletes right after the send), so the claim/update
 * pattern below would classify it as 'retry' forever and re-send on every
 * call. `welcome` uses tryInsertOneShotUser instead.
 *
 * For repeatable types (re_engagement_28d, etc.) use wasSentWithin + recordSent.
 */
export async function tryInsertOneShot(
  userId: string,
  emailType: 'account_deletion',
): Promise<boolean> {
  const db = getDb();
  const inserted = await db
    .insert(sentEmails)
    .values({ userId, emailType })
    .onConflictDoNothing()
    .returning();
  return inserted.length > 0;
}

export async function recordSent(
  userId: string,
  emailType: EmailType,
  resendMessageId: string | null,
): Promise<void> {
  const db = getDb();
  await db.insert(sentEmails).values({ userId, emailType, resendMessageId });
}

/**
 * Result of claiming the one-shot `welcome` send slot.
 * Mirrors sent-lead-emails.ts LeadEmailClaim — see that file for the full
 * rationale. Without 'retry', a Resend rejection after the dedup-row insert
 * cements the user at "already sent" forever with a NULL resend_message_id
 * (the exact false-positive the 2026-07-10 audit found on welcome rows).
 */
export type UserEmailClaim = 'new' | 'retry' | 'delivered';

/**
 * Claims the one-shot send slot for `welcome` (covered by the partial UNIQUE
 * index sent_emails_oneshot_idx). On conflict, cross-checks resend_message_id:
 * NULL → 'retry' (prior attempt claimed the slot but never delivered);
 * populated → 'delivered' (skip send).
 */
export async function tryInsertOneShotUser(
  userId: string,
  emailType: 'welcome',
): Promise<UserEmailClaim> {
  const db = getDb();
  const inserted = await db
    .insert(sentEmails)
    .values({ userId, emailType })
    .onConflictDoNothing()
    .returning();
  if (inserted.length > 0) return 'new';

  const existing = await db
    .select({ resendMessageId: sentEmails.resendMessageId })
    .from(sentEmails)
    .where(and(eq(sentEmails.userId, userId), eq(sentEmails.emailType, emailType)))
    .limit(1);
  return existing[0]?.resendMessageId ? 'delivered' : 'retry';
}

/**
 * Records the Resend message id on the row claimed by tryInsertOneShotUser.
 * UPDATEs in place — a second INSERT would collide with the one-shot partial
 * unique index (sent_emails_oneshot_idx) and raise 23505, which is why
 * successful welcome sends never carried a msgid before 2026-07-10.
 */
export async function recordSentUpdate(
  userId: string,
  emailType: 'welcome',
  resendMessageId: string | null,
): Promise<void> {
  if (!resendMessageId) return;
  const db = getDb();
  await db
    .update(sentEmails)
    .set({ resendMessageId })
    .where(and(eq(sentEmails.userId, userId), eq(sentEmails.emailType, emailType)));
}

/**
 * Returns true if at least one row exists with sent_at >= now() - intervalMs.
 */
export async function wasSentWithin(
  userId: string,
  emailType: EmailType,
  intervalMs: number,
): Promise<boolean> {
  const db = getDb();
  const cutoff = new Date(Date.now() - intervalMs);
  const rows = await db
    .select({ id: sentEmails.id })
    .from(sentEmails)
    .where(
      and(
        eq(sentEmails.userId, userId),
        eq(sentEmails.emailType, emailType),
        gte(sentEmails.sentAt, cutoff),
      ),
    )
    .limit(1);
  return rows.length > 0;
}
