import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateEnv } from '../generate-launch-batch';

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
