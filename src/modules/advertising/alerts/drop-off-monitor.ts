/**
 * Drop-off monitor for the advertising funnel.
 *
 * Maintains a 14-day rolling baseline of conversion rates per funnel step.
 * Each day, compares today's rates against the baseline. If any step deviates
 * by more than 30%, sends a Telegram alert and optionally asks Claude for
 * context ("What might cause this drop?").
 *
 * Baseline accumulation:
 *   - For the first 14 days, the monitor is in "collection only" mode.
 *   - Alerts only fire once ≥14 baseline snapshots have been recorded.
 *
 * Design: all external dependencies are injected (PostHog client, Telegram bot,
 * optional Claude client, optional DB/store) so the monitor is fully testable
 * without side effects.
 */

import type { FunnelSnapshot, FunnelEvent } from '@/shared/types/advertising';
import type { TelegramBot } from './telegram-bot';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FunnelBaseline {
  /** Map of event_name → average conversion_from_previous over baseline window */
  rates: Map<string, number>;
  /** Number of daily snapshots included in this baseline */
  sample_count: number;
}

export interface DropOffAlert {
  step: string;
  baseline_rate: number;
  today_rate: number;
  delta_pct: number; // signed, e.g. -0.35 means 35% drop
}

export interface DropOffCheckResult {
  status: 'collecting_baseline' | 'ok' | 'alert_sent';
  baseline_sample_count: number;
  alerts: DropOffAlert[];
  llm_context?: string;
}

/** Minimal PostHog client interface needed by the monitor */
export interface DropOffPosthogClient {
  getFunnel(opts: {
    date_from: string;
    date_to: string;
    filters?: { utm_source?: string; ad_id?: string };
  }): Promise<FunnelSnapshot>;
}

/** Minimal Claude client interface for anomaly context */
export interface DropOffClaudeClient {
  anomalyExplain(prompt: string): Promise<string>;
}

/** Storage interface for persisting daily funnel snapshots */
export interface DropOffStore {
  /**
   * Appends a funnel snapshot for the given date.
   * Implementations may cap the store at BASELINE_WINDOW days.
   */
  appendSnapshot(date: string, snapshot: FunnelSnapshot): Promise<void>;

  /**
   * Returns all stored snapshots (up to BASELINE_WINDOW) in chronological order.
   */
  listSnapshots(): Promise<Array<{ date: string; snapshot: FunnelSnapshot }>>;
}

export interface RunDailyDropOffCheckDeps {
  posthog: DropOffPosthogClient;
  telegram: TelegramBot;
  store: DropOffStore;
  claude?: DropOffClaudeClient;
  /** Today's date string (YYYY-MM-DD). Injected for testability. Defaults to UTC today. */
  today?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const BASELINE_WINDOW_DAYS = 14;
export const DROP_OFF_THRESHOLD = 0.30; // 30% deviation triggers an alert

// ---------------------------------------------------------------------------
// In-memory store implementation (used when no persistent store is provided)
// ---------------------------------------------------------------------------

export class InMemoryDropOffStore implements DropOffStore {
  private snapshots: Array<{ date: string; snapshot: FunnelSnapshot }> = [];

  async appendSnapshot(date: string, snapshot: FunnelSnapshot): Promise<void> {
    // Remove duplicate for the same date if re-run
    this.snapshots = this.snapshots.filter((s) => s.date !== date);
    this.snapshots.push({ date, snapshot });
    // Keep only the last BASELINE_WINDOW_DAYS + 1 entries:
    // today's snapshot + up to BASELINE_WINDOW_DAYS historical days.
    const maxEntries = BASELINE_WINDOW_DAYS + 1;
    if (this.snapshots.length > maxEntries) {
      this.snapshots = this.snapshots.slice(-maxEntries);
    }
  }

  async listSnapshots(): Promise<Array<{ date: string; snapshot: FunnelSnapshot }>> {
    return [...this.snapshots];
  }

  /** Helper for tests: seed a specific number of snapshots */
  seedSnapshots(snapshots: Array<{ date: string; snapshot: FunnelSnapshot }>): void {
    this.snapshots = snapshots.slice(-(BASELINE_WINDOW_DAYS + 1));
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function utcTodayString(): string {
  return new Date().toISOString().slice(0, 10);
}

function computeBaseline(
  snapshots: Array<{ date: string; snapshot: FunnelSnapshot }>,
): FunnelBaseline {
  const accumulated = new Map<string, number[]>();

  for (const { snapshot } of snapshots) {
    for (const step of snapshot.steps) {
      const existing = accumulated.get(step.event_name) ?? [];
      existing.push(step.conversion_from_previous);
      accumulated.set(step.event_name, existing);
    }
  }

  const rates = new Map<string, number>();
  for (const [name, values] of accumulated.entries()) {
    const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
    rates.set(name, avg);
  }

  return { rates, sample_count: snapshots.length };
}

function detectDropOffs(
  baseline: FunnelBaseline,
  todaySteps: FunnelEvent[],
): DropOffAlert[] {
  const alerts: DropOffAlert[] = [];

  for (const step of todaySteps) {
    const baselineRate = baseline.rates.get(step.event_name);
    if (baselineRate === undefined) continue; // new step not in baseline — skip

    // Avoid false positives when baseline is near-zero
    if (baselineRate < 0.01) continue;

    const delta = (step.conversion_from_previous - baselineRate) / baselineRate;
    if (Math.abs(delta) >= DROP_OFF_THRESHOLD) {
      alerts.push({
        step: step.event_name,
        baseline_rate: baselineRate,
        today_rate: step.conversion_from_previous,
        delta_pct: delta,
      });
    }
  }

  return alerts;
}

function formatAlertMessage(date: string, alerts: DropOffAlert[], llmContext?: string): string {
  const lines: string[] = [];

  lines.push(`🚨 *Funnel drop-off detected — ${date}*`);
  lines.push('');

  for (const a of alerts) {
    const direction = a.delta_pct < 0 ? '📉' : '📈';
    const pct = (Math.abs(a.delta_pct) * 100).toFixed(1);
    lines.push(
      `${direction} \`${a.step}\`: baseline ${(a.baseline_rate * 100).toFixed(1)}% → today ${(a.today_rate * 100).toFixed(1)}% (${a.delta_pct < 0 ? '-' : '+'}${pct}%)`,
    );
  }

  if (llmContext) {
    lines.push('');
    lines.push('*Possible context (Claude):*');
    lines.push(llmContext);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main exported function
// ---------------------------------------------------------------------------

/**
 * Runs the daily drop-off check.
 *
 * Fetches today's funnel snapshot, appends to the store, then compares
 * against the 14-day baseline. In "collecting baseline" mode (< 14 days),
 * no alert is sent.
 */
export async function runDailyDropOffCheck(
  deps: RunDailyDropOffCheckDeps,
): Promise<DropOffCheckResult> {
  const { posthog, telegram, store, claude, today } = deps;
  const dateStr = today ?? utcTodayString();

  // Fetch today's snapshot
  const windowStart = new Date(`${dateStr}T00:00:00Z`);
  const windowEnd = new Date(`${dateStr}T23:59:59Z`);

  const todaySnapshot = await posthog.getFunnel({
    date_from: windowStart.toISOString(),
    date_to: windowEnd.toISOString(),
  });

  // Append to store before computing baseline (today is counted in next run)
  await store.appendSnapshot(dateStr, todaySnapshot);

  // Load existing snapshots (excludes today — it was just appended)
  const allSnapshots = await store.listSnapshots();
  // Exclude today from baseline (we compare against historical only)
  const baselineSnapshots = allSnapshots.filter((s) => s.date !== dateStr);

  if (baselineSnapshots.length < BASELINE_WINDOW_DAYS) {
    return {
      status: 'collecting_baseline',
      baseline_sample_count: baselineSnapshots.length,
      alerts: [],
    };
  }

  const baseline = computeBaseline(baselineSnapshots);
  const alerts = detectDropOffs(baseline, todaySnapshot.steps);

  if (alerts.length === 0) {
    return {
      status: 'ok',
      baseline_sample_count: baselineSnapshots.length,
      alerts: [],
    };
  }

  // Ask Claude for context if client is provided
  let llmContext: string | undefined;
  if (claude) {
    const prompt =
      `The following funnel steps showed unusual conversion rate changes on ${dateStr}:\n` +
      alerts
        .map(
          (a) =>
            `- ${a.step}: baseline ${(a.baseline_rate * 100).toFixed(1)}% → today ${(a.today_rate * 100).toFixed(1)}%`,
        )
        .join('\n') +
      '\n\nWhat might cause these drops? Consider: product changes, seasonal effects, campaign changes, technical issues.';

    llmContext = await claude.anomalyExplain(prompt).catch((err) => {
      console.error('[drop-off-monitor] Claude anomalyExplain failed:', err);
      return undefined;
    });
  }

  // Send Telegram alert
  const message = formatAlertMessage(dateStr, alerts, llmContext);
  await telegram.sendAlert('warning', message);

  return {
    status: 'alert_sent',
    baseline_sample_count: baselineSnapshots.length,
    alerts,
    llm_context: llmContext,
  };
}
