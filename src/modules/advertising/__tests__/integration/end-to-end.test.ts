/**
 * End-to-end smoke test for the advertising agent daily triage cycle.
 *
 * Exercises the full daily triage pipeline with all external dependencies mocked:
 *   1. Perceive: Meta insights, PostHog funnel, Stripe attribution, reconciliation
 *   2. Decide: orchestrator (Tier 1 + Tier 2 + Tier 3), with non-trivial fixture
 *   3. Act: pause decisions via act/pause (mocked Meta API + audit log)
 *   4. Audit: decision records written matching decisions taken
 *
 * No real API calls leak through:
 *   - Meta: vi.mocked
 *   - PostHog: vi.mocked
 *   - Stripe: vi.mocked
 *   - Claude: vi.mocked
 *   - Telegram: vi.mocked
 *   - DB: vi.mocked
 *
 * Key invariants tested:
 *   - metrics_pulled > 0
 *   - decisions_made > 0
 *   - audit_records_written === number of non-maintain decisions acted on
 *   - No external API exceptions leak out of the pipeline
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockAdMetric, mockFunnelSnapshot, mockStripeAttribution } from '../fixtures';
import { mockMetaApi } from '../mocks/meta-api';
import { mockPosthog } from '../mocks/posthog';
import { mockStripe } from '../mocks/stripe';
import { mockClaudeApi } from '../mocks/claude';
import { mockTelegramBot } from '../mocks/telegram';

// ---------------------------------------------------------------------------
// Import the pipeline functions we exercise end-to-end
// ---------------------------------------------------------------------------
import { fetchMetaInsights } from '@/modules/advertising/perceive/meta-insights';
import { fetchFunnelSnapshot } from '@/modules/advertising/perceive/posthog-funnel';
import { fetchStripeAttribution } from '@/modules/advertising/perceive/stripe-attribution';
import { reconcile } from '@/modules/advertising/perceive/reconciler';
import { decide } from '@/modules/advertising/decide/orchestrator';
import { decideBayesian } from '@/modules/advertising/decide/tier-2-bayesian';
import { pause } from '@/modules/advertising/act/pause';
import { logDecision } from '@/modules/advertising/audit/decision-log';
import type { AdDecision, DecisionRecord } from '@/shared/types/advertising';

// ---------------------------------------------------------------------------
// Mock audit/decision-log DB
// ---------------------------------------------------------------------------

function makeMockDecisionDb() {
  const written: Array<{
    id: string;
    adId: string;
    action: string;
    applied: boolean;
  }> = [];

  const db = {
    insert: vi.fn().mockImplementation(() => ({
      values: vi.fn().mockImplementation((row) => {
        written.push(row);
        return Promise.resolve();
      }),
    })),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
    _written: written,
  };

  return db;
}

// ---------------------------------------------------------------------------
// Mock spend-cap DB (needs onConflictDoUpdate chain for spend-cap.ts)
// ---------------------------------------------------------------------------

function makeMockSpendCapDb() {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          // Return a row indicating no spend today — cap not exceeded
          { date: '2026-04-26', spentUsd: 0, capUsd: 80, triggeredHalt: false },
        ]),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Runs the full daily triage cycle with all deps injected.
 *
 * Returns a summary matching the spec:
 *   { metrics_pulled, decisions_made, actions_executed, audit_records_written }
 */
async function runDailyTriage(opts: {
  metaApi: ReturnType<typeof mockMetaApi>;
  posthog: ReturnType<typeof mockPosthog>;
  stripe: ReturnType<typeof mockStripe>;
  claude: ReturnType<typeof mockClaudeApi>;
  telegram: ReturnType<typeof mockTelegramBot>;
}) {
  const { metaApi, posthog, stripe, claude, telegram } = opts;

  const now = new Date('2026-04-26T09:00:00Z');
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const dateStr = yesterday.toISOString().slice(0, 10);
  const todayStr = now.toISOString().slice(0, 10);

  const decisionDb = makeMockDecisionDb();
  const spendCapDb = makeMockSpendCapDb();

  // --- Step 1: Perceive ---
  const [metrics, funnelSnapshot, stripeAttributions] = await Promise.all([
    fetchMetaInsights({
      apiClient: metaApi,
      dateFrom: dateStr,
      dateTo: todayStr,
      retryBaseMs: 0,
    }),
    fetchFunnelSnapshot({
      apiClient: posthog,
      windowStart: yesterday,
      windowEnd: now,
    }),
    fetchStripeAttribution({
      apiClient: stripe,
      windowStart: yesterday,
      windowEnd: now,
    }),
  ]);

  // --- Step 2: Reconcile ---
  const reconciliation = await reconcile(metrics, funnelSnapshot, {
    alertBot: telegram,
  });

  // --- Step 3: Decide ---
  const { decisions, shadowLog } = await decide(metrics, [], {
    claudeClient: claude,
    baselines: new Map(),
    tier2Decide: async (metric) => decideBayesian(metric),
  });

  // --- Step 4: Act — apply pause decisions, mock-log all decisions ---
  const records: DecisionRecord[] = [];
  let actionsExecuted = 0;

  for (const decision of decisions) {
    if (decision.action === 'pause') {
      const record = await pause(decision, {
        metaApi: metaApi,
        telegramBot: telegram as unknown as Parameters<typeof pause>[1]['telegramBot'],
        spendCapDb: spendCapDb as unknown as Parameters<typeof pause>[1]['spendCapDb'],
        decisionDb: decisionDb as unknown as Parameters<typeof pause>[1]['decisionDb'],
      });
      records.push(record);
      actionsExecuted++;
    } else {
      // Non-pause decisions: write audit record directly (no Meta API call)
      const record = await logDecision(decision, false, {
        db: decisionDb as unknown as Parameters<typeof logDecision>[2]['db'],
      });
      records.push(record);
    }
  }

  return {
    metrics_pulled: metrics.length,
    stripe_attributions: stripeAttributions.length,
    reconciliation_status: reconciliation.status,
    decisions_made: decisions.length,
    shadow_log_entries: shadowLog.length,
    actions_executed: actionsExecuted,
    audit_records_written: decisionDb._written.length,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('advertising agent — end-to-end daily triage (all mocked)', () => {
  let meta: ReturnType<typeof mockMetaApi>;
  let posthog: ReturnType<typeof mockPosthog>;
  let stripe: ReturnType<typeof mockStripe>;
  let claude: ReturnType<typeof mockClaudeApi>;
  let telegram: ReturnType<typeof mockTelegramBot>;

  beforeEach(() => {
    // Enable the kill switch so pause() / act layer functions don't throw
    process.env.ADVERTISING_AGENT_ENABLED = 'true';

    meta = mockMetaApi();
    posthog = mockPosthog();
    stripe = mockStripe();
    claude = mockClaudeApi();
    telegram = mockTelegramBot();
  });

  afterEach(() => {
    delete process.env.ADVERTISING_AGENT_ENABLED;
  });

  it('metrics_pulled > 0 for non-empty Meta API response', async () => {
    const result = await runDailyTriage({ metaApi: meta, posthog, stripe, claude, telegram });
    expect(result.metrics_pulled).toBeGreaterThan(0);
  });

  it('decisions_made > 0 for non-trivial metric fixture', async () => {
    // mockMetaApi returns a metric within Tier 1 thresholds → maintain decision
    // So decisions_made should be at least 1 (one "maintain" per metric)
    const result = await runDailyTriage({ metaApi: meta, posthog, stripe, claude, telegram });
    expect(result.decisions_made).toBeGreaterThan(0);
  });

  it('audit_records_written equals decisions_made (every decision gets an audit record)', async () => {
    const result = await runDailyTriage({ metaApi: meta, posthog, stripe, claude, telegram });
    expect(result.audit_records_written).toBe(result.decisions_made);
  });

  it('no external API calls leak — Meta getInsights called exactly once', async () => {
    await runDailyTriage({ metaApi: meta, posthog, stripe, claude, telegram });
    expect(meta.getInsights).toHaveBeenCalledOnce();
  });

  it('no external API calls leak — PostHog getFunnel called exactly once', async () => {
    await runDailyTriage({ metaApi: meta, posthog, stripe, claude, telegram });
    expect(posthog.getFunnel).toHaveBeenCalledOnce();
  });

  it('no external API calls leak — Stripe listSubscriptionsCreatedBetween called exactly once', async () => {
    await runDailyTriage({ metaApi: meta, posthog, stripe, claude, telegram });
    expect(stripe.listSubscriptionsCreatedBetween).toHaveBeenCalledOnce();
  });

  it('no external API calls leak — Claude anomalyExplain NOT called (no baselines → Tier 3 skipped)', async () => {
    // Tier 3 requires baselines — we pass empty Map so Claude should not be called
    await runDailyTriage({ metaApi: meta, posthog, stripe, claude, telegram });
    expect(claude.anomalyExplain).not.toHaveBeenCalled();
  });

  it('pause actions trigger Meta pauseAd for ads that fail Tier 1 thresholds', async () => {
    // Override Meta API to return a metric that violates Tier 1 frequency cap (≥4.0)
    const fatiguedMetric = mockAdMetric({
      ad_id: 'ad_fatigued',
      days_running: 5,
      frequency: 5.0, // exceeds FREQUENCY_CAP = 4.0
      ctr: 0.01,
      cpc: 1.0,
      spend_usd: 10.0,
    });
    meta.getInsights.mockResolvedValue([fatiguedMetric]);

    const result = await runDailyTriage({ metaApi: meta, posthog, stripe, claude, telegram });

    // Should have paused this ad
    expect(meta.pauseAd).toHaveBeenCalledWith('ad_fatigued');
    expect(result.actions_executed).toBe(1);
  });

  it('reconciliation status is reported in the summary', async () => {
    const result = await runDailyTriage({ metaApi: meta, posthog, stripe, claude, telegram });
    expect(['match', 'minor_drift', 'critical_drift']).toContain(result.reconciliation_status);
  });

  it('Tier 1 maintain → no pause API call for healthy ad', async () => {
    // Default fixture: impressions=5247, clicks=87, ctr=0.0166, frequency=1.4
    // All within Tier 1 thresholds — should result in "maintain", no pauseAd call
    await runDailyTriage({ metaApi: meta, posthog, stripe, claude, telegram });

    // pauseAd should NOT have been called for a healthy ad
    expect(meta.pauseAd).not.toHaveBeenCalled();
  });

  it('multiple metrics produce one decision per metric', async () => {
    const multipleMetrics = [
      mockAdMetric({ ad_id: 'ad_001', days_running: 5 }),
      mockAdMetric({ ad_id: 'ad_002', days_running: 5 }),
      mockAdMetric({ ad_id: 'ad_003', days_running: 5 }),
    ];
    meta.getInsights.mockResolvedValue(multipleMetrics);

    const result = await runDailyTriage({ metaApi: meta, posthog, stripe, claude, telegram });

    expect(result.metrics_pulled).toBe(3);
    expect(result.decisions_made).toBe(3);
  });

  it('audit_records_written matches decisions for multiple metrics', async () => {
    const multipleMetrics = [
      mockAdMetric({ ad_id: 'ad_001', days_running: 5 }),
      mockAdMetric({ ad_id: 'ad_002', days_running: 5 }),
      mockAdMetric({ ad_id: 'ad_003', days_running: 5 }),
    ];
    meta.getInsights.mockResolvedValue(multipleMetrics);

    const result = await runDailyTriage({ metaApi: meta, posthog, stripe, claude, telegram });

    expect(result.audit_records_written).toBe(result.decisions_made);
    expect(result.audit_records_written).toBe(3);
  });

  it('learning phase metrics produce hold decisions (no pause, no audit for act)', async () => {
    // days_running < 2 → learning phase → hold decision
    const earlyMetric = mockAdMetric({ ad_id: 'ad_early', days_running: 1 });
    meta.getInsights.mockResolvedValue([earlyMetric]);

    const result = await runDailyTriage({ metaApi: meta, posthog, stripe, claude, telegram });

    // Hold decision produced, no pause called
    expect(meta.pauseAd).not.toHaveBeenCalled();
    expect(result.decisions_made).toBe(1);
  });
});
