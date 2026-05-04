import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CapiClient } from '../client';
import type { CapiEventPayload } from '../types';

const PAYLOAD: CapiEventPayload = {
  event_name: 'Lead',
  event_time: 1714867200,
  event_id: 'evt_abc',
  action_source: 'website',
  user_data: { em: 'hashed_email' },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CapiClient.sendEvent', () => {
  it('POSTs to /{pixelId}/events with the right URL and body shape', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ events_received: 1, fbtrace_id: 'trace_1' }),
    });
    const client = new CapiClient({
      pixelId: 'PIX_999',
      capiToken: 'TOK',
      graphApiVersion: 'v22.0',
      fetchImpl,
    });

    const result = await client.sendEvent(PAYLOAD);

    expect(result).toEqual({ events_received: 1, fbtrace_id: 'trace_1' });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const url = fetchImpl.mock.calls[0][0] as string;
    expect(url).toBe('https://graph.facebook.com/v22.0/PIX_999/events');
    const opts = fetchImpl.mock.calls[0][1] as { method: string; body: string; headers: Record<string, string> };
    expect(opts.method).toBe('POST');
    expect(opts.headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(opts.body);
    expect(body.access_token).toBe('TOK');
    expect(body.data).toEqual([PAYLOAD]);
  });

  it('includes test_event_code when configured', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ events_received: 1 }),
    });
    const client = new CapiClient({
      pixelId: 'PIX_999',
      capiToken: 'TOK',
      graphApiVersion: 'v22.0',
      testEventCode: 'TEST_42',
      fetchImpl,
    });

    await client.sendEvent(PAYLOAD);
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string);
    expect(body.test_event_code).toBe('TEST_42');
  });

  it('throws when Meta returns non-OK', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'Invalid pixel id',
    });
    const client = new CapiClient({
      pixelId: 'PIX_999',
      capiToken: 'TOK',
      graphApiVersion: 'v22.0',
      fetchImpl,
    });
    await expect(client.sendEvent(PAYLOAD)).rejects.toThrow(/CAPI sendEvent failed: 400/);
  });

  it('retries on rate-limit (429) up to maxRetries', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => 'rate limited' })
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => 'rate limited' })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ events_received: 1 }) });

    const client = new CapiClient({
      pixelId: 'PIX_999',
      capiToken: 'TOK',
      graphApiVersion: 'v22.0',
      fetchImpl,
      retryBaseMs: 1, // fast for tests
      maxRetries: 3,
    });

    const result = await client.sendEvent(PAYLOAD);
    expect(result.events_received).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('gives up after maxRetries on persistent 429', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 429, text: async () => 'rate limited' });
    const client = new CapiClient({
      pixelId: 'PIX_999',
      capiToken: 'TOK',
      graphApiVersion: 'v22.0',
      fetchImpl,
      retryBaseMs: 1,
      maxRetries: 2,
    });
    await expect(client.sendEvent(PAYLOAD)).rejects.toThrow(/CAPI sendEvent failed: 429/);
    expect(fetchImpl).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });
});

describe('CapiClient.sendBatch', () => {
  it('sends multiple events in a single Graph API call', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ events_received: 2 }),
    });
    const client = new CapiClient({
      pixelId: 'PIX_999',
      capiToken: 'TOK',
      graphApiVersion: 'v22.0',
      fetchImpl,
    });

    const result = await client.sendBatch([PAYLOAD, { ...PAYLOAD, event_id: 'evt_def' }]);
    expect(result.events_received).toBe(2);
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string);
    expect(body.data).toHaveLength(2);
  });
});
