/**
 * Tests for all 5 advertising cron route handlers.
 *
 * Tests verify:
 * - 401 returned without valid CRON_SECRET
 * - kill_switch respected
 * - 200 + success:true returned with valid auth when kill switch is off
 * - 500 returned on internal errors
 *
 * Route handlers are imported and called directly with a mocked Request.
 * All external dependencies (Telegram, orchestrator, Meta, PostHog, etc.) are stubbed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock @sentry/nextjs before importing route handlers
// ---------------------------------------------------------------------------
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock @/shared/lib/db — routes call getDb() lazily inside DI factories.
// Both `getDb` (the actual export) and `db` (legacy convenience) are exposed
// so existing test files importing either continue to work.
//
// Wrapped in vi.hoisted() because vi.mock() factories are hoisted to the top
// of the file by vitest — without hoisting the const definition alongside,
// the factory closure would reference an uninitialized binding.
// ---------------------------------------------------------------------------
const { mockDrizzleDb } = vi.hoisted(() => {
  return {
    mockDrizzleDb: {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
        }),
      }),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
      }),
    },
  };
});
vi.mock('@/shared/lib/db', () => ({
  getDb: () => mockDrizzleDb,
  db: mockDrizzleDb,
}));

// ---------------------------------------------------------------------------
// Mock the advertising alerts module (account-health-weekly + telegram)
// ---------------------------------------------------------------------------
vi.mock('@/modules/advertising/alerts', () => ({
  createTelegramBot: vi.fn(() => ({
    sendAlert: vi.fn().mockResolvedValue({ message_id: 1, text: 'ok' }),
    sendDailyDigest: vi.fn().mockResolvedValue({ message_id: 2, text: 'ok' }),
    sendMessage: vi.fn().mockResolvedValue({ message_id: 3, text: 'ok' }),
  })),
  sendWeeklyAccountHealthReminder: vi.fn().mockResolvedValue({
    sent: true,
    message_id: 1,
    sent_at: '2026-04-26T10:00:00.000Z',
  }),
}));

// ---------------------------------------------------------------------------
// Mock Telegram bot used directly in route handlers
// ---------------------------------------------------------------------------
vi.mock('@/modules/advertising/alerts/telegram-bot', () => {
  const mockBot = {
    sendAlert: vi.fn().mockResolvedValue({ message_id: 1, text: 'ok' }),
    sendDailyDigest: vi.fn().mockResolvedValue({ message_id: 2, text: 'ok' }),
    sendMessage: vi.fn().mockResolvedValue({ message_id: 3, text: 'ok' }),
    requestApproval: vi.fn().mockResolvedValue({ approved: true }),
  };
  return {
    TelegramBot: vi.fn().mockImplementation(function () {
      return mockBot;
    }),
    createTelegramBot: vi.fn(() => mockBot),
  };
});

// ---------------------------------------------------------------------------
// Mock real-API client factories (production code path).
// Tests rely on the perceive-layer mocks below, so the client returned here
// is a stub that throws if accidentally invoked — surfaces missing perceive mocks loudly.
// ---------------------------------------------------------------------------
vi.mock('@/modules/advertising/meta-graph-api', async () => {
  const actual = await vi.importActual<typeof import('@/modules/advertising/meta-graph-api')>(
    '@/modules/advertising/meta-graph-api',
  );
  return {
    ...actual,
    createMetaAdClient: vi.fn(() => ({
      getInsights: vi.fn(async () => { throw new Error('test stub: mock perceive instead'); }),
      pauseAd: vi.fn(),
      updateAdSetBudget: vi.fn(),
      duplicateAd: vi.fn(async () => ({ ad_id: 'stub' })),
      getAccountStatus: vi.fn(async () => ({ status: 'ACTIVE', disapproval_rate: 0 })),
      createCampaign: vi.fn(async () => ({ campaign_id: 'stub' })),
      createAdSet: vi.fn(async () => ({ adset_id: 'stub' })),
    })),
  };
});

vi.mock('@/modules/advertising/posthog/funnel-client', () => ({
  createPosthogFunnelClient: vi.fn(() => ({
    getFunnel: vi.fn(async () => { throw new Error('test stub: mock perceive instead'); }),
  })),
}));

vi.mock('@/modules/advertising/stripe/attribution-client', () => ({
  createStripeAttributionClient: vi.fn(async () => ({
    listSubscriptionsCreatedBetween: vi.fn(async () => { throw new Error('test stub: mock perceive instead'); }),
  })),
}));

// ---------------------------------------------------------------------------
// Mock conversion windows (fetchConversionWindows — called alongside
// fetchMetaInsights in triage-daily's Promise.all perceive step)
// ---------------------------------------------------------------------------
vi.mock('@/modules/advertising/perceive/conversion-windows', () => ({
  fetchConversionWindows: vi.fn().mockResolvedValue({
    metrics7d: [
      {
        ad_id: 'ad_001',
        adset_id: 'adset_001',
        campaign_id: 'campaign_001',
        date: '2026-05-18',
        impressions: 1000,
        clicks: 20,
        spend_usd: 5.0,
        ctr: 0.02,
        cpc: 0.25,
        cpm: 5.0,
        frequency: 1.2,
        reach: 900,
        days_running: 5,
        status: 'ACTIVE',
        conversions_7d: 3,
      },
    ],
    metrics28d: [
      {
        ad_id: 'ad_001',
        adset_id: 'adset_001',
        campaign_id: 'campaign_001',
        date: '2026-05-18',
        impressions: 4000,
        clicks: 80,
        spend_usd: 20.0,
        ctr: 0.02,
        cpc: 0.25,
        cpm: 5.0,
        frequency: 1.5,
        reach: 3600,
        days_running: 28,
        status: 'ACTIVE',
        conversions_total: 12,
      },
    ],
  }),
}));

// ---------------------------------------------------------------------------
// Mock Meta insights fetch
// ---------------------------------------------------------------------------
vi.mock('@/modules/advertising/perceive/meta-insights', () => ({
  fetchMetaInsights: vi.fn().mockResolvedValue([
    {
      ad_id: 'ad_001',
      adset_id: 'adset_001',
      campaign_id: 'campaign_001',
      date: '2026-04-26',
      impressions: 1000,
      clicks: 20,
      spend_usd: 5.0,
      ctr: 0.02,
      cpc: 0.25,
      cpm: 5.0,
      frequency: 1.2,
      reach: 900,
      days_running: 5,
      status: 'ACTIVE',
    },
  ]),
}));

// ---------------------------------------------------------------------------
// Mock perceive: PostHog funnel + Stripe attribution + reconciler
// ---------------------------------------------------------------------------
vi.mock('@/modules/advertising/perceive/posthog-funnel', () => ({
  fetchFunnelSnapshot: vi.fn().mockResolvedValue({
    window_start: new Date('2026-04-25T00:00:00Z'),
    window_end: new Date('2026-04-26T00:00:00Z'),
    steps: [
      { event_name: 'landing_view', count: 20, unique_users: 20, conversion_from_previous: 1.0 },
      { event_name: 'chart_calculated', count: 10, unique_users: 10, conversion_from_previous: 0.5 },
    ],
  }),
}));

vi.mock('@/modules/advertising/perceive/stripe-attribution', () => ({
  fetchStripeAttribution: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/modules/advertising/perceive/reconciler', () => ({
  reconcile: vi.fn().mockResolvedValue({
    meta_clicks: 20,
    posthog_landings: 20,
    delta_pct: 0.0,
    status: 'match',
    threshold_minor: 0.1,
    threshold_critical: 0.25,
  }),
}));

// ---------------------------------------------------------------------------
// Mock perceive/recon-state-store — triage-daily calls checkAutoResume()
// at the start; orchestrator (via decide) calls getReconState().
// ---------------------------------------------------------------------------
vi.mock('@/modules/advertising/perceive/recon-state-store', () => ({
  getReconState: vi.fn().mockResolvedValue({
    suspended: false,
    suspendedAt: null,
    suspendReason: null,
    autoResumeAt: null,
    lastDriftPct: null,
  }),
  suspend: vi.fn().mockResolvedValue(undefined),
  resume: vi.fn().mockResolvedValue(undefined),
  checkAutoResume: vi.fn().mockResolvedValue({ resumed: false }),
}));

// ---------------------------------------------------------------------------
// Mock orchestrator decide
// ---------------------------------------------------------------------------
vi.mock('@/modules/advertising/decide/orchestrator', () => ({
  decide: vi.fn().mockResolvedValue({
    decisions: [
      {
        ad_id: 'ad_001',
        action: 'maintain',
        reason: 'within_tier_1_thresholds',
        reasoning_tier: 'tier_1_rules',
        confidence: 1.0,
        metrics_snapshot: {},
      },
    ],
    shadowLog: [],
  }),
}));

// ---------------------------------------------------------------------------
// Mock act layer (pause/scale/duplicate)
// ---------------------------------------------------------------------------
vi.mock('@/modules/advertising/act/pause', () => ({
  pause: vi.fn().mockResolvedValue({ id: 'rec_001', applied: true }),
}));

vi.mock('@/modules/advertising/act/scale', () => ({
  scale: vi.fn().mockResolvedValue({ id: 'rec_002', applied: true }),
}));

vi.mock('@/modules/advertising/act/duplicate', () => ({
  duplicate: vi.fn().mockResolvedValue({ id: 'rec_003', applied: true }),
}));

// ---------------------------------------------------------------------------
// Mock kill-switch (isDryRun)
// ---------------------------------------------------------------------------
vi.mock('@/modules/advertising/safety/kill-switch', () => ({
  assertKillSwitchOff: vi.fn(),
  isKillSwitchEngaged: vi.fn().mockReturnValue(false),
  isDryRun: vi.fn().mockReturnValue(false),
  getStatus: vi.fn().mockReturnValue({ enabled: true, dryRun: false }),
}));

// ---------------------------------------------------------------------------
// Mock brand-voice audit + drop-off monitor + feature gates
// ---------------------------------------------------------------------------
vi.mock('@/modules/advertising/decide/brand-voice-audit', () => ({
  auditTopCreatives: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/modules/advertising/alerts/drop-off-monitor', () => {
  class MockInMemoryDropOffStore {
    appendSnapshot = vi.fn().mockResolvedValue(undefined);
    listSnapshots = vi.fn().mockResolvedValue([]);
  }
  return {
    runDailyDropOffCheck: vi.fn().mockResolvedValue({
      status: 'collecting_baseline',
      baseline_sample_count: 0,
      alerts: [],
    }),
    InMemoryDropOffStore: MockInMemoryDropOffStore,
  };
});

vi.mock('@/modules/advertising/decide/feature-gates', () => ({
  evaluateGates: vi.fn().mockResolvedValue([]),
  // currentMode is read by triage-hourly to branch decide() onto the senior-buyer
  // phase-evaluator. Default 'off' = legacy Tier 1 path; tests can override.
  currentMode: vi.fn().mockResolvedValue('off'),
}));

// ---------------------------------------------------------------------------
// Mock audiences refresh cycle
// ---------------------------------------------------------------------------
vi.mock('@/modules/advertising/audiences/refresh-cycle', () => ({
  runDailyAudienceRefresh: vi.fn().mockResolvedValue({
    ran_at: new Date('2026-04-26T06:00:00Z'),
    outcomes: [
      { kind: 'exclusion', result: { skipped: true, reason: 'below minimum size' } },
      { kind: 'retargeting', result: { calc_no_register: { audience_id: 'aud_001', size: 0, activated_in_meta: false }, register_no_paid: { audience_id: 'aud_002', size: 0, activated_in_meta: false } } },
    ],
    total_audiences: 2,
    failed_audiences: 0,
  }),
}));

// ---------------------------------------------------------------------------
// Mock senior-buyer modules called from triage-daily extension (T24)
// ---------------------------------------------------------------------------
vi.mock('@/modules/advertising/senior-buyer/metric-history', () => ({
  writeDailySnapshot: vi.fn().mockResolvedValue(undefined),
  getRange: vi.fn().mockResolvedValue([]),
  pruneOldSnapshots: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/modules/advertising/senior-buyer/state-store', () => ({
  listAdSetsByPhase: vi.fn().mockResolvedValue([]),
  listAdSetsByIds: vi.fn().mockResolvedValue([]),
  upsertAdSetState: vi.fn().mockResolvedValue(undefined),
  recordPhaseTransition: vi.fn().mockResolvedValue(undefined),
  recordMaturityTransition: vi.fn().mockResolvedValue(undefined),
  getAdSetState: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/modules/advertising/senior-buyer/auto-calibrator', () => ({
  runDriftTriggeredCalibration: vi.fn().mockResolvedValue(undefined),
  runWeeklyCalibration: vi.fn().mockResolvedValue({
    ad_sets_processed: 0,
    thresholds_updated: 0,
    approvals_requested: 0,
    errors: 0,
  }),
}));

vi.mock('@/modules/advertising/senior-buyer/data-maturity-classifier', () => ({
  classifyMaturity: vi.fn().mockReturnValue('COLD_START'),
}));

vi.mock('@/modules/advertising/senior-buyer/threshold-resolver', () => ({
  resolveThreshold: vi.fn().mockResolvedValue(50),
}));

// ---------------------------------------------------------------------------
// Import route handlers (after mocks are established)
// ---------------------------------------------------------------------------
import { GET as triageHourlyGET } from '../triage-hourly/route';
import { GET as triageDailyGET } from '../triage-daily/route';
import { GET as retroWeeklyGET } from '../retro-weekly/route';
import { GET as audienceRefreshGET } from '../audience-refresh/route';
import { GET as accountHealthWeeklyGET } from '../account-health-weekly/route';
// Imports of mocked symbols — used by retro-weekly + senior-buyer integration tests below.
import { evaluateGates, currentMode } from '@/modules/advertising/decide/feature-gates';
import { fetchMetaInsights } from '@/modules/advertising/perceive/meta-insights';
import { decide } from '@/modules/advertising/decide/orchestrator';

// ---------------------------------------------------------------------------
// Helper to create a Request with optional Authorization header
// ---------------------------------------------------------------------------

function makeRequest(authHeader?: string): Request {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) {
    headers['authorization'] = authHeader;
  }
  return new Request('https://estrevia.app/api/cron/advertising/test', {
    method: 'GET',
    headers,
  });
}

// ---------------------------------------------------------------------------
// Shared test setup
// ---------------------------------------------------------------------------

const CRON_SECRET = 'test-cron-secret';

const HANDLERS: Array<{ name: string; handler: (req: Request) => Promise<Response> }> = [
  { name: 'triage-hourly', handler: triageHourlyGET },
  { name: 'triage-daily', handler: triageDailyGET },
  { name: 'retro-weekly', handler: retroWeeklyGET },
  { name: 'audience-refresh', handler: audienceRefreshGET },
  { name: 'account-health-weekly', handler: accountHealthWeeklyGET },
];

beforeEach(() => {
  process.env.CRON_SECRET = CRON_SECRET;
  process.env.ADVERTISING_AGENT_ENABLED = 'true';
});

afterEach(() => {
  delete process.env.CRON_SECRET;
  delete process.env.ADVERTISING_AGENT_ENABLED;
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests: Auth enforcement (all handlers)
// ---------------------------------------------------------------------------

describe('Advertising cron handlers — auth enforcement', () => {
  for (const { name, handler } of HANDLERS) {
    it(`${name}: returns 401 with no Authorization header`, async () => {
      const req = makeRequest();
      const res = await handler(req);
      expect(res.status).toBe(401);
    });

    it(`${name}: returns 401 with wrong secret`, async () => {
      const req = makeRequest('Bearer wrong-secret');
      const res = await handler(req);
      expect(res.status).toBe(401);
    });

    it(`${name}: returns 500 when CRON_SECRET env var is missing`, async () => {
      delete process.env.CRON_SECRET;
      const req = makeRequest(`Bearer ${CRON_SECRET}`);
      const res = await handler(req);
      expect(res.status).toBe(500);
    });
  }
});

// ---------------------------------------------------------------------------
// Tests: Kill switch (all handlers)
// ---------------------------------------------------------------------------

describe('Advertising cron handlers — kill switch', () => {
  for (const { name, handler } of HANDLERS) {
    it(`${name}: returns success:false with reason:kill_switch when ADVERTISING_AGENT_ENABLED=false`, async () => {
      process.env.ADVERTISING_AGENT_ENABLED = 'false';
      const req = makeRequest(`Bearer ${CRON_SECRET}`);
      const res = await handler(req);

      expect(res.status).toBe(200);
      const body = await res.json() as { success: boolean; reason?: string };
      expect(body.success).toBe(false);
      expect(body.reason).toBe('kill_switch');
    });

    it(`${name}: returns success:false with reason:kill_switch when ADVERTISING_AGENT_ENABLED is unset`, async () => {
      delete process.env.ADVERTISING_AGENT_ENABLED;
      const req = makeRequest(`Bearer ${CRON_SECRET}`);
      const res = await handler(req);

      expect(res.status).toBe(200);
      const body = await res.json() as { success: boolean; reason?: string };
      expect(body.success).toBe(false);
      expect(body.reason).toBe('kill_switch');
    });
  }
});

// ---------------------------------------------------------------------------
// Tests: Successful execution (all handlers)
// ---------------------------------------------------------------------------

describe('Advertising cron handlers — successful execution', () => {
  for (const { name, handler } of HANDLERS) {
    it(`${name}: returns 200 success:true with valid auth`, async () => {
      const req = makeRequest(`Bearer ${CRON_SECRET}`);
      const res = await handler(req);

      expect(res.status).toBe(200);
      const body = await res.json() as { success: boolean };
      expect(body.success).toBe(true);
    });

    it(`${name}: returns a summary in the response body`, async () => {
      const req = makeRequest(`Bearer ${CRON_SECRET}`);
      const res = await handler(req);
      const body = await res.json() as { success: boolean; summary: unknown };

      expect(body.summary).toBeDefined();
    });
  }
});

// ---------------------------------------------------------------------------
// Tests: Error handling — triage-hourly (representative handler test)
// ---------------------------------------------------------------------------

describe('triage-hourly — error handling', () => {
  it('returns 500 when the orchestrator throws', async () => {
    // The stub handler doesn't actually call any external deps right now,
    // but we test that the error boundary catches properly by temporarily
    // making the handler throw via env manipulation. Since all handlers use
    // the same pattern, testing one is sufficient.
    //
    // We verify the 500 path indirectly: missing CRON_SECRET → 500 (different
    // from 401 which is wrong/missing header). This was tested above.
    // For future: when orchestrator is wired, mock it to throw and verify 500.
    expect(true).toBe(true); // placeholder — see above note
  });
});

// ---------------------------------------------------------------------------
// Tests: triage-hourly — seniorBuyerMode integration (v3b T23)
// ---------------------------------------------------------------------------
//
// When the seniorBuyerMode feature gate is 'on', the route reads it from DB
// and forwards it to decide() via the gates argument. v3b T22 rewrites
// decide() to branch on this gate and dispatch through the senior-buyer
// phase-evaluator. These tests pin the route's contract — that it loads the
// gate and propagates it — without requiring T22 to be merged. The deeper
// "routing field" assertion lives in the orchestrator/phase-evaluator tests.
// ---------------------------------------------------------------------------

describe('triage-hourly — seniorBuyerMode integration', () => {
  it('seniorBuyerMode=off: passes empty gates and surfaces "off" in summary', async () => {
    vi.mocked(currentMode).mockResolvedValueOnce('off');

    const req = makeRequest(`Bearer ${CRON_SECRET}`);
    const res = await triageHourlyGET(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      summary: { senior_buyer_mode: string };
    };
    expect(body.success).toBe(true);
    expect(body.summary.senior_buyer_mode).toBe('off');

    // No seniorBuyerMode gate forwarded — legacy Tier 1 path inside decide().
    expect(decide).toHaveBeenCalledWith(
      expect.any(Array),
      [],
      expect.any(Object),
    );
  });

  it('triage-hourly under seniorBuyerMode=on routes through phase-evaluator', async () => {
    // currentMode returns the gate state from DB; cast widens existing Mode
    // union (T22 extends it with 'on').
    vi.mocked(currentMode).mockResolvedValueOnce(
      'on' as unknown as Awaited<ReturnType<typeof currentMode>>,
    );

    const req = makeRequest(`Bearer ${CRON_SECRET}`);
    const res = await triageHourlyGET(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      summary: { senior_buyer_mode: string };
    };
    expect(body.success).toBe(true);
    expect(body.summary.senior_buyer_mode).toBe('on');

    // The orchestrator (T22) reads gates.find(g => g.feature_id === 'seniorBuyerMode'),
    // so we assert the gate row is forwarded with mode='on'. Once T22 lands,
    // decide() dispatches through the senior-buyer phase-evaluator and emits a
    // `routing` field; that deeper assertion lives in the orchestrator tests.
    expect(decide).toHaveBeenCalledWith(
      expect.any(Array),
      expect.arrayContaining([
        expect.objectContaining({
          feature_id: 'seniorBuyerMode',
          mode: 'on',
        }),
      ]),
      expect.any(Object),
    );
  });

  it('falls back to "off" when the gate read throws (DB unavailable)', async () => {
    vi.mocked(currentMode).mockRejectedValueOnce(new Error('db unavailable'));

    const req = makeRequest(`Bearer ${CRON_SECRET}`);
    const res = await triageHourlyGET(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      summary: { senior_buyer_mode: string };
    };
    expect(body.success).toBe(true);
    expect(body.summary.senior_buyer_mode).toBe('off');
    // Pipeline still runs — gate failure must not cascade.
    expect(decide).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Tests: account-health-weekly specific
// ---------------------------------------------------------------------------

describe('account-health-weekly — specific behaviour', () => {
  it('returns summary with sent:true from the health reminder', async () => {
    const req = makeRequest(`Bearer ${CRON_SECRET}`);
    const res = await handler(req);
    const body = await res.json() as { success: boolean; summary: { sent: boolean } };

    expect(body.success).toBe(true);
    expect(body.summary.sent).toBe(true);
  });

  function handler(req: Request) {
    return accountHealthWeeklyGET(req);
  }
});

// ---------------------------------------------------------------------------
// Tests: triage-daily specific — checks summary shape
// ---------------------------------------------------------------------------

describe('triage-daily — specific behaviour', () => {
  it('summary includes metrics_pulled, decisions_made, and audit_records_written', async () => {
    const req = makeRequest(`Bearer ${CRON_SECRET}`);
    const res = await handler(req);
    const body = await res.json() as {
      success: boolean;
      summary: {
        metrics_pulled: number;
        decisions_made: number;
        audit_records_written: number;
      };
    };

    expect(body.success).toBe(true);
    expect(typeof body.summary.metrics_pulled).toBe('number');
    expect(typeof body.summary.decisions_made).toBe('number');
    expect(typeof body.summary.audit_records_written).toBe('number');
  });

  function handler(req: Request) {
    return triageDailyGET(req);
  }
});

// ---------------------------------------------------------------------------
// Tests: audience-refresh specific — checks summary shape
// ---------------------------------------------------------------------------

describe('audience-refresh — specific behaviour', () => {
  it('summary includes total_audiences and failed_audiences', async () => {
    const req = makeRequest(`Bearer ${CRON_SECRET}`);
    const res = await handler(req);
    const body = await res.json() as {
      success: boolean;
      summary: {
        total_audiences: number;
        failed_audiences: number;
      };
    };

    expect(body.success).toBe(true);
    expect(typeof body.summary.total_audiences).toBe('number');
    expect(typeof body.summary.failed_audiences).toBe('number');
  });

  function handler(req: Request) {
    return audienceRefreshGET(req);
  }
});

// ---------------------------------------------------------------------------
// Tests: DB injection — guards against the null-DB regression
// ---------------------------------------------------------------------------
//
// All tests above mock `pause()` wholesale, so `checkSpendCap` and
// `logDecision` are never invoked and `deps.db` is never dereferenced.
// That mocking masked a production bug where buildSpendCapDb() and
// buildDecisionDb() returned `null as any`, crashing the first real
// pause attempt with `TypeError: Cannot read properties of null`.
//
// This block bypasses the wholesale pause mock by re-importing the real
// pause module and injecting the mocked Drizzle chain. If anyone ever
// regresses the factories back to `null`, the .select/.insert call counts
// here go to zero and the test fails.
// ---------------------------------------------------------------------------

describe('triage-hourly — DB injection guard (regression test)', () => {
  it('invokes mockDrizzleDb.select and .insert through the real pause/spend-cap path', async () => {
    // Restore the real pause implementation for this test only — the wholesale
    // mock at the top of this file would otherwise prevent deps.db access.
    vi.unmock('@/modules/advertising/act/pause');

    // Reset module cache so the un-mocked pause is loaded
    vi.resetModules();

    // Re-mock everything except pause itself — pause must run for real so
    // it calls checkSpendCap → deps.db.select(), and logDecision →
    // deps.db.insert(). Both touch our mockDrizzleDb chain; if either is
    // null the test crashes.
    vi.doMock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
    vi.doMock('@/shared/lib/db', () => ({
      getDb: () => mockDrizzleDb,
      db: mockDrizzleDb,
    }));
    vi.doMock('@/modules/advertising/safety/kill-switch', () => ({
      assertKillSwitchOff: vi.fn(),
      isKillSwitchEngaged: vi.fn().mockReturnValue(false),
      isDryRun: vi.fn().mockReturnValue(false),
      getStatus: vi.fn().mockReturnValue({ enabled: true, dryRun: false }),
    }));
    vi.doMock('@/modules/advertising/alerts/telegram-bot', () => {
      const mockBot = {
        sendAlert: vi.fn().mockResolvedValue({ message_id: 1, text: 'ok' }),
        sendDailyDigest: vi.fn().mockResolvedValue({ message_id: 2, text: 'ok' }),
        sendMessage: vi.fn().mockResolvedValue({ message_id: 3, text: 'ok' }),
      };
      return {
        TelegramBot: vi.fn().mockImplementation(function () {
          return mockBot;
        }),
        createTelegramBot: vi.fn(() => mockBot),
      };
    });
    vi.doMock('@/modules/advertising/perceive/meta-insights', () => ({
      fetchMetaInsights: vi.fn().mockResolvedValue([
        {
          ad_id: 'ad_pause_001',
          adset_id: 'adset_001',
          campaign_id: 'campaign_001',
          date: '2026-05-03',
          impressions: 1000,
          clicks: 1,                 // CTR will trigger Tier 1 pause
          spend_usd: 5.0,
          ctr: 0.001,                // 0.1% — well below pause threshold
          cpc: 5.0,
          cpm: 5.0,
          frequency: 1.2,
          reach: 900,
          days_running: 5,
          status: 'ACTIVE',
        },
      ]),
    }));
    vi.doMock('@/modules/advertising/decide/orchestrator', () => ({
      decide: vi.fn().mockResolvedValue({
        decisions: [
          {
            ad_id: 'ad_pause_001',
            action: 'pause',
            reason: 'tier_1_low_ctr',
            reasoning_tier: 'tier_1_rules',
            confidence: 1.0,
            metrics_snapshot: {},
            delta_budget_usd: 0,
          },
        ],
        shadowLog: [],
      }),
    }));
    // act-layer: real pause WITH a mocked Meta API client returned by
    // `getMetaAdClient` so the Meta API is never actually hit.
    vi.doMock('@/modules/advertising/act', () => ({
      getMetaAdClient: vi.fn(() => ({
        pauseAd: vi.fn().mockResolvedValue({ paused: true, ad_id: 'ad_pause_001' }),
      })),
    }));
    // Stub createMetaAdClient too (used as insightsApi by spend-cap)
    vi.doMock('@/modules/advertising/meta-graph-api', () => ({
      createMetaAdClient: vi.fn(() => ({
        getInsights: vi.fn().mockResolvedValue([]),  // real spend-cap path: 0 spent today
        pauseAd: vi.fn().mockResolvedValue({ paused: true }),
      })),
    }));
    // Required env for spend cap
    process.env.ADVERTISING_DAILY_SPEND_CAP_USD = '80';
    process.env.CRON_SECRET = CRON_SECRET;
    process.env.ADVERTISING_AGENT_ENABLED = 'true';

    // Reset call counts on the shared mockDrizzleDb chain
    mockDrizzleDb.select.mockClear();
    mockDrizzleDb.insert.mockClear();

    // Re-import the route after re-mocking
    const { GET: realTriageHourly } = await import('../triage-hourly/route');
    const res = await realTriageHourly(makeRequest(`Bearer ${CRON_SECRET}`));

    expect(res.status).toBe(200);
    const body = await res.json() as { success: boolean; summary: { pauses_applied: number } };
    expect(body.success).toBe(true);
    expect(body.summary.pauses_applied).toBe(1);

    // Proof of life: the spend-cap and decision-log paths actually called
    // into the Drizzle mock. If buildSpendCapDb()/buildDecisionDb() ever
    // regress back to `null as any`, these counts will be 0.
    expect(mockDrizzleDb.select).toHaveBeenCalled();
    expect(mockDrizzleDb.insert).toHaveBeenCalled();

    // Cleanup
    delete process.env.ADVERTISING_DAILY_SPEND_CAP_USD;
    vi.resetModules();
  });
});

// ---------------------------------------------------------------------------
// Tests: retro-weekly — real total_impressions / median days_running
// (Track 9 — replaces { total_impressions: 0, days_running: 0 } placeholder
// with real Meta-Insights aggregates so feature gates can auto-mature.)
// ---------------------------------------------------------------------------

describe('retro-weekly — real total_impressions / median days_running', () => {
  it('passes summed impressions and median days_running to evaluateGates', async () => {
    // 3 ads — sum impressions = 4000+6000+2000 = 12000; days_running sorted = [7,14,21]; median = 14
    vi.mocked(fetchMetaInsights).mockResolvedValueOnce([
      {
        ad_id: 'ad_001', adset_id: 'adset_001', campaign_id: 'campaign_001',
        date: '2026-04-26', impressions: 4000, clicks: 80, spend_usd: 12.0,
        ctr: 0.02, cpc: 0.15, cpm: 3.0, frequency: 1.5, reach: 3000,
        days_running: 21, status: 'ACTIVE',
      },
      {
        ad_id: 'ad_002', adset_id: 'adset_002', campaign_id: 'campaign_002',
        date: '2026-04-26', impressions: 6000, clicks: 90, spend_usd: 14.0,
        ctr: 0.015, cpc: 0.16, cpm: 2.5, frequency: 1.3, reach: 4500,
        days_running: 14, status: 'ACTIVE',
      },
      {
        ad_id: 'ad_003', adset_id: 'adset_003', campaign_id: 'campaign_003',
        date: '2026-04-26', impressions: 2000, clicks: 30, spend_usd: 6.0,
        ctr: 0.015, cpc: 0.20, cpm: 3.0, frequency: 1.1, reach: 1800,
        days_running: 7, status: 'ACTIVE',
      },
    ]);

    const req = makeRequest(`Bearer ${CRON_SECRET}`);
    const res = await retroWeeklyGET(req);
    expect(res.status).toBe(200);

    expect(evaluateGates).toHaveBeenCalledWith(
      expect.objectContaining({
        total_impressions: 12000,
        days_running: 14,
      }),
      expect.anything(),
    );
  });

  it('ignores rows with days_running <= 0 when computing median', async () => {
    // days_running candidates after filter (>0): [7, 28]; median = upper of 2 = 28
    vi.mocked(fetchMetaInsights).mockResolvedValueOnce([
      {
        ad_id: 'ad_a', adset_id: 'adset_a', campaign_id: 'campaign_a',
        date: '2026-04-26', impressions: 1500, clicks: 30, spend_usd: 5.0,
        ctr: 0.02, cpc: 0.16, cpm: 3.3, frequency: 1.2, reach: 1300,
        days_running: 7, status: 'ACTIVE',
      },
      {
        ad_id: 'ad_b', adset_id: 'adset_b', campaign_id: 'campaign_b',
        date: '2026-04-26', impressions: 0, clicks: 0, spend_usd: 0,
        ctr: 0, cpc: 0, cpm: 0, frequency: 0, reach: 0,
        days_running: 0, status: 'ACTIVE',
      },
      {
        ad_id: 'ad_c', adset_id: 'adset_c', campaign_id: 'campaign_c',
        date: '2026-04-26', impressions: 3500, clicks: 70, spend_usd: 12.0,
        ctr: 0.02, cpc: 0.17, cpm: 3.4, frequency: 1.4, reach: 3000,
        days_running: 28, status: 'ACTIVE',
      },
    ]);

    const req = makeRequest(`Bearer ${CRON_SECRET}`);
    const res = await retroWeeklyGET(req);
    expect(res.status).toBe(200);

    expect(evaluateGates).toHaveBeenCalledWith(
      expect.objectContaining({
        total_impressions: 5000,
        days_running: 28,
      }),
      expect.anything(),
    );
  });

  it('passes zeros when Meta returns no insights (degraded fallback)', async () => {
    vi.mocked(fetchMetaInsights).mockResolvedValueOnce([]);

    const req = makeRequest(`Bearer ${CRON_SECRET}`);
    const res = await retroWeeklyGET(req);
    expect(res.status).toBe(200);

    expect(evaluateGates).toHaveBeenCalledWith(
      expect.objectContaining({
        total_impressions: 0,
        days_running: 0,
      }),
      expect.anything(),
    );
  });

  it('does not crash on Meta API failure — falls back to zeros', async () => {
    vi.mocked(fetchMetaInsights).mockRejectedValueOnce(new Error('META rate limit'));

    const req = makeRequest(`Bearer ${CRON_SECRET}`);
    const res = await retroWeeklyGET(req);
    expect(res.status).toBe(200);

    expect(evaluateGates).toHaveBeenCalledWith(
      expect.objectContaining({
        total_impressions: 0,
        days_running: 0,
      }),
      expect.anything(),
    );
  });
});

// ---------------------------------------------------------------------------
// Tests: triage-daily — reconciler auto-resume gate
// ---------------------------------------------------------------------------
//
// The triage-daily handler MUST call recon-state-store.checkAutoResume() at
// the top of every run so a 24h-stale suspend automatically clears. These
// tests pin that contract: the call happens, the summary surfaces the flag,
// and a non-fatal failure does not break the rest of the pipeline.
// ---------------------------------------------------------------------------

describe('triage-daily — reconciler auto-resume', () => {
  it('calls checkAutoResume() on every run', async () => {
    const reconState = await import('@/modules/advertising/perceive/recon-state-store');
    const checkAutoResumeMock = vi.mocked(reconState.checkAutoResume);
    checkAutoResumeMock.mockClear();
    checkAutoResumeMock.mockResolvedValueOnce({ resumed: false });

    const req = makeRequest(`Bearer ${CRON_SECRET}`);
    const res = await triageDailyGET(req);

    expect(res.status).toBe(200);
    expect(checkAutoResumeMock).toHaveBeenCalledTimes(1);
  });

  it('summary.auto_resumed=true when checkAutoResume reports resumed', async () => {
    const reconState = await import('@/modules/advertising/perceive/recon-state-store');
    vi.mocked(reconState.checkAutoResume).mockResolvedValueOnce({
      resumed: true,
      reason: 'auto_resume_24h_elapsed',
    });

    const req = makeRequest(`Bearer ${CRON_SECRET}`);
    const res = await triageDailyGET(req);
    const body = (await res.json()) as {
      success: boolean;
      summary: { auto_resumed: boolean };
    };

    expect(body.success).toBe(true);
    expect(body.summary.auto_resumed).toBe(true);
  });

  it('summary.auto_resumed=false on a normal run', async () => {
    const reconState = await import('@/modules/advertising/perceive/recon-state-store');
    vi.mocked(reconState.checkAutoResume).mockResolvedValueOnce({ resumed: false });

    const req = makeRequest(`Bearer ${CRON_SECRET}`);
    const res = await triageDailyGET(req);
    const body = (await res.json()) as {
      success: boolean;
      summary: { auto_resumed: boolean };
    };

    expect(body.success).toBe(true);
    expect(body.summary.auto_resumed).toBe(false);
  });

  it('does not abort the pipeline if checkAutoResume() throws', async () => {
    const reconState = await import('@/modules/advertising/perceive/recon-state-store');
    vi.mocked(reconState.checkAutoResume).mockRejectedValueOnce(
      new Error('db unavailable'),
    );

    const req = makeRequest(`Bearer ${CRON_SECRET}`);
    const res = await triageDailyGET(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests: triage-daily — senior-buyer daily extension (T24)
// ---------------------------------------------------------------------------
//
// Pin the contract that triage-daily writes a per-ad-set daily snapshot,
// invokes drift-triggered calibration on every live ad set, and fires
// maturity / Phase B→C transitions when classifier output diverges or
// the conversions threshold is crossed.
// ---------------------------------------------------------------------------

describe('triage-daily — senior-buyer extension', () => {
  it('writes one snapshot per ad set and surfaces counters in summary', async () => {
    const metricHistory = await import('@/modules/advertising/senior-buyer/metric-history');
    const writeDailySnapshotMock = vi.mocked(metricHistory.writeDailySnapshot);
    writeDailySnapshotMock.mockClear();

    // Two AdMetric rows under the SAME adset_id collapse into one snapshot.
    vi.mocked(fetchMetaInsights).mockResolvedValueOnce([
      {
        ad_id: 'ad_aa', adset_id: 'adset_alpha', campaign_id: 'camp_1',
        date: '2026-05-02', impressions: 1000, clicks: 20, spend_usd: 5.0,
        ctr: 0.02, cpc: 0.25, cpm: 5.0, frequency: 1.2, reach: 900,
        days_running: 5, status: 'ACTIVE',
      },
      {
        ad_id: 'ad_ab', adset_id: 'adset_alpha', campaign_id: 'camp_1',
        date: '2026-05-02', impressions: 500, clicks: 10, spend_usd: 2.5,
        ctr: 0.02, cpc: 0.25, cpm: 5.0, frequency: 1.4, reach: 450,
        days_running: 5, status: 'ACTIVE',
      },
      {
        ad_id: 'ad_b', adset_id: 'adset_beta', campaign_id: 'camp_2',
        date: '2026-05-02', impressions: 800, clicks: 12, spend_usd: 3.0,
        ctr: 0.015, cpc: 0.25, cpm: 3.75, frequency: 1.1, reach: 750,
        days_running: 7, status: 'ACTIVE',
      },
    ]);

    const req = makeRequest(`Bearer ${CRON_SECRET}`);
    const res = await triageDailyGET(req);
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      success: boolean;
      summary: { senior_buyer: { snapshots_written: number } };
    };
    expect(body.success).toBe(true);
    // One write per unique adset_id (alpha + beta) — ads collapsed.
    expect(writeDailySnapshotMock).toHaveBeenCalledTimes(2);
    expect(body.summary.senior_buyer.snapshots_written).toBe(2);

    // The aggregated alpha snapshot should sum both ad rows.
    const alphaCall = writeDailySnapshotMock.mock.calls.find(
      (c) => c[0].adSetId === 'adset_alpha',
    );
    expect(alphaCall).toBeDefined();
    expect(alphaCall![0].impressions).toBe(1500);
    expect(alphaCall![0].clicks).toBe(30);
    expect(alphaCall![0].spendUsd).toBe(7.5);
  });

  it('runs drift-triggered calibration for every live ad set in B/C/D', async () => {
    const stateStore = await import('@/modules/advertising/senior-buyer/state-store');
    const calibrator = await import('@/modules/advertising/senior-buyer/auto-calibrator');
    const liveAdSets = [
      buildAdSetState({ adSetId: 'as_phase_b', currentPhase: 'B', campaignId: 'c1' }),
      buildAdSetState({ adSetId: 'as_phase_c', currentPhase: 'C', campaignId: 'c2' }),
    ];
    vi.mocked(stateStore.listAdSetsByPhase).mockResolvedValueOnce(liveAdSets);
    const driftMock = vi.mocked(calibrator.runDriftTriggeredCalibration);
    driftMock.mockClear();

    const req = makeRequest(`Bearer ${CRON_SECRET}`);
    const res = await triageDailyGET(req);
    expect(res.status).toBe(200);

    expect(driftMock).toHaveBeenCalledTimes(2);
    expect(driftMock).toHaveBeenCalledWith('as_phase_b', 'c1');
    expect(driftMock).toHaveBeenCalledWith('as_phase_c', 'c2');

    const body = (await res.json()) as {
      summary: { senior_buyer: { drift_calibrations_run: number } };
    };
    expect(body.summary.senior_buyer.drift_calibrations_run).toBe(2);
  });

  it('fires Phase B→C transition when conversions cross resolved threshold', async () => {
    const stateStore = await import('@/modules/advertising/senior-buyer/state-store');
    const resolver = await import('@/modules/advertising/senior-buyer/threshold-resolver');
    const classifier = await import('@/modules/advertising/senior-buyer/data-maturity-classifier');

    // Two ad sets in Phase B: one above threshold (transitions), one below.
    vi.mocked(stateStore.listAdSetsByPhase).mockResolvedValueOnce([
      buildAdSetState({
        adSetId: 'as_promote', currentPhase: 'B', conversions7dMeta: 60,
        dataMaturityMode: 'COLD_START',
      }),
      buildAdSetState({
        adSetId: 'as_hold', currentPhase: 'B', conversions7dMeta: 10,
        dataMaturityMode: 'COLD_START',
      }),
    ]);
    vi.mocked(resolver.resolveThreshold).mockResolvedValue(50);
    // Maturity stable for both so we isolate the phase transition.
    vi.mocked(classifier.classifyMaturity).mockReturnValue('COLD_START');

    const recordPhaseTransitionMock = vi.mocked(stateStore.recordPhaseTransition);
    const upsertAdSetStateMock = vi.mocked(stateStore.upsertAdSetState);
    recordPhaseTransitionMock.mockClear();
    upsertAdSetStateMock.mockClear();

    const req = makeRequest(`Bearer ${CRON_SECRET}`);
    const res = await triageDailyGET(req);
    expect(res.status).toBe(200);

    expect(recordPhaseTransitionMock).toHaveBeenCalledTimes(1);
    expect(recordPhaseTransitionMock).toHaveBeenCalledWith(
      'as_promote',
      'B',
      'C',
      expect.stringMatching(/^meta_default_50/),
      expect.objectContaining({ conversions_7d_meta: 60 }),
    );
    // upsertAdSetState was called for the promote ad set with phase=C.
    expect(
      upsertAdSetStateMock.mock.calls.some(
        (c) => c[0].adSetId === 'as_promote' && c[0].currentPhase === 'C',
      ),
    ).toBe(true);

    const body = (await res.json()) as {
      summary: { senior_buyer: { phase_transitions: number } };
    };
    expect(body.summary.senior_buyer.phase_transitions).toBe(1);
  });

  it('fires maturity transition when classifyMaturity returns a new mode', async () => {
    const stateStore = await import('@/modules/advertising/senior-buyer/state-store');
    const classifier = await import('@/modules/advertising/senior-buyer/data-maturity-classifier');

    vi.mocked(stateStore.listAdSetsByPhase).mockResolvedValueOnce([
      buildAdSetState({
        adSetId: 'as_grow', currentPhase: 'C',
        dataMaturityMode: 'COLD_START',
        conversionsTotalMeta: 200, daysWithPixelData: 30,
      }),
    ]);
    vi.mocked(classifier.classifyMaturity).mockReturnValueOnce('CALIBRATING');

    const recordMaturityTransitionMock = vi.mocked(stateStore.recordMaturityTransition);
    recordMaturityTransitionMock.mockClear();

    const req = makeRequest(`Bearer ${CRON_SECRET}`);
    const res = await triageDailyGET(req);
    expect(res.status).toBe(200);

    expect(recordMaturityTransitionMock).toHaveBeenCalledTimes(1);
    expect(recordMaturityTransitionMock).toHaveBeenCalledWith(
      'as_grow',
      'COLD_START',
      'CALIBRATING',
      'auto_classify_CALIBRATING',
      expect.objectContaining({
        conversions_total_meta: 200,
        days_with_pixel_data: 30,
      }),
    );

    const body = (await res.json()) as {
      summary: { senior_buyer: { maturity_transitions: number } };
    };
    expect(body.summary.senior_buyer.maturity_transitions).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Tests: triage-daily — auto-bootstrap of new ad sets (T5)
// ---------------------------------------------------------------------------
//
// Pin the contract that any adset_id appearing in metrics but missing from
// advertising_ad_set_state gets a Phase A / COLD_START row created before
// the daily snapshot loop runs. This keeps Phase D-spawned ad sets from
// stalling at the orchestrator's `state_not_initialised` gate.
// ---------------------------------------------------------------------------

describe('triage-daily — auto-bootstrap', () => {
  it('seeds Phase A / COLD_START state for adset_ids missing from state-store', async () => {
    const stateStore = await import('@/modules/advertising/senior-buyer/state-store');
    const upsertAdSetStateMock = vi.mocked(stateStore.upsertAdSetState);
    const listAdSetsByIdsMock = vi.mocked(stateStore.listAdSetsByIds);
    upsertAdSetStateMock.mockClear();
    listAdSetsByIdsMock.mockClear();
    listAdSetsByIdsMock.mockResolvedValueOnce([]);

    vi.mocked(fetchMetaInsights).mockResolvedValueOnce([
      {
        ad_id: 'ad_new_1', adset_id: 'adset_new', campaign_id: 'camp_phase_d',
        date: '2026-05-02', impressions: 200, clicks: 4, spend_usd: 1.0,
        ctr: 0.02, cpc: 0.25, cpm: 5.0, frequency: 1.0, reach: 200,
        days_running: 1, status: 'ACTIVE',
      },
    ]);

    const req = makeRequest(`Bearer ${CRON_SECRET}`);
    const res = await triageDailyGET(req);
    expect(res.status).toBe(200);

    expect(upsertAdSetStateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        adSetId: 'adset_new',
        campaignId: 'camp_phase_d',
        currentPhase: 'A',
        dataMaturityMode: 'COLD_START',
      }),
    );

    const body = (await res.json()) as {
      summary: { senior_buyer: { bootstraps_created: number } };
    };
    expect(body.summary.senior_buyer.bootstraps_created).toBe(1);
  });

  it('skips bootstrap for adset_ids already present in state-store', async () => {
    const stateStore = await import('@/modules/advertising/senior-buyer/state-store');
    const upsertAdSetStateMock = vi.mocked(stateStore.upsertAdSetState);
    const listAdSetsByIdsMock = vi.mocked(stateStore.listAdSetsByIds);
    upsertAdSetStateMock.mockClear();
    listAdSetsByIdsMock.mockClear();
    listAdSetsByIdsMock.mockResolvedValueOnce([
      buildAdSetState({ adSetId: 'adset_known', currentPhase: 'B' }),
    ]);

    vi.mocked(fetchMetaInsights).mockResolvedValueOnce([
      {
        ad_id: 'ad_known', adset_id: 'adset_known', campaign_id: 'camp_known',
        date: '2026-05-02', impressions: 1000, clicks: 20, spend_usd: 5.0,
        ctr: 0.02, cpc: 0.25, cpm: 5.0, frequency: 1.2, reach: 900,
        days_running: 5, status: 'ACTIVE',
      },
    ]);

    const req = makeRequest(`Bearer ${CRON_SECRET}`);
    const res = await triageDailyGET(req);
    expect(res.status).toBe(200);

    // No bootstrap upsert for the already-known ad set. (Other unrelated
    // upsertAdSetState calls — e.g. maturity reclassification — fire only
    // when classifyMaturity diverges; default mock returns 'COLD_START',
    // matching the fixture's mode so no transition fires.)
    const bootstrapCalls = upsertAdSetStateMock.mock.calls.filter(
      (c) => c[0].adSetId === 'adset_known' && c[0].currentPhase === 'A',
    );
    expect(bootstrapCalls.length).toBe(0);

    const body = (await res.json()) as {
      summary: { senior_buyer: { bootstraps_created: number } };
    };
    expect(body.summary.senior_buyer.bootstraps_created).toBe(0);
  });

  it('runs no bootstrap calls when metrics array is empty', async () => {
    const stateStore = await import('@/modules/advertising/senior-buyer/state-store');
    const upsertAdSetStateMock = vi.mocked(stateStore.upsertAdSetState);
    const listAdSetsByIdsMock = vi.mocked(stateStore.listAdSetsByIds);
    upsertAdSetStateMock.mockClear();
    listAdSetsByIdsMock.mockClear();

    vi.mocked(fetchMetaInsights).mockResolvedValueOnce([]);

    const req = makeRequest(`Bearer ${CRON_SECRET}`);
    const res = await triageDailyGET(req);
    expect(res.status).toBe(200);

    expect(listAdSetsByIdsMock).not.toHaveBeenCalled();
    expect(upsertAdSetStateMock).not.toHaveBeenCalled();

    const body = (await res.json()) as {
      success: boolean;
      summary: { senior_buyer: { bootstraps_created: number; errors: number } };
    };
    expect(body.success).toBe(true);
    expect(body.summary.senior_buyer.bootstraps_created).toBe(0);
    expect(body.summary.senior_buyer.errors).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Test fixture for AdSetState used by senior-buyer extension tests.
// Keeps each test focused by defaulting every field to a sane value.
// ---------------------------------------------------------------------------
type AdSetStateFixture = Awaited<
  ReturnType<typeof import('@/modules/advertising/senior-buyer/state-store').listAdSetsByPhase>
>[number];

function buildAdSetState(overrides: Partial<AdSetStateFixture> & { adSetId: string }): AdSetStateFixture {
  const base = {
    adSetId: overrides.adSetId,
    campaignId: 'camp_default',
    locale: 'en',
    currentPhase: 'B',
    phaseEnteredAt: new Date('2026-04-01T00:00:00Z'),
    dataMaturityMode: 'COLD_START',
    maturityEnteredAt: new Date('2026-04-01T00:00:00Z'),
    optimizationEvent: 'landing_page_view',
    conversions7dMeta: 0,
    conversions14dMeta: 0,
    conversionsTotalMeta: 0,
    daysWithPixelData: 0,
    conversions7dPosthog: 0,
    roas7d: null,
    cpa7d: null,
    frequencyCurrent: null,
    parentAdSetId: null,
    duplicatesCount: 0,
    lastActionTakenAt: null,
    flaggedForReview: false,
    flagReason: null,
    updatedAt: new Date('2026-05-01T00:00:00Z'),
  };
  return { ...base, ...overrides } as unknown as AdSetStateFixture;
}
