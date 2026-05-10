/**
 * POST /api/admin/creatives/[id]/approve
 *
 * Atomically sets creative status to 'approved' (WHERE status='pending_review'),
 * then immediately uploads to Meta Ads as a paused ad.
 *
 * Race-fix: uses UPDATE … WHERE status='pending_review' RETURNING instead of
 * separate SELECT + UPDATE — prevents double-submit if two admins click approve
 * simultaneously.
 *
 * On Meta upload failure: DB stays at status='approved', meta_ad_id=NULL.
 * The bulk-publish CLI (Task 6) picks these up for retry. Returns 502.
 *
 * Auth: Clerk JWT + ADMIN_ALLOWED_EMAILS allowlist (requireAdmin).
 */

import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { requireAdmin } from '@/app/admin/lib/admin-auth';
import { getDb } from '@/shared/lib/db';
import { advertisingCreatives } from '@/shared/lib/schema';
import { MetaUploadClient } from '@/modules/advertising/meta-graph-api/upload-client';
import { isAiGenerated } from '@/modules/advertising/creative-gen/upload/meta-upload';
import type { GeneratedAsset } from '@/shared/types/advertising';

// ---------------------------------------------------------------------------
// Tracking helpers
// ---------------------------------------------------------------------------

/**
 * Builds UTM tracking params from the DB row fields available after approve.
 * Mirrors buildTrackingParams() in meta-upload.ts but avoids reconstructing
 * a full CreativeBundle (the DB row lacks GeneratedAsset sub-fields).
 */
function buildTrackingFromRow(row: {
  id: string;
  hookTemplateId: string;
  assetKind: string;
  locale: string;
}) {
  const archetype = row.hookTemplateId.split('-')[0] ?? 'unknown';
  return {
    utm_source: 'meta',
    utm_medium: row.assetKind === 'video' ? 'video' : 'image',
    utm_campaign: `estrevia_launch_${row.locale}`,
    utm_content: row.id,
    utm_term: archetype,
  };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  // 1. Auth — must be an allowlisted admin
  let approverEmail: string;
  try {
    const admin = await requireAdmin();
    approverEmail = admin.email;
  } catch (err) {
    if (err instanceof Response) return err as never;
    throw err;
  }

  const { id } = await params;
  const db = getDb();

  // 2. Atomic approve — prevents double-submit via WHERE + RETURNING
  //    If 0 rows returned: creative is not found OR not pending_review → 409.
  const updated = await db
    .update(advertisingCreatives)
    .set({
      status: 'approved',
      approvedBy: approverEmail,
      approvedAt: new Date(),
    })
    .where(
      and(
        eq(advertisingCreatives.id, id),
        eq(advertisingCreatives.status, 'pending_review'),
      ),
    )
    .returning({
      id: advertisingCreatives.id,
      assetUrl: advertisingCreatives.assetUrl,
      assetKind: advertisingCreatives.assetKind,
      copy: advertisingCreatives.copy,
      cta: advertisingCreatives.cta,
      locale: advertisingCreatives.locale,
      hookTemplateId: advertisingCreatives.hookTemplateId,
      generator: advertisingCreatives.generator,
    });

  if (updated.length === 0) {
    return NextResponse.json(
      { success: false, error: 'INVALID_STATUS', message: 'Creative is not pending_review' },
      { status: 409 },
    );
  }

  const row = {
    ...updated[0]!,
    locale: updated[0]!.locale as 'en' | 'es',
    assetKind: updated[0]!.assetKind as 'image' | 'video',
    generator: updated[0]!.generator as GeneratedAsset['generator'],
  };

  // 3. Upload to Meta Ads as a paused ad
  const metaToken = process.env.META_ACCESS_TOKEN;
  const metaAccountId = process.env.META_AD_ACCOUNT_ID;
  if (!metaToken || !metaAccountId) {
    throw new Error('META_ACCESS_TOKEN and META_AD_ACCOUNT_ID env vars must be set');
  }

  try {
    const client = new MetaUploadClient({
      accessToken: metaToken,
      adAccountId: metaAccountId,
    });

    const tracking = buildTrackingFromRow(row);

    const { ad_id } = await client.uploadCreative({
      asset_url: row.assetUrl,
      copy: row.copy,
      cta: row.cta,
      locale: row.locale,
      tracking,
      is_ai_generated: isAiGenerated(row.generator),
    });

    // 4. Mark as uploaded — ad is live on Meta (paused)
    await db
      .update(advertisingCreatives)
      .set({ status: 'uploaded', metaAdId: ad_id })
      .where(eq(advertisingCreatives.id, id));

    return NextResponse.json(
      { success: true, data: { id, status: 'uploaded', meta_ad_id: ad_id }, error: null },
      { status: 200 },
    );
  } catch (err) {
    // Meta upload failed — log but DO NOT revert DB status.
    // Row stays at status='approved', meta_ad_id=NULL so the bulk-publish CLI
    // (scripts/advertising/publish-approved.ts) can pick it up for retry.
    //
    // Always log to stderr first (visible in Vercel logs even when Sentry
    // capture fails or instrumentation isn't initialised yet on cold start).
    console.error(
      '[admin/creatives/approve] meta upload failed for', id,
      'name=', err instanceof Error ? err.constructor.name : typeof err,
      'message=', err instanceof Error ? err.message : String(err),
      'stack=', err instanceof Error ? err.stack : undefined,
    );
    try {
      const { captureException } = await import('@sentry/nextjs');
      captureException(err, { tags: { area: 'meta-upload', creative_id: id } });
    } catch (sentryErr) {
      console.error('[admin/creatives/approve] sentry capture also failed:', sentryErr);
    }

    return NextResponse.json(
      {
        success: false,
        error: 'META_UPLOAD_FAILED',
        message: err instanceof Error ? err.message : 'Unknown error',
      },
      { status: 502 },
    );
  }
}
