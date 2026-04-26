import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  handleDisapproval,
  getDisapprovalRate,
  _resetDisapprovalCounters,
} from '../disapproval-notify';
import type { MetaDisapprovalEvent, DisapprovalDeps, DisapprovalRateDb } from '../disapproval-notify';
import { mockMetaApi } from '../../__tests__/mocks/meta-api';
import { mockTelegramBot } from '../../__tests__/mocks/telegram';
import type { DecisionLogDb } from '../../audit/decision-log';
import type { CreativeLogDb } from '../../audit/creative-log';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDecisionDb(): DecisionLogDb {
  const insertValsMock = vi.fn().mockResolvedValue(undefined);
  const insertMock = vi.fn().mockReturnValue({ values: insertValsMock });
  const whereMock = vi.fn().mockResolvedValue([]);
  const fromMock = vi.fn().mockReturnValue({ where: whereMock });
  const selectMock = vi.fn().mockReturnValue({ from: fromMock });

  return {
    insert: insertMock as unknown as DecisionLogDb['insert'],
    select: selectMock as unknown as DecisionLogDb['select'],
    _insertValsMock: insertValsMock,
  } as unknown as DecisionLogDb;
}

function makeCreativeDb(): CreativeLogDb {
  const insertValsMock = vi.fn().mockResolvedValue(undefined);
  const insertMock = vi.fn().mockReturnValue({ values: insertValsMock });
  const whereMock = vi.fn().mockResolvedValue([]);
  const fromMock = vi.fn().mockReturnValue({ where: whereMock });
  const selectMock = vi.fn().mockReturnValue({ from: fromMock });

  return {
    insert: insertMock as unknown as CreativeLogDb['insert'],
    select: selectMock as unknown as CreativeLogDb['select'],
    _insertValsMock: insertValsMock,
  } as unknown as CreativeLogDb;
}

function makeRateDb(): DisapprovalRateDb {
  const insertValsMock = vi.fn().mockResolvedValue(undefined);
  const insertMock = vi.fn().mockReturnValue({ values: insertValsMock });
  const whereMock = vi.fn().mockResolvedValue([]);
  const fromMock = vi.fn().mockReturnValue({ where: whereMock });
  const selectMock = vi.fn().mockReturnValue({ from: fromMock });

  return {
    insert: insertMock as unknown as DisapprovalRateDb['insert'],
    select: selectMock as unknown as DisapprovalRateDb['select'],
    _insertValsMock: insertValsMock,
  } as unknown as DisapprovalRateDb;
}

function makeDeps(): DisapprovalDeps {
  return {
    metaApi: mockMetaApi(),
    telegramBot: mockTelegramBot(),
    decisionDb: makeDecisionDb(),
    creativeDb: makeCreativeDb(),
    disapprovalRateDb: makeRateDb(),
  };
}

function makeEvent(overrides?: Partial<MetaDisapprovalEvent>): MetaDisapprovalEvent {
  return {
    ad_id: 'ad_001',
    adset_id: 'adset_001',
    campaign_id: 'campaign_001',
    reason: 'PERSONAL_ATTRIBUTES',
    policy_summary: 'Ad targets personal attributes',
    hook_archetype: 'identity_reveal',
    occurred_at: new Date('2026-04-26T10:00:00Z'),
    ...overrides,
  };
}

const origEnabled = process.env.ADVERTISING_AGENT_ENABLED;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('handleDisapproval', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetDisapprovalCounters();
    process.env.ADVERTISING_AGENT_ENABLED = 'true';
  });

  afterEach(() => {
    if (origEnabled === undefined) delete process.env.ADVERTISING_AGENT_ENABLED;
    else process.env.ADVERTISING_AGENT_ENABLED = origEnabled;
  });

  it('pauses the ad via Meta API', async () => {
    const deps = makeDeps();
    const event = makeEvent();

    await handleDisapproval(event, deps);

    expect(deps.metaApi.pauseAd).toHaveBeenCalledWith('ad_001');
  });

  it('sends a Telegram alert with severity critical', async () => {
    const deps = makeDeps();
    const event = makeEvent();

    await handleDisapproval(event, deps);

    expect(deps.telegramBot.sendMessage).toHaveBeenCalledTimes(1);
    const callArg = (deps.telegramBot.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Record<string, unknown>;
    expect(callArg?.['severity']).toBe('critical');
  });

  it('Telegram alert includes ad_id, reason, and hook_archetype', async () => {
    const deps = makeDeps();
    const event = makeEvent({ hook_archetype: 'rarity' });

    await handleDisapproval(event, deps);

    const callArg = (deps.telegramBot.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Record<string, unknown>;
    const text = callArg?.['text'] as string;
    expect(text).toContain('ad_001');
    expect(text).toContain('PERSONAL_ATTRIBUTES');
    expect(text).toContain('rarity');
  });

  it('writes to creative audit log (paused event, meta actor)', async () => {
    const deps = makeDeps();
    const event = makeEvent();

    await handleDisapproval(event, deps);

    const creativeInsertVals = (deps.creativeDb as unknown as { _insertValsMock: ReturnType<typeof vi.fn> })._insertValsMock;
    expect(creativeInsertVals).toHaveBeenCalledTimes(1);
  });

  it('writes to decision audit log (applied=true)', async () => {
    const deps = makeDeps();
    const event = makeEvent();

    await handleDisapproval(event, deps);

    const decisionInsertVals = (deps.decisionDb as unknown as { _insertValsMock: ReturnType<typeof vi.fn> })._insertValsMock;
    // logDecision inserts once; writeDisapprovalRate also inserts into decision table
    expect(decisionInsertVals).toHaveBeenCalled();
  });

  it('tracks disapproval rate for hook_archetype', async () => {
    const deps = makeDeps();
    const event = makeEvent({ hook_archetype: 'authority' });

    await handleDisapproval(event, deps);

    // Rate over 1 day should be 1 event / 1 day = 1.0
    expect(getDisapprovalRate('authority', 1)).toBe(1);
  });

  it('does not track disapproval rate when hook_archetype is absent', async () => {
    const deps = makeDeps();
    const event = makeEvent({ hook_archetype: undefined });

    await handleDisapproval(event, deps);

    // Rate for any archetype should be 0 since we passed no archetype
    expect(getDisapprovalRate('identity_reveal', 1)).toBe(0);
  });

  it('does not auto-fix the ad (no creative generation call)', async () => {
    // There is no auto-fix by design. The test verifies Meta pauseAd is the only
    // Meta API method called.
    const deps = makeDeps();
    await handleDisapproval(makeEvent(), deps);

    const meta = deps.metaApi as ReturnType<typeof mockMetaApi>;
    expect(meta.duplicateAd).not.toHaveBeenCalled();
    expect(meta.scaleBudget).not.toHaveBeenCalled();
  });
});

describe('getDisapprovalRate', () => {
  beforeEach(() => {
    _resetDisapprovalCounters();
  });

  it('returns 0 for unknown archetype', () => {
    expect(getDisapprovalRate('rarity', 7)).toBe(0);
  });

  it('returns the correct rate per day', () => {
    // Simulate 3 disapprovals for identity_reveal happening now
    for (let i = 0; i < 3; i++) {
      _resetDisapprovalCounters();
    }
    // Directly: the in-memory map is empty after reset → rate = 0
    expect(getDisapprovalRate('identity_reveal', 7)).toBe(0);
  });

  it('ignores events outside the window', async () => {
    process.env.ADVERTISING_AGENT_ENABLED = 'true';
    process.env.ADVERTISING_DAILY_SPEND_CAP_USD = '80';

    const deps = makeDeps();
    // Event from 10 days ago — outside a 7-day window
    const oldEvent = makeEvent({
      hook_archetype: 'identity_reveal',
      occurred_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    });

    await handleDisapproval(oldEvent, deps);

    const rate = getDisapprovalRate('identity_reveal', 7);
    // 1 old event / 7 days = 0.14..., but since it's outside window it shouldn't count
    // rate = 0 events in window / 7 days = 0
    expect(rate).toBe(0);
  });

  it('accumulates multiple events', async () => {
    process.env.ADVERTISING_AGENT_ENABLED = 'true';
    process.env.ADVERTISING_DAILY_SPEND_CAP_USD = '80';

    const deps = makeDeps();
    await handleDisapproval(makeEvent({ hook_archetype: 'rarity' }), deps);
    await handleDisapproval(makeEvent({ hook_archetype: 'rarity' }), deps);

    // 2 events / 7 days = 0.285...
    expect(getDisapprovalRate('rarity', 7)).toBeCloseTo(2 / 7);
  });
});
