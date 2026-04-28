import { describe, it, expect, vi } from 'vitest';
import { ClaudeSafetyClient } from '../claude-safety-client';

function makeClaudeOkResponse(text: string): Response {
  return new Response(
    JSON.stringify({ content: [{ type: 'text', text }] }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

describe('ClaudeSafetyClient.moderationCheck', () => {
  it('parses passed=true from valid JSON in Claude response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeClaudeOkResponse('Sure, here is my answer: {"passed": true, "reason": ""}'),
    );

    const client = new ClaudeSafetyClient({
      anthropicApiKey: 'k',
      fetch: fetchMock as unknown as typeof fetch,
    });

    const result = await client.moderationCheck('Calculate your sidereal sun.');

    expect(result.passed).toBe(true);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('k');
    expect((init.headers as Record<string, string>)['anthropic-version']).toBe('2023-06-01');

    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('claude-haiku-4-5');
    expect(body.messages[0].content).toContain('Calculate your sidereal sun.');
  });

  it('returns fail-safe block on non-JSON output', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeClaudeOkResponse('I cannot determine without more context'),
    );
    const client = new ClaudeSafetyClient({
      anthropicApiKey: 'k',
      fetch: fetchMock as unknown as typeof fetch,
    });

    const result = await client.moderationCheck('any input');
    expect(result.passed).toBe(false);
    expect(result.reason).toBe('INVALID_LLM_RESPONSE');
  });

  it('returns fail-safe block when "passed" is missing from JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeClaudeOkResponse('{"reason": "no idea"}'),
    );
    const client = new ClaudeSafetyClient({
      anthropicApiKey: 'k',
      fetch: fetchMock as unknown as typeof fetch,
    });

    const result = await client.moderationCheck('any input');
    expect(result.passed).toBe(false);
    expect(result.reason).toBe('INVALID_LLM_RESPONSE');
  });

  it('returns fail-safe block on 503 response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('upstream', { status: 503 }),
    );
    const client = new ClaudeSafetyClient({
      anthropicApiKey: 'k',
      fetch: fetchMock as unknown as typeof fetch,
    });

    const result = await client.moderationCheck('any');
    expect(result.passed).toBe(false);
    expect(result.reason).toBe('INVALID_LLM_RESPONSE');
  });

  it('returns fail-safe block when fetch throws (network/timeout)', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('ETIMEDOUT'));
    const client = new ClaudeSafetyClient({
      anthropicApiKey: 'k',
      fetch: fetchMock as unknown as typeof fetch,
    });

    const result = await client.moderationCheck('any');
    expect(result.passed).toBe(false);
    expect(result.reason).toBe('INVALID_LLM_RESPONSE');
  });
});
