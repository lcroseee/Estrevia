import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TelegramBot, createTelegramBot } from '../telegram-bot';
import type { DailyDigestReport, FetchFn, TelegramApiResponse, TelegramMessage, TelegramUpdate } from '../telegram-bot';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFetchFn(
  responses: Array<{ ok: boolean; body: unknown }>,
): FetchFn {
  let idx = 0;
  return vi.fn().mockImplementation(() => {
    const resp = responses[idx++] ?? responses[responses.length - 1];
    return Promise.resolve({
      ok: resp.ok,
      text: () => Promise.resolve(JSON.stringify(resp.body)),
      json: () => Promise.resolve(resp.body),
      status: resp.ok ? 200 : 400,
    } as Response);
  });
}

function sendMessageOk(message_id = 42): { ok: boolean; body: TelegramApiResponse<TelegramMessage> } {
  return {
    ok: true,
    body: { ok: true, result: { message_id, text: 'ok' } },
  };
}

function makeBot(fetchFn: FetchFn, autoApproveTimeoutMs = 100): TelegramBot {
  return new TelegramBot({
    token: 'test-token',
    chatId: '999',
    fetchFn,
    autoApproveTimeoutMs,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TelegramBot.sendMessage', () => {
  it('sends POST to Telegram API with correct body', async () => {
    const fetchFn = makeFetchFn([sendMessageOk()]);
    const bot = makeBot(fetchFn);

    const result = await bot.sendMessage('Hello world');

    expect(result.message_id).toBe(42);
    expect(fetchFn).toHaveBeenCalledOnce();

    const [url, init] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/bottest-token/sendMessage');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ chat_id: '999', text: 'Hello world' });
  });

  it('throws when HTTP response is not ok', async () => {
    const fetchFn = makeFetchFn([{ ok: false, body: 'Bad Request' }]);
    const bot = makeBot(fetchFn);

    await expect(bot.sendMessage('fail')).rejects.toThrow('Telegram sendMessage failed');
  });

  it('throws when Telegram ok=false', async () => {
    const fetchFn = makeFetchFn([
      { ok: true, body: { ok: false, description: 'chat not found' } },
    ]);
    const bot = makeBot(fetchFn);

    await expect(bot.sendMessage('fail')).rejects.toThrow('Telegram API error');
  });
});

describe('TelegramBot.sendAlert', () => {
  it('prefixes info severity with ℹ️ tag', async () => {
    const fetchFn = makeFetchFn([sendMessageOk()]);
    const bot = makeBot(fetchFn);

    await bot.sendAlert('info', 'all good');

    const [, init] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.text).toContain('[INFO]');
    expect(body.text).toContain('all good');
  });

  it('prefixes warning severity with ⚠️ tag', async () => {
    const fetchFn = makeFetchFn([sendMessageOk()]);
    const bot = makeBot(fetchFn);

    await bot.sendAlert('warning', 'check this');

    const [, init] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.text).toContain('[WARNING]');
  });

  it('prefixes critical severity with 🚨 tag', async () => {
    const fetchFn = makeFetchFn([sendMessageOk()]);
    const bot = makeBot(fetchFn);

    await bot.sendAlert('critical', 'URGENT');

    const [, init] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.text).toContain('[CRITICAL]');
    expect(body.text).toContain('URGENT');
  });
});

// NOTE: Pre-refactor `TelegramBot.sendDailyDigest` inline-rendering tests
// were removed in Commit B of Sub-project 2 (Cowork visibility apply).
// Their behavioral coverage moved to `digest-renderers.test.ts` because the
// rendering logic moved to `digest-renderers.ts`. The bot's delegation
// contract is covered by the new `TelegramBot.sendDailyDigest (refactored)`
// describe block at the bottom of this file. See
// `.cowork-meta/cowork-visibility-apply-20260511T005122Z/01-plan-deviation.md`
// for the deviation note.

describe('TelegramBot.requestApproval — LOW_RISK auto-approve timeout', () => {
  it('auto-approves with timed_out=true when no callback received within timeout', async () => {
    // First call: sendMessage → returns message_id 7
    // Subsequent calls: getUpdates → returns empty updates
    let callCount = 0;
    const fetchFn = vi.fn().mockImplementation((url: string) => {
      callCount++;
      if (url.includes('sendMessage')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve<TelegramApiResponse<TelegramMessage>>({
              ok: true,
              result: { message_id: 7, text: 'approve?' },
            }),
          text: () => Promise.resolve(''),
          status: 200,
        } as Response);
      }
      // getUpdates — always empty
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve<TelegramApiResponse<TelegramUpdate[]>>({
            ok: true,
            result: [],
          }),
        text: () => Promise.resolve(''),
        status: 200,
      } as Response);
    });

    // Set very short timeout (100ms)
    const bot = makeBot(fetchFn, 100);

    const result = await bot.requestApproval(
      'Approve?',
      [{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }],
      'LOW_RISK',
    );

    expect(result.approved).toBe(true);
    expect(result.timed_out).toBe(true);
  });

  it('resolves immediately when callback_query matches message_id', async () => {
    const messageId = 55;

    let callCount = 0;
    const fetchFn = vi.fn().mockImplementation((url: string) => {
      if (url.includes('sendMessage')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve<TelegramApiResponse<TelegramMessage>>({
              ok: true,
              result: { message_id: messageId, text: 'approve?' },
            }),
          text: () => Promise.resolve(''),
          status: 200,
        } as Response);
      }

      if (url.includes('answerCallbackQuery')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ok: true, result: true }),
          text: () => Promise.resolve(''),
          status: 200,
        } as Response);
      }

      // getUpdates — return a matching callback_query on first call
      callCount++;
      const updates: TelegramUpdate[] =
        callCount === 1
          ? [
              {
                update_id: 1,
                callback_query: {
                  id: 'cq1',
                  from: { id: 999 },
                  message: { message_id: messageId },
                  data: 'yes',
                },
              },
            ]
          : [];

      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve<TelegramApiResponse<TelegramUpdate[]>>({
            ok: true,
            result: updates,
          }),
        text: () => Promise.resolve(''),
        status: 200,
      } as Response);
    });

    const bot = makeBot(fetchFn, 10_000);

    const result = await bot.requestApproval(
      'Approve?',
      [{ label: 'Yes', value: 'yes' }],
      'LOW_RISK',
    );

    expect(result.approved).toBe(true);
    expect(result.chosen_value).toBe('yes');
    expect(result.timed_out).toBeUndefined();
  });

  it('ignores callback_query for a different message_id', async () => {
    const correctMessageId = 55;
    const wrongMessageId = 99;

    let getUpdatesCount = 0;
    const fetchFn = vi.fn().mockImplementation((url: string) => {
      if (url.includes('sendMessage')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve<TelegramApiResponse<TelegramMessage>>({
              ok: true,
              result: { message_id: correctMessageId, text: 'approve?' },
            }),
          text: () => Promise.resolve(''),
          status: 200,
        } as Response);
      }

      if (url.includes('answerCallbackQuery')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ok: true, result: true }),
          text: () => Promise.resolve(''),
          status: 200,
        } as Response);
      }

      getUpdatesCount++;
      // First call: return a callback for wrong message_id; subsequent: empty
      const updates: TelegramUpdate[] =
        getUpdatesCount === 1
          ? [
              {
                update_id: 1,
                callback_query: {
                  id: 'cq_wrong',
                  from: { id: 999 },
                  message: { message_id: wrongMessageId },
                  data: 'no',
                },
              },
            ]
          : [];

      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve<TelegramApiResponse<TelegramUpdate[]>>({
            ok: true,
            result: updates,
          }),
        text: () => Promise.resolve(''),
        status: 200,
      } as Response);
    });

    // Short timeout so test doesn't hang
    const bot = makeBot(fetchFn, 200);
    const result = await bot.requestApproval('Approve?', [{ label: 'Yes', value: 'yes' }], 'LOW_RISK');

    // Should time out since wrong message_id was ignored
    expect(result.timed_out).toBe(true);
  });
});

describe('createTelegramBot', () => {
  it('throws when TELEGRAM_BOT_TOKEN is missing', () => {
    const original = process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_BOT_TOKEN;
    process.env.TELEGRAM_FOUNDER_CHAT_ID = '123';

    expect(() => createTelegramBot()).toThrow('TELEGRAM_BOT_TOKEN');

    process.env.TELEGRAM_BOT_TOKEN = original;
  });

  it('throws when TELEGRAM_FOUNDER_CHAT_ID is missing', () => {
    process.env.TELEGRAM_BOT_TOKEN = 'tok';
    const original = process.env.TELEGRAM_FOUNDER_CHAT_ID;
    delete process.env.TELEGRAM_FOUNDER_CHAT_ID;

    expect(() => createTelegramBot()).toThrow('TELEGRAM_FOUNDER_CHAT_ID');

    if (original !== undefined) process.env.TELEGRAM_FOUNDER_CHAT_ID = original;
    else delete process.env.TELEGRAM_FOUNDER_CHAT_ID;
    delete process.env.TELEGRAM_BOT_TOKEN;
  });

  it('creates bot when both env vars are set', () => {
    process.env.TELEGRAM_BOT_TOKEN = 'mytoken';
    process.env.TELEGRAM_FOUNDER_CHAT_ID = '456';

    const bot = createTelegramBot();
    expect(bot).toBeInstanceOf(TelegramBot);

    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_FOUNDER_CHAT_ID;
  });
});

// ---------------------------------------------------------------------------
// sendDailyDigest after refactor — uses buildDigestData + formatTelegram
// ---------------------------------------------------------------------------

import { buildDigestData as _buildDigestDataReal } from '../digest-builder';
import { formatTelegram as _formatTelegramReal } from '../digest-renderers';

vi.mock('../digest-builder', () => ({
  buildDigestData: vi.fn(),
}));

vi.mock('../digest-renderers', () => ({
  formatTelegram: vi.fn(),
}));

describe('TelegramBot.sendDailyDigest (refactored)', () => {
  const builderMock = vi.mocked(_buildDigestDataReal);
  const formatMock = vi.mocked(_formatTelegramReal);

  beforeEach(() => {
    builderMock.mockReset();
    formatMock.mockReset();
  });

  it('with no arg, calls buildDigestData() then formatTelegram()', async () => {
    const fakeReport: DailyDigestReport = { date: '2026-05-10', decisions: [], spend_total_usd: 0, impressions_total: 0 };
    builderMock.mockResolvedValueOnce(fakeReport);
    formatMock.mockReturnValueOnce('rendered text');

    const fetchFn = makeFetchFn([sendMessageOk()]);
    const bot = makeBot(fetchFn);
    await bot.sendDailyDigest();

    expect(builderMock).toHaveBeenCalledTimes(1);
    expect(formatMock).toHaveBeenCalledWith(fakeReport);
  });

  it('with explicit report arg, bypasses buildDigestData()', async () => {
    const fakeReport: DailyDigestReport = { date: '2026-05-10', decisions: [], spend_total_usd: 0, impressions_total: 0 };
    formatMock.mockReturnValueOnce('rendered text');

    const fetchFn = makeFetchFn([sendMessageOk()]);
    const bot = makeBot(fetchFn);
    await bot.sendDailyDigest(fakeReport);

    expect(builderMock).not.toHaveBeenCalled();
    expect(formatMock).toHaveBeenCalledWith(fakeReport);
  });

  it('passes formatted text to sendMessage with Markdown parse_mode', async () => {
    formatMock.mockReturnValueOnce('rendered text');
    const fetchFn = makeFetchFn([sendMessageOk()]);
    const bot = makeBot(fetchFn);
    await bot.sendDailyDigest({ date: '2026-05-10', decisions: [], spend_total_usd: 0, impressions_total: 0 });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    // The body sent to Telegram includes the parse_mode and the rendered text.
    const lastCall = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(lastCall[1].body as string);
    expect(body.parse_mode).toBe('Markdown');
    expect(body.text).toBe('rendered text');
  });
});

// ---------------------------------------------------------------------------
// sendAlert tier classification (Patch 04 Component 4)
// ---------------------------------------------------------------------------

describe('TelegramBot.sendAlert tier gating', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('two-arg call defaults to tier 1 and always sends regardless of flag', async () => {
    process.env.ADVERTISING_TIER2_VIA_DIGEST = 'true'; // even with flag on
    const fetchFn = makeFetchFn([sendMessageOk()]);
    const bot = makeBot(fetchFn);
    const result = await bot.sendAlert('warning', 'rolling baseline crossed');
    expect(result).not.toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('three-arg with tier=2 returns null when ADVERTISING_TIER2_VIA_DIGEST=true', async () => {
    process.env.ADVERTISING_TIER2_VIA_DIGEST = 'true';
    const fetchFn = makeFetchFn([sendMessageOk()]);
    const bot = makeBot(fetchFn);
    const result = await bot.sendAlert('info', 'minor drift', { tier: 2 });
    expect(result).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('three-arg with tier=2 sends when ADVERTISING_TIER2_VIA_DIGEST is unset or "false"', async () => {
    delete process.env.ADVERTISING_TIER2_VIA_DIGEST;
    const fetchFn = makeFetchFn([sendMessageOk()]);
    const bot = makeBot(fetchFn);
    const result = await bot.sendAlert('info', 'minor drift', { tier: 2 });
    expect(result).not.toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(1);

    process.env.ADVERTISING_TIER2_VIA_DIGEST = 'false';
    const fetchFn2 = makeFetchFn([sendMessageOk()]);
    const bot2 = makeBot(fetchFn2);
    const result2 = await bot2.sendAlert('info', 'minor drift', { tier: 2 });
    expect(result2).not.toBeNull();
    expect(fetchFn2).toHaveBeenCalledTimes(1);
  });
});
