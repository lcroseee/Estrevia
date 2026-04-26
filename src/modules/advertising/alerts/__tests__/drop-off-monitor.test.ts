import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  runDailyDropOffCheck,
  InMemoryDropOffStore,
  BASELINE_WINDOW_DAYS,
  DROP_OFF_THRESHOLD,
} from '../drop-off-monitor';
import type { DropOffPosthogClient, DropOffClaudeClient } from '../drop-off-monitor';
import type { TelegramBot } from '../telegram-bot';
import { mockFunnelSnapshot } from '../../__tests__/fixtures';
import type { FunnelSnapshot } from '@/shared/types/advertising';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockPosthog(snapshot?: FunnelSnapshot): DropOffPosthogClient {
  return {
    getFunnel: vi.fn().mockResolvedValue(snapshot ?? mockFunnelSnapshot()),
  };
}

function makeMockTelegram(): TelegramBot {
  return {
    sendAlert: vi.fn().mockResolvedValue({ message_id: 1, text: 'alert' }),
    sendMessage: vi.fn().mockResolvedValue({ message_id: 2, text: 'msg' }),
    sendDailyDigest: vi.fn().mockResolvedValue({ message_id: 3, text: 'digest' }),
    requestApproval: vi.fn().mockResolvedValue({ approved: true }),
  } as unknown as TelegramBot;
}

function makeMockClaude(answer = 'Mercury retrograde'): DropOffClaudeClient {
  return {
    anomalyExplain: vi.fn().mockResolvedValue(answer),
  };
}

/**
 * Seeds a store with `count` snapshots using the given snapshot template.
 * Dates are counted backwards from a base date.
 */
function seedStore(
  store: InMemoryDropOffStore,
  count: number,
  snapshot?: FunnelSnapshot,
): void {
  const base = new Date('2026-04-25T00:00:00Z');
  const entries = Array.from({ length: count }, (_, i) => {
    const d = new Date(base);
    d.setDate(d.getDate() - (count - i - 1));
    return {
      date: d.toISOString().slice(0, 10),
      snapshot: snapshot ?? mockFunnelSnapshot(),
    };
  });
  store.seedSnapshots(entries);
}

// ---------------------------------------------------------------------------
// Tests: baseline collection phase
// ---------------------------------------------------------------------------

describe('runDailyDropOffCheck — baseline collection phase', () => {
  it('returns collecting_baseline status when fewer than 14 snapshots exist', async () => {
    const store = new InMemoryDropOffStore();
    seedStore(store, 5);

    const result = await runDailyDropOffCheck({
      posthog: makeMockPosthog(),
      telegram: makeMockTelegram(),
      store,
      today: '2026-04-26',
    });

    expect(result.status).toBe('collecting_baseline');
    expect(result.alerts).toHaveLength(0);
  });

  it('does not send Telegram alert during collection phase', async () => {
    const store = new InMemoryDropOffStore();
    seedStore(store, 3);

    const telegram = makeMockTelegram();

    await runDailyDropOffCheck({
      posthog: makeMockPosthog(),
      telegram,
      store,
      today: '2026-04-26',
    });

    expect(telegram.sendAlert).not.toHaveBeenCalled();
  });

  it('returns collecting_baseline for 0 stored snapshots (cold start)', async () => {
    const store = new InMemoryDropOffStore();

    const result = await runDailyDropOffCheck({
      posthog: makeMockPosthog(),
      telegram: makeMockTelegram(),
      store,
      today: '2026-04-26',
    });

    expect(result.status).toBe('collecting_baseline');
    expect(result.baseline_sample_count).toBe(0);
  });

  it('transitions to ok after exactly 14 baseline snapshots', async () => {
    const store = new InMemoryDropOffStore();
    // Seed BASELINE_WINDOW_DAYS (14) historical days before "today".
    // After appendSnapshot('2026-04-26'), store has 15 entries (capped to 15).
    // baselineSnapshots excludes today → 14 entries → condition met.
    seedStore(store, BASELINE_WINDOW_DAYS);

    // Today's snapshot has same rates as baseline → no drop
    const result = await runDailyDropOffCheck({
      posthog: makeMockPosthog(),
      telegram: makeMockTelegram(),
      store,
      today: '2026-04-26',
    });

    expect(result.status).toBe('ok');
    expect(result.baseline_sample_count).toBe(BASELINE_WINDOW_DAYS);
  });
});

// ---------------------------------------------------------------------------
// Tests: drop-off detection
// ---------------------------------------------------------------------------

describe('runDailyDropOffCheck — drop-off detection', () => {
  it('returns ok when all funnel steps are within threshold', async () => {
    const store = new InMemoryDropOffStore();
    seedStore(store, BASELINE_WINDOW_DAYS);

    // Today matches baseline exactly
    const result = await runDailyDropOffCheck({
      posthog: makeMockPosthog(),
      telegram: makeMockTelegram(),
      store,
      today: '2026-04-26',
    });

    expect(result.status).toBe('ok');
    expect(result.alerts).toHaveLength(0);
  });

  it('sends alert when a funnel step drops more than 30%', async () => {
    const store = new InMemoryDropOffStore();
    // Baseline: chart_calculated converts at 0.45 (from mockFunnelSnapshot)
    seedStore(store, BASELINE_WINDOW_DAYS);

    // Today: chart_calculated drops to 0.10 (>30% drop)
    const todaySnapshot = mockFunnelSnapshot({
      steps: [
        { event_name: 'landing_view', count: 87, unique_users: 87, conversion_from_previous: 1.0 },
        { event_name: 'chart_calculated', count: 8, unique_users: 8, conversion_from_previous: 0.09 },
        { event_name: 'passport_shared', count: 5, unique_users: 5, conversion_from_previous: 0.63 },
        { event_name: 'user_registered', count: 7, unique_users: 7, conversion_from_previous: 0.18 },
        { event_name: 'paywall_view', count: 6, unique_users: 6, conversion_from_previous: 0.86 },
        { event_name: 'subscription_started', count: 1, unique_users: 1, conversion_from_previous: 0.17 },
      ],
    });

    const telegram = makeMockTelegram();

    const result = await runDailyDropOffCheck({
      posthog: makeMockPosthog(todaySnapshot),
      telegram,
      store,
      today: '2026-04-26',
    });

    expect(result.status).toBe('alert_sent');
    expect(result.alerts.length).toBeGreaterThan(0);
    expect(result.alerts.some((a) => a.step === 'chart_calculated')).toBe(true);
    expect(telegram.sendAlert).toHaveBeenCalledOnce();
  });

  it('includes Claude LLM context in the alert when claude client is provided', async () => {
    const store = new InMemoryDropOffStore();
    seedStore(store, BASELINE_WINDOW_DAYS);

    const todaySnapshot = mockFunnelSnapshot({
      steps: [
        { event_name: 'landing_view', count: 87, unique_users: 87, conversion_from_previous: 1.0 },
        { event_name: 'chart_calculated', count: 5, unique_users: 5, conversion_from_previous: 0.06 },
        { event_name: 'passport_shared', count: 5, unique_users: 5, conversion_from_previous: 0.13 },
        { event_name: 'user_registered', count: 7, unique_users: 7, conversion_from_previous: 0.18 },
        { event_name: 'paywall_view', count: 6, unique_users: 6, conversion_from_previous: 0.86 },
        { event_name: 'subscription_started', count: 1, unique_users: 1, conversion_from_previous: 0.17 },
      ],
    });

    const claude = makeMockClaude('Mercury retrograde started today');

    const result = await runDailyDropOffCheck({
      posthog: makeMockPosthog(todaySnapshot),
      telegram: makeMockTelegram(),
      store,
      claude,
      today: '2026-04-26',
    });

    expect(result.llm_context).toBe('Mercury retrograde started today');
    expect(claude.anomalyExplain).toHaveBeenCalledOnce();
  });

  it('does not call Claude when status is ok (no alerts)', async () => {
    const store = new InMemoryDropOffStore();
    seedStore(store, BASELINE_WINDOW_DAYS);

    const claude = makeMockClaude();

    await runDailyDropOffCheck({
      posthog: makeMockPosthog(),
      telegram: makeMockTelegram(),
      store,
      claude,
      today: '2026-04-26',
    });

    expect(claude.anomalyExplain).not.toHaveBeenCalled();
  });

  it('alert message includes the affected step name and rates', async () => {
    const store = new InMemoryDropOffStore();
    seedStore(store, BASELINE_WINDOW_DAYS);

    const todaySnapshot = mockFunnelSnapshot({
      steps: [
        { event_name: 'landing_view', count: 100, unique_users: 100, conversion_from_previous: 1.0 },
        { event_name: 'chart_calculated', count: 5, unique_users: 5, conversion_from_previous: 0.05 },
        { event_name: 'passport_shared', count: 5, unique_users: 5, conversion_from_previous: 0.13 },
        { event_name: 'user_registered', count: 7, unique_users: 7, conversion_from_previous: 0.18 },
        { event_name: 'paywall_view', count: 6, unique_users: 6, conversion_from_previous: 0.86 },
        { event_name: 'subscription_started', count: 1, unique_users: 1, conversion_from_previous: 0.17 },
      ],
    });

    const telegram = makeMockTelegram();

    await runDailyDropOffCheck({
      posthog: makeMockPosthog(todaySnapshot),
      telegram,
      store,
      today: '2026-04-26',
    });

    const alertCall = (telegram.sendAlert as ReturnType<typeof vi.fn>).mock.calls[0];
    const message = alertCall[1] as string;
    expect(message).toContain('chart_calculated');
  });

  it('does not alert for steps with near-zero baseline (avoids false positives)', async () => {
    const store = new InMemoryDropOffStore();

    // Baseline with subscription_started near zero
    const zeroBaselineSnapshot = mockFunnelSnapshot({
      steps: [
        { event_name: 'landing_view', count: 100, unique_users: 100, conversion_from_previous: 1.0 },
        { event_name: 'chart_calculated', count: 50, unique_users: 50, conversion_from_previous: 0.5 },
        { event_name: 'passport_shared', count: 10, unique_users: 10, conversion_from_previous: 0.2 },
        { event_name: 'user_registered', count: 5, unique_users: 5, conversion_from_previous: 0.5 },
        { event_name: 'paywall_view', count: 4, unique_users: 4, conversion_from_previous: 0.8 },
        { event_name: 'subscription_started', count: 0, unique_users: 0, conversion_from_previous: 0.005 },
      ],
    });
    seedStore(store, BASELINE_WINDOW_DAYS, zeroBaselineSnapshot);

    // Today subscription_started = 0 (same as baseline — no drop)
    const result = await runDailyDropOffCheck({
      posthog: makeMockPosthog(zeroBaselineSnapshot),
      telegram: makeMockTelegram(),
      store,
      today: '2026-04-26',
    });

    // Should not alert on near-zero baseline steps
    const subscriptionAlert = result.alerts.find((a) => a.step === 'subscription_started');
    expect(subscriptionAlert).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Tests: InMemoryDropOffStore
// ---------------------------------------------------------------------------

describe('InMemoryDropOffStore', () => {
  it('appends and lists snapshots in order', async () => {
    const store = new InMemoryDropOffStore();

    await store.appendSnapshot('2026-04-24', mockFunnelSnapshot());
    await store.appendSnapshot('2026-04-25', mockFunnelSnapshot());

    const list = await store.listSnapshots();
    expect(list).toHaveLength(2);
    expect(list[0].date).toBe('2026-04-24');
    expect(list[1].date).toBe('2026-04-25');
  });

  it('replaces snapshot for same date on re-run', async () => {
    const store = new InMemoryDropOffStore();

    await store.appendSnapshot('2026-04-25', mockFunnelSnapshot({ steps: [] }));
    await store.appendSnapshot('2026-04-25', mockFunnelSnapshot());

    const list = await store.listSnapshots();
    expect(list).toHaveLength(1);
    expect(list[0].snapshot.steps).toHaveLength(6);
  });

  it('caps store at BASELINE_WINDOW_DAYS + 1 entries (today + 14 historical)', async () => {
    const store = new InMemoryDropOffStore();

    // Append BASELINE_WINDOW_DAYS + 5 snapshots to trigger the cap
    for (let i = 0; i < BASELINE_WINDOW_DAYS + 5; i++) {
      const date = `2026-04-${String(i + 1).padStart(2, '0')}`;
      await store.appendSnapshot(date, mockFunnelSnapshot());
    }

    const list = await store.listSnapshots();
    expect(list.length).toBeLessThanOrEqual(BASELINE_WINDOW_DAYS + 1);
  });
});
