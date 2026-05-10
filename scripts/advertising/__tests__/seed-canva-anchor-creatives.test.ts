import { describe, it, expect, vi, beforeEach } from 'vitest';

const valuesSpy = vi.fn().mockReturnValue({
  onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
});
const insertSpy = vi.fn().mockReturnValue({ values: valuesSpy });

vi.mock('@/shared/lib/db', () => ({
  getDb: () => ({ insert: insertSpy }),
}));

vi.mock('@/shared/lib/schema', () => ({
  advertisingCreatives: { __tableName: 'advertising_creatives' },
}));

beforeEach(() => {
  valuesSpy.mockClear();
  insertSpy.mockClear();
  process.env.FOUNDER_EMAIL = 'founder@estrevia.app';
});

describe('seed-canva-anchor-creatives', () => {
  it('exports 6 feed anchors and 6 deferred story anchors (12 total)', async () => {
    const { ANCHORS_FEED, ANCHORS_STORIES_PENDING } = await import('../seed-canva-anchor-creatives');
    expect(ANCHORS_FEED).toHaveLength(6);
    expect(ANCHORS_STORIES_PENDING).toHaveLength(6);
  });

  it('inserts only 6 feed records when seed() runs (stories deferred)', async () => {
    const { seed } = await import('../seed-canva-anchor-creatives');
    await seed();
    expect(insertSpy).toHaveBeenCalledTimes(6);
  });

  it('seed() with dryRun=true performs no INSERTs', async () => {
    const { seed } = await import('../seed-canva-anchor-creatives');
    await seed({ dryRun: true });
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it('every anchor (feed + stories) has status=approved, generator=canva, costUsd=0', async () => {
    const { ANCHORS_FEED, ANCHORS_STORIES_PENDING } = await import('../seed-canva-anchor-creatives');
    for (const a of [...ANCHORS_FEED, ...ANCHORS_STORIES_PENDING]) {
      expect(a.status).toBe('approved');
      expect(a.generator).toBe('canva');
      expect(a.costUsd).toBe(0);
    }
  });

  it('every anchor has all five safety checks pre-passed with severity=info', async () => {
    const { ANCHORS_FEED, ANCHORS_STORIES_PENDING } = await import('../seed-canva-anchor-creatives');
    for (const a of [...ANCHORS_FEED, ...ANCHORS_STORIES_PENDING]) {
      expect(a.safetyChecks).toHaveLength(5);
      const names = a.safetyChecks.map((c: { check_name: string }) => c.check_name);
      expect(names).toEqual(expect.arrayContaining([
        'personal_claim',
        'meta_ad_policy',
        'ocr_text_accuracy',
        'brand_consistency',
        'controversial_symbol',
      ]));
      for (const c of a.safetyChecks) {
        expect(c.passed).toBe(true);
        expect(c.severity).toBe('info');
      }
    }
  });

  it('6 anchors have locale=en and 6 have locale=es across both arrays', async () => {
    const { ANCHORS_FEED, ANCHORS_STORIES_PENDING } = await import('../seed-canva-anchor-creatives');
    const all = [...ANCHORS_FEED, ...ANCHORS_STORIES_PENDING];
    expect(all.filter((a) => a.locale === 'en')).toHaveLength(6);
    expect(all.filter((a) => a.locale === 'es')).toHaveLength(6);
  });

  it('anchor IDs are unique across feed + stories', async () => {
    const { ANCHORS_FEED, ANCHORS_STORIES_PENDING } = await import('../seed-canva-anchor-creatives');
    const ids = [...ANCHORS_FEED, ...ANCHORS_STORIES_PENDING].map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every assetUrl is a Vercel Blob URL', async () => {
    const { ANCHORS_FEED, ANCHORS_STORIES_PENDING } = await import('../seed-canva-anchor-creatives');
    for (const a of [...ANCHORS_FEED, ...ANCHORS_STORIES_PENDING]) {
      expect(a.assetUrl).toMatch(/blob\.vercel-storage\.com/);
    }
  });
});
