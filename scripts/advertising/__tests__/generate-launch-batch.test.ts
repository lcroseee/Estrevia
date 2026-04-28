import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateEnv, stripDurationFromHooks, runBatch } from '../generate-launch-batch';
import type { HookTemplate } from '@/shared/types/advertising';
import { vi } from 'vitest';

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

describe('runBatch', () => {
  const baseEnv = {
    GEMINI_API_KEY: 'g',
    BLOB_READ_WRITE_TOKEN: 'b',
    ANTHROPIC_API_KEY: 'a',
    DATABASE_URL: 'd',
  };

  beforeEach(() => {
    Object.assign(process.env, baseEnv);
  });

  it('generates 1 creative per slot, persists to DB, returns aggregate summary', async () => {
    const inserts: Array<{ values: unknown }> = [];
    const dbMock = {
      insert: () => ({
        values: (row: unknown) => {
          inserts.push({ values: row });
          return Promise.resolve();
        },
      }),
    };

    const imageGenMock = {
      name: 'imagen-4-fast' as const,
      cost_per_image_usd: 0.02,
      generate: vi.fn().mockResolvedValue({
        id: 'asset-1',
        kind: 'image' as const,
        generator: 'imagen-4-fast' as const,
        prompt_used: 'p',
        url: 'https://blob/x.png',
        width: 1080,
        height: 1920,
        cost_usd: 0.02,
        created_at: new Date(),
      }),
    };

    const claudeMock = {
      moderationCheck: vi.fn().mockResolvedValue({ passed: true }),
    };

    const summary = await runBatch({
      countPerLocale: 1,
      locales: ['en'],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db: dbMock as any,
      imageGen: imageGenMock,
      claudeClient: claudeMock,
    });

    expect(summary.generated).toBe(1);
    expect(summary.rejected).toBe(0);
    expect(summary.total_cost_usd).toBe(0.02);
    expect(summary.failures).toEqual([]);
    expect(inserts).toHaveLength(1);
  });

  it('isolates failures per slot — one bad slot does not abort the rest', async () => {
    const dbMock = {
      insert: () => ({ values: () => Promise.resolve() }),
    };

    let callCount = 0;
    const imageGenMock = {
      name: 'imagen-4-fast' as const,
      cost_per_image_usd: 0.02,
      generate: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 2) {
          return Promise.reject(new Error('GEMINI_NO_IMAGE'));
        }
        return Promise.resolve({
          id: `asset-${callCount}`,
          kind: 'image' as const,
          generator: 'imagen-4-fast' as const,
          prompt_used: 'p',
          url: `https://blob/${callCount}.png`,
          width: 1080,
          height: 1920,
          cost_usd: 0.02,
          created_at: new Date(),
        });
      }),
    };

    const claudeMock = { moderationCheck: vi.fn().mockResolvedValue({ passed: true }) };

    const summary = await runBatch({
      countPerLocale: 3,
      locales: ['en'],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db: dbMock as any,
      imageGen: imageGenMock,
      claudeClient: claudeMock,
    });

    expect(summary.generated).toBe(2);
    expect(summary.failures).toHaveLength(1);
    expect(summary.failures[0]).toEqual({
      locale: 'en',
      slot: 1,
      error: expect.stringContaining('GEMINI_NO_IMAGE'),
    });
  });
});
