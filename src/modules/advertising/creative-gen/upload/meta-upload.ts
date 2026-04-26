import type { CreativeBundle } from '@/shared/types/advertising';
import { advertisingCreatives } from '@/shared/lib/schema';
import { eq } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Dependency interfaces
// ---------------------------------------------------------------------------

export interface MetaApiClient {
  uploadCreative(opts: {
    asset_url: string;
    copy: string;
    cta: string;
    locale: string;
    tracking: TrackingParams;
  }): Promise<{ creative_id: string; ad_id: string }>;
}

export interface DbUpdateClient {
  update(table: typeof advertisingCreatives): {
    set(values: Partial<typeof advertisingCreatives.$inferInsert>): {
      where(condition: ReturnType<typeof eq>): Promise<void>;
    };
  };
}

export interface UploadDeps {
  metaApi: MetaApiClient;
  db: DbUpdateClient;
}

// ---------------------------------------------------------------------------
// UTM / tracking helpers
// ---------------------------------------------------------------------------

export interface TrackingParams {
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string; // creative bundle id
  utm_term: string;    // hook archetype
}

/**
 * Builds UTM tracking parameters from the creative bundle.
 * utm_campaign encodes the locale + archetype so we can segment performance
 * by hook type in PostHog / GA4.
 */
export function buildTrackingParams(bundle: CreativeBundle): TrackingParams {
  // Derive archetype from hookTemplateId — real impl would look up the template.
  // Convention: template ids are prefixed with their archetype, e.g. "identity_reveal-en-01".
  // For MVP we extract a best-effort slug from the id.
  const archetype = bundle.hook_template_id.split('-')[0] ?? 'unknown';

  return {
    utm_source: 'meta',
    utm_medium: bundle.asset.kind === 'video' ? 'video' : 'image',
    utm_campaign: `estrevia_launch_${bundle.locale}`,
    utm_content: bundle.id,
    utm_term: archetype,
  };
}

// ---------------------------------------------------------------------------
// Upload pipeline
// ---------------------------------------------------------------------------

/**
 * Uploads an approved creative bundle to Meta Ads.
 *
 * Guards:
 * - Throws if `bundle.status !== 'approved'` (never upload unapproved creatives).
 *
 * Steps:
 * 1. Build UTM + tracking params
 * 2. Call Meta API uploadCreative
 * 3. Update DB row: status='uploaded', meta_ad_id set
 *
 * Returns the Meta ad id.
 */
export async function uploadApprovedCreative(
  bundle: CreativeBundle,
  deps: UploadDeps,
): Promise<{ meta_ad_id: string }> {
  if (bundle.status !== 'approved') {
    throw new Error(
      `Cannot upload creative "${bundle.id}": status is "${bundle.status}", expected "approved".`,
    );
  }

  const tracking = buildTrackingParams(bundle);

  const metaResult = await deps.metaApi.uploadCreative({
    asset_url: bundle.asset.url,
    copy: bundle.copy,
    cta: bundle.cta,
    locale: bundle.locale,
    tracking,
  });

  // Persist upload result to DB
  await deps.db
    .update(advertisingCreatives)
    .set({
      status: 'uploaded',
      metaAdId: metaResult.ad_id,
    })
    .where(eq(advertisingCreatives.id, bundle.id));

  return { meta_ad_id: metaResult.ad_id };
}
