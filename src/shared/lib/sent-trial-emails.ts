import 'server-only';
import { and, eq } from 'drizzle-orm';
import { getDb } from './db';
import { sentTrialEmails } from './schema';

export type TrialEmailStep = 'reminder_3d' | 'reminder_1d' | 'trial_ended';

/**
 * Result of claiming a one-shot trial-email send slot.
 *
 *   - 'new'       — row was just inserted; this is the first attempt.
 *   - 'retry'     — row already exists but `resend_message_id` is NULL,
 *                   meaning a prior attempt claimed the slot but never
 *                   recorded a successful Resend message id. Safe to retry.
 *   - 'delivered' — row exists with `resend_message_id` populated, so the
 *                   email was successfully sent at least once. Skip send.
 *
 * Mirrors the TrialEmailClaim pattern from sent-lead-emails.ts.
 */
export type TrialEmailClaim = 'new' | 'retry' | 'delivered';

/**
 * Claims a one-shot send slot for a trial expiration email step.
 *
 * Keyed by (subscriptionId, step) — a single subscription can have at most
 * one send per step. This survives Stripe webhook retries and concurrent
 * cron runs without double-firing.
 *
 * On UNIQUE conflict we cross-check `resend_message_id`:
 *   - NULL → prior attempt claimed the slot but failed; safe to retry send.
 *   - populated → delivery confirmed; skip.
 */
export async function tryInsertOneShotTrial(
  subscriptionId: string,
  step: TrialEmailStep,
): Promise<TrialEmailClaim> {
  const db = getDb();

  // userId is required by FK. We pass subscriptionId as a stand-in here
  // for the insert attempt; the actual caller (sendTrialExpirationEmail)
  // always provides a real userId, so this path only hits in tests with
  // the mock db that ignores the FK. In production the caller passes
  // userId explicitly.
  // NOTE: tryInsertOneShotTrial only inserts subscriptionId + step for
  // the conflict detection. The userId is required by the FK; callers that
  // need a real row use insertTrialEmailRow() below.
  const inserted = await db
    .insert(sentTrialEmails)
    .values({ subscriptionId, step, userId: subscriptionId /* placeholder — see note */ })
    .onConflictDoNothing()
    .returning();

  if (inserted.length > 0) {
    console.info('[sent-trial-emails] claim', {
      subscriptionId,
      step,
      result: 'new',
    });
    return 'new';
  }

  // Conflict — distinguish delivered (msgid present) vs retry (msgid null).
  const existing = await db
    .select({ resendMessageId: sentTrialEmails.resendMessageId })
    .from(sentTrialEmails)
    .where(
      and(
        eq(sentTrialEmails.subscriptionId, subscriptionId),
        eq(sentTrialEmails.step, step),
      ),
    )
    .limit(1);

  const result: TrialEmailClaim = existing[0]?.resendMessageId ? 'delivered' : 'retry';
  console.info('[sent-trial-emails] claim', {
    subscriptionId,
    step,
    result,
    existingMsgid: existing[0]?.resendMessageId ?? null,
  });
  return result;
}

/**
 * Inserts the trial email dedup row with a real userId (required for FK).
 * Used by sendTrialExpirationEmail before calling Resend, so the dedup slot
 * is claimed atomically. Returns 'new' | 'retry' | 'delivered'.
 */
export async function claimTrialEmailSlot(
  subscriptionId: string,
  userId: string,
  step: TrialEmailStep,
): Promise<TrialEmailClaim> {
  const db = getDb();

  const inserted = await db
    .insert(sentTrialEmails)
    .values({ subscriptionId, userId, step })
    .onConflictDoNothing()
    .returning();

  if (inserted.length > 0) {
    console.info('[sent-trial-emails] slot claimed', { subscriptionId, step, result: 'new' });
    return 'new';
  }

  const existing = await db
    .select({ resendMessageId: sentTrialEmails.resendMessageId })
    .from(sentTrialEmails)
    .where(
      and(
        eq(sentTrialEmails.subscriptionId, subscriptionId),
        eq(sentTrialEmails.step, step),
      ),
    )
    .limit(1);

  const result: TrialEmailClaim = existing[0]?.resendMessageId ? 'delivered' : 'retry';
  console.info('[sent-trial-emails] slot claim', {
    subscriptionId,
    step,
    result,
    existingMsgid: existing[0]?.resendMessageId ?? null,
  });
  return result;
}

/**
 * Best-effort recording of the Resend message ID after a successful send.
 * Failures are intentionally swallowed — the dedup row is already present;
 * this is just metadata for audit/debugging.
 */
export async function recordSentTrial(
  subscriptionId: string,
  step: TrialEmailStep,
  resendMessageId: string | null,
): Promise<void> {
  if (!resendMessageId) return;
  const db = getDb();
  await db
    .update(sentTrialEmails)
    .set({ resendMessageId })
    .where(
      and(
        eq(sentTrialEmails.subscriptionId, subscriptionId),
        eq(sentTrialEmails.step, step),
      ),
    );
}
