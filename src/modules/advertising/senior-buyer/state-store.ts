import { eq, inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import { getDb } from '@/shared/lib/db';
import {
  advertisingAdSetState,
  advertisingAdSetPhaseTransitions,
  type AdvertisingAdSetState,
} from '@/shared/lib/schema';

import type { DataMaturityMode } from './data-maturity-classifier';

export type Phase = 'A' | 'B' | 'C' | 'D' | 'PAUSED' | 'RETIRED';

export type AdSetState = AdvertisingAdSetState;

export interface UpsertAdSetStateInput {
  adSetId: string;
  campaignId: string;
  locale: string;
  currentPhase?: Phase;
  dataMaturityMode?: DataMaturityMode;
  optimizationEvent?: string;
  conversions7dMeta?: number;
  conversions14dMeta?: number;
  conversionsTotalMeta?: number;
  daysWithPixelData?: number;
  conversions7dPosthog?: number;
  roas7d?: number | null;
  cpa7d?: number | null;
  frequencyCurrent?: number | null;
  parentAdSetId?: string | null;
  duplicatesCount?: number;
  flaggedForReview?: boolean;
  flagReason?: string | null;
}

/**
 * Per-ad-set CRUD on `advertising_ad_set_state` and append-only audit writes
 * to `advertising_ad_set_phase_transitions` (spec lines 2747-3017).
 */
export async function getAdSetState(adSetId: string): Promise<AdSetState | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(advertisingAdSetState)
    .where(eq(advertisingAdSetState.adSetId, adSetId))
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertAdSetState(input: UpsertAdSetStateInput): Promise<void> {
  const db = getDb();
  const now = new Date();

  const existing = await db
    .select({ adSetId: advertisingAdSetState.adSetId })
    .from(advertisingAdSetState)
    .where(eq(advertisingAdSetState.adSetId, input.adSetId))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(advertisingAdSetState)
      .set({
        ...stripUndefined(input),
        updatedAt: now,
      })
      .where(eq(advertisingAdSetState.adSetId, input.adSetId));
    return;
  }

  await db.insert(advertisingAdSetState).values({
    adSetId: input.adSetId,
    campaignId: input.campaignId,
    locale: input.locale,
    currentPhase: input.currentPhase ?? 'A',
    phaseEnteredAt: now,
    dataMaturityMode: input.dataMaturityMode ?? 'COLD_START',
    maturityEnteredAt: now,
    optimizationEvent: input.optimizationEvent ?? 'landing_page_view',
    conversions7dMeta: input.conversions7dMeta ?? 0,
    conversions14dMeta: input.conversions14dMeta ?? 0,
    conversionsTotalMeta: input.conversionsTotalMeta ?? 0,
    daysWithPixelData: input.daysWithPixelData ?? 0,
    conversions7dPosthog: input.conversions7dPosthog ?? 0,
    roas7d: input.roas7d ?? null,
    cpa7d: input.cpa7d ?? null,
    frequencyCurrent: input.frequencyCurrent ?? null,
    parentAdSetId: input.parentAdSetId ?? null,
    duplicatesCount: input.duplicatesCount ?? 0,
    lastActionTakenAt: null,
    flaggedForReview: input.flaggedForReview ?? false,
    flagReason: input.flagReason ?? null,
    updatedAt: now,
  });
}

export async function listAdSetsByPhase(phases: Phase[]): Promise<AdSetState[]> {
  const db = getDb();
  return await db
    .select()
    .from(advertisingAdSetState)
    .where(inArray(advertisingAdSetState.currentPhase, phases));
}

export async function listAdSetsByIds(ids: string[]): Promise<AdSetState[]> {
  if (ids.length === 0) return [];
  const db = getDb();
  return await db
    .select()
    .from(advertisingAdSetState)
    .where(inArray(advertisingAdSetState.adSetId, ids));
}

export async function recordPhaseTransition(
  adSetId: string,
  from: Phase,
  to: Phase,
  reason: string,
  metricSnapshot: Record<string, unknown>,
): Promise<void> {
  const db = getDb();
  await db.insert(advertisingAdSetPhaseTransitions).values({
    id: nanoid(),
    adSetId,
    transitionKind: 'phase',
    fromValue: from,
    toValue: to,
    reason,
    metricSnapshot,
    triggeredAt: new Date(),
  });
}

export async function recordMaturityTransition(
  adSetId: string,
  from: DataMaturityMode,
  to: DataMaturityMode,
  reason: string,
  metricSnapshot: Record<string, unknown>,
): Promise<void> {
  const db = getDb();
  await db.insert(advertisingAdSetPhaseTransitions).values({
    id: nanoid(),
    adSetId,
    transitionKind: 'maturity',
    fromValue: from,
    toValue: to,
    reason,
    metricSnapshot,
    triggeredAt: new Date(),
  });
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  const out: Partial<T> = {};
  for (const k of Object.keys(o) as Array<keyof T>) {
    if (o[k] !== undefined) out[k] = o[k];
  }
  return out;
}
