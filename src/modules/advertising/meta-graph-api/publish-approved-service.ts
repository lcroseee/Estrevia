// src/modules/advertising/meta-graph-api/publish-approved-service.ts

export interface ApprovedRow {
  id: string;
  copy: string;
  cta: string;
  locale: 'en' | 'es';
  assetUrl: string;
  assetKind: 'image' | 'video';
  hookTemplateId: string;
  metaAdId: string | null;
}

export interface PublishApprovedDeps {
  selectApproved: () => Promise<ApprovedRow[]>;
  uploadCreative: (row: ApprovedRow) => Promise<{ creative_id: string; ad_id: string }>;
  markUploaded: (id: string, metaAdId: string) => Promise<void>;
  /** Search Meta for an existing ad with this creative's body excerpt. Returns ad_id or null. */
  findExistingByExcerpt: (row: ApprovedRow) => Promise<string | null>;
  auditLog: (entry: { kind: string; creative_id: string; meta_ad_id?: string; error?: string }) => Promise<void>;
  /** Optional: print human-readable progress (CLI only). */
  log?: (msg: string) => void;
  limit?: number;
  dryRun?: boolean;
}

export interface PublishApprovedResult {
  uploaded: number;
  failed: number;
  skipped: number;
  previewed: number;
  errors: { id: string; message: string }[];
}

export async function publishApprovedService(
  deps: PublishApprovedDeps,
): Promise<PublishApprovedResult> {
  const all = await deps.selectApproved();
  const slice = deps.limit ? all.slice(0, deps.limit) : all;

  const result: PublishApprovedResult = {
    uploaded: 0, failed: 0, skipped: 0, previewed: 0, errors: [],
  };

  for (const row of slice) {
    try {
      if (deps.dryRun) {
        deps.log?.(`[dry-run] would upload ${row.id} (${row.locale}, ${row.hookTemplateId})`);
        result.previewed++;
        continue;
      }

      const existing = await deps.findExistingByExcerpt(row);
      if (existing) {
        deps.log?.(`[skip] ${row.id} already in Meta as ${existing}`);
        await deps.markUploaded(row.id, existing);
        await deps.auditLog({ kind: 'creative_upload_skipped_existing', creative_id: row.id, meta_ad_id: existing });
        result.skipped++;
        continue;
      }

      const { ad_id } = await deps.uploadCreative(row);
      await deps.markUploaded(row.id, ad_id);
      await deps.auditLog({ kind: 'creative_uploaded', creative_id: row.id, meta_ad_id: ad_id });
      deps.log?.(`[ok] ${row.id} → ${ad_id}`);
      result.uploaded++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await deps.auditLog({ kind: 'creative_upload_failed', creative_id: row.id, error: msg });
      result.failed++;
      result.errors.push({ id: row.id, message: msg });
      deps.log?.(`[fail] ${row.id}: ${msg}`);
    }
  }

  return result;
}
