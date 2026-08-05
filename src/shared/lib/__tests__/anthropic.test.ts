import { describe, it, expect } from 'vitest';
import {
  ANTHROPIC_MODEL,
  ANTHROPIC_API_VERSION,
  buildMessagesRequest,
} from '../anthropic';

describe('anthropic model config', () => {
  it('does not reference the retired claude-sonnet-4-20250514', () => {
    // The API returns not_found_error for this ID. Three paid routes called it
    // simultaneously, so a regression here takes all of them down at once.
    expect(ANTHROPIC_MODEL).not.toBe('claude-sonnet-4-20250514');
  });

  it('targets claude-sonnet-5', () => {
    expect(ANTHROPIC_MODEL).toBe('claude-sonnet-5');
  });

  it('pins the API version header value', () => {
    expect(ANTHROPIC_API_VERSION).toBe('2023-06-01');
  });
});

describe('buildMessagesRequest', () => {
  it('disables thinking explicitly', () => {
    // Load-bearing: an OMITTED thinking parameter runs adaptive thinking on
    // Sonnet 5, and max_tokens caps thinking + text together — which would
    // truncate generated readings mid-sentence.
    const req = buildMessagesRequest({ prompt: 'hello', maxTokens: 100 });
    expect(req.thinking).toEqual({ type: 'disabled' });
  });

  it('requests low effort, the documented setting for content generation', () => {
    const req = buildMessagesRequest({ prompt: 'hello', maxTokens: 100 });
    expect(req.output_config).toEqual({ effort: 'low' });
  });

  it('carries the prompt as a single user message', () => {
    const req = buildMessagesRequest({ prompt: 'interpret this', maxTokens: 100 });
    expect(req.messages).toEqual([{ role: 'user', content: 'interpret this' }]);
  });

  it('passes max_tokens through unchanged', () => {
    expect(buildMessagesRequest({ prompt: 'x', maxTokens: 3400 }).max_tokens).toBe(3400);
  });

  it('names the shared model', () => {
    expect(buildMessagesRequest({ prompt: 'x', maxTokens: 10 }).model).toBe(ANTHROPIC_MODEL);
  });

  it('serialises to JSON without undefined holes', () => {
    const json = JSON.parse(
      JSON.stringify(buildMessagesRequest({ prompt: 'x', maxTokens: 10 })),
    );
    expect(Object.keys(json).sort()).toEqual(
      ['max_tokens', 'messages', 'model', 'output_config', 'thinking'].sort(),
    );
  });
});
