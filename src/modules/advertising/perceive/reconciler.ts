import type { AdMetric, FunnelSnapshot, ReconciliationResult } from '@/shared/types/advertising';
import type { MockTelegramBot } from '../__tests__/mocks/telegram';
import { suspend } from './recon-state-store';

export interface AlertBot {
  sendMessage(text: string): Promise<unknown>;
}

export interface ReconcileOptions {
  alertBot?: MockTelegramBot | AlertBot;
}

const THRESHOLD_MINOR: 0.10 = 0.10;
const THRESHOLD_CRITICAL: 0.25 = 0.25;
/** Default auto-resume window after a critical_drift suspend (hours). */
const SUSPEND_AUTO_RESUME_HOURS = 24;

/**
 * Pure synchronous reconciliation of Meta click count vs PostHog landing_view count.
 *
 * Thresholds per spec:
 *   delta_pct < 0.10  → match
 *   delta_pct < 0.25  → minor_drift
 *   delta_pct >= 0.25 → critical_drift
 *
 * When posthog_landings is 0, delta_pct is set to 1.0 to avoid NaN.
 *
 * Pass alertBot via opts to fire a Telegram message on critical_drift.
 * Returns a Promise so callers can await the alert; resolves with ReconciliationResult.
 */
export async function reconcile(
  meta: AdMetric[],
  funnel: FunnelSnapshot,
  opts: ReconcileOptions = {},
): Promise<ReconciliationResult> {
  const metaClicks = meta.reduce((acc, m) => acc + m.clicks, 0);
  const phLandings = funnel.steps.find((s) => s.event_name === 'landing_view')?.count ?? 0;

  const delta_pct = phLandings === 0 ? 1.0 : Math.abs(metaClicks - phLandings) / phLandings;

  const status: ReconciliationResult['status'] =
    delta_pct < THRESHOLD_MINOR
      ? 'match'
      : delta_pct < THRESHOLD_CRITICAL
      ? 'minor_drift'
      : 'critical_drift';

  const result: ReconciliationResult = {
    meta_clicks: metaClicks,
    posthog_landings: phLandings,
    delta_pct,
    status,
    threshold_minor: THRESHOLD_MINOR,
    threshold_critical: THRESHOLD_CRITICAL,
  };

  if (status === 'critical_drift') {
    if (opts.alertBot) {
      await opts.alertBot.sendMessage(
        `[perceive/reconciler] critical_drift detected — ` +
          `meta_clicks=${metaClicks}, posthog_landings=${phLandings}, ` +
          `delta_pct=${(delta_pct * 100).toFixed(1)}%`,
      );
    }

    // Trigger global agent suspend. The orchestrator gates non-emergency
    // decisions while suspended; the triage-daily cron auto-resumes after
    // the configured window. Founder can override via /admin/advertising/recon-state.
    await suspend(
      `critical_drift: meta=${metaClicks}, posthog=${phLandings}, delta=${(delta_pct * 100).toFixed(1)}%`,
      delta_pct,
      SUSPEND_AUTO_RESUME_HOURS,
    );

    if (opts.alertBot) {
      await opts.alertBot.sendMessage(
        `🚨 ADVERTISING AGENT SUSPENDED — reconciler critical_drift. ` +
          `All non-emergency decisions paused for ${SUSPEND_AUTO_RESUME_HOURS}h auto-resume. ` +
          `Investigate Pixel/PostHog drift. Founder unblock: /admin/advertising/recon-state`,
      );
    }
  }

  return result;
}
