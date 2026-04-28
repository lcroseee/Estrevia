export interface ClaudeSafetyClientDeps {
  anthropicApiKey: string;
  fetch?: typeof fetch;
}

export interface ModerationResult {
  passed: boolean;
  reason?: string;
}

export class ClaudeSafetyClient {
  private readonly fetch: typeof fetch;

  constructor(private readonly deps: ClaudeSafetyClientDeps) {
    this.fetch = deps.fetch ?? globalThis.fetch;
  }

  async moderationCheck(input: string): Promise<ModerationResult> {
    try {
      const response = await this.fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': this.deps.anthropicApiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5',
          max_tokens: 200,
          messages: [{ role: 'user', content: input }],
        }),
      });

      if (response.status < 200 || response.status >= 300) {
        return { passed: false, reason: 'INVALID_LLM_RESPONSE' };
      }

      const data = (await response.json()) as { content?: Array<{ text?: string }> };
      const text = data.content?.[0]?.text ?? '';

      const match = text.match(/\{[^{}]*"passed"[^{}]*\}/);
      if (!match) {
        return { passed: false, reason: 'INVALID_LLM_RESPONSE' };
      }

      const parsed = JSON.parse(match[0]) as { passed?: unknown; reason?: unknown };
      if (typeof parsed.passed !== 'boolean') {
        return { passed: false, reason: 'INVALID_LLM_RESPONSE' };
      }

      return {
        passed: parsed.passed,
        reason: typeof parsed.reason === 'string' ? parsed.reason : undefined,
      };
    } catch {
      return { passed: false, reason: 'INVALID_LLM_RESPONSE' };
    }
  }
}
