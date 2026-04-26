import { describe, it, expect, vi } from 'vitest';
import { sendWeeklyAccountHealthReminder, ACCOUNT_HEALTH_MESSAGE } from '../weekly-account-health';
import type { TelegramBot } from '../telegram-bot';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockTelegram(message_id = 42): TelegramBot {
  return {
    sendAlert: vi.fn().mockResolvedValue({ message_id, text: 'ok' }),
    sendMessage: vi.fn().mockResolvedValue({ message_id, text: 'ok' }),
    sendDailyDigest: vi.fn().mockResolvedValue({ message_id, text: 'ok' }),
    requestApproval: vi.fn().mockResolvedValue({ approved: true }),
  } as unknown as TelegramBot;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('sendWeeklyAccountHealthReminder', () => {
  it('sends an info alert via Telegram', async () => {
    const telegram = makeMockTelegram();
    const result = await sendWeeklyAccountHealthReminder({ telegram });

    expect(telegram.sendAlert).toHaveBeenCalledOnce();
    const [severity] = (telegram.sendAlert as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(severity).toBe('info');
  });

  it('includes Meta Business Manager mention in the message', async () => {
    const telegram = makeMockTelegram();
    await sendWeeklyAccountHealthReminder({ telegram });

    const [, message] = (telegram.sendAlert as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(message).toContain('Meta Business Manager');
    expect(message).toContain('Account Quality');
  });

  it('returns sent=true with the message_id from Telegram', async () => {
    const telegram = makeMockTelegram(99);
    const result = await sendWeeklyAccountHealthReminder({ telegram });

    expect(result.sent).toBe(true);
    expect(result.message_id).toBe(99);
  });

  it('returns a valid ISO 8601 sent_at timestamp', async () => {
    const telegram = makeMockTelegram();
    const result = await sendWeeklyAccountHealthReminder({ telegram });

    expect(() => new Date(result.sent_at)).not.toThrow();
    expect(new Date(result.sent_at).getTime()).not.toBeNaN();
  });

  it('calls injected logFn with a log message containing message_id', async () => {
    const telegram = makeMockTelegram(77);
    const logFn = vi.fn();

    await sendWeeklyAccountHealthReminder({ telegram, logFn });

    expect(logFn).toHaveBeenCalledOnce();
    const logMsg = (logFn as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(logMsg).toContain('77');
    expect(logMsg).toContain('weekly-account-health');
  });

  it('works without an injected logFn (optional)', async () => {
    const telegram = makeMockTelegram();
    // Should not throw when logFn is absent
    await expect(sendWeeklyAccountHealthReminder({ telegram })).resolves.not.toThrow();
  });

  it('ACCOUNT_HEALTH_MESSAGE contains all checklist items', () => {
    expect(ACCOUNT_HEALTH_MESSAGE).toContain('Account Quality');
    expect(ACCOUNT_HEALTH_MESSAGE).toContain('Payment method');
    expect(ACCOUNT_HEALTH_MESSAGE).toContain('Ad account spending limit');
    expect(ACCOUNT_HEALTH_MESSAGE).toContain('disapproved ads');
  });
});
