/**
 * POST /api/admin/creatives/publish-batch
 *
 * Bulk-publishes all approved creatives (status='approved', meta_ad_id=NULL)
 * to Meta Ads as paused ads. Idempotent — rows already having meta_ad_id are
 * filtered out by selectApproved (or skipped via findExistingByExcerpt guard).
 *
 * Query params:
 *   dry_run=1  — preview only, no actual upload
 *   limit=N    — cap number of creatives processed in this call
 *
 * Response shape: { uploaded, failed, skipped, previewed, errors }
 *
 * Auth: Clerk JWT + ADMIN_ALLOWED_EMAILS allowlist (requireAdmin).
 */

import { NextResponse } from 'next/server';
import { eq, and, isNull } from 'drizzle-orm';
import { requireAdmin } from '@/app/admin/lib/admin-auth';
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

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof Response) return err as never;
    throw err;
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get('dry_run') === '1';
  const limitParam = url.searchParams.get('limit');
  const limit = limitParam ? Number(limitParam) : undefined;

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
          generator: advertisingCreatives.generator,
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
        asset_url: row.assetUrl,
        copy: row.copy,
        cta: row.cta,
        locale: row.locale,
        tracking,
        is_ai_generated: row.generator !== 'satori',
      });
    },

    async markUploaded(id, metaAdId) {
      await db.update(advertisingCreatives)
        .set({ status: 'uploaded', metaAdId })
        .where(eq(advertisingCreatives.id, id));
    },

    async findExistingByExcerpt() { return null; },

    async auditLog(entry) { console.log(`[audit] ${JSON.stringify(entry)}`); },

    limit,
    dryRun,
  });

  return NextResponse.json(result, { status: 200 });
}
