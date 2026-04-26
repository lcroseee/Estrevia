import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateLaunchBatch } from '../generate-launch-set';
import type { BatchDeps, BatchOptions } from '../generate-launch-set';
import type { HookTemplate, ImageGenerator, VideoGenerator } from '@/shared/types/advertising';
import { mockClaudeApi } from '../../../__tests__/mocks/claude';
import { mockGeminiApi } from '../../../__tests__/mocks/gemini';
import { advertisingCreatives } from '@/shared/lib/schema';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeTemplate = (overrides?: Partial<HookTemplate>): HookTemplate => ({
  id: 'tpl-001',
  name: 'Identity Reveal EN',
  archetype: 'identity_reveal',
  copy_template: 'Your sidereal sun is in Scorpio.',
  visual_mood: 'dark cosmic nebula',
  aspect_ratios: ['9:16'],
  locale: 'en',
  policy_constraints: [],
  ...overrides,
});

const makeTemplateEs = (overrides?: Partial<HookTemplate>): HookTemplate =>
  makeTemplate({
    id: 'tpl-002',
    name: 'Identity Reveal ES',
    locale: 'es',
    copy_template: 'Tu sol sidéreo está en Escorpio.',
    ...overrides,
  });

const makeInsertChain = () => {
  const values = vi.fn().mockResolvedValue(undefined);
  return { insert: vi.fn().mockReturnValue({ values }) };
};

function makeDeps(overrides?: Partial<BatchDeps>): BatchDeps {
  const gemini = mockGeminiApi();
  const claude = mockClaudeApi();
  const db = makeInsertChain();

  const imageGen: ImageGenerator = {
    name: 'imagen-4-fast',
    cost_per_image_usd: 0.02,
    generate: vi.fn().mockResolvedValue({
      id: 'asset-001',
      kind: 'image' as const,
      generator: 'imagen-4-fast' as const,
      prompt_used: 'dark cosmic nebula',
      url: 'https://test.blob.vercel-storage.com/img-001.png',
      width: 1080,
      height: 1920,
      cost_usd: 0.02,
      created_at: new Date(),
    }),
  };

  const videoGen: VideoGenerator = {
    name: 'veo-3-1-lite',
    cost_per_second_usd: 0.05,
    generate: vi.fn().mockResolvedValue({
      id: 'asset-vid-001',
      kind: 'video' as const,
      generator: 'veo-3-1-lite' as const,
      prompt_used: 'dark cosmic nebula',
      url: 'https://test.blob.vercel-storage.com/vid-001.mp4',
      width: 1080,
      height: 1920,
      duration_sec: 15,
      cost_usd: 0.75,
      created_at: new Date(),
    }),
  };

  return {
    imageGen,
    videoGen,
    hookTemplates: [makeTemplate(), makeTemplateEs()],
    claudeClient: claude,
    db: db as unknown as BatchDeps['db'],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generateLaunchBatch', () => {
  it('generates default 22 creatives (11 EN + 11 ES)', async () => {
    const deps = makeDeps();
    const summary = await generateLaunchBatch(deps);

    expect(summary.generated).toBe(22);
    expect(summary.rejected).toBe(0);
    expect(summary.creatives).toHaveLength(22);
  });

  it('respects count_per_locale option', async () => {
    const deps = makeDeps();
    const summary = await generateLaunchBatch(deps, { count_per_locale: 3 });

    expect(summary.generated).toBe(6); // 3 EN + 3 ES
  });

  it('respects locales option', async () => {
    const deps = makeDeps();
    const summary = await generateLaunchBatch(deps, { locales: ['en'], count_per_locale: 5 });

    expect(summary.generated).toBe(5);
  });

  it('persists each accepted creative to DB with status=pending_review', async () => {
    const valuesStub = vi.fn().mockResolvedValue(undefined);
    const insertStub = vi.fn().mockReturnValue({ values: valuesStub });
    const deps = makeDeps({
      db: { insert: insertStub } as unknown as BatchDeps['db'],
    });

    await generateLaunchBatch(deps, { count_per_locale: 2, locales: ['en'] });

    expect(insertStub).toHaveBeenCalledTimes(2);
    expect(insertStub).toHaveBeenCalledWith(advertisingCreatives);
    const firstInsert = valuesStub.mock.calls[0][0];
    expect(firstInsert.status).toBe('pending_review');
    expect(firstInsert.locale).toBe('en');
  });

  it('persists rejected creative to DB with status=rejected', async () => {
    const valuesStub = vi.fn().mockResolvedValue(undefined);
    const insertStub = vi.fn().mockReturnValue({ values: valuesStub });

    // Claude rejects all creatives
    const badClaude = {
      moderationCheck: vi.fn().mockResolvedValue({
        passed: false,
        reason: 'Fortune-telling language',
      }),
    };

    const deps = makeDeps({
      claudeClient: badClaude,
      db: { insert: insertStub } as unknown as BatchDeps['db'],
    });

    const summary = await generateLaunchBatch(deps, { count_per_locale: 2, locales: ['en'] });

    expect(summary.rejected).toBe(2);
    expect(summary.generated).toBe(0);
    // Still persisted to DB
    expect(valuesStub.mock.calls[0][0].status).toBe('rejected');
  });

  it('blocks creatives with personal-claim copy patterns', async () => {
    const valuesStub = vi.fn().mockResolvedValue(undefined);
    const insertStub = vi.fn().mockReturnValue({ values: valuesStub });

    const blockedTemplate = makeTemplate({
      copy_template: 'your future is written in the stars',
    });

    const deps = makeDeps({
      hookTemplates: [blockedTemplate],
      db: { insert: insertStub } as unknown as BatchDeps['db'],
    });

    const summary = await generateLaunchBatch(deps, { count_per_locale: 1, locales: ['en'] });

    expect(summary.rejected).toBe(1);
    expect(summary.generated).toBe(0);
    expect(valuesStub.mock.calls[0][0].status).toBe('rejected');
  });

  it('accumulates total_cost_usd correctly', async () => {
    const deps = makeDeps();
    const summary = await generateLaunchBatch(deps, { count_per_locale: 2, locales: ['en'] });

    // imageGen costs $0.02/image; 2 images = $0.04
    expect(summary.total_cost_usd).toBeCloseTo(0.04, 4);
  });

  it('uses videoGen for templates with duration_sec defined', async () => {
    const videoTemplate = makeTemplate({ duration_sec: 15 });
    const deps = makeDeps({ hookTemplates: [videoTemplate] });

    await generateLaunchBatch(deps, { count_per_locale: 1, locales: ['en'] });

    expect(deps.videoGen.generate).toHaveBeenCalledOnce();
    expect(deps.imageGen.generate).not.toHaveBeenCalled();
  });

  it('uses imageGen for templates without duration_sec', async () => {
    const imageTemplate = makeTemplate({ duration_sec: undefined });
    const deps = makeDeps({ hookTemplates: [imageTemplate] });

    await generateLaunchBatch(deps, { count_per_locale: 1, locales: ['en'] });

    expect(deps.imageGen.generate).toHaveBeenCalledOnce();
    expect(deps.videoGen.generate).not.toHaveBeenCalled();
  });

  it('assigns unique ids to each bundle', async () => {
    const deps = makeDeps();
    const summary = await generateLaunchBatch(deps, { count_per_locale: 3, locales: ['en'] });

    const ids = summary.creatives.map((c) => c.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('attaches safety_checks to each creative bundle', async () => {
    const deps = makeDeps();
    const summary = await generateLaunchBatch(deps, { count_per_locale: 1, locales: ['en'] });

    const bundle = summary.creatives[0];
    expect(bundle.safety_checks).toBeInstanceOf(Array);
    expect(bundle.safety_checks.length).toBeGreaterThan(0);
  });

  it('sets locale on each creative matching the current loop locale', async () => {
    const deps = makeDeps();
    const summary = await generateLaunchBatch(deps, { count_per_locale: 2, locales: ['en', 'es'] });

    const enCreatives = summary.creatives.filter((c) => c.locale === 'en');
    const esCreatives = summary.creatives.filter((c) => c.locale === 'es');
    expect(enCreatives).toHaveLength(2);
    expect(esCreatives).toHaveLength(2);
  });

  it('uses locale-appropriate CTA', async () => {
    const deps = makeDeps();
    const summary = await generateLaunchBatch(deps, { count_per_locale: 1, locales: ['en', 'es'] });

    const enBundle = summary.creatives.find((c) => c.locale === 'en');
    const esBundle = summary.creatives.find((c) => c.locale === 'es');
    expect(enBundle?.cta).toBe('Calculate your chart');
    expect(esBundle?.cta).toBe('Calcula tu carta');
  });
});
