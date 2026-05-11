import { nanoid } from 'nanoid';
import { desc, eq } from 'drizzle-orm';
import { getDb } from '@/shared/lib/db';
import { advertisingBrandVoiceScores } from '@/shared/lib/schema';
import type { BrandVoiceScore } from '@/shared/types/advertising';

export interface BrandVoiceRun {
  run_id: string;
  reviewed_at: Date;
  scores: BrandVoiceScore[];
}

/**
 * Persists a batch of BrandVoiceScore[] as one audit run. All rows share a
 * single run_id so the reader can group them. Empty input is a no-op
 * (no INSERT performed; run_id is still generated for caller logging).
 */
export async function saveBrandVoiceScores(
  scores: BrandVoiceScore[],
): Promise<{ run_id: string; saved_count: number }> {
  const runId = nanoid();
  if (scores.length === 0) return { run_id: runId, saved_count: 0 };
  const rows = scores.map((s) => ({
    id: nanoid(),
    runId,
    adId: s.ad_id,
    depth: s.depth,
    scientific: s.scientific,
    respectful: s.respectful,
    noManipulation: s.no_manipulation,
    overall: s.overall,
    needsReview: s.needs_review,
    reviewedByClaudeAt: s.reviewed_by_claude_at,
  }));
  await getDb().insert(advertisingBrandVoiceScores).values(rows);
  return { run_id: runId, saved_count: rows.length };
}

/**
 * Returns the most recent audit run (all rows sharing the latest run_id),
 * or null if no scores have ever been recorded.
 */
export async function getLatestBrandVoiceRun(): Promise<BrandVoiceRun | null> {
  const db = getDb();
  const latest = await db
    .select({
      runId: advertisingBrandVoiceScores.runId,
      reviewedAt: advertisingBrandVoiceScores.reviewedByClaudeAt,
    })
    .from(advertisingBrandVoiceScores)
    .orderBy(desc(advertisingBrandVoiceScores.reviewedByClaudeAt))
    .limit(1);
  if (latest.length === 0) return null;
  const { runId, reviewedAt } = latest[0];

  const rows = await db
    .select()
    .from(advertisingBrandVoiceScores)
    .where(eq(advertisingBrandVoiceScores.runId, runId));
  return {
    run_id: runId,
    reviewed_at: reviewedAt,
    scores: rows.map((r) => ({
      ad_id: r.adId,
      depth: r.depth,
      scientific: r.scientific,
      respectful: r.respectful,
      no_manipulation: r.noManipulation,
      overall: r.overall,
      needs_review: r.needsReview,
      reviewed_by_claude_at: r.reviewedByClaudeAt,
    })),
  };
}
