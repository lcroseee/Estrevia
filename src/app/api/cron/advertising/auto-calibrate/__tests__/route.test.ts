/**
 * Tests for the auto-calibrate weekly cron route handler.
 *
 * Verifies:
 *  - 401 returned without valid CRON_SECRET
 *  - skips with `{ skipped: 'agent disabled' }` when ADVERTISING_AGENT_ENABLED !== 'true'
 *  - 200 + success:true + summary returned with valid auth when kill switch is off
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock @sentry/nextjs before importing the route handler
// ---------------------------------------------------------------------------
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock the senior-buyer auto-calibrator so the route doesn't touch the DB
// ---------------------------------------------------------------------------
vi.mock('@/modules/advertising/senior-buyer/auto-calibrator', () => ({
  runWeeklyCalibration: vi.fn().mockResolvedValue({
    ad_sets_processed: 2,
    thresholds_updated: 3,
    approvals_requested: 0,
    errors: 0,
  }),
}));

// ---------------------------------------------------------------------------
// Mock the alerts module — the route calls createTelegramBot() to build the
// dependency that the auto-calibrator uses for HIGH_RISK approval prompts.
// ---------------------------------------------------------------------------
vi.mock('@/modules/advertising/alerts', () => ({
  createTelegramBot: vi.fn(() => ({
    requestApproval: vi.fn().mockResolvedValue({ approved: true }),
    sendAlert: vi.fn().mockResolvedValue({ message_id: 1, text: 'ok' }),
  })),
}));

import { GET } from '../route';

describe('auto-calibrate cron route', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.CRON_SECRET = 'sec';
    process.env.ADVERTISING_AGENT_ENABLED = 'true';
    process.env.ADVERTISING_AGENT_DRY_RUN = 'true';
    process.env.TELEGRAM_BOT_TOKEN = 't';
    process.env.TELEGRAM_FOUNDER_CHAT_ID = 'c';
  });

  afterEach(() => {
    // Restore env to baseline so tests don't leak
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  it('rejects unauthorized requests', async () => {
    const res = await GET(
      new Request('http://localhost', {
        headers: { authorization: 'Bearer wrong' },
      }),
    );
    expect(res.status).toBe(401);
  });

  it('skips when agent disabled', async () => {
    process.env.ADVERTISING_AGENT_ENABLED = 'false';
    const res = await GET(
      new Request('http://localhost', {
        headers: { authorization: 'Bearer sec' },
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ skipped: 'agent disabled' });
  });

  it('runs weekly calibration and returns summary', async () => {
    const res = await GET(
      new Request('http://localhost', {
        headers: { authorization: 'Bearer sec' },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      summary: { ad_sets_processed: number; thresholds_updated: number };
    };
    expect(body.success).toBe(true);
    expect(body.summary.ad_sets_processed).toBe(2);
    expect(body.summary.thresholds_updated).toBe(3);
  });
});
