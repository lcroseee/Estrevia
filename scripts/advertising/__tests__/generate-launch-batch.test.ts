import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  validateEnv,
  stripDurationFromHooks,
  runBatch,
  buildArchetypePlan,
  parseCliArgs,
} from '../generate-launch-batch';
import type { HookTemplate, HookArchetype } from '@/shared/types/advertising';

const mkTemplate = (
  id: string,
  archetype: HookArchetype,
  locale: 'en' | 'es' = 'en',
): HookTemplate => ({
  id,
  name: id,
  archetype,
  copy_template: 'c',
  visual_mood: 'm',
  aspect_ratios: ['9:16'],
  locale,
  policy_constraints: [],
});

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

describe('buildArchetypePlan', () => {
  it('rotates archetypes across slots in insertion order', () => {
    const templates = [
      mkTemplate('id-1', 'identity_reveal'),
      mkTemplate('id-2', 'identity_reveal'),
      mkTemplate('au-1', 'authority'),
      mkTemplate('ra-1', 'rarity'),
    ];
    const plan = buildArchetypePlan(templates, 'en', 3);
    expect(plan.map((p) => p.id)).toEqual(['id-1', 'au-1', 'ra-1']);
  });

  it('cycles to next variant within an archetype after all archetypes used', () => {
    const templates = [
      mkTemplate('id-1', 'identity_reveal'),
      mkTemplate('id-2', 'identity_reveal'),
      mkTemplate('au-1', 'authority'),
      mkTemplate('au-2', 'authority'),
    ];
    const plan = buildArchetypePlan(templates, 'en', 4);
    expect(plan.map((p) => p.id)).toEqual(['id-1', 'au-1', 'id-2', 'au-2']);
  });

  it('filters by locale before grouping by archetype', () => {
    const templates = [
      mkTemplate('en-id-1', 'identity_reveal', 'en'),
      mkTemplate('es-id-1', 'identity_reveal', 'es'),
      mkTemplate('es-au-1', 'authority', 'es'),
    ];
    const plan = buildArchetypePlan(templates, 'es', 2);
    expect(plan.map((p) => p.id)).toEqual(['es-id-1', 'es-au-1']);
  });

  it('returns empty when locale has no templates or count <= 0', () => {
    const templates = [mkTemplate('en-id-1', 'identity_reveal', 'en')];
    expect(buildArchetypePlan(templates, 'es', 3)).toEqual([]);
    expect(buildArchetypePlan(templates, 'en', 0)).toEqual([]);
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
  const originalEnv = { ...process.env };
  const baseEnv = {
    GEMINI_API_KEY: 'g',
    BLOB_READ_WRITE_TOKEN: 'b',
    ANTHROPIC_API_KEY: 'a',
    DATABASE_URL: 'd',
  };

  beforeEach(() => {
    Object.assign(process.env, baseEnv);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
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

  it('persists rejected creatives when safety check blocks', async () => {
    const inserts: Array<{ status: string }> = [];
    const dbMock = {
      insert: () => ({
        values: (row: { status: string }) => {
          inserts.push({ status: row.status });
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
      moderationCheck: vi.fn().mockResolvedValue({
        passed: false,
        reason: 'fortune-telling language detected',
      }),
    };

    const summary = await runBatch({
      countPerLocale: 1,
      locales: ['en'],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db: dbMock as any,
      imageGen: imageGenMock,
      claudeClient: claudeMock,
    });

    expect(summary.generated).toBe(0);
    expect(summary.rejected).toBe(1);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].status).toBe('rejected');
  });

  it('runs templateIds mode in parallel: all generate() calls fire before any resolves', async () => {
    const dbMock = { insert: () => ({ values: () => Promise.resolve() }) };

    let invokeCount = 0;
    let peakInFlight = 0;
    let inFlight = 0;
    const release: Array<() => void> = [];
    const generatePromises: Array<Promise<unknown>> = [];

    const imageGenMock = {
      name: 'imagen-4-fast' as const,
      cost_per_image_usd: 0.02,
      generate: vi.fn().mockImplementation(() => {
        invokeCount++;
        inFlight++;
        peakInFlight = Math.max(peakInFlight, inFlight);
        const p = new Promise<{
          id: string;
          kind: 'image';
          generator: 'imagen-4-fast';
          prompt_used: string;
          url: string;
          width: number;
          height: number;
          cost_usd: number;
          created_at: Date;
        }>((resolve) => {
          release.push(() =>
            resolve({
              id: `asset-${invokeCount}`,
              kind: 'image',
              generator: 'imagen-4-fast',
              prompt_used: 'p',
              url: `https://blob/${invokeCount}.png`,
              width: 1080,
              height: 1920,
              cost_usd: 0.02,
              created_at: new Date(),
            }),
          );
        });
        generatePromises.push(p);
        return p.finally(() => {
          inFlight--;
        });
      }),
    };

    const claudeMock = { moderationCheck: vi.fn().mockResolvedValue({ passed: true }) };

    const runPromise = runBatch({
      templateIds: ['en-identity-reveal-3'],
      samples: 4,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db: dbMock as any,
      imageGen: imageGenMock,
      claudeClient: claudeMock,
    });

    // Give the microtask queue time to schedule all parallel generate() calls
    await new Promise((r) => setTimeout(r, 20));
    expect(invokeCount).toBe(4);
    expect(peakInFlight).toBe(4);

    // Release pending promises to let runBatch finish
    for (const fn of release) fn();
    const summary = await runPromise;

    expect(summary.generated).toBe(4);
    expect(summary.creatives.every((c) => c.templateId === 'en-identity-reveal-3')).toBe(true);
  });

  it('reports failure when templateIds reference an unknown template id', async () => {
    const dbMock = { insert: () => ({ values: () => Promise.resolve() }) };

    const imageGenMock = {
      name: 'imagen-4-fast' as const,
      cost_per_image_usd: 0.02,
      generate: vi.fn().mockResolvedValue({
        id: 'asset-ok',
        kind: 'image' as const,
        generator: 'imagen-4-fast' as const,
        prompt_used: 'p',
        url: 'https://blob/ok.png',
        width: 1080,
        height: 1920,
        cost_usd: 0.02,
        created_at: new Date(),
      }),
    };
    const claudeMock = { moderationCheck: vi.fn().mockResolvedValue({ passed: true }) };

    const summary = await runBatch({
      templateIds: ['en-identity-reveal-3', 'does-not-exist'],
      samples: 1,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db: dbMock as any,
      imageGen: imageGenMock,
      claudeClient: claudeMock,
    });

    expect(summary.generated).toBe(1);
    expect(summary.failures).toContainEqual(
      expect.objectContaining({ error: expect.stringContaining('does-not-exist') }),
    );
  });

  it('templateIds mode survives a per-slot rejection via Promise.allSettled', async () => {
    const dbMock = { insert: () => ({ values: () => Promise.resolve() }) };

    let callCount = 0;
    const imageGenMock = {
      name: 'imagen-4-fast' as const,
      cost_per_image_usd: 0.02,
      generate: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 2) return Promise.reject(new Error('GEMINI_NO_IMAGE'));
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
      templateIds: ['en-identity-reveal-3'],
      samples: 3,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db: dbMock as any,
      imageGen: imageGenMock,
      claudeClient: claudeMock,
    });

    expect(summary.generated).toBe(2);
    expect(summary.failures).toHaveLength(1);
    expect(summary.failures[0].error).toContain('GEMINI_NO_IMAGE');
  });
});

describe('parseCliArgs', () => {
  it('parses --templates as comma-separated list', () => {
    expect(parseCliArgs(['--templates', 'a,b,c'])).toEqual({
      templateIds: ['a', 'b', 'c'],
    });
  });

  it('parses --samples as integer', () => {
    expect(parseCliArgs(['--samples', '10'])).toEqual({ samples: 10 });
  });

  it('parses both flags together with whitespace tolerance', () => {
    expect(
      parseCliArgs([
        '--templates',
        ' en-identity-reveal-3 , es-identity-reveal-3 ',
        '--samples',
        '5',
      ]),
    ).toEqual({
      templateIds: ['en-identity-reveal-3', 'es-identity-reveal-3'],
      samples: 5,
    });
  });

  it('returns empty object when no flags supplied', () => {
    expect(parseCliArgs([])).toEqual({});
  });

  it('ignores unknown flags', () => {
    expect(parseCliArgs(['--unknown', 'x', '--samples', '2'])).toEqual({ samples: 2 });
  });

  it('parses --model flag for fast or ultra', () => {
    expect(parseCliArgs(['--model', 'fast'])).toEqual({ model: 'fast' });
    expect(parseCliArgs(['--model', 'ultra'])).toEqual({ model: 'ultra' });
  });

  it('ignores invalid --model values rather than crashing', () => {
    expect(parseCliArgs(['--model', 'random-value'])).toEqual({});
  });
});
