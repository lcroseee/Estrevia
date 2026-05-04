import { describe, it, expect } from 'vitest';

import { evaluatePhaseA } from '../phase-a';

describe('evaluatePhaseA — pre-launch', () => {
  it('returns hold with reason phase_a_pre_launch', () => {
    expect(evaluatePhaseA({ ad_id: 'ad_1', ad_set_id: 'as_1' })).toEqual({
      ad_id: 'ad_1',
      action: 'hold',
      reason: 'phase_a_pre_launch',
    });
  });

  it('preserves the ad_id verbatim across different inputs', () => {
    expect(evaluatePhaseA({ ad_id: 'ad_xyz_123', ad_set_id: 'as_99' }).ad_id).toBe('ad_xyz_123');
  });

  it('always emits action=hold (never anything else)', () => {
    expect(evaluatePhaseA({ ad_id: 'a', ad_set_id: 'b' }).action).toBe('hold');
    expect(evaluatePhaseA({ ad_id: 'a2', ad_set_id: 'b2' }).action).toBe('hold');
  });

  it('always emits the same reason string for routing', () => {
    expect(evaluatePhaseA({ ad_id: 'a', ad_set_id: 'b' }).reason).toBe('phase_a_pre_launch');
  });
});
