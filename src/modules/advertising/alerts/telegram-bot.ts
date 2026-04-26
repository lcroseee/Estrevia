/**
 * Telegram Bot wrapper for the advertising agent.
 *
 * Wraps the Telegram Bot API for sending alerts, daily digests, and approval
 * requests to the founder. All HTTP calls go through an injected fetch client
 * so tests never hit the real Telegram API.
 *
 * Environment variables required:
 *   TELEGRAM_BOT_TOKEN  — bot token from BotFather
 *   TELEGRAM_CHAT_ID    — founder's chat ID (or group chat ID)
 *
 * Approval flow:
 *   LOW_RISK  — auto-approves after AUTO_APPROVE_TIMEOUT_MS (default 4h) if no response
 *   HIGH_RISK — blocks indefinitely until founder responds
 */

import type { AdDecision, BrandVoiceScore } from '@/shared/types/advertising';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AlertSeverity = 'info' | 'warning' | 'critical';

export type ApprovalRisk = 'LOW_RISK' | 'HIGH_RISK';

export interface ApprovalOption {
  label: string;
  value: string;
}

export interface ApprovalResult {
  approved: boolean;
  chosen_value?: string;
  timed_out?: boolean;
}

export interface TelegramMessage {
  message_id: number;
  text: string;
}

export interface DailyDigestReport {
  date: string; // YYYY-MM-DD
  decisions: AdDecision[];
  brand_voice_scores?: BrandVoiceScore[];
  shadow_log_summary?: string;
  spend_total_usd: number;
  impressions_total: number;
  founder_action_required?: string;
}

export interface TelegramApiResponse<T> {
  ok: boolean;
  result: T;
}

export interface TelegramUpdate {
  update_id: number;
  callback_query?: {
    id: string;
    from: { id: number };
    message: { message_id: number };
    data?: string;
  };
}

// ---------------------------------------------------------------------------
// Fetch client type (injected for testability)
// ---------------------------------------------------------------------------

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

// ---------------------------------------------------------------------------
// Internal config
// ---------------------------------------------------------------------------

const AUTO_APPROVE_TIMEOUT_MS = 4 * 60 * 60 * 1000; // 4 hours
const POLL_INTERVAL_MS = 5_000; // 5 seconds
const TELEGRAM_API_BASE = 'https://api.telegram.org';

// ---------------------------------------------------------------------------
// Main class
// ---------------------------------------------------------------------------

export class TelegramBot {
  private readonly token: string;
  private readonly chatId: string;
  private readonly fetchFn: FetchFn;
  private readonly autoApproveTimeoutMs: number;

  constructor(opts: {
    token: string;
    chatId: string;
    fetchFn?: FetchFn;
    autoApproveTimeoutMs?: number;
  }) {
    this.token = opts.token;
    this.chatId = opts.chatId;
    this.fetchFn = opts.fetchFn ?? fetch;
    this.autoApproveTimeoutMs = opts.autoApproveTimeoutMs ?? AUTO_APPROVE_TIMEOUT_MS;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Sends a formatted daily digest to the founder.
   * Format: date header + decisions summary + spend + optional shadow log + action item
   */
  async sendDailyDigest(report: DailyDigestReport): Promise<TelegramMessage> {
    const lines: string[] = [];

    lines.push(`📊 *Advertising Daily Digest — ${report.date}*`);
    lines.push('');

    // Spend + impressions overview
    lines.push(`💰 Spend: $${report.spend_total_usd.toFixed(2)} | 👁 Impressions: ${report.impressions_total.toLocaleString()}`);
    lines.push('');

    // Decisions summary
    if (report.decisions.length > 0) {
      lines.push('*Decisions taken:*');
      for (const d of report.decisions) {
        const icon = d.action === 'pause' ? '⏸' : d.action === 'scale_up' ? '📈' : d.action === 'maintain' ? '✅' : '→';
        lines.push(`${icon} \`${d.ad_id}\` — ${d.action} (${d.reason})`);
      }
      lines.push('');
    } else {
      lines.push('_No decisions taken today._');
      lines.push('');
    }

    // Brand voice scores if provided
    if (report.brand_voice_scores && report.brand_voice_scores.length > 0) {
      const needsReview = report.brand_voice_scores.filter((s) => s.needs_review);
      if (needsReview.length > 0) {
        lines.push(`⚠️ *Brand voice review needed:* ${needsReview.map((s) => s.ad_id).join(', ')}`);
        lines.push('');
      }
    }

    // Shadow log summary
    if (report.shadow_log_summary) {
      lines.push('*Shadow mode log:*');
      lines.push(report.shadow_log_summary);
      lines.push('');
    }

    // Founder action required
    if (report.founder_action_required) {
      lines.push(`🚨 *Action required:* ${report.founder_action_required}`);
    }

    const text = lines.join('\n');
    return this.sendMessage(text, { parse_mode: 'Markdown' });
  }

  /**
   * Sends a severity-labelled alert message to the founder.
   */
  async sendAlert(severity: AlertSeverity, message: string): Promise<TelegramMessage> {
    const icons: Record<AlertSeverity, string> = {
      info: 'ℹ️',
      warning: '⚠️',
      critical: '🚨',
    };
    const text = `${icons[severity]} *[${severity.toUpperCase()}]* ${message}`;
    return this.sendMessage(text, { parse_mode: 'Markdown' });
  }

  /**
   * Sends an inline-keyboard approval request.
   *
   * LOW_RISK: resolves on first button press; auto-approves after autoApproveTimeoutMs.
   * HIGH_RISK: resolves only when founder presses a button (no timeout).
   */
  async requestApproval(
    question: string,
    options: ApprovalOption[],
    risk: ApprovalRisk = 'LOW_RISK',
  ): Promise<ApprovalResult> {
    const inlineKeyboard = options.map((opt) => [
      { text: opt.label, callback_data: opt.value },
    ]);

    const msg = await this.sendMessage(question, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: inlineKeyboard,
      },
    });

    return this.waitForCallbackQuery(msg.message_id, risk);
  }

  /**
   * Sends a plain or Markdown message to the configured chat.
   * This is the low-level method used by all higher-level methods above.
   */
  async sendMessage(
    text: string,
    extra: Record<string, unknown> = {},
  ): Promise<TelegramMessage> {
    const url = `${TELEGRAM_API_BASE}/bot${this.token}/sendMessage`;
    const body = {
      chat_id: this.chatId,
      text,
      ...extra,
    };

    const res = await this.fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => 'unknown');
      throw new Error(`Telegram sendMessage failed: ${res.status} ${errText}`);
    }

    const json = (await res.json()) as TelegramApiResponse<TelegramMessage>;
    if (!json.ok) {
      throw new Error(`Telegram API error: ${JSON.stringify(json)}`);
    }

    return json.result;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Polls getUpdates until a callback_query for the given message_id is received.
   * Returns the chosen option value. For LOW_RISK, auto-approves after timeout.
   */
  private async waitForCallbackQuery(
    messageId: number,
    risk: ApprovalRisk,
  ): Promise<ApprovalResult> {
    const deadline = risk === 'LOW_RISK'
      ? Date.now() + this.autoApproveTimeoutMs
      : Infinity;

    let offset = 0;

    while (true) {
      // Check deadline before fetching updates
      const now = Date.now();
      if (now >= deadline) {
        // AUTO-APPROVE for LOW_RISK after timeout
        console.warn(
          `[telegram-bot] requestApproval timed out for msg ${messageId} — auto-approving (LOW_RISK)`,
        );
        return { approved: true, timed_out: true };
      }

      const updates = await this.getUpdates(offset);

      for (const update of updates) {
        offset = Math.max(offset, update.update_id + 1);

        const cq = update.callback_query;
        if (!cq) continue;
        if (cq.message.message_id !== messageId) continue;

        // Acknowledge the callback_query
        await this.answerCallbackQuery(cq.id).catch(() => undefined);

        const value = cq.data ?? '';
        return { approved: true, chosen_value: value };
      }

      // Sleep until next poll — capped to remaining time before deadline to avoid
      // sleeping past the deadline (critical for testability with short timeouts)
      const remaining = deadline - Date.now();
      const sleepMs = Math.min(POLL_INTERVAL_MS, remaining > 0 ? remaining : 0);
      if (sleepMs <= 0) continue; // deadline reached — re-check at top of loop
      await new Promise<void>((resolve) => setTimeout(resolve, sleepMs));
    }
  }

  private async getUpdates(offset: number): Promise<TelegramUpdate[]> {
    const url = `${TELEGRAM_API_BASE}/bot${this.token}/getUpdates?offset=${offset}&timeout=3`;
    const res = await this.fetchFn(url);

    if (!res.ok) {
      // Non-critical — swallow and return empty so polling continues
      console.error(`[telegram-bot] getUpdates failed: ${res.status}`);
      return [];
    }

    const json = (await res.json()) as TelegramApiResponse<TelegramUpdate[]>;
    return json.ok ? json.result : [];
  }

  private async answerCallbackQuery(callbackQueryId: string): Promise<void> {
    const url = `${TELEGRAM_API_BASE}/bot${this.token}/answerCallbackQuery`;
    await this.fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId }),
    });
  }
}

// ---------------------------------------------------------------------------
// Factory function — reads env vars
// ---------------------------------------------------------------------------

/**
 * Creates a TelegramBot instance from environment variables.
 * Throws if TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID are not set.
 */
export function createTelegramBot(opts?: { fetchFn?: FetchFn; autoApproveTimeoutMs?: number }): TelegramBot {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token) throw new Error('[telegram-bot] TELEGRAM_BOT_TOKEN is not set');
  if (!chatId) throw new Error('[telegram-bot] TELEGRAM_CHAT_ID is not set');

  return new TelegramBot({
    token,
    chatId,
    fetchFn: opts?.fetchFn,
    autoApproveTimeoutMs: opts?.autoApproveTimeoutMs,
  });
}
