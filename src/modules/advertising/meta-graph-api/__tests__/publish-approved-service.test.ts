import { describe, it, expect, vi } from 'vitest';
import { publishApprovedService } from '../publish-approved-service';

interface TestRow {
  id: string;
  copy: string;
  cta: string;
  locale: 'en' | 'es';
  assetUrl: string;
  assetKind: 'image' | 'video';
  hookTemplateId: string;
  metaAdId: string | null;
  generator: string;
}

function makeDeps(rows: TestRow[]) {
  const updated: { id: string; metaAdId: string }[] = [];
  return {
    selectApproved: async () => rows.filter((r) => !r.metaAdId),
    uploadCreative: vi.fn(async (r: TestRow) => ({ creative_id: 'c', ad_id: `ad_${r.id}` })),
    markUploaded: async (id: string, metaAdId: string) => { updated.push({ id, metaAdId }); },
    findExistingByExcerpt: vi.fn(async () => null),
    auditLog: vi.fn(async () => {}),
    updated,
  };
}

describe('publishApprovedService', () => {
  it('uploads all rows with null meta_ad_id', async () => {
    const rows: TestRow[] = [
      { id: 'a', copy: 'c1', cta: 'x', locale: 'en', assetUrl: 'u1', assetKind: 'image', hookTemplateId: 'en-authority-1', metaAdId: null, generator: 'satori' },
      { id: 'b', copy: 'c2', cta: 'x', locale: 'es', assetUrl: 'u2', assetKind: 'image', hookTemplateId: 'es-rarity-1', metaAdId: null, generator: 'satori' },
    ];
    const deps = makeDeps(rows);
    const result = await publishApprovedService({ ...deps });
    expect(result.uploaded).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(0);
    expect(deps.updated).toEqual([
      { id: 'a', metaAdId: 'ad_a' },
      { id: 'b', metaAdId: 'ad_b' },
    ]);
  });

  it('skips rows with existing Meta ad found via search guard', async () => {
    const rows: TestRow[] = [
      { id: 'a', copy: 'c1', cta: 'x', locale: 'en', assetUrl: 'u1', assetKind: 'image', hookTemplateId: 'en-authority-1', metaAdId: null, generator: 'satori' },
    ];
    const deps = {
      ...makeDeps(rows),
      findExistingByExcerpt: vi.fn(async () => 'ad_existing'),
    };
    const result = await publishApprovedService({ ...deps });
    expect(result.uploaded).toBe(0);
    expect(result.skipped).toBe(1);
    expect(deps.uploadCreative).not.toHaveBeenCalled();
    expect(deps.updated).toEqual([{ id: 'a', metaAdId: 'ad_existing' }]);
  });

  it('continues past one failure, counts failed', async () => {
    const rows: TestRow[] = [
      { id: 'a', copy: 'c1', cta: 'x', locale: 'en', assetUrl: 'u1', assetKind: 'image', hookTemplateId: 'h1', metaAdId: null, generator: 'satori' },
      { id: 'b', copy: 'c2', cta: 'x', locale: 'es', assetUrl: 'u2', assetKind: 'image', hookTemplateId: 'h2', metaAdId: null, generator: 'satori' },
    ];
    const deps = makeDeps(rows);
    deps.uploadCreative = vi.fn(async (r) => {
      if (r.id === 'a') throw new Error('boom');
      return { creative_id: 'c', ad_id: `ad_${r.id}` };
    });
    const result = await publishApprovedService({ ...deps });
    expect(result.uploaded).toBe(1);
    expect(result.failed).toBe(1);
  });

  it('honors limit parameter', async () => {
    const rows: TestRow[] = Array.from({ length: 5 }, (_, i) => ({
      id: `r${i}`, copy: 'c', cta: 'x', locale: 'en' as const,
      assetUrl: 'u', assetKind: 'image' as const, hookTemplateId: 'h', metaAdId: null, generator: 'satori',
    }));
    const deps = makeDeps(rows);
    const result = await publishApprovedService({ ...deps, limit: 2 });
    expect(result.uploaded).toBe(2);
  });

  it('dryRun does not call uploadCreative or markUploaded', async () => {
    const rows: TestRow[] = [
      { id: 'a', copy: 'c1', cta: 'x', locale: 'en', assetUrl: 'u1', assetKind: 'image', hookTemplateId: 'h', metaAdId: null, generator: 'satori' },
    ];
    const deps = makeDeps(rows);
    const result = await publishApprovedService({ ...deps, dryRun: true });
    expect(result.uploaded).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.previewed).toBe(1);
    expect(deps.uploadCreative).not.toHaveBeenCalled();
    expect(deps.updated).toEqual([]);
  });
});
