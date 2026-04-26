import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TelegramBot, createTelegramBot } from '../telegram-bot';
import type { DailyDigestReport, FetchFn, TelegramApiResponse, TelegramMessage, TelegramUpdate } from '../telegram-bot';
import { mockAdMetric } from '../../__tests__/fixtures';

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

describe('TelegramBot.sendDailyDigest', () => {
  it('formats digest with date header, spend, impressions, and decisions', async () => {
    const fetchFn = makeFetchFn([sendMessageOk()]);
    const bot = makeBot(fetchFn);

    const metric = mockAdMetric();
    const report: DailyDigestReport = {
      date: '2026-04-26',
      decisions: [
        {
          ad_id: metric.ad_id,
          action: 'pause',
          reason: 'frequency_cap_exceeded: 4.5',
          reasoning_tier: 'tier_1_rules',
          confidence: 1.0,
          metrics_snapshot: metric,
        },
      ],
      spend_total_usd: 18.40,
      impressions_total: 5247,
    };

    await bot.sendDailyDigest(report);

    const [, init] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.text).toContain('2026-04-26');
    expect(body.text).toContain('$18.40');
    expect(body.text).toContain('5,247');
    expect(body.text).toContain('ad_test_001');
    expect(body.text).toContain('pause');
  });

  it('includes shadow log when provided', async () => {
    const fetchFn = makeFetchFn([sendMessageOk()]);
    const bot = makeBot(fetchFn);

    const report: DailyDigestReport = {
      date: '2026-04-26',
      decisions: [],
      spend_total_usd: 0,
      impressions_total: 0,
      shadow_log_summary: 'Would have paused 2 ads',
    };

    await bot.sendDailyDigest(report);

    const [, init] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.text).toContain('Would have paused 2 ads');
  });

  it('includes founder action when provided', async () => {
    const fetchFn = makeFetchFn([sendMessageOk()]);
    const bot = makeBot(fetchFn);

    const report: DailyDigestReport = {
      date: '2026-04-26',
      decisions: [],
      spend_total_usd: 0,
      impressions_total: 0,
      founder_action_required: 'Review campaign budget',
    };

    await bot.sendDailyDigest(report);

    const [, init] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.text).toContain('Review campaign budget');
    expect(body.text).toContain('Action required');
  });

  it('notes no decisions when decisions array is empty', async () => {
    const fetchFn = makeFetchFn([sendMessageOk()]);
    const bot = makeBot(fetchFn);

    const report: DailyDigestReport = {
      date: '2026-04-26',
      decisions: [],
      spend_total_usd: 0,
      impressions_total: 0,
    };

    await bot.sendDailyDigest(report);

    const [, init] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.text).toContain('No decisions taken today');
  });
});

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
    process.env.TELEGRAM_CHAT_ID = '123';

    expect(() => createTelegramBot()).toThrow('TELEGRAM_BOT_TOKEN');

    process.env.TELEGRAM_BOT_TOKEN = original;
  });

  it('throws when TELEGRAM_CHAT_ID is missing', () => {
    process.env.TELEGRAM_BOT_TOKEN = 'tok';
    const original = process.env.TELEGRAM_CHAT_ID;
    delete process.env.TELEGRAM_CHAT_ID;

    expect(() => createTelegramBot()).toThrow('TELEGRAM_CHAT_ID');

    if (original !== undefined) process.env.TELEGRAM_CHAT_ID = original;
    else delete process.env.TELEGRAM_CHAT_ID;
    delete process.env.TELEGRAM_BOT_TOKEN;
  });

  it('creates bot when both env vars are set', () => {
    process.env.TELEGRAM_BOT_TOKEN = 'mytoken';
    process.env.TELEGRAM_CHAT_ID = '456';

    const bot = createTelegramBot();
    expect(bot).toBeInstanceOf(TelegramBot);

    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
  });
});
