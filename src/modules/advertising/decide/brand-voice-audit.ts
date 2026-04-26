/**
 * Brand Voice Audit — Task 7.2
 *
 * Picks the top-N creatives by spend_usd from the provided scored data,
 * calls claudeClient.brandVoiceScore for each, and applies review thresholds:
 *   - weighted overall = depth*0.3 + scientific*0.3 + respectful*0.3 + (no_manipulation ? 1 : 0)
 *   - needs_review = true when overall < 7.5 OR any dimension score < 6
 *
 * Drift alerts and Telegram notifications are NOT emitted here (S9 responsibility).
 * Callers (orchestrator) receive the raw BrandVoiceScore[] and decide whether to alert.
 */

import type { CreativeBundle, BrandVoiceScore } from '@/shared/types/advertising';

// ---- thresholds --------------------------------------------------------------

/** How many top-spend creatives to audit per run. */
const TOP_N = 10;

/** Weighted overall score below which needs_review is flagged. */
const OVERALL_REVIEW_THRESHOLD = 7.5;

/** Any individual dimension below this triggers needs_review. */
const DIMENSION_MIN_THRESHOLD = 6;

// ---- Claude client interface (minimal, injected) ----------------------------

export interface ClaudeClientForBrandVoice {
  brandVoiceScore(adId: string, copy: string): Promise<{
    depth: number;
    scientific: number;
    respectful: number;
    no_manipulation: boolean;
    overall: number;
  }>;
}

// ---- Scored creative shape --------------------------------------------------

/**
 * Extend CreativeBundle with spend_usd for ranking purposes.
 * The orchestrator passes this from Meta Insights data merged with creatives.
 */
export interface CreativeBundleWithSpend extends CreativeBundle {
  spend_usd: number;
}

// ---- public API -------------------------------------------------------------

/**
 * Compute weighted overall brand voice score.
 *
 * Formula: depth*0.3 + scientific*0.3 + respectful*0.3 + (no_manipulation ? 1 : 0)
 * Maximum possible: 9 + 1 = 10
 */
export function computeWeightedOverall(
  depth: number,
  scientific: number,
  respectful: number,
  no_manipulation: boolean,
): number {
  return depth * 0.3 + scientific * 0.3 + respectful * 0.3 + (no_manipulation ? 1 : 0);
}

/**
 * Determine whether a creative needs review.
 *
 * Flags needs_review when:
 *   - weighted overall < OVERALL_REVIEW_THRESHOLD (7.5), OR
 *   - any individual dimension (depth, scientific, respectful) < DIMENSION_MIN_THRESHOLD (6)
 */
export function needsReview(
  overall: number,
  depth: number,
  scientific: number,
  respectful: number,
): boolean {
  if (overall < OVERALL_REVIEW_THRESHOLD) return true;
  if (depth < DIMENSION_MIN_THRESHOLD) return true;
  if (scientific < DIMENSION_MIN_THRESHOLD) return true;
  if (respectful < DIMENSION_MIN_THRESHOLD) return true;
  return false;
}

/**
 * Audit the top-N creatives by spend.
 *
 * @param creatives   Array of CreativeBundleWithSpend (includes spend_usd for ranking)
 * @param claudeClient Injected Claude API client (use mockClaudeApi in tests)
 * @returns           Array of BrandVoiceScore for each audited creative
 */
export async function auditTopCreatives(
  creatives: CreativeBundleWithSpend[],
  claudeClient: ClaudeClientForBrandVoice,
): Promise<BrandVoiceScore[]> {
  // Pick top N by spend_usd descending
  const topCreatives = [...creatives]
    .sort((a, b) => b.spend_usd - a.spend_usd)
    .slice(0, TOP_N);

  const results: BrandVoiceScore[] = [];

  for (const creative of topCreatives) {
    const raw = await claudeClient.brandVoiceScore(creative.id, creative.copy);

    const overall = computeWeightedOverall(
      raw.depth,
      raw.scientific,
      raw.respectful,
      raw.no_manipulation,
    );

    const review = needsReview(overall, raw.depth, raw.scientific, raw.respectful);

    results.push({
      ad_id: creative.id,
      depth: raw.depth,
      scientific: raw.scientific,
      respectful: raw.respectful,
      no_manipulation: raw.no_manipulation,
      overall,
      needs_review: review,
      reviewed_by_claude_at: new Date(),
    });
  }

  return results;
}

export { TOP_N, OVERALL_REVIEW_THRESHOLD, DIMENSION_MIN_THRESHOLD };
