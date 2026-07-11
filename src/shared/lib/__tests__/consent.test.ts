import { describe, it, expect } from 'vitest';
import { hasAnalyticsConsent, shouldShowConsentBanner } from '../consent';

describe('hasAnalyticsConsent', () => {
  it('is true only when accepted', () => {
    expect(hasAnalyticsConsent('accepted')).toBe(true);
    expect(hasAnalyticsConsent('declined')).toBe(false);
    expect(hasAnalyticsConsent(null)).toBe(false);
  });
});

describe('shouldShowConsentBanner', () => {
  it('is true only when no decision has been made', () => {
    expect(shouldShowConsentBanner(null)).toBe(true);
    expect(shouldShowConsentBanner('accepted')).toBe(false);
    expect(shouldShowConsentBanner('declined')).toBe(false);
  });
});
