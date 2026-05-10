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
  it('exports 12 anchor records', async () => {
    const { ANCHORS } = await import('../seed-canva-anchor-creatives');
    expect(ANCHORS).toHaveLength(12);
  });

  it('inserts 12 records when seed() runs', async () => {
    const { seed } = await import('../seed-canva-anchor-creatives');
    await seed();
    expect(insertSpy).toHaveBeenCalledTimes(12);
  });

  it('every anchor has status=approved, generator=canva, costUsd=0', async () => {
    const { ANCHORS } = await import('../seed-canva-anchor-creatives');
    for (const a of ANCHORS) {
      expect(a.status).toBe('approved');
      expect(a.generator).toBe('canva');
      expect(a.costUsd).toBe(0);
    }
  });

  it('every anchor has all five safety checks pre-passed with severity=info', async () => {
    const { ANCHORS } = await import('../seed-canva-anchor-creatives');
    for (const a of ANCHORS) {
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

  it('6 anchors have locale=en and 6 have locale=es', async () => {
    const { ANCHORS } = await import('../seed-canva-anchor-creatives');
    expect(ANCHORS.filter((a) => a.locale === 'en')).toHaveLength(6);
    expect(ANCHORS.filter((a) => a.locale === 'es')).toHaveLength(6);
  });

  it('anchor IDs are unique', async () => {
    const { ANCHORS } = await import('../seed-canva-anchor-creatives');
    const ids = ANCHORS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every assetUrl is a Vercel Blob URL', async () => {
    const { ANCHORS } = await import('../seed-canva-anchor-creatives');
    for (const a of ANCHORS) {
      expect(a.assetUrl).toMatch(/blob\.vercel-storage\.com/);
    }
  });
});
