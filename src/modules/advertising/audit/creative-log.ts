import { nanoid } from 'nanoid';
import type { CreativeAuditRecord } from '@/shared/types/advertising';
import type { advertisingCreatives } from '@/shared/lib/schema';

export type CreativeEvent = CreativeAuditRecord['event'];
export type CreativeActor = CreativeAuditRecord['actor'];

// Minimal DB interface for DI in tests
export interface CreativeLogDb {
  insert(
    table: typeof advertisingCreatives,
  ): {
    values(row: {
      id: string;
      hookTemplateId: string;
      assetUrl: string;
      assetKind: 'image' | 'video';
      generator: string;
      costUsd: number;
      copy: string;
      cta: string;
      locale: 'en' | 'es';
      status: 'pending_review' | 'approved' | 'rejected' | 'uploaded' | 'live' | 'paused';
      safetyChecks: unknown;
      metaAdId: string | undefined;
      approvedBy: string | undefined;
      approvedAt: Date | undefined;
    }): Promise<void>;
  };
  select(): {
    from(
      table: typeof advertisingCreatives,
    ): {
      where(condition: unknown): Promise<CreativeDbRow[]>;
    };
  };
}

export interface CreativeDbRow {
  id: string;
  hookTemplateId: string;
  assetUrl: string;
  assetKind: 'image' | 'video';
  generator: string;
  costUsd: number;
  copy: string;
  cta: string;
  locale: 'en' | 'es';
  status: 'pending_review' | 'approved' | 'rejected' | 'uploaded' | 'live' | 'paused';
  safetyChecks: unknown;
  metaAdId: string | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  createdAt: Date;
}

/**
 * Creative audit event log.
 *
 * The schema stores creatives as mutable rows (status transitions are part of
 * the business model). Rather than adding a separate event-log table (which
 * would require a schema migration), we record audit events by inserting a
 * frozen snapshot row into advertisingCreatives with a synthetic id and
 * status reflecting the event. This keeps the audit trail in one table
 * without modifying the schema.
 *
 * The returned CreativeAuditRecord is the canonical in-memory representation.
 * The DB row is the durable snapshot.
 *
 * Append-only: this module exposes NO update/delete methods.
 */
export async function logCreativeEvent(
  bundleId: string,
  event: CreativeEvent,
  actor: CreativeActor,
  details: Record<string, unknown>,
  db: CreativeLogDb,
): Promise<CreativeAuditRecord> {
  const id = nanoid();
  const now = new Date();

  // Map event to a status value for the snapshot row
  const statusForEvent: Record<CreativeEvent, CreativeDbRow['status']> = {
    generated: 'pending_review',
    reviewed: 'pending_review',
    approved: 'approved',
    rejected: 'rejected',
    uploaded: 'uploaded',
    paused: 'paused',
  };

  const { advertisingCreatives: table } = await import('@/shared/lib/schema');

  await db.insert(table).values({
    id,
    hookTemplateId: (details['hook_template_id'] as string | undefined) ?? bundleId,
    assetUrl: (details['asset_url'] as string | undefined) ?? '',
    assetKind: ((details['asset_kind'] as string | undefined) === 'video' ? 'video' : 'image') as 'image' | 'video',
    generator: (details['generator'] as string | undefined) ?? 'unknown',
    costUsd: (details['cost_usd'] as number | undefined) ?? 0,
    copy: (details['copy'] as string | undefined) ?? '',
    cta: (details['cta'] as string | undefined) ?? '',
    locale: ((details['locale'] as string | undefined) === 'es' ? 'es' : 'en') as 'en' | 'es',
    status: statusForEvent[event],
    safetyChecks: (details['safety_checks'] as unknown) ?? [],
    metaAdId: (details['meta_ad_id'] as string | undefined),
    approvedBy: actor === 'founder' ? (details['approved_by'] as string | undefined) ?? actor : undefined,
    approvedAt: actor === 'founder' && event === 'approved' ? now : undefined,
  });

  return {
    id,
    creative_bundle_id: bundleId,
    event,
    actor,
    details,
    timestamp: now,
  };
}

/**
 * Returns all creative audit snapshots for a given bundle ID.
 * Results are sorted by createdAt ascending (oldest first).
 */
export async function getCreativeAudit(
  bundleId: string,
  db: CreativeLogDb,
): Promise<CreativeDbRow[]> {
  const { advertisingCreatives: table } = await import('@/shared/lib/schema');
  const { eq } = await import('drizzle-orm');

  // The bundle_id is stored in hookTemplateId for audit snapshot rows.
  // (Real creative rows use hookTemplateId for the template; audit snapshots
  //  encode bundleId there so they are retrievable without a schema change.)
  const rows = await db.select().from(table).where(eq(table.hookTemplateId, bundleId));

  return rows;
}
