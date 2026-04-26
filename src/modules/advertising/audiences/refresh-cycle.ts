import { refreshExclusions, type ExclusionsDeps, type ExclusionsResult } from './exclusions';
import { refreshRetargeting, type RetargetingDeps, type RetargetingResult } from './retargeting';

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type AudienceRefreshOutcome =
  | { kind: 'exclusion'; result: ExclusionsResult; error?: never }
  | { kind: 'exclusion'; result?: never; error: string }
  | { kind: 'retargeting'; result: RetargetingResult; error?: never }
  | { kind: 'retargeting'; result?: never; error: string };

export interface DailyRefreshReport {
  ran_at: Date;
  outcomes: AudienceRefreshOutcome[];
  total_audiences: number;
  failed_audiences: number;
}

// ---------------------------------------------------------------------------
// Deps
// ---------------------------------------------------------------------------

export interface RefreshCycleDeps {
  exclusions: ExclusionsDeps;
  retargeting: RetargetingDeps;
  /** Override "now" for deterministic tests. */
  now?: Date;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Orchestrates daily refresh of all audience types.
 *
 * Runs exclusions and retargeting sequentially (exclusions first as they
 * affect ad spend immediately). Partial failures are captured — one audience
 * failing does not abort the others. Returns a full report of outcomes.
 *
 * Called by the `/api/cron/advertising/audience-refresh` cron handler (Stream 9).
 */
export async function runDailyAudienceRefresh(deps: RefreshCycleDeps): Promise<DailyRefreshReport> {
  const ran_at = deps.now ?? new Date();
  const outcomes: AudienceRefreshOutcome[] = [];

  // --- Exclusions ---
  try {
    const result = await refreshExclusions({ ...deps.exclusions, now: ran_at });
    outcomes.push({ kind: 'exclusion', result });

    if (result.skipped) {
      console.info('[audience-refresh] exclusions skipped:', result.reason);
    } else {
      console.info(
        `[audience-refresh] exclusions refreshed — audience_id=${result.audience_id} size=${result.size}`,
      );
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error('[audience-refresh] exclusions failed:', error);
    outcomes.push({ kind: 'exclusion', error });
  }

  // --- Retargeting ---
  try {
    const result = await refreshRetargeting({ ...deps.retargeting, now: ran_at });
    outcomes.push({ kind: 'retargeting', result });

    const cnr = result.calc_no_register;
    const rnp = result.register_no_paid;
    console.info(
      `[audience-refresh] retargeting refreshed — ` +
        `calc_no_register size=${cnr.size} activated=${cnr.activated_in_meta} | ` +
        `register_no_paid size=${rnp.size} activated=${rnp.activated_in_meta}`,
    );
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error('[audience-refresh] retargeting failed:', error);
    outcomes.push({ kind: 'retargeting', error });
  }

  const failed_audiences = outcomes.filter((o) => o.error !== undefined).length;

  return {
    ran_at,
    outcomes,
    total_audiences: outcomes.length,
    failed_audiences,
  };
}
