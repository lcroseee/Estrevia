/**
 * Drizzle-backed CRUD for the `advertising_audiences` table used by the
 * audience-refresh cron's exclusion + retargeting paths.
 *
 * Implements the `ExclusionsDbClient.upsertAudienceRow` and
 * `RetargetingDbClient.upsertAudienceRow` interfaces declared in
 * `exclusions.ts` and `retargeting.ts`. Both interfaces resolve to the same
 * shape — full `AdvertisingAudience` row select model.
 *
 * Upsert behaviour: lookup-by-kind (rather than by id) because each
 * `AudienceKind` uniquely identifies a single agent-managed audience. The
 * 4 kinds are `exclusion`, `retargeting_calc_no_register`,
 * `retargeting_register_no_paid`, and `lookalike_seed`.
 */

import { eq } from 'drizzle-orm';
import type { InferSelectModel } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb } from '@/shared/lib/db';
import { advertisingAudiences } from '@/shared/lib/schema';

type AudienceRow = InferSelectModel<typeof advertisingAudiences>;

export type UpsertAudienceRowInput = Omit<AudienceRow, 'id'> & { id?: string };

/**
 * Inserts a new row or updates an existing one keyed by `kind`.
 * Returns the full persisted `AudienceRow`.
 */
export async function upsertAudienceRow(row: UpsertAudienceRowInput): Promise<AudienceRow> {
  const db = getDb();

  const existing = await db
    .select({ id: advertisingAudiences.id })
    .from(advertisingAudiences)
    .where(eq(advertisingAudiences.kind, row.kind))
    .limit(1);

  if (existing.length > 0) {
    const id = existing[0].id;
    await db
      .update(advertisingAudiences)
      .set({
        metaAudienceId: row.metaAudienceId,
        size: row.size,
        lastRefreshedAt: row.lastRefreshedAt,
        sourceQuery: row.sourceQuery,
        activeInCampaigns: row.activeInCampaigns,
      })
      .where(eq(advertisingAudiences.id, id));
    return { ...row, id } as AudienceRow;
  }

  const id = row.id ?? nanoid();
  await db.insert(advertisingAudiences).values({
    id,
    kind: row.kind,
    metaAudienceId: row.metaAudienceId,
    size: row.size,
    lastRefreshedAt: row.lastRefreshedAt,
    sourceQuery: row.sourceQuery,
    activeInCampaigns: row.activeInCampaigns,
  });
  return { ...row, id } as AudienceRow;
}
