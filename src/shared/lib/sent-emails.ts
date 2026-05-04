import 'server-only';
import { and, eq, gte } from 'drizzle-orm';
import { getDb } from './db';
import { sentEmails } from './schema';

type EmailType = typeof sentEmails.$inferInsert['emailType'];

/**
 * Inserts a one-shot dedup row. Returns true if inserted, false on UNIQUE conflict
 * (caller should skip sending in that case).
 *
 * Only valid for types covered by the partial UNIQUE index:
 *   'welcome', 'account_deletion'
 *
 * For repeatable types (re_engagement_28d, etc.) use wasSentWithin + recordSent.
 */
export async function tryInsertOneShot(
  userId: string,
  emailType: 'welcome' | 'account_deletion',
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
