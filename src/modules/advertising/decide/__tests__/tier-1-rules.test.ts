import { describe, it, expect } from 'vitest';
import { applyTier1Rules } from '../tier-1-rules';
import { mockAdMetric } from '../../__tests__/fixtures';

describe('applyTier1Rules', () => {
  // --- Learning phase ---

  it('holds during learning phase (days_running < 2)', () => {
    const m = mockAdMetric({ days_running: 1, frequency: 5.0, cpc: 6.00 });
    const decision = applyTier1Rules(m);
    expect(decision.action).toBe('hold');
    expect(decision.reason).toContain('learning_phase');
  });

  it('holds when days_running = 0', () => {
    const m = mockAdMetric({ days_running: 0 });
    const decision = applyTier1Rules(m);
    expect(decision.action).toBe('hold');
  });

  it('does NOT hold when days_running exactly equals threshold (2)', () => {
    // days_running=2 means threshold cleared, rules apply
    const m = mockAdMetric({ days_running: 2, frequency: 1.0, cpc: 1.0, spend_usd: 5.0 });
    const decision = applyTier1Rules(m);
    expect(decision.action).toBe('maintain');
  });

  // --- Frequency cap ---

  it('pauses ad when frequency > 4', () => {
    const m = mockAdMetric({ frequency: 4.3, days_running: 7 });
    const decision = applyTier1Rules(m);
    expect(decision.action).toBe('pause');
    expect(decision.reason).toContain('frequency');
  });

  it('pauses ad when frequency equals cap exactly (4.0)', () => {
    const m = mockAdMetric({ frequency: 4.0, days_running: 5 });
    const decision = applyTier1Rules(m);
    expect(decision.action).toBe('pause');
    expect(decision.reason).toContain('frequency');
  });

  it('does NOT pause when frequency is just below cap (3.99)', () => {
    const m = mockAdMetric({ frequency: 3.99, days_running: 5, cpc: 1.0, spend_usd: 5.0 });
    const decision = applyTier1Rules(m);
    expect(decision.action).toBe('maintain');
  });

  // --- CPC hard cap ---

  it('pauses ad when CPC > $5', () => {
    const m = mockAdMetric({ cpc: 5.20, days_running: 5 });
    const decision = applyTier1Rules(m);
    expect(decision.action).toBe('pause');
    expect(decision.reason).toContain('cpc');
  });

  it('pauses ad when CPC equals cap exactly ($5.00)', () => {
    const m = mockAdMetric({ cpc: 5.0, days_running: 5, frequency: 1.0 });
    const decision = applyTier1Rules(m);
    expect(decision.action).toBe('pause');
    expect(decision.reason).toContain('cpc');
  });

  // --- Spend daily overage ---

  it('pauses ad when daily spend ≥ $25', () => {
    const m = mockAdMetric({ spend_usd: 25.0, days_running: 5, frequency: 1.0, cpc: 1.0 });
    const decision = applyTier1Rules(m);
    expect(decision.action).toBe('pause');
    expect(decision.reason).toContain('spend');
  });

  it('pauses ad when daily spend exceeds $25', () => {
    const m = mockAdMetric({ spend_usd: 30.0, days_running: 5, frequency: 1.0, cpc: 1.0 });
    const decision = applyTier1Rules(m);
    expect(decision.action).toBe('pause');
    expect(decision.reason).toContain('spend');
  });

  // --- Maintain ---

  it('maintains ad with healthy metrics', () => {
    const m = mockAdMetric({ frequency: 1.4, cpc: 1.20, ctr: 0.022, days_running: 5 });
    const decision = applyTier1Rules(m);
    expect(decision.action).toBe('maintain');
    expect(decision.reasoning_tier).toBe('tier_1_rules');
  });

  // --- Common fields ---

  it('always sets reasoning_tier to tier_1_rules', () => {
    const m = mockAdMetric({ days_running: 5 });
    const decision = applyTier1Rules(m);
    expect(decision.reasoning_tier).toBe('tier_1_rules');
  });

  it('always sets confidence to 1.0 (deterministic)', () => {
    const m = mockAdMetric({ frequency: 5.0, days_running: 5 });
    const decision = applyTier1Rules(m);
    expect(decision.confidence).toBe(1.0);
  });

  it('propagates ad_id from metric', () => {
    const m = mockAdMetric({ ad_id: 'ad_abc123', days_running: 5 });
    const decision = applyTier1Rules(m);
    expect(decision.ad_id).toBe('ad_abc123');
  });

  it('includes metrics_snapshot in result', () => {
    const m = mockAdMetric({ days_running: 5 });
    const decision = applyTier1Rules(m);
    expect(decision.metrics_snapshot).toBe(m);
  });

  // --- Priority order: learning phase beats other triggers ---

  it('learning phase takes priority over frequency cap', () => {
    const m = mockAdMetric({ days_running: 1, frequency: 10.0, cpc: 10.0 });
    const decision = applyTier1Rules(m);
    expect(decision.action).toBe('hold');
    expect(decision.reason).toContain('learning_phase');
  });

  // --- Priority order: frequency beats CPC ---

  it('frequency cap takes priority over CPC cap', () => {
    const m = mockAdMetric({ days_running: 5, frequency: 5.0, cpc: 6.0, spend_usd: 30.0 });
    const decision = applyTier1Rules(m);
    expect(decision.action).toBe('pause');
    expect(decision.reason).toContain('frequency');
  });
});
