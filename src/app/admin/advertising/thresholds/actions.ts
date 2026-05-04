'use server';

/**
 * Server actions for /admin/advertising/thresholds.
 *
 * `saveThresholdAction` inserts a new `advertising_thresholds` row with
 * `source='founder_override'`. The threshold-resolver (most-recent
 * `effective_from` wins) makes the new row immediately effective. We never
 * mutate or delete existing rows so history stays intact for audit/drill-down.
 */

import { nanoid } from 'nanoid';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { getDb } from '@/shared/lib/db';
import { advertisingThresholds } from '@/shared/lib/schema';
import { COLD_START_DEFAULTS } from '@/modules/advertising/senior-buyer/targets';

const SaveSchema = z.object({
  scope: z.enum(['global', 'campaign', 'ad_set']),
  scope_id: z.string().nullable(),
  metric_name: z
    .string()
    .refine((v) => v in COLD_START_DEFAULTS, { message: 'unknown metric' }),
  value: z.number().positive(),
  notes: z.string().max(500).optional(),
});

export async function saveThresholdAction(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = SaveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.message };

  const { scope, scope_id, metric_name, value, notes } = parsed.data;

  try {
    await getDb().insert(advertisingThresholds).values({
      id: nanoid(),
      scope,
      scopeId: scope_id,
      metricName: metric_name,
      value,
      source: 'founder_override',
      effectiveFrom: new Date(),
      changedBy: 'founder',
      notes: notes ?? null,
      createdAt: new Date(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'insert failed';
    return { ok: false, error: message };
  }

  revalidatePath('/admin/advertising/thresholds');
  return { ok: true };
}
