import { describe, it, expect } from 'vitest';

import { route, type AdDecision, type AdSetState } from '../approval-router';

const mkDecision = (
  action: AdDecision['action'],
  extras: Partial<AdDecision> = {},
): AdDecision => ({
  ad_id: 'ad_x',
  action,
  reason: '',
  ...extras,
});

const mkState = (mode: AdSetState['data_maturity_mode']): AdSetState => ({
  ad_set_id: 'as_x',
  data_maturity_mode: mode,
  current_phase: 'C',
});

describe('approval-router (Q12 + maturity gating)', () => {
  // ─── COLD_START suppresses all but Phase B exceptions ───
  describe('COLD_START mode', () => {
    it('rejects scale decisions', async () => {
      const result = await route(mkDecision('duplicate'), mkState('COLD_START'));
      expect(result.type).toBe('rejected');
      if (result.type === 'rejected') {
        expect(result.reason).toContain('cold_start');
      }
    });

    it('rejects refresh_creative in COLD_START', async () => {
      const result = await route(
        mkDecision('refresh_creative'),
        mkState('COLD_START'),
      );
      expect(result.type).toBe('rejected');
    });

    it('rejects propose_new_ad_set in COLD_START', async () => {
      const result = await route(
        mkDecision('propose_new_ad_set'),
        mkState('COLD_START'),
      );
      expect(result.type).toBe('rejected');
    });

    it('allows DISAPPROVED-status emergency pauses through (Phase B exception)', async () => {
      const result = await route(
        mkDecision('pause', { reason: 'extreme_failure_disapproved' }),
        mkState('COLD_START'),
      );
      expect(result.type).toBe('execute_immediately');
    });

    it('allows account-emergency pause-all', async () => {
      const result = await route(
        mkDecision('pause', { reason: 'account_emergency' }),
        mkState('COLD_START'),
      );
      expect(result.type).toBe('execute_immediately');
    });

    it('rejects plain pause without emergency reason in COLD_START', async () => {
      const result = await route(mkDecision('pause'), mkState('COLD_START'));
      expect(result.type).toBe('rejected');
    });
  });

  // ─── CALIBRATING routes everything non-REVERSIBLE through LOW_RISK approval ───
  describe('CALIBRATING mode', () => {
    it('REVERSIBLE actions execute immediately', async () => {
      const result = await route(mkDecision('pause'), mkState('CALIBRATING'));
      expect(result.type).toBe('execute_immediately');
    });

    it('non-REVERSIBLE (duplicate) routes via LOW_RISK 4h', async () => {
      const result = await route(mkDecision('duplicate'), mkState('CALIBRATING'));
      expect(result.type).toBe('low_risk_approval');
      if (result.type === 'low_risk_approval') {
        expect(result.timeout_hours).toBe(4);
      }
    });

    it('non-REVERSIBLE (refresh_creative) routes via LOW_RISK 4h', async () => {
      const result = await route(
        mkDecision('refresh_creative'),
        mkState('CALIBRATING'),
      );
      expect(result.type).toBe('low_risk_approval');
      if (result.type === 'low_risk_approval') {
        expect(result.timeout_hours).toBe(4);
      }
    });

    it('non-REVERSIBLE (propose_new_ad_set) routes via LOW_RISK 4h in CALIBRATING', async () => {
      const result = await route(
        mkDecision('propose_new_ad_set'),
        mkState('CALIBRATING'),
      );
      expect(result.type).toBe('low_risk_approval');
      if (result.type === 'low_risk_approval') {
        expect(result.timeout_hours).toBe(4);
      }
    });
  });

  // ─── AUTONOMOUS uses Q12 reversibility classification ───
  describe('AUTONOMOUS mode', () => {
    it('pause / unpause / hold / maintain / pause_for_rest → execute_immediately (REVERSIBLE)', async () => {
      const reversibleActions = [
        'pause',
        'unpause',
        'hold',
        'maintain',
        'pause_for_rest',
      ] as const;
      for (const action of reversibleActions) {
        const r = await route(mkDecision(action), mkState('AUTONOMOUS'));
        expect(r.type).toBe('execute_immediately');
      }
    });

    it('duplicate → low_risk_approval (LEARNING_RESET, 4h)', async () => {
      const result = await route(mkDecision('duplicate'), mkState('AUTONOMOUS'));
      expect(result.type).toBe('low_risk_approval');
      if (result.type === 'low_risk_approval') {
        expect(result.timeout_hours).toBe(4);
      }
    });

    it('refresh_creative → low_risk_approval (LEARNING_RESET)', async () => {
      const result = await route(
        mkDecision('refresh_creative'),
        mkState('AUTONOMOUS'),
      );
      expect(result.type).toBe('low_risk_approval');
    });

    it('hybrid_event_switch → low_risk_approval (LEARNING_RESET)', async () => {
      const result = await route(
        mkDecision('hybrid_event_switch'),
        mkState('AUTONOMOUS'),
      );
      expect(result.type).toBe('low_risk_approval');
    });

    it('propose_new_ad_set → high_risk_approval (NEW_SPEND, blocking)', async () => {
      const result = await route(
        mkDecision('propose_new_ad_set'),
        mkState('AUTONOMOUS'),
      );
      expect(result.type).toBe('high_risk_approval');
    });

    it('unknown action → rejected', async () => {
      const result = await route(
        { ...mkDecision('hold'), action: 'nonsense_action' as unknown as AdDecision['action'] },
        mkState('AUTONOMOUS'),
      );
      expect(result.type).toBe('rejected');
    });
  });
});
