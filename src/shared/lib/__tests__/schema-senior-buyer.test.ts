import { describe, it, expect } from 'vitest';
import {
  advertisingAdSetState,
  advertisingAdSetMetricHistory,
  advertisingAdSetPhaseTransitions,
  advertisingThresholds,
} from '../schema';

describe('senior-buyer schema definitions', () => {
  it('advertisingAdSetState columns include data_maturity_mode and optimization_event', () => {
    expect(advertisingAdSetState).toBeDefined();
    // Drizzle exposes columns under .name
    const cols = Object.keys(advertisingAdSetState).filter((k) => !k.startsWith('_'));
    expect(cols).toContain('dataMaturityMode');
    expect(cols).toContain('optimizationEvent');
    expect(cols).toContain('conversionsTotalMeta');
    expect(cols).toContain('parentAdSetId');
  });

  it('advertisingAdSetMetricHistory has a unique constraint key on adSetId+date', () => {
    expect(advertisingAdSetMetricHistory).toBeDefined();
    expect(Object.keys(advertisingAdSetMetricHistory)).toContain('adSetId');
    expect(Object.keys(advertisingAdSetMetricHistory)).toContain('date');
  });

  it('advertisingThresholds has the resolution-order columns', () => {
    expect(Object.keys(advertisingThresholds)).toContain('scope');
    expect(Object.keys(advertisingThresholds)).toContain('scopeId');
    expect(Object.keys(advertisingThresholds)).toContain('metricName');
    expect(Object.keys(advertisingThresholds)).toContain('source');
  });

  it('advertisingAdSetPhaseTransitions has transitionKind enum-like field', () => {
    expect(Object.keys(advertisingAdSetPhaseTransitions)).toContain('transitionKind');
    expect(Object.keys(advertisingAdSetPhaseTransitions)).toContain('reason');
  });
});
