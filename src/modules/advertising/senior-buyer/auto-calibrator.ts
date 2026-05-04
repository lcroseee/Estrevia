/**
 * Auto-calibrator — weekly + drift-triggered threshold updates.
 *
 * For each ad set in Phase B/C/D, pulls the last 30 days of metric history,
 * trims outliers, derives a new threshold value via per-metric formulas, and
 * writes an `auto_calibrated` row to `advertising_thresholds`.
 *
 * Four protections (per spec lines 736-810) keep the agent from runaway
 * recalibration:
 *  1. Minimum samples — skip if history.length < calibration_min_history_days
 *  2. Outlier rejection — drop top/bottom calibration_outlier_pct_to_drop
 *  3. Bounded change — > calibration_max_change_factor (2×) requires founder
 *     approval via Telegram (HIGH_RISK), no immediate write
 *  4. Sanity — reject NaN / negative results
 *
 * The drift trigger (`runDriftTriggeredCalibration`) only logs when a metric's
 * z-score crosses the drift threshold; the next weekly cron picks up the
 * actual recalibration to avoid thrashing on noisy single-day spikes.
 */

import { nanoid } from 'nanoid';

import { getDb } from '@/shared/lib/db';
import { advertisingThresholds } from '@/shared/lib/schema';

import {
  calculateBaseline,
  trimOutliers,
  type Baseline,
} from './baseline-calculator';
import { comparable } from './comparable-window';
import type { MetricHistoryRow } from './metric-history';
import { getRange } from './metric-history';
import { listAdSetsByPhase, type AdSetState } from './state-store';
import { COLD_START_DEFAULTS, type ThresholdName } from './targets';
import { resolveThreshold } from './threshold-resolver';

export interface AutoCalibratorDeps {
  telegramBot: {
    requestApproval(
      message: string,
      options: { riskLevel: 'HIGH_RISK' },
    ): Promise<{ approved: boolean }>;
  };
}

export interface CalibrationSummary {
  ad_sets_processed: number;
  thresholds_updated: number;
  approvals_requested: number;
  errors: number;
}

type CalibratableSource = 'ctr' | 'cpa' | 'roas' | 'frequency';

interface CalibratableMetric {
  source: CalibratableSource;
  threshold: ThresholdName;
  derive: (baseline: Baseline) => number;
}

/**
 * Metrics this calibrator updates each week. Each entry pairs a raw signal
 * (the `source` column or row-level derivation) with the threshold key it
 * controls and the formula that turns the baseline into a new value.
 *
 * Multiplier-style thresholds (e.g. `pause_cpa_threshold_multiplier`) keep a
 * fixed value unless the founder overrides it; the derive() still re-emits
 * the constant so the auto_calibrated row carries a fresh baseline snapshot.
 */
const CALIBRATABLE_METRICS: readonly CalibratableMetric[] = [
  // Multiplier — held at 2.0; only founder override changes it.
  { source: 'cpa', threshold: 'pause_cpa_threshold_multiplier', derive: () => 2.0 },
  // Target CPA — re-derived from observed mean cost per conversion.
  { source: 'cpa', threshold: 'target_cpa_subscription_usd', derive: (b) => b.mean },
  // Target ROAS — never below 1.0 (breakeven floor).
  { source: 'roas', threshold: 'target_roas_subscription', derive: (b) => Math.max(b.mean, 1.0) },
  // Frequency cap — mean + 2σ, capped at 5.0 to avoid drift past Meta sanity.
  {
    source: 'frequency',
    threshold: 'pause_frequency_threshold',
    derive: (b) => Math.min(5.0, b.mean + 2 * b.stddev),
  },
];

/**
 * Weekly cron entry point. Iterates Phase B/C/D ad sets and writes new
 * `auto_calibrated` threshold rows for any metric where the baseline has
 * shifted within the bounded-change envelope. Returns a counters summary
 * suitable for cron-job logging / Sentry breadcrumbs.
 */
export async function runWeeklyCalibration(
  deps: AutoCalibratorDeps,
): Promise<CalibrationSummary> {
  const summary: CalibrationSummary = {
    ad_sets_processed: 0,
    thresholds_updated: 0,
    approvals_requested: 0,
    errors: 0,
  };

  const adSets = await listAdSetsByPhase(['B', 'C', 'D']);
  for (const adSet of adSets) {
    summary.ad_sets_processed += 1;
    await calibrateAdSet(adSet, deps, summary);
  }

  return summary;
}

async function calibrateAdSet(
  adSet: AdSetState,
  deps: AutoCalibratorDeps,
  summary: CalibrationSummary,
): Promise<void> {
  const history = await getRange(
    adSet.adSetId,
    COLD_START_DEFAULTS.calibration_min_history_days,
  );

  // Protection 1: minimum samples
  if (history.length < COLD_START_DEFAULTS.calibration_min_history_days) return;

  for (const cfg of CALIBRATABLE_METRICS) {
    try {
      const values = extractValues(history, cfg.source);

      // Protection 2: outlier rejection
      const trimmed = trimOutliers(
        values,
        COLD_START_DEFAULTS.calibration_outlier_pct_to_drop,
      );
      if (trimmed.length < 5) continue;

      const baseline = calculateBaseline(trimmed);
      const newThreshold = cfg.derive(baseline);

      // Protection 4: sanity (NaN, ±Infinity, negative)
      if (!Number.isFinite(newThreshold) || newThreshold < 0) continue;

      const current = await resolveThreshold(cfg.threshold, {
        ad_set_id: adSet.adSetId,
        campaign_id: adSet.campaignId,
      });

      // Protection 3: bounded change. Compare both directions so the
      // protection fires for both growth (newer >> current) and shrinkage
      // (newer << current). When current is 0 we treat the change as
      // unbounded → request approval.
      const factor =
        current > 0
          ? Math.max(newThreshold / current, current / newThreshold)
          : Number.POSITIVE_INFINITY;
      if (factor > COLD_START_DEFAULTS.calibration_max_change_factor) {
        await deps.telegramBot.requestApproval(
          formatApprovalMessage({
            adSetId: adSet.adSetId,
            metric: cfg.threshold,
            current,
            proposed: newThreshold,
            baseline,
            factor,
          }),
          { riskLevel: 'HIGH_RISK' },
        );
        summary.approvals_requested += 1;
        continue;
      }

      await getDb().insert(advertisingThresholds).values({
        id: nanoid(),
        scope: 'ad_set',
        scopeId: adSet.adSetId,
        metricName: cfg.threshold,
        value: newThreshold,
        source: 'auto_calibrated',
        effectiveFrom: new Date(),
        baselineMetricSnapshot: baseline as unknown as Record<string, unknown>,
        changedBy: 'system_calibrator',
        createdAt: new Date(),
      });
      summary.thresholds_updated += 1;
    } catch (err) {
      summary.errors += 1;
      console.warn(
        `[auto-calibrator] ad_set=${adSet.adSetId} metric=${cfg.threshold} failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}

/**
 * Drift-triggered hook. Called from the perceive layer when a daily metric
 * spikes; emits a log line so we can correlate drift events to calibration
 * cycles. Intentionally does NOT recalibrate immediately — letting the next
 * weekly cron handle the actual write avoids thrashing on noisy single-day
 * outliers.
 */
export async function runDriftTriggeredCalibration(
  adSetId: string,
  campaignId: string,
): Promise<void> {
  // CPA isn't a stored column; use CPC as the cost-per-event proxy along
  // with CTR (engagement) and ROAS (revenue) for the drift sweep. We hold
  // `campaignId` in the signature so callers (cron route) can pass full
  // context once focused recalibration is wired up; for MVP it's logged.
  for (const metric of ['ctr', 'cpc', 'roas'] as const) {
    const result = await comparable(adSetId, metric);
    if (!result) continue;
    if (
      Math.abs(result.z_score) >
      COLD_START_DEFAULTS.calibration_drift_z_threshold
    ) {
      console.info(
        `[auto-calibrator] drift triggered on ${adSetId} (campaign ${campaignId})/${metric} z=${result.z_score.toFixed(2)}`,
      );
    }
  }
}

/**
 * Pulls a numeric series for the requested metric out of the metric-history
 * rows. CPA isn't a stored column — it's derived per-row as
 * spend_usd / conversions_meta, skipping rows with zero conversions to avoid
 * Infinity. ROAS is filtered to non-null finite values (the column is
 * nullable when revenue tracking hasn't kicked in yet).
 */
function extractValues(
  history: MetricHistoryRow[],
  source: CalibratableSource,
): number[] {
  switch (source) {
    case 'ctr':
      return history.map((s) => s.ctr).filter((v) => Number.isFinite(v));
    case 'cpa':
      return history
        .filter((s) => s.conversionsMeta > 0)
        .map((s) => s.spendUsd / s.conversionsMeta)
        .filter((v) => Number.isFinite(v));
    case 'roas':
      return history
        .map((s) => s.roas)
        .filter((v): v is number => v != null && Number.isFinite(v));
    case 'frequency':
      return history.map((s) => s.frequency).filter((v) => Number.isFinite(v));
  }
}

function formatApprovalMessage(input: {
  adSetId: string;
  metric: ThresholdName;
  current: number;
  proposed: number;
  baseline: Baseline;
  factor: number;
}): string {
  return (
    `🔧 *Auto-calibrator: ${input.factor.toFixed(2)}× change proposal*\n` +
    `Ad set: ${input.adSetId}\n` +
    `Metric: ${input.metric}\n` +
    `Current: ${input.current.toFixed(4)}\n` +
    `Proposed: ${input.proposed.toFixed(4)}\n` +
    `Baseline mean=${input.baseline.mean.toFixed(2)}, ` +
    `stddev=${input.baseline.stddev.toFixed(2)}, ` +
    `n=${input.baseline.sample_count}\n\n` +
    `Reply ✅ to apply, ❌ to keep current.`
  );
}
