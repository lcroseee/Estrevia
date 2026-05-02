// scripts/advertising/publish-approved.ts
import 'dotenv/config';
import { eq, and, isNull } from 'drizzle-orm';
import { getDb } from '@/shared/lib/db';
import { advertisingCreatives } from '@/shared/lib/schema';
import { createMetaUploadClient } from '@/modules/advertising/meta-graph-api';
import type { TrackingParams } from '@/modules/advertising/creative-gen/upload/meta-upload';
import {
  publishApprovedService,
  type ApprovedRow,
} from '@/modules/advertising/meta-graph-api/publish-approved-service';

function buildTracking(row: Pick<ApprovedRow, 'id' | 'hookTemplateId' | 'assetKind' | 'locale'>): TrackingParams {
  const archetype = row.hookTemplateId.split('-')[0] ?? 'unknown';
  return {
    utm_source: 'meta',
    utm_medium: row.assetKind === 'video' ? 'video' : 'image',
    utm_campaign: `estrevia_launch_${row.locale}`,
    utm_content: row.id,
    utm_term: archetype,
  };
}

function parseArgs(argv: string[]): { dryRun: boolean; limit?: number } {
  let dryRun = false;
  let limit: number | undefined;
  for (const a of argv) {
    if (a === '--dry-run') dryRun = true;
    if (a.startsWith('--limit=')) limit = Number(a.slice('--limit='.length));
  }
  return { dryRun, limit };
}

async function main() {
  const { dryRun, limit } = parseArgs(process.argv.slice(2));
  const db = getDb();
  const uploadClient = dryRun ? null : createMetaUploadClient();

  const result = await publishApprovedService({
    async selectApproved(): Promise<ApprovedRow[]> {
      const rows = await db
        .select({
          id: advertisingCreatives.id,
          copy: advertisingCreatives.copy,
          cta: advertisingCreatives.cta,
          locale: advertisingCreatives.locale,
          assetUrl: advertisingCreatives.assetUrl,
          assetKind: advertisingCreatives.assetKind,
          hookTemplateId: advertisingCreatives.hookTemplateId,
          metaAdId: advertisingCreatives.metaAdId,
        })
        .from(advertisingCreatives)
        .where(and(
          eq(advertisingCreatives.status, 'approved'),
          isNull(advertisingCreatives.metaAdId),
        ));
      return rows.map((r) => ({
        ...r,
        locale: r.locale as 'en' | 'es',
        assetKind: r.assetKind as 'image' | 'video',
      }));
    },

    async uploadCreative(row) {
      const tracking = buildTracking(row);
      return uploadClient!.uploadCreative({
        asset_url: row.assetUrl, copy: row.copy, cta: row.cta, locale: row.locale, tracking,
      });
    },

    async markUploaded(id, metaAdId) {
      await db.update(advertisingCreatives)
        .set({ status: 'uploaded', metaAdId })
        .where(eq(advertisingCreatives.id, id));
    },

    async findExistingByExcerpt(_row) {
      // Light guard: search Meta for ad whose creative body contains a unique 30-char excerpt.
      // For MVP we skip the search to keep CLI fast — set to always return null.
      // Later improvement: actual GET /act_X/ads?filtering=[creative.body CONTAIN <excerpt>]
      return null;
    },

    async auditLog(entry) {
      // Best-effort: console.log for now; future iteration can write to DB audit table.
      console.log(`[audit] ${JSON.stringify(entry)}`);
    },

    log: (m) => console.log(m),
    limit,
    dryRun,
  });

  console.log('\n=== Summary ===');
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
