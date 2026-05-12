import { describe, it, expect } from 'vitest';
import { getEligibleHooks } from '../index';

describe('getEligibleHooks — peer_discovery env gate', () => {
  it('excludes peer_discovery when PEER_DISCOVERY_ENABLED=false', () => {
    const eligible = getEligibleHooks('en', { PEER_DISCOVERY_ENABLED: 'false' });
    expect(eligible.some(h => h.archetype === 'peer_discovery')).toBe(false);
  });

  it('excludes peer_discovery when PEER_DISCOVERY_ENABLED is undefined', () => {
    const eligible = getEligibleHooks('en', {});
    expect(eligible.some(h => h.archetype === 'peer_discovery')).toBe(false);
  });

  it('excludes peer_discovery for arbitrary non-true values (fail-safe)', () => {
    const eligible = getEligibleHooks('en', { PEER_DISCOVERY_ENABLED: '1' });
    expect(eligible.some(h => h.archetype === 'peer_discovery')).toBe(false);
  });

  it('includes peer_discovery when PEER_DISCOVERY_ENABLED=true', () => {
    const eligible = getEligibleHooks('en', { PEER_DISCOVERY_ENABLED: 'true' });
    expect(eligible.some(h => h.archetype === 'peer_discovery')).toBe(true);
  });

  it('includes reciprocity regardless of env (no gate)', () => {
    const eligible = getEligibleHooks('en', {});
    expect(eligible.some(h => h.archetype === 'reciprocity')).toBe(true);
  });

  it('includes accuracy_gap regardless of env (no gate)', () => {
    const eligible = getEligibleHooks('en', {});
    expect(eligible.some(h => h.archetype === 'accuracy_gap')).toBe(true);
  });

  it('returns the same locale as requested', () => {
    const esEligible = getEligibleHooks('es', {});
    for (const h of esEligible) {
      expect(h.locale).toBe('es');
    }
  });
});
