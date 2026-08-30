import { describe, it, expect } from 'vitest';
import { AnalyticsEvent } from '../analytics';

describe('paywall dismiss analytics names', () => {
  it('registers PostHog-only dismiss events', () => {
    expect(AnalyticsEvent.PAYWALL_DISMISSED).toBe('paywall_dismissed');
    expect(AnalyticsEvent.PAYWALL_EXIT_SHOWN).toBe('paywall_exit_shown');
    expect(AnalyticsEvent.PAYWALL_EXIT_ANNUAL_CLICKED).toBe('paywall_exit_annual_clicked');
  });
});
