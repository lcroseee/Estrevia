import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const originalEnv = { ...process.env };

beforeEach(() => {
  delete process.env.BRAND_VOICE_SCORER_ENABLED;
  delete process.env.ANTHROPIC_API_KEY;
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('buildClaudeForBrandVoice (env-gated)', () => {
  it('returns null when BRAND_VOICE_SCORER_ENABLED is unset', async () => {
    const { buildClaudeForBrandVoice } = await import('../retro-weekly/route');
    const result = buildClaudeForBrandVoice();
    expect(result).toBeNull();
  });

  it('returns null when BRAND_VOICE_SCORER_ENABLED is "false"', async () => {
    process.env.BRAND_VOICE_SCORER_ENABLED = 'false';
    const { buildClaudeForBrandVoice } = await import('../retro-weekly/route');
    const result = buildClaudeForBrandVoice();
    expect(result).toBeNull();
  });

  it('returns a ClaudeBrandVoiceClient instance when enabled + API key present', async () => {
    process.env.BRAND_VOICE_SCORER_ENABLED = 'true';
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const { buildClaudeForBrandVoice } = await import('../retro-weekly/route');
    const { ClaudeBrandVoiceClient } = await import('@/modules/advertising/creative-gen/clients/claude-brand-voice-client');
    const result = buildClaudeForBrandVoice();
    expect(result).toBeInstanceOf(ClaudeBrandVoiceClient);
  });

  it('throws when enabled but ANTHROPIC_API_KEY is missing', async () => {
    process.env.BRAND_VOICE_SCORER_ENABLED = 'true';
    delete process.env.ANTHROPIC_API_KEY;
    const { buildClaudeForBrandVoice } = await import('../retro-weekly/route');
    expect(() => buildClaudeForBrandVoice()).toThrow(/ANTHROPIC_API_KEY/);
  });
});
