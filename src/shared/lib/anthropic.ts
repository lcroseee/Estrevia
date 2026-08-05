/**
 * Single source of truth for the Anthropic model used by the paid AI features.
 *
 * Why this module exists: three routes — the natal reading, the synastry
 * analysis and the tarot interpretation — each hardcoded
 * `claude-sonnet-4-20250514` with its own copy of the request body. When that
 * model was retired the API began answering `not_found_error`, and all three
 * paid features started returning 502 at once with no alert path. Keeping the
 * model ID and request shape here makes the next deprecation a one-line change.
 */

export const ANTHROPIC_MODEL = 'claude-sonnet-5' as const;

export const ANTHROPIC_API_VERSION = '2023-06-01' as const;

export const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages' as const;

export interface MessagesRequest {
  model: typeof ANTHROPIC_MODEL;
  max_tokens: number;
  thinking: { type: 'disabled' };
  output_config: { effort: 'low' };
  messages: Array<{ role: 'user'; content: string }>;
}

/**
 * Build the request body for a single-turn content-generation call.
 *
 * `thinking: { type: 'disabled' }` is load-bearing rather than cosmetic. On
 * Sonnet 5 an OMITTED `thinking` parameter runs adaptive thinking, and
 * `max_tokens` caps thinking and response text together — so carrying the old
 * request shape across the model change would silently truncate readings
 * mid-sentence. These routes generate prose, not reasoning.
 *
 * `effort: 'low'` is the documented setting for thinking-off content
 * generation, which is exactly what all three callers do.
 */
export function buildMessagesRequest(params: {
  prompt: string;
  maxTokens: number;
}): MessagesRequest {
  return {
    model: ANTHROPIC_MODEL,
    max_tokens: params.maxTokens,
    thinking: { type: 'disabled' },
    output_config: { effort: 'low' },
    messages: [{ role: 'user', content: params.prompt }],
  };
}

/** Headers every call to the Messages API needs. */
export function anthropicHeaders(apiKey: string): Record<string, string> {
  return {
    'x-api-key': apiKey,
    'anthropic-version': ANTHROPIC_API_VERSION,
    'content-type': 'application/json',
  };
}
