import { describe, it, expect, vi } from 'vitest';
import { ClaudeBrandVoiceClient } from '../claude-brand-voice-client';

function mockResponse(
  payload: Partial<{ depth: number; scientific: number; respectful: number; no_manipulation: boolean }>,
  status = 200,
): Response {
  return {
    status,
    json: async () => ({ content: [{ text: JSON.stringify(payload) }] }),
  } as unknown as Response;
}

describe('ClaudeBrandVoiceClient', () => {
  it('POSTs to Anthropic /v1/messages with model, max_tokens, and brand-rule system prompt', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      mockResponse({ depth: 8, scientific: 7, respectful: 9, no_manipulation: true }),
    );
    const client = new ClaudeBrandVoiceClient({ anthropicApiKey: 'k', fetch: fetchFn });
    await client.brandVoiceScore('ad-1', 'sidereal precision copy');

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('k');
    expect((init.headers as Record<string, string>)['anthropic-version']).toBe('2023-06-01');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('claude-haiku-4-5');
    expect(body.max_tokens).toBe(150);
    expect(body.system).toMatch(/cosmic dance/);
    expect(body.system).toMatch(/sidereal/);
    expect(body.system).toMatch(/no_manipulation/);
    expect(body.system).toMatch(/JSON only/);
    expect(body.messages[0].content).toMatch(/ad-1/);
    expect(body.messages[0].content).toMatch(/sidereal precision copy/);
  });

  it('parses valid JSON response and computes overall via weighted formula', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      mockResponse({ depth: 8, scientific: 7, respectful: 9, no_manipulation: true }),
    );
    const client = new ClaudeBrandVoiceClient({ anthropicApiKey: 'k', fetch: fetchFn });
    const result = await client.brandVoiceScore('ad-1', 'copy');

    expect(result.depth).toBe(8);
    expect(result.scientific).toBe(7);
    expect(result.respectful).toBe(9);
    expect(result.no_manipulation).toBe(true);
    // overall = 8*0.3 + 7*0.3 + 9*0.3 + 1 = 8.2
    expect(result.overall).toBeCloseTo(8.2);
  });

  it('returns fail-shut zeros on HTTP 500', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockResponse({}, 500));
    const client = new ClaudeBrandVoiceClient({ anthropicApiKey: 'k', fetch: fetchFn });
    const result = await client.brandVoiceScore('ad-1', 'copy');
    expect(result).toEqual({
      depth: 0, scientific: 0, respectful: 0, no_manipulation: false, overall: 0,
    });
  });

  it('returns fail-shut zeros when response text is not JSON', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ content: [{ text: 'totally not json at all' }] }),
    } as unknown as Response);
    const client = new ClaudeBrandVoiceClient({ anthropicApiKey: 'k', fetch: fetchFn });
    const result = await client.brandVoiceScore('ad-1', 'copy');
    expect(result.overall).toBe(0);
    expect(result.no_manipulation).toBe(false);
  });

  it('returns fail-shut zeros when required fields are missing', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ content: [{ text: JSON.stringify({ depth: 8, scientific: 7 }) }] }),
    } as unknown as Response);
    const client = new ClaudeBrandVoiceClient({ anthropicApiKey: 'k', fetch: fetchFn });
    const result = await client.brandVoiceScore('ad-1', 'copy');
    expect(result.depth).toBe(0);
    expect(result.no_manipulation).toBe(false);
  });

  it('returns fail-shut zeros when fetch throws (network error)', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('network down'));
    const client = new ClaudeBrandVoiceClient({ anthropicApiKey: 'k', fetch: fetchFn });
    const result = await client.brandVoiceScore('ad-1', 'copy');
    expect(result).toEqual({
      depth: 0, scientific: 0, respectful: 0, no_manipulation: false, overall: 0,
    });
  });

  it('clamps out-of-range scores to [0, 10]', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      mockResponse({ depth: 15, scientific: -2, respectful: 10, no_manipulation: true }),
    );
    const client = new ClaudeBrandVoiceClient({ anthropicApiKey: 'k', fetch: fetchFn });
    const result = await client.brandVoiceScore('ad-1', 'copy');
    expect(result.depth).toBe(10);
    expect(result.scientific).toBe(0);
    expect(result.respectful).toBe(10);
    expect(result.no_manipulation).toBe(true);
  });
});
