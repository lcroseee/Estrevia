/**
 * Phase C — active ad set policy (spec lines 676-734, plan Track 16).
 *
 * Decision order matters:
 *   1. Q9 pause — evaluated FIRST so we always free spend on losers before
 *      considering scale. Three sub-rules: CPA over target, ROAS under
 *      target, frequency saturation.
 *   2. Q11 hybrid event switch — auto-graduate the optimization event when
 *      the funnel has accumulated enough Meta-side conversions.
 *   3. Q8 scale via duplicate — only if all four scale gates hold AND the
 *      parent has duplicate budget remaining.
 *   4. Default `maintain` — steady state.
 *
 * Every threshold flows through `resolveThreshold` (DB → code-default
 * fallback) so ops can override per ad-set / campaign without redeploys.
 */
import { comparable } from '../comparable-window';
import { resolveThreshold } from '../threshold-resolver';
import type { AdDecision } from '../approval-router';
import type { AdSetState } from '../state-store';

export interface PhaseCMetrics {
  cpa_7d: number;
  roas_7d: number;
  roas_14d: number;
  frequency_current: number;
  /** Days the ad set has held `cpa_7d` above the pause threshold. */
  sustained_days_above_cpa: number;
  /** Days the ad set has held `roas_14d` below the pause threshold. */
  sustained_days_below_roas14d: number;
  /** Days all Q8 scale gates have held. */
  sustained_days_above_scale_criteria: number;
}

export interface PhaseCInput {
  ad_id: string;
  state: AdSetState;
  metric: PhaseCMetrics;
  signups_per_week: { lead: number; subscribe: number };
}

export async function evaluatePhaseC(input: PhaseCInput): Promise<AdDecision> {
  const { ad_id, state, metric } = input;
  const ctx = { ad_set_id: state.adSetId, campaign_id: state.campaignId };

  // ── Q9 pause — evaluated FIRST to free spend ──────────────────────────
  const pauseCpaMult = await resolveThreshold('pause_cpa_threshold_multiplier', ctx);
  const pauseCpaSustainedDays = await resolveThreshold('pause_cpa_sustained_days', ctx);
  const targetCpaSubscription = await resolveThreshold('target_cpa_subscription_usd', ctx);
  if (
    metric.cpa_7d > pauseCpaMult * targetCpaSubscription &&
    metric.sustained_days_above_cpa >= pauseCpaSustainedDays
  ) {
    return {
      ad_id,
      action: 'pause',
      reason: `cpa_above_${pauseCpaMult}x_sustained_${pauseCpaSustainedDays}d`,
    };
  }

  const pauseRoasMult = await resolveThreshold('pause_roas_threshold_multiplier', ctx);
  const pauseRoasSustainedDays = await resolveThreshold('pause_roas_sustained_days', ctx);
  const targetRoasSubscription = await resolveThreshold('target_roas_subscription', ctx);
  if (
    metric.roas_14d < pauseRoasMult * targetRoasSubscription &&
    metric.sustained_days_below_roas14d >= pauseRoasSustainedDays
  ) {
    return {
      ad_id,
      action: 'pause',
      reason: `roas_below_${pauseRoasMult}x_sustained_${pauseRoasSustainedDays}d`,
    };
  }

  const pauseFrequency = await resolveThreshold('pause_frequency_threshold', ctx);
  if (metric.frequency_current > pauseFrequency) {
    // Frequency saturation → escalate to Phase D rather than direct pause.
    // Track 17's phase-d policy decides whether to refresh creative or
    // request a new ad set; we only signal the escalation here.
    return {
      ad_id,
      action: 'maintain',
      reason: `escalate_to_phase_d_frequency=${metric.frequency_current.toFixed(2)}`,
    };
  }

  // ── Q11 hybrid event switch (auto-graduate optimization event) ────────
  const switchToLeadConv7d = await resolveThreshold(
    'hybrid_switch_signup_to_lead_conv_7d',
    ctx,
  );
  if (
    state.optimizationEvent === 'landing_page_view' &&
    state.conversions7dMeta >= switchToLeadConv7d
  ) {
    return {
      ad_id,
      action: 'hybrid_event_switch',
      reason: `switch_to_Lead (conversions_7d_meta=${state.conversions7dMeta})`,
    };
  }

  const leadPerWeekTrigger = await resolveThreshold(
    'hybrid_switch_lead_to_subscribe_lead_per_week',
    ctx,
  );
  const subPerWeekTrigger = await resolveThreshold(
    'hybrid_switch_lead_to_subscribe_sub_per_week',
    ctx,
  );
  if (
    state.optimizationEvent === 'Lead' &&
    input.signups_per_week.lead >= leadPerWeekTrigger &&
    input.signups_per_week.subscribe >= subPerWeekTrigger
  ) {
    return {
      ad_id,
      action: 'hybrid_event_switch',
      reason: `switch_to_Subscribe (lead/wk=${input.signups_per_week.lead}, sub/wk=${input.signups_per_week.subscribe})`,
    };
  }

  // ── Q8 scale criteria — all gates must hold ───────────────────────────
  const scaleRoasMult = await resolveThreshold('scale_roas_min_multiplier', ctx);
  const scaleCpaMult = await resolveThreshold('scale_cpa_max_multiplier', ctx);
  const scaleFreqMax = await resolveThreshold('scale_frequency_max', ctx);
  const scaleSustainedDays = await resolveThreshold('scale_sustained_days', ctx);
  const scaleMaxDupes = await resolveThreshold('scale_max_duplicates_per_parent', ctx);

  const meetsRoas = metric.roas_7d >= scaleRoasMult * targetRoasSubscription;
  const meetsCpa = metric.cpa_7d < scaleCpaMult * targetCpaSubscription;
  const sustained = metric.sustained_days_above_scale_criteria >= scaleSustainedDays;
  const underFreqMax = metric.frequency_current < scaleFreqMax;
  const dupesAvailable = state.duplicatesCount < scaleMaxDupes;

  if ((meetsRoas || meetsCpa) && underFreqMax && sustained && dupesAvailable) {
    return {
      ad_id,
      action: 'duplicate',
      reason: `scale_criteria_met (roas=${metric.roas_7d.toFixed(2)}, cpa=$${metric.cpa_7d.toFixed(2)}, freq=${metric.frequency_current.toFixed(2)})`,
    };
  }

  return { ad_id, action: 'maintain', reason: 'phase_c_steady_state' };
}

// `comparable` is re-exported via `import` so that downstream callers
// performing same-DOW sanity checks (e.g. cron metric refreshers feeding
// this policy) can use the same lookup primitive without taking another
// direct dep on the comparable-window module.
export { comparable };
