/**
 * Weekly account health reminder for the advertising agent.
 *
 * Sends a Telegram message to the founder every Monday at 10:00 UTC asking
 * them to review Meta Business Manager → Account Quality. This is a manual
 * review prompt — the agent cannot programmatically check account quality
 * status on behalf of the founder.
 *
 * The Vercel cron at /api/cron/advertising/account-health-weekly calls
 * sendWeeklyAccountHealthReminder() which uses the DI-injected TelegramBot.
 */

import type { TelegramBot, TelegramMessage } from './telegram-bot';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ACCOUNT_HEALTH_MESSAGE = `
🏥 *Weekly Account Health Check*

Please review *Meta Business Manager → Account Quality* and flag any new issues here.

Checklist:
• Account Quality tab — any new restrictions or warnings?
• Payment method — valid and sufficient balance?
• Ad account spending limit — needs adjusting?
• Any disapproved ads this week?

Reply with a brief status update or ✅ if all clear.
`.trim();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AccountHealthReminderResult {
  sent: true;
  message_id: number;
  sent_at: string; // ISO 8601
}

export interface AccountHealthReminderDeps {
  telegram: TelegramBot;
  /** Injected for testability. Defaults to calling console.info. */
  logFn?: (msg: string) => void;
}

// ---------------------------------------------------------------------------
// Main exported function
// ---------------------------------------------------------------------------

/**
 * Sends the weekly Meta Business Manager account health reminder via Telegram.
 *
 * Called by the Monday 10:00 UTC cron job.
 * Logs that the reminder was sent (console.info + optional injected logger).
 */
export async function sendWeeklyAccountHealthReminder(
  deps: AccountHealthReminderDeps,
): Promise<AccountHealthReminderResult> {
  const { telegram, logFn } = deps;

  const message: TelegramMessage = await telegram.sendAlert(
    'info',
    ACCOUNT_HEALTH_MESSAGE,
  );

  const sentAt = new Date().toISOString();

  const logMessage = `[weekly-account-health] reminder sent at ${sentAt}, message_id=${message.message_id}`;
  console.info(logMessage);
  if (logFn) logFn(logMessage);

  return {
    sent: true,
    message_id: message.message_id,
    sent_at: sentAt,
  };
}

export { ACCOUNT_HEALTH_MESSAGE };
