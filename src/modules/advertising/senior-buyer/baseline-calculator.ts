/**
 * Baseline calculator — pure statistics for the senior-media-buyer mode.
 *
 * Used by the auto-calibrator to derive thresholds (mean / stddev / percentiles)
 * from historical metric samples (e.g., CPC, CPM, CTR, CPA per ad set). Outlier
 * trimming suppresses the influence of anomalous extremes before stats are
 * computed, so the thresholds reflect the typical operating range.
 *
 * Pure functions: no I/O, no DB, no clock. Caller is responsible for sourcing
 * the input array (e.g., from a comparable-window query).
 */

export interface Baseline {
  mean: number;
  stddev: number;
  p25: number;
  p50: number;
  p75: number;
  sample_count: number;
}

/**
 * Removes the top and bottom `pct` proportion of values from the sorted array.
 * `pct = 0.10` means drop 10% from each end. Used by the auto-calibrator to
 * suppress extreme outliers before deriving thresholds.
 *
 * Edge cases:
 * - empty input → []
 * - pct ≤ 0 → returns the values sorted ascending, otherwise unchanged
 * - over-trim (pct ≥ 0.5 on small arrays) → []
 */
export function trimOutliers(values: number[], pct: number): number[] {
  if (values.length === 0) return [];
  const sorted = [...values].sort((a, b) => a - b);
  if (pct <= 0) return sorted;
  const dropCount = Math.floor(sorted.length * pct);
  return sorted.slice(dropCount, sorted.length - dropCount);
}

/**
 * Computes mean, population stddev, and quartiles (p25 / p50 / p75) for the
 * given samples. Returns a zero-filled sentinel baseline for empty input so
 * callers can rely on the shape without null-checks.
 */
export function calculateBaseline(values: number[]): Baseline {
  if (values.length === 0) {
    return { mean: 0, stddev: 0, p25: 0, p50: 0, p75: 0, sample_count: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((acc, v) => acc + v, 0) / n;
  const variance =
    sorted.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / n;
  const stddev = Math.sqrt(variance);

  return {
    mean,
    stddev,
    p25: percentile(sorted, 0.25),
    p50: percentile(sorted, 0.5),
    p75: percentile(sorted, 0.75),
    sample_count: n,
  };
}

/**
 * Linear-interpolation percentile on a pre-sorted ascending array.
 * Returns 0 for empty input as a defensive default; callers that pass
 * unsorted input will get incorrect results.
 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}
