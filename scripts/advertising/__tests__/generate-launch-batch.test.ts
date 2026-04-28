import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateEnv, stripDurationFromHooks } from '../generate-launch-batch';
import type { HookTemplate } from '@/shared/types/advertising';

describe('validateEnv', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.DATABASE_URL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns missing key list when none are set', () => {
    const result = validateEnv();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missing).toEqual(
        expect.arrayContaining([
          'GEMINI_API_KEY',
          'BLOB_READ_WRITE_TOKEN',
          'ANTHROPIC_API_KEY',
          'DATABASE_URL',
        ]),
      );
    }
  });

  it('returns ok when all 4 vars are set', () => {
    process.env.GEMINI_API_KEY = 'g';
    process.env.BLOB_READ_WRITE_TOKEN = 'b';
    process.env.ANTHROPIC_API_KEY = 'a';
    process.env.DATABASE_URL = 'd';
    const result = validateEnv();
    expect(result.ok).toBe(true);
  });

  it('flags only missing ones', () => {
    process.env.GEMINI_API_KEY = 'g';
    process.env.ANTHROPIC_API_KEY = 'a';
    const result = validateEnv();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missing).toEqual(['BLOB_READ_WRITE_TOKEN', 'DATABASE_URL']);
    }
  });
});

describe('stripDurationFromHooks', () => {
  it('clears duration_sec on every template', () => {
    const input: HookTemplate[] = [
      { id: 'a', name: 'A', archetype: 'identity_reveal', copy_template: 'c', visual_mood: 'm', duration_sec: 15, aspect_ratios: ['9:16'], locale: 'en', policy_constraints: [] },
      { id: 'b', name: 'B', archetype: 'authority', copy_template: 'c', visual_mood: 'm', duration_sec: 20, aspect_ratios: ['9:16'], locale: 'en', policy_constraints: [] },
    ];
    const output = stripDurationFromHooks(input);
    expect(output[0].duration_sec).toBeUndefined();
    expect(output[1].duration_sec).toBeUndefined();
    expect(input[0].duration_sec).toBe(15);
  });
});
